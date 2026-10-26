// Committing the switcher when its shortcut's modifier is released: the key
// observer in each tab, arming it after an open, and committing the open
// switcher of a window when a tab reports the release.
import type { PageRequest } from '../../domain/messages';
import * as LumnoMessaging from '../../platform/messaging';
import { canOpenOverlayOnUrl, getResolvedTabUrl } from '../browser-urls-service';
import * as RECENT_TAB_SWITCHER from '../recent-tab-switcher';
import {
  isTabSwitcherExtensionPageMessageTarget,
  postTabSwitcherMessageToExtensionPage
} from '../tab-switcher-extension-page';
import { SHOW_TAB_SWITCHER_COMMAND_NAME, SHOW_TAB_SWITCHER_REVERSE_COMMAND_NAME, ignoreExpectedChromeError } from '../worker-context';
import {
  commitOpenTabSwitcherFromShortcutReleaseOnTab,
  findOpenTabSwitcherHostInWindow,
  getTabForTabSwitcherCommit,
  tabSwitcherHostTabIdByWindowId
} from './host';
import type { SwitcherTab, TabSwitcherShortcuts } from './types';

function prepareShortcutKeyObserver(tab: SwitcherTab | null | undefined): Promise<boolean> {
  const tabId = tab ? tab.id : undefined;
  if (!tab || typeof tabId !== 'number') {
    return Promise.resolve(false);
  }
  if (isTabSwitcherExtensionPageMessageTarget(tab)) {
    return Promise.resolve(true);
  }
  if (!chrome || !chrome.scripting || typeof chrome.scripting.executeScript !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    try {
      chrome.scripting.executeScript({
        target: {
          tabId,
          allFrames: true
        },
        files: ['build/shortcut-key-observer.js']
      }, () => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        const error = lastError ? lastError.message || 'unknown' : '';
        recordTabSwitcherShortcutDebug(
          error ? 'release-observer-injection-failed' : 'release-observer-ready',
          {
            tabId,
            windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
            error
          }
        );
        resolve(!error);
      });
    } catch (error) {
      recordTabSwitcherShortcutDebug('release-observer-injection-failed', {
        tabId,
        windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
        error: error instanceof Error && error.message ? error.message : String(error || 'unknown')
      });
      resolve(false);
    }
  });
}

// Tabs left open across an extension reload or update only get the manifest
// observer on their next load. The sweep skips tabs a script cannot reach and
// tabs not loaded yet (those load with the manifest scripts), starts with the
// active tab of each window and injects a few tabs at a time: hundreds of
// open tabs compiling the observer in every frame at once, while the
// onboarding page and the first New Tab load, stalled the whole browser.
const SHORTCUT_OBSERVER_SWEEP_CONCURRENCY = 3;

function canSweepShortcutKeyObserverIntoTab(tab: chrome.tabs.Tab | null | undefined): tab is chrome.tabs.Tab {
  return Boolean(
    tab &&
    typeof tab.id === 'number' &&
    tab.discarded !== true &&
    tab.status !== 'unloaded' &&
    canOpenOverlayOnUrl(getResolvedTabUrl(tab))
  );
}

function prepareShortcutKeyObserversInOpenTabs(): Promise<void> {
  if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve();
        return;
      }
      const queue = (Array.isArray(tabs) ? tabs : [])
        .filter(canSweepShortcutKeyObserverIntoTab)
        .sort((left, right) => Number(right.active === true) - Number(left.active === true));
      const runNext = (): Promise<void> => {
        const tab = queue.shift();
        return tab ? prepareShortcutKeyObserver(tab).then(runNext) : Promise.resolve();
      };
      const workers = Array.from(
        { length: Math.min(SHORTCUT_OBSERVER_SWEEP_CONCURRENCY, queue.length) },
        runNext
      );
      Promise.all(workers).then(() => resolve());
    });
  });
}

function commitOpenTabSwitcherInWindow(windowId: number, source: string): Promise<boolean> {
  recordTabSwitcherShortcutDebug('commit-search-start', {
    windowId,
    source: String(source || '')
  });
  const finishCommit = (hostTab: chrome.tabs.Tab | null, path: string): boolean | Promise<boolean> => {
    recordTabSwitcherShortcutDebug('commit-host-resolved', {
      windowId,
      source: String(source || ''),
      hostTabId: hostTab && typeof hostTab.id === 'number' ? hostTab.id : null,
      path
    });
    if (!hostTab) {
      return false;
    }
    return commitOpenTabSwitcherFromShortcutReleaseOnTab(hostTab).then((didCommit) => {
      recordTabSwitcherShortcutDebug('commit-finished', {
        windowId,
        source: String(source || ''),
        hostTabId: hostTab.id,
        committed: didCommit === true
      });
      if (didCommit && tabSwitcherHostTabIdByWindowId.get(windowId) === hostTab.id) {
        tabSwitcherHostTabIdByWindowId.delete(windowId);
      }
      return didCommit === true;
    });
  };
  const findAndCommit = (): Promise<boolean> => findOpenTabSwitcherHostInWindow(windowId)
    .then((hostTab) => finishCommit(hostTab, 'window-scan'));
  const knownHostTabId = tabSwitcherHostTabIdByWindowId.get(windowId);
  if (typeof knownHostTabId !== 'number') {
    return findAndCommit().catch(() => false);
  }
  return getTabForTabSwitcherCommit(knownHostTabId)
    .then((hostTab) => finishCommit(hostTab, 'known-host'))
    .then((didCommit) => {
      if (didCommit === true) {
        return true;
      }
      if (tabSwitcherHostTabIdByWindowId.get(windowId) === knownHostTabId) {
        tabSwitcherHostTabIdByWindowId.delete(windowId);
      }
      return findAndCommit();
    })
    .catch(() => findAndCommit().catch(() => false));
}

