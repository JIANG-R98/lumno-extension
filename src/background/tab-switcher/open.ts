// Opening the switcher from its command: the recent tabs it lists, the tab
// that hosts it, and switching to the chosen tab.
import { getDefaultSwitcherSelectedIndex } from '../../domain/tab-switcher-model';
import type { SwitcherOffset } from '../../domain/tab-switcher-model';
import type { TabSwitcherItem } from '../../domain/messages';
import { tabSwitcherCurrentWindowOnly, tabSwitcherEnabled } from '../../domain/settings/features';
import { getResolvedTabUrl } from '../browser-urls-service';
import { openNewtabFallback, openNewtabFallbackForUrl } from '../newtab-fallback';
import * as RECENT_TAB_SWITCHER from '../recent-tab-switcher';
import { recordTabSwitchEvent } from '../tab-switch-stats-service';
import { areBackgroundSettingsLoaded, logHotkeyDebug, whenBackgroundSettingsReady, workerSettings } from '../worker-context';
import { buildSwitcherTabFavicon, getSwitcherTabAccentRgb } from './appearance';
import {
  TAB_SWITCHER_CAPTURE_REASON_COMMAND_IMMEDIATE,
  captureSwitcherThumbnailForTab,
  clearScheduledSwitcherThumbnailCapture,
  shouldPreCaptureActiveSwitcherThumbnailBeforePayload,
  waitForSwitcherOpenCapture
} from './capture';
import { canHostSwitcherSurface, tabSwitcherHostTabIdByWindowId } from './host';
import { markSwitcherThumbnailPriorityForItems } from './thumbnail-priority';
import { advanceExistingTabSwitcherOnTab, injectTabSwitcherOnTab } from './inject';
import { beginTabSwitcherOpening, createTabSwitcherOpeningFinisher } from './opening';
import {
  armTabSwitcherShortcutReleaseObservers,
  getConfiguredTabSwitcherShortcuts,
  prepareShortcutKeyObserver,
  recordTabSwitcherShortcutDebug
} from './shortcut-release';
import { ensureTabSwitcherStateLoaded, getSwitcherThumbnailStateForPayload, recentTabTracker, recordRecentSwitcherTab, shouldTrackSwitcherTab } from './state-store';
import { TAB_SWITCHER_LIMIT, getErrorMessage } from './types';
import type { SwitchResult, SwitcherTab } from './types';
import { loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from '../favicon/request-policy';

function normalizeSwitcherTabForPayload(tab: SwitcherTab | null | undefined, currentTabId: number | undefined): TabSwitcherItem | null {
  if (!tab || typeof tab.id !== 'number') {
    return null;
  }
  const url = getResolvedTabUrl(tab);
  if (!url) {
    return null;
  }
  const thumbnailState = getSwitcherThumbnailStateForPayload({ ...tab, id: tab.id }, url);
  return {
    id: tab.id,
    windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
    url,
    title: String(tab.title || '').replace(/\s+/g, ' ').trim() || url,
    favIconUrl: buildSwitcherTabFavicon(tab, url),
    accentRgb: getSwitcherTabAccentRgb(tab, url),
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    current: typeof currentTabId === 'number' && tab.id === currentTabId,
    thumbnail: thumbnailState.dataUrl,
    thumbnailStatus: thumbnailState.status,
    thumbnailReason: thumbnailState.reason
  };
}

function getRecentTabsForSwitcher(
  tabList: readonly chrome.tabs.Tab[],
  currentTabId: number | undefined,
  windowId: number | undefined
): TabSwitcherItem[] {
  const normalizedTabs = (Array.isArray(tabList) ? tabList : [])
    .filter((tab) => !workerSettings.get(tabSwitcherCurrentWindowOnly) || (tab && tab.windowId === windowId))
    .map((tab) => ({
      ...tab,
      url: getResolvedTabUrl(tab)
    }))
    .filter(shouldTrackSwitcherTab);
  return recentTabTracker
    .getRecentTabs(normalizedTabs, { limit: TAB_SWITCHER_LIMIT })
    .map((tab) => normalizeSwitcherTabForPayload(tab, currentTabId))
    .filter((item): item is TabSwitcherItem => item !== null);
}

function focusWindowAndActivateTab(
  tabId: number,
  windowId: number | null | undefined,
  callback?: (result: SwitchResult) => void
): void {
  const run = (resolvedWindowId: number | null | undefined): void => {
    RECENT_TAB_SWITCHER.focusWindowAndActivateTab(chrome, {
      tabId,
      windowId: typeof resolvedWindowId === 'number' ? resolvedWindowId : null
    })
      .then((result) => {
        if (result && result.ok && typeof tabId === 'number') {
          recordTabSwitchEvent(tabId);
        }
        if (typeof callback === 'function') {
          callback(result || { ok: false });
        }
      })
      .catch((error: unknown) => {
        if (typeof callback === 'function') {
          callback({
            ok: false,
            tabId,
            windowId: typeof resolvedWindowId === 'number' ? resolvedWindowId : null,
            reason: getErrorMessage(error, 'switch-failed')
          });
        }
      });
  };
  if (typeof windowId === 'number' ||
      !chrome ||
      !chrome.tabs ||
      typeof chrome.tabs.get !== 'function') {
    run(windowId);
    return;
  }
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      run(null);
      return;
    }
    run(tab && typeof tab.windowId === 'number' ? tab.windowId : null);
  });
}

