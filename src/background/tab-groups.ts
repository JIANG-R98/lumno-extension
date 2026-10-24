// Opening tabs in the tab group of the tab they were opened from.

// The parts of the extension API the helpers use.
interface TabGroupChromeApi {
  tabGroups?: { TAB_GROUP_ID_NONE?: number };
  tabs?: {
    group?(options: { tabIds: number; groupId: number }, callback: () => void): void;
    create?(createProperties: chrome.tabs.CreateProperties, callback: (tab: chrome.tabs.Tab) => void): void;
  };
  runtime?: { lastError?: { message?: string } | null };
}

// The fields of a tab the helpers read.
type TabLike = Partial<Pick<chrome.tabs.Tab, 'id' | 'groupId' | 'windowId' | 'pinned'>>;

// The group a new tab joins, and the window it must be in to join it.
interface TabGroupContext {
  groupId: number;
  windowId: number | null;
}

interface CreatedTabInfo {
  ok: boolean;
  reason: string;
  grouped: boolean;
  groupReason?: string;
}

type CreatedTabCallback = (tab: chrome.tabs.Tab | null, info: CreatedTabInfo) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getChromeApi(chromeApi: TabGroupChromeApi | null | undefined): TabGroupChromeApi | null {
  return chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
}

function getUngroupedTabId(chromeApi?: TabGroupChromeApi | null): number {
  const api = getChromeApi(chromeApi);
  return api &&
    api.tabGroups &&
    typeof api.tabGroups.TAB_GROUP_ID_NONE === 'number'
    ? api.tabGroups.TAB_GROUP_ID_NONE
    : -1;
}

function getSourceTabGroupContext(sourceTab: TabLike | null | undefined, chromeApi?: TabGroupChromeApi | null): TabGroupContext | null {
  const api = getChromeApi(chromeApi);
  if (!sourceTab || typeof sourceTab.groupId !== 'number') {
    return null;
  }
  const groupId = sourceTab.groupId;
  if (groupId === getUngroupedTabId(api)) {
    return null;
  }
  return {
    groupId,
    windowId: typeof sourceTab.windowId === 'number' ? sourceTab.windowId : null
  };
}

// A group context as given, or the one of the tab given instead.
function normalizeSourceTabGroupContext(source: unknown, chromeApi: TabGroupChromeApi | null | undefined): TabGroupContext | null {
  if (!isRecord(source)) {
    return null;
  }
  if (typeof source.groupId === 'number' && !Object.prototype.hasOwnProperty.call(source, 'id')) {
    const groupId = source.groupId;
    if (groupId === getUngroupedTabId(chromeApi)) {
      return null;
    }
    return {
      groupId,
      windowId: typeof source.windowId === 'number' ? source.windowId : null
    };
  }
  return getSourceTabGroupContext({
    ...(typeof source.id === 'number' ? { id: source.id } : {}),
    ...(typeof source.groupId === 'number' ? { groupId: source.groupId } : {}),
    ...(typeof source.windowId === 'number' ? { windowId: source.windowId } : {})
  }, chromeApi);
}

function shouldGroupCreatedTab(
  tab: TabLike | null | undefined,
  context: TabGroupContext | null | undefined,
  createProperties?: { pinned?: boolean } | null
): boolean {
  if (!context || typeof context.groupId !== 'number') {
    return false;
  }
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  if ((createProperties && createProperties.pinned === true) || tab.pinned === true) {
    return false;
  }
  if (typeof tab.groupId === 'number' && tab.groupId === context.groupId) {
    return false;
  }
  if (typeof context.windowId === 'number' &&
      typeof tab.windowId === 'number' &&
      tab.windowId !== context.windowId) {
    return false;
  }
  return true;
}

