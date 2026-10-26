// The guard that ignores a second switcher press in a window while the
// first is still opening.
import { logHotkeyDebug } from '../worker-context';
import type { SwitcherOpening, SwitcherTab } from './types';

const TAB_SWITCHER_OPENING_GUARD_MS = 2000;

// Short-lived opening guard; losing it only allows a fresh open.
const tabSwitcherOpeningByWindowKey = new Map<string, SwitcherOpening>();

function getTabSwitcherOpeningWindowKey(tab: SwitcherTab | null | undefined): string {
  if (tab && typeof tab.windowId === 'number') {
    return `window:${tab.windowId}`;
  }
  if (tab && typeof tab.id === 'number') {
    return `tab:${tab.id}`;
  }
  return '';
}

function finishTabSwitcherOpening(opening: SwitcherOpening | null | undefined): void {
  if (!opening || !opening.key) {
    return;
  }
  const current = tabSwitcherOpeningByWindowKey.get(opening.key);
  if (current !== opening) {
    return;
  }
  if (opening.timer) {
    clearTimeout(opening.timer);
    opening.timer = null;
  }
  tabSwitcherOpeningByWindowKey.delete(opening.key);
}

function beginTabSwitcherOpening(tab: chrome.tabs.Tab, source: string): SwitcherOpening | null {
  const key = getTabSwitcherOpeningWindowKey(tab);
  if (!key) {
    return null;
  }
  const now = Date.now();
  const existing = tabSwitcherOpeningByWindowKey.get(key);
  if (existing && existing.expiresAt > now) {
    logHotkeyDebug('tab-switcher-opening-guarded', {
      tabId: tab && typeof tab.id === 'number' ? tab.id : null,
      windowId: tab && typeof tab.windowId === 'number' ? tab.windowId : null,
      source: source || '',
      age: now - existing.startedAt
    });
    return null;
  }
  if (existing) {
    finishTabSwitcherOpening(existing);
  }
  const opening: SwitcherOpening = {
    key,
    tabId: tab && typeof tab.id === 'number' ? tab.id : null,
    windowId: tab && typeof tab.windowId === 'number' ? tab.windowId : null,
    source: source || '',
    startedAt: now,
    expiresAt: now + TAB_SWITCHER_OPENING_GUARD_MS,
    timer: null
  };
  opening.timer = setTimeout(() => {
    finishTabSwitcherOpening(opening);
  }, TAB_SWITCHER_OPENING_GUARD_MS);
  tabSwitcherOpeningByWindowKey.set(key, opening);
  return opening;
}

function createTabSwitcherOpeningFinisher(opening: SwitcherOpening): () => void {
  let didFinish = false;
  return function finishOpeningOnce() {
    if (didFinish) {
      return;
    }
    didFinish = true;
    finishTabSwitcherOpening(opening);
  };
}

// Whether a switcher is being opened in the tab's window.
function isTabSwitcherOpening(tab: SwitcherTab): boolean {
  const key = getTabSwitcherOpeningWindowKey(tab);
  if (!key) {
    return false;
  }
  const opening = tabSwitcherOpeningByWindowKey.get(key);
  return Boolean(opening && opening.expiresAt > Date.now());
}

export { beginTabSwitcherOpening, createTabSwitcherOpeningFinisher, isTabSwitcherOpening };
