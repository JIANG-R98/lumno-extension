// Where a selection quick action opens its AI provider: a new tab, or a tab
// in the "AI Search" group, reusing the provider's tab when one is open.

type GroupColor = `${chrome.tabGroups.Color}`;

// The callback-style extension API the helpers use.
interface SelectionTargetChromeApi {
  tabGroups?: {
    query?(queryInfo: { title?: string; windowId?: number }, callback: (groups: chrome.tabGroups.TabGroup[]) => void): void;
    update?(groupId: number, updateProperties: { title?: string; color?: GroupColor; collapsed?: boolean }, callback: () => void): void;
  };
  tabs?: {
    query?(queryInfo: { windowId?: number }, callback: (tabs: chrome.tabs.Tab[]) => void): void;
    create?(createProperties: chrome.tabs.CreateProperties, callback: (tab: chrome.tabs.Tab) => void): void;
    group?(options: { tabIds: number; groupId?: number }, callback: (groupId: number) => void): void;
  };
  runtime?: { lastError?: { message?: string } | null };
}

// A group to put the tab in; preserve keeps its title and color as they are.
interface SelectionGroup {
  id?: number;
  preserve?: boolean;
}

interface SelectionGroupStyle {
  title?: string;
  color?: GroupColor;
  collapsed?: boolean;
}

interface SelectionTargetOptions {
  url?: string;
  sourceTab?: chrome.tabs.Tab | null;
  windowId?: number;
  groupTitle?: string;
  groupColor?: GroupColor;
  groupEnabled?: boolean;
  reuseExisting?: boolean;
}

// 'reused' when an open tab of the provider was taken.
type SelectionTargetMode = 'tab' | 'group' | 'reused' | 'none';

interface SelectionTargetResult {
  ok: boolean;
  mode: SelectionTargetMode;
  tab: chrome.tabs.Tab | null;
  groupId?: number | null;
  reason: string;
}

type SelectionTargetCallback = (result: SelectionTargetResult) => void;

const DEFAULT_GROUP_TITLE = 'AI Search';
const DEFAULT_GROUP_COLOR: GroupColor = 'blue';

function getChromeApi(chromeApi: SelectionTargetChromeApi | null | undefined): SelectionTargetChromeApi | null {
  return chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getRuntimeError(api: SelectionTargetChromeApi, fallback: string): string {
  return api && api.runtime && api.runtime.lastError
    ? api.runtime.lastError.message || fallback
    : '';
}

function getHttpOrigin(value: unknown): string {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch (_error) {
    return '';
  }
}

function getTabUrl(tab: chrome.tabs.Tab | null | undefined): string {
  const pendingUrl = tab && typeof tab.pendingUrl === 'string' ? tab.pendingUrl.trim() : '';
  if (pendingUrl) {
    return pendingUrl;
  }
  return tab && typeof tab.url === 'string' ? tab.url.trim() : '';
}

function findExistingSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  windowId: number | null,
  title: string | undefined,
  callback?: (group: SelectionGroup | null) => void
): void {
  const api = getChromeApi(chromeApi);
  const done = typeof callback === 'function' ? callback : () => {};
  const tabGroups = api && api.tabGroups;
  const query = tabGroups && tabGroups.query;
  if (!api || !tabGroups || typeof query !== 'function') {
    done(null);
    return;
  }
  const queryInfo: { title: string; windowId?: number } = { title: title || DEFAULT_GROUP_TITLE };
  if (typeof windowId === 'number') {
    queryInfo.windowId = windowId;
  }
  try {
    query.call(tabGroups, queryInfo, (groups) => {
      if (getRuntimeError(api, 'tab-group-query-failed')) {
        done(null);
        return;
      }
      const group = Array.isArray(groups)
        ? groups.find((item) => item && typeof item.id === 'number')
        : null;
      done(group || null);
    });
  } catch (_error) {
    done(null);
  }
}

function resolveSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null,
  settings: SelectionTargetOptions,
  callback: (group: SelectionGroup | null) => void
): void {
  const api = getChromeApi(chromeApi);
  const done = typeof callback === 'function' ? callback : () => {};
  const sourceTab = settings && settings.sourceTab && typeof settings.sourceTab === 'object'
    ? settings.sourceTab
    : null;
  const windowId = sourceTab && typeof sourceTab.windowId === 'number'
    ? sourceTab.windowId
    : (settings && typeof settings.windowId === 'number' ? settings.windowId : null);
  findExistingSelectionGroup(api, windowId, settings && settings.groupTitle, done);
}

// An open tab of the provider's site, the most recently used loaded one.
function readSourceTab(settings: SelectionTargetOptions): chrome.tabs.Tab | null {
  return settings.sourceTab && typeof settings.sourceTab === 'object' ? settings.sourceTab : null;
}

// The window to open in: the source tab's, or the one the request names.
function readTargetWindowId(settings: SelectionTargetOptions): number | null {
  const sourceTab = readSourceTab(settings);
  if (sourceTab && typeof sourceTab.windowId === 'number') {
    return sourceTab.windowId;
  }
  return typeof settings.windowId === 'number' ? settings.windowId : null;
}

// A new tab for the URL, next to and opened from the source tab.
function createPropertiesFor(settings: SelectionTargetOptions, active: boolean): chrome.tabs.CreateProperties {
  const createProperties: chrome.tabs.CreateProperties = {
    url: String(settings.url || ''),
    active
  };
  const windowId = readTargetWindowId(settings);
  if (typeof windowId === 'number') {
    createProperties.windowId = windowId;
  }
  const sourceTab = readSourceTab(settings);
  if (sourceTab && typeof sourceTab.id === 'number') {
    createProperties.openerTabId = sourceTab.id;
  }
  return createProperties;
}

function isReusableTab(tab: chrome.tabs.Tab, sourceTab: chrome.tabs.Tab | null, origin: string): boolean {
  return Boolean(tab) &&
    typeof tab.id === 'number' &&
    (!sourceTab || tab.id !== sourceTab.id) &&
    tab.discarded !== true &&
    getHttpOrigin(getTabUrl(tab)) === origin;
}

// Loaded tabs first, then the most recently used.
function compareReusableTabs(left: chrome.tabs.Tab, right: chrome.tabs.Tab): number {
  const statusDifference = Number(right.status === 'complete') - Number(left.status === 'complete');
  if (statusDifference !== 0) {
    return statusDifference;
  }
  return (Number(right.lastAccessed) || 0) - (Number(left.lastAccessed) || 0);
}

function findReusableSelectionTab(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  options: SelectionTargetOptions | null | undefined,
  callback?: (tab: chrome.tabs.Tab | null) => void
): void {
  const api = getChromeApi(chromeApi);
  const settings = options && typeof options === 'object' ? options : {};
  const done = typeof callback === 'function' ? callback : () => {};
  const expectedOrigin = getHttpOrigin(settings.url);
  const tabsApi = api && api.tabs;
  const query = tabsApi && tabsApi.query;
  if (!expectedOrigin || !api || !tabsApi || typeof query !== 'function') {
    done(null);
    return;
  }
  const sourceTab = readSourceTab(settings);
  const queryInfo: { windowId?: number } = {};
  const windowId = readTargetWindowId(settings);
  if (typeof windowId === 'number') {
    queryInfo.windowId = windowId;
  }
  try {
    query.call(tabsApi, queryInfo, (tabs) => {
      if (getRuntimeError(api, 'tab-query-failed')) {
        done(null);
        return;
      }
      const candidates = (Array.isArray(tabs) ? tabs : [])
        .filter((tab) => isReusableTab(tab, sourceTab, expectedOrigin))
        .sort(compareReusableTabs);
      done(candidates[0] || null);
    });
  } catch (_error) {
    done(null);
  }
}

function updateSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  groupId: number,
  options: SelectionGroupStyle | null | undefined,
  callback?: (updated: boolean, reason: string) => void
): void {
  const api = getChromeApi(chromeApi);
  const done = typeof callback === 'function' ? callback : () => {};
  const tabGroups = api && api.tabGroups;
  const update = tabGroups && tabGroups.update;
  if (!api || !tabGroups || typeof update !== 'function') {
    done(false, 'tab-groups-update-unavailable');
    return;
  }
  const settings = options && typeof options === 'object' ? options : {};
  try {
    update.call(tabGroups, groupId, {
      title: settings.title || DEFAULT_GROUP_TITLE,
      color: settings.color || DEFAULT_GROUP_COLOR,
      collapsed: settings.collapsed !== false
    }, () => {
      const error = getRuntimeError(api, 'tab-group-update-failed');
      done(!error, error);
    });
  } catch (error) {
    done(false, getErrorMessage(error, 'tab-group-update-threw'));
  }
}

function addTabToSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  tab: chrome.tabs.Tab | null | undefined,
  group: SelectionGroup | null,
  options: SelectionGroupStyle | null | undefined,
  callback?: SelectionTargetCallback
): void {
  const api = getChromeApi(chromeApi);
  const done: SelectionTargetCallback = typeof callback === 'function' ? callback : () => {};
  const tabsApi = api && api.tabs;
  const groupTabs = tabsApi && tabsApi.group;
  const tabId = tab && tab.id;
  if (!api || !tabsApi || typeof groupTabs !== 'function' || !tab || typeof tabId !== 'number') {
    done({
      ok: true,
      mode: 'tab',
      tab: tab || null,
      groupId: null,
      reason: 'tab-groups-unavailable'
    });
    return;
  }
  const groupOptions: { tabIds: number; groupId?: number } = { tabIds: tabId };
  if (group && typeof group.id === 'number') {
    groupOptions.groupId = group.id;
  }
  try {
    groupTabs.call(tabsApi, groupOptions, (groupId) => {
      const groupError = getRuntimeError(api, 'tab-group-failed');
      if (groupError || typeof groupId !== 'number') {
        done({
          ok: true,
          mode: 'tab',
          tab,
          groupId: null,
          reason: groupError || 'tab-group-unavailable'
        });
        return;
      }
      if (group && group.preserve === true) {
        done({
          ok: true,
          mode: 'group',
          tab,
          groupId,
          reason: ''
        });
        return;
      }
      updateSelectionGroup(api, groupId, options, (_updated, updateReason) => {
        done({
          ok: true,
          mode: 'group',
          tab,
          groupId,
          reason: updateReason || ''
        });
      });
    });
  } catch (error) {
    done({
      ok: true,
      mode: 'tab',
      tab,
      groupId: null,
      reason: getErrorMessage(error, 'tab-group-threw')
    });
  }
}

function placeTabInSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  tab: chrome.tabs.Tab | null | undefined,
  options: SelectionTargetOptions | null | undefined,
  callback?: SelectionTargetCallback
): void {
  const api = getChromeApi(chromeApi);
  const settings = options && typeof options === 'object' ? options : {};
  const done: SelectionTargetCallback = typeof callback === 'function' ? callback : () => {};
  if (!tab || typeof tab.id !== 'number') {
    done({ ok: false, mode: 'none', tab: tab || null, groupId: null, reason: 'tab-unavailable' });
    return;
  }
  findExistingSelectionGroup(
    api,
    typeof tab.windowId === 'number' ? tab.windowId : null,
    settings.groupTitle,
    (group) => {
      addTabToSelectionGroup(api, tab, group, {
        title: settings.groupTitle || DEFAULT_GROUP_TITLE,
        color: settings.groupColor || DEFAULT_GROUP_COLOR,
        collapsed: true
      }, done);
    }
  );
}

