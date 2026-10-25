// Recent-tab switcher (Alt+Q by default): the in-page host and the
// extension-page port bridge, opening/advancing/committing the switcher and
// relaying the shortcut release, the recent-tab list with its thumbnails
// (capture scheduling, persistence in session storage) and per-tab accent
// colors.
//
// A module of the service worker; background.ts imports it before its own code
// runs. background.ts wires the browser events and the show-tab-switcher command to
// the functions here.

import * as RECENT_TAB_SWITCHER from './recent-tab-switcher';
import {
  getDefaultSwitcherSelectedIndex,
  getFailedOpenTabSwitcherState,
  getSwitcherRegistrableThemeHost,
  getSwitcherThemeHostCandidates,
  getSwitcherThumbnailStatusForFailureReason,
  getTabSwitcherHeadSignature,
  getTabSwitcherThumbnailStorageKey,
  getThumbnailPersistSignature,
  isSwitcherThumbnailRefreshNeeded,
  normalizeOpenTabSwitcherStateResponse,
  normalizeOpenTabSwitcherStateScriptResults,
  normalizeTabSwitcherCommitResponse,
  normalizeTabSwitcherCommitScriptResults,
  normalizeTabSwitcherHostOkResponse,
  normalizeTabSwitcherHostOkScriptResults,
  readScriptResults,
  readTabSwitcherThumbnailStatus
} from '../domain/tab-switcher-model';
import type { OpenSwitcherState, SwitcherOffset } from '../domain/tab-switcher-model';
import * as BROWSER_PROFILE from '../platform/browser-profile';
import * as FAVICON_UTILS from '../domain/favicon/favicon-utils';
import * as NEWTAB_FAVICON_THEME from '../shared/favicon/favicon-theme';
import { openNewtabFallback, openNewtabFallbackForUrl } from './newtab-fallback';
import {
  SHOW_TAB_SWITCHER_COMMAND_NAME,
  SHOW_TAB_SWITCHER_REVERSE_COMMAND_NAME,
  areBackgroundSettingsLoaded,
  ignoreExpectedChromeError,
  logHotkeyDebug,
  warnBackgroundFailure,
  whenBackgroundSettingsReady
} from './worker-context';
import {
  BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES,
  arrayBufferToBase64,
  getBackgroundFaviconCacheRuntime,
  getBackgroundFaviconUrlResolver,
  inlineExtensionFaviconsForWebPage,
  loadFaviconEnhancedFetchEnabled,
  loadFaviconRequestBlacklistItems,
  normalizeFaviconHost,
  normalizeThemeAccentRgb,
  resolveSiteThemeColor,
  shouldBlockFaviconForHost,
  siteThemeColorCache,
  siteThemeColorPending
} from './favicon-service';
import {
  canOpenOverlayOnUrl,
  getResolvedTabUrl,
  isBrowserInternalUrl,
  isBrowserNewtabUrl,
  isOwnExtensionPageUrl
} from './browser-urls-service';
import { recordTabSwitchEvent } from './tab-switch-stats-service';
import * as LumnoMessaging from '../platform/messaging';
import type { SwitcherFields, ThumbnailState, TrackerState } from './recent-tab-switcher';
import type { ThemeRgb } from '../domain/favicon/favicon-utils';
import type {
  PageAction,
  PageRequest,
  SiteThemeColor,
  TabSwitcherContext,
  TabSwitcherItem,
  TabSwitcherThumbnailUpdate
} from '../domain/messages';

// A tab as the switcher's helpers read it: a browser tab, a tab from the
// recent list with its thumbnail fields, or a payload item.
interface SwitcherTab extends Partial<SwitcherFields> {
  id?: number;
  windowId?: number | null;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  incognito?: boolean;
  active?: boolean;
  pinned?: boolean;
  status?: chrome.tabs.Tab['status'];
  discarded?: boolean;
}

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

// How a host message is delivered and read: by message, or failing that by
// running scriptFunc in the page.
interface HostMessageOptions<T, A extends unknown[]> {
  scriptFunc: (...args: A) => unknown;
  scriptArgs: A;
  normalizeResponse: (response: unknown) => T | null;
  normalizeScriptResults: (results: unknown) => T | null;
  fallbackValue: T;
}

interface ThumbnailPriority {
  url: string;
  status: string;
  reason: string;
  markedAt: number;
}

interface CaptureRequest {
  tabId: number;
  windowId: number;
  reason: string;
  captureReason: string;
  requestedAt: number;
}

type CaptureResult = { ok: true; dataUrl: string } | { ok: false; reason: string };

