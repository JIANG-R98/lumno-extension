// The panel language: locale, messages, t() and formatMessage(), and
// applying the copy to the panel when the language changes.
import * as LumnoCjkFontFaces from '../../shared/cjk-font-faces.js';

function createPanelLanguage(deps) {
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
    requestTabsAndRender
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  let currentMessages = null;

  function applyOverlayCjkFontFace(locale) {
    const cjkFontFaces = LumnoCjkFontFaces;
    if (!cjkFontFaces) {
      return;
    }
    cjkFontFaces.install(document, {
      family: 'Lumno Open Sans',
      lang: SETTINGS.localeToHtmlLang(locale),
      styleId: '_x_extension_overlay_cjk_font_faces_2026_unique_'
    });
  }

  function getSystemLocale() {
    if (chrome && chrome.i18n && chrome.i18n.getUILanguage) {
      return SETTINGS.normalizeLocale(chrome.i18n.getUILanguage());
    }
    return SETTINGS.normalizeLocale(navigator.language || 'en');
  }

  function loadLocaleMessages(locale) {
    return overlayRuntime.loadLocaleMessages({
      chromeApi: chrome,
      locale,
      normalizeLocale: SETTINGS.normalizeLocale
    });
  }

  function t(key, fallback) {
    if (currentMessages && currentMessages[key] && currentMessages[key].message) {
      return currentMessages[key].message;
    }
    if (chrome && chrome.i18n && chrome.i18n.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
    return fallback || '';
  }

  function getStorageValuesAsync(keys) {
    return overlayRuntime.getStorageValues(storageArea, keys);
  }

  function loadPreferredLocaleMessages(locale, fallbackMessages) {
    return loadLocaleMessages(locale).then((messages) => {
      if (messages && Object.keys(messages).length > 0) {
        return messages;
      }
      return fallbackMessages || {};
    }).catch(() => fallbackMessages || {});
  }

  async function bootstrapOverlayLanguageForInitialRender(settingsReady) {
    const result = await Promise.resolve(settingsReady ||
      getStorageValuesAsync([LANGUAGE_STORAGE_KEY]));
    overlayState.overlayLanguageMode = result[LANGUAGE_STORAGE_KEY] || 'system';
    const targetLocale = overlayState.overlayLanguageMode === 'system'
      ? getSystemLocale()
      : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
    applyOverlayCjkFontFace(targetLocale);
    currentMessages = await loadPreferredLocaleMessages(targetLocale, null);
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

  function applyLanguageStrings(options) {
    const refreshResults = !options || options.refreshResults !== false;
    if (overlayState.inputModeController &&
        typeof overlayState.inputModeController.refreshModeMenuLanguage === 'function') {
      overlayState.inputModeController.refreshModeMenuLanguage();
    }
    if (overlayState.overlayUpdateNoticeController &&
        typeof overlayState.overlayUpdateNoticeController.updateLanguage === 'function') {
      overlayState.overlayUpdateNoticeController.updateLanguage();
    }
    if (overlayState.overlayEngagementNoticeController &&
        typeof overlayState.overlayEngagementNoticeController.updateLanguage === 'function') {
      overlayState.overlayEngagementNoticeController.updateLanguage();
    }
    const settingsTooltipText = formatMessage('command_settings', '打开设置', { name: 'Lumno' });
    const closeOtherTooltipText = t('overlay_close_other_tabs_tooltip', '关闭其他标签页');
    if (overlayState.searchInput) {
      overlayState.defaultPlaceholderText = t('overlay_search_placeholder', t('search_placeholder', overlayState.defaultPlaceholderText));
      if (!overlayState.siteSearchState && !overlayState.localSearchScopeState) {
        overlayState.searchInput.placeholder = overlayState.defaultPlaceholderText;
      }
    }
    if (overlayState.rightIcon) {
      overlayState.rightIcon.setAttribute('aria-label', settingsTooltipText);
    }
    if (overlayState.closeOtherTabsButton) {
      overlayState.closeOtherTabsButton.setAttribute('aria-label', closeOtherTooltipText);
    }
    if (overlayState.searchClearButton) {
      overlayState.searchClearButton.setAttribute('aria-label', t('search_input_clear', '清空'));
    }
    if (overlayState.modeBadge) {
      updateModeBadge(overlayState.searchInput ? overlayState.searchInput.value : '');
    }
    if (overlayState.siteSearchState) {
      const activeSiteSearchProvider = overlayState.siteSearchState;
      setSiteSearchPrefix(activeSiteSearchProvider, overlayState.defaultTheme);
      getThemeForProvider(activeSiteSearchProvider).then((theme) => {
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

  function applyLanguageMode(mode) {
    overlayState.overlayLanguageMode = mode || 'system';
    const targetLocale = overlayState.overlayLanguageMode === 'system'
      ? getSystemLocale()
      : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
    applyOverlayCjkFontFace(targetLocale);
    loadPreferredLocaleMessages(targetLocale, null).then((messages) => {
      currentMessages = messages || {};
      applyLanguageStrings();
    });
  }

  return {
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
