// Requests to run an aggregate search: finding it, checking its sources and
// dropping a repeat of a request that is still running.
import type { AggregateSearchAvailability } from '../../domain/search/aggregate-search-store';
import type { AggregateSearchReply, OpenDisposition } from '../../domain/messages';
import type { MessageSender } from '../message-router';
import type { TabPlacement } from '../search-result-tabs';
import { openAggregateSearch } from './open';
import { DEFAULT_DEDUPE_WINDOW_MS, hasOwn, isRecord } from './tabs';
import type { AggregateSearchQueryRunner, AggregateSearchQueryRunnerConfig, AggregateSearchStoreLike, OpenAggregateSearch, RequestEntry } from './types';

function getAggregateRequestSenderKey(sender: MessageSender | null | undefined): string {
  const tab = sender && sender.tab ? sender.tab : null;
  if (tab && typeof tab.id === 'number') {
    return `tab:${tab.id}`;
  }
  if (tab && typeof tab.windowId === 'number') {
    return `window:${tab.windowId}`;
  }
  return 'extension';
}

// The grouping setting, or before it was one setting, the grouping choice
// the stored definitions made: grouping when any of them did.
function resolveAggregateSearchAutoGroupEnabled(
  value: unknown,
  definitions: readonly unknown[] | null | undefined,
  fallbackDefinition?: unknown
): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  const items: readonly unknown[] = Array.isArray(definitions) ? definitions : [];
  const legacyItems = items.filter((item): item is Record<string, unknown> => (
    isRecord(item) && hasOwn(item, 'autoCreateTabGroup')
  ));
  if (legacyItems.length > 0) {
    return legacyItems.some((item) => item.autoCreateTabGroup === true);
  }
  if (isRecord(fallbackDefinition) && hasOwn(fallbackDefinition, 'autoCreateTabGroup')) {
    return fallbackDefinition.autoCreateTabGroup === true;
  }
  return true;
}

function loadAutoGroupSetting(config: AggregateSearchQueryRunnerConfig): Promise<boolean | undefined> {
  const load = config.loadAggregateSearchAutoGroupEnabled;
  if (typeof load !== 'function') {
    return Promise.resolve(undefined);
  }
  return Promise.resolve()
    .then(() => load())
    .then((value) => typeof value === 'boolean' ? value : undefined, () => undefined);
}

function readSourceCount(availability: AggregateSearchAvailability | null | undefined, key: 'requiredSourceCount' | 'availableSourceCount' | 'unavailableSourceCount'): number {
  return Math.max(0, Number(availability && availability[key]) || 0);
}

interface AggregateSearchRun {
  store: AggregateSearchStoreLike;
  openSearch: OpenAggregateSearch;
  aggregateId: string;
  query: string;
  sender: MessageSender | null | undefined;
  disposition: OpenDisposition | undefined;
}

// Finds the aggregate search, checks its sources and opens it next to the
// tab that asked.
async function runAggregateSearch(config: AggregateSearchQueryRunnerConfig, run: AggregateSearchRun): Promise<AggregateSearchReply> {
  const loadAggregateSearches = config.loadAggregateSearches;
  const loadSiteSearchProviders = config.loadSiteSearchProviders;
  if (typeof loadAggregateSearches !== 'function' || typeof loadSiteSearchProviders !== 'function') {
    return { ok: false, reason: 'aggregate-search-runtime-unavailable' };
  }
  const [definitions, providers, autoGroupSetting] = await Promise.all([
    loadAggregateSearches(),
    Promise.resolve().then(() => loadSiteSearchProviders()),
    loadAutoGroupSetting(config)
  ]);
  const definition = (Array.isArray(definitions) ? definitions : []).find((item) => (
    String(item && item.id || '').trim().toLowerCase() === run.aggregateId
  ));
  if (!definition) {
    return { ok: false, reason: 'aggregate-search-not-found' };
  }
  const availability = run.store.getAggregateSearchAvailability(definition, providers);
  const unavailableSourceCount = readSourceCount(availability, 'unavailableSourceCount');
  if (!availability || availability.available !== true) {
    return {
      ok: false,
      reason: 'aggregate-search-sources-unavailable',
      requiredSourceCount: readSourceCount(availability, 'requiredSourceCount'),
      availableSourceCount: readSourceCount(availability, 'availableSourceCount'),
      unavailableSourceCount
    };
  }
  const sourceTab = run.sender && run.sender.tab ? run.sender.tab : null;
  const placement: Partial<TabPlacement> = typeof config.resolveTabPlacement === 'function'
    ? await config.resolveTabPlacement(sourceTab)
    : {};
  return run.openSearch(config.chromeApi, {
    definition: availability.definition,
    query: run.query,
    providers: availability.providers,
    unavailableSourceCount,
    autoCreateTabGroup: resolveAggregateSearchAutoGroupEnabled(autoGroupSetting, definitions, availability.definition),
    windowId: typeof placement.windowId === 'number'
      ? placement.windowId
      : (sourceTab && typeof sourceTab.windowId === 'number' ? sourceTab.windowId : undefined),
    insertIndex: placement.index,
    disposition: run.disposition,
    getEntryUrl: config.getEntryUrl,
    isInteractiveProvider: config.isInteractiveProvider,
    waitForTabComplete: config.waitForTabComplete,
    submitPromptInTab: config.submitPromptInTab
  });
}

