// The tab hosting an open switcher: messages to it (or the same work run in
// the page when it does not answer), and finding it in a window.
import {
  getFailedOpenTabSwitcherState,
  normalizeOpenTabSwitcherStateResponse,
  normalizeOpenTabSwitcherStateScriptResults,
  normalizeTabSwitcherCommitResponse,
  normalizeTabSwitcherCommitScriptResults,
  normalizeTabSwitcherHostOkResponse,
  normalizeTabSwitcherHostOkScriptResults
} from '../../domain/tab-switcher-model';
import type { OpenSwitcherState } from '../../domain/tab-switcher-model';
import type { PageRequest, TabSwitcherThumbnailUpdate } from '../../domain/messages';
import * as LumnoMessaging from '../../platform/messaging';
import { canOpenOverlayOnUrl, getResolvedTabUrl, isBrowserNewtabUrl, isOwnExtensionPageUrl } from '../browser-urls-service';
import {
  hasTabSwitcherExtensionPagePort,
  isTabSwitcherExtensionPageMessageTarget,
  postTabSwitcherMessageToExtensionPage
} from '../tab-switcher-extension-page';
import type { HostAction } from '../tab-switcher-extension-page';
import {
  commitOpenTabSwitcherFromShortcutReleaseInPage,
  getOpenTabSwitcherStateInPage,
  setTabSwitcherCaptureVisibilityInPage,
  updateTabSwitcherThumbnailInPage
} from './page-functions';
import { TAB_SWITCHER_HOST_ID } from './types';
import type { HostMessageOptions, SwitcherTab } from './types';

function canHostSwitcherSurface(tab: SwitcherTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  return isOwnExtensionPageUrl(url) ||
    (isBrowserNewtabUrl(url) && hasTabSwitcherExtensionPagePort(tab)) ||
    canOpenOverlayOnUrl(url);
}

function runTabSwitcherHostScript<T, A extends unknown[]>(
  tabId: number,
  scriptFunc: (...args: A) => unknown,
  scriptArgs: A,
  normalize: (results: unknown) => T | null,
  fallbackValue: T
): Promise<T> {
  if (typeof tabId !== 'number' ||
      !chrome ||
      !chrome.scripting ||
      typeof chrome.scripting.executeScript !== 'function' ||
      typeof scriptFunc !== 'function') {
    return Promise.resolve(fallbackValue);
  }
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript({
        target: { tabId },
        func: scriptFunc,
        args: scriptArgs
      }, (results) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(fallbackValue);
          return;
        }
        const normalized = normalize(results);
        resolve(normalized === null ? fallbackValue : normalized);
      });
    } catch (_error) {
      resolve(fallbackValue);
    }
  });
}

function sendTabSwitcherHostMessage<T, A extends unknown[]>(
  tab: SwitcherTab | null | undefined,
  payload: PageRequest<HostAction>,
  options: HostMessageOptions<T, A>
): Promise<T> {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  const fallbackValue = options.fallbackValue;
  if (typeof tabId !== 'number' || !payload || typeof payload !== 'object') {
    return Promise.resolve(fallbackValue);
  }
  const normalizeResponse = options.normalizeResponse;
  const runScriptFallback = (): Promise<T> => runTabSwitcherHostScript(
    tabId,
    options.scriptFunc,
    options.scriptArgs,
    options.normalizeScriptResults,
    fallbackValue
  );
  if (isTabSwitcherExtensionPageMessageTarget(tab)) {
    return new Promise((resolve) => {
      postTabSwitcherMessageToExtensionPage(tab, payload, (ok, _reason, response) => {
        if (ok) {
          const normalized = normalizeResponse(response || { ok: true });
          if (normalized !== null) {
            resolve(normalized);
            return;
          }
        }
        runScriptFallback().then(resolve).catch(() => resolve(fallbackValue));
      });
    });
  }
  if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    return runScriptFallback();
  }
  return new Promise((resolve) => {
    try {
      LumnoMessaging.sendTabMessage(chrome.tabs, tabId, payload, (response: unknown) => {
        if (!(chrome.runtime && chrome.runtime.lastError)) {
          const normalized = normalizeResponse(response);
          if (normalized !== null) {
            resolve(normalized);
            return;
          }
        }
        runScriptFallback().then(resolve).catch(() => resolve(fallbackValue));
      });
    } catch (_error) {
      runScriptFallback().then(resolve).catch(() => resolve(fallbackValue));
    }
  });
}

function setTabSwitcherCaptureVisibility(tab: SwitcherTab | null | undefined, hidden: boolean): Promise<boolean> {
  return sendTabSwitcherHostMessage(tab, {
    action: 'setTabSwitcherCaptureVisibility',
    hidden: Boolean(hidden)
  }, {
    scriptFunc: setTabSwitcherCaptureVisibilityInPage,
    scriptArgs: [Boolean(hidden), TAB_SWITCHER_HOST_ID],
    normalizeResponse: normalizeTabSwitcherHostOkResponse,
    normalizeScriptResults: normalizeTabSwitcherHostOkScriptResults,
    fallbackValue: false
  });
}

