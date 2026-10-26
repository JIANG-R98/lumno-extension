import * as LumnoMessaging from '../../platform/messaging';
import { getTabSwitcherHost } from './host';
import { toggleTabSwitcher } from './tab-switcher';

// What a tab switcher command answers, to the worker or an extension page.
interface BridgeReply {
  ok: boolean;
  reason?: string;
  advanced?: boolean;
  suppressed?: boolean;
  committed?: boolean;
  open?: boolean;
}

// The keys of a key event the bridge reads.
interface ShortcutKeyEvent {
  key?: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const TAB_SWITCHER_ADVANCE_EVENT = '_x_extension_tab_switcher_advance_command_2026_unique_';
const TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME = 'lumno-tab-switcher-extension-page';
const TAB_SWITCHER_RELEASE_REPLAY_WINDOW_MS = 5000;
const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
let extensionPagePort: chrome.runtime.Port | null = null;
let extensionPagePortReconnectTimer: number | null = null;
let extensionPagePortClosed = false;
let extensionPageTabId: number | null = null;
let armedReleaseKeys: string[] = [];
const recentTrustedKeydownAtByKey = new Map<string, number>();
const recentTrustedReleaseAtByKey = new Map<string, number>();

function normalizeTabSwitcherReleaseKey(value: unknown): string {
  const key = String(value || '');
  return key.length === 1 ? key.toLowerCase() : key;
}

function normalizeTabSwitcherReleaseCode(value: unknown): string {
  const code = String(value || '');
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3).toLowerCase();
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  const aliases: Record<string, string> = {
    Backquote: '`',
    Backslash: '\\',
    BracketLeft: '[',
    BracketRight: ']',
    Comma: ',',
    Equal: '=',
    Minus: '-',
    Period: '.',
    Quote: "'",
    Semicolon: ';',
    Slash: '/'
  };
  return aliases[code] || '';
}

function getTabSwitcherShortcutReleaseCandidates(event: ShortcutKeyEvent | null): string[] {
  return Array.from(new Set([
    normalizeTabSwitcherReleaseKey(event && event.key),
    normalizeTabSwitcherReleaseCode(event && event.code)
  ].filter(Boolean)));
}

function getTabSwitcherShortcutKeydownCandidates(event: ShortcutKeyEvent | null): string[] {
  const candidates = getTabSwitcherShortcutReleaseCandidates(event);
  if (event && event.altKey) {
    candidates.push('Alt');
  }
  if (event && event.ctrlKey) {
    candidates.push('Control');
  }
  if (event && event.metaKey) {
    candidates.push('Meta');
  }
  if (event && event.shiftKey) {
    candidates.push('Shift');
  }
  return Array.from(new Set(candidates));
}

function pruneTrustedTabSwitcherShortcutEvents(now: number): void {
  [recentTrustedKeydownAtByKey, recentTrustedReleaseAtByKey].forEach((eventsByKey) => {
    eventsByKey.forEach((observedAt, key) => {
      if ((now - observedAt) > TAB_SWITCHER_RELEASE_REPLAY_WINDOW_MS) {
        eventsByKey.delete(key);
      }
    });
  });
}

function rememberTrustedTabSwitcherShortcutKeydown(event: KeyboardEvent): void {
  if (!event || event.isTrusted !== true || event.isComposing || event.repeat) {
    return;
  }
  const pressedAt = Date.now();
  pruneTrustedTabSwitcherShortcutEvents(pressedAt);
  getTabSwitcherShortcutKeydownCandidates(event).forEach((key) => {
    recentTrustedKeydownAtByKey.set(key, pressedAt);
  });
}

function getReleasedTabSwitcherShortcutKey(event: KeyboardEvent): string {
  return getTabSwitcherShortcutReleaseCandidates(event)
    .find((key) => armedReleaseKeys.includes(key)) || '';
}

function rememberTrustedTabSwitcherShortcutRelease(event: KeyboardEvent): void {
  const releasedAt = Date.now();
  pruneTrustedTabSwitcherShortcutEvents(releasedAt);
  getTabSwitcherShortcutReleaseCandidates(event).forEach((key) => {
    recentTrustedReleaseAtByKey.set(key, releasedAt);
  });
}

