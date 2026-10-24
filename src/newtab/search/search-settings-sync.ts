// @ts-nocheck
// Search settings that can change while the page is open: the default
// engine, result priority, sources and limit, open-in-new-tab, number
// shortcuts, simple mode and the search and favicon blacklists.
function createSearchSettingsSync(deps) {
  const {
    loadDefaultSearchEngineState,
    storageChanges,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalizeSearchResultPriority,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    normalizeEnabledSearchResultSourceTypes,
    clearLocalSearchScope,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    renderSuggestions,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    SETTINGS,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    normalizeNumberShortcutInstantEnabled,
    SUGGESTION_NAVIGATION,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    normalizeMacosCtrlSuggestionNavigationEnabled,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    normalizeSimpleModeEnabled,
    OVERLAY_TAB_PRIORITY_STORAGE_KEY,
    normalizeOverlayTabPriorityMode,
    requestSuggestions,
    SEARCH_BLACKLIST_STORAGE_KEY,
    normalizeSearchBlacklistItems,
    markRecentDataDirty,
    scheduleRecentReloadIfVisible,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    normalizeFaviconRequestBlacklistItems,
    scheduleBookmarkReloadIfVisible,
    refreshThemeAwareFavicons,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    normalizeFaviconEnhancedFetchEnabled,
    renderShortcuts,
    setSiteSearchPrefix,
    getImmediateThemeForSuggestion
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  loadDefaultSearchEngineState();
  storageChanges.on(DEFAULT_SEARCH_ENGINE_STORAGE_KEY, (changes) => {
    const nextValue = changes[DEFAULT_SEARCH_ENGINE_STORAGE_KEY].newValue;
    if (nextValue && nextValue.id &&
        (!SEARCH_UTILS.isRetiredSearchEngineState(nextValue))) {
      pageState.defaultSearchEngineState = nextValue;
    }
  });
  storageChanges.on(SEARCH_RESULT_PRIORITY_STORAGE_KEY, (changes) => {
    pageState.searchResultPriorityMode = normalizeSearchResultPriority(changes[SEARCH_RESULT_PRIORITY_STORAGE_KEY].newValue);
  });
  storageChanges.on(SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY, (changes) => {
    pageState.enabledSearchResultSourceTypes = normalizeEnabledSearchResultSourceTypes(
      changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY].newValue
    );
    if (pageState.localSearchScopeState &&
        !pageState.enabledSearchResultSourceTypes.includes(pageState.localSearchScopeState.sourceType)) {
      clearLocalSearchScope();
    }
  });
  storageChanges.on(SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY, (changes) => {
    pageState.searchResultDisplayLimit = normalizeSearchResultDisplayLimit(
      changes[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY].newValue
    );
    if (pageState.latestQuery) {
      renderSuggestions(pageState.lastSuggestionResponse, pageState.latestQuery);
    }
  });
  storageChanges.on(NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY, (changes) => {
    pageState.newtabOpenInNewTab = SETTINGS.normalizeNewtabOpenInNewTab(
      changes[NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY].newValue
    );
  });
  storageChanges.on(NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY, (changes) => {
    pageState.numberShortcutInstantEnabled = normalizeNumberShortcutInstantEnabled(
      changes[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY].newValue
    );
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(pageState.suggestionsContainer);
  });
  storageChanges.on(MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY, (changes) => {
    pageState.macosCtrlSuggestionNavigationEnabled = normalizeMacosCtrlSuggestionNavigationEnabled(
      changes[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY].newValue
    );
  });
  storageChanges.on(SIMPLE_MODE_ENABLED_STORAGE_KEY, (changes) => {
    pageState.simpleModeEnabled = normalizeSimpleModeEnabled(
      changes[SIMPLE_MODE_ENABLED_STORAGE_KEY].newValue
    );
    if (pageState.latestQuery) {
      renderSuggestions(pageState.lastSuggestionResponse, pageState.latestQuery);
    }
  });
  storageChanges.on(OVERLAY_TAB_PRIORITY_STORAGE_KEY, (changes) => {
    pageState.openTabQuickSwitchEnabled = normalizeOverlayTabPriorityMode(changes[OVERLAY_TAB_PRIORITY_STORAGE_KEY].newValue);
    if (pageState.latestQuery) {
      requestSuggestions(pageState.latestQuery, { immediate: true });
    }
  });
  storageChanges.on(SEARCH_BLACKLIST_STORAGE_KEY, (changes) => {
    pageState.searchBlacklistItems = normalizeSearchBlacklistItems(changes[SEARCH_BLACKLIST_STORAGE_KEY].newValue);
    markRecentDataDirty();
    scheduleRecentReloadIfVisible();
  });
  storageChanges.on(FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, (changes) => {
    pageState.faviconRequestBlacklistItems = normalizeFaviconRequestBlacklistItems(changes[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY].newValue);
    markRecentDataDirty();
    scheduleRecentReloadIfVisible();
    scheduleBookmarkReloadIfVisible();
    if (typeof refreshThemeAwareFavicons === 'function') {
      refreshThemeAwareFavicons();
    }
  });
  storageChanges.on(FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY, (changes) => {
    pageState.faviconEnhancedFetchEnabled = normalizeFaviconEnhancedFetchEnabled(
      changes[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY].newValue
    );
    markRecentDataDirty();
    scheduleRecentReloadIfVisible();
    scheduleBookmarkReloadIfVisible();
    if (typeof refreshThemeAwareFavicons === 'function') {
      refreshThemeAwareFavicons();
    }
  });
  storageChanges.on([FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY], () => {
    pageState.shortcutFaviconPolicyRevision += 1;
    renderShortcuts();
    if (pageState.inputModeController) {
      if (pageState.siteSearchState) {
        setSiteSearchPrefix(pageState.siteSearchState, getImmediateThemeForSuggestion({ provider: pageState.siteSearchState }), { animate: false });
      }
      pageState.inputModeController.refreshModeMenu();
    }
  });
  // These settings change which suggestions show, so they refresh at once.
  storageChanges.on([
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY
  ], () => {
    if (pageState.latestQuery && pageState.latestQuery.trim()) {
      requestSuggestions(pageState.latestQuery, { immediate: true });
    }
  });

  return {};
}

export { createSearchSettingsSync };