// A switcher being opened in a window; a second press meanwhile is ignored.
interface SwitcherOpening {
  key: string;
  tabId: number | null;
  windowId: number | null;
  source: string;
  startedAt: number;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface InjectContext {
  currentTabId: number;
  selectedIndex: number;
  shortcut: string;
  // Opened by the reverse command, on the oldest tab.
  reverse: boolean;
  source: string;
  onOpenComplete: (ok: boolean, reason: string) => void;
}

// The keys bound to the switcher commands; reverse is '' while unbound.
interface TabSwitcherShortcuts {
  forward: string;
  reverse: string;
}

interface SwitchResult {
  ok: boolean;
  tabId?: number;
  windowId?: number | null;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// The recent-tab list and its thumbnails, kept in session storage.
const TAB_SWITCHER_THUMBNAIL_STORAGE_KEY = '_x_extension_tab_switcher_state_2026_unique_';

function hasTabSwitcherExtensionPagePort(tab: SwitcherTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const record = tabSwitcherExtensionPagePortsByTabId.get(tab.id);
  return Boolean(record && record.port && typeof record.port.postMessage === 'function');
}

function isTabSwitcherExtensionPageMessageTarget(tab: SwitcherTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (isOwnExtensionPageUrl(url)) {
    return true;
  }
  return isBrowserNewtabUrl(url) && hasTabSwitcherExtensionPagePort(tab);
}

function shouldTrackSwitcherTab(tab: SwitcherTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number' || tab.incognito === true) {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (!url) {
    return false;
  }
  if (isBrowserInternalUrl(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const protocol = String(parsed.protocol || '').toLowerCase();
    return Boolean(protocol) && protocol !== 'javascript:';
  } catch (_error) {
    return false;
  }
}

function canHostSwitcherSurface(tab: SwitcherTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  return isOwnExtensionPageUrl(url) ||
    (isBrowserNewtabUrl(url) && hasTabSwitcherExtensionPagePort(tab)) ||
    canOpenOverlayOnUrl(url);
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

export function registerTabSwitcherExtensionPagePortConnection(port: chrome.runtime.Port): void {
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
  tab: SwitcherTab | null | undefined,
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

// The functions below run in the page on their own: everything they use is
// defined inside them.
function setTabSwitcherCaptureVisibilityInPage(hidden: boolean, hostId: string): { ok: boolean; reason?: string } {
  const host = document.getElementById(hostId);
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

function getOpenTabSwitcherStateInPage(hostId: string): OpenSwitcherState {
  const host = document.getElementById(hostId);
  return {
    ok: true,
    open: Boolean(host)
  };
}

function updateTabSwitcherThumbnailInPage(update: unknown, hostId: string): unknown {
  const host = document.getElementById(hostId);
  const updateThumbnail: unknown = host ? Reflect.get(host, '_lumnoTabSwitcherUpdateThumbnail') : null;
  if (!host || typeof updateThumbnail !== 'function') {
    return { ok: false, reason: 'tab_switcher_host_missing' };
  }
  const result: unknown = Reflect.apply(updateThumbnail, host, [update]);
  return result || { ok: true };
}

function commitOpenTabSwitcherFromShortcutReleaseInPage(hostId: string): { ok: boolean; committed: boolean } {
  const host = document.getElementById(hostId);
  const commit: unknown = host ? Reflect.get(host, '_lumnoTabSwitcherCommitFromShortcutRelease') : null;
  if (!host || typeof commit !== 'function') {
    return { ok: false, committed: false };
  }
  return {
    ok: true,
    committed: Reflect.apply(commit, host, []) === true
  };
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

export function prepareShortcutKeyObserversInOpenTabs(): Promise<void> {
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

export function handleTabSwitcherShortcutModifierReleased(
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

function waitForTabSwitcherCapturePaint(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, TAB_SWITCHER_CAPTURE_HIDE_PAINT_WAIT_MS);
  });
}

function withTabSwitcherHiddenForCapture<T>(tab: SwitcherTab, capture: () => Promise<T>): Promise<T> {
  const runCapture = capture;
  return setTabSwitcherCaptureVisibility(tab, true)
    .catch(() => false)
    .then(() => waitForTabSwitcherCapturePaint())
    .then(() => runCapture())
    .finally(() => setTabSwitcherCaptureVisibility(tab, false));
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

// Reachable from the worker's console while diagnosing the release relay.
Reflect.set(globalThis, '_lumnoTabSwitcherShortcutDebug', Object.freeze({
  snapshot() {
    return tabSwitcherShortcutDebugEvents.map((event) => ({ ...event }));
  },
  clear() {
    tabSwitcherShortcutDebugEvents.length = 0;
  }
}));

const TAB_SWITCHER_EXTENSION_PAGE_PORT_NAME = 'lumno-tab-switcher-extension-page';

const TAB_SWITCHER_EXTENSION_PAGE_PORT_WAIT_MS = 650;

const TAB_SWITCHER_EXTENSION_PAGE_PORT_RETRY_MS = 50;

const TAB_SWITCHER_HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';

// Ports close when the worker suspends, so this registry dies with them.
const tabSwitcherExtensionPagePortsByTabId = new Map<number, ExtensionPagePortRecord>();

const TAB_SWITCHER_OPENING_GUARD_MS = 2000;

// Short-lived opening guard; losing it only allows a fresh open.
const tabSwitcherOpeningByWindowKey = new Map<string, SwitcherOpening>();

const TAB_SWITCHER_HOST_STATE_TIMEOUT_MS = 400;

// Hint only: findOpenTabSwitcherHostInWindow scans the window when it is missing.
export const tabSwitcherHostTabIdByWindowId = new Map<number, number>();

const TAB_SWITCHER_LIMIT = 5;

// Background captures (tab activation, window focus, load complete) wait for
// the tab to stay active this long, so cycling through tabs with Ctrl+Tab or a
// held Alt+Q captures only the tab the user stops on.
const TAB_SWITCHER_CAPTURE_SETTLE_MS = 800;

// An activation or window focus does not re-capture a tab whose thumbnail of
// the same URL is younger than this; a finished load always re-captures.
const TAB_SWITCHER_THUMBNAIL_FRESH_MS = 60 * 1000;

const TAB_SWITCHER_CAPTURE_REASON_LOAD_COMPLETE = 'updated-complete';

// Opening the switcher waits at most this long for a fresh shot of the
// current tab; a slower capture is patched into the open switcher.
const TAB_SWITCHER_OPEN_CAPTURE_BUDGET_MS = 120;

const TAB_SWITCHER_CAPTURE_HIDE_PAINT_WAIT_MS = 48;

const TAB_SWITCHER_CAPTURE_MIN_INTERVAL_MS = 650;

const TAB_SWITCHER_CAPTURE_JPEG_QUALITY = 42;

const TAB_SWITCHER_CAPTURE_REASON_COMMAND_IMMEDIATE = 'command-immediate';

const TAB_SWITCHER_THUMBNAIL_LIMIT = 12;

const TAB_SWITCHER_THUMBNAIL_TTL_MS = 1000 * 60 * 60 * 2;

const TAB_SWITCHER_THUMBNAIL_PERSIST_DEBOUNCE_MS = 350;

const TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH = 320;

const TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT = 200;

// Thumbnail capture scheduling; pending captures are simply retried on the
// next activation.
const tabSwitcherThumbnailTimersByTabId = new Map<number, ReturnType<typeof setTimeout>>();

const tabSwitcherThumbnailPriorityByTabId = new Map<number, ThumbnailPriority>();

let tabSwitcherThumbnailCaptureChain: Promise<boolean> = Promise.resolve(false);

let tabSwitcherLastCaptureAt = 0;

// Recent-tab switcher state: hydrated from storage on wake, written after a
// short debounce. That timer is what saves the state: Chrome does not reliably
// dispatch runtime.onSuspend to MV3 service workers (an idle worker lives far
// longer than the debounce anyway), while Firefox's event pages do get it, so
// the onSuspend flush only covers an event page unloaded with a write pending.
let tabSwitcherStateLoaded = false;

let tabSwitcherStateLoadPromise: Promise<boolean> | null = null;

let tabSwitcherStatePersistTimer: ReturnType<typeof setTimeout> | null = null;

let tabSwitcherStateDirtyBeforeLoad = false;

let tabSwitcherExtensionPageRequestSeq = 0;

const recentTabTracker = RECENT_TAB_SWITCHER.createRecentTabTracker({
  limit: TAB_SWITCHER_LIMIT,
  thumbnailLimit: TAB_SWITCHER_THUMBNAIL_LIMIT,
  thumbnailTtlMs: TAB_SWITCHER_THUMBNAIL_TTL_MS,
  shouldIncludeTab: shouldTrackSwitcherTab
});

function getTabSwitcherStateStorageArea(): chrome.storage.StorageArea | null {
  if (!chrome || !chrome.storage) {
    return null;
  }
  return chrome.storage.session || chrome.storage.local || null;
}

// The switcher state is saved as one small record (the recent-tab stack and
// which tabs have thumbnails) plus one key per thumbnail, and a save writes
// only the keys that changed. Saving every thumbnail on each tab switch
// rewrote ~150 KB, and storage.onChanged delivered the old and new copies to
// every open extension page.
let persistedTabSwitcherHeadSignature = '';
const persistedThumbnailSignatureByTabId = new Map<number, string>();

function readTabSwitcherStorage(storageArea: chrome.storage.StorageArea, keys: string[]): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    storageArea.get(keys, (result) => {
      resolve(chrome.runtime && chrome.runtime.lastError ? null : (result || {}));
    });
  });
}

// The stored state as saved; the tracker checks it as it hydrates.
async function getTabSwitcherStateFromStorage(): Promise<Record<string, unknown> | null> {
  const storageArea = getTabSwitcherStateStorageArea();
  if (!storageArea || typeof storageArea.get !== 'function') {
    return null;
  }
  const headResult = await readTabSwitcherStorage(storageArea, [TAB_SWITCHER_THUMBNAIL_STORAGE_KEY]);
  const head = headResult ? headResult[TAB_SWITCHER_THUMBNAIL_STORAGE_KEY] : null;
  if (!isRecord(head)) {
    return null;
  }
  // A state saved before the split keeps its thumbnails inline.
  if (Array.isArray(head.thumbnails)) {
    return head;
  }
  const storedTabIds: unknown[] = Array.isArray(head.thumbnailTabIds) ? head.thumbnailTabIds : [];
  const thumbnailTabIds = storedTabIds.filter((tabId) => Number.isInteger(tabId));
  const thumbnailResult = thumbnailTabIds.length
    ? await readTabSwitcherStorage(storageArea, thumbnailTabIds.map(getTabSwitcherThumbnailStorageKey))
    : {};
  const thumbnails = thumbnailTabIds
    .map((tabId) => thumbnailResult && thumbnailResult[getTabSwitcherThumbnailStorageKey(tabId)])
    .filter(isRecord);
  persistedTabSwitcherHeadSignature = getTabSwitcherHeadSignature(head);
  persistedThumbnailSignatureByTabId.clear();
  thumbnails.forEach((entry) => {
    if (typeof entry.tabId === 'number') {
      persistedThumbnailSignatureByTabId.set(entry.tabId, getThumbnailPersistSignature(entry));
    }
  });
  return { ...head, thumbnails };
}

function setTabSwitcherStateToStorage(state: TrackerState): Promise<boolean> {
  const storageArea = getTabSwitcherStateStorageArea();
  if (!storageArea || typeof storageArea.set !== 'function' || !state) {
    return Promise.resolve(false);
  }
  const thumbnails = Array.isArray(state.thumbnails) ? state.thumbnails : [];
  const head = {
    version: state.version,
    savedAt: state.savedAt,
    stack: state.stack,
    thumbnailTabIds: thumbnails.map((entry) => entry.tabId)
  };
  const headSignature = getTabSwitcherHeadSignature(head);
  const writes: Record<string, unknown> = {};
  const nextSignatures = new Map<number, string>();
  thumbnails.forEach((entry) => {
    const signature = getThumbnailPersistSignature(entry);
    nextSignatures.set(entry.tabId, signature);
    if (persistedThumbnailSignatureByTabId.get(entry.tabId) !== signature) {
      writes[getTabSwitcherThumbnailStorageKey(entry.tabId)] = entry;
    }
  });
  if (headSignature !== persistedTabSwitcherHeadSignature) {
    writes[TAB_SWITCHER_THUMBNAIL_STORAGE_KEY] = head;
  }
  const removals = Array.from(persistedThumbnailSignatureByTabId.keys())
    .filter((tabId) => !nextSignatures.has(tabId))
    .map(getTabSwitcherThumbnailStorageKey);
  if (!Object.keys(writes).length && !removals.length) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    storageArea.set(writes, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      persistedTabSwitcherHeadSignature = headSignature;
      persistedThumbnailSignatureByTabId.clear();
      nextSignatures.forEach((signature, tabId) => {
        persistedThumbnailSignatureByTabId.set(tabId, signature);
      });
      if (!removals.length || typeof storageArea.remove !== 'function') {
        resolve(true);
        return;
      }
      storageArea.remove(removals, () => {
        resolve(!(chrome.runtime && chrome.runtime.lastError));
      });
    });
  });
}

