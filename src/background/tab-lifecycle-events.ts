// The worker's tab and window listeners: what each tab and window event
// updates (switcher memory, overlay recovery, pinned tab snapshot, favicon
// marks, PiP ownership).
import { removeRecentSwitcherTab, scheduleSwitcherThumbnailCapture } from './tab-switcher/capture';
import { clearSwitcherThumbnailPriority } from './tab-switcher/thumbnail-priority';
import { tabSwitcherHostTabIdByWindowId } from './tab-switcher/host';
import {
  ensureTabSwitcherStateLoaded,
  recordRecentSwitcherTab,
  updateRecentSwitcherTab
} from './tab-switcher/state-store';
import { restorePinnedTabsFromSnapshotOnStartup, schedulePersistPinnedTabSnapshot } from './pinned-tab-recovery';
import { maybeAutoSelectRestrictedBrowserSetting } from './browser-urls-service';
import type { UrlTabLike } from './browser-urls-service';
import { clearTabSwitchStat, recordTabSwitchEvent } from './tab-switch-stats-service';
import { finishOverlayOpening, overlayOpeningByTabId } from './overlay-open-service';
import { pipOwnership } from './pip-service';
import { warnBackgroundFailure } from './worker-context';
import { clearOverlayLoadingRecord, clearOverlayNavigationState, rememberOverlayTopFrameNavigation, updateOverlayTopFrameNavigation } from './overlay-loading-records';
import { markOverlayLoadingRecordUnstable, recoverOverlayAfterLoadingUpdate } from './overlay-loading-service';
import { markFaviconDirtyForUrl } from './favicon/visit-dirty';

type TabChange = chrome.tabs.OnUpdatedInfo;

function changedUrl(changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): string {
  if (typeof changeInfo.url === 'string') {
    return changeInfo.url;
  }
  return tab && typeof tab.url === 'string' ? tab.url : '';
}

// The top frame's navigation, which the overlay's loading recovery follows.
function trackOverlayNavigation(tabId: number, changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): void {
  if (changeInfo.status === 'loading') {
    rememberOverlayTopFrameNavigation({
      tabId,
      frameId: 0,
      url: typeof changeInfo.url === 'string'
        ? changeInfo.url
        : (tab && typeof tab.pendingUrl === 'string' ? tab.pendingUrl : '')
    });
    markOverlayLoadingRecordUnstable(tabId);
  } else if (typeof changeInfo.url === 'string') {
    updateOverlayTopFrameNavigation({ tabId, frameId: 0, url: changeInfo.url });
  }
  recoverOverlayAfterLoadingUpdate(tabId, changeInfo, tab);
  if (changeInfo.status === 'complete') {
    clearOverlayNavigationState(tabId);
  }
}

function trackBrowserNewtabProvider(tabId: number, changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): void {
  if (typeof changeInfo.url !== 'string' && changeInfo.status !== 'complete') {
    return;
  }
  const providerTab: UrlTabLike = {
    id: tabId,
    url: typeof changeInfo.url === 'string' ? changeInfo.url : (tab ? tab.url : undefined),
    pendingUrl: tab ? tab.pendingUrl : undefined,
    status: changeInfo.status || (tab ? tab.status : undefined)
  };
  maybeAutoSelectRestrictedBrowserSetting(providerTab, changeInfo.status === 'complete' ? 'updated-complete' : 'updated');
}

// The tab switcher's memory of the tab.
function trackSwitcherTab(tabId: number, changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): void {
  if (typeof changeInfo.url === 'string') {
    // URL changed means the tab semantic target changed; reset historical switch stats.
    clearTabSwitchStat(tabId);
    pipOwnership.clearGlobalPipOwnerForTabId(tabId);
    clearSwitcherThumbnailPriority(tabId);
    updateRecentSwitcherTab(tab);
  }
  if (!tab || tab.active !== true) {
    return;
  }
  if (typeof changeInfo.title === 'string' || typeof changeInfo.favIconUrl === 'string') {
    updateRecentSwitcherTab(tab);
  }
  if (changeInfo.status === 'complete') {
    recordRecentSwitcherTab(tab);
    scheduleSwitcherThumbnailCapture(tab, 'updated-complete');
  }
}

