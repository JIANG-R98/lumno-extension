// The page language: resolving the locale, loading its messages, the
// t() and formatMessage() lookups every module uses, the document's lang
// attribute, and the listeners that re-render copy when it changes.
import type * as LumnoSettings from '../domain/settings';
import type { FormatMessage, Translate } from './newtab-types';
import { takeBootValue } from '../platform/boot-handoff';
import * as SearchDirectNavigation from '../domain/search/utils/direct-navigation';
import * as SettingsStorage from '../platform/settings-storage';

// A locale's messages as _locales/<locale>/messages.json holds them.
type LocaleMessages = Record<string, { message?: string } | undefined>;

interface PageLanguageState {
  currentMessages: LocaleMessages | null;
}

interface PageLanguageDeps {
  languageChangeListeners: Array<() => void>;
  SETTINGS: Pick<typeof LumnoSettings, 'normalizeLocale' | 'localeToHtmlLang'>;
  getExtensionResourceUrl(path: string): string;
  pageState: PageLanguageState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// Messages read from a fetched file, read as untrusted.
function readLocaleMessages(value: unknown): LocaleMessages {
  const messages: LocaleMessages = {};
  if (!isRecord(value)) {
    return messages;
  }
  Object.keys(value).forEach((key) => {
    const entry = value[key];
    if (isRecord(entry) && typeof entry.message === 'string') {
      messages[key] = { message: entry.message };
    }
  });
  return messages;
}

function createPageLanguage(deps: PageLanguageDeps) {
  const {
    languageChangeListeners,
    SETTINGS,
    getExtensionResourceUrl
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function onLanguageChange(listener: () => void): void {
    languageChangeListeners.push(listener);
  }

  function normalizeLocale(locale: unknown): string {
    return SETTINGS.normalizeLocale(locale);
  }

  function localeToHtmlLang(locale: unknown): string {
    return SETTINGS.localeToHtmlLang(locale);
  }

  function applyDocumentLanguage(locale: unknown): void {
    if (!document.documentElement) {
      return;
    }
    document.documentElement.lang = localeToHtmlLang(locale);
  }

  function getSystemLocale(): string {
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
    return normalizeLocale(navigator.language || 'en');
  }

  function sanitizeDisplayText(text: unknown): string {
    return SearchDirectNavigation.sanitizeDisplayText(text);
  }

  function loadLocaleMessages(locale: unknown): Promise<LocaleMessages> {
    const normalized = normalizeLocale(locale);
    SettingsStorage.cacheNewtabLocale(normalized);
    // newtab-storage-prefetch.ts started the last New Tab's locale before this script loaded.
    const prefetch = takeBootValue('localePrefetch');
    if (prefetch && prefetch.locale === normalized) {
      return prefetch.messages.then(readLocaleMessages, (): LocaleMessages => ({}));
    }
    const localePath = getExtensionResourceUrl(`_locales/${normalized}/messages.json`);
    return fetch(localePath, { cache: 'no-store' })
      .then((response): Promise<unknown> => response.json())
      .then(readLocaleMessages, (): LocaleMessages => ({}));
  }

  const t: Translate = (key, fallback) => {
    if (pageState.currentMessages && pageState.currentMessages[key] && pageState.currentMessages[key].message) {
      return pageState.currentMessages[key].message;
    }
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  };

  const formatMessage: FormatMessage = (key, fallback, params) => {
    let text = t(key, fallback);
    if (!params) {
      return text;
    }
    Object.keys(params).forEach((token) => {
      const value = params[token];
      text = text.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
    });
    return text;
  };

  return {
    onLanguageChange,
    normalizeLocale,
    applyDocumentLanguage,
    getSystemLocale,
    sanitizeDisplayText,
    loadLocaleMessages,
    t,
    formatMessage
  };
}

type PageLanguage = ReturnType<typeof createPageLanguage>;

export { createPageLanguage };
export type { LocaleMessages, PageLanguage, PageLanguageDeps, PageLanguageState };