function openInSelectionGroup(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  options: SelectionTargetOptions | null | undefined,
  callback?: SelectionTargetCallback
): void {
  const api = getChromeApi(chromeApi);
  const settings = options && typeof options === 'object' ? options : {};
  const done: SelectionTargetCallback = typeof callback === 'function' ? callback : () => {};
  const tabsApi = api && api.tabs;
  const create = tabsApi && tabsApi.create;
  if (!api || !tabsApi || typeof create !== 'function') {
    done({ ok: false, mode: 'none', tab: null, reason: 'tabs-api-unavailable' });
    return;
  }
  const createProperties = createPropertiesFor(settings, false);
  resolveSelectionGroup(api, settings, (group) => {
    try {
      create.call(tabsApi, createProperties, (tab) => {
        const createError = getRuntimeError(api, 'tab-create-failed');
        if (createError || !tab || typeof tab.id !== 'number') {
          done({
            ok: false,
            mode: 'none',
            tab: tab || null,
            reason: createError || 'tab-unavailable'
          });
          return;
        }
        addTabToSelectionGroup(api, tab, group, {
          title: settings.groupTitle || DEFAULT_GROUP_TITLE,
          color: settings.groupColor || DEFAULT_GROUP_COLOR,
          collapsed: true
        }, done);
      });
    } catch (error) {
      done({
        ok: false,
        mode: 'none',
        tab: null,
        reason: getErrorMessage(error, 'tab-create-threw')
      });
    }
  });
}

function openInNewTab(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  options: SelectionTargetOptions | null | undefined,
  callback?: SelectionTargetCallback
): void {
  const api = getChromeApi(chromeApi);
  const settings = options && typeof options === 'object' ? options : {};
  const done: SelectionTargetCallback = typeof callback === 'function' ? callback : () => {};
  const tabsApi = api && api.tabs;
  const create = tabsApi && tabsApi.create;
  if (!api || !tabsApi || typeof create !== 'function') {
    done({ ok: false, mode: 'none', tab: null, groupId: null, reason: 'tabs-api-unavailable' });
    return;
  }
  const createProperties = createPropertiesFor(settings, true);
  try {
    create.call(tabsApi, createProperties, (tab) => {
      const createError = getRuntimeError(api, 'tab-create-failed');
      if (createError || !tab || typeof tab.id !== 'number') {
        done({
          ok: false,
          mode: 'none',
          tab: tab || null,
          groupId: null,
          reason: createError || 'tab-unavailable'
        });
        return;
      }
      done({ ok: true, mode: 'tab', tab, groupId: null, reason: '' });
    });
  } catch (error) {
    done({
      ok: false,
      mode: 'none',
      tab: null,
      groupId: null,
      reason: getErrorMessage(error, 'tab-create-threw')
    });
  }
}

function openSelectionTarget(
  chromeApi: SelectionTargetChromeApi | null | undefined,
  options: SelectionTargetOptions | null | undefined,
  callback?: SelectionTargetCallback
): void {
  const settings = options && typeof options === 'object' ? options : {};
  const done: SelectionTargetCallback = typeof callback === 'function' ? callback : () => {};
  if (settings.groupEnabled === true) {
    if (settings.reuseExisting !== false) {
      findReusableSelectionTab(chromeApi, settings, (tab) => {
        if (!tab) {
          openInSelectionGroup(chromeApi, settings, done);
          return;
        }
        placeTabInSelectionGroup(chromeApi, tab, settings, (placement) => {
          done({
            ...placement,
            ok: true,
            mode: 'reused',
            tab
          });
        });
      });
      return;
    }
    openInSelectionGroup(chromeApi, settings, done);
    return;
  }
  openInNewTab(chromeApi, settings, done);
}

export {
  DEFAULT_GROUP_COLOR,
  DEFAULT_GROUP_TITLE,
  addTabToSelectionGroup,
  findExistingSelectionGroup,
  findReusableSelectionTab,
  openInNewTab,
  openInSelectionGroup,
  openSelectionTarget,
  placeTabInSelectionGroup,
  updateSelectionGroup
};
export type {
  GroupColor,
  SelectionGroup,
  SelectionGroupStyle,
  SelectionTargetChromeApi,
  SelectionTargetMode,
  SelectionTargetOptions,
  SelectionTargetResult
};
