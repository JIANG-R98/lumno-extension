// Overlay settings that can change while it is open: one storage
// listener per setting, and the reads that load them for this session.
function createSettingsSync(deps) {
  const {
    SEARCH_BLACKLIST_STORAGE_KEY,
    normalizeOverlaySearchBlacklistItems,
    SETTINGS,
    updateSearchSuggestions,
    isPrimaryStorageAreaName,
    THEME_STORAGE_KEY,
    OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
    normalizeOverlayPageThemeAdaptationEnabled,
    applyOverlayTheme,
    LANGUAGE_STORAGE_KEY,
    applyLanguageMode,
    loadOverlaySearchEngineState,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    clearLocalSearchScope,
    requestOverlaySearchSuggestions,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    shouldShowOpenTabsForEmptyQuery,
    renderTabSuggestions,
    filterTabsForOverlay,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    SUGGESTION_NAVIGATION,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    initialOverlaySettingsReady,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    normalizeOverlayFaviconRequestBlacklistItems,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    refreshOverlayFaviconsForPolicyChange,
    setSiteSearchPrefix,
    getImmediateThemeForSuggestion,
    OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
    requestTabsAndRender,
    clearDefaultOpenTabsSuggestions,
    DOCUMENT_PIP_ENABLED_STORAGE_KEY,
    documentPipSupported,
    OVERLAY_TAB_PRIORITY_STORAGE_KEY,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    overlayRuntime,
    localStorageArea,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    applyOverlayFontFamily,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function loadOverlaySearchBlacklistItems(onReload) {
    if (!overlayState.storageArea) {
      overlayState.overlaySearchBlacklistItems = [];
      return;
    }
    overlayState.storageArea.get([SEARCH_BLACKLIST_STORAGE_KEY], (result) => {
      overlayState.overlaySearchBlacklistItems = normalizeOverlaySearchBlacklistItems(
        result ? result[SEARCH_BLACKLIST_STORAGE_KEY] : null
      );
      if (typeof onReload === 'function') {
        onReload();
      }
    });
  }

  function normalizeFaviconEnhancedFetchEnabled(value) {
    return SETTINGS.normalizeFaviconEnhancedFetchEnabled(value);
  }

  function applyOverlaySizeForPageZoom(overlayElement) {
    overlayState.overlayViewportSizeSync.apply(overlayElement);
    overlayState.overlayNoticeLayer.sync(overlayElement);
  }

  function refreshOverlaySuggestionsFromLastResponse() {
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || (
      !changes[THEME_STORAGE_KEY] &&
      !changes[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]
    )) {
      return;
    }
    if (changes[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]) {
      overlayState.overlayPageThemeAdaptationEnabled = normalizeOverlayPageThemeAdaptationEnabled(
        changes[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY].newValue
      );
    }
    const nextMode = changes[THEME_STORAGE_KEY]
      ? changes[THEME_STORAGE_KEY].newValue || 'system'
      : overlayState.overlayThemeMode;
    applyOverlayTheme(nextMode);
  });

  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName)) {
      return;
    }
    if (changes[LANGUAGE_STORAGE_KEY]) {
      applyLanguageMode(changes[LANGUAGE_STORAGE_KEY].newValue || 'system');
    }
  });

  overlayState.overlaySearchEngineStateReady = loadOverlaySearchEngineState(
    refreshOverlaySuggestionsFromLastResponse
  );
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY]) {
      return;
    }
    const nextValue = changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY].newValue;
    if (nextValue && nextValue.id &&
        (!SEARCH_UTILS.isRetiredSearchEngineState(nextValue))) {
      overlayState.overlaySearchEngineState = nextValue;
      if (overlayState.latestOverlayQuery) {
        updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
      }
    }
  });
  if (overlayState.storageArea) {
    overlayState.storageArea.get([
      SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY
    ], (result) => {
      overlayState.overlaySearchResultPriorityMode = SETTINGS.normalizeSearchResultPriority(result[SEARCH_RESULT_PRIORITY_STORAGE_KEY]);
      overlayState.enabledSearchResultSourceTypes = SETTINGS.normalizeSearchResultSourceTypes(
        result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]
      );
    });
  }
  loadOverlaySearchBlacklistItems(refreshOverlaySuggestionsFromLastResponse);
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY]) {
      return;
    }
    overlayState.overlaySearchResultPriorityMode = SETTINGS.normalizeSearchResultPriority(changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY].newValue);
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]) {
      return;
    }
    overlayState.enabledSearchResultSourceTypes = SETTINGS.normalizeSearchResultSourceTypes(
      changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY].newValue
    );
    if (overlayState.localSearchScopeState &&
        !overlayState.enabledSearchResultSourceTypes.includes(overlayState.localSearchScopeState.sourceType)) {
      clearLocalSearchScope();
    }
    if (overlayState.latestOverlayQuery) {
      requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]) {
      return;
    }
    overlayState.overlaySearchResultDisplayLimit = normalizeSearchResultDisplayLimit(
      changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY].newValue
    );
    if (overlayState.openTabsSearchModeActive || (!overlayState.latestOverlayQuery && shouldShowOpenTabsForEmptyQuery())) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    refreshOverlaySuggestionsFromLastResponse();
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) ||
        !changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY]) {
      return;
    }
    const rawValue = changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY].newValue;
    overlayState.numberShortcutInstantEnabled = SETTINGS.normalizeNumberShortcutInstantEnabled(rawValue);
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(overlayState.suggestionsContainer);
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) ||
        !changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY]) {
      return;
    }
    const rawValue = changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY].newValue;
    overlayState.macosCtrlSuggestionNavigationEnabled =
      SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(rawValue);
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[SIMPLE_MODE_ENABLED_STORAGE_KEY]) {
      return;
    }
    const rawValue = changes[SIMPLE_MODE_ENABLED_STORAGE_KEY].newValue;
    overlayState.simpleModeEnabled = SETTINGS.normalizeSimpleModeEnabled(rawValue);
    if (overlayState.openTabsSearchModeActive || (!overlayState.latestOverlayQuery && shouldShowOpenTabsForEmptyQuery())) {
      renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, overlayState.latestOverlayQuery));
      return;
    }
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery, {
        forceFullRerender: true
      });
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[SEARCH_BLACKLIST_STORAGE_KEY]) {
      return;
    }
    overlayState.overlaySearchBlacklistItems = normalizeOverlaySearchBlacklistItems(
      changes[SEARCH_BLACKLIST_STORAGE_KEY].newValue
    );
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  if (overlayState.storageArea) {
    overlayState.initialFaviconEnhancedFetchReady = initialOverlaySettingsReady.then((result) => {
      overlayState.faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
        result ? result[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY] : true
      );
      overlayState.overlayFaviconRequestBlacklistItems = normalizeOverlayFaviconRequestBlacklistItems(
        result ? result[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY] : null
      );
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || (
      !changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY] &&
      !changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]
    )) {
      return;
    }
    if (changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]) {
      overlayState.faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
        changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY].newValue
      );
    }
    if (changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]) {
      overlayState.overlayFaviconRequestBlacklistItems = normalizeOverlayFaviconRequestBlacklistItems(
        changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY].newValue
      );
    }
    refreshOverlayFaviconsForPolicyChange();
    if (overlayState.inputModeController) {
      if (overlayState.siteSearchState) {
        setSiteSearchPrefix(overlayState.siteSearchState, getImmediateThemeForSuggestion({ provider: overlayState.siteSearchState }), { animate: false });
      }
      overlayState.inputModeController.refreshModeMenu();
    }
  });
  if (overlayState.storageArea) {
    overlayState.initialOverlayOpenTabsDefaultVisibleReady = initialOverlaySettingsReady.then((result) => {
      const rawValue = result ? result[OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY] : undefined;
      const normalized = SETTINGS.normalizeOverlayOpenTabsDefaultVisible(rawValue);
      overlayState.overlayOpenTabsDefaultVisible = normalized;
      overlayState.overlayOpenTabsDefaultVisibleLoaded = true;
      if (rawValue !== normalized) {
        overlayState.storageArea.set({ [OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]: normalized });
      }
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]) {
      return;
    }
    const rawValue = changes[OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY].newValue;
    const normalized = SETTINGS.normalizeOverlayOpenTabsDefaultVisible(rawValue);
    overlayState.overlayOpenTabsDefaultVisible = normalized;
    overlayState.overlayOpenTabsDefaultVisibleLoaded = true;
    if (rawValue !== normalized && overlayState.storageArea) {
      overlayState.storageArea.set({ [OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]: normalized });
    }
    if (overlayState.latestOverlayQuery || overlayState.openTabsSearchModeActive) {
      return;
    }
    if (normalized) {
      requestTabsAndRender('');
    } else {
      clearDefaultOpenTabsSuggestions();
    }
  });
  if (overlayState.storageArea) {
    overlayState.storageArea.get([DOCUMENT_PIP_ENABLED_STORAGE_KEY], (result) => {
      overlayState.documentPipEnabled = documentPipSupported && Boolean(result) && result[DOCUMENT_PIP_ENABLED_STORAGE_KEY] === true;
      if (overlayState.latestOverlayQuery) {
        updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
      }
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[DOCUMENT_PIP_ENABLED_STORAGE_KEY]) {
      return;
    }
    overlayState.documentPipEnabled = documentPipSupported && changes[DOCUMENT_PIP_ENABLED_STORAGE_KEY].newValue === true;
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });

  if (overlayState.storageArea) {
    overlayState.storageArea.get([OVERLAY_TAB_PRIORITY_STORAGE_KEY], (result) => {
      overlayState.overlayTabQuickSwitchEnabled = SETTINGS.normalizeOverlayTabPriorityMode(result[OVERLAY_TAB_PRIORITY_STORAGE_KEY]);
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY]) {
      return;
    }
    overlayState.overlayTabQuickSwitchEnabled = SETTINGS.normalizeOverlayTabPriorityMode(changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY].newValue);
    if (overlayState.latestOverlayQuery) {
      updateSearchSuggestions(overlayState.lastSuggestionResponse, overlayState.latestOverlayQuery);
    }
  });
  const initialOverlaySizeReady = initialOverlaySettingsReady.then((result) => {
    overlayState.overlaySizeMode = SETTINGS.normalizeOverlaySizeMode(result[OVERLAY_SIZE_MODE_STORAGE_KEY]);
    applyOverlaySizeForPageZoom(overlayState.overlay);
    return overlayState.overlaySizeMode;
  });
  // The fonts are this device's own choice (installed faces), so they are
  // read from chrome.storage.local whichever area holds synced settings.
  const initialOverlayFontFamilyReady = overlayRuntime.getStorageValues(
    localStorageArea,
    [OVERLAY_FONT_FAMILY_STORAGE_KEY, OVERLAY_FONT_FALLBACK_STORAGE_KEY]
  ).then((result) => {
    overlayState.overlayFontFamily = SETTINGS.normalizeOverlayFontFamily(result[OVERLAY_FONT_FAMILY_STORAGE_KEY]);
    overlayState.overlayFontFallback = SETTINGS.normalizeOverlayFontFamily(result[OVERLAY_FONT_FALLBACK_STORAGE_KEY]);
    applyOverlayFontFamily(overlayState.overlay);
    return overlayState.overlayFontFamily;
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }
    let changed = false;
    if (changes[OVERLAY_FONT_FAMILY_STORAGE_KEY]) {
      overlayState.overlayFontFamily = SETTINGS.normalizeOverlayFontFamily(
        changes[OVERLAY_FONT_FAMILY_STORAGE_KEY].newValue
      );
      changed = true;
    }
    if (changes[OVERLAY_FONT_FALLBACK_STORAGE_KEY]) {
      overlayState.overlayFontFallback = SETTINGS.normalizeOverlayFontFamily(
        changes[OVERLAY_FONT_FALLBACK_STORAGE_KEY].newValue
      );
      changed = true;
    }
    if (changed) {
      applyOverlayFontFamily(overlayState.overlay);
    }
  });
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[OVERLAY_SIZE_MODE_STORAGE_KEY]) {
      return;
    }
    overlayState.overlaySizeMode = SETTINGS.normalizeOverlaySizeMode(changes[OVERLAY_SIZE_MODE_STORAGE_KEY].newValue);
    applyOverlaySizeForPageZoom(overlayState.overlay);
  });
  if (overlayState.storageArea) {
    overlayState.storageArea.get([TAB_RANK_SCORE_DEBUG_STORAGE_KEY], (result) => {
      overlayState.overlayTabScoreDebugEnabled = SETTINGS.normalizeTabRankScoreDebugMode(result[TAB_RANK_SCORE_DEBUG_STORAGE_KEY]);
    });
  }
  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY]) {
      return;
    }
    overlayState.overlayTabScoreDebugEnabled = SETTINGS.normalizeTabRankScoreDebugMode(changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY].newValue);
    if (!overlayState.latestOverlayQuery || !overlayState.latestOverlayQuery.trim()) {
      requestTabsAndRender();
    }
  });

  return {
    initialOverlaySizeReady,
    initialOverlayFontFamilyReady
  };
}

export { createSettingsSync };