// A release that came before the worker armed the keys (the shortcut let
// go quickly), still recent enough to count.
function getBufferedTabSwitcherShortcutReleaseKey(keys: string[], commandStartedAt: unknown): string {
  const startedAt = Number(commandStartedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return '';
  }
  const now = Date.now();
  return keys.find((key) => {
    const observedAt = recentTrustedReleaseAtByKey.get(key);
    if (observedAt === undefined || !Number.isFinite(observedAt) ||
        (now - observedAt) > TAB_SWITCHER_RELEASE_REPLAY_WINDOW_MS) {
      return false;
    }
    if (observedAt >= startedAt) {
      return true;
    }
    const keydownAt = recentTrustedKeydownAtByKey.get(key);
    return keydownAt !== undefined && Number.isFinite(keydownAt) &&
      keydownAt <= observedAt &&
      (observedAt - keydownAt) <= TAB_SWITCHER_RELEASE_REPLAY_WINDOW_MS &&
      (startedAt - observedAt) <= TAB_SWITCHER_RELEASE_REPLAY_WINDOW_MS;
  }) || '';
}

function forgetTrustedTabSwitcherShortcutRelease(key: string, releasedAt: number | undefined): void {
  // A newer press and release of the same key belongs to a later command.
  if (recentTrustedReleaseAtByKey.get(key) !== releasedAt) {
    return;
  }
  recentTrustedKeydownAtByKey.delete(key);
  recentTrustedReleaseAtByKey.delete(key);
}

function relayTabSwitcherShortcutRelease(key: string): void {
  if (!key || !chromeApi || !chromeApi.runtime ||
      typeof chromeApi.runtime.sendMessage !== 'function') {
    return;
  }
  armedReleaseKeys = [];
  // An earlier switcher arms every tab in its window, so a quick release
  // can be relayed live while the next switcher is still opening. Keep it
  // buffered until the background reports a commit, so the arm that
  // follows the open can replay it.
  const releasedAt = recentTrustedReleaseAtByKey.get(key);
  try {
    LumnoMessaging.sendBackgroundMessage(chromeApi.runtime, {
      action: 'notifyTabSwitcherShortcutModifierReleased',
      key
    }, (response) => {
      void (chromeApi.runtime && chromeApi.runtime.lastError);
      if (response && response.committed === true) {
        forgetTrustedTabSwitcherShortcutRelease(key, releasedAt);
      }
    });
  } catch (_error) {
    // Ignore stale extension page contexts during reload.
  }
}

function normalizeTabSwitcherAdvanceOffset(value: unknown): number {
  const offset = Math.trunc(Number(value));
  return Number.isFinite(offset) && offset !== 0 ? offset : 1;
}

function createTabSwitcherAdvanceEvent(offset: unknown): CustomEvent<{ offset: number }> {
  const detail = { offset: normalizeTabSwitcherAdvanceOffset(offset) };
  return new CustomEvent(TAB_SWITCHER_ADVANCE_EVENT, { detail });
}

function advanceOpenTabSwitcherFromCommand(request: Record<string, unknown>): BridgeReply {
  const host = getTabSwitcherHost(document);
  if (!host) {
    return { ok: false };
  }
  if (typeof host._lumnoTabSwitcherAdvance === 'function') {
    const didAdvance = host._lumnoTabSwitcherAdvance(request.offset);
    return {
      ok: true,
      advanced: didAdvance === true,
      suppressed: didAdvance === false
    };
  }
  document.dispatchEvent(createTabSwitcherAdvanceEvent(request.offset));
  return { ok: true, advanced: true };
}

function commitOpenTabSwitcherFromShortcutRelease(): BridgeReply {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherCommitFromShortcutRelease !== 'function') {
    return { ok: false, committed: false };
  }
  return {
    ok: true,
    committed: host._lumnoTabSwitcherCommitFromShortcutRelease() === true
  };
}

function openTabSwitcherFromCommand(request: Record<string, unknown>): BridgeReply {
  return toggleTabSwitcher(isRecord(request.context) ? request.context : {});
}

