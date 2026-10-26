// The keyboard commands' targets: show search (with or without the page URL
// prefilled) and copy the page URL, and the fallback and copy-URL shortcuts.
import * as OVERLAY_LOADING_LIFECYCLE from './overlay-loading-lifecycle';
import { openNewtabFallback } from './newtab-fallback';
import {
  SHOW_SEARCH_COMMAND_NAME,
  SHOW_SEARCH_PREFILL_V_COMMAND_NAME,
  logHotkeyDebug
} from './worker-context';
import {
  canOpenOverlayOnUrl,
  getResolvedTabUrl,
  isBrowserNewtabUrl,
  isLumnoNewtabUrl
} from './browser-urls-service';
import { openOverlayOnTab } from './overlay-open-service';
import * as LumnoMessaging from '../platform/messaging';
import type { TargetTab } from './overlay-types';
import { createInjectedAppRun } from '../platform/injection';
import type { StartCommand } from '../domain/injected-commands';
import { OVERLAY_NAVIGATION_STATE_TTL_MS, clearOverlayNavigationState, getOverlayNavigationState, overlayNavigationStateByTabId, shouldDeferRestrictedOverlayNavigation } from './overlay-loading-records';
import { clearRecentPageHotkeyContext, getRecentPageHotkeyContext } from './command-context';

function recoverFromPageHotkeyNewtab(newTabId: unknown, windowId: unknown): void {
  const recentContext = getRecentPageHotkeyContext(windowId);
  if (!recentContext || typeof newTabId !== 'number') {
    return;
  }
  chrome.tabs.query({ windowId: recentContext.windowId }, (tabs) => {
    const tabList = Array.isArray(tabs) ? tabs : [];
    const newTab = tabList.find((item) => item && item.id === newTabId) || null;
    const sourceTab = tabList.find((item) => item && item.id === recentContext.tabId) || null;
    const newTabUrl = getResolvedTabUrl(newTab);
    if (!newTab || (!isLumnoNewtabUrl(newTabUrl) && !isBrowserNewtabUrl(newTabUrl))) {
      return;
    }
    if (!sourceTab || typeof sourceTab.id !== 'number' || typeof newTab.id !== 'number' ||
        !canOpenOverlayOnUrl(getResolvedTabUrl(sourceTab))) {
      clearRecentPageHotkeyContext();
      return;
    }
    const sourceTabId = sourceTab.id;
    const newTabIdValue = newTab.id;
    clearRecentPageHotkeyContext();
    logHotkeyDebug('page-hotkey-newtab-recover-start', {
      windowId: recentContext.windowId,
      sourceTabId: sourceTab.id,
      newTabId: newTab.id,
      sourceUrl: getResolvedTabUrl(sourceTab),
      newTabUrl: newTabUrl
    });
    chrome.tabs.update(sourceTabId, { active: true }, () => {
      const updateError = chrome.runtime && chrome.runtime.lastError;
      if (updateError) {
        logHotkeyDebug('page-hotkey-newtab-recover-failed', {
          step: 'activate-source',
          sourceTabId,
          error: updateError.message || 'unknown'
        });
        return;
      }
      chrome.tabs.remove(newTabIdValue, () => {
        const removeError = chrome.runtime && chrome.runtime.lastError;
        if (removeError) {
          logHotkeyDebug('page-hotkey-newtab-close-failed', {
            newTabId: newTabIdValue,
            error: removeError.message || 'unknown'
          });
        }
      });
    });
  });
}

function triggerShowSearchForResolvedTab(tab: TargetTab | null | undefined, source: string): void {
  if (!tab || typeof tab.id !== 'number') {
    logHotkeyDebug('no-active-tab', { source: source || '' });
    openNewtabFallback();
    return;
  }
  if (shouldDeferRestrictedOverlayNavigation(tab)) {
    openOverlayOnTab(tab, [], source);
    return;
  }
  const activeUrl = getResolvedTabUrl(tab);
  if (canOpenOverlayOnUrl(activeUrl)) {
    openOverlayOnTab(tab, [], source);
    return;
  }
  const tabId = tab.id;
  const windowQuery: chrome.tabs.QueryInfo = (typeof tab.windowId === 'number')
    ? { windowId: tab.windowId }
    : { currentWindow: true };
  chrome.tabs.query(windowQuery, (tabs) => {
    const tabList = Array.isArray(tabs) ? tabs : [];
    const resolvedTab = tabList.find((item) => item && item.id === tabId) || tab;
    openOverlayOnTab(resolvedTab, tabList, source);
  });
}

