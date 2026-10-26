// The page language: resolving and loading the locale, applying the copy
// to every control, and the document language.
import { readLocaleMessages } from '../domain/locale-messages';
import type { LocaleMessage } from '../domain/messages';
import type * as Settings from '../domain/settings';
import { language as languageSetting } from '../domain/settings/locale';
import { isHtmlTag } from '../shared/dom-guards';
import * as LumnoBrowserProfile from '../platform/browser-profile';
import * as LumnoMessaging from '../platform/messaging';
import type { SettingsStore } from '../platform/settings-store';
import type { createSearchShortcutStatus } from './options-search-shortcut-status';
import type { SettingsTabKey } from './options-navigation';
import type { createThemeSection } from './options-theme';
import type { FormatTemplate } from './options-types';
import type { createController as createWebDavController } from './webdav-options';

type LocaleMessages = Record<string, LocaleMessage>;

interface LanguageState {
  currentLanguageMode: string;
  settingsStore: Pick<SettingsStore, 'include' | 'get' | 'set'>;
  isMacPlatform: boolean;
  currentActiveSettingsTab: SettingsTabKey;
  // Made as the page starts; null until then.
  webDavSettingsController: ReturnType<typeof createWebDavController> | null;
  searchShortcutStatus: ReturnType<typeof createSearchShortcutStatus> | null;
  themeSection: ReturnType<typeof createThemeSection> | null;
}

interface LanguageDeps {
  formatTemplate: FormatTemplate;
  formatShortcutForDisplay(shortcut: string): string;
  SETTINGS: Pick<typeof Settings, 'normalizeLocale' | 'localeToHtmlLang' | 'resolveSupportedLocale'>;
  renderFeedbackSupport(): void;
  renderTranslationHelp(): void;
  refreshCustomSelects(): void;
  refreshSyncStatus(): void;
  renderShortcutReferenceList(): void;
  renderSettingsNavigation(tabKey: SettingsTabKey): void;
  // Redraws the tab sections React views draw from translated copy.
  renderTabSections(): void;
  // The picker's language and the locale the page now shows.
  onLanguageApplied(mode: string, locale: string): void;
  renderSiteSearchList(): void;
  renderAggregateSearchList(): void;
  optionsState: LanguageState;
}

function createLanguage(deps: LanguageDeps) {
  const {
    formatTemplate,
    formatShortcutForDisplay,
    SETTINGS,
    renderFeedbackSupport,
    renderTranslationHelp,
    refreshCustomSelects,
    refreshSyncStatus,
    renderShortcutReferenceList,
    renderSettingsNavigation,
    renderTabSections,
    onLanguageApplied,
    renderSiteSearchList,
    renderAggregateSearchList
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
    return languageSetting.parse(mode);
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
    if (options && options.persist) {
      void optionsState.settingsStore.set(languageSetting, normalizedMode).catch(() => {});
    }
    loadLocaleMessages(targetLocale).then((messages) => {
      if (requestId !== languageApplyRequestId) {
        return;
      }
      currentMessages = messages;
      onLanguageApplied(normalizedMode, targetLocale);
      applyI18n();
      renderFeedbackSupport();
      renderTranslationHelp();
      refreshCustomSelects();
      refreshSyncStatus();
      if (optionsState.searchShortcutStatus) {
        optionsState.searchShortcutStatus.render();
      }
      renderShortcutReferenceList();
      if (optionsState.themeSection) {
        optionsState.themeSection.render();
      }
      renderSettingsNavigation(optionsState.currentActiveSettingsTab);
      renderTabSections();
      renderSiteSearchList();
      renderAggregateSearchList();
    });
  }

  // With nothing stored the page shows the system language without writing
  // it, so a choice another page is still saving is not overwritten; the
  // language change handler applies that choice once it lands.
  function loadLanguageSetting(): void {
    const store = optionsState.settingsStore;
    void store.include(languageSetting).then(() => applyLanguageMode(store.get(languageSetting)));
  }

  return {
    getMessage,
    normalizeLocale,
    getSystemLocale,
    applyLanguageMode,
    loadLanguageSetting,
    loadLocaleMessages
  };
}

export { createLanguage };
export type { LanguageDeps, LanguageState, LocaleMessages };
