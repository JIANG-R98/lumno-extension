// Running an aggregate search: one tab per source (in a tab group when the
// setting asks), prompts typed into the AI sources' pages, and the first
// finished search brought to the front.
import type { AggregateSearch, AggregateSearchAvailability } from '../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../domain/search/types';
import type { AggregateSearchReply, OpenDisposition } from '../domain/messages';
import type { MessageSender } from './message-router';
import type { SubmitResult } from './ai-provider-submit';
import type { TabPlacement } from './search-result-tabs';

type GetEntryUrl = (provider: SiteSearchProvider, query: string) => string;
type IsInteractiveProvider = (provider: SiteSearchProvider) => boolean;
type WaitForTabComplete = (tabId: number, timeoutMs?: number) => Promise<unknown>;
type SubmitPromptInTab = (
  chromeApi: typeof chrome,
  tabId: number,
  prompt: string,
  strategyName: string,
  expectedUrl: string
) => Promise<SubmitResult>;
type ScheduleActivation = (task: () => void, delayMs: number) => unknown;

interface AggregateSearchOpenOptions {
  definition?: AggregateSearch | null;
  query?: string;
  providers?: readonly SiteSearchProvider[];
  // Sources the definition names that are missing or disabled.
  unavailableSourceCount?: number;
  autoCreateTabGroup?: boolean;
  windowId?: number;
  // Where the first tab opens; at the end of the window without one.
  insertIndex?: number;
  disposition?: OpenDisposition;
  getEntryUrl?: GetEntryUrl;
  isInteractiveProvider?: IsInteractiveProvider;
  waitForTabComplete?: WaitForTabComplete;
  submitPromptInTab?: SubmitPromptInTab;
  scheduleActivation?: ScheduleActivation;
}

// openAggregateSearch's outcome, with every count set.
interface AggregateSearchResult extends AggregateSearchReply {
  requestedCount: number;
  openedCount: number;
  failedCount: number;
  unavailableSourceCount: number;
  grouped: boolean;
  groupId: number | null;
  groupTitleApplied: boolean;
  activatedTabId: number | null;
  activationDeferred: boolean;
  activationDelayMs: number;
  interactiveRequestedCount: number;
  interactiveSucceededCount: number;
  interactiveFailedCount: number;
  reason: string;
  warnings: string[];
}

type OpenAggregateSearch = (
  chromeApi: typeof chrome | null | undefined,
  options: AggregateSearchOpenOptions
) => Promise<AggregateSearchReply>;

interface AggregateSearchStoreLike {
  getAggregateSearchAvailability(
    definition: unknown,
    providers: readonly SiteSearchProvider[] | null | undefined
  ): AggregateSearchAvailability;
}

interface AggregateSearchQueryRunnerConfig {
  aggregateSearchStore?: AggregateSearchStoreLike | null;
  chromeApi?: typeof chrome | null;
  loadAggregateSearches?: () => Promise<AggregateSearch[]>;
  loadSiteSearchProviders?: () => Promise<SiteSearchProvider[]> | SiteSearchProvider[];
  // The grouping setting; anything but a boolean leaves it to the definitions.
  loadAggregateSearchAutoGroupEnabled?: () => Promise<unknown> | unknown;
  resolveTabPlacement?: (sourceTab: chrome.tabs.Tab | null) => Promise<Partial<TabPlacement>>;
  openAggregateSearch?: OpenAggregateSearch;
  getEntryUrl?: GetEntryUrl;
  isInteractiveProvider?: IsInteractiveProvider;
  waitForTabComplete?: WaitForTabComplete;
  submitPromptInTab?: SubmitPromptInTab;
  now?: () => number;
  dedupeWindowMs?: number;
}

type AggregateSearchQueryRunner = (
  aggregateId: unknown,
  query: unknown,
  sender: MessageSender | null | undefined,
  disposition?: OpenDisposition
) => Promise<AggregateSearchReply>;

interface ProviderPlan {
  provider: SiteSearchProvider;
  // '' when the provider has no safe address for the query.
  url: string;
  interactive: boolean;
}

interface CreatedTab {
  tab: chrome.tabs.Tab | null;
  error: string;
}

interface PlanTab extends CreatedTab {
  plan: ProviderPlan;
}

interface OpenedPlanTab extends PlanTab {
  tab: chrome.tabs.Tab & { id: number };
}

