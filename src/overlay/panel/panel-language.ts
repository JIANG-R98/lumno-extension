import type { LocaleMessage } from '../../domain/messages';
import type { LocalSearchScope } from '../../domain/search/types';
import type * as Settings from '../../domain/settings';
import * as LumnoCjkFontFaces from '../../shared/cjk-font-faces';
import * as OVERLAY_FONT_FACES from '../../shared/overlay-font-faces';
import type * as OverlayRuntime from '../runtime';
import type { ReadableStorageArea } from '../runtime';

// Row is a suggestion row, Provider a site search provider and Theme a
// suggestion theme; this module only passes them along.
interface PanelLanguageState<Row, Provider, Theme> {
  // 'system', or a locale the user chose.
  overlayLanguageMode: string;
  inputModeController: { refreshModeMenuLanguage?(): void } | null;
  overlayUpdateNoticeController: { updateLanguage?(): void } | null;
  overlayGraphicsNoticeController: { updateLanguage?(): void } | null;
  overlayEngagementNoticeController: { updateLanguage?(): void } | null;
  searchInput: HTMLInputElement | null;
  defaultPlaceholderText: string;
  modeBadge: HTMLElement | null;
  siteSearchState: Provider | null;
  localSearchScopeState: LocalSearchScope | null;
  defaultTheme: Theme;
  latestOverlayQuery: string;
  lastSuggestionResponse: Row[];
}

interface PanelLanguageDeps<Row, Provider, Theme> {
  SETTINGS: Pick<typeof Settings, 'localeToHtmlLang' | 'normalizeLocale'>;
  overlayRuntime: Pick<typeof OverlayRuntime, 'loadLocaleMessages' | 'getStorageValues'>;
  storageArea: ReadableStorageArea | null;
  LANGUAGE_STORAGE_KEY: string;
  updateModeBadge(rawValue: string): void;
  setSiteSearchPrefix(provider: Provider, theme: Theme): void;
  getThemeForProvider(provider: Provider): Promise<Theme>;
  updateSiteSearchPrefixLayout(): void;
  setLocalSearchScopePrefix(scope: LocalSearchScope): void;
  updateSearchSuggestions(rows: Row[], query: string): void;
  requestTabsAndRender(): void;
  // Names the search input's buttons again.
  applyInputActionLabels(): void;
  overlayState: PanelLanguageState<Row, Provider, Theme>;
}

type LocaleMessages = Record<string, LocaleMessage>;

