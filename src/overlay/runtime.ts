import { readLocaleMessages } from '../domain/locale-messages';
import type { LocaleMessage } from '../domain/messages';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { StorageChromeApi } from '../platform/settings-storage';
import * as LumnoMessaging from '../platform/messaging';
import type { MessageRuntime } from '../platform/messaging';
import { motionEffectsEnabled, simpleModeEnabled, themeMode } from '../domain/settings/appearance';
import { overlayEnterAnimation, overlayFontFallback, overlayFontFamily, overlayOpenTabsDefaultVisible, overlayPageThemeAdaptationEnabled, overlaySizeMode, overlayTabPriority, overlayWidth } from '../domain/settings/overlay-panel';
import { aggregateSearches, defaultSearchEngine, faviconEnhancedFetchEnabled, faviconRequestBlacklist, macosCtrlSuggestionNavigationEnabled, numberShortcutInstantEnabled, searchBlacklist, searchResultDisplayLimit, searchResultPriority, searchResultSourceTypes, siteSearchCustom, siteSearchDisabled, siteSearchIconCache, tabRankScoreDebug } from '../domain/settings/search';
import { documentPipEnabled } from '../domain/settings/features';
import { language } from '../domain/settings/locale';

type StoredValues = Record<string, unknown>;

// chrome.storage.local, or a provider area: read with a callback, or
// answering with a promise.
interface ReadableStorageArea {
  get(keys: string[], callback: (items: StoredValues | undefined) => void): unknown;
}

// What the overlay needs of the chrome API to find its own files.
interface RuntimeUrlApi {
  runtime?: { getURL?(path: string): string } | null;
}

interface LocaleMessagesOptions {
  chromeApi: { runtime?: (MessageRuntime & { getURL?(path: string): string }) | null } | null;
  locale: unknown;
  normalizeLocale?(locale: unknown): string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}

const STORAGE_KEYS = Object.freeze({
  themeMode: themeMode.key,
  language: language.key,
  defaultSearchEngine: defaultSearchEngine.key,
  siteSearchCustom: siteSearchCustom.key,
  siteSearchDisabled: siteSearchDisabled.key,
  aggregateSearches: aggregateSearches.key,
  siteSearchIconCache: siteSearchIconCache.key,
  documentPipEnabled: documentPipEnabled.key,
  searchResultPriority: searchResultPriority.key,
  searchResultSourceTypes: searchResultSourceTypes.key,
  searchResultDisplayLimit: searchResultDisplayLimit.key,
  searchBlacklist: searchBlacklist.key,
  faviconRequestBlacklist: faviconRequestBlacklist.key,
  faviconEnhancedFetchEnabled: faviconEnhancedFetchEnabled.key,
  overlayOpenTabsDefaultVisible: overlayOpenTabsDefaultVisible.key,
  overlaySizeMode: overlaySizeMode.key,
  overlayWidth: overlayWidth.key,
  overlayEnterAnimation: overlayEnterAnimation.key,
  overlayFontFamily: overlayFontFamily.key,
  overlayFontFallback: overlayFontFallback.key,
  overlayPageThemeAdaptationEnabled: overlayPageThemeAdaptationEnabled.key,
  motionEffectsEnabled: motionEffectsEnabled.key,
  simpleModeEnabled: simpleModeEnabled.key,
  numberShortcutInstantEnabled: numberShortcutInstantEnabled.key,
  macosCtrlSuggestionNavigationEnabled: macosCtrlSuggestionNavigationEnabled.key,
  overlayTabPriority: overlayTabPriority.key,
  tabRankScoreDebug: tabRankScoreDebug.key
});

function getRuntimeUrl(chromeApi: RuntimeUrlApi | null, path: string): string {
  const runtime = chromeApi ? chromeApi.runtime : null;
  return runtime && typeof runtime.getURL === 'function'
    ? runtime.getURL(path)
    : path;
}

function getStorageArea(chromeApi: StorageChromeApi | null) {
  return LumnoSettingsStorage.createProviderStorageRuntime(chromeApi);
}

// The stored values for keys; {} when the area is missing or the read fails.
function getStorageValues(storageArea: ReadableStorageArea | null, keys: string[]): Promise<StoredValues> {
  return new Promise((resolve) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve({});
      return;
    }
    let settled = false;
    const finish = (result: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(isRecord(result) ? result : {});
    };
    try {
      const maybePromise = storageArea.get(keys, finish);
      if (isPromiseLike(maybePromise)) {
        maybePromise.then(finish, () => finish({}));
      }
    } catch (_error) {
      finish({});
    }
  });
}

function isInjectedBrowserExtensionProtocol(protocol: string): boolean {
  const normalized = String(protocol || '').toLowerCase();
  return normalized === 'chrome-extension:' ||
    normalized === 'moz-extension:' ||
    normalized === 'ms-browser-extension:';
}

// An extension address on the "invalid" host: the extension was reloaded
// and this page's copy of it can no longer reach its own files.
function isInvalidExtensionResourceUrl(url: string): boolean {
  if (!url) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return isInjectedBrowserExtensionProtocol(parsed.protocol) &&
      String(parsed.hostname || '').toLowerCase() === 'invalid';
  } catch (_error) {
    return false;
  }
}

// A locale's messages from its file, or through the worker when this page's
// copy of the extension can no longer fetch its files; {} when neither works.
function loadLocaleMessages(options: LocaleMessagesOptions): Promise<Record<string, LocaleMessage>> {
  const chromeApi = options.chromeApi;
  const locale = typeof options.normalizeLocale === 'function'
    ? options.normalizeLocale(options.locale)
    : String(options.locale || 'en');
  const runtime = chromeApi ? chromeApi.runtime : null;
  if (!chromeApi || !runtime || typeof runtime.getURL !== 'function') {
    return Promise.resolve({});
  }
  const loadViaMessage = (): Promise<Record<string, LocaleMessage>> => new Promise((resolve) => {
    if (typeof runtime.sendMessage !== 'function') {
      resolve({});
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'getLocaleMessages', locale }, (response) => {
        resolve((response && response.messages) || {});
      });
    } catch (_error) {
      resolve({});
    }
  });
  const localePath = getRuntimeUrl(chromeApi, `_locales/${locale}/messages.json`);
  if (isInvalidExtensionResourceUrl(localePath)) {
    return loadViaMessage();
  }
  return fetch(localePath, { cache: 'no-store' })
    .then((response) => response.json())
    .then((value: unknown) => readLocaleMessages(value))
    .catch(loadViaMessage);
}

export {
  STORAGE_KEYS,
  getRuntimeUrl,
  getStorageArea,
  getStorageValues,
  isInjectedBrowserExtensionProtocol,
  loadLocaleMessages
};
export type { LocaleMessagesOptions, ReadableStorageArea, RuntimeUrlApi };
