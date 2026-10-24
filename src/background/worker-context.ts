// What the background service modules share with the worker entry
// (background.ts): the settings storage areas, the mirrors of the settings
// the worker reads on every wake, command names, and small helpers.
//
// It imports no background service, so every service may use its bindings
// while loading, unlike the bindings background.ts itself defines.
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { StorageAreaFacade } from '../platform/settings-storage';
import type { StorageAreaLike } from '../domain/storage-port';
import type { RestrictedAction } from '../domain/settings';
import { normalizeLocale } from '../domain/settings';
import type { LocaleMessage } from '../domain/messages';
import * as BACKGROUND_SHORTCUT_RULES from './shortcut-rules';

// pinyin-pro (~320 KB) only matters when a Han-character title is matched
// against a pinyin query, or a Han query against site addresses, so the
// worker loads it on first use instead of on every wake (see getPinyinPro in
// search-suggestions-service.ts). A service worker may only importScripts() a
// file after installation if it imported that file while installing, hence
// background.ts's install hook. Firefox's build lists every *_SCRIPT_PATH
// here in background.scripts.
const PINYIN_PRO_SCRIPT_PATH = 'assets/vendor/pinyin-pro.js';

const SHOW_SEARCH_COMMAND_NAME = 'show-search';
const SHOW_SEARCH_PREFILL_COMMAND_NAME = 'show-search-prefill';
const SHOW_SEARCH_PREFILL_V_COMMAND_NAME = 'show-search-prefill-v';
const SHOW_TAB_SWITCHER_COMMAND_NAME = 'show-tab-switcher';

const providerStorageRuntime = LumnoSettingsStorage.createProviderStorageRuntime(chrome);
// The area settings are read from and written to: browser sync, or local when
// the user keeps settings on this device.
const storageArea: StorageAreaFacade = providerStorageRuntime.area;
// Device-only state that never syncs.
const localStorageArea: StorageAreaLike = chrome.storage && chrome.storage.local
  ? chrome.storage.local
  : storageArea;

// Whether a storage.onChanged area name is the one settings live in.
function isPrimaryStorageAreaName(areaName: unknown): boolean {
  return providerStorageRuntime.isActiveAreaName(areaName);
}

const shortcutRules = BACKGROUND_SHORTCUT_RULES.create({
  chromeApi: chrome,
  fetchImpl: fetch,
  navigatorLike: navigator
});
const loadShortcutRules = shortcutRules.loadShortcutRules;
const getShortcutUrl = shortcutRules.getShortcutUrl;

// Service-worker lifetime: the mirrors below are lost when the worker
// suspends. background.ts re-reads them from storage on every wake and keeps
// them current from storage.onChanged; until that read lands they hold
// defaults, so event paths that act on them wait for whenBackgroundSettingsReady.
let restrictedAction: RestrictedAction = 'default';
let restrictedActionAutoBrowserSettingDone = false;
let documentPipEnabled = false;
let backgroundSettingsLoaded = false;

let resolveDocumentPipEnabledReady: () => void = () => {};
// A service worker woken by the toolbar button or a clip command handles that
// event before its stored settings arrive, so web clip waits for the real value.
const documentPipEnabledReady = new Promise<void>((resolve) => {
  resolveDocumentPipEnabledReady = resolve;
});
let resolveBackgroundSettingsReady: () => void = () => {};
const backgroundSettingsReady = new Promise<void>((resolve) => {
  resolveBackgroundSettingsReady = resolve;
});

// What a page the extension cannot run on does when the search is asked for.
function getRestrictedAction(): RestrictedAction {
  return restrictedAction;
}

function setRestrictedAction(action: RestrictedAction): void {
  restrictedAction = action;
}

// Whether the restricted-action choice was already made for the user once,
// when the browser's own New Tab provider was detected.
function isRestrictedActionAutoBrowserSettingDone(): boolean {
  return restrictedActionAutoBrowserSettingDone;
}

function setRestrictedActionAutoBrowserSettingDone(done: boolean): void {
  restrictedActionAutoBrowserSettingDone = done;
}

// Records the restricted-action choice made for the user when the browser's
// own New Tab provider is detected (browser-urls-service.ts).
function markRestrictedActionAutoSelected(): void {
  restrictedActionAutoBrowserSettingDone = true;
  restrictedAction = 'none';
}

function isDocumentPipEnabled(): boolean {
  return documentPipEnabled;
}

function setDocumentPipEnabled(enabled: boolean): void {
  documentPipEnabled = enabled;
  resolveDocumentPipEnabledReady();
}

// Whether the stored settings arrived since the worker woke.
function areBackgroundSettingsLoaded(): boolean {
  return backgroundSettingsLoaded;
}

function markBackgroundSettingsLoaded(): void {
  backgroundSettingsLoaded = true;
  resolveBackgroundSettingsReady();
}

// A worker woken by a command, a tab event or a page hotkey runs that handler
// before its stored settings arrive. Run the callback now when they are known,
// otherwise as soon as they are, so a disabled feature stays disabled.
function whenBackgroundSettingsReady(callback: () => void): void {
  if (backgroundSettingsLoaded) {
    callback();
    return;
  }
  void backgroundSettingsReady.then(callback);
}

const HOTKEY_DEBUG_ENABLED = false;
function logHotkeyDebug(stage: string, payload?: unknown): void {
  if (!HOTKEY_DEBUG_ENABLED) {
    return;
  }
  try {
    const detail = payload && typeof payload === 'object' ? payload : {};
    console.log(`[Lumno][hotkey] ${stage}`, detail);
  } catch (_error) {
    // Ignore logging errors.
  }
}