function handleTabSwitcherShortcutModifierReleased(
  senderTab: chrome.tabs.Tab | null | undefined,
  releasedKey: unknown,
  callback?: (committed: boolean) => void
): void {
  const finish = typeof callback === 'function' ? callback : () => {};
  if (!senderTab || typeof senderTab.windowId !== 'number') {
    finish(false);
    return;
  }
  const key = String(releasedKey || '');
  const windowId = senderTab.windowId;
  getConfiguredTabSwitcherShortcuts(({ forward, reverse }) => {
    const shortcut = [forward, reverse].filter(Boolean).join(' / ');
    const expectedKeys = Array.from(new Set([forward, reverse]
      .flatMap((item) => (item ? RECENT_TAB_SWITCHER.getShortcutReleaseEventKeys(item) : []))));
    if (!expectedKeys.includes(key)) {
      recordTabSwitcherShortcutDebug('release-rejected', {
        windowId,
        key,
        shortcut,
        expectedKeys
      });
      finish(false);
      return;
    }
    recordTabSwitcherShortcutDebug('release-accepted', {
      windowId,
      key,
      shortcut,
      expectedKeys
    });
    commitOpenTabSwitcherInWindow(windowId, 'keyup')
      .then((didCommit) => finish(didCommit === true))
      .catch(() => finish(false));
  });
}

// Only the tabs the shortcut was pressed in or the switcher opened in get the
// command's start time. A release buffered in any other tab came from an
// earlier switcher and must not commit this one.
function armTabSwitcherShortcutReleaseObservers(
  tabs: readonly chrome.tabs.Tab[],
  windowId: number,
  shortcut: string,
  commandStartedAt: number,
  replayTabIds: readonly (number | null | undefined)[]
): void {
  if (typeof windowId !== 'number') {
    return;
  }
  const keys = RECENT_TAB_SWITCHER.getShortcutReleaseEventKeys(shortcut);
  if (!keys.length) {
    return;
  }
  (Array.isArray(tabs) ? tabs : []).forEach((item) => {
    if (!item || typeof item.id !== 'number' || item.windowId !== windowId) {
      return;
    }
    const message: PageRequest<'armTabSwitcherShortcutRelease'> = {
      action: 'armTabSwitcherShortcutRelease',
      keys,
      commandStartedAt: replayTabIds.includes(item.id) ? Number(commandStartedAt) || 0 : 0
    };
    if (isTabSwitcherExtensionPageMessageTarget(item)) {
      postTabSwitcherMessageToExtensionPage(item, message, () => {});
      return;
    }
    if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
      return;
    }
    try {
      LumnoMessaging.sendTabMessage(chrome.tabs, item.id, message, ignoreExpectedChromeError);
    } catch (_error) {
      // Restricted tabs simply cannot participate in the release relay.
    }
  });
}

const TAB_SWITCHER_SHORTCUT_DEBUG_LIMIT = 50;

const tabSwitcherShortcutDebugEvents: Array<Record<string, unknown>> = [];

function recordTabSwitcherShortcutDebug(stage: string, payload?: Record<string, unknown>): void {
  tabSwitcherShortcutDebugEvents.push({
    at: new Date().toISOString(),
    stage: String(stage || ''),
    ...(payload && typeof payload === 'object' ? payload : {})
  });
  if (tabSwitcherShortcutDebugEvents.length > TAB_SWITCHER_SHORTCUT_DEBUG_LIMIT) {
    tabSwitcherShortcutDebugEvents.splice(
      0,
      tabSwitcherShortcutDebugEvents.length - TAB_SWITCHER_SHORTCUT_DEBUG_LIMIT
    );
  }
}

// The recorded release relay events, for diagnosing it.
function readTabSwitcherShortcutDebugEvents(): Array<Record<string, unknown>> {
  return tabSwitcherShortcutDebugEvents.map((event) => ({ ...event }));
}

// The reverse command ships unbound, so it is '' until the user assigns it.
function getConfiguredTabSwitcherShortcuts(callback: (shortcuts: TabSwitcherShortcuts) => void): void {
  const fallbackShortcut = 'Alt+Q';
  if (!chrome || !chrome.commands || typeof chrome.commands.getAll !== 'function') {
    callback({ forward: fallbackShortcut, reverse: '' });
    return;
  }
  chrome.commands.getAll((commands) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      callback({ forward: fallbackShortcut, reverse: '' });
      return;
    }
    const items = Array.isArray(commands) ? commands : [];
    const shortcutOf = (name: string): string => {
      const command = items.find((item) => item && item.name === name);
      return command && typeof command.shortcut === 'string' ? String(command.shortcut).trim() : '';
    };
    callback({
      forward: shortcutOf(SHOW_TAB_SWITCHER_COMMAND_NAME) || fallbackShortcut,
      reverse: shortcutOf(SHOW_TAB_SWITCHER_REVERSE_COMMAND_NAME)
    });
  });
}

export {
  armTabSwitcherShortcutReleaseObservers,
  getConfiguredTabSwitcherShortcuts,
  handleTabSwitcherShortcutModifierReleased,
  prepareShortcutKeyObserver,
  prepareShortcutKeyObserversInOpenTabs,
  readTabSwitcherShortcutDebugEvents,
  recordTabSwitcherShortcutDebug
};
