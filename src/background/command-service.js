// The keyboard commands' targets: show search (with or without the page URL
// prefilled), copy the page URL, and onboarding's demo command. Picks the tab a
// command acts on (recovering from a New Tab the shortcut itself opened), drops
// duplicate presses, and resolves the fallback and copy-URL shortcuts.
//
// Loaded by background.js through its first importScripts block (the Firefox
// build lists that block as background.scripts). Like background.js this is a
// classic script sharing the worker's global scope. Its functions use
// background.js bindings (the command names, COMMAND_TARGET_POLICY, the New Tab
// fallbacks, ...) only when they run, never while this file loads, because
// background.js has not initialized its own top-level bindings yet at that
// point.

function shouldTriggerOnboardingOverlayFromCommand(source, url) {
  return COMMAND_TARGET_POLICY.shouldTriggerOnboardingOverlayFromCommand(source, url, {
    isOwnExtensionUrl,
    isOnboardingUrl: isLumnoOnboardingUrl
  });
}

function triggerOnboardingOverlayFromCommand(activeTab, source) {
  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }
  const action = COMMAND_TARGET_POLICY.ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION ||
    'triggerOnboardingSearchOverlayFromCommand';
  if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    logHotkeyDebug('onboarding-command-forward-missed', {
      tabId: activeTab.id,
      source: source || '',
      reason: 'runtime-send-message-unavailable'
    });
    return;
  }
  chrome.runtime.sendMessage({
    action,
    tabId: activeTab.id,
    source: source || ''
  }, (response) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      logHotkeyDebug('onboarding-command-forward-failed', {
        tabId: activeTab.id,
        source: source || '',
        error: chrome.runtime.lastError.message || 'unknown'
      });
      return;
    }
    logHotkeyDebug('onboarding-command-forwarded', {
      tabId: activeTab.id,
      source: source || '',
      handled: Boolean(response && response.ok)
    });
  });
}

function shouldRecoverFromCommandNewtab(activeTab, source) {
  if (source !== 'commands' || !activeTab) {
    return false;
  }
  const activeUrl = getResolvedTabUrl(activeTab);
  return isLumnoNewtabUrl(activeUrl) || isBrowserNewtabUrl(activeUrl);
}

function pickRecoveryTargetTab(activeTab, tabs) {
  const tabList = Array.isArray(tabs) ? tabs : [];
  if (!activeTab || typeof activeTab.id !== 'number') {
    return null;
  }
  const openerTabId = typeof activeTab.openerTabId === 'number' ? activeTab.openerTabId : null;
  if (typeof openerTabId === 'number') {
    const openerTab = tabList.find((item) =>
      item &&
      item.id === openerTabId &&
      canOpenOverlayOnUrl(item.url || '')
    );
    if (openerTab) {
      return openerTab;
    }
  }
  const candidates = tabList
    .filter((item) =>
      item &&
      typeof item.id === 'number' &&
      item.id !== activeTab.id &&
      canOpenOverlayOnUrl(item.url || '')
    )
    .sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0));
  return candidates[0] || null;
}

function recoverOverlayTargetFromCommandNewtab(activeTab, tabs, source) {
  if (!shouldRecoverFromCommandNewtab(activeTab, source)) {
    return false;
  }
  const targetTab = pickRecoveryTargetTab(activeTab, tabs);
  if (!targetTab || typeof targetTab.id !== 'number') {
    logHotkeyDebug('command-newtab-recover-missed', {
      reason: 'no-target',
      tabId: activeTab && typeof activeTab.id === 'number' ? activeTab.id : null,
      source: source || ''
    });
    return false;
  }
  logHotkeyDebug('command-newtab-recover-start', {
    source: source || '',
    fromTabId: activeTab.id,
    toTabId: targetTab.id,
    fromUrl: activeTab.url || '',
    toUrl: targetTab.url || ''
  });
  chrome.tabs.update(targetTab.id, { active: true }, () => {
    if (chrome.runtime && chrome.runtime.lastError) {
      logHotkeyDebug('command-newtab-recover-failed', {
        source: source || '',
        targetTabId: targetTab.id,
        error: chrome.runtime.lastError.message || 'unknown'
      });
      return;
    }
    if (typeof activeTab.id === 'number') {
      chrome.tabs.remove(activeTab.id, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          logHotkeyDebug('command-newtab-close-failed', {
            source: source || '',
            tabId: activeTab.id,
            error: chrome.runtime.lastError.message || 'unknown'
          });
        }
      });
    }
    openOverlayOnTab(targetTab, tabs, 'commands-recover');
  });
  return true;
}

