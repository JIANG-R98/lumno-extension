// Message handlers for the extension's own pages and the overlay: tab actions,
// shortcuts, locale messages and permissions, extension page navigation,
// favicons, and the toolbar popup. background.ts combines them with the feature
// handlers into one router.
//
// A module of the service worker; background.ts imports it before its own code
// runs.

import * as BOOKMARK_TAB_GROUPS from './bookmark-tab-groups';
import * as SHORTCUT_KEY_MATCHER from '../domain/shortcut-key-matcher';
import {
  getExtensionDetailsUrl,
  openBookmarkManagerPage,
  openExtensionOptionsPage,
  openExtensionShortcutsPage,
  openOnboardingPage,
  openReleasePage,
  openSiteSearchOptionsPage
} from './extension-pages';
import { getGraphicsSettingsUrl, refreshGraphicsProbe } from './graphics-probe';
import { checkFileSchemeAccess, swapNewtabForFocus } from './newtab-fallback';
import { SHOW_SEARCH_COMMAND_NAME, loadLocaleMessages, loadShortcutRules, logHotkeyDebug } from './worker-context';
import {
  isProgressTrackingEnabled,
  pageShortcutMenuController,
  popupRecentPin,
  progressTracker
} from './worker-controllers';
import {
  focusWindowAndActivateTab,
  handleTabSwitcherShortcutModifierReleased
} from './tab-switcher-service';
import {
  fetchFaviconData,
  fetchShortcutFaviconData,
  isBlockedLocalFaviconUrl,
  loadFaviconRequestBlacklistItems,
  logBlockedLocalFavicon,
  resolveFaviconCandidates,
  resolveSiteThemeColor,
  shouldBlockFaviconForHost
} from './favicon-service';
import { markPendingSearchTab } from './search-suggestions-service';
import {
  createSearchResultTab,
  createTabWithSourceGroup,
  getResolvedTabUrl,
  isBrowserNewtabUrl,
  isLumnoNewtabUrl
} from './browser-urls-service';
import {
  createOverlayTabPayload,
  ensureTabSwitchStatsLoaded,
  recordTabSwitchEvent,
  sortTabsForOverlay,
  syncTabSwitchStatsFromTabList
} from './tab-switch-stats-service';
import {
  clearOverlayLoadingRecord,
  recoverOverlayAfterTopFrameDocumentStart,
  updateOverlayLoadingSessionFromMessage
} from './overlay-loading-service';
import { nextTabOverlayFetchSeq } from './overlay-open-service';
import {
  getConfiguredCopyUrlCommandShortcut,
  getConfiguredFallbackShortcut,
  rememberPageHotkeyContext,
  requestFocusVisibleNewtabInput,
  triggerCopyCurrentUrlForTab,
  triggerShowSearchForTab
} from './command-service';
import { openDocumentPipPickerOnTab } from './pip-service';
import type { HandlersFor } from './message-router';
import type { LocaleMessage, OpenDisposition } from '../domain/messages';

type TabAction =
  | 'swapNewtabForFocus' | 'switchToTab' | 'closeTabFromTabSwitcher' | 'notifyOverlayClosed'
  | 'notifyTopFrameDocumentStarted' | 'updateOverlayLoadingSession' | 'getTabsForOverlay' | 'trackSearchTab'
  | 'closeOtherTabsForOverlay';
type ShortcutAction =
  | 'getShowSearchShortcut' | 'getCopyCurrentUrlCommandShortcut' | 'copyCurrentPageUrl'
  | 'triggerShowSearchFromPageHotkey' | 'notifyTabSwitcherShortcutModifierReleased' | 'getShortcutRules';
type LocaleAction = 'getLocaleMessages' | 'getFileSchemeAccessStatus';
type ExtensionPageAction =
  | 'probeProgressSeries' | 'openOptionsPage' | 'openOnboardingPage' | 'openReleasePage'
  | 'openExtensionShortcutsPage' | 'openSiteSearchOptionsPage' | 'openBookmarkManager'
  | 'openBookmarkFolderInNewTabGroup' | 'createTab' | 'openNewTab' | 'openExtensionDetailsPage'
  | 'checkGraphicsRendering' | 'openGraphicsSettings';