// Callback for chrome.* calls whose failure is routine for a background that
// talks to arbitrary tabs and storage: a tab or frame that closed or navigated
// ("No tab with id", "Frame was removed"), a restricted page, or a best-effort
// cleanup. Reading lastError keeps Chrome from logging it as unchecked.
function ignoreExpectedChromeError(): void {
  void (chrome.runtime && chrome.runtime.lastError);
}

// Rejection handler for work that is not expected to fail (storage writes,
// startup restores). Failures stay non-fatal but leave a trace with context.
function warnBackgroundFailure(context: string): (error: unknown) => void {
  return (error) => {
    console.warn(`[Lumno] ${context}`, error);
  };
}

// The worker's importScripts (Firefox's build replaces it with a no-op);
// null where the global scope has none.
function getImportScripts(): ((...urls: string[]) => void) | null {
  const importScriptsFn: unknown = Reflect.get(globalThis, 'importScripts');
  if (typeof importScriptsFn !== 'function') {
    return null;
  }
  return (...urls) => {
    Reflect.apply(importScriptsFn, globalThis, urls);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readPlaceholders(value: unknown): Record<string, { content: string; example?: string }> | null {
  if (!isRecord(value)) {
    return null;
  }
  const placeholders: Record<string, { content: string; example?: string }> = {};
  Object.keys(value).forEach((name) => {
    const placeholder = value[name];
    if (isRecord(placeholder) && typeof placeholder.content === 'string') {
      placeholders[name] = typeof placeholder.example === 'string'
        ? { content: placeholder.content, example: placeholder.example }
        : { content: placeholder.content };
    }
  });
  return placeholders;
}

// A _locales messages.json, with only well-formed entries.
function readLocaleMessages(value: unknown): Record<string, LocaleMessage> {
  const messages: Record<string, LocaleMessage> = {};
  if (!isRecord(value)) {
    return messages;
  }
  Object.keys(value).forEach((key) => {
    const entry = value[key];
    if (!isRecord(entry) || typeof entry.message !== 'string') {
      return;
    }
    const message: LocaleMessage = { message: entry.message };
    if (typeof entry.description === 'string') {
      message.description = entry.description;
    }
    const placeholders = readPlaceholders(entry.placeholders);
    if (placeholders) {
      message.placeholders = placeholders;
    }
    messages[key] = message;
  });
  return messages;
}

// Parsed _locales files by locale. They only change with the extension, which
// restarts this worker, so each is read once per worker lifetime.
const localeMessagesByLocale = new Map<string, Promise<Record<string, LocaleMessage>>>();

function loadLocaleMessages(rawLocale: unknown): Promise<Record<string, LocaleMessage>> {
  const locale = normalizeLocale(rawLocale);
  const known = localeMessagesByLocale.get(locale);
  if (known) {
    return known;
  }
  const loading = fetch(chrome.runtime.getURL(`_locales/${locale}/messages.json`))
    .then((response) => response.json())
    .then((messages: unknown) => readLocaleMessages(messages))
    .catch((): Record<string, LocaleMessage> => {
      localeMessagesByLocale.delete(locale);
      return {};
    });
  localeMessagesByLocale.set(locale, loading);
  return loading;
}

// A host as the favicon and site-search lookups key it.
function normalizeHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  const lower = String(hostname).toLowerCase();
  const stripped = lower.replace(/^www\./i, '');
  if (stripped === 'my.feishu.cn') {
    return 'feishu.cn';
  }
  return stripped;
}

// Resolves with the tab once it finishes loading, or with whatever state it
// is in after the timeout (at least one second, 15 by default).
function waitForTabComplete(tabId: number, timeoutMs?: number): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const finish = (tab: chrome.tabs.Tab | null | undefined, error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      if (error) {
        reject(error);
        return;
      }
      resolve(tab || null);
    };
    const handleUpdated = (updatedTabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab): void => {
      if (updatedTabId !== tabId) {
        return;
      }
      if (changeInfo && changeInfo.status === 'complete') {
        finish(tab || null);
      }
    };
    const readTab = (onTab: (tab: chrome.tabs.Tab | undefined) => void): void => {
      chrome.tabs.get(tabId, (tab) => {
        const lastError = chrome.runtime && chrome.runtime.lastError;
        if (lastError) {
          finish(null, new Error(lastError.message || 'tab-unavailable'));
          return;
        }
        onTab(tab);
      });
    };
    chrome.tabs.onUpdated.addListener(handleUpdated);
    readTab((tab) => {
      if (tab && tab.status === 'complete') {
        finish(tab);
      }
    });
    timeoutId = setTimeout(() => {
      readTab((tab) => finish(tab || null));
    }, Math.max(1000, Number(timeoutMs) || 15000));
  });
}

export {
  PINYIN_PRO_SCRIPT_PATH,
  SHOW_SEARCH_COMMAND_NAME,
  SHOW_SEARCH_PREFILL_COMMAND_NAME,
  SHOW_SEARCH_PREFILL_V_COMMAND_NAME,
  SHOW_TAB_SWITCHER_COMMAND_NAME,
  areBackgroundSettingsLoaded,
  documentPipEnabledReady,
  getImportScripts,
  getRestrictedAction,
  getShortcutUrl,
  ignoreExpectedChromeError,
  isDocumentPipEnabled,
  isPrimaryStorageAreaName,
  isRestrictedActionAutoBrowserSettingDone,
  loadLocaleMessages,
  loadShortcutRules,
  localStorageArea,
  logHotkeyDebug,
  markBackgroundSettingsLoaded,
  markRestrictedActionAutoSelected,
  normalizeHost,
  providerStorageRuntime,
  setDocumentPipEnabled,
  setRestrictedAction,
  setRestrictedActionAutoBrowserSettingDone,
  storageArea,
  waitForTabComplete,
  warnBackgroundFailure,
  whenBackgroundSettingsReady
};