function isSearchCommandSource(source) {
  return source === 'commands' || source === 'commands-prefill';
}

function requestFocusVisibleNewtabInput(source, tabId) {
  const payload = {
    action: 'lumno:newtab-focus-input',
    source: source || '',
    tabId: typeof tabId === 'number' ? tabId : null
  };
  try {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        logHotkeyDebug('command-newtab-focus-send-failed', {
          source: source || '',
          tabId: typeof tabId === 'number' ? tabId : null,
          error: chrome.runtime.lastError.message || 'unknown'
        });
        return;
      }
      logHotkeyDebug('command-newtab-focus-send-done', {
        source: source || '',
        tabId: typeof tabId === 'number' ? tabId : null,
        ok: Boolean(response && response.ok)
      });
    });
  } catch (e) {
    logHotkeyDebug('command-newtab-focus-send-error', {
      source: source || '',
      tabId: typeof tabId === 'number' ? tabId : null,
      error: e && e.message ? e.message : String(e || '')
    });
  }
}
const HOTKEY_DUP_GUARD_MS = 180;
const PAGE_HOTKEY_NEWTAB_RECOVER_MS = 1200;
// Short-lived guards (<= a few seconds) that may be lost: a fresh worker simply
// treats the next hotkey/open as new.
const hotkeyInvokeAtByTabId = new Map();
let lastPageHotkeyContext = null;

function shouldIgnoreDuplicateHotkey(tabId) {
  if (typeof tabId !== 'number') {
    return false;
  }
  const now = Date.now();
  const lastAt = hotkeyInvokeAtByTabId.get(tabId) || 0;
  hotkeyInvokeAtByTabId.set(tabId, now);
  return (now - lastAt) <= HOTKEY_DUP_GUARD_MS;
}

function rememberPageHotkeyContext(tab) {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    lastPageHotkeyContext = null;
    return;
  }
  lastPageHotkeyContext = {
    at: Date.now(),
    tabId: tab.id,
    windowId: tab.windowId
  };
}

function getRecentPageHotkeyContext(windowId) {
  if (!lastPageHotkeyContext) {
    return null;
  }
  const age = Date.now() - Number(lastPageHotkeyContext.at || 0);
  if (age > PAGE_HOTKEY_NEWTAB_RECOVER_MS) {
    lastPageHotkeyContext = null;
    return null;
  }
  if (typeof windowId === 'number' && lastPageHotkeyContext.windowId !== windowId) {
    return null;
  }
  return lastPageHotkeyContext;
}

function clearRecentPageHotkeyContext() {
  lastPageHotkeyContext = null;
}

function getOverlayPrefillQueryForSource(tab, source) {
  if (source !== 'page-hotkey-prefill' && source !== 'commands-prefill') {
    return '';
  }
  return getResolvedTabUrl(tab);
}

function recoverFromPageHotkeyNewtab(newTabId, windowId) {
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
    if (!sourceTab || !canOpenOverlayOnUrl(getResolvedTabUrl(sourceTab))) {
      clearRecentPageHotkeyContext();
      return;
    }
    clearRecentPageHotkeyContext();
    logHotkeyDebug('page-hotkey-newtab-recover-start', {
      windowId: recentContext.windowId,
      sourceTabId: sourceTab.id,
      newTabId: newTab.id,
      sourceUrl: getResolvedTabUrl(sourceTab),
      newTabUrl: newTabUrl
    });
    chrome.tabs.update(sourceTab.id, { active: true }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        logHotkeyDebug('page-hotkey-newtab-recover-failed', {
          step: 'activate-source',
          sourceTabId: sourceTab.id,
          error: chrome.runtime.lastError.message || 'unknown'
        });
        return;
      }
      chrome.tabs.remove(newTab.id, () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          logHotkeyDebug('page-hotkey-newtab-close-failed', {
            newTabId: newTab.id,
            error: chrome.runtime.lastError.message || 'unknown'
          });
        }
      });
    });
  });
}