type FaviconAction = 'resolveFaviconCandidates' | 'getFaviconData' | 'getShortcutFaviconData' | 'resolveSiteThemeColor';
type PopupAction =
  | 'popupOpenDocumentPipPicker' | 'popupShowSearch' | 'popupShowPageToast' | 'popupAddPageShortcut'
  | 'popupGetRecentPin' | 'popupToggleRecentPin';

function readDisposition(value: unknown): OpenDisposition | undefined {
  return value === 'currentTab' || value === 'newTab' || value === 'backgroundTab' ? value : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// The keys a page saw pressed, with only the fields of the expected types.
function readKeyDescriptor(value: unknown): Partial<SHORTCUT_KEY_MATCHER.KeyDescriptor> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const fields: object = value;
  const descriptor: Partial<SHORTCUT_KEY_MATCHER.KeyDescriptor> = {};
  if ('ctrlKey' in fields && typeof fields.ctrlKey === 'boolean') descriptor.ctrlKey = fields.ctrlKey;
  if ('altKey' in fields && typeof fields.altKey === 'boolean') descriptor.altKey = fields.altKey;
  if ('shiftKey' in fields && typeof fields.shiftKey === 'boolean') descriptor.shiftKey = fields.shiftKey;
  if ('metaKey' in fields && typeof fields.metaKey === 'boolean') descriptor.metaKey = fields.metaKey;
  if ('key' in fields && typeof fields.key === 'string') descriptor.key = fields.key;
  return descriptor;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Tabs, overlay lifecycle and tab visibility.
export const TAB_MESSAGE_HANDLERS: HandlersFor<TabAction> = Object.freeze({
  swapNewtabForFocus(request, sender, sendResponse) {
    swapNewtabForFocus(sender && sender.tab ? sender.tab : null, sender && sender.url, (result) => {
      sendResponse(result);
    });
    return true;
  },
  switchToTab(request, sender, sendResponse) {
    const tabId = request.tabId;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, reason: 'invalid-tab' });
      return;
    }
    recordTabSwitchEvent(tabId);
    focusWindowAndActivateTab(
      tabId,
      typeof request.windowId === 'number' ? request.windowId : null,
      (result) => {
        sendResponse(result || { ok: false });
      }
    );
    return true;
  },
  closeTabFromTabSwitcher(request, sender, sendResponse) {
    const tabId = request ? request.tabId : null;
    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, reason: 'invalid-tab' });
      return;
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        sendResponse({ ok: false, reason: 'tab-missing' });
        return;
      }
      // The switcher never lists incognito tabs, so it never closes one.
      if (tab.incognito === true) {
        sendResponse({ ok: false, reason: 'tab-not-allowed' });
        return;
      }
      chrome.tabs.remove(tabId, () => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          sendResponse({ ok: false, reason: lastError.message || 'remove-failed' });
          return;
        }
        sendResponse({ ok: true });
      });
    });
    return true;
  },
  notifyOverlayClosed(request, sender, sendResponse) {
    const senderTab = sender && sender.tab ? sender.tab : null;
    if (senderTab && typeof senderTab.id === 'number') {
      clearOverlayLoadingRecord(senderTab.id);
    }
    sendResponse({ ok: true });
    return;
  },
  notifyTopFrameDocumentStarted(request, sender, sendResponse) {
    const accepted = recoverOverlayAfterTopFrameDocumentStart(request, sender);
    sendResponse({ ok: accepted });
    return;
  },
  updateOverlayLoadingSession(request, sender, sendResponse) {
    updateOverlayLoadingSessionFromMessage(request, sender, sendResponse);
    return true;
  },
  getTabsForOverlay(request, sender, sendResponse) {
    ensureTabSwitchStatsLoaded()
      .catch(() => {}) // Settles even when storage fails; list tabs regardless.
      .finally(() => {
        const requestedCurrentTabId = Number.isFinite(Number(request && request.currentTabId))
          ? Number(request.currentTabId)
          : null;
        const currentTabId = sender && sender.tab && typeof sender.tab.id === 'number'
          ? sender.tab.id
          : requestedCurrentTabId;
        chrome.tabs.query({}, (tabs) => {
          const normalizedTabs = (Array.isArray(tabs) ? tabs : [])
            .filter((tab): tab is chrome.tabs.Tab & { id: number } => Boolean(tab) && tab.incognito !== true && typeof tab.id === 'number')
            .map((tab) => {
              const resolvedUrl = getResolvedTabUrl(tab);
              return {
                id: tab.id,
                title: typeof tab.title === 'string' ? tab.title : '',
                url: resolvedUrl || '',
                favIconUrl: typeof tab.favIconUrl === 'string' ? tab.favIconUrl : '',
                lastAccessed: Number(tab.lastAccessed) || 0
              };
            });
          syncTabSwitchStatsFromTabList(normalizedTabs);
          const sortedTabs = sortTabsForOverlay(normalizedTabs);
          const fetchSeq = nextTabOverlayFetchSeq();
          const withSeq = sortedTabs.map((tab) => createOverlayTabPayload(tab, fetchSeq));
          sendResponse({ tabs: withSeq, currentTabId: currentTabId });
        });
      });
    return true;
  },
  trackSearchTab(request, sender, sendResponse) {
    if (typeof request.tabId === 'number') {
      markPendingSearchTab(request.tabId, sender && sender.tab ? sender.tab : null);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
    return true;
  },
  closeOtherTabsForOverlay(request, sender, sendResponse) {
    const senderTab = sender && sender.tab ? sender.tab : null;
    if (!senderTab || typeof senderTab.id !== 'number' || typeof senderTab.windowId !== 'number') {
      sendResponse({ ok: false, reason: 'invalid-sender' });
      return;
    }
    const senderTabId = senderTab.id;
    chrome.tabs.query({ windowId: senderTab.windowId }, (tabs) => {
      const queryError = chrome.runtime && chrome.runtime.lastError;
      if (queryError) {
        sendResponse({ ok: false, reason: queryError.message || 'query-failed' });
        return;
      }
      const ungroupedId = chrome && chrome.tabGroups && typeof chrome.tabGroups.TAB_GROUP_ID_NONE === 'number'
        ? chrome.tabGroups.TAB_GROUP_ID_NONE
        : -1;
      const toCloseIds = (Array.isArray(tabs) ? tabs : [])
        .filter((tab): tab is chrome.tabs.Tab & { id: number } => {
          if (!tab || typeof tab.id !== 'number') {
            return false;
          }
          if (tab.id === senderTabId) {
            return false;
          }
          if (tab.pinned) {
            return false;
          }
          if (typeof tab.groupId === 'number' && tab.groupId !== ungroupedId) {
            return false;
          }
          return true;
        })
        .map((tab) => tab.id);
      if (toCloseIds.length <= 0) {
        sendResponse({ ok: true, closedCount: 0 });
        return;
      }
      chrome.tabs.remove(toCloseIds, () => {
        const removeError = chrome.runtime && chrome.runtime.lastError;
        if (removeError) {
          sendResponse({ ok: false, reason: removeError.message || 'remove-failed' });
          return;
        }
        sendResponse({ ok: true, closedCount: toCloseIds.length });
      });
    });
    return true;
  }
});