function triggerShowSearchForTab(tab: TargetTab | null | undefined, source: string): void {
  if (!tab || typeof tab.id !== 'number') {
    triggerShowSearchForResolvedTab(tab, source);
    return;
  }
  const cachedNavigationState = overlayNavigationStateByTabId.get(tab.id) || null;
  if (cachedNavigationState) {
    const navigationTab = OVERLAY_LOADING_LIFECYCLE.applyTopFrameNavigationState(
      tab,
      cachedNavigationState,
      { now: Date.now(), ttlMs: OVERLAY_NAVIGATION_STATE_TTL_MS }
    );
    if (navigationTab !== tab) {
      triggerShowSearchForResolvedTab(navigationTab, source);
      return;
    }
    clearOverlayNavigationState(tab.id);
  }
  if (shouldDeferRestrictedOverlayNavigation(tab)) {
    openOverlayOnTab(tab, [], source);
    return;
  }
  const activeUrl = getResolvedTabUrl(tab);
  if (canOpenOverlayOnUrl(activeUrl)) {
    openOverlayOnTab(tab, [], source);
    return;
  }
  const tabId = tab.id;
  const knownTab = tab;
  getOverlayNavigationState(tabId, (storedNavigationState) => {
    if (storedNavigationState) {
      const navigationTab = OVERLAY_LOADING_LIFECYCLE.applyTopFrameNavigationState(
        knownTab,
        storedNavigationState,
        { now: Date.now(), ttlMs: OVERLAY_NAVIGATION_STATE_TTL_MS }
      );
      if (navigationTab !== knownTab) {
        triggerShowSearchForResolvedTab(navigationTab, source);
        return;
      }
    }
    const windowQuery: chrome.tabs.QueryInfo = (typeof knownTab.windowId === 'number')
      ? { windowId: knownTab.windowId }
      : { currentWindow: true };
    chrome.tabs.query(windowQuery, (tabs) => {
      const tabList = Array.isArray(tabs) ? tabs : [];
      const resolvedTab = tabList.find((item) => item && item.id === tabId) || knownTab;
      openOverlayOnTab(resolvedTab, tabList, source);
    });
  });
}

function getDefaultFallbackShortcutByPlatform(platformOs: string): string {
  return platformOs === 'mac' ? 'Command+Shift+K' : 'Ctrl+Shift+K';
}

function getDefaultFallbackShortcut(callback: (shortcut: string) => void): void {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.getPlatformInfo !== 'function') {
    callback('Ctrl+Shift+K');
    return;
  }
  chrome.runtime.getPlatformInfo((info) => {
    const os = info && typeof info.os === 'string' ? info.os : '';
    callback(getDefaultFallbackShortcutByPlatform(os));
  });
}

function getConfiguredFallbackShortcut(callback: (shortcut: string) => void): void {
  getDefaultFallbackShortcut((defaultShortcut) => {
    if (!chrome || !chrome.commands || typeof chrome.commands.getAll !== 'function') {
      callback(defaultShortcut);
      return;
    }
    chrome.commands.getAll((commands) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        callback(defaultShortcut);
        return;
      }
      const items = Array.isArray(commands) ? commands : [];
      const command = items.find((item) => item && item.name === SHOW_SEARCH_COMMAND_NAME);
      const shortcut = command && typeof command.shortcut === 'string'
        ? normalizeShortcutFromCommandsValue(command.shortcut)
        : '';
      callback(shortcut || defaultShortcut);
    });
  });
}

