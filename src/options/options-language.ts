// The page language: resolving and loading the locale, applying the copy
// to every control, and the document language.
import { readLocaleMessages } from '../domain/locale-messages';
import type { LocaleMessage } from '../domain/messages';
import type * as Settings from '../domain/settings';
import type {
  NewtabGlassTheme,
  NewtabTimeInk,
  NewtabTopContentMode,
  NewtabWidthMode,
  OverlayEnterAnimation,
  OverlaySizeMode,
  RestrictedAction,
  SearchResultPriority
} from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import { isHtmlTag } from '../shared/dom-guards';
import * as LumnoBrowserProfile from '../platform/browser-profile';
import * as LumnoMessaging from '../platform/messaging';
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { createDailyQuoteSettings } from './options-daily-quote';
import type { createFallbackShortcutSection } from './options-fallback-shortcut';
import type { SettingsTabKey } from './options-navigation';
import type { RecentMode } from './options-segmented-tabs';
import type { createThemeSection } from './options-theme';
import type { FormatTemplate } from './options-types';
import type { createController as createWebDavController } from './webdav-options';

type LocaleMessages = Record<string, LocaleMessage>;

interface LanguageState {
  currentLanguageMode: string;
  storageArea: BatchedStorageArea | null;
  isMacPlatform: boolean;
  editingSiteSearchKey: string | null;
  currentActiveSettingsTab: SettingsTabKey;
  currentNewtabWidthMode: NewtabWidthMode;
  currentOverlaySizeMode: OverlaySizeMode;
  currentOverlayEnterAnimation: OverlayEnterAnimation;
  currentSearchResultPriority: SearchResultPriority;
  currentRecentMode: RecentMode;
  currentRestrictedAction: RestrictedAction;
  currentNewtabTopContentMode: NewtabTopContentMode;
  currentNewtabTimeFontWeight: number;
  currentNewtabTimeFontSize: number;
  currentNewtabTimeOpacity: number;
  currentNewtabTimeInk: NewtabTimeInk;
  currentNewtabGlassTheme: NewtabGlassTheme;
  currentNewtabShortcutColumns: number;
  currentNewtabShortcutSize: number;
  currentNewtabShortcutGap: number;
  currentRecentCount: number;
  currentBookmarkCount: number;
  currentBookmarkColumns: number;
  currentSearchResultDisplayLimit: number;
  currentOverlayWidth: number | null;
  // Made as the page starts; null until then.
  webDavSettingsController: ReturnType<typeof createWebDavController>;
  fallbackShortcutSection: ReturnType<typeof createFallbackShortcutSection> | null;
  themeSection: ReturnType<typeof createThemeSection> | null;
  dailyQuoteSettings: ReturnType<typeof createDailyQuoteSettings>;
}