// Configured shortcuts and page hotkeys.
export const SHORTCUT_MESSAGE_HANDLERS: HandlersFor<ShortcutAction> = Object.freeze({
  getShowSearchShortcut(request, sender, sendResponse) {
    getConfiguredFallbackShortcut((shortcut) => {
      sendResponse({ shortcut: shortcut || '' });
    });
    return true;
  },
  getCopyCurrentUrlCommandShortcut(request, sender, sendResponse) {
    getConfiguredCopyUrlCommandShortcut((shortcut) => {
      sendResponse({ shortcut: shortcut || '' });
    });
    return true;
  },
  copyCurrentPageUrl(request, sender, sendResponse) {
    const senderTab = sender && sender.tab ? sender.tab : null;
    triggerCopyCurrentUrlForTab(senderTab, 'slash-command', (ok) => {
      sendResponse({ ok: Boolean(ok) });
    });
    return true;
  },
  // Zen's empty state is a hidden about:blank tab that extensions cannot see, so
  // its messages arrive without sender.tab. The page has already taken the key
  // from the browser command, so it gets the command's no-tab fallback here.
  triggerShowSearchFromPageHotkey(request, sender, sendResponse) {
    const senderTab = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab : null;
    const triggerVerifiedPageHotkey = (shortcut: string): void => {
      const shouldPrefillCurrentUrl = Boolean(request && request.prefillCurrentUrl);
      const triggerSource = shouldPrefillCurrentUrl ? 'page-hotkey-prefill' : 'page-hotkey';
      logHotkeyDebug('received', {
        command: SHOW_SEARCH_COMMAND_NAME,
        source: triggerSource,
        tabId: senderTab ? senderTab.id : null,
        url: senderTab ? senderTab.url || '' : '',
        pendingUrl: senderTab ? senderTab.pendingUrl || '' : '',
        prefillCurrentUrl: shouldPrefillCurrentUrl,
        verifiedAfterColdStart: Boolean(request && request.requiresShortcutVerification)
      });
      if (senderTab) {
        rememberPageHotkeyContext(senderTab);
      }
      triggerShowSearchForTab(senderTab, triggerSource);
      sendResponse({ ok: true, shortcut: shortcut || '' });
    };
    if (request && request.requiresShortcutVerification === true) {
      getConfiguredFallbackShortcut((shortcut) => {
        const spec = SHORTCUT_KEY_MATCHER.parseShortcut(shortcut);
        const matched = SHORTCUT_KEY_MATCHER.descriptorMatchesShortcut(readKeyDescriptor(request.observedShortcut), spec);
        if (!matched) {
          sendResponse({ ok: false, reason: 'shortcut-mismatch', shortcut: shortcut || '' });
          return;
        }
        triggerVerifiedPageHotkey(shortcut);
      });
      return true;
    }
    triggerVerifiedPageHotkey('');
    return;
  },
  notifyTabSwitcherShortcutModifierReleased(request, sender, sendResponse) {
    const senderTab = sender && sender.tab ? sender.tab : null;
    handleTabSwitcherShortcutModifierReleased(senderTab, request.key, (didCommit) => {
      sendResponse({ ok: true, committed: didCommit === true });
    });
    return true;
  },
  getShortcutRules(request, sender, sendResponse) {
    loadShortcutRules().then((items) => {
      sendResponse({ items: items });
    });
    return true;
  }
});