function normalizeShortcutFromCommandsValue(value: unknown): string {
  const text = String(value || '').trim();
  if (!text || text.includes('%')) {
    return '';
  }
  const parts = text.split('+').map((item) => String(item || '').trim()).filter(Boolean);
  if (parts.length < 2) {
    return '';
  }
  const keyToken = parts[parts.length - 1];
  if (!/^[A-Za-z0-9]$/.test(keyToken) && !/^F\d{1,2}$/i.test(keyToken)) {
    const specialKeys = new Set([
      'Tab', 'Enter', 'Return', 'Escape', 'Esc', 'Space', 'Spacebar',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      ',', '.', '/', ';', '\'', '-', '+', '\\', '`', '[', ']'
    ]);
    if (!specialKeys.has(keyToken)) {
      return '';
    }
  }
  let hasModifier = false;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const token = parts[i].toLowerCase();
    const isModifier =
      token === 'ctrl' ||
      token === 'control' ||
      token === 'macctrl' ||
      token === 'alt' ||
      token === 'option' ||
      token === 'shift' ||
      token === 'command' ||
      token === 'cmd' ||
      token === 'meta' ||
      token === 'super';
    if (!isModifier) {
      return '';
    }
    hasModifier = true;
  }
  return hasModifier ? text : '';
}

function getConfiguredCopyUrlCommandShortcut(callback: (shortcut: string) => void): void {
  if (!chrome || !chrome.commands || typeof chrome.commands.getAll !== 'function') {
    callback('');
    return;
  }
  chrome.commands.getAll((commands) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      callback('');
      return;
    }
    const items = Array.isArray(commands) ? commands : [];
    const command = items.find((item) => item && item.name === SHOW_SEARCH_PREFILL_V_COMMAND_NAME);
    const shortcut = command && typeof command.shortcut === 'string'
      ? normalizeShortcutFromCommandsValue(command.shortcut)
      : '';
    callback(shortcut || '');
  });
}

// The copy-URL listener is injected into a tab the first time the command
// runs there instead of being a content script of every page: most tabs
// never copy their URL.
const COPY_URL_LISTENER_START: StartCommand = Object.freeze({ type: 'start' });

function sendCopyCurrentUrlCommand(tabId: number, callback: (error: string, response?: { ok?: boolean }) => void): void {
  LumnoMessaging.sendTabMessage(chrome.tabs, tabId, { action: 'copyCurrentPageUrlFromCommand' }, (response) => {
    const lastError = chrome.runtime && chrome.runtime.lastError;
    const error = lastError ? lastError.message || 'unknown' : '';
    callback(error, response);
  });
}

function triggerCopyCurrentUrlForTab(
  activeTab: TargetTab | null | undefined,
  source: string,
  callback?: (copied: boolean) => void
): void {
  const finish = typeof callback === 'function' ? callback : function() {};
  if (!activeTab || typeof activeTab.id !== 'number') {
    logHotkeyDebug('copy-url-no-active-tab', { source: source || '' });
    finish(false);
    return;
  }
  const tabId = activeTab.id;
  const report = (error: string, response?: { ok?: boolean }): void => {
    if (error) {
      logHotkeyDebug('copy-url-send-message-failed', {
        tabId,
        source: source || '',
        error
      });
      finish(false);
      return;
    }
    logHotkeyDebug('copy-url-triggered', {
      tabId,
      source: source || '',
      ok: Boolean(response && response.ok)
    });
    finish(Boolean(response && response.ok));
  };
  sendCopyCurrentUrlCommand(tabId, (error, response) => {
    if (!error) {
      report('', response);
      return;
    }
    // No listener in the page yet: install it and ask again.
    chrome.scripting.executeScript(createInjectedAppRun(
      chrome.runtime,
      { tabId },
      ['copy-url-listener'],
      COPY_URL_LISTENER_START
    ), () => {
      const injectError = chrome.runtime && chrome.runtime.lastError;
      if (injectError) {
        report(injectError.message || 'unknown');
        return;
      }
      sendCopyCurrentUrlCommand(tabId, report);
    });
  });
}

export {
  COPY_URL_LISTENER_START,
  getConfiguredCopyUrlCommandShortcut,
  getConfiguredFallbackShortcut,
  getDefaultFallbackShortcut,
  getDefaultFallbackShortcutByPlatform,
  normalizeShortcutFromCommandsValue,
  recoverFromPageHotkeyNewtab,
  sendCopyCurrentUrlCommand,
  triggerCopyCurrentUrlForTab,
  triggerShowSearchForResolvedTab,
  triggerShowSearchForTab
};
