import { readLocaleMessages } from '../domain/locale-messages';
import type { LocaleMessage } from '../domain/messages';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { StorageChromeApi } from '../platform/settings-storage';
import * as LumnoMessaging from '../platform/messaging';
import type { MessageRuntime } from '../platform/messaging';

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
  themeMode: '_x_extension_theme_mode_2024_unique_',
  language: '_x_extension_language_2024_unique_',
  defaultSearchEngine: '_x_extension_default_search_engine_2024_unique_',
  siteSearchCustom: '_x_extension_site_search_custom_2024_unique_',
  siteSearchDisabled: '_x_extension_site_search_disabled_2024_unique_',
  aggregateSearches: '_x_extension_aggregate_searches_2026_unique_',
  siteSearchIconCache: '_x_extension_site_search_icon_cache_canonical_2026_unique_',
  documentPipEnabled: '_x_extension_document_pip_enabled_2026_unique_',
  searchResultPriority: '_x_extension_search_result_priority_2026_unique_',
  searchResultSourceTypes: '_x_extension_search_result_source_types_2026_unique_',
  searchResultDisplayLimit: '_x_extension_search_result_display_limit_2026_unique_',
  searchBlacklist: '_x_extension_search_blacklist_2026_unique_',
  faviconRequestBlacklist: '_x_extension_favicon_request_blacklist_2026_unique_',
  faviconEnhancedFetchEnabled: '_x_extension_favicon_enhanced_fetch_enabled_2026_unique_',
  overlayOpenTabsDefaultVisible: '_x_extension_overlay_open_tabs_default_visible_2026_unique_',
  overlaySizeMode: '_x_extension_overlay_size_mode_2026_unique_',
  overlayEnterAnimation: '_x_extension_overlay_enter_animation_2026_unique_',
  overlayFontFamily: '_x_extension_overlay_font_family_2026_unique_',
  overlayFontFallback: '_x_extension_overlay_font_fallback_2026_unique_',
  overlayPageThemeAdaptationEnabled: '_x_extension_overlay_page_theme_adaptation_enabled_2026_unique_',
  motionEffectsEnabled: '_x_extension_motion_effects_enabled_2026_unique_',
  simpleModeEnabled: '_x_extension_simple_mode_enabled_2026_unique_',
  numberShortcutInstantEnabled: '_x_extension_number_shortcut_instant_enabled_2026_unique_',
  macosCtrlSuggestionNavigationEnabled: '_x_extension_macos_ctrl_suggestion_navigation_enabled_2026_unique_',
  overlayTabPriority: '_x_extension_overlay_tab_priority_2024_unique_',
  tabRankScoreDebug: '_x_extension_tab_rank_score_debug_2026_unique_'
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