// A page script that names the few strings it shows gets only those.
function pickLocaleMessages(messages: Record<string, LocaleMessage>, keys: unknown): Record<string, LocaleMessage> {
  if (!Array.isArray(keys)) {
    return messages;
  }
  const picked: Record<string, LocaleMessage> = {};
  const keyList: unknown[] = keys;
  keyList.forEach((key) => {
    if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(messages, key)) {
      picked[key] = messages[key];
    }
  });
  return picked;
}

// Locale messages and permission probes.
export const LOCALE_AND_PERMISSION_MESSAGE_HANDLERS: HandlersFor<LocaleAction> = Object.freeze({
  getLocaleMessages(request, sender, sendResponse) {
    void loadLocaleMessages(request.locale).then((messages) => {
      sendResponse({ messages: pickLocaleMessages(messages, request.keys) });
    });
    return true;
  },
  getFileSchemeAccessStatus(request, sender, sendResponse) {
    checkFileSchemeAccess((isAllowed) => {
      sendResponse({
        ok: true,
        allowed: isAllowed === true,
        supported: isAllowed !== null,
        detailsUrl: getExtensionDetailsUrl()
      });
    });
    return true;
  }
});

// Extension pages, tab creation and progress probes.
export const EXTENSION_PAGE_MESSAGE_HANDLERS: HandlersFor<ExtensionPageAction> = Object.freeze({
  probeProgressSeries(request, sender, sendResponse) {
    // Pinning from New Tab: does the open page read as an episode or chapter?
    if (!isProgressTrackingEnabled()) {
      sendResponse({ ok: true, series: false });
      return false;
    }
    progressTracker.probeSeries(String(request.url || '')).then((series) => {
      sendResponse({ ok: true, series: series === true });
    }, () => sendResponse({ ok: false, series: false }));
    return true;
  },
  openOptionsPage(request, sender, sendResponse) {
    openExtensionOptionsPage({ disposition: readDisposition(request.disposition), hash: readString(request.hash) }, (ok) => {
      sendResponse({ ok: ok !== false });
    });
    return true;
  },
  openOnboardingPage(request, sender, sendResponse) {
    openOnboardingPage({ reason: 'manual', disposition: readDisposition(request.disposition) }, (ok) => {
      sendResponse({ ok: ok !== false });
    });
    return true;
  },
  openReleasePage(request, sender, sendResponse) {
    const reason = typeof request.reason === 'string' ? request.reason : 'manual';
    openReleasePage({ reason, disposition: readDisposition(request.disposition) }, (ok) => {
      sendResponse({ ok: ok !== false });
    });
    return true;
  },
  openExtensionShortcutsPage(request, sender, sendResponse) {
    openExtensionShortcutsPage({ disposition: readDisposition(request.disposition) }, (ok) => {
      sendResponse({ ok: ok !== false });
    });
    return true;
  },
  openSiteSearchOptionsPage(request, sender, sendResponse) {
    openSiteSearchOptionsPage({ disposition: readDisposition(request.disposition) }, (ok) => {
      sendResponse({ ok: ok !== false });
    });
    return true;
  },
  openBookmarkManager(request, sender, sendResponse) {
    openBookmarkManagerPage().then((url) => {
      sendResponse({ ok: true, url: url });
    }).catch(() => {
      sendResponse({ ok: false });
    });
    return true;
  },
  openBookmarkFolderInNewTabGroup(request, sender, sendResponse) {
    const sourceTab = sender && sender.tab ? sender.tab : null;
    BOOKMARK_TAB_GROUPS.openBookmarkFolderInNewTabGroup(chrome, {
      folderId: request.folderId,
      title: request.title,
      windowId: sourceTab && typeof sourceTab.windowId === 'number'
        ? sourceTab.windowId
        : undefined,
      insertIndex: sourceTab && typeof sourceTab.index === 'number'
        ? sourceTab.index + 1
        : undefined
    }).then(sendResponse).catch((error: unknown) => {
      sendResponse({
        ok: false,
        reason: getErrorMessage(error, 'bookmark-tab-group-failed')
      });
    });
    return true;
  },
  createTab(request, sender, sendResponse) {
    const targetUrl = typeof request.url === 'string' ? request.url : '';
    const sourceTab = sender && sender.tab ? sender.tab : null;
    if (!targetUrl) {
      sendResponse({ ok: false });
      return;
    }
    if (request.disposition === 'currentTab') {
      const senderTabId = sender && sender.tab && typeof sender.tab.id === 'number'
        ? sender.tab.id
        : null;
      const updateTab = (tabId: number): void => {
        chrome.tabs.update(tabId, { url: targetUrl, active: true }, () => {
          sendResponse({ ok: !(chrome.runtime && chrome.runtime.lastError) });
        });
      };
      if (typeof senderTabId === 'number') {
        updateTab(senderTabId);
        return true;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = Array.isArray(tabs) && tabs.length > 0 ? tabs[0] : null;
        if (activeTab && typeof activeTab.id === 'number') {
          updateTab(activeTab.id);
          return;
        }
        sendResponse({ ok: false });
      });
      return true;
    }
    createSearchResultTab({ url: targetUrl, active: request.disposition !== 'backgroundTab' }, sourceTab, (_tab, info) => {
      sendResponse({ ok: Boolean(info && info.ok) });
    });
    return true;
  },
  openNewTab(request, sender, sendResponse) {
    createTabWithSourceGroup({
      active: request.disposition !== 'backgroundTab'
    }, sender && sender.tab ? sender.tab : null, (_tab, info) => {
      sendResponse({ ok: Boolean(info && info.ok) });
    });
    return true;
  },
  openExtensionDetailsPage(request, sender, sendResponse) {
    const detailsUrl = getExtensionDetailsUrl();
    createTabWithSourceGroup({
      url: detailsUrl,
      active: request.disposition !== 'backgroundTab'
    }, sender && sender.tab ? sender.tab : null, (_tab, info) => {
      sendResponse({ ok: Boolean(info && info.ok), url: detailsUrl });
    });
    return true;
  },
  checkGraphicsRendering(request, sender, sendResponse) {
    refreshGraphicsProbe().then((rendering) => {
      sendResponse({ rendering });
    });
    return true;
  },
  openGraphicsSettings(request, sender, sendResponse) {
    createTabWithSourceGroup({
      url: getGraphicsSettingsUrl(),
      active: request.disposition !== 'backgroundTab'
    }, sender && sender.tab ? sender.tab : null, (_tab, info) => {
      sendResponse({ ok: Boolean(info && info.ok) });
    });
    return true;
  }
});