function triggerShowSearchForResolvedTab(tab, source) {
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
  const windowQuery = (typeof tab.windowId === 'number')
    ? { windowId: tab.windowId }
    : { currentWindow: true };
  chrome.tabs.query(windowQuery, (tabs) => {
    const tabList = Array.isArray(tabs) ? tabs : [];
    const resolvedTab = tabList.find((item) => item && item.id === tab.id) || tab;
    openOverlayOnTab(resolvedTab, tabList, source);
  });
}

function triggerShowSearchForTab(tab, source) {
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
  getOverlayNavigationState(tab.id, (storedNavigationState) => {
    if (storedNavigationState) {
      const navigationTab = OVERLAY_LOADING_LIFECYCLE.applyTopFrameNavigationState(
        tab,
        storedNavigationState,
        { now: Date.now(), ttlMs: OVERLAY_NAVIGATION_STATE_TTL_MS }
      );
      if (navigationTab !== tab) {
        triggerShowSearchForResolvedTab(navigationTab, source);
        return;
      }
    }
    const windowQuery = (typeof tab.windowId === 'number')
      ? { windowId: tab.windowId }
      : { currentWindow: true };
    chrome.tabs.query(windowQuery, (tabs) => {
      const tabList = Array.isArray(tabs) ? tabs : [];
      const resolvedTab = tabList.find((item) => item && item.id === tab.id) || tab;
      openOverlayOnTab(resolvedTab, tabList, source);
    });
  });
}

function getDefaultFallbackShortcutByPlatform(platformOs) {
  return platformOs === 'mac' ? 'Command+Shift+K' : 'Ctrl+Shift+K';
}

function getDefaultFallbackShortcut(callback) {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.getPlatformInfo !== 'function') {
    callback('Ctrl+Shift+K');
    return;
  }
  chrome.runtime.getPlatformInfo((info) => {
    const os = info && typeof info.os === 'string' ? info.os : '';
    callback(getDefaultFallbackShortcutByPlatform(os));
  });
}

function getConfiguredFallbackShortcut(callback) {
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

function normalizeShortcutFromCommandsValue(value) {
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

function getConfiguredCopyUrlCommandShortcut(callback) {
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
// runs there instead of being a content script of every page: it is the only
// user of these files in a page, and most tabs never copy their URL.
const COPY_URL_LISTENER_FILES = Object.freeze([
  'src/shared/settings.js',
  'src/shared/page-color-scheme.js',
  'src/content/hotkey-listener.js'
]);

function sendCopyCurrentUrlCommand(tabId, callback) {
  chrome.tabs.sendMessage(tabId, { action: 'copyCurrentPageUrlFromCommand' }, (response) => {
    const error = chrome.runtime && chrome.runtime.lastError
      ? chrome.runtime.lastError.message || 'unknown'
      : '';
    callback(error, response);
  });
}

function triggerCopyCurrentUrlForTab(activeTab, source, callback) {
  const finish = typeof callback === 'function' ? callback : function() {};
  if (!activeTab || typeof activeTab.id !== 'number') {
    logHotkeyDebug('copy-url-no-active-tab', { source: source || '' });
    finish(false);
    return;
  }
  const tabId = activeTab.id;
  const report = (error, response) => {
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
    chrome.scripting.executeScript({
      target: { tabId },
      files: COPY_URL_LISTENER_FILES.slice()
    }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        report(chrome.runtime.lastError.message || 'unknown');
        return;
      }
      sendCopyCurrentUrlCommand(tabId, report);
    });
  });
}