function getOpenTabSwitcherState(tab: SwitcherTab | null | undefined): Promise<OpenSwitcherState> {
  return sendTabSwitcherHostMessage(tab, {
    action: 'getOpenTabSwitcherState'
  }, {
    scriptFunc: getOpenTabSwitcherStateInPage,
    scriptArgs: [TAB_SWITCHER_HOST_ID],
    normalizeResponse: normalizeOpenTabSwitcherStateResponse,
    normalizeScriptResults: normalizeOpenTabSwitcherStateScriptResults,
    fallbackValue: getFailedOpenTabSwitcherState()
  });
}

function postTabSwitcherThumbnailUpdate(tab: SwitcherTab | null | undefined, update: TabSwitcherThumbnailUpdate): Promise<boolean> {
  if (!update || typeof update !== 'object') {
    return Promise.resolve(false);
  }
  const payload: PageRequest<'updateTabSwitcherThumbnail'> = {
    action: 'updateTabSwitcherThumbnail',
    ...update
  };
  return sendTabSwitcherHostMessage(tab, payload, {
    scriptFunc: updateTabSwitcherThumbnailInPage,
    scriptArgs: [payload, TAB_SWITCHER_HOST_ID],
    normalizeResponse: normalizeTabSwitcherHostOkResponse,
    normalizeScriptResults: normalizeTabSwitcherHostOkScriptResults,
    fallbackValue: false
  });
}

function commitOpenTabSwitcherFromShortcutReleaseOnTab(tab: SwitcherTab | null | undefined): Promise<boolean> {
  return sendTabSwitcherHostMessage(tab, {
    action: 'commitOpenTabSwitcherFromShortcutRelease'
  }, {
    scriptFunc: commitOpenTabSwitcherFromShortcutReleaseInPage,
    scriptArgs: [TAB_SWITCHER_HOST_ID],
    normalizeResponse: normalizeTabSwitcherCommitResponse,
    normalizeScriptResults: normalizeTabSwitcherCommitScriptResults,
    fallbackValue: false
  });
}

const TAB_SWITCHER_HOST_STATE_TIMEOUT_MS = 400;

// Hint only: findOpenTabSwitcherHostInWindow scans the window when it is missing.
const tabSwitcherHostTabIdByWindowId = new Map<number, number>();

function findOpenTabSwitcherHostInWindow(windowId: number): Promise<chrome.tabs.Tab | null> {
  if (typeof windowId !== 'number' || !chrome || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
    return Promise.resolve(null);
  }
  const readStateWithTimeout = (tab: chrome.tabs.Tab): Promise<{ tab: chrome.tabs.Tab; open: boolean }> => new Promise((resolve) => {
    let settled = false;
    const finish = (open: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ tab, open: open === true });
    };
    const timer = setTimeout(() => finish(false), TAB_SWITCHER_HOST_STATE_TIMEOUT_MS);
    getOpenTabSwitcherState(tab)
      .then((state) => finish(Boolean(state && state.open === true)))
      .catch(() => finish(false));
  });
  return new Promise((resolve) => {
    chrome.tabs.query({ windowId }, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const knownHostTabId = tabSwitcherHostTabIdByWindowId.get(windowId);
      const candidates = (Array.isArray(tabs) ? tabs : [])
        .filter((tab) => tab && typeof tab.id === 'number' && canHostSwitcherSurface(tab))
        .sort((left, right) => {
          const leftPriority = left.id === knownHostTabId ? 2 : Number(left.active === true);
          const rightPriority = right.id === knownHostTabId ? 2 : Number(right.active === true);
          return rightPriority - leftPriority;
        });
      Promise.all(candidates.map(readStateWithTimeout)).then((states) => {
        const openHost = states.find((state) => state.open === true);
        resolve(openHost ? openHost.tab : null);
      }).catch(() => resolve(null));
    });
  });
}

function getTabForTabSwitcherCommit(tabId: number): Promise<chrome.tabs.Tab | null> {
  if (typeof tabId !== 'number' || !chrome || !chrome.tabs || typeof chrome.tabs.get !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab && typeof tab.id === 'number' ? tab : null);
    });
  });
}

export {
  canHostSwitcherSurface,
  commitOpenTabSwitcherFromShortcutReleaseOnTab,
  findOpenTabSwitcherHostInWindow,
  getOpenTabSwitcherState,
  getTabForTabSwitcherCommit,
  postTabSwitcherThumbnailUpdate,
  setTabSwitcherCaptureVisibility,
  tabSwitcherHostTabIdByWindowId
};
