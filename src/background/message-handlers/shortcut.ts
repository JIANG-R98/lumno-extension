// Shortcut queries and the page hotkeys.
import * as SHORTCUT_KEY_MATCHER from '../../domain/shortcut-key-matcher';
import { SHOW_SEARCH_COMMAND_NAME, loadShortcutRules, logHotkeyDebug } from '../worker-context';
import { handleTabSwitcherShortcutModifierReleased } from '../tab-switcher/shortcut-release';
import type { HandlersFor } from '../message-router';
import { rememberPageHotkeyContext } from '../command-context';
import { getConfiguredCopyUrlCommandShortcut, getConfiguredFallbackShortcut, triggerCopyCurrentUrlForTab, triggerShowSearchForTab } from '../command-service';
import { readKeyDescriptor } from './readers';

type ShortcutAction =
  | 'getShowSearchShortcut' | 'getCopyCurrentUrlCommandShortcut' | 'copyCurrentPageUrl'
  | 'triggerShowSearchFromPageHotkey' | 'notifyTabSwitcherShortcutModifierReleased' | 'getShortcutRules';

// Configured shortcuts and page hotkeys.
const SHORTCUT_MESSAGE_HANDLERS: HandlersFor<ShortcutAction> = Object.freeze({
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

export {
  SHORTCUT_MESSAGE_HANDLERS
};
export type {
  ShortcutAction
};
