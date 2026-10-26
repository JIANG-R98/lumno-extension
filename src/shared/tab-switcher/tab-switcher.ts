// The Alt+Q tab switcher: opens over the page with the recent tabs the
// worker sends, or moves an open one along, and answers the worker's
// messages about the open switcher.
import { createTabSwitcherView } from '../react/tab-switcher';
import { getHostLabel, getMessage, getThumbnailStatus, normalizeAccentCss, sanitizeText } from './card-text';
import { TAB_SWITCHER_HOST_ID, getTabSwitcherHost } from './host';
import type { TabSwitcherHost, TabSwitcherReply } from './host';
import { clampSelectedIndex, isRecord, readOpenContext } from './open-context';
import type { OpenContext } from './open-context';
import { getCloseButtonPlacement } from './placement';
import { SwitcherSession } from './session';
import { parseTabSwitcherShortcut } from './shortcut';
import { PANEL_ID, SWITCHER_STYLES } from './switcher-styles';

const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
// Moves an open switcher along, or closes it before a new one opens; false
// when none is open.
function handleExistingSwitcher(context: OpenContext): boolean {
  const existingHost = getTabSwitcherHost(document);
  if (!existingHost) {
    return false;
  }
  if (context.advanceOnExisting && typeof existingHost._lumnoTabSwitcherAdvance === 'function') {
    existingHost._lumnoTabSwitcherAdvance();
    return true;
  }
  const cleanup = existingHost._lumnoTabSwitcherCleanup;
  if (typeof cleanup === 'function') {
    cleanup();
  }
  existingHost.remove();
  return true;
}

// The switcher's host, which keeps the page's styles out with a closed
// shadow root and joins the top layer where the browser can.
function createSwitcherHost(): { host: TabSwitcherHost; shadow: ShadowRoot } {
  const host: TabSwitcherHost = document.createElement('div');
  host.id = TAB_SWITCHER_HOST_ID;
  host.style.cssText = [
    'all: initial !important',
    'position: fixed !important',
    'inset: 0 !important',
    'z-index: 2147483647 !important',
    'pointer-events: none !important',
    'contain: layout style paint !important'
  ].join(';');
  if (typeof host.showPopover === 'function') {
    host.setAttribute('popover', 'manual');
  }
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SWITCHER_STYLES;
  shadow.appendChild(style);
  return { host, shadow };
}

// Opens the tab switcher with the context the worker or the page sends, read
// as untrusted, or moves an open one along.
function toggleTabSwitcher(rawContext: unknown): TabSwitcherReply {
  const context = readOpenContext(rawContext);
  if (handleExistingSwitcher(context)) {
    return { ok: true, reason: 'already-open' };
  }
  if (!context.tabs.length) {
    return { ok: false, reason: 'empty' };
  }
  const { host, shadow } = createSwitcherHost();
  const selectedIndex = clampSelectedIndex(context.selectedIndex, context.tabs.length);
  // The view calls back into the session made right after it.
  let session: SwitcherSession | null = null;
  const view = createTabSwitcherView({
    document,
    root: shadow,
    panelId: PANEL_ID,
    tabs: context.tabs,
    selectedIndex,
    ariaLabel: getMessage('tab_switcher_title', 'Recent tabs'),
    closeButtonPlacement: getCloseButtonPlacement(),
    sanitizeText,
    getHostLabel,
    getMessage,
    normalizeAccentCss,
    getThumbnailStatus,
    onSelect: (index) => session?.select(index),
    onActivate: (index, event) => session?.activate(index, event),
    onClose: (index, event) => session?.closeFromCard(index, event)
  });
  const panel = view.panel;
  if (!panel) {
    host.remove();
    return { ok: false, reason: 'react-view-unavailable' };
  }
  session = new SwitcherSession({ host, shadow, view, panel, context, shortcut: parseTabSwitcherShortcut(context.shortcut) }, selectedIndex);
  session.open();
  return { ok: true };
}

function updateOpenSwitcherThumbnail(request: unknown): TabSwitcherReply {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherUpdateThumbnail !== 'function') {
    return { ok: false, reason: 'tab_switcher_host_missing' };
  }
  return host._lumnoTabSwitcherUpdateThumbnail(request) || { ok: true };
}

function advanceOpenSwitcher(request: Record<string, unknown>): TabSwitcherReply & {
  open: boolean;
  advanced: boolean;
  suppressed: boolean;
} {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherAdvance !== 'function') {
    return { ok: true, open: false, advanced: false, suppressed: false };
  }
  const didAdvance = host._lumnoTabSwitcherAdvance(request.offset);
  return {
    ok: true,
    open: true,
    advanced: didAdvance === true,
    suppressed: didAdvance === false
  };
}

function commitOpenSwitcherFromShortcutRelease(): TabSwitcherReply & { committed: boolean } {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherCommitFromShortcutRelease !== 'function') {
    return { ok: false, committed: false };
  }
  return {
    ok: true,
    committed: host._lumnoTabSwitcherCommitFromShortcutRelease() === true
  };
}

// The worker's messages about the switcher, by action.
const MESSAGE_HANDLERS: Readonly<Record<string, (request: Record<string, unknown>) => TabSwitcherReply>> = {
  updateTabSwitcherThumbnail: updateOpenSwitcherThumbnail,
  advanceOpenTabSwitcherFromCommand: advanceOpenSwitcher,
  commitOpenTabSwitcherFromShortcutRelease: commitOpenSwitcherFromShortcutRelease,
  openTabSwitcherFromCommand: (request) => toggleTabSwitcher(request.context)
};

if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
  chromeApi.runtime.onMessage.addListener((
    request: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (reply: TabSwitcherReply) => void
  ): boolean => {
    const action = isRecord(request) ? request.action : null;
    if (!isRecord(request) || typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(MESSAGE_HANDLERS, action)) {
      return false;
    }
    sendResponse(MESSAGE_HANDLERS[action](request));
    return true;
  });
}

export { toggleTabSwitcher };