// Favicons and site theme colors.
export const FAVICON_MESSAGE_HANDLERS: HandlersFor<FaviconAction> = Object.freeze({
  resolveFaviconCandidates(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const hostOverride = request.host || '';
    const fallbackUrl = request.fallbackUrl || '';
    resolveFaviconCandidates(targetUrl, hostOverride, fallbackUrl).then((urls) => {
      sendResponse({ urls: Array.isArray(urls) ? urls : [] });
    }).catch(() => {
      sendResponse({ urls: [] });
    });
    return true;
  },
  getFaviconData(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const pageUrl = request.pageUrl || '';
    if (!targetUrl || typeof targetUrl !== 'string' || targetUrl.startsWith('data:')) {
      sendResponse({ data: '' });
      return;
    }
    loadFaviconRequestBlacklistItems().then(() => {
      if (isBlockedLocalFaviconUrl(targetUrl)) {
        logBlockedLocalFavicon(targetUrl, 'message:getFaviconData');
        sendResponse({ data: '' });
        return;
      }
      try {
        const targetHost = new URL(targetUrl).hostname;
        if (shouldBlockFaviconForHost(targetHost)) {
          sendResponse({ data: '' });
          return;
        }
      } catch (_error) {
        // Ignore parse failures and continue with non-local handling.
      }
      fetchFaviconData(targetUrl, pageUrl).then((dataUrl) => {
        sendResponse({ data: dataUrl || '' });
      }).catch(() => {
        sendResponse({ data: '' });
      });
    }).catch(() => {
      sendResponse({ data: '' });
    });
    return true;
  },
  getShortcutFaviconData(request, sender, sendResponse) {
    const pageUrl = request.pageUrl || '';
    const preferredTheme = request.preferredTheme || '';
    fetchShortcutFaviconData(pageUrl, preferredTheme, '', request.refresh === true, request.iconSource).then((result) => {
      sendResponse(result || {
        data: '',
        sourceUrl: '',
        width: 0,
        height: 0,
        vector: false
      });
    }).catch(() => {
      sendResponse({
        data: '',
        sourceUrl: '',
        width: 0,
        height: 0,
        vector: false
      });
    });
    return true;
  },
  resolveSiteThemeColor(request, sender, sendResponse) {
    const targetUrl = request.url || '';
    const hostOverride = request.host || '';
    const preferredTheme = request.preferredTheme || '';
    resolveSiteThemeColor(targetUrl, hostOverride, preferredTheme).then((result) => {
      sendResponse(result || { accentRgb: null, source: '' });
    }).catch(() => {
      sendResponse({ accentRgb: null, source: '' });
    });
    return true;
  }
});

