// The selection toolbar's actions: its enabled/provider/group settings, opening
// a search or an AI prompt for the selected text in a new tab (in the toolbar's
// tab group), and the messages the toolbar sends.
//
// A module of the service worker; background.ts imports it before its own code
// runs.

import * as AI_PROVIDER_SUBMIT from './ai-provider-submit';
import * as SEARCH_UTILS from '../domain/search/search-utils';
import * as SELECTION_INTENT from '../domain/selection-intent';
import * as SELECTION_QUICK_ACTION_PROVIDER from './selection-quick-action-provider';
import * as SELECTION_TARGET from './selection-target';
import * as SETTINGS from '../domain/settings';
import { selectionQuickActionsEnabled, selectionQuickActionsGroupEnabled, selectionQuickActionsProvider } from '../domain/settings';
import { waitForTabComplete, workerSettings } from './worker-context';
import { getSiteSearchProviderEntryUrl, isInteractiveSiteSearchProvider, loadSiteSearchProviders, sanitizeSiteSearchProviders } from './search-suggestions-service';
import type { SelectionAction } from '../domain/selection-intent';
import type { SelectionQuickActionsProvider } from '../domain/settings';
import type { SiteSearchProvider } from '../domain/search/types';
import type { SelectionTargetOptions, SelectionTargetResult } from './selection-target';
import type { HandlersFor, IncomingRequest, MessageSender } from './message-router';
import type { OkReply } from '../domain/messages';

