// The recent-tab switcher's channel to the extension pages that host it
// themselves (the New Tab and Lumno's own pages): each opens a port to the
// worker, and the switcher's page messages go through it, each answered by
// its request id or failed after a second.
import { getResolvedTabUrl, isBrowserNewtabUrl, isOwnExtensionPageUrl } from './browser-urls-service';
import type { UrlTabLike } from './browser-urls-service';
import type { PageAction, PageRequest } from '../domain/messages';

// The extension page's answer to a port request, as it sent it.
type PortReplyCallback = (ok: boolean, reason: string, response?: Record<string, unknown>) => void;

interface PendingPortRequest {
  callback: PortReplyCallback | undefined;
  timer: ReturnType<typeof setTimeout> | null;
}

// An extension page that hosts the switcher itself, reached through its port.
interface ExtensionPagePortRecord {
  port: chrome.runtime.Port;
  tabId: number;
  pending: Map<number, PendingPortRequest>;
  url?: string;
  title?: string;
}

// The page messages the switcher sends to the page that hosts it.
type HostAction = Extract<PageAction,
  | 'setTabSwitcherCaptureVisibility'
  | 'getOpenTabSwitcherState'
  | 'updateTabSwitcherThumbnail'
  | 'commitOpenTabSwitcherFromShortcutRelease'
  | 'openTabSwitcherFromCommand'
  | 'advanceOpenTabSwitcherFromCommand'
  | 'armTabSwitcherShortcutRelease'>;

// The port an extension page that hosts the switcher opens to the worker.
const TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME = 'lumno-tab-switcher-extension-page';
// How long a message waits for the page to connect its port.
const TAB_SWITCHER_EXTENSION_PAGE_PORT_WAIT_MS = 650;
const TAB_SWITCHER_EXTENSION_PAGE_PORT_RETRY_MS = 50;

// Ports close when the worker suspends, so this registry dies with them.
const tabSwitcherExtensionPagePortsByTabId = new Map<number, ExtensionPagePortRecord>();
let tabSwitcherExtensionPageRequestSeq = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function hasTabSwitcherExtensionPagePort(tab: UrlTabLike | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const record = tabSwitcherExtensionPagePortsByTabId.get(tab.id);
  return Boolean(record && record.port && typeof record.port.postMessage === 'function');
}

function isTabSwitcherExtensionPageMessageTarget(tab: UrlTabLike | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (isOwnExtensionPageUrl(url)) {
    return true;
  }
  return isBrowserNewtabUrl(url) && hasTabSwitcherExtensionPagePort(tab);
}

function getPortSenderTabId(port: chrome.runtime.Port | null | undefined): number | null {
  const senderTab = port && port.sender && port.sender.tab ? port.sender.tab : null;
  return senderTab && typeof senderTab.id === 'number' ? senderTab.id : null;
}

function getPortMessageTabId(port: chrome.runtime.Port, message: Record<string, unknown> | null | undefined): number | null {
  if (message && typeof message.tabId === 'number') {
    return message.tabId;
  }
  return getPortSenderTabId(port);
}