// Hides the switcher while the worker captures this tab's thumbnail.
function setTabSwitcherCaptureVisibility(hidden: unknown): BridgeReply {
  const host = getTabSwitcherHost(document);
  if (!host) {
    return { ok: true, reason: 'tab_switcher_host_missing' };
  }
  const markerKey = 'lumnoCaptureVisibilityHidden';
  const valueKey = 'lumnoCapturePreviousVisibility';
  const priorityKey = 'lumnoCapturePreviousVisibilityPriority';
  const hadValueKey = 'lumnoCaptureHadVisibility';
  if (hidden) {
    if (host.dataset[markerKey] !== 'true') {
      const previousValue = host.style.getPropertyValue('visibility');
      host.dataset[markerKey] = 'true';
      host.dataset[valueKey] = previousValue || '';
      host.dataset[priorityKey] = host.style.getPropertyPriority('visibility') || '';
      host.dataset[hadValueKey] = previousValue ? 'true' : 'false';
    }
    host.style.setProperty('visibility', 'hidden', 'important');
    return { ok: true };
  }
  if (host.dataset[markerKey] === 'true') {
    if (host.dataset[hadValueKey] === 'true') {
      host.style.setProperty(
        'visibility',
        host.dataset[valueKey] || '',
        host.dataset[priorityKey] || ''
      );
    } else {
      host.style.removeProperty('visibility');
    }
    delete host.dataset[markerKey];
    delete host.dataset[valueKey];
    delete host.dataset[priorityKey];
    delete host.dataset[hadValueKey];
  }
  return { ok: true };
}

function getOpenTabSwitcherState(): BridgeReply {
  const host = getTabSwitcherHost(document);
  return {
    ok: true,
    open: Boolean(host)
  };
}

function updateOpenTabSwitcherThumbnail(request: Record<string, unknown>): BridgeReply {
  const host = getTabSwitcherHost(document);
  if (!host || typeof host._lumnoTabSwitcherUpdateThumbnail !== 'function') {
    return { ok: false, reason: 'tab_switcher_host_missing' };
  }
  return host._lumnoTabSwitcherUpdateThumbnail(request) || { ok: true };
}

// A tab switcher command from the worker, or from it through the
// extension page port; null for any other message.
function handleTabSwitcherCommandMessage(request: unknown): BridgeReply | null {
  if (!isRecord(request)) {
    return null;
  }
  if (request.action === 'advanceOpenTabSwitcherFromCommand') {
    return advanceOpenTabSwitcherFromCommand(request);
  }
  if (request.action === 'armTabSwitcherShortcutRelease') {
    armedReleaseKeys = (Array.isArray(request.keys) ? request.keys : [request.key])
      .map(normalizeTabSwitcherReleaseKey)
      .filter(Boolean);
    const bufferedKey = getBufferedTabSwitcherShortcutReleaseKey(
      armedReleaseKeys,
      request.commandStartedAt
    );
    if (bufferedKey) {
      relayTabSwitcherShortcutRelease(bufferedKey);
    }
    return { ok: armedReleaseKeys.length > 0 || Boolean(bufferedKey) };
  }
  if (request.action === 'commitOpenTabSwitcherFromShortcutRelease') {
    return commitOpenTabSwitcherFromShortcutRelease();
  }
  if (request.action === 'openTabSwitcherFromCommand') {
    return openTabSwitcherFromCommand(request);
  }
  if (request.action === 'setTabSwitcherCaptureVisibility') {
    return setTabSwitcherCaptureVisibility(request.hidden);
  }
  if (request.action === 'getOpenTabSwitcherState') {
    return getOpenTabSwitcherState();
  }
  if (request.action === 'updateTabSwitcherThumbnail') {
    return updateOpenTabSwitcherThumbnail(request);
  }
  return null;
}

function isOwnExtensionPage(): boolean {
  if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.id) {
    return false;
  }
  try {
    // Firefox hosts extension pages on a per-install UUID, not runtime.id.
    const own = new URL(chromeApi.runtime.getURL(''));
    return window.location.protocol === own.protocol && window.location.hostname === own.hostname;
  } catch (_error) {
    return false;
  }
}

