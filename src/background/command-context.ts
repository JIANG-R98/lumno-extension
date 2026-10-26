// What a keyboard command acts on: the tab (recovering from a New Tab the
// shortcut itself opened), the page a hotkey came from, duplicate presses,
// and onboarding's demo command.
import * as COMMAND_TARGET_POLICY from './command-target-policy';
import { logHotkeyDebug } from './worker-context';
import {
  canOpenOverlayOnUrl,
  getResolvedTabUrl,
  isBrowserNewtabUrl,
  isLumnoNewtabUrl,
  isLumnoOnboardingUrl,
  isOwnExtensionUrl
} from './browser-urls-service';
import * as LumnoMessaging from '../platform/messaging';
import type { OverlayOpener, TargetTab } from './overlay-types';

// The tab a page hotkey came from, for recovering from a New Tab it opened.
interface PageHotkeyContext {
  at: number;
  tabId: number;
  windowId: number;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function shouldTriggerOnboardingOverlayFromCommand(source: string, url: string): boolean {
  return COMMAND_TARGET_POLICY.shouldTriggerOnboardingOverlayFromCommand(source, url, {
    isOwnExtensionUrl,
    isOnboardingUrl: isLumnoOnboardingUrl
  });
}

function triggerOnboardingOverlayFromCommand(activeTab: TargetTab | null | undefined, source: string): void {
  if (!activeTab || typeof activeTab.id !== 'number') {
    return;
  }
  const tabId = activeTab.id;
  const action = COMMAND_TARGET_POLICY.ONBOARDING_SEARCH_OVERLAY_COMMAND_ACTION;
  if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    logHotkeyDebug('onboarding-command-forward-missed', {
      tabId,
      source: source || '',
      reason: 'runtime-send-message-unavailable'
    });
    return;
  }
  LumnoMessaging.sendPageMessage(chrome.runtime, {
    action,
    tabId,
    source: source || ''
  }, (response) => {
    const lastError = chrome.runtime && chrome.runtime.lastError;
    if (lastError) {
      logHotkeyDebug('onboarding-command-forward-failed', {
        tabId,
        source: source || '',
        error: lastError.message || 'unknown'
      });
      return;
    }
    logHotkeyDebug('onboarding-command-forwarded', {
      tabId,
      source: source || '',
      handled: Boolean(response && response.ok)
    });
  });
}

function shouldRecoverFromCommandNewtab(activeTab: TargetTab | null | undefined, source: string): boolean {
  if (source !== 'commands' || !activeTab) {
    return false;
  }
  const activeUrl = getResolvedTabUrl(activeTab);
  return isLumnoNewtabUrl(activeUrl) || isBrowserNewtabUrl(activeUrl);
}

function pickRecoveryTargetTab(activeTab: TargetTab, tabs: readonly TargetTab[]): TargetTab | null {
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

// The overlay opener is handed in: opening the overlay is what asks for
// this recovery.
function recoverOverlayTargetFromCommandNewtab(
  activeTab: TargetTab | null | undefined,
  tabs: readonly TargetTab[],
  source: string,
  open: OverlayOpener
): boolean {
  if (!activeTab || !shouldRecoverFromCommandNewtab(activeTab, source)) {
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
  const targetTabId = targetTab.id;
  const activeTabId = activeTab.id;
  chrome.tabs.update(targetTabId, { active: true }, () => {
    const updateError = chrome.runtime && chrome.runtime.lastError;
    if (updateError) {
      logHotkeyDebug('command-newtab-recover-failed', {
        source: source || '',
        targetTabId,
        error: updateError.message || 'unknown'
      });
      return;
    }
    if (typeof activeTabId === 'number') {
      chrome.tabs.remove(activeTabId, () => {
        const removeError = chrome.runtime && chrome.runtime.lastError;
        if (removeError) {
          logHotkeyDebug('command-newtab-close-failed', {
            source: source || '',
            tabId: activeTabId,
            error: removeError.message || 'unknown'
          });
        }
      });
    }
    open(targetTab, tabs, 'commands-recover');
  });
  return true;
}

function isSearchCommandSource(source: string): boolean {
  return source === 'commands' || source === 'commands-prefill';
}

function requestFocusVisibleNewtabInput(source: string, tabId: number | null | undefined): void {
  try {
    LumnoMessaging.sendPageMessage(chrome.runtime, {
      action: 'lumno:newtab-focus-input',
      source: source || '',
      tabId: typeof tabId === 'number' ? tabId : null
    }, (response) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;
      if (lastError) {
        logHotkeyDebug('command-newtab-focus-send-failed', {
          source: source || '',
          tabId: typeof tabId === 'number' ? tabId : null,
          error: lastError.message || 'unknown'
        });
        return;
      }
      logHotkeyDebug('command-newtab-focus-send-done', {
        source: source || '',
        tabId: typeof tabId === 'number' ? tabId : null,
        ok: Boolean(response && response.ok)
      });
    });
  } catch (error) {
    logHotkeyDebug('command-newtab-focus-send-error', {
      source: source || '',
      tabId: typeof tabId === 'number' ? tabId : null,
      error: getErrorMessage(error, String(error || ''))
    });
  }
}
const HOTKEY_DUP_GUARD_MS = 180;
const PAGE_HOTKEY_NEWTAB_RECOVER_MS = 1200;
// Short-lived guards (<= a few seconds) that may be lost: a fresh worker simply
// treats the next hotkey/open as new.
const hotkeyInvokeAtByTabId = new Map<number, number>();
let lastPageHotkeyContext: PageHotkeyContext | null = null;

function shouldIgnoreDuplicateHotkey(tabId: unknown): boolean {
  if (typeof tabId !== 'number') {
    return false;
  }
  const now = Date.now();
  const lastAt = hotkeyInvokeAtByTabId.get(tabId) || 0;
  hotkeyInvokeAtByTabId.set(tabId, now);
  return (now - lastAt) <= HOTKEY_DUP_GUARD_MS;
}

function rememberPageHotkeyContext(tab: TargetTab | null | undefined): void {
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

function getRecentPageHotkeyContext(windowId?: unknown): PageHotkeyContext | null {
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

function clearRecentPageHotkeyContext(): void {
  lastPageHotkeyContext = null;
}

function getOverlayPrefillQueryForSource(tab: TargetTab, source: string): string {
  if (source !== 'page-hotkey-prefill' && source !== 'commands-prefill') {
    return '';
  }
  return getResolvedTabUrl(tab);
}

export {
  HOTKEY_DUP_GUARD_MS,
  PAGE_HOTKEY_NEWTAB_RECOVER_MS,
  clearRecentPageHotkeyContext,
  getErrorMessage,
  getOverlayPrefillQueryForSource,
  getRecentPageHotkeyContext,
  hotkeyInvokeAtByTabId,
  isSearchCommandSource,
  lastPageHotkeyContext,
  pickRecoveryTargetTab,
  recoverOverlayTargetFromCommandNewtab,
  rememberPageHotkeyContext,
  requestFocusVisibleNewtabInput,
  shouldIgnoreDuplicateHotkey,
  shouldRecoverFromCommandNewtab,
  shouldTriggerOnboardingOverlayFromCommand,
  triggerOnboardingOverlayFromCommand
};
export type {
  PageHotkeyContext
};