export function ensureTabSwitcherStateLoaded(): Promise<boolean> {
  if (tabSwitcherStateLoaded) {
    return Promise.resolve(true);
  }
  if (tabSwitcherStateLoadPromise) {
    return tabSwitcherStateLoadPromise;
  }
  tabSwitcherStateLoadPromise = getTabSwitcherStateFromStorage()
    .then((state) => {
      if (state) {
        recentTabTracker.hydrateState(state, {
          merge: tabSwitcherStateDirtyBeforeLoad === true
        });
      }
      tabSwitcherStateLoaded = true;
      if (tabSwitcherStateDirtyBeforeLoad) {
        schedulePersistTabSwitcherState();
      }
      return true;
    })
    .catch(() => {
      tabSwitcherStateLoaded = true;
      return false;
    })
    .finally(() => {
      tabSwitcherStateLoadPromise = null;
      tabSwitcherStateDirtyBeforeLoad = false;
    });
  return tabSwitcherStateLoadPromise;
}

function persistTabSwitcherState(): Promise<boolean> {
  tabSwitcherStatePersistTimer = null;
  if (!tabSwitcherStateLoaded) {
    // Writing now would replace the stored state with only this wake's
    // changes; the load merges them and schedules the write itself.
    return Promise.resolve(false);
  }
  return setTabSwitcherStateToStorage(recentTabTracker.exportState());
}

function schedulePersistTabSwitcherState(): void {
  if (!tabSwitcherStateLoaded) {
    tabSwitcherStateDirtyBeforeLoad = true;
  }
  if (tabSwitcherStatePersistTimer !== null) {
    clearTimeout(tabSwitcherStatePersistTimer);
  }
  tabSwitcherStatePersistTimer = setTimeout(() => {
    persistTabSwitcherState().catch(warnBackgroundFailure('Failed to save the recent-tab switcher state.'));
  }, TAB_SWITCHER_THUMBNAIL_PERSIST_DEBOUNCE_MS);
}

export function flushPendingTabSwitcherState(): Promise<boolean> {
  if (tabSwitcherStatePersistTimer === null || !tabSwitcherStateLoaded) {
    return Promise.resolve(false);
  }
  clearTimeout(tabSwitcherStatePersistTimer);
  tabSwitcherStatePersistTimer = null;
  return persistTabSwitcherState().catch((error: unknown) => {
    warnBackgroundFailure('Failed to save the recent-tab switcher state.')(error);
    return false;
  });
}

export function recordRecentSwitcherTab(tab: chrome.tabs.Tab | null | undefined, at?: number): ReturnType<typeof recentTabTracker.recordTab> {
  const snapshot = recentTabTracker.recordTab(tab, at);
  if (snapshot) {
    schedulePersistTabSwitcherState();
  }
  return snapshot;
}

export function updateRecentSwitcherTab(tab: chrome.tabs.Tab | null | undefined, at?: number): ReturnType<typeof recentTabTracker.updateTab> {
  const snapshot = recentTabTracker.updateTab(tab, at);
  if (snapshot) {
    schedulePersistTabSwitcherState();
  }
  return snapshot;
}

export function removeRecentSwitcherTab(tabId: number): void {
  clearSwitcherThumbnailPriority(tabId);
  if (recentTabTracker.removeTab(tabId)) {
    schedulePersistTabSwitcherState();
  }
}

function getSwitcherThumbnailStateForPayload(tab: SwitcherTab & { id: number }, url: string): ThumbnailState {
  // Also drops blurred captures saved before such pages were skipped.
  if (isFirefoxPrivilegedPageUrl(url)) {
    return { status: 'restricted', reason: 'restricted-browser-page', dataUrl: '', capturedAt: 0, updatedAt: 0 };
  }
  const status = readTabSwitcherThumbnailStatus(tab._xSwitcherThumbnailStatus);
  if (status) {
    return {
      status,
      reason: typeof tab._xSwitcherThumbnailReason === 'string' ? tab._xSwitcherThumbnailReason : '',
      dataUrl: typeof tab._xSwitcherThumbnail === 'string' ? tab._xSwitcherThumbnail : '',
      capturedAt: 0,
      updatedAt: 0
    };
  }
  return recentTabTracker.getThumbnailState(tab.id, url);
}

// Opening the switcher takes a fresh shot of the current tab, unless the page
// is still loading or Chrome's two-captures-per-second limit would refuse it.
function shouldPreCaptureActiveSwitcherThumbnailBeforePayload(tab: chrome.tabs.Tab): boolean {
  const isActive = tab && tab.active === true;
  if (!isActive || tab.status === 'loading' || !canCaptureSwitcherThumbnail(tab) || typeof tab.id !== 'number') {
    return false;
  }
  const state = getSwitcherThumbnailStateForPayload({ ...tab, id: tab.id }, getResolvedTabUrl(tab));
  if (state && state.status === 'restricted') {
    return false;
  }
  return (Date.now() - tabSwitcherLastCaptureAt) >= TAB_SWITCHER_CAPTURE_MIN_INTERVAL_MS ||
    isSwitcherThumbnailRefreshNeeded(state);
}

function waitForSwitcherOpenCapture(captureReady: Promise<boolean>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, TAB_SWITCHER_OPEN_CAPTURE_BUDGET_MS);
    Promise.resolve(captureReady).catch(() => false).then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function findSwitcherTabById(tabList: readonly chrome.tabs.Tab[], tabId: number): chrome.tabs.Tab | null {
  if (typeof tabId !== 'number') {
    return null;
  }
  return (Array.isArray(tabList) ? tabList : []).find((tab) =>
    tab && typeof tab.id === 'number' && tab.id === tabId
  ) || null;
}

function markSwitcherThumbnailPriorityForItems(items: readonly TabSwitcherItem[], tabList: readonly chrome.tabs.Tab[], reason: string): void {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  items.forEach((item) => {
    if (!item || typeof item.id !== 'number') {
      return;
    }
    if (!isSwitcherThumbnailRefreshNeeded({
      status: item.thumbnailStatus,
      dataUrl: item.thumbnail
    })) {
      return;
    }
    const tab: SwitcherTab = findSwitcherTabById(tabList, item.id) || item;
    if (!canCaptureSwitcherThumbnail(tab)) {
      return;
    }
    tabSwitcherThumbnailPriorityByTabId.set(item.id, {
      url: getResolvedTabUrl(tab) || item.url || '',
      status: item.thumbnailStatus || 'missing',
      reason: reason || '',
      markedAt: Date.now()
    });
  });
}

export function clearSwitcherThumbnailPriority(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  tabSwitcherThumbnailPriorityByTabId.delete(tabId);
}

function consumeSwitcherThumbnailPriority(tab: SwitcherTab, reason: string): boolean {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  if (typeof tabId !== 'number') {
    return false;
  }
  const entry = tabSwitcherThumbnailPriorityByTabId.get(tabId);
  if (!entry) {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (entry.url && url && entry.url !== url) {
    clearSwitcherThumbnailPriority(tabId);
    return false;
  }
  const state = recentTabTracker.getThumbnailState(tabId, url);
  if (!isSwitcherThumbnailRefreshNeeded(state)) {
    clearSwitcherThumbnailPriority(tabId);
    return false;
  }
  clearSwitcherThumbnailPriority(tabId);
  logHotkeyDebug('tab-switcher-thumbnail-priority-consumed', {
    tabId,
    url,
    reason: reason || '',
    markedReason: entry.reason || '',
    status: entry.status || ''
  });
  return true;
}

function markSwitcherThumbnailStatus(tab: SwitcherTab | null | undefined, status: string, requestReason: string, failureReason: string): boolean {
  if (!tab || typeof tab.id !== 'number') {
    return false;
  }
  const didSet = recentTabTracker.setThumbnailStatus(tab.id, status, Date.now(), {
    url: getResolvedTabUrl(tab),
    reason: failureReason || requestReason || ''
  });
  if (didSet) {
    schedulePersistTabSwitcherState();
  }
  return didSet;
}

// Firefox gives its about: pages chrome:// icons that web pages cannot load,
// and those monochrome icons would vanish on a dark switcher anyway. The
// switcher shows the browser's own logo (Firefox, Zen, ...) for them instead,
// rasterized once into a data URL that any page can render.
let firefoxBrandIconDataUrl = '';

export function loadFirefoxBrandIcon(): void {
  if (!BROWSER_PROFILE.isFirefoxExtensionRuntime() || typeof Image !== 'function' || typeof document === 'undefined') {
    return;
  }
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) {
        firefoxBrandIconDataUrl = '';
        return;
      }
      context.drawImage(image, 0, 0, 64, 64);
      firefoxBrandIconDataUrl = canvas.toDataURL('image/png');
    } catch (_error) {
      firefoxBrandIconDataUrl = '';
    }
  };
  image.src = 'chrome://branding/content/icon64.png';
}