// A new icon, or a page that finished without one, may mean the site's
// favicon changed.
function trackFaviconChange(changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): void {
  const newIcon = typeof changeInfo.favIconUrl === 'string' && Boolean(changeInfo.favIconUrl);
  const completedWithoutIcon = changeInfo.status === 'complete' && !(tab && tab.favIconUrl);
  if (newIcon || completedWithoutIcon) {
    markFaviconDirtyForUrl(changedUrl(changeInfo, tab));
  }
}

function handleTabUpdated(tabId: number, changeInfo: TabChange, tab: chrome.tabs.Tab | undefined): void {
  if (!changeInfo) {
    return;
  }
  trackOverlayNavigation(tabId, changeInfo, tab);
  trackBrowserNewtabProvider(tabId, changeInfo, tab);
  trackSwitcherTab(tabId, changeInfo, tab);
  if (changeInfo.pinned !== undefined || typeof changeInfo.url === 'string' || changeInfo.status === 'complete') {
    schedulePersistPinnedTabSnapshot();
  }
  trackFaviconChange(changeInfo, tab);
}

// The switcher remembers the tab the person is now looking at.
function rememberShownTab(tab: chrome.tabs.Tab, reason: string): void {
  ensureTabSwitcherStateLoaded().catch(() => {}).finally(() => {
    recordRecentSwitcherTab(tab);
    scheduleSwitcherThumbnailCapture(tab, reason);
  });
}

function handleTabActivated(activeInfo: chrome.tabs.OnActivatedInfo): void {
  if (!activeInfo || typeof activeInfo.tabId !== 'number') {
    return;
  }
  recordTabSwitchEvent(activeInfo.tabId);
  if (chrome.tabs && typeof chrome.tabs.get === 'function') {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (!(chrome.runtime && chrome.runtime.lastError)) {
        rememberShownTab(tab, 'activated');
      }
    });
  }
}

function handleWindowFocusChanged(windowId: number): void {
  if (typeof windowId !== 'number' ||
      windowId === chrome.windows.WINDOW_ID_NONE ||
      !chrome.tabs ||
      typeof chrome.tabs.query !== 'function') {
    return;
  }
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      return;
    }
    const tab = Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null;
    if (tab && typeof tab.id === 'number') {
      rememberShownTab(tab, 'window-focus');
    }
  });
}

function handleTabRemoved(tabId: number, removeInfo: chrome.tabs.OnRemovedInfo): void {
  const overlayOpening = overlayOpeningByTabId.get(tabId);
  if (overlayOpening) {
    finishOverlayOpening(overlayOpening);
  }
  clearOverlayNavigationState(tabId);
  clearOverlayLoadingRecord(tabId);
  clearTabSwitchStat(tabId);
  removeRecentSwitcherTab(tabId);
  pipOwnership.clearGlobalPipOwnerForTabId(tabId);
  Array.from(tabSwitcherHostTabIdByWindowId.entries()).forEach(([windowId, hostTabId]) => {
    if (hostTabId === tabId) {
      tabSwitcherHostTabIdByWindowId.delete(windowId);
    }
  });
  if (removeInfo && removeInfo.isWindowClosing) {
    return;
  }
  schedulePersistPinnedTabSnapshot();
}

// A new normal window gets the pinned tabs the last session had.
function handleWindowCreated(windowInfo: chrome.windows.Window): void {
  if (windowInfo && (windowInfo.incognito === true || (windowInfo.type && windowInfo.type !== 'normal'))) {
    return;
  }
  restorePinnedTabsFromSnapshotOnStartup().catch(warnBackgroundFailure('Failed to restore pinned tabs.')).finally(() => {
    schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
  });
}

function handleWindowRemoved(windowId: number): void {
  tabSwitcherHostTabIdByWindowId.delete(windowId);
  schedulePersistPinnedTabSnapshot({ skipEmptyWhenNoNormalWindows: true });
}

function registerTabLifecycleEvents(): void {
  const tabs = chrome && chrome.tabs;
  const windows = chrome && chrome.windows;
  if (tabs) {
    tabs.onActivated?.addListener(handleTabActivated);
  }
  if (windows) {
    windows.onFocusChanged?.addListener(handleWindowFocusChanged);
  }
  if (tabs) {
    tabs.onRemoved?.addListener(handleTabRemoved);
    tabs.onUpdated?.addListener(handleTabUpdated);
    tabs.onMoved?.addListener(() => {
      schedulePersistPinnedTabSnapshot();
    });
  }
  if (windows) {
    windows.onCreated?.addListener(handleWindowCreated);
    windows.onRemoved?.addListener(handleWindowRemoved);
  }
}

export { registerTabLifecycleEvents };
