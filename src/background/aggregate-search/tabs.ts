// The tab calls an aggregate search makes: creating, grouping, titling and
// activating its tabs, and typing prompts into the AI sources' pages.
import type { AggregateSearchOpenOptions, CreatedTab, OpenedPlanTab } from './types';

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

export {
  ACTIVATION_FEEDBACK_DELAY_MS,
  DEFAULT_DEDUPE_WINDOW_MS,
  activateTab,
  createBackgroundTab,
  getErrorMessage,
  getLastErrorMessage,
  groupTabs,
  hasOwn,
  isRecord,
  submitInteractivePrompt,
  titleTabGroup
};