function isFirefoxPrivilegedPageUrl(url: unknown): boolean {
  return /^about:/i.test(String(url || '')) && BROWSER_PROFILE.isFirefoxExtensionRuntime();
}

function buildSwitcherTabFavicon(tab: SwitcherTab, url: string): string {
  const resolved = String(url || getResolvedTabUrl(tab) || '').trim();
  if (firefoxBrandIconDataUrl && isFirefoxPrivilegedPageUrl(resolved) &&
      !/^(?:data:image\/|https?:)/i.test(String(tab && tab.favIconUrl || ''))) {
    return firefoxBrandIconDataUrl;
  }
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.resolveFaviconSource(tab && tab.favIconUrl, resolved) : '';
}

function getCachedSiteThemeColorForSwitcher(host: unknown, origin: unknown): SiteThemeColor | null {
  const normalizedHost = normalizeFaviconHost(host);
  const normalizedOrigin = String(origin || '').trim();
  if (!normalizedHost) {
    return null;
  }
  const candidateHosts = getSwitcherThemeHostCandidates(normalizedHost);
  for (const candidateHost of candidateHosts) {
    const exactKey = `${candidateHost}::${normalizedOrigin}::auto`;
    const exact = normalizedOrigin ? siteThemeColorCache.get(exactKey) : null;
    if (exact && normalizeThemeAccentRgb(exact.accentRgb)) {
      return exact;
    }
  }
  for (const [key, value] of siteThemeColorCache.entries()) {
    if (!value || !normalizeThemeAccentRgb(value.accentRgb)) {
      continue;
    }
    const cachedHost = normalizeFaviconHost(String(key || '').split('::')[0]);
    if (!cachedHost) {
      continue;
    }
    if (candidateHosts.some((candidateHost) =>
      cachedHost === candidateHost ||
        cachedHost.endsWith(`.${candidateHost}`)
    )) {
      return value;
    }
  }
  return null;
}

function getPersistedSiteThemeColorForSwitcher(host: unknown): SiteThemeColor | null {
  const runtime = getBackgroundFaviconCacheRuntime();
  if (!runtime || typeof runtime.getPersistedThemeEntry !== 'function') {
    return null;
  }
  const candidateHosts = getSwitcherThemeHostCandidates(host);
  for (const candidateHost of candidateHosts) {
    const entry = runtime.getPersistedThemeEntry(candidateHost);
    const accentRgb = normalizeThemeAccentRgb(entry && entry.accentRgb);
    if (entry && accentRgb) {
      return {
        accentRgb,
        source: entry.source || 'cache',
        neutral: entry.neutral === true,
        confidence: entry.confidence || FAVICON_UTILS.getThemeColorConfidence(accentRgb)
      };
    }
  }
  return null;
}

function persistSiteThemeColorForSwitcher(host: string, result: SiteThemeColor | null): boolean {
  const runtime = getBackgroundFaviconCacheRuntime();
  const accentRgb = normalizeThemeAccentRgb(result && result.accentRgb);
  if (!runtime ||
      typeof runtime.setPersistedThemeEntry !== 'function' ||
      !host ||
      !result ||
      !accentRgb) {
    return false;
  }
  return runtime.setPersistedThemeEntry(host, {
    accentRgb,
    source: result.source || 'meta',
    neutral: result.neutral === true,
    confidence: result.confidence || FAVICON_UTILS.getThemeColorConfidence(accentRgb)
  });
}

function getNewtabBrandAccentForSwitcher(host: unknown, url: string): ThemeRgb | null {
  const normalizedHost = normalizeFaviconHost(host);
  let accentRgb: ThemeRgb | null = null;
  if (normalizedHost) {
    accentRgb = NEWTAB_FAVICON_THEME.getBrandAccentForHost(normalizedHost);
  }
  if (!accentRgb) {
    accentRgb = NEWTAB_FAVICON_THEME.getBrandAccentForUrl(url);
  }
  return normalizeThemeAccentRgb(accentRgb);
}

function normalizeSwitcherAccentRgbForPayload(accentRgb: unknown): ThemeRgb | null {
  const rgb = normalizeThemeAccentRgb(accentRgb);
  if (!rgb) {
    return null;
  }
  if (FAVICON_UTILS.getThemeColorConfidence(rgb) === 'neutral') {
    return normalizeThemeAccentRgb(NEWTAB_FAVICON_THEME.defaultAccentColor) || [59, 130, 246];
  }
  return rgb;
}

function warmSwitcherTabThemeColor(host: unknown, url: string): void {
  const normalizedHost = normalizeFaviconHost(host);
  const resolved = String(url || '').trim();
  if (!normalizedHost || !resolved) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch (_error) {
    return;
  }
  if (!/^https?:$/i.test(parsed.protocol) ||
      shouldBlockFaviconForHost(parsed.hostname) ||
      shouldBlockFaviconForHost(normalizedHost)) {
    return;
  }
  const cacheKey = `${normalizedHost}::${parsed.origin}::auto`;
  if (siteThemeColorCache.has(cacheKey) || siteThemeColorPending.has(cacheKey)) {
    return;
  }
  if (switcherThemeColorWarmups.has(cacheKey)) {
    return;
  }
  switcherThemeColorWarmups.add(cacheKey);
  resolveSiteThemeColor(resolved, normalizedHost, '')
    .then((result) => {
      const accentRgb = normalizeThemeAccentRgb(result && result.accentRgb);
      const sharedHost = getSwitcherRegistrableThemeHost(normalizedHost);
      if (result && accentRgb && sharedHost && sharedHost !== normalizedHost) {
        const sharedKey = `${sharedHost}::${parsed.origin}::auto`;
        FAVICON_UTILS.setBoundedCacheEntry(
          siteThemeColorCache,
          sharedKey,
          result,
          BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES
        );
        persistSiteThemeColorForSwitcher(sharedHost, result);
      }
    })
    .catch(() => null)
    .finally(() => {
      switcherThemeColorWarmups.delete(cacheKey);
    });
}

function getSwitcherTabAccentRgb(tab: SwitcherTab, url: string): ThemeRgb | null {
  const resolved = String(url || getResolvedTabUrl(tab) || '').trim();
  if (!resolved) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch (_error) {
    return null;
  }
  if (!/^https?:$/i.test(parsed.protocol) || shouldBlockFaviconForHost(parsed.hostname)) {
    return null;
  }
  const host = normalizeFaviconHost(parsed.hostname);
  const brandAccent = getNewtabBrandAccentForSwitcher(host, resolved);
  warmSwitcherTabThemeColor(host, resolved);
  if (brandAccent) {
    return brandAccent;
  }
  const cached = getCachedSiteThemeColorForSwitcher(host, parsed.origin) ||
    getPersistedSiteThemeColorForSwitcher(host);
  return normalizeSwitcherAccentRgbForPayload(cached && cached.accentRgb);
}

async function prepareSwitcherThumbnailDataUrl(dataUrl: unknown): Promise<string> {
  const source = typeof dataUrl === 'string' ? dataUrl : '';
  if (!source.startsWith('data:image/')) {
    return '';
  }
  if (typeof OffscreenCanvas !== 'function' ||
      typeof createImageBitmap !== 'function' ||
      typeof fetch !== 'function') {
    return source;
  }
  try {
    const response = await fetch(source);
    const blob = response && typeof response.blob === 'function' ? await response.blob() : null;
    if (!blob) {
      return source;
    }
    const bitmap = await createImageBitmap(blob);
    const sourceWidth = Math.max(1, bitmap.width || 1);
    const sourceHeight = Math.max(1, bitmap.height || 1);
    const targetRatio = TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH / TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT;
    const sourceRatio = sourceWidth / sourceHeight;
    let cropX = 0;
    const cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (sourceRatio > targetRatio) {
      cropWidth = Math.max(1, Math.round(sourceHeight * targetRatio));
      cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
    } else if (sourceRatio < targetRatio) {
      cropHeight = Math.max(1, Math.round(sourceWidth / targetRatio));
    }
    const canvas = new OffscreenCanvas(TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH, TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
      return source;
    }
    context.drawImage(
      bitmap,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH,
      TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT
    );
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }
    const outputBlob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: 0.68
    });
    const buffer = await outputBlob.arrayBuffer();
    return `data:${outputBlob.type || 'image/webp'};base64,${arrayBufferToBase64(buffer)}`;
  } catch (_error) {
    return source;
  }
}