// A recent or running search, shared by identical requests.
interface RequestEntry {
  pending: boolean;
  expiresAt: number;
  promise: Promise<AggregateSearchReply>;
}

const DEFAULT_DEDUPE_WINDOW_MS = 1000;
const ACTIVATION_FEEDBACK_DELAY_MS = 2300;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getLastErrorMessage(chromeApi: typeof chrome, fallback: string): string {
  const runtime = chromeApi && chromeApi.runtime;
  return runtime && runtime.lastError
    ? String(runtime.lastError.message || fallback)
    : '';
}

function createBackgroundTab(chromeApi: typeof chrome, createProperties: chrome.tabs.CreateProperties): Promise<CreatedTab> {
  return new Promise((resolve) => {
    try {
      chromeApi.tabs.create(createProperties, (tab) => {
        const error = getLastErrorMessage(chromeApi, 'tab-create-failed');
        if (error || !tab || typeof tab.id !== 'number') {
          resolve({ tab: null, error: error || 'tab-create-failed' });
          return;
        }
        resolve({ tab, error: '' });
      });
    } catch (error) {
      resolve({
        tab: null,
        error: getErrorMessage(error, 'tab-create-failed')
      });
    }
  });
}

function groupTabs(
  chromeApi: typeof chrome,
  tabIds: [number, ...number[]]
): Promise<{ groupId: number | null; error: string }> {
  return new Promise((resolve) => {
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.group !== 'function') {
      resolve({ groupId: null, error: 'tab-group-api-unavailable' });
      return;
    }
    try {
      chromeApi.tabs.group({ tabIds }, (groupId) => {
        const error = getLastErrorMessage(chromeApi, 'tab-group-failed');
        if (error || typeof groupId !== 'number') {
          resolve({ groupId: null, error: error || 'tab-group-failed' });
          return;
        }
        resolve({ groupId, error: '' });
      });
    } catch (error) {
      resolve({
        groupId: null,
        error: getErrorMessage(error, 'tab-group-failed')
      });
    }
  });
}

function titleTabGroup(chromeApi: typeof chrome, groupId: number, title: string): Promise<{ ok: boolean; error: string }> {
  return new Promise((resolve) => {
    if (!chromeApi || !chromeApi.tabGroups ||
        typeof chromeApi.tabGroups.update !== 'function') {
      resolve({ ok: false, error: 'tab-group-api-unavailable' });
      return;
    }
    try {
      chromeApi.tabGroups.update(groupId, { title }, () => {
        const error = getLastErrorMessage(chromeApi, 'tab-group-title-failed');
        resolve({ ok: !error, error });
      });
    } catch (error) {
      resolve({
        ok: false,
        error: getErrorMessage(error, 'tab-group-title-failed')
      });
    }
  });
}

function activateTab(
  chromeApi: typeof chrome,
  tabId: number
): Promise<{ ok: boolean; tab: chrome.tabs.Tab | null; error: string }> {
  return new Promise((resolve) => {
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.update !== 'function') {
      resolve({ ok: false, tab: null, error: 'tab-activate-api-unavailable' });
      return;
    }
    try {
      chromeApi.tabs.update(tabId, { active: true }, (tab) => {
        const error = getLastErrorMessage(chromeApi, 'tab-activate-failed');
        resolve({ ok: !error, tab: tab || null, error });
      });
    } catch (error) {
      resolve({
        ok: false,
        tab: null,
        error: getErrorMessage(error, 'tab-activate-failed')
      });
    }
  });
}

function createResult(overrides: Partial<AggregateSearchResult>): AggregateSearchResult {
  return {
    ok: false,
    requestedCount: 0,
    openedCount: 0,
    failedCount: 0,
    unavailableSourceCount: 0,
    grouped: false,
    groupId: null,
    groupTitleApplied: false,
    activatedTabId: null,
    activationDeferred: false,
    activationDelayMs: 0,
    interactiveRequestedCount: 0,
    interactiveSucceededCount: 0,
    interactiveFailedCount: 0,
    reason: '',
    warnings: [],
    ...overrides
  };
}

function isSafeSearchUrl(value: unknown): boolean {
  const raw = String(value || '').trim();
  if (!raw) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (_error) {
    return false;
  }
}