interface LanguageDeps {
  renderOverlayFontMissingNotices(): void;
  popconfirmLanguageRefreshers: Set<() => void>;
  formatTemplate: FormatTemplate;
  formatShortcutForDisplay(shortcut: string): string;
  fallbackShortcutInput: HTMLInputElement | null;
  fallbackShortcutTokens: HTMLElement | null;
  SETTINGS: Pick<typeof Settings, 'normalizeLocale' | 'localeToHtmlLang' | 'resolveSupportedLocale' |
    'isMachineTranslatedLocale'>;
  LANGUAGE_STORAGE_KEY: string;
  localStorageArea: StorageAreaLike | null;
  languageSelect: HTMLSelectElement | null;
  languageMachineNote: HTMLElement | null;
  setOptionsSelectState(select: HTMLSelectElement | null, value: unknown): void;
  renderOptionsInfoButtons(): void;
  renderFeedbackSupport(): void;
  renderTranslationHelp(): void;
  refreshCustomSelects(): void;
  setEditingState(key: string | null): void;
  updateBuiltinResetTooltip(): void;
  updateCustomClearTooltip(): void;
  updateAggregateSearchClearTooltip(): void;
  updateBlacklistClearTooltip(): void;
  refreshSyncStatus(): void;
  renderShortcutReferenceList(): void;
  setNewtabWidthTabState(mode: unknown): void;
  setOverlaySizeTabState(mode: unknown): void;
  setOverlayEnterAnimationTabState(mode: unknown): void;
  setSearchResultPriorityTabState(priority: unknown): void;
  setRecentModeTabState(mode: unknown): void;
  setRestrictedActionTabState(action: unknown): void;
  setNewtabTopContentTabState(mode: unknown): void;
  renderNewtabTimeFontWeightControl(value: unknown): void;
  renderNewtabTimeFontSizeControl(value: unknown): void;
  renderNewtabTimeOpacityControl(value: unknown): void;
  setNewtabTimeInkTabState(ink: unknown): void;
  setNewtabGlassThemeTabState(theme: unknown): void;
  renderNewtabShortcutColumnsControl(value: unknown, disabled?: boolean): void;
  renderNewtabShortcutSizeControl(value: unknown, disabled?: boolean): void;
  renderNewtabShortcutGapControl(value: unknown, disabled?: boolean): void;
  syncNewtabShortcutSubcontrolAvailability(): void;
  renderRecentCountControl(value: unknown): void;
  renderBookmarkRowsControl(value: unknown): void;
  renderBookmarkColumnsControl(value: unknown): void;
  renderSearchResultDisplayLimitControl(value: unknown): void;
  renderOverlayWidthControl(value: unknown): void;
  renderSettingsNavigation(tabKey: SettingsTabKey): void;
  renderSiteSearchList(): void;
  renderAggregateSearchList(): void;
  renderSearchBlacklistList(): void;
  optionsState: LanguageState;
}