function postExtensionPagePortMessage(message: Record<string, unknown>): void {
  if (!extensionPagePort || !message) {
    return;
  }
  try {
    extensionPagePort.postMessage(message);
  } catch (_error) {
    // The disconnect listener will reconnect if the page is still alive.
  }
}

function registerTabSwitcherExtensionPage(tab: chrome.tabs.Tab | null | undefined): void {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  extensionPageTabId = tabId;
  postExtensionPagePortMessage({
    action: 'registerTabSwitcherExtensionPage',
    tabId,
    url: window.location && window.location.href ? window.location.href : '',
    title: document && document.title ? document.title : ''
  });
}

function respondToExtensionPageRequest(request: unknown, response: BridgeReply): void {
  if (!isRecord(request) || typeof request.requestId !== 'number') {
    return;
  }
  postExtensionPagePortMessage({
    action: 'tabSwitcherExtensionPageResponse',
    requestId: request.requestId,
    tabId: extensionPageTabId,
    ok: Boolean(response && response.ok),
    reason: response && response.reason ? String(response.reason) : '',
    advanced: response && typeof response.advanced === 'boolean' ? response.advanced : null,
    committed: response && typeof response.committed === 'boolean' ? response.committed : null,
    open: response && typeof response.open === 'boolean' ? response.open : null,
    suppressed: Boolean(response && response.suppressed)
  });
}

function scheduleExtensionPagePortReconnect(): void {
  if (extensionPagePortClosed || extensionPagePortReconnectTimer) {
    return;
  }
  extensionPagePortReconnectTimer = window.setTimeout(() => {
    extensionPagePortReconnectTimer = null;
    connectExtensionPagePort();
  }, 1000);
}

// An extension page gets no content scripts' messages, so it holds a
// port the worker sends tab switcher commands through.
function connectExtensionPagePort(): void {
  if (!chromeApi || !isOwnExtensionPage() ||
      !chromeApi.runtime ||
      typeof chromeApi.runtime.connect !== 'function') {
    return;
  }
  if (extensionPagePort) {
    return;
  }
  let port: chrome.runtime.Port;
  try {
    port = chromeApi.runtime.connect({ name: TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME });
  } catch (_error) {
    return;
  }
  extensionPagePort = port;
  port.onMessage.addListener((request: unknown) => {
    const response = handleTabSwitcherCommandMessage(request);
    if (response) {
      respondToExtensionPageRequest(request, response);
    }
  });
  port.onDisconnect.addListener(() => {
    extensionPagePort = null;
    scheduleExtensionPagePortReconnect();
  });
  if (chromeApi.tabs && typeof chromeApi.tabs.getCurrent === 'function') {
    chromeApi.tabs.getCurrent((tab) => {
      registerTabSwitcherExtensionPage(tab);
    });
  } else {
    registerTabSwitcherExtensionPage(null);
  }
}

if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage) {
  chromeApi.runtime.onMessage.addListener((request: unknown, _sender, sendResponse: (reply: BridgeReply) => void) => {
    const response = handleTabSwitcherCommandMessage(request);
    if (!response) {
      return false;
    }
    sendResponse(response);
    return false;
  });
}

function notifyTabSwitcherShortcutModifierReleased(event: KeyboardEvent): void {
  if (!event || event.isTrusted !== true || !chromeApi || !chromeApi.runtime ||
      typeof chromeApi.runtime.sendMessage !== 'function') {
    return;
  }
  rememberTrustedTabSwitcherShortcutRelease(event);
  const key = getReleasedTabSwitcherShortcutKey(event);
  if (!key) {
    return;
  }
  relayTabSwitcherShortcutRelease(key);
}

window.addEventListener('keydown', rememberTrustedTabSwitcherShortcutKeydown, true);
window.addEventListener('keyup', notifyTabSwitcherShortcutModifierReleased, true);

window.addEventListener('pagehide', () => {
  extensionPagePortClosed = true;
  if (extensionPagePortReconnectTimer) {
    window.clearTimeout(extensionPagePortReconnectTimer);
    extensionPagePortReconnectTimer = null;
  }
}, true);

connectExtensionPagePort();