function buildProviderPlans(options: AggregateSearchOpenOptions, query: string): ProviderPlan[] {
  const providers = Array.isArray(options.providers) ? options.providers : [];
  const getEntryUrl = typeof options.getEntryUrl === 'function'
    ? options.getEntryUrl
    : () => '';
  const isInteractiveProvider = typeof options.isInteractiveProvider === 'function'
    ? options.isInteractiveProvider
    : () => false;
  return providers.map((provider) => {
    let url = '';
    try {
      url = String(getEntryUrl(provider, query) || '').trim();
    } catch (_error) {
      url = '';
    }
    if (!isSafeSearchUrl(url)) {
      url = '';
    }
    return {
      provider,
      url,
      interactive: Boolean(isInteractiveProvider(provider))
    };
  });
}

function submitInteractivePrompt(
  chromeApi: typeof chrome,
  options: AggregateSearchOpenOptions,
  openedItem: OpenedPlanTab,
  query: string
): Promise<{ ok: boolean; reason: string }> {
  const waitForTabComplete = typeof options.waitForTabComplete === 'function'
    ? options.waitForTabComplete
    : null;
  const submitPromptInTab = typeof options.submitPromptInTab === 'function'
    ? options.submitPromptInTab
    : null;
  if (!submitPromptInTab) {
    return Promise.resolve({ ok: false, reason: 'submit-runtime-unavailable' });
  }
  const tab = openedItem && openedItem.tab;
  const plan = openedItem && openedItem.plan;
  if (!tab || typeof tab.id !== 'number' || !plan) {
    return Promise.resolve({ ok: false, reason: 'tab-unavailable' });
  }
  const tabId = tab.id;
  const ready = waitForTabComplete
    ? Promise.resolve()
      .then(() => waitForTabComplete(tabId, 15000))
      .catch(() => tab)
    : Promise.resolve(tab);
  return ready
    .then(() => submitPromptInTab(
      chromeApi,
      tabId,
      query,
      String(plan.provider && plan.provider.submitStrategy || '').trim(),
      plan.url
    ))
    .then((result) => ({
      ok: Boolean(result && result.ok),
      reason: result && result.reason ? String(result.reason) : ''
    }))
    .catch((error: unknown) => ({
      ok: false,
      reason: getErrorMessage(error, 'interactive-site-search-failed')
    }));
}