function createLanguage(deps: LanguageDeps) {
  const {
    renderOverlayFontMissingNotices,
    popconfirmLanguageRefreshers,
    formatTemplate,
    formatShortcutForDisplay,
    fallbackShortcutInput,
    fallbackShortcutTokens,
    SETTINGS,
    LANGUAGE_STORAGE_KEY,
    localStorageArea,
    languageSelect,
    languageMachineNote,
    setOptionsSelectState,
    renderOptionsInfoButtons,
    renderFeedbackSupport,
    renderTranslationHelp,
    refreshCustomSelects,
    setEditingState,
    updateBuiltinResetTooltip,
    updateCustomClearTooltip,
    updateAggregateSearchClearTooltip,
    updateBlacklistClearTooltip,
    refreshSyncStatus,
    renderShortcutReferenceList,
    setNewtabWidthTabState,
    setOverlaySizeTabState,
    setOverlayEnterAnimationTabState,
    setSearchResultPriorityTabState,
    setRecentModeTabState,
    setRestrictedActionTabState,
    setNewtabTopContentTabState,
    renderNewtabTimeFontWeightControl,
    renderNewtabTimeFontSizeControl,
    renderNewtabTimeOpacityControl,
    setNewtabTimeInkTabState,
    setNewtabGlassThemeTabState,
    renderNewtabShortcutColumnsControl,
    renderNewtabShortcutSizeControl,
    renderNewtabShortcutGapControl,
    syncNewtabShortcutSubcontrolAvailability,
    renderRecentCountControl,
    renderBookmarkRowsControl,
    renderBookmarkColumnsControl,
    renderSearchResultDisplayLimitControl,
    renderOverlayWidthControl,
    renderSettingsNavigation,
    renderSiteSearchList,
    renderAggregateSearchList,
    renderSearchBlacklistList
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  let currentMessages: LocaleMessages | null = null;
  let languageApplyRequestId = 0;

  function getMessage(key: string, fallback: string): string {
    if (currentMessages && Object.prototype.hasOwnProperty.call(currentMessages, key)) {
      const entry = currentMessages[key];
      if (entry && typeof entry.message === 'string') {
        return entry.message;
      }
    }
    if (optionsState.currentLanguageMode !== 'system') {
      return fallback || '';
    }
    if (chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  }

  function applyI18n(): void {
    if (optionsState.webDavSettingsController) optionsState.webDavSettingsController.render();
    renderOverlayFontMissingNotices();
    popconfirmLanguageRefreshers.forEach((refresh) => refresh());
    const browserName = LumnoBrowserProfile.getBrowserInternalProfile(navigator).name || 'Chrome';
    const templateValues = {
      name: 'Lumno',
      browser: browserName,
      shortcut: formatShortcutForDisplay('Alt+Q') || (optionsState.isMacPlatform ? '⌥Q' : 'Alt+Q')
    };
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key) {
        return;
      }
      const fallback = node.textContent || '';
      const message = formatTemplate(getMessage(key, fallback), templateValues);
      node.textContent = message;
      if (isHtmlTag(node, 'option')) {
        node.label = message;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (!key) {
        return;
      }
      const fallback = node.getAttribute('placeholder') || '';
      const message = getMessage(key, fallback);
      node.setAttribute('placeholder', message);
    });
    document.querySelectorAll('[data-i18n-tooltip]').forEach((node) => {
      const key = node.getAttribute('data-i18n-tooltip');
      if (!key) {
        return;
      }
      const fallback = node.getAttribute('data-tooltip') || '';
      const message = formatTemplate(getMessage(key, fallback), templateValues);
      node.setAttribute('data-tooltip', message);
      if (node.getAttribute('title')) {
        node.removeAttribute('title');
      }
      if (node.getAttribute('aria-label')) {
        node.setAttribute('aria-label', message);
      }
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      const key = node.getAttribute('data-i18n-aria-label');
      if (!key) {
        return;
      }
      const fallback = node.getAttribute('aria-label') || '';
      const message = getMessage(key, fallback);
      node.setAttribute('aria-label', message);
    });
    if (fallbackShortcutInput && fallbackShortcutTokens) {
      fallbackShortcutTokens.setAttribute('data-placeholder', fallbackShortcutInput.getAttribute('placeholder') || '');
      if (optionsState.fallbackShortcutSection) {
        optionsState.fallbackShortcutSection.renderTokens();
      }
    }
  }

  function normalizeLocale(locale: unknown): string {
    return SETTINGS.normalizeLocale(locale);
  }

  function localeToHtmlLang(locale: unknown): string {
    return SETTINGS.localeToHtmlLang(locale);
  }

  function applyDocumentLanguage(locale: string): void {
    if (!document.documentElement) {
      return;
    }
    document.documentElement.lang = localeToHtmlLang(locale);
  }

  function getSystemLocale(): string {
    if (chrome.i18n && chrome.i18n.getUILanguage) {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
    return normalizeLocale(navigator.language || 'en');
  }

  // A stored language is the picker value: the language's html lang, or
  // 'system' for anything Lumno has no copy in.
  function normalizeLanguageMode(mode: unknown): string {
    const locale = SETTINGS.resolveSupportedLocale(mode);
    return locale ? SETTINGS.localeToHtmlLang(locale) : 'system';
  }

  // AI-translated languages say so under the picker and ask for corrections.
  function renderMachineTranslationNote(locale: string): void {
    if (languageMachineNote) {
      languageMachineNote.hidden = !SETTINGS.isMachineTranslatedLocale(locale);
    }
  }

  function loadLocaleMessages(locale: string): Promise<LocaleMessages> {
    const normalized = normalizeLocale(locale);
    const localePath = chrome.runtime.getURL(`_locales/${normalized}/messages.json`);
    const fetchFromBackground = (): Promise<LocaleMessages> => new Promise((resolve) => {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'getLocaleMessages', locale: normalized }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(readLocaleMessages(response ? response.messages : undefined));
      });
    });
    return fetch(localePath, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('locale fetch failed');
        }
        return response.json();
      })
      .then((messages: unknown) => readLocaleMessages(messages))
      .catch(() => fetchFromBackground());
  }

  function applyLanguageMode(mode: unknown, options?: { persist?: boolean }): void {
    const requestId = ++languageApplyRequestId;
    const normalizedMode = normalizeLanguageMode(mode);
    optionsState.currentLanguageMode = normalizedMode;
    const targetLocale = normalizedMode === 'system' ? getSystemLocale() : normalizeLocale(normalizedMode);
    applyDocumentLanguage(targetLocale);
    const shouldPersist = Boolean(options && options.persist);
    if (shouldPersist) {
      const payload = {
        [LANGUAGE_STORAGE_KEY]: normalizedMode
      };
      if (localStorageArea) {
        localStorageArea.set(payload);
      }
      if (optionsState.storageArea) {
        optionsState.storageArea.set(payload);
      }
    }
    loadLocaleMessages(targetLocale).then((messages) => {
      if (requestId !== languageApplyRequestId) {
        return;
      }
      currentMessages = messages;
      if (languageSelect) {
        setOptionsSelectState(languageSelect, normalizedMode);
        if (languageSelect.value !== normalizedMode) {
          setOptionsSelectState(languageSelect, 'system');
        }
      }
      applyI18n();
      renderMachineTranslationNote(targetLocale);
      renderOptionsInfoButtons();
      renderFeedbackSupport();
      renderTranslationHelp();
      refreshCustomSelects();
      setEditingState(optionsState.editingSiteSearchKey);
      updateBuiltinResetTooltip();
      updateCustomClearTooltip();
      updateAggregateSearchClearTooltip();
      updateBlacklistClearTooltip();
      refreshSyncStatus();
      if (optionsState.fallbackShortcutSection) {
        optionsState.fallbackShortcutSection.refreshShortcutsStatus();
      }
      renderShortcutReferenceList();
      if (optionsState.themeSection) {
        optionsState.themeSection.render();
      }
      setNewtabWidthTabState(optionsState.currentNewtabWidthMode);
      setOverlaySizeTabState(optionsState.currentOverlaySizeMode);
      setOverlayEnterAnimationTabState(optionsState.currentOverlayEnterAnimation);
      setSearchResultPriorityTabState(optionsState.currentSearchResultPriority);
      setRecentModeTabState(optionsState.currentRecentMode);
      setRestrictedActionTabState(optionsState.currentRestrictedAction);
      setNewtabTopContentTabState(optionsState.currentNewtabTopContentMode);
      renderNewtabTimeFontWeightControl(optionsState.currentNewtabTimeFontWeight);
      renderNewtabTimeFontSizeControl(optionsState.currentNewtabTimeFontSize);
      renderNewtabTimeOpacityControl(optionsState.currentNewtabTimeOpacity);
      setNewtabTimeInkTabState(optionsState.currentNewtabTimeInk);
      setNewtabGlassThemeTabState(optionsState.currentNewtabGlassTheme);
      if (optionsState.dailyQuoteSettings) {
        optionsState.dailyQuoteSettings.updateLanguage();
      }
      renderNewtabShortcutColumnsControl(optionsState.currentNewtabShortcutColumns);
      renderNewtabShortcutSizeControl(optionsState.currentNewtabShortcutSize);
      renderNewtabShortcutGapControl(optionsState.currentNewtabShortcutGap);
      syncNewtabShortcutSubcontrolAvailability();
      renderRecentCountControl(optionsState.currentRecentCount);
      renderBookmarkRowsControl(optionsState.currentBookmarkCount);
      renderBookmarkColumnsControl(optionsState.currentBookmarkColumns);
      renderSearchResultDisplayLimitControl(optionsState.currentSearchResultDisplayLimit);
      renderOverlayWidthControl(optionsState.currentOverlayWidth);
      renderSettingsNavigation(optionsState.currentActiveSettingsTab);
      renderSiteSearchList();
      renderAggregateSearchList();
      renderSearchBlacklistList();
    });
  }

  return {
    getMessage,
    normalizeLocale,
    getSystemLocale,
    normalizeLanguageMode,
    applyLanguageMode,
    loadLocaleMessages
  };
}

export { createLanguage };
export type { LanguageDeps, LanguageState, LocaleMessages };
