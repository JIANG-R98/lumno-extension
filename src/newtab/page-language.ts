// The page language: resolving the locale, loading its messages, the
// t() and formatMessage() lookups every module uses, the document's lang
// attribute, and the listeners that re-render copy when it changes.
import * as LumnoSettingsStorage from '../platform/settings-storage';
function createPageLanguage(deps) {
  const {
    languageChangeListeners,
    SETTINGS,
    SEARCH_UTILS,
    getExtensionResourceUrl
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function onLanguageChange(listener) {
    languageChangeListeners.push(listener);
  }

  function normalizeLocale(locale) {
    return SETTINGS.normalizeLocale(locale);
  }

  function localeToHtmlLang(locale) {
    return SETTINGS.localeToHtmlLang(locale);
  }

  function applyDocumentLanguage(locale) {
    if (!document.documentElement) {
      return;
    }
    document.documentElement.lang = localeToHtmlLang(locale);
  }

  function getSystemLocale() {
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
    return normalizeLocale(navigator.language || 'en');
  }

  function sanitizeDisplayText(text) {
    return SEARCH_UTILS.sanitizeDisplayText(text);
  }

  function loadLocaleMessages(locale) {
    const normalized = normalizeLocale(locale);
    LumnoSettingsStorage.cacheNewtabLocale(normalized);
    // newtab-storage-prefetch.ts started the last New Tab's locale before this script loaded.
    const prefetch = globalThis.LumnoNewtabLocalePrefetch;
    globalThis.LumnoNewtabLocalePrefetch = null;
    if (prefetch && prefetch.locale === normalized) {
      return prefetch.messages.catch(() => ({}));
    }
    const localePath = getExtensionResourceUrl(`_locales/${normalized}/messages.json`);
    return fetch(localePath, { cache: 'no-store' })
      .then((response) => response.json())
      .catch(() => ({}));
  }

  function t(key, fallback) {
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
  }

  function formatMessage(key, fallback, params) {
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

export { createPageLanguage };