async function openAggregateSearch(
  chromeApi: typeof chrome | null | undefined,
  rawOptions: AggregateSearchOpenOptions | null | undefined
): Promise<AggregateSearchResult> {
  const options: AggregateSearchOpenOptions = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const query = String(options.query || '').trim();
  const unavailableSourceCount = Math.max(0, Number(options.unavailableSourceCount) || 0);
  if (!query) {
    return createResult({ unavailableSourceCount, reason: 'invalid-query' });
  }
  if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.create !== 'function') {
    return createResult({ unavailableSourceCount, reason: 'tabs-api-unavailable' });
  }

  const plans = buildProviderPlans(options, query);
  const requestedCount = plans.length;
  if (!requestedCount) {
    return createResult({
      requestedCount,
      unavailableSourceCount,
      reason: 'aggregate-sources-unavailable'
    });
  }
  const invalidPlanCount = plans.filter((plan) => !plan.url).length;
  if (invalidPlanCount > 0) {
    return createResult({
      requestedCount,
      failedCount: invalidPlanCount,
      unavailableSourceCount,
      reason: 'provider-url-unavailable'
    });
  }

  const windowId = Number(options.windowId);
  const insertIndex = typeof options.insertIndex === 'number' && Number.isInteger(options.insertIndex) &&
    options.insertIndex >= 0
    ? options.insertIndex
    : null;
  const createPlanTab = (plan: ProviderPlan, offset: number): Promise<PlanTab> => {
    const createProperties: chrome.tabs.CreateProperties = {
      url: plan.url,
      active: false
    };
    if (Number.isFinite(windowId)) {
      createProperties.windowId = windowId;
    }
    if (insertIndex !== null) {
      createProperties.index = insertIndex + offset;
    }
    return createBackgroundTab(chromeApi, createProperties)
      .then((result) => ({ ...result, plan }));
  };
  let creationResults: PlanTab[];
  if (insertIndex !== null) {
    // Insert in source order; parallel insertion can reverse or interleave tabs.
    creationResults = [];
    let openedOffset = 0;
    for (const plan of plans) {
      const result = await createPlanTab(plan, openedOffset);
      creationResults.push(result);
      if (result.tab && typeof result.tab.id === 'number') {
        openedOffset += 1;
      }
    }
  } else {
    creationResults = await Promise.all(plans.map((plan) => createPlanTab(plan, 0)));
  }
  const openedItems = creationResults.filter((result): result is OpenedPlanTab => (
    Boolean(result && result.tab && typeof result.tab.id === 'number')
  ));
  const openedCount = openedItems.length;
  const failedCount = requestedCount - openedCount;
  const [firstOpenedItem, ...otherOpenedItems] = openedItems;
  if (!firstOpenedItem) {
    return createResult({
      requestedCount,
      openedCount,
      failedCount,
      unavailableSourceCount,
      reason: 'tab-create-failed'
    });
  }

  const warnings: string[] = [];
  if (failedCount > 0) {
    warnings.push('partial-tab-create-failure');
  }

  const hasExplicitGroupSetting = hasOwn(options, 'autoCreateTabGroup');
  const definition = options.definition && typeof options.definition === 'object'
    ? options.definition
    : null;
  const shouldCreateGroup = hasExplicitGroupSetting
    ? options.autoCreateTabGroup === true
    : (definition && hasOwn(definition, 'autoCreateTabGroup') ? definition.autoCreateTabGroup === true : true);
  let groupId: number | null = null;
  let grouped = false;
  let groupTitleApplied = false;
  if (shouldCreateGroup) {
    const groupResult = await groupTabs(
      chromeApi,
      [firstOpenedItem.tab.id, ...otherOpenedItems.map((item) => item.tab.id)]
    );
    if (groupResult.error || groupResult.groupId === null) {
      warnings.push(groupResult.error);
    } else {
      groupId = groupResult.groupId;
      grouped = true;
      const aggregateName = String(definition && definition.name || '').trim();
      const groupTitle = aggregateName ? `${aggregateName}：${query}` : query;
      const titleResult = await titleTabGroup(chromeApi, groupId, groupTitle);
      groupTitleApplied = titleResult.ok;
      if (titleResult.error) {
        warnings.push(titleResult.error);
      }
    }
  }

  const interactiveItems = openedItems.filter((item) => item.plan.interactive);
  const interactiveOutcomes = await Promise.all(interactiveItems.map((item) => (
    submitInteractivePrompt(chromeApi, options, item, query)
      .then((result) => ({ item, result }))
  )));
  const interactiveSucceededCount = interactiveOutcomes.filter(
    (outcome) => outcome.result.ok
  ).length;
  const interactiveFailedCount = interactiveOutcomes.length - interactiveSucceededCount;
  if (interactiveFailedCount > 0) {
    warnings.push('interactive-submit-failed');
  }
  const nonInteractiveOpenedCount = openedItems.length - interactiveItems.length;
  const completedSearchCount = nonInteractiveOpenedCount + interactiveSucceededCount;
  const searchSucceeded = completedSearchCount > 0;
  const successfulInteractiveTabIds = new Set(interactiveOutcomes
    .filter((outcome) => outcome.result.ok)
    .map((outcome) => outcome.item.tab.id));
  const firstSuccessfulItem = openedItems.find((item) => (
    !item.plan.interactive || successfulInteractiveTabIds.has(item.tab.id)
  ));
  let activatedTabId: number | null = null;
  let activationDeferred = false;
  if (searchSucceeded && firstSuccessfulItem && options.disposition !== 'backgroundTab') {
    const firstTabId = firstSuccessfulItem.tab.id;
    if (warnings.length > 0) {
      const scheduleActivation: ScheduleActivation = typeof options.scheduleActivation === 'function'
        ? options.scheduleActivation
        : (task, delayMs) => setTimeout(task, delayMs);
      try {
        scheduleActivation(() => {
          activateTab(chromeApi, firstTabId).catch(() => {});
        }, ACTIVATION_FEEDBACK_DELAY_MS);
        activationDeferred = true;
      } catch (error) {
        warnings.push(getErrorMessage(error, 'tab-activate-failed'));
        const activateResult = await activateTab(chromeApi, firstTabId);
        if (activateResult.ok) {
          activatedTabId = firstTabId;
        } else if (activateResult.error) {
          warnings.push(activateResult.error);
        }
      }
    } else {
      const activateResult = await activateTab(chromeApi, firstTabId);
      if (activateResult.ok) {
        activatedTabId = firstTabId;
      } else if (activateResult.error) {
        warnings.push(activateResult.error);
      }
    }
  }

  return createResult({
    ok: searchSucceeded,
    requestedCount,
    openedCount,
    failedCount,
    unavailableSourceCount,
    grouped,
    groupId,
    groupTitleApplied,
    activatedTabId,
    activationDeferred,
    activationDelayMs: activationDeferred ? ACTIVATION_FEEDBACK_DELAY_MS : 0,
    interactiveRequestedCount: interactiveItems.length,
    interactiveSucceededCount,
    interactiveFailedCount,
    reason: searchSucceeded
      ? (warnings[0] || '')
      : 'interactive-submit-failed',
    warnings
  });
}

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