// What a selection quick action did: the tab it opened and how the prompt
// went in, or why it stopped.
interface SelectionActionResult extends OkReply {
  tabId?: number;
  url?: string;
  strategy?: string;
  method?: string;
  openMode?: string;
  groupId?: number | null;
  providerKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isSelectionAction(value: unknown): value is SelectionAction {
  return SELECTION_INTENT.ACTIONS.some((action) => action === value);
}

export function loadSelectionQuickActionsEnabled(): Promise<boolean> {
  return workerSettings.ready.then(() => workerSettings.get(selectionQuickActionsEnabled));
}

function loadSelectionQuickActionsProvider(): Promise<SelectionQuickActionsProvider> {
  return workerSettings.ready.then(() => workerSettings.get(selectionQuickActionsProvider));
}

function loadSelectionQuickActionsGroupEnabled(): Promise<boolean> {
  return workerSettings.ready.then(() => workerSettings.get(selectionQuickActionsGroupEnabled));
}

let selectionTargetOpenQueue: Promise<unknown> = Promise.resolve();
let selectionQuickActionFallbackProvidersPromise: Promise<SiteSearchProvider[]> | null = null;
const selectionQuickActionGroupTitlePromises = new Map<string, Promise<string>>();

function loadSelectionQuickActionGroupTitle(locale: unknown): Promise<string> {
  const normalizedLocale = SETTINGS.normalizeLocale(locale);
  const known = selectionQuickActionGroupTitlePromises.get(normalizedLocale);
  if (known) {
    return known;
  }
  const fallbackTitle = String(SELECTION_TARGET.DEFAULT_GROUP_TITLE || 'AI Search');
  const localePath = chrome.runtime.getURL(`_locales/${normalizedLocale}/messages.json`);
  const titlePromise = fetch(localePath, { cache: 'no-store' })
    .then((response) => response.json())
    .then((messages: unknown) => {
      const entry = isRecord(messages) ? messages.selection_quick_actions_group_name : null;
      const title = isRecord(entry) ? String(entry.message || '').trim() : '';
      return title || fallbackTitle;
    })
    .catch(() => fallbackTitle);
  selectionQuickActionGroupTitlePromises.set(normalizedLocale, titlePromise);
  return titlePromise;
}

function queueSelectionTargetOpen(options: SelectionTargetOptions): Promise<SelectionTargetResult> {
  // The previous open reported its own failure to its caller; only order matters here.
  const task = selectionTargetOpenQueue
    .catch(() => {})
    .then(() => new Promise<SelectionTargetResult>((resolve) => {
      SELECTION_TARGET.openSelectionTarget(chrome, options, resolve);
    }));
  selectionTargetOpenQueue = task.then(() => undefined, () => undefined);
  return task;
}

function loadSelectionQuickActionFallbackProviders(): Promise<SiteSearchProvider[]> {
  if (selectionQuickActionFallbackProvidersPromise) {
    return selectionQuickActionFallbackProvidersPromise;
  }
  const localUrl = chrome.runtime.getURL('assets/data/site-search.json');
  const fallbackDefaults = SEARCH_UTILS.getDefaultSiteSearchProviders();
  selectionQuickActionFallbackProvidersPromise = fetch(localUrl)
    .then((response) => response.json())
    .then((data: unknown) => {
      const items: unknown[] = isRecord(data) && Array.isArray(data.items) ? data.items : [];
      return sanitizeSiteSearchProviders(items.length > 0 ? items : fallbackDefaults);
    })
    .catch(() => sanitizeSiteSearchProviders(fallbackDefaults));
  return selectionQuickActionFallbackProvidersPromise;
}

function submitSelectionPromptInTab(
  provider: SiteSearchProvider,
  prompt: string,
  entryUrl: string,
  tab: chrome.tabs.Tab | null,
  targetInfo: SelectionTargetResult
): Promise<SelectionActionResult> {
  const submitStrategy = String(provider && provider.submitStrategy || '').trim();
  if (!tab || typeof tab.id !== 'number') {
    return Promise.resolve({ ok: false, reason: 'tab-unavailable' });
  }
  const tabId = tab.id;
  return waitForTabComplete(tabId, 15000)
    .catch(() => tab)
    .then(() => AI_PROVIDER_SUBMIT.submitPromptInTab(
      chrome,
      tabId,
      prompt,
      submitStrategy,
      entryUrl
    ))
    .then((result) => ({
      ok: Boolean(result && result.ok),
      tabId,
      url: entryUrl,
      strategy: submitStrategy,
      method: result && result.method ? result.method : '',
      reason: result && result.reason ? result.reason : '',
      openMode: targetInfo && targetInfo.mode ? targetInfo.mode : 'tab',
      groupId: targetInfo && typeof targetInfo.groupId === 'number' ? targetInfo.groupId : null,
      providerKey: String(provider && provider.key || '')
    }));
}

async function openAndSubmitSelectionPrompt(
  provider: SiteSearchProvider,
  prompt: string,
  entryUrl: string,
  sourceTab: chrome.tabs.Tab | null,
  groupEnabled: boolean,
  groupTitle: string
): Promise<SelectionActionResult> {
  const targetOptions: SelectionTargetOptions = {
    url: entryUrl,
    sourceTab,
    groupEnabled,
    groupTitle: groupTitle || SELECTION_TARGET.DEFAULT_GROUP_TITLE,
    groupColor: 'blue'
  };
  let targetInfo = await queueSelectionTargetOpen(targetOptions);
  if (!targetInfo || targetInfo.ok === false || !targetInfo.tab) {
    return {
      ok: false,
      reason: targetInfo && targetInfo.reason ? targetInfo.reason : 'selection-target-open-failed'
    };
  }
  const firstResult = await submitSelectionPromptInTab(provider, prompt, entryUrl, targetInfo.tab, targetInfo);
  if (targetInfo.mode === 'reused' && !firstResult.ok) {
    targetInfo = await queueSelectionTargetOpen({
      ...targetOptions,
      reuseExisting: false
    });
    if (!targetInfo || targetInfo.ok === false || !targetInfo.tab) {
      return {
        ok: false,
        reason: targetInfo && targetInfo.reason
          ? targetInfo.reason
          : (firstResult.reason || 'selection-target-open-failed')
      };
    }
    return submitSelectionPromptInTab(provider, prompt, entryUrl, targetInfo.tab, targetInfo);
  }
  return firstResult;
}

async function runSelectionQuickAction(
  request: IncomingRequest<'runSelectionQuickAction'>,
  sender: MessageSender
): Promise<SelectionActionResult> {
  const [enabled, preferredProviderKey, groupEnabled, bundledProviders, groupTitle] = await Promise.all([
    loadSelectionQuickActionsEnabled(),
    loadSelectionQuickActionsProvider(),
    loadSelectionQuickActionsGroupEnabled(),
    loadSelectionQuickActionFallbackProviders(),
    loadSelectionQuickActionGroupTitle(request.locale)
  ]);
  if (!enabled) {
    return { ok: false, reason: 'selection-quick-actions-disabled' };
  }
  const rawText = typeof request.text === 'string' ? request.text : '';
  const normalizedText = SELECTION_INTENT.normalizeText(rawText);
  const maxLength = Number(SELECTION_INTENT.MAX_SELECTION_LENGTH) || 2400;
  const intent: SelectionAction = isSelectionAction(request.intent) ? request.intent : 'ask';
  if (!normalizedText || normalizedText.length > maxLength) {
    return { ok: false, reason: 'invalid-selection-text' };
  }
  const providers = await loadSiteSearchProviders();
  const provider = SELECTION_QUICK_ACTION_PROVIDER.resolveSelectionQuickActionProvider(
    providers,
    bundledProviders,
    preferredProviderKey,
    isInteractiveSiteSearchProvider
  );
  if (!provider) {
    return { ok: false, reason: 'selection-provider-unavailable' };
  }
  const prompt = SELECTION_INTENT.buildPrompt(intent, normalizedText, request.locale);
  const entryUrl = getSiteSearchProviderEntryUrl(provider, prompt);
  if (!entryUrl) {
    return { ok: false, reason: 'selection-provider-url-unavailable' };
  }
  const sourceTab = sender && sender.tab ? sender.tab : null;
  return openAndSubmitSelectionPrompt(
    provider,
    prompt,
    entryUrl,
    sourceTab,
    groupEnabled,
    groupTitle
  );
}

// Selection quick actions.
export const SELECTION_QUICK_ACTION_MESSAGE_HANDLERS: HandlersFor<'runSelectionQuickAction'> = Object.freeze({
  runSelectionQuickAction(request, sender, sendResponse) {
    runSelectionQuickAction(request, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          reason: error instanceof Error && error.message ? error.message : 'selection-quick-action-failed'
        });
      });
    return true;
  }
});