function canCaptureSwitcherThumbnail(tab: SwitcherTab | null | undefined): boolean {
  return getSwitcherThumbnailCaptureFailureReason(tab) === '';
}

function getSwitcherThumbnailCaptureFailureReason(tab: SwitcherTab | null | undefined): string {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return 'invalid-tab';
  }
  if (!shouldTrackSwitcherTab(tab)) {
    return 'untracked-tab';
  }
  const url = getResolvedTabUrl(tab);
  try {
    const parsed = new URL(url);
    const protocol = String(parsed.protocol || '').toLowerCase();
    if (!protocol || protocol === 'javascript:') {
      return 'unsupported-protocol';
    }
    // Firefox only returns a small, deliberately blurred capture of its
    // privileged pages; show the icon fallback instead, as for chrome:// pages.
    if (isFirefoxPrivilegedPageUrl(url)) {
      return 'restricted-browser-page';
    }
    return '';
  } catch (_error) {
    return 'invalid-url';
  }
}

function logSwitcherThumbnailCaptureFailure(tab: SwitcherTab | null | undefined, failureReason: string, requestReason: string): void {
  markSwitcherThumbnailStatus(tab, getSwitcherThumbnailStatusForFailureReason(failureReason), requestReason, failureReason);
  logHotkeyDebug('tab-switcher-thumbnail-failed', {
    tabId: tab && typeof tab.id === 'number' ? tab.id : null,
    windowId: tab && typeof tab.windowId === 'number' ? tab.windowId : null,
    url: getResolvedTabUrl(tab),
    reason: failureReason || 'unknown',
    requestReason: requestReason || ''
  });
}

function logSwitcherThumbnailCaptureSuccess(tab: SwitcherTab, requestReason: string): void {
  logHotkeyDebug('tab-switcher-thumbnail-captured', {
    tabId: tab && typeof tab.id === 'number' ? tab.id : null,
    windowId: tab && typeof tab.windowId === 'number' ? tab.windowId : null,
    url: getResolvedTabUrl(tab),
    requestReason: requestReason || ''
  });
}

function waitForSwitcherThumbnailCaptureSlot(): Promise<void> {
  const sinceLast = Date.now() - tabSwitcherLastCaptureAt;
  const waitMs = Math.max(0, TAB_SWITCHER_CAPTURE_MIN_INTERVAL_MS - sinceLast);
  if (waitMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, waitMs);
  });
}

function clearScheduledSwitcherThumbnailCapture(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  const timer = tabSwitcherThumbnailTimersByTabId.get(tabId);
  if (timer !== undefined) {
    clearTimeout(timer);
    tabSwitcherThumbnailTimersByTabId.delete(tabId);
  }
}

function enqueueSwitcherThumbnailCapture(tab: chrome.tabs.Tab, reason: string): Promise<boolean> {
  markSwitcherThumbnailStatus(tab, 'pending', reason, '');
  const runCapture = () => waitForSwitcherThumbnailCaptureSlot()
    .then(() => captureSwitcherThumbnailForTab(tab, reason));
  const queued = tabSwitcherThumbnailCaptureChain
    .catch(() => false)
    .then(runCapture);
  tabSwitcherThumbnailCaptureChain = queued.catch(() => false);
  return queued;
}

function isTabSwitcherOpeningForCapture(tab: SwitcherTab): boolean {
  const key = getTabSwitcherOpeningWindowKey(tab);
  if (!key) {
    return false;
  }
  const opening = tabSwitcherOpeningByWindowKey.get(key);
  return Boolean(opening && opening.expiresAt > Date.now());
}

function isSwitcherCommandCaptureReason(reason: unknown): boolean {
  const requestReason = String(reason || '');
  return requestReason === TAB_SWITCHER_CAPTURE_REASON_COMMAND_IMMEDIATE;
}

function shouldSkipSwitcherThumbnailCaptureForOpenSwitcher(tab: SwitcherTab, reason: string): Promise<boolean> {
  if (isSwitcherCommandCaptureReason(reason)) {
    return Promise.resolve(false);
  }
  if (isTabSwitcherOpeningForCapture(tab)) {
    return Promise.resolve(true);
  }
  return getOpenTabSwitcherState(tab)
    .then((state) => Boolean(state && state.open === true))
    .catch(() => false);
}

function captureSwitcherThumbnailForTab(tab: chrome.tabs.Tab, reason: string): Promise<boolean> {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  const windowId = tab && typeof tab.windowId === 'number' ? tab.windowId : null;
  clearScheduledSwitcherThumbnailCapture(tabId);
  if (typeof tabId !== 'number' || typeof windowId !== 'number') {
    logSwitcherThumbnailCaptureFailure(tab, 'invalid-tab', reason);
    return Promise.resolve(false);
  }
  if (!chrome || !chrome.tabs || typeof chrome.tabs.captureVisibleTab !== 'function') {
    logSwitcherThumbnailCaptureFailure(tab, 'capture-api-unavailable', reason);
    return Promise.resolve(false);
  }
  const captureResolvedTab = (resolvedTab: chrome.tabs.Tab): Promise<boolean> => new Promise((resolve) => {
    const failureReason = getSwitcherThumbnailCaptureFailureReason(resolvedTab);
    if (failureReason) {
      logSwitcherThumbnailCaptureFailure(resolvedTab || tab, failureReason, reason);
      resolve(false);
      return;
    }
    if (!resolvedTab || resolvedTab.active !== true) {
      logSwitcherThumbnailCaptureFailure(resolvedTab || tab, 'inactive-tab', reason);
      resolve(false);
      return;
    }
    shouldSkipSwitcherThumbnailCaptureForOpenSwitcher(resolvedTab, reason).then((shouldSkip) => {
      if (shouldSkip) {
        logSwitcherThumbnailCaptureFailure(resolvedTab, 'tab-switcher-open', reason);
        resolve(false);
        return;
      }
      tabSwitcherLastCaptureAt = Date.now();
      withTabSwitcherHiddenForCapture(resolvedTab, () => new Promise<CaptureResult>((captureResolve) => {
        try {
          chrome.tabs.captureVisibleTab(windowId, {
            format: 'jpeg',
            quality: TAB_SWITCHER_CAPTURE_JPEG_QUALITY
          }, (dataUrl) => {
            const lastError = chrome.runtime && chrome.runtime.lastError;
            if (lastError) {
              captureResolve({
                ok: false,
                reason: lastError.message || 'capture-visible-tab-failed'
              });
              return;
            }
            captureResolve({
              ok: true,
              dataUrl
            });
          });
        } catch (error) {
          captureResolve({
            ok: false,
            reason: getErrorMessage(error, 'capture-visible-tab-threw')
          });
        }
      })).then((captureResult) => {
        if (!captureResult || !('dataUrl' in captureResult)) {
          logSwitcherThumbnailCaptureFailure(
            resolvedTab,
            captureResult && 'reason' in captureResult && captureResult.reason ? captureResult.reason : 'capture-visible-tab-failed',
            reason
          );
          resolve(false);
          return;
        }
        prepareSwitcherThumbnailDataUrl(captureResult.dataUrl).then((thumbnailDataUrl) => {
          if (!thumbnailDataUrl) {
            logSwitcherThumbnailCaptureFailure(resolvedTab, 'empty-thumbnail-data', reason);
            resolve(false);
            return;
          }
          const resolvedTabId = typeof resolvedTab.id === 'number' ? resolvedTab.id : tabId;
          const didSet = recentTabTracker.setThumbnail(resolvedTabId, thumbnailDataUrl, Date.now(), {
            url: getResolvedTabUrl(resolvedTab)
          });
          if (didSet) {
            schedulePersistTabSwitcherState();
            if (isSwitcherCommandCaptureReason(reason)) {
              // The switcher may have closed or its tab navigated meanwhile.
              postTabSwitcherThumbnailUpdate(resolvedTab, {
                tabId: resolvedTabId,
                url: getResolvedTabUrl(resolvedTab),
                thumbnail: thumbnailDataUrl,
                thumbnailStatus: 'ok',
                thumbnailReason: ''
              }).catch(() => {});
            }
            logSwitcherThumbnailCaptureSuccess(resolvedTab, reason);
          } else {
            logSwitcherThumbnailCaptureFailure(resolvedTab, 'thumbnail-cache-rejected', reason);
          }
          resolve(Boolean(didSet));
        }).catch(() => {
          logSwitcherThumbnailCaptureFailure(resolvedTab, 'prepare-thumbnail-failed', reason);
          resolve(false);
        });
      }).catch(() => {
        logSwitcherThumbnailCaptureFailure(resolvedTab, 'capture-visible-tab-failed', reason);
        resolve(false);
      });
    }).catch(() => {
      logSwitcherThumbnailCaptureFailure(resolvedTab, 'tab-switcher-open-state-failed', reason);
      resolve(false);
    });
  });
  if (typeof chrome.tabs.get !== 'function') {
    return captureResolvedTab(tab);
  }
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (freshTab) => {
      const lastError = chrome.runtime && chrome.runtime.lastError;
      if (lastError) {
        logSwitcherThumbnailCaptureFailure(tab, lastError.message || 'tabs-get-failed', reason);
        resolve(false);
        return;
      }
      captureResolvedTab(freshTab || tab).then(resolve).catch(() => {
        resolve(false);
      });
    });
  });
}