// One press of the switcher command.
interface SwitcherCommand {
  tab: chrome.tabs.Tab;
  tabId: number;
  windowId: number | null;
  source: string;
  offset: SwitcherOffset;
  reverse: boolean;
  // When the command was observed, so only a release after it commits.
  commandStartedAt: number;
  shortcutObserverReady: Promise<boolean>;
}

// A switcher being opened: the tab that will host it, and how opening ends.
interface SwitcherOpenRun {
  hostTabId: number;
  finish(ok?: boolean): void;
}

// What opening the switcher works from.
interface SwitcherOpenContext {
  tabList: chrome.tabs.Tab[];
  activeTab: chrome.tabs.Tab;
  shortcut: string;
}

function triggerTabSwitcherForTab(
  tab: chrome.tabs.Tab | null | undefined,
  source: string,
  commandObservedAt?: number,
  direction?: SwitcherOffset
): void {
  if (!areBackgroundSettingsLoaded()) {
    whenBackgroundSettingsReady(() => {
      triggerTabSwitcherForTab(tab, source, commandObservedAt, direction);
    });
    return;
  }
  const offset = direction === -1 ? -1 : 1;
  const observedAt = Number(commandObservedAt);
  if (!workerSettings.get(tabSwitcherEnabled)) {
    if (tab && typeof tab.windowId === 'number') {
      tabSwitcherHostTabIdByWindowId.delete(tab.windowId);
    }
    logHotkeyDebug('tab-switcher-disabled', { source: source || '' });
    return;
  }
  if (!tab || typeof tab.id !== 'number') {
    logHotkeyDebug('tab-switcher-no-active-tab', { source: source || '' });
    openNewtabFallback();
    return;
  }
  const windowId = typeof tab.windowId === 'number' ? tab.windowId : null;
  recordTabSwitcherShortcutDebug('command-received', { source: String(source || ''), tabId: tab.id, windowId });
  const command: SwitcherCommand = {
    tab,
    tabId: tab.id,
    windowId,
    source,
    offset,
    reverse: offset < 0,
    commandStartedAt: Number.isFinite(observedAt) && observedAt > 0 ? observedAt : Date.now(),
    // A manifest content script is not retroactively installed into tabs
    // that were already open when a development extension was reloaded.
    // Start the trusted keyup observer before any async switcher work so a
    // quick physical modifier release can be buffered and replayed after
    // the panel opens.
    shortcutObserverReady: prepareShortcutKeyObserver(tab)
  };
  clearScheduledSwitcherThumbnailCapture(tab.id);
  advanceExistingTabSwitcherOnTab(tab, source, offset, (didAdvance) => {
    if (!didAdvance) {
      openTabSwitcher(command);
      return;
    }
    if (typeof windowId === 'number') {
      tabSwitcherHostTabIdByWindowId.set(windowId, command.tabId);
    }
    recordTabSwitcherShortcutDebug('command-advanced', { tabId: command.tabId, windowId });
  });
}

// Claims the window's opening guard; null while another opening holds it.
function startSwitcherOpening(command: SwitcherCommand): SwitcherOpenRun | null {
  const opening = beginTabSwitcherOpening(command.tab, command.source);
  if (!opening) {
    return null;
  }
  const { windowId } = command;
  const finishOpeningGuard = createTabSwitcherOpeningFinisher(opening);
  const run: SwitcherOpenRun = {
    hostTabId: command.tabId,
    finish(ok) {
      finishOpeningGuard();
      if (ok === true) {
        if (typeof windowId === 'number') {
          tabSwitcherHostTabIdByWindowId.set(windowId, run.hostTabId);
        }
        recordTabSwitcherShortcutDebug('switcher-opened', { windowId, hostTabId: run.hostTabId });
        return;
      }
      if (typeof windowId === 'number' && tabSwitcherHostTabIdByWindowId.get(windowId) === run.hostTabId) {
        tabSwitcherHostTabIdByWindowId.delete(windowId);
      }
      recordTabSwitcherShortcutDebug('switcher-open-failed', { windowId });
    }
  };
  return run;
}

function openTabSwitcher(command: SwitcherCommand): void {
  const run = startSwitcherOpening(command);
  if (!run) {
    return;
  }
  readSwitcherOpenContext(command)
    .then((context) => (context ? showTabSwitcher(command, run, context) : run.finish()))
    .catch(() => run.finish());
}