function createAggregateSearchQueryRunner(
  rawConfig: AggregateSearchQueryRunnerConfig | null | undefined
): AggregateSearchQueryRunner {
  const config: AggregateSearchQueryRunnerConfig = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const store = config.aggregateSearchStore || null;
  const loadAggregateSearches = config.loadAggregateSearches;
  const loadSiteSearchProviders = config.loadSiteSearchProviders;
  const openSearch: OpenAggregateSearch = typeof config.openAggregateSearch === 'function'
    ? config.openAggregateSearch
    : openAggregateSearch;
  const now = typeof config.now === 'function' ? config.now : Date.now;
  const dedupeWindowMs = Math.max(
    0,
    Number(config.dedupeWindowMs) || DEFAULT_DEDUPE_WINDOW_MS
  );
  const requests = new Map<string, RequestEntry>();

  function pruneRequests(timestamp: number): void {
    requests.forEach((entry, key) => {
      if (!entry.pending && entry.expiresAt <= timestamp) {
        requests.delete(key);
      }
    });
  }

  function execute(
    aggregateId: unknown,
    query: unknown,
    sender: MessageSender | null | undefined,
    disposition?: OpenDisposition
  ): Promise<AggregateSearchReply> {
    const normalizedId = String(aggregateId || '').trim().toLowerCase();
    const normalizedQuery = String(query || '').trim();
    if (!normalizedId || !normalizedQuery) {
      return Promise.resolve({ ok: false, reason: 'invalid-aggregate-search-request' });
    }
    if (typeof loadAggregateSearches !== 'function' ||
        !store || typeof store.getAggregateSearchAvailability !== 'function' ||
        typeof loadSiteSearchProviders !== 'function' ||
        typeof openSearch !== 'function') {
      return Promise.resolve({ ok: false, reason: 'aggregate-search-runtime-unavailable' });
    }

    const timestamp = now();
    pruneRequests(timestamp);
    const requestKey = [
      getAggregateRequestSenderKey(sender),
      normalizedId,
      normalizedQuery,
      String(disposition || 'currentTab')
    ].join('\n');
    const existing = requests.get(requestKey);
    if (existing && (existing.pending || existing.expiresAt > timestamp)) {
      return existing.promise;
    }

    const task = runAggregateSearch(config, {
      store,
      openSearch,
      aggregateId: normalizedId,
      query: normalizedQuery,
      sender,
      disposition
    });

    const entry: RequestEntry = {
      pending: true,
      expiresAt: Number.POSITIVE_INFINITY,
      promise: task.then((result) => {
        entry.pending = false;
        entry.expiresAt = now() + dedupeWindowMs;
        return result;
      }, (error: unknown) => {
        if (requests.get(requestKey) === entry) {
          requests.delete(requestKey);
        }
        throw error;
      })
    };
    requests.set(requestKey, entry);
    return entry.promise;
  }

  return execute;
}

export {
  createAggregateSearchQueryRunner,
  getAggregateRequestSenderKey,
  loadAutoGroupSetting,
  readSourceCount,
  resolveAggregateSearchAutoGroupEnabled,
  runAggregateSearch
};
export type {
  AggregateSearchRun
};