function createPanelLanguage<Row, Provider, Theme>(deps: PanelLanguageDeps<Row, Provider, Theme>) {
  const {
    SETTINGS,
    overlayRuntime,
    storageArea,
    LANGUAGE_STORAGE_KEY,
    updateModeBadge,
    setSiteSearchPrefix,
    getThemeForProvider,
    updateSiteSearchPrefixLayout,
    setLocalSearchScopePrefix,
    updateSearchSuggestions,
    requestTabsAndRender,
    applyInputActionLabels
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  let currentMessages: LocaleMessages | null = null;

  function applyOverlayCjkFontFace(locale: string): void {
    const lang = SETTINGS.localeToHtmlLang(locale);
    if (OVERLAY_FONT_FACES.keepEarlyCjkFontFace(window, lang)) {
      return;
    }
    LumnoCjkFontFaces.install(document, {
      family: OVERLAY_FONT_FACES.OVERLAY_TEXT_FAMILY,
      lang,
      styleId: '_x_extension_overlay_cjk_font_faces_2026_unique_'
    });
  }

  function getSystemLocale(): string {
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      return SETTINGS.normalizeLocale(chrome.i18n.getUILanguage());
    }
    return SETTINGS.normalizeLocale(navigator.language || 'en');
  }

  function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
    return overlayRuntime.loadLocaleMessages({
      chromeApi: chrome,
      locale,
      normalizeLocale: SETTINGS.normalizeLocale
    });
  }

  function t(key: string, fallback: string): string {
    const entry = currentMessages ? currentMessages[key] : undefined;
    if (entry && entry.message) {
      return entry.message;
    }
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  }

  function getStorageValuesAsync(keys: string[]): Promise<Record<string, unknown>> {
    return overlayRuntime.getStorageValues(storageArea, keys);
  }

  // The locale's messages, or fallbackMessages when it has none.
  function loadPreferredLocaleMessages(locale: string, fallbackMessages: LocaleMessages | null): Promise<LocaleMessages> {
    return loadLocaleMessages(locale).then((messages) => {
      if (messages && Object.keys(messages).length > 0) {
        return messages;
      }
      return fallbackMessages || {};
    }).catch(() => fallbackMessages || {});
  }

  // Loads the messages before the panel first renders.
  async function bootstrapOverlayLanguageForInitialRender(settingsReady?: Promise<Record<string, unknown>> | null): Promise<void> {
    const result = await Promise.resolve(settingsReady ||
      getStorageValuesAsync([LANGUAGE_STORAGE_KEY]));
    const storedMode = result[LANGUAGE_STORAGE_KEY];
    overlayState.overlayLanguageMode = typeof storedMode === 'string' && storedMode ? storedMode : 'system';
    const targetLocale = overlayState.overlayLanguageMode === 'system'
      ? getSystemLocale()
      : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
    applyOverlayCjkFontFace(targetLocale);
    currentMessages = await loadPreferredLocaleMessages(targetLocale, null);
  }

  function formatMessage(key: string, fallback: string, params?: Record<string, string>): string {
    let text = t(key, fallback);
    if (!params) {
      return text;
    }
    Object.keys(params).forEach((token) => {
      const value = params[token];
      text = text.replace(new RegExp(`\\{${token}\\}`, 'g'), value);
    });
    return text;
  }

  // Puts the current language's copy on everything the panel shows.
  function applyLanguageStrings(options?: { refreshResults?: boolean }): void {
    const refreshResults = !options || options.refreshResults !== false;
    if (overlayState.inputModeController &&
        typeof overlayState.inputModeController.refreshModeMenuLanguage === 'function') {
      overlayState.inputModeController.refreshModeMenuLanguage();
    }
    if (overlayState.overlayUpdateNoticeController &&
        typeof overlayState.overlayUpdateNoticeController.updateLanguage === 'function') {
      overlayState.overlayUpdateNoticeController.updateLanguage();
    }
    if (overlayState.overlayGraphicsNoticeController &&
        typeof overlayState.overlayGraphicsNoticeController.updateLanguage === 'function') {
      overlayState.overlayGraphicsNoticeController.updateLanguage();
    }
    if (overlayState.overlayEngagementNoticeController &&
        typeof overlayState.overlayEngagementNoticeController.updateLanguage === 'function') {
      overlayState.overlayEngagementNoticeController.updateLanguage();
    }
    if (overlayState.searchInput) {
      overlayState.defaultPlaceholderText = t('overlay_search_placeholder', t('search_placeholder', overlayState.defaultPlaceholderText));
      if (!overlayState.siteSearchState && !overlayState.localSearchScopeState) {
        overlayState.searchInput.placeholder = overlayState.defaultPlaceholderText;
      }
    }
    applyInputActionLabels();
    if (overlayState.modeBadge) {
      updateModeBadge(overlayState.searchInput ? overlayState.searchInput.value : '');
    }
    if (overlayState.siteSearchState) {
      const activeSiteSearchProvider = overlayState.siteSearchState;
      setSiteSearchPrefix(activeSiteSearchProvider, overlayState.defaultTheme);
      void getThemeForProvider(activeSiteSearchProvider).then((theme) => {
        if (overlayState.siteSearchState === activeSiteSearchProvider) {
          setSiteSearchPrefix(activeSiteSearchProvider, theme);
        }
      });
      updateSiteSearchPrefixLayout();
    } else if (overlayState.localSearchScopeState) {
      setLocalSearchScopePrefix(overlayState.localSearchScopeState);
      updateSiteSearchPrefixLayout();
    }
    if (!refreshResults) {
      return;
    }
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    } else {
      requestTabsAndRender();
    }
  }

  function applyLanguageMode(mode: unknown): void {
    overlayState.overlayLanguageMode = typeof mode === 'string' && mode ? mode : 'system';
    const targetLocale = overlayState.overlayLanguageMode === 'system'
      ? getSystemLocale()
      : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
    applyOverlayCjkFontFace(targetLocale);
    void loadPreferredLocaleMessages(targetLocale, null).then((messages) => {
      currentMessages = messages || {};
      applyLanguageStrings();
    });
  }

  return {
    applyOverlayCjkFontFace,
    getSystemLocale,
    t,
    getStorageValuesAsync,
    bootstrapOverlayLanguageForInitialRender,
    formatMessage,
    applyLanguageStrings,
    applyLanguageMode
  };
}

export { createPanelLanguage };
export type { PanelLanguageDeps, PanelLanguageState };