// The open tabs, the shortcut and the switcher's stored state; null when
// the tabs cannot be listed. Also records the current tab and, when worth
// it, waits briefly for a fresh thumbnail of it.
function readSwitcherOpenContext(command: SwitcherCommand): Promise<SwitcherOpenContext | null> {
  const startupStateReady = Promise.all([
    ensureTabSwitcherStateLoaded(),
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).catch(() => {}); // Each loader falls back to its default; open regardless.
  const shortcutReady = new Promise<string>((resolve) => {
    getConfiguredTabSwitcherShortcuts((shortcuts) => {
      resolve(command.reverse && shortcuts.reverse ? shortcuts.reverse : shortcuts.forward);
    });
  });
  const tabQueryReady = new Promise<{ error: string; tabs: chrome.tabs.Tab[] }>((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;
      resolve({ error: lastError ? lastError.message || 'unknown' : '', tabs: Array.isArray(tabs) ? tabs : [] });
    });
  });
  return Promise.all([startupStateReady, tabQueryReady, shortcutReady, command.shortcutObserverReady]).then((results) => {
    const tabQuery = results[1] || { error: 'unknown', tabs: [] };
    const shortcut = typeof results[2] === 'string' && results[2] ? results[2] : 'Alt+Q';
    recordTabSwitcherShortcutDebug('shortcut-configured', {
      windowId: command.windowId,
      shortcut,
      releaseKeys: RECENT_TAB_SWITCHER.getShortcutReleaseEventKeys(shortcut)
    });
    if (tabQuery.error) {
      logHotkeyDebug('tab-switcher-query-failed', { source: command.source || '', error: tabQuery.error });
      return null;
    }
    const tabList = tabQuery.tabs;
    const activeTab = tabList.find((item) => item && item.id === command.tabId) || command.tab;
    clearScheduledSwitcherThumbnailCapture(activeTab.id);
    let openCaptureReady: Promise<boolean> = Promise.resolve(false);
    if (shouldTrackSwitcherTab(activeTab)) {
      recordRecentSwitcherTab(activeTab);
      if (shouldPreCaptureActiveSwitcherThumbnailBeforePayload(activeTab)) {
        // A capture that finishes after the switcher opened is patched in.
        openCaptureReady = captureSwitcherThumbnailForTab(activeTab, TAB_SWITCHER_CAPTURE_REASON_COMMAND_IMMEDIATE)
          .catch(() => false);
      }
    }
    return waitForSwitcherOpenCapture(openCaptureReady).then(() => ({ tabList, activeTab, shortcut }));
  });
}

// The current tab when it can show the switcher, else the most recent
// listed tab that can.
function findSwitcherHostTab(
  items: readonly TabSwitcherItem[],
  tabList: readonly chrome.tabs.Tab[],
  activeTab: chrome.tabs.Tab
): chrome.tabs.Tab | null {
  if (canHostSwitcherSurface(activeTab)) {
    return activeTab;
  }
  const hostItem = items.find((item) => {
    const candidate = tabList.find((tabItem) => tabItem && tabItem.id === item.id) || item;
    return item && item.id !== activeTab.id && canHostSwitcherSurface(candidate);
  });
  return hostItem ? tabList.find((item) => item && item.id === hostItem.id) || null : null;
}

function showTabSwitcher(command: SwitcherCommand, run: SwitcherOpenRun, context: SwitcherOpenContext): void {
  const { tabList, activeTab, shortcut } = context;
  const items = getRecentTabsForSwitcher(tabList, activeTab.id, activeTab.windowId);
  markSwitcherThumbnailPriorityForItems(items, tabList, 'command-payload');
  if (!items.length) {
    run.finish();
    return;
  }
  const hostTab = findSwitcherHostTab(items, tabList, activeTab);
  if (!hostTab || typeof hostTab.id !== 'number') {
    openNewtabFallbackForUrl(getResolvedTabUrl(activeTab), { sourceTab: activeTab });
    run.finish();
    return;
  }
  run.hostTabId = hostTab.id;
  const inject = (): void => injectTabSwitcherOnTab(hostTab, items, {
    currentTabId: typeof activeTab.id === 'number' ? activeTab.id : command.tabId,
    selectedIndex: getDefaultSwitcherSelectedIndex(items, activeTab.id, command.offset),
    shortcut,
    reverse: command.reverse,
    source: command.source,
    onOpenComplete(ok) {
      run.finish(ok);
      if (ok === true) {
        armTabSwitcherShortcutReleaseObservers(tabList, activeTab.windowId, shortcut, command.commandStartedAt, [activeTab.id, run.hostTabId]);
      }
    }
  });
  if (hostTab.id === activeTab.id) {
    inject();
    return;
  }
  focusWindowAndActivateTab(hostTab.id, hostTab.windowId, (result) => {
    if (!result || result.ok === false) {
      run.finish();
      return;
    }
    inject();
  });
}

export { focusWindowAndActivateTab, triggerTabSwitcherForTab };