function hasFreshSwitcherThumbnail(tab: SwitcherTab, now: number): boolean {
  if (typeof tab.id !== 'number') {
    return false;
  }
  const state = recentTabTracker.getThumbnailState(tab.id, getResolvedTabUrl(tab));
  const capturedAt = Number(state && state.capturedAt) || 0;
  // getThumbnailState drops the image when the tab's URL changed since.
  return Boolean(state && state.dataUrl) &&
    capturedAt > 0 &&
    (now - capturedAt) < TAB_SWITCHER_THUMBNAIL_FRESH_MS;
}

function isSwitcherThumbnailCaptureWanted(tab: SwitcherTab, reason: string, now: number): boolean {
  return reason === TAB_SWITCHER_CAPTURE_REASON_LOAD_COMPLETE ||
    !hasFreshSwitcherThumbnail(tab, now);
}

function isSwitcherWindowFocused(windowId: number): Promise<boolean> {
  if (!chrome.windows || typeof chrome.windows.get !== 'function') {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    try {
      chrome.windows.get(windowId, (win) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(false);
          return;
        }
        resolve(Boolean(win && win.focused !== false));
      });
    } catch (_error) {
      resolve(false);
    }
  });
}

// Re-checked when the settle timer fires: the tab must still be the active tab
// of a focused window, on a URL whose thumbnail is still wanted.
function getSettledSwitcherCaptureTab(request: CaptureRequest): Promise<chrome.tabs.Tab | null> {
  if (!tabSwitcherEnabledCache || typeof chrome.tabs.get !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    chrome.tabs.get(request.tabId, (freshTab) => {
      if ((chrome.runtime && chrome.runtime.lastError) ||
          !freshTab ||
          freshTab.active !== true ||
          freshTab.windowId !== request.windowId ||
          !canCaptureSwitcherThumbnail(freshTab) ||
          !isSwitcherThumbnailCaptureWanted(freshTab, request.reason, Date.now())) {
        resolve(null);
        return;
      }
      isSwitcherWindowFocused(freshTab.windowId).then((focused) => {
        resolve(focused ? freshTab : null);
      });
    });
  });
}

export function scheduleSwitcherThumbnailCapture(tab: chrome.tabs.Tab, reason: string): void {
  if (!areBackgroundSettingsLoaded()) {
    whenBackgroundSettingsReady(() => {
      scheduleSwitcherThumbnailCapture(tab, reason);
    });
    return;
  }
  // Thumbnails exist only for the switcher's previews.
  if (!tabSwitcherEnabledCache) {
    return;
  }
  if (!canCaptureSwitcherThumbnail(tab)) {
    logSwitcherThumbnailCaptureFailure(tab, getSwitcherThumbnailCaptureFailureReason(tab), reason);
    return;
  }
  if (!chrome || !chrome.tabs || typeof chrome.tabs.captureVisibleTab !== 'function') {
    logSwitcherThumbnailCaptureFailure(tab, 'capture-api-unavailable', reason);
    return;
  }
  const requestReason = String(reason || '');
  const now = Date.now();
  if (!isSwitcherThumbnailCaptureWanted(tab, requestReason, now)) {
    return;
  }
  const tabId = tab.id;
  if (typeof tabId !== 'number') {
    return;
  }
  const hasPriority = consumeSwitcherThumbnailPriority(tab, requestReason);
  clearScheduledSwitcherThumbnailCapture(tabId);
  const request: CaptureRequest = {
    tabId,
    windowId: tab.windowId,
    reason: requestReason,
    captureReason: hasPriority ? `priority-${requestReason || 'visible'}` : requestReason,
    requestedAt: now
  };
  const timer = setTimeout(() => {
    tabSwitcherThumbnailTimersByTabId.delete(request.tabId);
    getSettledSwitcherCaptureTab(request).then((settledTab) => {
      if (!settledTab) {
        return;
      }
      // Capture failures are already logged by captureSwitcherThumbnailForTab.
      enqueueSwitcherThumbnailCapture(settledTab, request.captureReason).catch(() => {});
    }).catch(() => {});
  }, TAB_SWITCHER_CAPTURE_SETTLE_MS);
  tabSwitcherThumbnailTimersByTabId.set(tabId, timer);
}

function clearSwitcherThumbnailsForDisabledSwitcher(): Promise<boolean | void> {
  tabSwitcherThumbnailTimersByTabId.forEach((timer) => clearTimeout(timer));
  tabSwitcherThumbnailTimersByTabId.clear();
  tabSwitcherThumbnailPriorityByTabId.clear();
  return ensureTabSwitcherStateLoaded().catch(() => false).then(() => {
    if (!recentTabTracker.clearThumbnails()) {
      return false;
    }
    if (tabSwitcherStatePersistTimer !== null) {
      clearTimeout(tabSwitcherStatePersistTimer);
    }
    return persistTabSwitcherState();
  }).catch(warnBackgroundFailure('Failed to clear the recent-tab switcher thumbnails.'));
}

// Mirrors the stored setting, re-read on every wake; background.js applies it.
let tabSwitcherEnabledCache = true;

// Browsers that present each space as its own window need this to keep other
// spaces out of the list; by default every normal window shares one list.
let tabSwitcherCurrentWindowOnlyCache = false;

export function applyTabSwitcherCurrentWindowOnlySetting(enabled: unknown): void {
  tabSwitcherCurrentWindowOnlyCache = enabled === true;
}

export function applyTabSwitcherEnabledSetting(enabled: unknown): void {
  tabSwitcherEnabledCache = enabled === true;
  if (!tabSwitcherEnabledCache) {
    void clearSwitcherThumbnailsForDisabledSwitcher();
  }
}

function normalizeSwitcherTabForPayload(tab: SwitcherTab | null | undefined, currentTabId: number | undefined): TabSwitcherItem | null {
  if (!tab || typeof tab.id !== 'number') {
    return null;
  }
  const url = getResolvedTabUrl(tab);
  if (!url) {
    return null;
  }
  const thumbnailState = getSwitcherThumbnailStateForPayload({ ...tab, id: tab.id }, url);
  return {
    id: tab.id,
    windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
    url,
    title: String(tab.title || '').replace(/\s+/g, ' ').trim() || url,
    favIconUrl: buildSwitcherTabFavicon(tab, url),
    accentRgb: getSwitcherTabAccentRgb(tab, url),
    active: Boolean(tab.active),
    pinned: Boolean(tab.pinned),
    current: typeof currentTabId === 'number' && tab.id === currentTabId,
    thumbnail: thumbnailState.dataUrl,
    thumbnailStatus: thumbnailState.status,
    thumbnailReason: thumbnailState.reason
  };
}

function getRecentTabsForSwitcher(
  tabList: readonly chrome.tabs.Tab[],
  currentTabId: number | undefined,
  windowId: number | undefined
): TabSwitcherItem[] {
  const normalizedTabs = (Array.isArray(tabList) ? tabList : [])
    .filter((tab) => !tabSwitcherCurrentWindowOnlyCache || (tab && tab.windowId === windowId))
    .map((tab) => ({
      ...tab,
      url: getResolvedTabUrl(tab)
    }))
    .filter(shouldTrackSwitcherTab);
  return recentTabTracker
    .getRecentTabs(normalizedTabs, { limit: TAB_SWITCHER_LIMIT })
    .map((tab) => normalizeSwitcherTabForPayload(tab, currentTabId))
    .filter((item): item is TabSwitcherItem => item !== null);
}