// The tab a toolbar popup action works on. The popup names the tab it showed;
// a tab that has gone since resolves to null.
function getPopupTargetTab(tabId: unknown, callback: (tab: chrome.tabs.Tab | null) => void): void {
  if (typeof tabId !== 'number' || !chrome.tabs || typeof chrome.tabs.get !== 'function') {
    callback(null);
    return;
  }
  chrome.tabs.get(tabId, (tab) => {
    callback(chrome.runtime.lastError || !tab ? null : tab);
  });
}

function getPopupPage(tab: chrome.tabs.Tab | null): { url: string; title: string } | null {
  return tab ? { url: String(tab.url || tab.pendingUrl || ''), title: String(tab.title || '') } : null;
}

// The toolbar popup's page actions. The popup closes once the clip or the
// search starts, so those answer first and then act on the tab. A finished
// copy or add is announced by Lumno's top toast in the page.
export const POPUP_MESSAGE_HANDLERS: HandlersFor<PopupAction> = Object.freeze({
  popupOpenDocumentPipPicker(request, sender, sendResponse) {
    getPopupTargetTab(request.tabId, (tab) => {
      sendResponse({ ok: Boolean(tab) });
      if (tab) {
        void openDocumentPipPickerOnTab(tab, 'popup');
      }
    });
    return true;
  },
  popupShowSearch(request, sender, sendResponse) {
    getPopupTargetTab(request.tabId, (tab) => {
      sendResponse({ ok: Boolean(tab) });
      if (!tab) {
        return;
      }
      // A New Tab already has a search box; the shortcut focuses it as well.
      const tabUrl = getResolvedTabUrl(tab);
      if (isLumnoNewtabUrl(tabUrl) || isBrowserNewtabUrl(tabUrl)) {
        requestFocusVisibleNewtabInput('popup', tab.id);
        return;
      }
      triggerShowSearchForTab(tab, 'popup');
    });
    return true;
  },
  popupShowPageToast(request, sender, sendResponse) {
    const tabId = request.tabId;
    if (!pageShortcutMenuController || typeof tabId !== 'number') {
      sendResponse({ ok: false });
      return false;
    }
    const message = typeof request.message === 'string' ? request.message.slice(0, 200) : '';
    void pageShortcutMenuController.showToast(tabId, { message }).then((shown) => {
      sendResponse({ ok: shown === true });
    });
    return true;
  },
  popupAddPageShortcut(request, sender, sendResponse) {
    if (!pageShortcutMenuController) {
      sendResponse({ status: 'failed', message: '', error: true });
      return false;
    }
    const menu = pageShortcutMenuController;
    getPopupTargetTab(request.tabId, (tab) => {
      menu.addTabPage(tab).then(sendResponse, () => {
        sendResponse({ status: 'failed', message: '', error: true });
      });
    });
    return true;
  },
  popupGetRecentPin(request, sender, sendResponse) {
    getPopupTargetTab(request.tabId, (tab) => {
      popupRecentPin.getStatus(getPopupPage(tab)).then(sendResponse, () => {
        sendResponse({ available: false, pinned: false, full: false });
      });
    });
    return true;
  },
  popupToggleRecentPin(request, sender, sendResponse) {
    getPopupTargetTab(request.tabId, (tab) => {
      void popupRecentPin.toggle(getPopupPage(tab)).then(sendResponse);
    });
    return true;
  }
});
