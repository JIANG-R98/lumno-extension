// @ts-nocheck
// The page language: resolving and loading the locale, applying the copy
// to every control, and the document language.
import * as LumnoBrowserProfile from '../platform/browser-profile';

function createLanguage(deps) {
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
    renderSettingsNavigation,
    renderSiteSearchList,
    renderAggregateSearchList,
    renderSearchBlacklistList
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  let currentMessages = null;
  let languageApplyRequestId = 0;

  function getMessage(key, fallback) {
    if (currentMessages && Object.prototype.hasOwnProperty.call(currentMessages, key)) {
      const entry = currentMessages[key];
      if (entry && typeof entry.message === 'string') {
        return entry.message;
      }
    }
    if (optionsState.currentLanguageMode !== 'system') {
      return fallback || '';
    }
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  }

  function applyI18n() {
    if (optionsState.webDavSettingsController) optionsState.webDavSettingsController.render();
    renderOverlayFontMissingNotices();
    popconfirmLanguageRefreshers.forEach((refresh) => refresh());
    const browserName = LumnoBrowserProfile?.getBrowserInternalProfile(navigator).name || 'Chrome';
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
      if (node.tagName === 'OPTION') {
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
      optionsState.fallbackShortcutSection.renderTokens();
    }
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

  // A stored language is the picker value: the language's html lang, or
  // 'system' for anything Lumno has no copy in.
  function normalizeLanguageMode(mode) {
    const locale = SETTINGS.resolveSupportedLocale(mode);
    return locale ? SETTINGS.localeToHtmlLang(locale) : 'system';
  }

  // AI-translated languages say so under the picker and ask for corrections.
  function renderMachineTranslationNote(locale) {
    if (languageMachineNote) {
      languageMachineNote.hidden = !SETTINGS.isMachineTranslatedLocale(locale);
    }
  }

  function loadLocaleMessages(locale) {
    const normalized = normalizeLocale(locale);
    const localePath = chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function'
      ? chrome.runtime.getURL(`_locales/${normalized}/messages.json`)
      : `../../_locales/${normalized}/messages.json`;
    const fetchFromBackground = () => new Promise((resolve) => {
      if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve({});
        return;
      }
      chrome.runtime.sendMessage({ action: 'getLocaleMessages', locale: normalized }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({});
          return;
        }
        resolve(response && response.messages ? response.messages : {});
      });
    });
    return fetch(localePath, { cache: 'no-store' })
      .then((response) => {
        if (!response || !response.ok) {
          throw new Error('locale fetch failed');
        }
        return response.json();
      })
      .catch(() => fetchFromBackground());
  }

  function applyLanguageMode(mode, options) {
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
      currentMessages = messages || {};
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
      optionsState.fallbackShortcutSection.refreshShortcutsStatus();
      renderShortcutReferenceList();
      optionsState.themeSection.render();
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