export function focusWindowAndActivateTab(
  tabId: number,
  windowId: number | null | undefined,
  callback?: (result: SwitchResult) => void
): void {
  const run = (resolvedWindowId: number | null | undefined): void => {
    RECENT_TAB_SWITCHER.focusWindowAndActivateTab(chrome, {
      tabId,
      windowId: typeof resolvedWindowId === 'number' ? resolvedWindowId : null
    })
      .then((result) => {
        if (result && result.ok && typeof tabId === 'number') {
          recordTabSwitchEvent(tabId);
        }
        if (typeof callback === 'function') {
          callback(result || { ok: false });
        }
      })
      .catch((error: unknown) => {
        if (typeof callback === 'function') {
          callback({
            ok: false,
            tabId,
            windowId: typeof resolvedWindowId === 'number' ? resolvedWindowId : null,
            reason: getErrorMessage(error, 'switch-failed')
          });
        }
      });
  };
  if (typeof windowId === 'number' ||
      !chrome ||
      !chrome.tabs ||
      typeof chrome.tabs.get !== 'function') {
    run(windowId);
    return;
  }
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      run(null);
      return;
    }
    run(tab && typeof tab.windowId === 'number' ? tab.windowId : null);
  });
}

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

function injectTabSwitcherOnTab(hostTab: chrome.tabs.Tab, items: TabSwitcherItem[], context: InjectContext): void {
  const finishOpen = (ok: boolean, reason: string): void => {
    if (context && typeof context.onOpenComplete === 'function') {
      context.onOpenComplete(Boolean(ok), reason || '');
    }
  };
  const hostTabId = hostTab ? hostTab.id : undefined;
  if (!hostTab || typeof hostTabId !== 'number') {
    openNewtabFallback();
    finishOpen(false, 'invalid-host-tab');
    return;
  }
  const tabItems = Array.isArray(items) ? items : [];
  if (!tabItems.length) {
    logHotkeyDebug('tab-switcher-empty', {
      hostTabId: hostTab.id,
      source: context && context.source ? context.source : ''
    });
    finishOpen(false, 'empty');
    return;
  }
  let webPageTabItems = tabItems;
  const buildSwitcherContext = (tabZoomFactor: number): TabSwitcherContext => ({
    tabs: webPageTabItems,
    currentTabId: context && typeof context.currentTabId === 'number' ? context.currentTabId : hostTabId,
    selectedIndex: context && typeof context.selectedIndex === 'number' ? context.selectedIndex : 0,
    tabZoomFactor: tabZoomFactor,
    advanceOnExisting: true,
    suppressInitialShortcutAdvance: context && context.source === 'commands-tab-switcher',
    shortcut: context && typeof context.shortcut === 'string' ? context.shortcut : 'Alt+Q',
    reverse: context.reverse,
    source: context && context.source ? context.source : ''
  });
  if (isTabSwitcherExtensionPageMessageTarget(hostTab)) {
    postTabSwitcherMessageToExtensionPage(hostTab, {
      action: 'openTabSwitcherFromCommand',
      context: buildSwitcherContext(1)
    }, (ok, reason) => {
      if (!ok) {
        logHotkeyDebug('tab-switcher-extension-page-open-failed', {
          tabId: hostTab.id,
          reason: reason || '',
          source: context && context.source ? context.source : ''
        });
        openNewtabFallbackForUrl(getResolvedTabUrl(hostTab), { sourceTab: hostTab });
        finishOpen(false, reason || 'extension-page-open-failed');
        return;
      }
      logHotkeyDebug('tab-switcher-opened', {
        tabId: hostTab.id,
        itemCount: tabItems.length,
        source: context && context.source ? context.source : '',
        path: 'extension-page-port'
      });
      finishOpen(true, 'extension-page-port');
    });
    return;
  }
  const runDynamicSwitcherScript = (switcherContext: TabSwitcherContext): void => {
    chrome.scripting.executeScript({
      target: { tabId: hostTabId },
      files: [
        'build/icon-font-preload.js',
        'src/react/overlay-islands.js',
        'build/tab-switcher.js'
      ]
    }, () => {
      const injectError = chrome.runtime && chrome.runtime.lastError;
      if (injectError) {
        const errorMessage = injectError.message || 'unknown';
        logHotkeyDebug('tab-switcher-inject-failed', {
          tabId: hostTab.id,
          error: errorMessage,
          source: context && context.source ? context.source : ''
        });
        openNewtabFallbackForUrl(getResolvedTabUrl(hostTab), { sourceTab: hostTab });
        finishOpen(false, errorMessage);
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: hostTabId },
        // Runs in the page on its own.
        func: (pageContext: TabSwitcherContext): unknown => {
          const toggle: unknown = Reflect.get(window, '_x_extension_toggleTabSwitcher_2026_unique_');
          if (typeof toggle !== 'function') {
            console.warn('Lumno: tab switcher helper not available.');
            return { ok: false, reason: 'tab_switcher_missing' };
          }
          const result: unknown = Reflect.apply(toggle, window, [pageContext]);
          return result && typeof result === 'object'
            ? result
            : { ok: true };
        },
        args: [switcherContext]
      }, (results) => {
        const runError = chrome.runtime && chrome.runtime.lastError;
        if (runError) {
          const errorMessage = runError.message || 'unknown';
          logHotkeyDebug('tab-switcher-run-failed', {
            tabId: hostTab.id,
            error: errorMessage,
            source: context && context.source ? context.source : ''
          });
          finishOpen(false, errorMessage);
          return;
        }
        const result = readScriptResults(results)[0];
        if (result && result.ok === false) {
          const failure = String(result.reason || '');
          logHotkeyDebug('tab-switcher-run-failed', {
            tabId: hostTabId,
            error: failure || 'unknown',
            source: context && context.source ? context.source : ''
          });
          finishOpen(false, failure || 'run-failed');
          return;
        }
        logHotkeyDebug('tab-switcher-opened', {
          tabId: hostTab.id,
          itemCount: tabItems.length,
          source: context && context.source ? context.source : '',
          path: 'executeScript'
        });
        finishOpen(true, 'executeScript');
      });
    });
  };
  const runSwitcherScript = (tabZoomFactor: number): void => {
    const switcherContext = buildSwitcherContext(tabZoomFactor);
    if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
      runDynamicSwitcherScript(switcherContext);
      return;
    }
    try {
      LumnoMessaging.sendTabMessage(chrome.tabs, hostTabId, {
        action: 'openTabSwitcherFromCommand',
        context: switcherContext
      }, (response) => {
        const didOpen = !(chrome.runtime && chrome.runtime.lastError) &&
          response &&
          response.ok === true;
        if (!didOpen) {
          runDynamicSwitcherScript(switcherContext);
          return;
        }
        logHotkeyDebug('tab-switcher-opened', {
          tabId: hostTab.id,
          itemCount: tabItems.length,
          source: context && context.source ? context.source : '',
          path: 'runtime-message'
        });
        finishOpen(true, 'runtime-message');
      });
    } catch (_error) {
      runDynamicSwitcherScript(switcherContext);
    }
  };
  // The switcher renders inside the web page, which cannot load _favicon URLs.
  const runWebPageSwitcherScript = (tabZoomFactor: number): void => {
    void inlineExtensionFaviconsForWebPage(tabItems).then((pageItems) => {
      webPageTabItems = pageItems;
      runSwitcherScript(tabZoomFactor);
    });
  };
  if (chrome.tabs && typeof chrome.tabs.getZoom === 'function') {
    chrome.tabs.getZoom(hostTabId, (zoomFactor) => {
      const zoom = Number.isFinite(Number(zoomFactor)) && Number(zoomFactor) > 0
        ? Number(zoomFactor)
        : 1;
      runWebPageSwitcherScript(zoom);
    });
    return;
  }
  runWebPageSwitcherScript(1);
}

function advanceExistingTabSwitcherOnTab(
  tab: chrome.tabs.Tab,
  source: string,
  offset: SwitcherOffset,
  callback: (didAdvance: boolean) => void
): void {
  if (!tab || typeof tab.id !== 'number' || !canHostSwitcherSurface(tab)) {
    if (typeof callback === 'function') {
      callback(false);
    }
    return;
  }

  const tabId = tab.id;
  const finish = (didAdvance: boolean): void => {
    if (typeof callback === 'function') {
      callback(Boolean(didAdvance));
    }
  };

  if (isTabSwitcherExtensionPageMessageTarget(tab)) {
    postTabSwitcherMessageToExtensionPage(tab, {
      action: 'advanceOpenTabSwitcherFromCommand',
      offset
    }, (ok, _reason, response) => {
      const didAdvance = Boolean(ok && response && response.advanced === true);
      if (didAdvance) {
        logHotkeyDebug('tab-switcher-advanced-fast', {
          tabId: tab.id,
          source: source || '',
          path: 'extension-page-port'
        });
      }
      finish(didAdvance);
    });
    return;
  }

  const runRuntimeMessageFastPath = (): void => {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function' || typeof tabId !== 'number') {
      finish(false);
      return;
    }
    try {
      LumnoMessaging.sendTabMessage(chrome.tabs, tabId, {
        action: 'advanceOpenTabSwitcherFromCommand',
        offset
      }, (response) => {
        const didAdvance = Boolean(!(chrome.runtime && chrome.runtime.lastError) &&
          response &&
          response.ok === true &&
          response.advanced === true);
        if (didAdvance) {
          logHotkeyDebug('tab-switcher-advanced-fast', {
            tabId: tab.id,
            source: source || '',
            path: 'runtime-message'
          });
        }
        finish(didAdvance);
      });
    } catch (_error) {
      finish(false);
    }
  };

  runRuntimeMessageFastPath();
}