function clearTabSwitcherExtensionPagePending(record: ExtensionPagePortRecord | null | undefined, ok: boolean, reason: string): void {
  if (!record || !record.pending || typeof record.pending.forEach !== 'function') {
    return;
  }
  record.pending.forEach((pending) => {
    if (!pending) {
      return;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    if (typeof pending.callback === 'function') {
      pending.callback(Boolean(ok), reason || '');
    }
  });
  record.pending.clear();
}

function deleteTabSwitcherExtensionPagePort(tabId: number | null, port: chrome.runtime.Port | null): void {
  if (typeof tabId !== 'number') {
    return;
  }
  const record = tabSwitcherExtensionPagePortsByTabId.get(tabId);
  if (!record || (port && record.port !== port)) {
    return;
  }
  clearTabSwitcherExtensionPagePending(record, false, 'disconnected');
  tabSwitcherExtensionPagePortsByTabId.delete(tabId);
}

function registerTabSwitcherExtensionPagePort(port: chrome.runtime.Port, message: Record<string, unknown>): ExtensionPagePortRecord | null {
  const tabId = getPortMessageTabId(port, message);
  if (typeof tabId !== 'number') {
    return null;
  }
  const previous = tabSwitcherExtensionPagePortsByTabId.get(tabId);
  if (previous && previous.port !== port) {
    clearTabSwitcherExtensionPagePending(previous, false, 'replaced');
  }
  const record: ExtensionPagePortRecord = previous && previous.port === port
    ? previous
    : {
      port,
      tabId,
      pending: new Map()
    };
  record.url = message && typeof message.url === 'string' ? message.url : (record.url || '');
  record.title = message && typeof message.title === 'string' ? message.title : (record.title || '');
  tabSwitcherExtensionPagePortsByTabId.set(tabId, record);
  return record;
}

function handleTabSwitcherExtensionPagePortMessage(port: chrome.runtime.Port, message: unknown): void {
  if (!isRecord(message)) {
    return;
  }
  if (message.action === 'registerTabSwitcherExtensionPage') {
    registerTabSwitcherExtensionPagePort(port, message);
    return;
  }
  if (message.action !== 'tabSwitcherExtensionPageResponse') {
    return;
  }
  const tabId = getPortMessageTabId(port, message);
  if (typeof tabId !== 'number' || typeof message.requestId !== 'number') {
    return;
  }
  const record = tabSwitcherExtensionPagePortsByTabId.get(tabId);
  if (!record || record.port !== port || !record.pending) {
    return;
  }
  const pending = record.pending.get(message.requestId);
  if (!pending) {
    return;
  }
  record.pending.delete(message.requestId);
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  if (typeof pending.callback === 'function') {
    pending.callback(Boolean(message.ok), String(message.reason || ''), message);
  }
}

function registerTabSwitcherExtensionPagePortConnection(port: chrome.runtime.Port): void {
  if (!port || port.name !== TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME) {
    return;
  }
  registerTabSwitcherExtensionPagePort(port, {
    action: 'registerTabSwitcherExtensionPage',
    tabId: getPortSenderTabId(port),
    url: port.sender && typeof port.sender.url === 'string' ? port.sender.url : '',
    title: ''
  });
  port.onMessage.addListener((message: unknown) => {
    handleTabSwitcherExtensionPagePortMessage(port, message);
  });
  port.onDisconnect.addListener(() => {
    deleteTabSwitcherExtensionPagePort(getPortSenderTabId(port), port);
    Array.from(tabSwitcherExtensionPagePortsByTabId.entries()).forEach(([tabId, record]) => {
      if (record && record.port === port) {
        deleteTabSwitcherExtensionPagePort(tabId, port);
      }
    });
  });
}

function postTabSwitcherMessageToExtensionPage(
  tab: UrlTabLike | null | undefined,
  message: PageRequest<HostAction>,
  callback?: PortReplyCallback
): boolean {
  const tabId = tab ? tab.id : undefined;
  if (!tab || typeof tabId !== 'number' || !isTabSwitcherExtensionPageMessageTarget(tab)) {
    if (typeof callback === 'function') {
      callback(false, 'not-extension-page');
    }
    return false;
  }
  const startedAt = Date.now();
  const attemptPost = (): boolean => {
    const record = tabSwitcherExtensionPagePortsByTabId.get(tabId);
    if (!record || !record.port || typeof record.port.postMessage !== 'function') {
      if (Date.now() - startedAt < TAB_SWITCHER_EXTENSION_PAGE_PORT_WAIT_MS) {
        setTimeout(attemptPost, TAB_SWITCHER_EXTENSION_PAGE_PORT_RETRY_MS);
        return true;
      }
      if (typeof callback === 'function') {
        callback(false, 'extension-page-port-missing');
      }
      return false;
    }
    const requestId = ++tabSwitcherExtensionPageRequestSeq;
    const payload = { ...message, requestId };
    const timer = setTimeout(() => {
      if (!record.pending || !record.pending.has(requestId)) {
        return;
      }
      record.pending.delete(requestId);
      if (typeof callback === 'function') {
        callback(false, 'extension-page-timeout');
      }
    }, 1000);
    record.pending.set(requestId, {
      callback,
      timer
    });
    try {
      record.port.postMessage(payload);
      return true;
    } catch (error) {
      clearTimeout(timer);
      record.pending.delete(requestId);
      if (typeof callback === 'function') {
        callback(false, getErrorMessage(error, 'extension-page-post-failed'));
      }
      return false;
    }
  };
  return attemptPost();
}

export {
  TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME,
  hasTabSwitcherExtensionPagePort,
  isTabSwitcherExtensionPageMessageTarget,
  postTabSwitcherMessageToExtensionPage,
  registerTabSwitcherExtensionPagePortConnection
};
export type { HostAction, PortReplyCallback };