function createAggregateSearchQueryRunner(
  rawConfig: AggregateSearchQueryRunnerConfig | null | undefined
): AggregateSearchQueryRunner {
  const config: AggregateSearchQueryRunnerConfig = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  const store = config.aggregateSearchStore || null;
  const loadAggregateSearches = config.loadAggregateSearches;
  const loadSiteSearchProviders = config.loadSiteSearchProviders;
  const loadAggregateSearchAutoGroupEnabled =
    config.loadAggregateSearchAutoGroupEnabled;
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

    const autoGroupSettingTask: Promise<boolean | undefined> = typeof loadAggregateSearchAutoGroupEnabled === 'function'
      ? Promise.resolve()
        .then(() => loadAggregateSearchAutoGroupEnabled())
        .then(
          (value) => typeof value === 'boolean' ? value : undefined,
          () => undefined
        )
      : Promise.resolve(undefined);
    const task = Promise.all([
      loadAggregateSearches(),
      Promise.resolve().then(() => loadSiteSearchProviders()),
      autoGroupSettingTask
    ]).then(async ([definitions, providers, autoGroupSetting]): Promise<AggregateSearchReply> => {
      const definition = (Array.isArray(definitions) ? definitions : []).find((item) => (
        String(item && item.id || '').trim().toLowerCase() === normalizedId
      ));
      if (!definition) {
        return { ok: false, reason: 'aggregate-search-not-found' };
      }
      const availability = store.getAggregateSearchAvailability(definition, providers);
      const requiredSourceCount = Math.max(
        0,
        Number(availability && availability.requiredSourceCount) || 0
      );
      const availableSourceCount = Math.max(
        0,
        Number(availability && availability.availableSourceCount) || 0
      );
      const unavailableSourceCount = Math.max(
        0,
        Number(availability && availability.unavailableSourceCount) || 0
      );
      if (!availability || availability.available !== true) {
        return {
          ok: false,
          reason: 'aggregate-search-sources-unavailable',
          requiredSourceCount,
          availableSourceCount,
          unavailableSourceCount
        };
      }
      const sourceTab = sender && sender.tab ? sender.tab : null;
      const placement: Partial<TabPlacement> = typeof config.resolveTabPlacement === 'function'
        ? await config.resolveTabPlacement(sourceTab)
        : {};
      return openSearch(config.chromeApi, {
        definition: availability.definition,
        query: normalizedQuery,
        providers: availability.providers,
        unavailableSourceCount,
        autoCreateTabGroup: resolveAggregateSearchAutoGroupEnabled(
          autoGroupSetting,
          definitions,
          availability.definition
        ),
        windowId: typeof placement.windowId === 'number'
          ? placement.windowId
          : (sourceTab && typeof sourceTab.windowId === 'number' ? sourceTab.windowId : undefined),
        insertIndex: placement.index,
        disposition,
        getEntryUrl: config.getEntryUrl,
        isInteractiveProvider: config.isInteractiveProvider,
        waitForTabComplete: config.waitForTabComplete,
        submitPromptInTab: config.submitPromptInTab
      });
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

export type { AggregateSearchOpenOptions, AggregateSearchQueryRunner, AggregateSearchQueryRunnerConfig, AggregateSearchResult };
export {
  ACTIVATION_FEEDBACK_DELAY_MS,
  DEFAULT_DEDUPE_WINDOW_MS,
  createAggregateSearchQueryRunner,
  isSafeSearchUrl,
  openAggregateSearch,
  resolveAggregateSearchAutoGroupEnabled
};