export function triggerTabSwitcherForTab(
  tab: chrome.tabs.Tab | null | undefined,
  source: string,
  commandObservedAt?: number,
  direction?: SwitcherOffset
): void {
  if (!areBackgroundSettingsLoaded()) {
    whenBackgroundSettingsReady(() => {
      triggerTabSwitcherForTab(tab, source, commandObservedAt, direction);
    });
    return;
  }
  const offset = direction === -1 ? -1 : 1;
  const reverse = offset < 0;
  const observedAt = Number(commandObservedAt);
  const commandStartedAt = Number.isFinite(observedAt) && observedAt > 0
    ? observedAt
    : Date.now();
  if (!tabSwitcherEnabledCache) {
    if (tab && typeof tab.windowId === 'number') {
      tabSwitcherHostTabIdByWindowId.delete(tab.windowId);
    }
    logHotkeyDebug('tab-switcher-disabled', { source: source || '' });
    return;
  }
  if (!tab || typeof tab.id !== 'number') {
    logHotkeyDebug('tab-switcher-no-active-tab', { source: source || '' });
    openNewtabFallback();
    return;
  }
  const tabId = tab.id;
  const windowId = typeof tab.windowId === 'number' ? tab.windowId : null;
  recordTabSwitcherShortcutDebug('command-received', {
    source: String(source || ''),
    tabId: tab.id,
    windowId
  });
  // A manifest content script is not retroactively installed into tabs that
  // were already open when a development extension was reloaded. Start the
  // trusted keyup observer before any async switcher work so a quick physical
  // modifier release can be buffered and replayed after the panel opens.
  const shortcutObserverReady = prepareShortcutKeyObserver(tab);
  clearScheduledSwitcherThumbnailCapture(tab.id);
  advanceExistingTabSwitcherOnTab(tab, source, offset, (didAdvance) => {
    if (didAdvance) {
      if (typeof windowId === 'number') {
        tabSwitcherHostTabIdByWindowId.set(windowId, tabId);
      }
      recordTabSwitcherShortcutDebug('command-advanced', {
        tabId,
        windowId
      });
      return;
    }
    const opening = beginTabSwitcherOpening(tab, source);
    if (!opening) {
      return;
    }
    let openingHostTabId = tabId;
    const finishOpeningGuard = createTabSwitcherOpeningFinisher(opening);
    const finishOpening = (ok?: boolean): void => {
      finishOpeningGuard();
      if (ok === true) {
        if (typeof windowId === 'number' && typeof openingHostTabId === 'number') {
          tabSwitcherHostTabIdByWindowId.set(windowId, openingHostTabId);
        }
        recordTabSwitcherShortcutDebug('switcher-opened', {
          windowId,
          hostTabId: openingHostTabId
        });
        return;
      }
      if (typeof windowId === 'number' && tabSwitcherHostTabIdByWindowId.get(windowId) === openingHostTabId) {
        tabSwitcherHostTabIdByWindowId.delete(windowId);
      }
      recordTabSwitcherShortcutDebug('switcher-open-failed', {
        windowId
      });
    };
    const startupStateReady = Promise.all([
      ensureTabSwitcherStateLoaded(),
      loadFaviconRequestBlacklistItems(),
      loadFaviconEnhancedFetchEnabled()
    ]).catch(() => {}); // Each loader falls back to its default; open regardless.
    const shortcutReady = new Promise<string>((resolve) => {
      getConfiguredTabSwitcherShortcuts((shortcuts) => {
        resolve(reverse && shortcuts.reverse ? shortcuts.reverse : shortcuts.forward);
      });
    });
    const tabQueryReady = new Promise<{ error: string; tabs: chrome.tabs.Tab[] }>((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        const error = lastError ? lastError.message || 'unknown' : '';
        resolve({
          error,
          tabs: Array.isArray(tabs) ? tabs : []
        });
      });
    });
    Promise.all([startupStateReady, tabQueryReady, shortcutReady, shortcutObserverReady]).then((results) => {
      const tabQuery = results[1] || { error: 'unknown', tabs: [] };
      const shortcut = typeof results[2] === 'string' && results[2]
        ? results[2]
        : 'Alt+Q';
      const releaseKeys = RECENT_TAB_SWITCHER.getShortcutReleaseEventKeys(shortcut);
      recordTabSwitcherShortcutDebug('shortcut-configured', {
        windowId,
        shortcut,
        releaseKeys
      });
      if (tabQuery.error) {
        logHotkeyDebug('tab-switcher-query-failed', {
          source: source || '',
          error: tabQuery.error
        });
        finishOpening();
        return;
      }
      const tabList = tabQuery.tabs;
      const activeTab = tabList.find((item) => item && item.id === tabId) || tab;
      const finishOpeningAndArmShortcutRelease = (ok: boolean): void => {
        finishOpening(ok);
        if (ok === true) {
          armTabSwitcherShortcutReleaseObservers(
            tabList,
            activeTab.windowId,
            shortcut,
            commandStartedAt,
            [activeTab.id, openingHostTabId]
          );
        }
      };
      clearScheduledSwitcherThumbnailCapture(activeTab.id);
      let openCaptureReady: Promise<boolean> = Promise.resolve(false);
      if (shouldTrackSwitcherTab(activeTab)) {
        recordRecentSwitcherTab(activeTab);
        if (shouldPreCaptureActiveSwitcherThumbnailBeforePayload(activeTab)) {
          // A capture that finishes after the switcher opened is patched in.
          openCaptureReady = captureSwitcherThumbnailForTab(
            activeTab,
            TAB_SWITCHER_CAPTURE_REASON_COMMAND_IMMEDIATE
          ).catch(() => false);
        }
      }
      return waitForSwitcherOpenCapture(openCaptureReady).then(() => ({
        tabList,
        activeTab,
        shortcut,
        finishOpeningAndArmShortcutRelease
      }));
    }).then((openContext) => {
      if (!openContext) {
        return;
      }
      const { tabList, activeTab, shortcut, finishOpeningAndArmShortcutRelease } = openContext;
      const items = getRecentTabsForSwitcher(tabList, activeTab.id, activeTab.windowId);
      markSwitcherThumbnailPriorityForItems(items, tabList, 'command-payload');
      if (!items.length) {
        finishOpening();
        return;
      }
      const activeUrl = getResolvedTabUrl(activeTab);
      const canHostOnActiveTab = canHostSwitcherSurface(activeTab);
      const hostItem = canHostOnActiveTab
        ? items.find((item) => item && item.id === activeTab.id)
        : items.find((item) => {
          const candidate = tabList.find((tabItem) => tabItem && tabItem.id === item.id) || item;
          return item && item.id !== activeTab.id && canHostSwitcherSurface(candidate);
        });
      const hostTab = canHostOnActiveTab
        ? activeTab
        : (hostItem ? tabList.find((item) => item && item.id === hostItem.id) || null : null);
      const selectedIndex = getDefaultSwitcherSelectedIndex(items, activeTab.id, offset);
      if (!hostTab || typeof hostTab.id !== 'number') {
        openNewtabFallbackForUrl(activeUrl, { sourceTab: activeTab });
        finishOpening();
        return;
      }
      openingHostTabId = hostTab.id;
      const currentTabId = typeof activeTab.id === 'number' ? activeTab.id : tabId;
      if (hostTab.id !== activeTab.id) {
        focusWindowAndActivateTab(hostTab.id, hostTab.windowId, (result) => {
          if (!result || result.ok === false) {
            finishOpening();
            return;
          }
          injectTabSwitcherOnTab(hostTab, items, {
            currentTabId,
            selectedIndex,
            shortcut,
            reverse,
            source,
            onOpenComplete: finishOpeningAndArmShortcutRelease
          });
        });
        return;
      }
      injectTabSwitcherOnTab(hostTab, items, {
        currentTabId,
        selectedIndex,
        shortcut,
        reverse,
        source,
        onOpenComplete: finishOpeningAndArmShortcutRelease
      });
    }).catch(() => {
      finishOpening();
    });
  });
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

const switcherThemeColorWarmups = new Set<string>();
