// The selection toolbar's actions: its enabled/provider/group settings, opening
// a search or an AI prompt for the selected text in a new tab (in the toolbar's
// tab group), and the messages the toolbar sends.
//
// A module of the service worker; background.js imports it before its own code
// runs. Its functions use background.js bindings (storageArea, the selection
// setting keys, SELECTION_TARGET, waitForTabComplete, ...) only when they run,
// never while this file loads, because background.js has not initialized its
// own top-level bindings yet at that point.

import * as AI_PROVIDER_SUBMIT from './ai-provider-submit.js';
import * as SEARCH_UTILS from '../shared/search/search-utils.js';
import * as SELECTION_INTENT from '../shared/selection-intent.js';
import * as SELECTION_QUICK_ACTION_PROVIDER from './selection-quick-action-provider.js';
import * as SELECTION_TARGET from './selection-target.js';
import * as SETTINGS from '../shared/settings.js';
import {
  SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY,
  SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY,
  storageArea,
  waitForTabComplete
} from './background.js';
import {
  getSiteSearchProviderEntryUrl,
  isInteractiveSiteSearchProvider,
  loadSiteSearchProviders,
  sanitizeSiteSearchProviders
} from './search-suggestions-service.js';

export function loadSelectionQuickActionsEnabled() {
  return new Promise((resolve) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve(false);
      return;
    }
    storageArea.get([SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(result && result[SELECTION_QUICK_ACTIONS_ENABLED_STORAGE_KEY] === true));
    });
  });
}

function loadSelectionQuickActionsProvider() {
  return new Promise((resolve) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve('gpt');
      return;
    }
    storageArea.get([SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve('gpt');
        return;
      }
      const rawValue = result && result[SELECTION_QUICK_ACTIONS_PROVIDER_STORAGE_KEY];
      const providerKey = SETTINGS.normalizeSelectionQuickActionsProvider(rawValue);
      resolve(providerKey || 'gpt');
    });
  });
}

function loadSelectionQuickActionsGroupEnabled() {
  return new Promise((resolve) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve(false);
      return;
    }
    storageArea.get([SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(Boolean(result && result[SELECTION_QUICK_ACTIONS_GROUP_ENABLED_STORAGE_KEY] === true));
    });
  });
}

let selectionTargetOpenQueue = Promise.resolve();
let selectionQuickActionFallbackProvidersPromise = null;
const selectionQuickActionGroupTitlePromises = new Map();

function loadSelectionQuickActionGroupTitle(locale) {
  const normalizedLocale = SETTINGS.normalizeLocale(locale);
  if (selectionQuickActionGroupTitlePromises.has(normalizedLocale)) {
    return selectionQuickActionGroupTitlePromises.get(normalizedLocale);
  }
  const fallbackTitle = String(SELECTION_TARGET.DEFAULT_GROUP_TITLE || 'AI Search');
  const localePath = chrome.runtime.getURL(`_locales/${normalizedLocale}/messages.json`);
  const titlePromise = fetch(localePath, { cache: 'no-store' })
    .then((response) => response.json())
    .then((messages) => {
      const title = messages && messages.selection_quick_actions_group_name
        ? String(messages.selection_quick_actions_group_name.message || '').trim()
        : '';
      return title || fallbackTitle;
    })
    .catch(() => fallbackTitle);
  selectionQuickActionGroupTitlePromises.set(normalizedLocale, titlePromise);
  return titlePromise;
}

function queueSelectionTargetOpen(options) {
  // The previous open reported its own failure to its caller; only order matters here.
  const task = selectionTargetOpenQueue
    .catch(() => {})
    .then(() => new Promise((resolve) => {
      SELECTION_TARGET.openSelectionTarget(chrome, options, resolve);
    }));
  selectionTargetOpenQueue = task.then(() => undefined, () => undefined);
  return task;
}

function loadSelectionQuickActionFallbackProviders() {
  if (selectionQuickActionFallbackProvidersPromise) {
    return selectionQuickActionFallbackProvidersPromise;
  }
  const localUrl = chrome.runtime.getURL('assets/data/site-search.json');
  const fallbackDefaults = SEARCH_UTILS.getDefaultSiteSearchProviders();
  selectionQuickActionFallbackProvidersPromise = fetch(localUrl)
    .then((response) => response.json())
    .then((data) => {
      const items = data && Array.isArray(data.items) ? data.items : [];
      return sanitizeSiteSearchProviders(items.length > 0 ? items : fallbackDefaults);
    })
    .catch(() => sanitizeSiteSearchProviders(fallbackDefaults));
  return selectionQuickActionFallbackProvidersPromise;
}

function submitSelectionPromptInTab(provider, prompt, entryUrl, tab, targetInfo) {
  const submitStrategy = String(provider && provider.submitStrategy || '').trim();
  if (!tab || typeof tab.id !== 'number') {
    return Promise.resolve({ ok: false, reason: 'tab-unavailable' });
  }
  return waitForTabComplete(tab.id, 15000)
    .catch(() => tab)
    .then(() => AI_PROVIDER_SUBMIT.submitPromptInTab(
      chrome,
      tab.id,
      prompt,
      submitStrategy,
      entryUrl
    ))
    .then((result) => ({
      ok: Boolean(result && result.ok),
      tabId: tab.id,
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
  provider,
  prompt,
  entryUrl,
  sourceTab,
  groupEnabled,
  groupTitle
) {
  const targetOptions = {
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

async function runSelectionQuickAction(request, sender) {
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
  const actions = Array.isArray(SELECTION_INTENT.ACTIONS) ? SELECTION_INTENT.ACTIONS : [];
  const intent = actions.includes(request.intent) ? request.intent : 'ask';
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
export const SELECTION_QUICK_ACTION_MESSAGE_HANDLERS = Object.freeze({
  runSelectionQuickAction(request, sender, sendResponse) {
    runSelectionQuickAction(request, sender)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          reason: error && error.message ? error.message : 'selection-quick-action-failed'
        });
      });
    return true;
  }
});