function buildCreatePropertiesForSourceGroup(
  createProperties: chrome.tabs.CreateProperties | null | undefined,
  sourceTab: TabLike | null | undefined,
  chromeApi?: TabGroupChromeApi | null
): chrome.tabs.CreateProperties {
  const props: chrome.tabs.CreateProperties = {
    ...(createProperties && typeof createProperties === 'object' ? createProperties : {})
  };
  const context = getSourceTabGroupContext(sourceTab, chromeApi);
  if (context &&
      typeof context.windowId === 'number' &&
      typeof props.windowId !== 'number') {
    props.windowId = context.windowId;
  }
  return props;
}

function moveTabToSourceGroupContext(
  chromeApi: TabGroupChromeApi | null | undefined,
  tab: TabLike | null | undefined,
  sourceContext: unknown,
  callback?: ((grouped: boolean, reason: string) => void) | null,
  createProperties?: { pinned?: boolean } | null
): void {
  const api = getChromeApi(chromeApi);
  const context = normalizeSourceTabGroupContext(sourceContext, api);
  const done = typeof callback === 'function' ? callback : () => {};
  const tabs = api && api.tabs;
  const group = tabs && tabs.group;
  const tabId = tab && tab.id;
  if (!api || !tabs || typeof group !== 'function' || typeof tabId !== 'number' || !context ||
      !shouldGroupCreatedTab(tab, context, createProperties)) {
    done(false, '');
    return;
  }
  try {
    group.call(tabs, {
      tabIds: tabId,
      groupId: context.groupId
    }, () => {
      const error = api.runtime && api.runtime.lastError
        ? api.runtime.lastError.message || 'tab-group-failed'
        : '';
      done(!error, error);
    });
  } catch (error) {
    done(false, error instanceof Error && error.message ? error.message : 'tab-group-threw');
  }
}

function moveTabToSourceGroup(
  chromeApi: TabGroupChromeApi | null | undefined,
  tab: TabLike | null | undefined,
  sourceTab: TabLike | null | undefined,
  callback?: ((grouped: boolean, reason: string) => void) | null,
  createProperties?: { pinned?: boolean } | null
): void {
  const context = getSourceTabGroupContext(sourceTab, chromeApi);
  moveTabToSourceGroupContext(chromeApi, tab, context, callback, createProperties);
}

// Opens a tab and puts it in the source tab's group.
function createTabInSourceGroup(
  chromeApi: TabGroupChromeApi | null | undefined,
  createProperties: chrome.tabs.CreateProperties | null | undefined,
  sourceTab: TabLike | null | undefined,
  callback?: CreatedTabCallback | null
): void {
  const api = getChromeApi(chromeApi);
  const done: CreatedTabCallback = typeof callback === 'function' ? callback : () => {};
  const tabs = api && api.tabs;
  const create = tabs && tabs.create;
  if (!api || !tabs || typeof create !== 'function') {
    done(null, { ok: false, reason: 'tabs-api-unavailable', grouped: false });
    return;
  }
  const props = buildCreatePropertiesForSourceGroup(createProperties, sourceTab, api);
  const sourceContext = getSourceTabGroupContext(sourceTab, api);
  try {
    create.call(tabs, props, (tab) => {
      const createError = api.runtime && api.runtime.lastError
        ? api.runtime.lastError.message || 'tab-create-failed'
        : '';
      if (createError) {
        done(tab || null, { ok: false, reason: createError, grouped: false });
        return;
      }
      moveTabToSourceGroupContext(api, tab, sourceContext, (grouped, groupReason) => {
        done(tab || null, {
          ok: true,
          reason: '',
          grouped: Boolean(grouped),
          groupReason: groupReason || ''
        });
      }, props);
    });
  } catch (error) {
    done(null, {
      ok: false,
      reason: error instanceof Error && error.message ? error.message : 'tab-create-threw',
      grouped: false
    });
  }
}

export {
  buildCreatePropertiesForSourceGroup,
  createTabInSourceGroup,
  getSourceTabGroupContext,
  getUngroupedTabId,
  moveTabToSourceGroup,
  moveTabToSourceGroupContext,
  shouldGroupCreatedTab
};
export type { CreatedTabCallback, CreatedTabInfo, TabGroupChromeApi, TabGroupContext, TabLike };
