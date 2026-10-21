'use strict';

window._x_extension_search_overlay_runtime_version_2026_unique_ =
  '2026-10-20-search-title-units-v17';
window._x_extension_search_overlay_open_2026_unique_ = false;

window._x_extension_toggleSearchOverlay_2026_unique_ = function(requestedTabs, overlayContext) {
  // Panel state shared with the parts of this panel in overlay/panel/: each
  // receives this one object as `overlayState` and reads and writes the same
  // properties this function does.
  const overlayState = {};
  overlayState.overlayThemeMediaListener = null;
  overlayState.overlayPageThemeObserver = null;
  overlayState.clickOutsideHandler = null;
  overlayState.overlayScrollPauseHandler = null;
  overlayState.overlayWheelIsolationHandler = null;
  overlayState.overlayRevealGate = null;
  overlayState.overlayUpdateNoticeController = null;
  overlayState.overlayEngagementNoticeController = null;
  overlayState.inputHistoryController = null;
  overlayState.isApplyingSearchInputHistory = false;
  overlayState.overlaySuggestionsView = null;
  overlayState.overlaySuggestionRequestSeq = 0;
  overlayState.overlayRemoteSuggestionDebounceTimer = null;
  overlayState.overlayFirstResultRevealTimer = null;
  overlayState.suppressOverlayLoadingSessionNotification = false;
  function cancelPendingOverlaySuggestionRequests() {
    overlayState.overlaySuggestionRequestSeq += 1;
    if (overlayState.overlayRemoteSuggestionDebounceTimer) {
      clearTimeout(overlayState.overlayRemoteSuggestionDebounceTimer);
      overlayState.overlayRemoteSuggestionDebounceTimer = null;
    }
    if (overlayState.overlayFirstResultRevealTimer) {
      clearTimeout(overlayState.overlayFirstResultRevealTimer);
      overlayState.overlayFirstResultRevealTimer = null;
    }
  }
  const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
  const OVERLAY_PANEL_ID = '_x_extension_overlay_2024_unique_';
  const overlayLifecycle = globalThis.LumnoOverlayLifecycle;

  const overlayShell = globalThis.LumnoOverlayShell;

  const PANEL_PANEL_SESSION = globalThis.LumnoOverlayPanelPanelSession;
  const {
    getOrCreateOverlayContextToken,
    getOverlayMountHost,
    setOverlayStoredContextToken,
    setOverlayMountVisibility,
    isStaleOverlay,
    createOverlayWheelIsolationHandler,
    notifyOverlayLoadingSession,
    removeOverlay,
    destroyExistingOverlaySession
  } = PANEL_PANEL_SESSION.createPanelSession({
    pauseOverlayAntiTranslateObserverForScroll: (...args) => pauseOverlayAntiTranslateObserverForScroll(...args),
    clearOverlayEnterAnimationFrames: (...args) => clearOverlayEnterAnimationFrames(...args),
    clearOverlayPanelEnterCleanup: (...args) => clearOverlayPanelEnterCleanup(...args),
    cancelPendingOverlaySuggestionRequests,
    stopOverlayAntiTranslateObserver: (...args) => stopOverlayAntiTranslateObserver(...args),
    overlayShell,
    stopOverlayPageThemeObserver,
    overlayLifecycle,
    overlayState
  });

  overlayState.overlayContextToken = getOrCreateOverlayContextToken();
  const SETTINGS = globalThis.LumnoSettings;
  const SEARCH_SOURCE_ORDER = globalThis.LumnoSearchSourceOrder;
  const SEARCH_SOURCE_ORDER_STORAGE_KEY = (SEARCH_SOURCE_ORDER && SEARCH_SOURCE_ORDER.STORAGE_KEY) ||
    '_x_extension_search_source_order_2026_unique_';
  const SEARCH_UTILS = globalThis.LumnoSearchUtils;
  const COMMUNITY_LINKS = globalThis.LumnoCommunityLinks;
  const AGGREGATE_SEARCH_STORE = globalThis.LumnoAggregateSearchStore;
  const SHORTCUT_FAVICON = globalThis.LumnoShortcutFavicon;
  const SUGGESTION_ACTION_MODEL = globalThis.LumnoSuggestionActionModel;

  const PANEL_RESULT_ACTIVATION = globalThis.LumnoOverlayPanelResultActivation;

  const PANEL_TAB_MATCHING = globalThis.LumnoOverlayPanelTabMatching;
  const {
    isEnglishQuery,
    getUrlDisplay,
    filterTabsForOverlay,
    getMatchedOpenTabIdForSuggestion,
    isCurrentOverlayTabUrl
  } = PANEL_TAB_MATCHING.createTabMatching({
    SEARCH_UTILS,
    overlayState
  });

  const PANEL_AUTOCOMPLETE = globalThis.LumnoOverlayPanelAutocomplete;

  const PANEL_SEARCH_MODES = globalThis.LumnoOverlayPanelSearchModes;

  const PANEL_SEARCH_INPUT_EVENTS = globalThis.LumnoOverlayPanelSearchInputEvents;

  const SUGGESTION_NAVIGATION = globalThis.LumnoSuggestionNavigation;
  const SEARCH_INPUT_HISTORY = globalThis.LumnoSearchInputHistory;
  const suggestionItems = [];

  const numberShortcutOptions = {
    onHoldStart: function() {
      showOverlayToast(t(
        'search_number_jump_release_hint',
        'Release to show numbers'
      ), false, { duration: 0 });
    },
    onHoldEnd: (...args) => hideOverlayToast(...args),
    instantActive: () => overlayState.numberShortcutInstantEnabled
  };

  const PANEL_PANEL_KEYS = globalThis.LumnoOverlayPanelPanelKeys;
  const SUGGESTIONS_HEIGHT_LAYOUT = globalThis.LumnoSuggestionsHeightLayout;
  const FAVICON_THEME = globalThis.LumnoNewtabFaviconTheme;
  const buildTheme = FAVICON_THEME.buildTheme;

  const PANEL_SUGGESTIONS_RENDER = globalThis.LumnoOverlayPanelSuggestionsRender;
  const overlayRuntime = globalThis.LumnoOverlayRuntime;

  const overlayStorageKeys = overlayRuntime.STORAGE_KEYS;
  const THEME_STORAGE_KEY = overlayStorageKeys.themeMode;

  const applyOverlayTheme = (mode) => {
    overlayState.overlayThemeMode = mode;
    const previousResolvedTheme = overlayState.overlay ? overlayState.overlay.getAttribute('data-theme') : '';
    applyOverlayThemeVariables(overlayState.overlay, mode);
    overlayState.overlayNoticeLayer.sync(overlayState.overlay);
    const nextResolvedTheme = overlayState.overlay ? overlayState.overlay.getAttribute('data-theme') : '';
    suggestionItems.forEach((item) => {
      if (item && item._xTheme) {
        applyThemeVariables(item, item._xTheme);
      }
    });
    updateSelection();
    updateModeBadge(overlayState.searchInput ? overlayState.searchInput.value : '');
    if (previousResolvedTheme !== nextResolvedTheme) {
      refreshOverlayThemeAwareFavicons();
    }
    if (overlayToastElement) {
      overlayToastElement.setAttribute('data-theme', nextResolvedTheme || 'light');
    }
    syncOverlayPageThemeObservation();
    if (mode === 'system') {
      if (!overlayState.overlayThemeListenerAttached) {
        overlayState.overlayThemeMediaListener = function() {
          if (overlayState.overlayThemeMode === 'system') {
            // 仅更新容器变量会导致建议项主题变量滞后，系统主题切换时完整刷新。
            applyOverlayTheme('system');
          }
        };
        overlayState.overlayMediaQuery.addEventListener('change', overlayState.overlayThemeMediaListener);
        overlayState.overlayThemeListenerAttached = true;
      }
      return;
    }
    if (overlayState.overlayThemeListenerAttached) {
      overlayState.overlayMediaQuery.removeEventListener('change', overlayState.overlayThemeMediaListener);
      overlayState.overlayThemeMediaListener = null;
      overlayState.overlayThemeListenerAttached = false;
    }
  };

  const PANEL_SUGGESTION_SOURCES = globalThis.LumnoOverlayPanelSuggestionSources;
  const {
    getShortcutRules,
    getDirectNavigationUrl,
    getDirectUrlSuggestion,
    resolveQuickNavigation,
    getHelpCenterLocale,
    updateSearchSuggestions,
    clearSearchSuggestions
  } = PANEL_SUGGESTION_SOURCES.createSuggestionSources({
    formatMessage: (...args) => formatMessage(...args),
    getPageFaviconCandidateUrl: (...args) => getPageFaviconCandidateUrl(...args),
    isLocalNetworkInput: (...args) => isLocalNetworkInput(...args),
    getHostFromUrl: (...args) => getHostFromUrl(...args),
    isLocalNetworkHost: (...args) => isLocalNetworkHost(...args),
    SUGGESTION_ACTION_MODEL,
    getSystemLocale: (...args) => getSystemLocale(...args),
    SETTINGS,
    SEARCH_UTILS,
    getProviderIcon: (...args) => getProviderIcon(...args),
    COMMUNITY_LINKS,
    t: (...args) => t(...args),
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    isModeCommand: (...args) => isModeCommand(...args),
    THEME_STORAGE_KEY,
    applyOverlayTheme,
    buildDefaultSearchUrlForOverlay: (...args) => buildDefaultSearchUrlForOverlay(...args),
    getDefaultSearchEngineFaviconUrlForOverlay: (...args) => getDefaultSearchEngineFaviconUrlForOverlay(...args),
    getCommandMatches: (...args) => getCommandMatches(...args),
    buildModeSuggestion: (...args) => buildModeSuggestion(...args),
    buildCommandSuggestion: (...args) => buildCommandSuggestion(...args),
    isCurrentOverlayTabUrl,
    getSearchTriggerProviders: (...args) => getSearchTriggerProviders(...args),
    getSiteSearchProviders: (...args) => getSiteSearchProviders(...args),
    getInlineSiteSearchCandidate: (...args) => getInlineSiteSearchCandidate(...args),
    buildSearchUrl: (...args) => buildSearchUrl(...args),
    getSiteSearchActionTitle: (...args) => getSiteSearchActionTitle(...args),
    isAggregateSearchProvider: (...args) => isAggregateSearchProvider(...args),
    getMatchedOpenTabIdForSuggestion,
    filterOverlayBlacklistedSuggestions: (...args) => filterOverlayBlacklistedSuggestions(...args),
    getKeywordSearchSuggestionState: (...args) => getKeywordSearchSuggestionState(...args),
    promoteStrongNavigationMatch: (...args) => promoteStrongNavigationMatch(...args),
    promoteTopSiteMatch: (...args) => promoteTopSiteMatch(...args),
    getSiteSearchTriggerCandidate: (...args) => getSiteSearchTriggerCandidate(...args),
    getAutocompleteCandidate: (...args) => getAutocompleteCandidate(...args),
    getUrlDisplay,
    clearAutocomplete: (...args) => clearAutocomplete(...args),
    applyAutocomplete: (...args) => applyAutocomplete(...args),
    getLocalSearchScopeCandidate: (...args) => getLocalSearchScopeCandidate(...args),
    setSiteSearchTabHint: (...args) => setSiteSearchTabHint(...args),
    getLocalSearchScopeTabHintProvider: (...args) => getLocalSearchScopeTabHintProvider(...args),
    clearSiteSearchTabHint: (...args) => clearSiteSearchTabHint(...args),
    limitOverlaySuggestionsForDisplay: (...args) => limitOverlaySuggestionsForDisplay(...args),
    getSearchPanelsLayoutTransitionMenu: (...args) => getSearchPanelsLayoutTransitionMenu(...args),
    pauseOverlayAntiTranslateObserverForMutationBurst: (...args) => pauseOverlayAntiTranslateObserverForMutationBurst(...args),
    setOpenTabsResultsViewport: (...args) => setOpenTabsResultsViewport(...args),
    ensureOverlaySuggestionsView: (...args) => ensureOverlaySuggestionsView(...args),
    setOverlayResultsCollapsed: (...args) => setOverlayResultsCollapsed(...args),
    syncSuggestionLastState: (...args) => syncSuggestionLastState(...args),
    updateSelection: (...args) => updateSelection(...args),
    commitSuggestionsNaturalHeightAfterRender: (...args) => commitSuggestionsNaturalHeightAfterRender(...args),
    cancelPendingOverlaySuggestionRequests,
    shouldShowOpenTabsForEmptyQuery: (...args) => shouldShowOpenTabsForEmptyQuery(...args),
    requestTabsAndRender: (...args) => requestTabsAndRender(...args),
    clearDefaultOpenTabsSuggestions: (...args) => clearDefaultOpenTabsSuggestions(...args),
    overlayState
  });

  const PANEL_REMOTE_SUGGESTIONS = globalThis.LumnoOverlayPanelRemoteSuggestions;
  const {
    updatePendingSearchSuggestions,
    requestOverlaySearchSuggestions
  } = PANEL_REMOTE_SUGGESTIONS.createRemoteSuggestions({
    updateSearchSuggestions,
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    getDirectUrlSuggestion,
    overlayState
  });

  const {
    updateSelection,
    syncSuggestionLastState,
    scrollSelectedSuggestionIntoView,
    getSearchPanelsLayoutTransitionMenu,
    commitSuggestionsNaturalHeightAfterRender,
    ensureOverlaySuggestionsView,
    renderTabSuggestions,
    renderCachedTabsForOverlay,
    renderCachedTabsOrRequest,
    requestTabsAndRender
  } = PANEL_SUGGESTIONS_RENDER.createSuggestionsRender({
    updateSearchSuggestions,
    requestOverlaySearchSuggestions,
    suggestionItems,
    SUGGESTION_NAVIGATION,
    SUGGESTIONS_HEIGHT_LAYOUT,
    syncSearchModeMenuResultOffset: (...args) => syncSearchModeMenuResultOffset(...args),
    removeOverlay,
    activateOpenTabsSearchMode: (...args) => activateOpenTabsSearchMode(...args),
    openDocumentPipPickerFromOverlay: (...args) => openDocumentPipPickerFromOverlay(...args),
    activateSiteSearch: (...args) => activateSiteSearch(...args),
    openOverlayCommunityQrDialog: (...args) => openOverlayCommunityQrDialog(...args),
    applyThemeModeChange: (...args) => applyThemeModeChange(...args),
    shouldSwitchMatchedTabSuggestion: (...args) => shouldSwitchMatchedTabSuggestion(...args),
    openMatchedTabSuggestion: (...args) => openMatchedTabSuggestion(...args),
    finishOverlayResultActivation: (...args) => finishOverlayResultActivation(...args),
    openSiteSearchProviderQuery: (...args) => openSiteSearchProviderQuery(...args),
    shouldOpenSearchResultInBackgroundTab: (...args) => shouldOpenSearchResultInBackgroundTab(...args),
    recordSearchSuggestionSelectionFromSuggestion: (...args) => recordSearchSuggestionSelectionFromSuggestion(...args),
    getSearchResultCreateDisposition: (...args) => getSearchResultCreateDisposition(...args),
    getOverlayFaviconUrlResolver: (...args) => getOverlayFaviconUrlResolver(...args),
    t: (...args) => t(...args),
    formatMessage: (...args) => formatMessage(...args),
    getRiSvg,
    SEARCH_UTILS,
    shouldBlockOverlayFaviconForHost: (...args) => shouldBlockOverlayFaviconForHost(...args),
    isLocalNetworkHost: (...args) => isLocalNetworkHost(...args),
    getChromeFaviconUrl: (...args) => getChromeFaviconUrl(...args),
    getPageFaviconCandidateUrl: (...args) => getPageFaviconCandidateUrl(...args),
    getHostFromUrl: (...args) => getHostFromUrl(...args),
    getUrlDisplay,
    getImmediateThemeForSuggestion: (...args) => getImmediateThemeForSuggestion(...args),
    getThemeForSuggestion: (...args) => getThemeForSuggestion(...args),
    getThemeForMode: (...args) => getThemeForMode(...args),
    getHoverColors: (...args) => getHoverColors(...args),
    getHighlightColors: (...args) => getHighlightColors(...args),
    getNeutralHoverActionColors: (...args) => getNeutralHoverActionColors(...args),
    applyThemeVariables: (...args) => applyThemeVariables(...args),
    applyMarkVariables: (...args) => applyMarkVariables(...args),
    copySearchResultUrl: (...args) => copySearchResultUrl(...args),
    getSearchActionLabel: (...args) => getSearchActionLabel(...args),
    getSiteSearchDisplayName: (...args) => getSiteSearchDisplayName(...args),
    isAiSiteSearchProvider: (...args) => isAiSiteSearchProvider(...args),
    getDefaultSearchEngineThemeUrlForOverlay: (...args) => getDefaultSearchEngineThemeUrlForOverlay(...args),
    getBrandAccentForUrl: (...args) => getBrandAccentForUrl(...args),
    buildTheme,
    SUGGESTION_ACTION_MODEL,
    normalizeSearchResultDisplayLimit: (...args) => normalizeSearchResultDisplayLimit(...args),
    pauseOverlayAntiTranslateObserverForMutationBurst: (...args) => pauseOverlayAntiTranslateObserverForMutationBurst(...args),
    setOpenTabsResultsViewport: (...args) => setOpenTabsResultsViewport(...args),
    setOverlayResultsCollapsed: (...args) => setOverlayResultsCollapsed(...args),
    isAggregateSearchProvider: (...args) => isAggregateSearchProvider(...args),
    getSearchModeProviderId: (...args) => getSearchModeProviderId(...args),
    filterTabsForOverlay,
    shouldShowOpenTabsForEmptyQuery: (...args) => shouldShowOpenTabsForEmptyQuery(...args),
    clearDefaultOpenTabsSuggestions: (...args) => clearDefaultOpenTabsSuggestions(...args),
    overlayState
  });

  const {
    handleTabKey,
    handleSearchInputKeydown,
    shouldSwitchMatchedTabSuggestion,
    getSuggestionNavigationKey,
    handleOverlayKeydown,
    handleOverlayKeyup,
    isSearchInputActive
  } = PANEL_PANEL_KEYS.createPanelKeys({
    cancelPendingOpenTabsPrefixEntry: (...args) => cancelPendingOpenTabsPrefixEntry(...args),
    openSearchModeMenuFromDoubleTab: (...args) => openSearchModeMenuFromDoubleTab(...args),
    activateOpenTabsSearchMode: (...args) => activateOpenTabsSearchMode(...args),
    activateSiteSearch: (...args) => activateSiteSearch(...args),
    activateLocalSearchScope: (...args) => activateLocalSearchScope(...args),
    getSearchTriggerProviders: (...args) => getSearchTriggerProviders(...args),
    getTopSiteMatchCandidate: (...args) => getTopSiteMatchCandidate(...args),
    getSiteSearchTriggerCandidate: (...args) => getSiteSearchTriggerCandidate(...args),
    getLocalSearchScopeCandidate: (...args) => getLocalSearchScopeCandidate(...args),
    getSiteSearchProviders: (...args) => getSiteSearchProviders(...args),
    getAggregateSearches: (...args) => getAggregateSearches(...args),
    getShortcutRules,
    syncSuggestionActionModifiersFromEvent: (...args) => syncSuggestionActionModifiersFromEvent(...args),
    clearSiteSearch: (...args) => clearSiteSearch(...args),
    clearLocalSearchScope: (...args) => clearLocalSearchScope(...args),
    requestOverlaySearchSuggestions,
    clearSearchSuggestions,
    clearOpenTabsSearchMode: (...args) => clearOpenTabsSearchMode(...args),
    isImeCompositionEvent,
    SEARCH_INPUT_HISTORY,
    dismissAutocompletePreviewOnNonTabKey: (...args) => dismissAutocompletePreviewOnNonTabKey(...args),
    suggestionItems,
    SUGGESTION_NAVIGATION,
    numberShortcutOptions,
    removeOverlay,
    updateSelection,
    scrollSelectedSuggestionIntoView,
    getCommandMatch: (...args) => getCommandMatch(...args),
    applyThemeModeChange: (...args) => applyThemeModeChange(...args),
    getNextThemeMode: (...args) => getNextThemeMode(...args),
    openDocumentPipPickerFromOverlay: (...args) => openDocumentPipPickerFromOverlay(...args),
    isModeCommand: (...args) => isModeCommand(...args),
    openOverlayCommunityQrDialog: (...args) => openOverlayCommunityQrDialog(...args),
    openSiteSearchProviderQuery: (...args) => openSiteSearchProviderQuery(...args),
    finishOverlayResultActivation: (...args) => finishOverlayResultActivation(...args),
    openMatchedTabSuggestion: (...args) => openMatchedTabSuggestion(...args),
    shouldOpenSearchResultInBackgroundTab: (...args) => shouldOpenSearchResultInBackgroundTab(...args),
    recordSearchSuggestionSelectionFromSuggestion: (...args) => recordSearchSuggestionSelectionFromSuggestion(...args),
    getSearchResultCreateDisposition: (...args) => getSearchResultCreateDisposition(...args),
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    updateSearchSuggestions,
    isAggregateSearchProvider: (...args) => isAggregateSearchProvider(...args),
    getSearchResultNewTabDisposition: (...args) => getSearchResultNewTabDisposition(...args),
    resolveQuickNavigation,
    overlayState
  });

  const {
    openDocumentPipPickerFromOverlay,
    syncLiveSearchInputFromEvent,
    syncSearchTriggerHintFromInput,
    handleSearchInputCompositionStart,
    handleSearchInputCompositionEnd,
    handleSearchInputEvent
  } = PANEL_SEARCH_INPUT_EVENTS.createSearchInputEvents({
    applyNoTranslate: (...args) => applyNoTranslate(...args),
    clearSiteSearchTabHint: (...args) => clearSiteSearchTabHint(...args),
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    getSearchTriggerProviders: (...args) => getSearchTriggerProviders(...args),
    getInlineSiteSearchCandidate: (...args) => getInlineSiteSearchCandidate(...args),
    getSiteSearchTriggerCandidate: (...args) => getSiteSearchTriggerCandidate(...args),
    setSiteSearchTabHint: (...args) => setSiteSearchTabHint(...args),
    getLocalSearchScopeCandidate: (...args) => getLocalSearchScopeCandidate(...args),
    getLocalSearchScopeTabHintProvider: (...args) => getLocalSearchScopeTabHintProvider(...args),
    cancelPendingOverlaySuggestionRequests,
    clearAutocomplete: (...args) => clearAutocomplete(...args),
    notifyOverlayLoadingSession,
    updateModeBadge: (...args) => updateModeBadge(...args),
    updateSelection,
    updateSearchSuggestions,
    renderCachedTabsOrRequest,
    getDirectUrlSuggestion,
    updatePendingSearchSuggestions,
    requestOverlaySearchSuggestions,
    clearSearchSuggestions,
    overlayState
  });

  const {
    updateSiteSearchPrefixLayout,
    setSiteSearchPrefix,
    cancelPendingOpenTabsPrefixEntry,
    getSiteSearchDisplayName,
    getSiteSearchActionTitle,
    getSiteSearchPrefixText,
    getInlineSiteSearchCandidate,
    promoteStrongNavigationMatch,
    getKeywordSearchSuggestionState,
    getTopSiteMatchCandidate,
    promoteTopSiteMatch,
    getSiteSearchTriggerCandidate,
    getLocalSearchScopeCandidate,
    getLocalSearchScopeLabel,
    getLocalSearchScopeIconClass,
    getLocalSearchScopeTabHintProvider,
    setLocalSearchScopePrefix,
    activateLocalSearchScope,
    clearLocalSearchScope,
    activateSiteSearch,
    clearSiteSearch,
    activateOpenTabsSearchMode,
    clearOpenTabsSearchMode
  } = PANEL_SEARCH_MODES.createSearchModes({
    t: (...args) => t(...args),
    SEARCH_UTILS,
    isAggregateSearchProvider: (...args) => isAggregateSearchProvider(...args),
    formatMessage: (...args) => formatMessage(...args),
    isAiSiteSearchProvider: (...args) => isAiSiteSearchProvider(...args),
    getDirectNavigationUrl,
    getUrlDisplay,
    cancelPendingOverlaySuggestionRequests,
    clearAutocomplete: (...args) => clearAutocomplete(...args),
    clearSearchSuggestions,
    getImmediateThemeForSuggestion: (...args) => getImmediateThemeForSuggestion(...args),
    getThemeForProvider: (...args) => getThemeForProvider(...args),
    renderCachedTabsForOverlay,
    requestTabsAndRender,
    isSlashCommandInput: (...args) => isSlashCommandInput(...args),
    updateSearchSuggestions,
    requestOverlaySearchSuggestions,
    overlayState
  });

  const {
    getAutocompleteCandidate,
    clearAutocomplete,
    dismissAutocompletePreviewOnNonTabKey,
    applyAutocomplete
  } = PANEL_AUTOCOMPLETE.createAutocomplete({
    getUrlDisplay,
    isEnglishQuery,
    getKeywordSearchSuggestionState,
    overlayState
  });
  const FAVICON_UTILS = globalThis.LumnoFaviconUtils;
  const SITE_SEARCH_STORAGE_KEY = overlayStorageKeys.siteSearchCustom;
  const SITE_SEARCH_DISABLED_STORAGE_KEY = overlayStorageKeys.siteSearchDisabled;
  const AGGREGATE_SEARCH_STORAGE_KEY = overlayStorageKeys.aggregateSearches ||
    AGGREGATE_SEARCH_STORE.STORAGE_KEY ||
    '_x_extension_aggregate_searches_2026_unique_';

  const faviconDataCache = window._x_extension_overlay_favicon_data_cache_2026_unique_ || new Map();
  const siteSearchIconCacheOptions = SHORTCUT_FAVICON.SITE_SEARCH_CACHE_OPTIONS || {
    cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
    cacheMaxEntries: 40,
    maxDataUrlLength: 192 * 1024
  };

  const PANEL_SITE_SEARCH_PROVIDERS = globalThis.LumnoOverlayPanelSiteSearchProviders;
  const {
    buildSearchUrl,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAggregateSearchProvider,
    openSiteSearchProviderQuery,
    recordSearchSuggestionSelectionFromSuggestion,
    getProviderIcon,
    toPageRenderableIconUrl,
    getPageRenderableProviderIcon,
    attachInputModeProviderIcon,
    getSiteSearchProviders,
    reloadSiteSearchProvidersFromStorage,
    getAggregateSearches
  } = PANEL_SITE_SEARCH_PROVIDERS.createSiteSearchProviders({
    SEARCH_UTILS,
    getHelpCenterLocale,
    AGGREGATE_SEARCH_STORE,
    showOverlayToast: (...args) => showOverlayToast(...args),
    t: (...args) => t(...args),
    getSearchResultNewTabDisposition: (...args) => getSearchResultNewTabDisposition(...args),
    finishOverlayResultActivation: (...args) => finishOverlayResultActivation(...args),
    getOverlayFaviconUrlResolver: (...args) => getOverlayFaviconUrlResolver(...args),
    SHORTCUT_FAVICON,
    siteSearchIconCacheOptions,
    FAVICON_UTILS,
    faviconDataCache,
    getHostFromUrl: (...args) => getHostFromUrl(...args),
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    getStorageValuesAsync: (...args) => getStorageValuesAsync(...args),
    AGGREGATE_SEARCH_STORAGE_KEY,
    overlayState
  });

  const PANEL_SEARCH_MODE_MENU = globalThis.LumnoOverlayPanelSearchModeMenu;
  const {
    getSearchModeProviderId,
    getSearchModeProviders,
    isAggregateSearchDefinitionAvailable,
    getSearchTriggerProviders,
    getSearchModeMenuItems,
    reorderSearchModeMenu,
    stepSearchModeMenuHistory,
    moveSearchModeMenuGroup,
    openSearchModeMenuFromDoubleTab,
    selectSearchModeMenuItem
  } = PANEL_SEARCH_MODE_MENU.createSearchModeMenu({
    SEARCH_UTILS,
    AGGREGATE_SEARCH_STORE,
    t: (...args) => t(...args),
    isAggregateSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    getSiteSearchDisplayName,
    getPageRenderableProviderIcon,
    getLocalSearchScopeLabel,
    getLocalSearchScopeIconClass,
    SEARCH_SOURCE_ORDER,
    getStorageValuesAsync: (...args) => getStorageValuesAsync(...args),
    SEARCH_SOURCE_ORDER_STORAGE_KEY,
    loadSiteSearchIconCache,
    getSiteSearchProviders,
    getAggregateSearches,
    cancelPendingOpenTabsPrefixEntry,
    activateSiteSearch,
    activateOpenTabsSearchMode,
    activateLocalSearchScope,
    overlayState
  });

  const {
    setSuggestionActionModifiersActive,
    syncSuggestionActionModifiersFromEvent,
    shouldOpenSearchResultInBackgroundTab,
    finishOverlayResultActivation,
    getOpenDisposition,
    getSearchResultNewTabDisposition,
    getSearchResultCreateDisposition,
    openMatchedTabSuggestion
  } = PANEL_RESULT_ACTIVATION.createResultActivation({
    ensureOverlaySuggestionsView,
    SUGGESTION_ACTION_MODEL,
    removeOverlay,
    recordSearchSuggestionSelectionFromSuggestion,
    overlayState
  });
  const OVERLAY_TOAST = globalThis.LumnoToast;
  const SEARCH_INPUT_MODE = globalThis.LumnoSearchInputMode;
  const OVERLAY_NOTICES = globalThis.LumnoOverlayNotices;
  const OVERLAY_KEYBOARD = globalThis.LumnoOverlayKeyboard;
  const overlayFaviconView = globalThis.LumnoOverlayFaviconView;
  const overlaySiteFixes = globalThis.LumnoOverlaySiteFixes;
  if (!overlayRuntime.STORAGE_KEYS) {
    console.warn('Lumno: overlay runtime helper not available.');
    return;
  }
  // Teardown steps owned by this invocation's overlay session. Controllers
  // created deep inside the mount block register here so removeOverlay can
  // release them without stashing them on DOM expandos.
  overlayState.overlaySessionCleanups = overlayLifecycle.createSessionCleanupRegistry();
  const addOverlaySessionCleanup = overlayState.overlaySessionCleanups.add;
  overlayState.storageChangeListeners = overlayLifecycle.createChromeEventListenerRegistry(
    chrome && chrome.storage ? chrome.storage.onChanged : null
  );
  const normalizedOverlayContext = (overlayContext && typeof overlayContext === 'object') ? overlayContext : {};
  const requestedTabZoomFactorRaw = Number(normalizedOverlayContext.tabZoomFactor);
  const initialPrefillQuery = typeof normalizedOverlayContext.prefillQuery === 'string'
    ? String(normalizedOverlayContext.prefillQuery).trim()
    : '';
  overlayState.prioritizeCurrentPageMatch = Boolean(normalizedOverlayContext.prioritizeCurrentPageMatch);
  const initialContextTabId = Number.isFinite(Number(normalizedOverlayContext.currentTabId))
    ? Number(normalizedOverlayContext.currentTabId)
    : null;
  overlayState.initialContextTabUrl = typeof normalizedOverlayContext.currentTabUrl === 'string'
    ? String(normalizedOverlayContext.currentTabUrl).trim()
    : '';
  const ensureOverlayOpen = normalizedOverlayContext.ensureOpen === true;
  const initialOverlayOpenStartedAtRaw = Number(normalizedOverlayContext.openedAt);
  const initialOverlayClockNow = Date.now();
  const initialOverlayOpenStartedAt = Number.isFinite(initialOverlayOpenStartedAtRaw) &&
    initialOverlayOpenStartedAtRaw <= initialOverlayClockNow + 1000 &&
    initialOverlayOpenStartedAtRaw >= initialOverlayClockNow - 60 * 1000
    ? initialOverlayOpenStartedAtRaw
    : initialOverlayClockNow;
  overlayState.loadingSessionTrackingActive = normalizedOverlayContext.loadingSessionTracked === true;
  const rawLoadingSession = normalizedOverlayContext.loadingSession &&
    typeof normalizedOverlayContext.loadingSession === 'object'
    ? normalizedOverlayContext.loadingSession
    : null;
  const initialLoadingSession = rawLoadingSession &&
    typeof rawLoadingSession.inputValue === 'string'
    ? (() => {
        const inputValue = rawLoadingSession.inputValue;
        const inputLength = inputValue.length;
        const rawStart = Number(rawLoadingSession.selectionStart);
        const selectionStart = Number.isFinite(rawStart)
          ? Math.max(0, Math.min(inputLength, Math.trunc(rawStart)))
          : inputLength;
        const rawEnd = Number(rawLoadingSession.selectionEnd);
        const selectionEnd = Number.isFinite(rawEnd)
          ? Math.max(selectionStart, Math.min(inputLength, Math.trunc(rawEnd)))
          : selectionStart;
        return {
          inputValue,
          selectionStart,
          selectionEnd,
          selectionDirection: rawLoadingSession.selectionDirection === 'backward' ||
            rawLoadingSession.selectionDirection === 'forward'
            ? rawLoadingSession.selectionDirection
            : 'none',
          focused: rawLoadingSession.focused !== false
        };
      })()
    : null;
  function isLocalFileLikeOverlayUrl(url) {
    if (!url) {
      return false;
    }
    try {
      const parsed = new URL(url);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (protocol === 'file:') {
        return true;
      }
      const pathname = String(parsed.pathname || '').toLowerCase();
      const srcParam = parsed.searchParams ? parsed.searchParams.get('src') : '';
      if (pathname.endsWith('.pdf')) {
        return true;
      }
      if (srcParam) {
        try {
          const nested = new URL(srcParam);
          if (String(nested.protocol || '').toLowerCase() === 'file:') {
            return true;
          }
          if (String(nested.pathname || '').toLowerCase().endsWith('.pdf')) {
            return true;
          }
        } catch (e) {
          if (String(srcParam).toLowerCase().startsWith('file://') || String(srcParam).toLowerCase().includes('.pdf')) {
            return true;
          }
        }
      }
    } catch (e) {
      return String(url).toLowerCase().startsWith('file://') || String(url).toLowerCase().includes('.pdf');
    }
    return false;
  }
  const shouldIgnoreTabZoomCompensation = isLocalFileLikeOverlayUrl(overlayState.initialContextTabUrl);
  const initialOverlayTabs = Array.isArray(requestedTabs)
    ? requestedTabs.map((tab) => ({
      ...tab,
      url: tab && typeof tab.url === 'string' ? String(tab.url).trim() : ''
    }))
    : [];
  const requestedTabZoomFactor = Number.isFinite(requestedTabZoomFactorRaw) && requestedTabZoomFactorRaw > 0
    ? requestedTabZoomFactorRaw
    : 1;
  const overlayFrameTracker = overlayLifecycle.createFrameTracker(window);

  const PANEL_ENTRY_MOTION = globalThis.LumnoOverlayPanelEntryMotion;
  const {
    shouldSkipOverlayEntryMotion,
    shouldSkipOverlayEntryMotionForSlowStartup,
    getOverlayEnterAnimationRevealTransform,
    clearOverlayPanelEnterCleanup,
    finishOverlayPanelEnterAnimation,
    applyOverlayEnterAnimationInitialState,
    playOverlayPanelEnterAnimation,
    clearOverlayEnterAnimationFrames
  } = PANEL_ENTRY_MOTION.createEntryMotion({
    SETTINGS,
    initialOverlayOpenStartedAt,
    overlayFrameTracker,
    overlayState
  });

  overlayState.overlayViewportSizeSync = overlayLifecycle.createViewportSizeSync(window, {
    getSizePreset: () => getOverlaySizePreset(overlayState.overlaySizeMode),
    getRequestedTabZoomFactor: () => requestedTabZoomFactor,
    shouldIgnoreTabZoomCompensation: () => shouldIgnoreTabZoomCompensation
  });
  const overlayAntiTranslateGuard = overlayLifecycle.createAntiTranslateGuard(window, {
    applyNoTranslate: (...args) => applyNoTranslate(...args),
    applyNoTranslateDeep: (...args) => applyNoTranslateDeep(...args),
    restoreProtectedNode: (...args) => restoreProtectedNode(...args),
    restoreProtectedAncestors: (...args) => restoreProtectedAncestors(...args)
  });

  const PANEL_PAGE_GUARDS = globalThis.LumnoOverlayPanelPageGuards;
  const {
    applyOverlayInputExtensionIsolation,
    applyNoTranslate,
    applyNoTranslateDeep,
    restoreProtectedNode,
    restoreProtectedAncestors,
    stopOverlayAntiTranslateObserver,
    pauseOverlayAntiTranslateObserverForScroll,
    pauseOverlayAntiTranslateObserverForMutationBurst,
    startOverlayAntiTranslateObserver
  } = PANEL_PAGE_GUARDS.createPageGuards({
    overlayAntiTranslateGuard,
    overlayState
  });
  const LANGUAGE_STORAGE_KEY = overlayStorageKeys.language;
  const DEFAULT_SEARCH_ENGINE_STORAGE_KEY = overlayStorageKeys.defaultSearchEngine;
  const OVERLAY_MODE_MENU_DOUBLE_TAB_DURATION_MS = 700;
  const SITE_SEARCH_ICON_CACHE_STORAGE_KEY = overlayStorageKeys.siteSearchIconCache ||
    SHORTCUT_FAVICON.SITE_SEARCH_STORAGE_KEY ||
    '_x_extension_site_search_icon_cache_canonical_2026_unique_';
  const DOCUMENT_PIP_ENABLED_STORAGE_KEY = overlayStorageKeys.documentPipEnabled;
  const SEARCH_RESULT_PRIORITY_STORAGE_KEY = overlayStorageKeys.searchResultPriority;
  const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY = overlayStorageKeys.searchResultSourceTypes;
  const SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY = overlayStorageKeys.searchResultDisplayLimit ||
    '_x_extension_search_result_display_limit_2026_unique_';
  const SEARCH_BLACKLIST_STORAGE_KEY = overlayStorageKeys.searchBlacklist;
  const FAVICON_REQUEST_BLACKLIST_STORAGE_KEY = overlayStorageKeys.faviconRequestBlacklist;
  const FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY = overlayStorageKeys.faviconEnhancedFetchEnabled;
  const OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY = overlayStorageKeys.overlayOpenTabsDefaultVisible;
  const OVERLAY_SIZE_MODE_STORAGE_KEY = overlayStorageKeys.overlaySizeMode;
  const OVERLAY_ENTER_ANIMATION_STORAGE_KEY = overlayStorageKeys.overlayEnterAnimation ||
    '_x_extension_overlay_enter_animation_2026_unique_';
  const OVERLAY_FONT_FAMILY_STORAGE_KEY = overlayStorageKeys.overlayFontFamily ||
    '_x_extension_overlay_font_family_2026_unique_';
  const OVERLAY_FONT_FALLBACK_STORAGE_KEY = overlayStorageKeys.overlayFontFallback ||
    '_x_extension_overlay_font_fallback_2026_unique_';
  const OVERLAY_FONT_FAMILY_CSS_VAR = SETTINGS.OVERLAY_FONT_FAMILY_CSS_VAR || '--lumno-font-sans';
  const OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY =
    overlayStorageKeys.overlayPageThemeAdaptationEnabled ||
    '_x_extension_overlay_page_theme_adaptation_enabled_2026_unique_';
  const MOTION_EFFECTS_ENABLED_STORAGE_KEY = overlayStorageKeys.motionEffectsEnabled ||
    '_x_extension_motion_effects_enabled_2026_unique_';
  const SIMPLE_MODE_ENABLED_STORAGE_KEY = overlayStorageKeys.simpleModeEnabled ||
    '_x_extension_simple_mode_enabled_2026_unique_';
  const NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY = overlayStorageKeys.numberShortcutInstantEnabled ||
    '_x_extension_number_shortcut_instant_enabled_2026_unique_';
  const MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY =
    overlayStorageKeys.macosCtrlSuggestionNavigationEnabled ||
    '_x_extension_macos_ctrl_suggestion_navigation_enabled_2026_unique_';
  const OVERLAY_TAB_PRIORITY_STORAGE_KEY = overlayStorageKeys.overlayTabPriority;
  const TAB_RANK_SCORE_DEBUG_STORAGE_KEY = overlayStorageKeys.tabRankScoreDebug;
  const storageRuntime = overlayRuntime.getStorageArea(chrome);
  overlayState.storageArea = storageRuntime.area;
  const storageAreaName = storageRuntime.name;
  function isPrimaryStorageAreaName(areaName) {
    return typeof storageRuntime.isActiveAreaName === 'function'
      ? storageRuntime.isActiveAreaName(areaName)
      : Boolean(storageAreaName) && areaName === storageAreaName;
  }
  const localStorageArea = chrome && chrome.storage && chrome.storage.local
    ? chrome.storage.local
    : overlayState.storageArea;
  const RI_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'assets/remixicon/fonts/remixicon.css');
  const SEARCH_INPUT_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/shared/search/search-input.css');
  const FEATURE_HINTS_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/shared/ui/feature-hints.css');
  const TOOLTIP_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/shared/ui/tooltip.css');
  const CURSOR_TOOLTIP_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/shared/ui/cursor-tooltip.css');
  const TOAST_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/shared/ui/toast.css');
  const OVERLAY_SUGGESTIONS_CSS_URL = overlayRuntime.getRuntimeUrl(chrome, 'src/overlay/suggestions-view.css');
  overlayState.overlayMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  overlayState.overlayThemeMode = 'system';
  overlayState.overlaySearchResultPriorityMode = 'autocomplete';
  overlayState.overlaySearchResultDisplayLimit = 10;
  overlayState.overlaySizeMode = 'standard';
  overlayState.overlayEnterAnimation = 'elastic';
  // Empty keeps the bundled Lumno Open Sans stack the CSS declares. The
  // fallback covers glyphs (Chinese) the chosen family does not carry.
  overlayState.overlayFontFamily = '';
  overlayState.overlayFontFallback = '';
  overlayState.motionEffectsEnabled = true;
  overlayState.simpleModeEnabled = false;
  overlayState.overlayPageThemeAdaptationEnabled = true;
  overlayState.overlaySearchBlacklistItems = [];
  overlayState.overlayFaviconRequestBlacklistItems = [];
  overlayState.faviconEnhancedFetchEnabled = false;
  overlayState.initialFaviconEnhancedFetchReady = Promise.resolve();
  overlayState.overlayOpenTabsDefaultVisible = true;
  overlayState.overlayOpenTabsDefaultVisibleLoaded = !overlayState.storageArea;
  overlayState.initialOverlayOpenTabsDefaultVisibleReady = Promise.resolve();
  // Web clip needs Document Picture-in-Picture, which Firefox does not ship.
  const documentPipSupported = 'documentPictureInPicture' in window;
  overlayState.documentPipEnabled = documentPipSupported && Boolean(normalizedOverlayContext.documentPipEnabled);
  overlayState.overlayThemeListenerAttached = false;
  overlayState.numberShortcutInstantEnabled = false;
  overlayState.macosCtrlSuggestionNavigationEnabled = false;
  const initialOverlaySettingsReady = overlayRuntime.getStorageValues(
    overlayState.storageArea,
    [
      LANGUAGE_STORAGE_KEY,
      THEME_STORAGE_KEY,
      OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
      OVERLAY_SIZE_MODE_STORAGE_KEY,
      OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
      MOTION_EFFECTS_ENABLED_STORAGE_KEY,
      SIMPLE_MODE_ENABLED_STORAGE_KEY,
      FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
      FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
      SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
      NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
      MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY
    ]
  ).catch(() => ({}));
  const initialOverlayEnterAnimationReady = initialOverlaySettingsReady.then((result) => {
    overlayState.overlayEnterAnimation = SETTINGS.normalizeOverlayEnterAnimation(
      result[OVERLAY_ENTER_ANIMATION_STORAGE_KEY]
    );
    return overlayState.overlayEnterAnimation;
  });
  const initialMotionEffectsReady = initialOverlaySettingsReady.then((result) => {
    overlayState.motionEffectsEnabled = SETTINGS.normalizeMotionEffectsEnabled(result[MOTION_EFFECTS_ENABLED_STORAGE_KEY]);
    return overlayState.motionEffectsEnabled;
  });
  const initialSimpleModeReady = initialOverlaySettingsReady.then((result) => {
    const rawValue = result[SIMPLE_MODE_ENABLED_STORAGE_KEY];
    overlayState.simpleModeEnabled = SETTINGS.normalizeSimpleModeEnabled(rawValue);
    return overlayState.simpleModeEnabled;
  });
  const initialSearchResultDisplayLimitReady = initialOverlaySettingsReady.then((result) => {
    const rawValue = result[SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY];
    overlayState.overlaySearchResultDisplayLimit = normalizeSearchResultDisplayLimit(rawValue);
    if (overlayState.storageArea && rawValue !== overlayState.overlaySearchResultDisplayLimit) {
      overlayState.storageArea.set({
        [SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: overlayState.overlaySearchResultDisplayLimit
      });
    }
    return overlayState.overlaySearchResultDisplayLimit;
  });
  const initialNumberShortcutInstantReady = initialOverlaySettingsReady.then((result) => {
    overlayState.numberShortcutInstantEnabled = SETTINGS.normalizeNumberShortcutInstantEnabled(result[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY]);
    return overlayState.numberShortcutInstantEnabled;
  });
  const initialMacosCtrlSuggestionNavigationReady = initialOverlaySettingsReady.then((result) => {
    const rawValue = result[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY];
    overlayState.macosCtrlSuggestionNavigationEnabled =
      SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(rawValue);
    return overlayState.macosCtrlSuggestionNavigationEnabled;
  });

  const logOverlayFaviconDecision = FAVICON_UTILS.createFaviconDecisionLogger({ surface: 'overlay' });

  const PANEL_FAVICON_POLICY = globalThis.LumnoOverlayPanelFaviconPolicy;
  const {
    normalizeOverlaySearchBlacklistItems,
    normalizeOverlayFaviconRequestBlacklistItems,
    getOverlayStrictFaviconReason,
    isOverlayEnhancedFaviconFetchEnabled,
    filterOverlayBlacklistedSuggestions,
    normalizeSearchResultDisplayLimit,
    limitOverlaySuggestionsForDisplay,
    isLocalNetworkHost,
    shouldBlockOverlayFaviconForHost,
    getOverlayFaviconUrlResolver,
    isBlockedOverlayFaviconUrl,
    isLocalNetworkInput
  } = PANEL_FAVICON_POLICY.createFaviconPolicy({
    FAVICON_UTILS,
    SETTINGS,
    SEARCH_UTILS,
    logOverlayFaviconDecision,
    overlayState
  });

  function normalizeOverlayPageThemeAdaptationEnabled(value) {
    return SETTINGS.normalizeOverlayPageThemeAdaptationEnabled(value);
  }

  function stopOverlayPageThemeObserver() {
    if (overlayState.overlayPageThemeObserver) {
      overlayState.overlayPageThemeObserver.stop();
    }
  }

  overlayState.modeBadge = null;
  overlayState.inputModeController = null;
  overlayState.overlayLanguageMode = 'system';
  overlayState.overlayTabQuickSwitchEnabled = true;
  overlayState.overlayTabScoreDebugEnabled = false;

  const PANEL_PANEL_LANGUAGE = globalThis.LumnoOverlayPanelPanelLanguage;

  const PANEL_DEFAULT_SEARCH_ENGINE = globalThis.LumnoOverlayPanelDefaultSearchEngine;
  const {
    buildDefaultSearchUrlForOverlay,
    getDefaultSearchEngineFaviconUrlForOverlay,
    getDefaultSearchEngineThemeUrlForOverlay,
    getSearchActionLabel,
    loadOverlaySearchEngineState
  } = PANEL_DEFAULT_SEARCH_ENGINE.createDefaultSearchEngine({
    getOverlayFaviconUrlResolver,
    t: (...args) => t(...args),
    storageArea: overlayState.storageArea,
    DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
    SEARCH_UTILS,
    overlayState
  });
  const setInputScopedStyle = (element, property, value) => {
    if (!element) {
      return;
    }
    element.style.setProperty(property, value, overlayState.inputUsesIsolatedStyles ? '' : 'important');
  };

  const PANEL_RESULTS_LAYOUT = globalThis.LumnoOverlayPanelResultsLayout;

  const PANEL_SLASH_COMMANDS = globalThis.LumnoOverlayPanelSlashCommands;
  const parseCssColor = FAVICON_THEME.parseCssColor;

  const PANEL_PANEL_THEME = globalThis.LumnoOverlayPanelPanelTheme;
  const {
    getHighlightColors,
    detectPageTheme,
    syncOverlayPageThemeObservation,
    applyOverlayFontFamily,
    applyOverlayThemeVariables,
    isOverlayDarkMode,
    getThemeForMode,
    getHoverColors,
    getNeutralHoverActionColors
  } = PANEL_PANEL_THEME.createPanelTheme({
    parseCssColor,
    stopOverlayPageThemeObserver,
    applyOverlayTheme,
    SETTINGS,
    OVERLAY_FONT_FAMILY_CSS_VAR,
    FAVICON_THEME,
    overlayState
  });
  const defaultAccentColor = FAVICON_THEME.defaultAccentColor;
  const themeColorCache = window._x_extension_theme_color_cache_2024_unique_ || new Map();
  const themeHostCache = window._x_extension_theme_host_cache_2024_unique_ || new Map();

  const PANEL_SUGGESTION_THEMES = globalThis.LumnoOverlayPanelSuggestionThemes;
  const {
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    getPageFaviconCandidateUrl,
    getBrandAccentForUrl,
    getHostFromUrl,
    isFaviconProxyUrl,
    isChromeMonogramFaviconUrl,
    getProviderThemeHost,
    getThemeForProvider,
    getThemeForSuggestion,
    getImmediateThemeForSuggestion,
    applyThemeVariables,
    applyMarkVariables,
    preloadThemeFromFavicon
  } = PANEL_SUGGESTION_THEMES.createSuggestionThemes({
    FAVICON_UTILS,
    themeColorCache,
    themeHostCache,
    getOverlayFaviconUrlResolver,
    SEARCH_UTILS,
    buildTheme,
    defaultAccentColor,
    shouldBlockOverlayFaviconForHost,
    faviconDataCache,
    SHORTCUT_FAVICON,
    getProviderIcon,
    getThemeForMode,
    overlayState
  });

  const {
    getCommandMatches,
    isSlashCommandInput,
    getCommandMatch,
    buildCommandSuggestion,
    updateModeBadge,
    getNextThemeMode,
    isModeCommand,
    buildModeSuggestion,
    applyThemeModeChange
  } = PANEL_SLASH_COMMANDS.createSlashCommands({
    t: (...args) => t(...args),
    formatMessage: (...args) => formatMessage(...args),
    updateInputRightPadding: (...args) => updateInputRightPadding(...args),
    detectPageTheme,
    SETTINGS,
    storageArea: overlayState.storageArea,
    applyOverlayTheme,
    THEME_STORAGE_KEY,
    updateSearchSuggestions,
    overlayState
  });

  const {
    syncOpenTabsScrollbarGutter,
    setOpenTabsResultsViewport,
    syncSearchModeMenuResultOffset,
    setOverlayResultsCollapsed,
    shouldShowOpenTabsForEmptyQuery,
    clearDefaultOpenTabsSuggestions,
    updateInputRightPadding,
    setSiteSearchTabHint,
    clearSiteSearchTabHint
  } = PANEL_RESULTS_LAYOUT.createResultsLayout({
    normalizeSearchResultDisplayLimit,
    SUGGESTION_NAVIGATION,
    setInputScopedStyle,
    SUGGESTIONS_HEIGHT_LAYOUT,
    ensureOverlaySuggestionsView,
    suggestionItems,
    updateSelection,
    overlayState
  });

  const {
    getSystemLocale,
    t,
    getStorageValuesAsync,
    bootstrapOverlayLanguageForInitialRender,
    formatMessage,
    applyLanguageStrings,
    applyLanguageMode
  } = PANEL_PANEL_LANGUAGE.createPanelLanguage({
    SETTINGS,
    overlayRuntime,
    storageArea: overlayState.storageArea,
    LANGUAGE_STORAGE_KEY,
    updateModeBadge,
    setSiteSearchPrefix,
    getThemeForProvider,
    updateSiteSearchPrefixLayout,
    setLocalSearchScopePrefix,
    updateSearchSuggestions,
    requestTabsAndRender,
    overlayState
  });

  overlayState.defaultPlaceholderText = 'Search or enter URL…';
  overlayState.lastSuggestionResponse = [];
  overlayState.overlaySearchEngineState = {
    id: '',
    name: '',
    host: '',
    searchTemplate: ''
  };
  overlayState.overlaySearchEngineStateReady = Promise.resolve(overlayState.overlaySearchEngineState);

  // Chrome ignores @font-face rules inside shadow roots, so the overlay's
  // fonts are declared on the host document. Only the faces live there, under
  // Lumno-specific family names, so they can neither restyle host elements
  // nor replace a page's own "Open Sans" or Remix Icon faces. The icon class
  // rules load inside the overlay's shadow root (remixicon.css, re-pointed at
  // the scoped face by suggestions-view.css).
  function ensureOverlayFontFaces() {
    const styleId = '_x_extension_overlay_font_faces_2026_unique_';
    const host = document.head || document.documentElement;
    if (!host || document.getElementById(styleId)) {
      return;
    }
    const toCssUrl = (assetPath) => {
      const url = overlayRuntime.getRuntimeUrl(chrome, assetPath);
      return `url("${String(url).replace(/["\\\n\r\f]/g, '\\$&')}")`;
    };
    const style = document.createElement('style');
    style.id = styleId;
    // The same weight bands as open-sans.css, so applyOverlayCjkFontFace can
    // add its CJK face to the middle one.
    const openSansUrl = toCssUrl('assets/fonts/open-sans/OpenSans-VariableFont-wdth-wght.woff2');
    const openSansFaces = ['300 549', '550 649', '650 800'].map((weight) => [
      '@font-face {',
      '  font-family: "Lumno Open Sans";',
      `  src: ${openSansUrl} format("woff2");`,
      '  font-style: normal;',
      `  font-weight: ${weight};`,
      '  font-display: swap;',
      '}'
    ].join('\n'));
    style.textContent = [
      ...openSansFaces,
      '@font-face {',
      '  font-family: "lumno-remixicon";',
      `  src: ${toCssUrl('assets/remixicon/fonts/remixicon.woff2')} format("woff2");`,
      '  font-display: swap;',
      '}'
    ].join('\n');
    host.appendChild(style);
  }

  ensureOverlayFontFaces();

  function getOverlaySizePreset(mode) {
    const normalizedMode = SETTINGS.normalizeOverlaySizeMode(mode);
    if (normalizedMode === 'compact') {
      return { width: 680, maxHeightVh: 72, uiScale: 0.94 };
    }
    if (normalizedMode === 'large') {
      return { width: 840, maxHeightVh: 80, uiScale: 1.06 };
    }
    return { width: 760, maxHeightVh: 75, uiScale: 1 };
  }

  function getRiSvg(id, sizeClass, extraClass) {
    const size = sizeClass || 'ri-size-16';
    const extra = extraClass ? ` ${extraClass}` : '';
    return '<i class="ri-icon ' + size + extra + ' ' + id + '" aria-hidden="true"></i>';
  }

  overlayState.overlayNoticeLayer = OVERLAY_NOTICES.createNoticeLayer(window, {
    getUpdateNotice: () => overlayState.overlayUpdateNoticeController,
    getEngagementNotice: () => overlayState.overlayEngagementNoticeController,
    getSizePreset: () => getOverlaySizePreset(overlayState.overlaySizeMode),
    decorate: applyNoTranslateDeep
  });

  function startOverlayViewportSizeSync(overlayElement) {
    overlayState.overlayViewportSizeSync.start(overlayElement);
    overlayState.overlayNoticeLayer.sync(overlayElement);
  }

  // Check if the overlay already exists
  overlayState.overlay = overlayShell.findOverlayPanel(document, {
    hostId: OVERLAY_HOST_ID,
    id: OVERLAY_PANEL_ID
  });

  let shouldReplaceExistingOverlay = false;
  if (overlayState.overlay) {
    const shouldReplaceStaleOverlay = isStaleOverlay(overlayState.overlay);
    shouldReplaceExistingOverlay = shouldReplaceStaleOverlay;
    if (ensureOverlayOpen && !shouldReplaceStaleOverlay) {
      window._x_extension_search_overlay_open_2026_unique_ = true;
      return;
    }
    destroyExistingOverlaySession(overlayState.overlay, {
      preserveLoadingIntent: shouldReplaceStaleOverlay
    });
    if (!shouldReplaceStaleOverlay) {
      return;
    }
  }

  // No overlay is open here (an open one has closed above, a stale one is
  // being replaced): create it.
  const initialOverlaySizePreset = getOverlaySizePreset(overlayState.overlaySizeMode);
  const overlayMount = overlayShell.createOverlayMount(document, {
    hostId: OVERLAY_HOST_ID,
    id: OVERLAY_PANEL_ID,
    width: initialOverlaySizePreset.width,
    maxHeightVh: initialOverlaySizePreset.maxHeightVh,
    remixIconCssUrl: RI_CSS_URL,
    searchInputCssUrl: SEARCH_INPUT_CSS_URL,
    featureHintsCssUrl: FEATURE_HINTS_CSS_URL,
    tooltipCssUrl: TOOLTIP_CSS_URL,
    cursorTooltipCssUrl: CURSOR_TOOLTIP_CSS_URL,
    toastCssUrl: TOAST_CSS_URL,
    overlaySuggestionsCssUrl: OVERLAY_SUGGESTIONS_CSS_URL
  });
  overlayState.overlay = overlayMount && overlayMount.panel ? overlayMount.panel : null;
  const overlayHost = overlayMount && overlayMount.host ? overlayMount.host : overlayState.overlay;
  overlayState.overlayStyleRoot = overlayMount && overlayMount.root ? overlayMount.root : null;
  if (!overlayState.overlay || !overlayHost) {
    console.warn('Lumno: overlay mount could not be created.');
    return;
  }
  setOverlayStoredContextToken(overlayState.overlay);
  addOverlaySessionCleanup(overlayLifecycle.onSessionDestroyRequest(overlayHost, (options) => {
    removeOverlay(overlayState.overlay, options);
  }));
  overlayState.overlay.classList.add('x-lumno-search-entry');
  setOverlayMountVisibility(overlayHost, true);
  applyNoTranslate(overlayState.overlay);

  overlayState.tabs = [];
  overlayState.currentOverlayTabId = null;
  if (initialOverlayTabs.length > 0) {
    overlayState.tabs = initialOverlayTabs;
  }
  overlayState.overlayTabsCacheReady = initialOverlayTabs.length > 0;
  if (typeof initialContextTabId === 'number') {
    overlayState.currentOverlayTabId = initialContextTabId;
  }
  overlayState.latestOverlayQuery = '';
  overlayState.latestRawInputValue = '';
  overlayState.lastDeletionAt = 0;
  overlayState.autocompleteState = null;
  overlayState.inlineSearchState = null;
  overlayState.siteSearchTriggerState = null;
  overlayState.localSearchScopeTriggerState = null;
  overlayState.siteSearchState = null;
  overlayState.localSearchScopeState = null;
  overlayState.enabledSearchResultSourceTypes = ['topSite', 'bookmark', 'history'];
  overlayState.openTabsSearchModeActive = false;
  overlayState.imeKeyGuard = LumnoImeKeyGuard.createImeKeyGuard();
  overlayState.selectedIndex = -1; // -1 means input is focused, 0+ means suggestion is selected
  overlayState.currentSuggestions = []; // Store current suggestions for keyboard navigation
  overlayState.lastRenderedQuery = '';
  overlayState.lastRenderedActionContextKey = '';

  // 使用系统字体，避免外链字体依赖。

  overlayShell.appendOverlayStyleNodes(document, {
    root: overlayState.overlayStyleRoot,
    remixIconCssUrl: RI_CSS_URL,
    searchInputCssUrl: SEARCH_INPUT_CSS_URL,
    featureHintsCssUrl: FEATURE_HINTS_CSS_URL,
    tooltipCssUrl: TOOLTIP_CSS_URL,
    cursorTooltipCssUrl: CURSOR_TOOLTIP_CSS_URL,
    toastCssUrl: TOAST_CSS_URL,
    overlaySuggestionsCssUrl: OVERLAY_SUGGESTIONS_CSS_URL
  });
  const overlayToastElement = applyNoTranslate(document.createElement('div'));
  overlayToastElement.id = '_x_extension_overlay_toast_2026_unique_';
  overlayToastElement.className = '_x_extension_overlay_toast_2026_unique_ x-lumno-toast';
  overlayToastElement.style.setProperty(
    '--x-lumno-toast-top',
    'max(24px, calc(20vh - 48px))'
  );
  overlayToastElement.style.setProperty('--x-lumno-toast-z-index', '2147483647');
  overlayToastElement.setAttribute('data-show', 'false');
  overlayToastElement.setAttribute('role', 'status');
  overlayToastElement.setAttribute('aria-live', 'polite');
  const overlayToastStyleRoot = overlayState.overlayStyleRoot || document;
  const overlayToastStylesheet = overlayToastStyleRoot &&
      typeof overlayToastStyleRoot.getElementById === 'function'
    ? overlayToastStyleRoot.getElementById('_x_extension_toast_style_2026_unique_')
    : (overlayToastStyleRoot && typeof overlayToastStyleRoot.querySelector === 'function'
      ? overlayToastStyleRoot.querySelector('#_x_extension_toast_style_2026_unique_')
      : null);
  const overlayToastStyleGate = OVERLAY_TOAST.createToastStyleGate(
    overlayToastElement,
    {
      windowObj: window,
      stylesheetElement: overlayToastStylesheet
    }
  );
  (overlayState.overlayStyleRoot || overlayHost).appendChild(overlayToastElement);
  const overlayToastController = OVERLAY_TOAST.createToastController(
    overlayToastElement,
    { windowObj: window }
  );
  addOverlaySessionCleanup(() => {
    overlayToastStyleGate.destroy();
    overlayToastController.destroy();
  });

  const PANEL_COPY_ACTIONS = globalThis.LumnoOverlayPanelCopyActions;
  const {
    hideOverlayToast,
    showOverlayToast,
    copySearchResultUrl
  } = PANEL_COPY_ACTIONS.createCopyActions({
    overlayToastController,
    t
  });

  overlayState.overlayRevealGate = overlaySiteFixes.createOverlayRevealGate(window, {
    overlay: overlayState.overlay,
    styleRoot: overlayState.overlayStyleRoot || document.head || document.documentElement
  });
  if (typeof globalThis._x_extension_createSearchInput_2024_unique_ !== 'function') {
    console.warn('Lumno: input UI helper not available.');
    removeOverlay(overlayState.overlay);
    return;
  }

  const initialLanguageReady = bootstrapOverlayLanguageForInitialRender(
    initialOverlaySettingsReady
  ).catch(() => {});

  overlayState.inputUsesIsolatedStyles = Boolean(overlayState.overlayStyleRoot);
  overlayState.inputParts = globalThis._x_extension_createSearchInput_2024_unique_({
    styleRoot: overlayState.overlayStyleRoot,
    useIsolatedStyles: overlayState.inputUsesIsolatedStyles,
    useInlineBaseStyles: !overlayState.inputUsesIsolatedStyles,
    placeholder: t('overlay_search_placeholder', t('search_placeholder', overlayState.defaultPlaceholderText)),
    inputId: '_x_extension_search_input_2024_unique_',
    iconId: '_x_extension_search_icon_2024_unique_',
    containerId: '_x_extension_input_container_2024_unique_',
    rightIconUrl: chrome.runtime.getURL('assets/images/lumno-input-light.png'),
    containerStyleOverrides: {
      height: '56px',
      'min-height': '56px',
      'max-height': '56px',
      'border-radius': 'var(--x-ov-panel-radius, 26px) var(--x-ov-panel-radius, 26px) 0 0',
      'corner-shape': 'superellipse(1.25)',
      overflow: 'visible'
    },
    inputStyleOverrides: {
      height: '56px',
      'min-height': '56px',
      'max-height': '56px',
      'line-height': '1.3',
      'padding-top': '0',
      'padding-bottom': '0',
      'padding-left': '50px',
      'padding-right': '92px'
    },
    iconStyleOverrides: {
      left: '13px'
    },
    rightIconStyleOverrides: {
      '--x-ext-input-right-icon-inset': '13px',
      cursor: 'pointer'
    },
    clearAction: {
      id: '_x_extension_search_clear_2026_unique_',
      ariaLabel: t('search_input_clear', '清空'),
      html: getRiSvg('ri-close-line', 'ri-size-16'),
      styleOverrides: {
        '--x-ext-input-clear-right': '85px',
        '--x-ext-input-clear-top': '13px'
      }
    },
    secondaryAction: {
      id: '_x_extension_search_close_other_tabs_2026_unique_',
      className: 'x-ov-close-other-tabs',
      ariaLabel: t('overlay_close_other_tabs_tooltip', '关闭其他标签页'),
      html: getRiSvg('ri-brush-2-line', 'ri-size-16'),
      confirm: {
        getCopy: getCloseOtherTabsConfirmCopy,
        onConfirm: confirmCloseOtherTabs
      }
    },
    modeBadge: {
      id: '_x_extension_mode_badge_2024_unique_',
      className: 'x-lumno-search-input-mode__badge',
      surface: 'overlay',
      visible: false
    },
    showUnderlineWhenEmpty: true
  });
  overlayState.searchInput = overlayState.inputParts.input;
  applyOverlayInputExtensionIsolation(overlayState.searchInput);
  overlayState.inputContainer = overlayState.inputParts.container;
  const searchScopeIcon = overlayState.inputParts.icon;
  overlayState.rightIcon = overlayState.inputParts.rightIcon;
  overlayState.inputHistoryController =
    SEARCH_INPUT_HISTORY.createSearchInputHistoryController({
      storageArea: chrome && chrome.storage
        ? (chrome.storage.local || overlayState.storageArea)
        : overlayState.storageArea,
      storageChanges: chrome && chrome.storage ? chrome.storage.onChanged : null,
      storageAreaName: chrome && chrome.storage && chrome.storage.local
        ? 'local'
        : storageAreaName
    });

  const PANEL_PANEL_NOTICES = globalThis.LumnoOverlayPanelPanelNotices;
  const {
    openOverlayCommunityQrDialog
  } = PANEL_PANEL_NOTICES.createPanelNotices({
    removeOverlay,
    COMMUNITY_LINKS,
    t,
    getRiSvg,
    getOpenDisposition,
    getSystemLocale,
    SETTINGS,
    overlayState
  });

  applyNoTranslate(overlayState.searchInput);
  applyNoTranslate(overlayState.inputContainer);
  applyNoTranslate(overlayState.rightIcon);
  overlayState.topActionTooltipController = globalThis.LumnoTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_top_action_tooltip_2026_unique_',
    appendTo: overlayState.overlay,
    boundaryElement: overlayState.overlay,
    positionMode: 'absolute',
    maxWidth: 420,
    decorateElement: applyNoTranslate
  });
  overlayState.overlayCursorTooltipController = globalThis.LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_overlay_cursor_tooltip_2026_unique_',
    appendTo: overlayState.overlay,
    boundaryElement: overlayState.overlay,
    positionMode: 'absolute',
    maxWidth: 520,
    offsetX: 14,
    offsetY: 16,
    decorateElement: applyNoTranslate
  });
  const overlayModeMenuCursorTooltipController = globalThis.LumnoCursorTooltip.createController({
    documentObj: document,
    windowObj: window,
    id: '_x_extension_overlay_mode_menu_cursor_tooltip_2026_unique_',
    appendTo: overlayState.overlayStyleRoot || document.body,
    positionMode: 'fixed',
    maxWidth: 320,
    offsetX: 14,
    offsetY: 16,
    decorateElement: (element) => {
      applyNoTranslate(element);
      element.style.setProperty('--x-extension-tooltip-z-index', '2147483647');
    }
  });
  addOverlaySessionCleanup(() => {
    overlayState.topActionTooltipController.destroy();
    overlayState.overlayCursorTooltipController.destroy();
    overlayModeMenuCursorTooltipController.destroy();
  });
  const bindInputActionCursorTooltip = (button, getText) => {
    if (!button) {
      return;
    }
    overlayState.overlayCursorTooltipController.bind(button, getText, {
      boundaryElement: overlayState.overlay,
      positionMode: 'absolute',
      maxWidth: 420,
      deferHideVisibility: true,
      preserveVisibleOnTargetSwitch: true,
      handoffRoot: overlayState.inputContainer
    });
  };
  const hideInputActionCursorTooltip = () => {
    overlayState.overlayCursorTooltipController.hide();
  };
  overlayState.closeOtherTabsButton = overlayState.inputParts.secondaryAction;
  overlayState.searchClearButton = overlayState.inputParts.clearAction;
  const resetCloseOtherTabsButtonVisualState = () => {
    overlayState.closeOtherTabsButton.removeAttribute('data-hover-active');
  };
  resetCloseOtherTabsButtonVisualState();
  overlayState.closeOtherTabsButton.addEventListener('mouseenter', () => {
    overlayState.closeOtherTabsButton.setAttribute('data-hover-active', 'true');
  });
  overlayState.closeOtherTabsButton.addEventListener('mouseleave', resetCloseOtherTabsButtonVisualState);
  overlayState.closeOtherTabsButton.addEventListener('blur', resetCloseOtherTabsButtonVisualState);
  overlayState.closeOtherTabsButton.addEventListener('pointerup', resetCloseOtherTabsButtonVisualState);
  overlayState.closeOtherTabsButton.addEventListener('pointercancel', resetCloseOtherTabsButtonVisualState);
  overlayState.modeBadge = overlayState.inputParts.modeBadge;

  overlayState.suggestionsContainer = document.createElement('div');
  applyNoTranslate(overlayState.suggestionsContainer);
  overlayState.suggestionsContainer.id = '_x_extension_suggestions_container_2024_unique_';
  overlayState.suggestionsContainer.className = 'x-ov-suggestions-container';
  overlayState.suggestionsContainer.addEventListener('wheel', function(event) {
    SUGGESTION_NAVIGATION.preventNumberShortcutWheel(event, overlayState.suggestionsContainer);
  }, { passive: false });
  overlayState.overlay.addEventListener('pointerdown', function() {
    SUGGESTION_NAVIGATION.cancelNumberShortcuts(overlayState.suggestionsContainer);
  }, true);
  overlayState.suggestionsContainer.addEventListener('animationend', (event) => {
    if (!event || event.animationName !== '_x_ov_scope_result_enter_2026_unique_') {
      return;
    }
    overlayState.suggestionsContainer.setAttribute('data-scope-result-enter', 'done');
  });
  overlayState.inputDivider = overlayState.inputParts.divider;
  overlayState.overlayWheelIsolationHandler = createOverlayWheelIsolationHandler(overlayState.overlay);
  overlayState.overlay.addEventListener('wheel', overlayState.overlayWheelIsolationHandler, { passive: false, capture: true });

  initialLanguageReady.then(() => {
    if (overlayState.overlay && overlayState.overlay.isConnected) {
      applyLanguageStrings({ refreshResults: false });
    }
  });

  const searchScopeTooltipText = () => t(
    'shortcut_reference_search_open_scope_menu_title',
    '打开搜索范围面板'
  );
  const setSearchScopeIconVisualState = (active) => {
    if (!searchScopeIcon) {
      return;
    }
    const enabled = searchScopeIcon.getAttribute('aria-disabled') !== 'true';
    searchScopeIcon.dataset.hoverActive = active && enabled ? 'true' : 'false';
  };
  const setSearchScopeIconEnabled = (enabled) => {
    if (!searchScopeIcon) {
      return;
    }
    const nextEnabled = enabled !== false;
    searchScopeIcon.setAttribute('aria-disabled', nextEnabled ? 'false' : 'true');
    searchScopeIcon.setAttribute('tabindex', nextEnabled ? '0' : '-1');
    searchScopeIcon.setAttribute('aria-label', searchScopeTooltipText());
    if (nextEnabled) {
      searchScopeIcon.setAttribute('data-tooltip', searchScopeTooltipText());
      return;
    }
    searchScopeIcon.removeAttribute('data-tooltip');
    hideInputActionCursorTooltip();
    setSearchScopeIconVisualState(false);
    if (typeof searchScopeIcon.blur === 'function') {
      searchScopeIcon.blur();
    }
  };
  const activateSearchScopeIcon = (event) => {
    if (!searchScopeIcon || searchScopeIcon.getAttribute('aria-disabled') === 'true') {
      return;
    }
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    hideInputActionCursorTooltip();
    setSearchScopeIconVisualState(false);
    if (overlayState.inputModeController &&
        typeof overlayState.inputModeController.resetModeMenuDoubleTab === 'function') {
      overlayState.inputModeController.resetModeMenuDoubleTab();
    }
    openSearchModeMenuFromDoubleTab();
    if (searchScopeIcon && typeof searchScopeIcon.blur === 'function') {
      searchScopeIcon.blur();
    }
  };
  if (searchScopeIcon) {
    searchScopeIcon.dataset.searchScopeAction = 'true';
    searchScopeIcon.setAttribute('role', 'button');
    setSearchScopeIconEnabled(true);
    setSearchScopeIconVisualState(false);
    searchScopeIcon.addEventListener('mouseenter', () => {
      setSearchScopeIconVisualState(true);
    });
    searchScopeIcon.addEventListener('focus', () => {
      setSearchScopeIconVisualState(true);
    });
    ['mouseleave', 'blur', 'pointerup', 'pointercancel'].forEach((type) => {
      searchScopeIcon.addEventListener(type, () => {
        setSearchScopeIconVisualState(false);
      });
    });
    searchScopeIcon.addEventListener('click', activateSearchScopeIcon);
    searchScopeIcon.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      activateSearchScopeIcon(event);
    });
    bindInputActionCursorTooltip(searchScopeIcon, searchScopeTooltipText);
  }

  if (overlayState.rightIcon) {
    const settingsTooltipText = () => formatMessage('command_settings', '打开设置', { name: 'Lumno' });
    bindInputActionCursorTooltip(overlayState.rightIcon, settingsTooltipText);
    overlayState.rightIcon.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      hideInputActionCursorTooltip();
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
      removeOverlay(overlayState.overlay);
    });
  }
  if (overlayState.searchClearButton) {
    bindInputActionCursorTooltip(overlayState.searchClearButton, () => t('search_input_clear', '清空'));
    overlayState.searchClearButton.addEventListener('click', hideInputActionCursorTooltip);
    overlayState.inputParts.input.addEventListener('input', () => {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.updateLayout();
      }
    });
  }
  if (overlayState.closeOtherTabsButton) {
    const closeOtherTooltipText = () => t('overlay_close_other_tabs_tooltip', '关闭其他标签页');
    bindInputActionCursorTooltip(overlayState.closeOtherTabsButton, closeOtherTooltipText);
    // The click opens the popconfirm; confirmCloseOtherTabs runs once it is confirmed.
    overlayState.closeOtherTabsButton.addEventListener('click', hideInputActionCursorTooltip);
  }

  function getCloseOtherTabsConfirmCopy() {
    return {
      message: t('overlay_close_other_tabs_confirm', '关闭此窗口中的其他标签页？置顶和分组内的标签页会保留。'),
      messageKey: 'overlay_close_other_tabs_confirm',
      confirmLabel: t('overlay_close_other_tabs_confirm_button', '关闭'),
      confirmLabelKey: 'overlay_close_other_tabs_confirm_button'
    };
  }

  function confirmCloseOtherTabs(event) {
    if (!event || event.isTrusted !== true) {
      return;
    }
    // The confirm button is going away with its bubble; keep typing in the field.
    overlayState.searchInput.focus({ preventScroll: true });
    chrome.runtime.sendMessage({ action: 'closeOtherTabsForOverlay' }, (response) => {
      resetCloseOtherTabsButtonVisualState();
      if (!response || response.ok !== true) {
        return;
      }
      if (overlayState.latestOverlayQuery) {
        requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
        return;
      }
      requestTabsAndRender();
    });
  }

  // Add focus styles
  overlayState.searchInput.addEventListener('focus', function() {
    overlayState.selectedIndex = -1;
    updateSelection();
  });

  overlayState.searchInput.addEventListener('blur', function() {
    // Don't change selectedIndex here to allow keyboard navigation
  });

  function isImeCompositionEvent(event) {
    return overlayState.imeKeyGuard.shouldIgnoreKeydown(event);
  }
  const defaultPlaceholder = overlayState.searchInput.placeholder;
  const initialSiteSearchProviders = Array.isArray(overlayContext && overlayContext.siteSearchProviders)
    ? overlayContext.siteSearchProviders
    : [];
  overlayState.siteSearchProvidersCache = initialSiteSearchProviders.length > 0
    ? initialSiteSearchProviders
    : null;
  overlayState.siteSearchProvidersLoadVersion = 0;
  overlayState.aggregateSearchesCache = null;
  overlayState.aggregateSearchesLoadPromise = null;
  overlayState.aggregateSearchesLoadVersion = 0;
  const siteSearchIconStore = SHORTCUT_FAVICON.createShortcutFaviconStore({
    chromeApi: chrome,
    storageArea: localStorageArea,
    storageKey: SITE_SEARCH_ICON_CACHE_STORAGE_KEY,
    ...siteSearchIconCacheOptions
  });
  overlayState.siteSearchIconCache = {};
  overlayState.siteSearchIconCacheLoaded = false;
  let siteSearchIconCacheLoadPromise = null;
  let siteSearchIconCacheRevision = 0;

  function loadSiteSearchIconCache() {
    if (overlayState.siteSearchIconCacheLoaded) {
      return Promise.resolve(overlayState.siteSearchIconCache);
    }
    if (siteSearchIconCacheLoadPromise) {
      return siteSearchIconCacheLoadPromise;
    }
    const loadRevision = siteSearchIconCacheRevision;
    siteSearchIconCacheLoadPromise = siteSearchIconStore.readAll()
      .then((cache) => {
        if (siteSearchIconCacheRevision === loadRevision) {
          overlayState.siteSearchIconCache = cache && typeof cache === 'object' ? cache : {};
        }
        overlayState.siteSearchIconCacheLoaded = true;
        return overlayState.siteSearchIconCache;
      })
      .catch(() => {
        if (siteSearchIconCacheRevision === loadRevision) {
          overlayState.siteSearchIconCache = {};
        }
        overlayState.siteSearchIconCacheLoaded = true;
        return overlayState.siteSearchIconCache;
      });
    return siteSearchIconCacheLoadPromise;
  }

  // Warm local icon lookup immediately, but never put it on the overlay reveal path.
  loadSiteSearchIconCache();
  overlayState.defaultSiteSearchProviders = SEARCH_UTILS.getDefaultSiteSearchProviders();
  window._x_extension_theme_color_cache_2024_unique_ = themeColorCache;
  window._x_extension_theme_host_cache_2024_unique_ = themeHostCache;
  window._x_extension_overlay_favicon_data_cache_2026_unique_ = faviconDataCache;
  const faviconDataPending = window._x_extension_overlay_favicon_data_pending_2026_unique_ || new Map();
  window._x_extension_overlay_favicon_data_pending_2026_unique_ = faviconDataPending;
  const iconPreloadCache = window._x_extension_overlay_icon_preload_cache_2026_unique_ || new Map();
  window._x_extension_overlay_icon_preload_cache_2026_unique_ = iconPreloadCache;
  const overlayFaviconRuntime = overlayFaviconView.createOverlayFaviconViewRuntime({
    document,
    windowObj: window,
    chromeApi: chrome,
    getRiSvg,
    getHostFromUrl,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    shouldBlockFaviconForHost: shouldBlockOverlayFaviconForHost,
    shouldAvoidDirectFaviconForHost: FAVICON_UTILS.shouldAvoidDirectFaviconForHost,
    shouldBlockOverlayFaviconForHost,
    isEnhancedFaviconFetchEnabled: isOverlayEnhancedFaviconFetchEnabled,
    getStrictFaviconReason: getOverlayStrictFaviconReason,
    logFaviconDecision: logOverlayFaviconDecision,
    isBlockedLocalFaviconUrl: isBlockedOverlayFaviconUrl,
    isFaviconProxyUrl,
    isChromeMonogramFaviconUrl,
    preloadThemeFromFavicon,
    faviconDataCache,
    faviconDataPending,
    iconPreloadCache,
    getOverlayPanel: () => overlayState.overlay,
    getSuggestionRowsRoot: () => overlayState.suggestionsContainer,
    rerenderReplacedFaviconRows,
    hasThemeForHost: (hostKey) => Boolean(hostKey && themeHostCache.has(hostKey))
  });
  overlayState.applyFaviconOpticalAlignment = overlayFaviconRuntime.applyFaviconOpticalAlignment;
  overlayState.isBlockedLocalFaviconUrl = overlayFaviconRuntime.isBlockedLocalFaviconUrl;
  overlayState.requestFaviconData = overlayFaviconRuntime.requestFaviconData;
  const attachFaviconData = overlayFaviconRuntime.attachFaviconData;
  const attachInputModeFaviconData =
    SHORTCUT_FAVICON.createSiteSearchProviderIconHydrator(attachFaviconData);
  overlayState.attachResolvedFaviconWithFallbacks = overlayFaviconRuntime.attachResolvedFaviconWithFallbacks;
  const refreshOverlayThemeAwareFavicons = overlayFaviconRuntime.refreshOverlayThemeAwareFavicons;
  const refreshOverlayFaviconsForPolicyChange = overlayFaviconRuntime.refreshOverlayFaviconsForPolicyChange;
  overlayState.preloadIcon = overlayFaviconRuntime.preloadIcon;
  overlayState.warmIconCache = overlayFaviconRuntime.warmIconCache;
  const defaultCaretColor = overlayState.searchInput.style.caretColor || 'var(--x-ext-input-caret, #7DB7FF)';
  const inputModePrefixTransition = 'opacity 140ms cubic-bezier(0.22, 1, 0.36, 1), transform 160ms cubic-bezier(0.22, 1, 0.36, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease';

  const rgbToCss = FAVICON_THEME.rgbToCss;

  overlayState.defaultTheme = FAVICON_THEME.createDefaultTheme();
  overlayState.urlHighlightTheme = FAVICON_THEME.createUrlHighlightTheme();

  const initialOverlayThemeReady = initialOverlaySettingsReady.then((result) => {
    if (!overlayState.storageArea) {
      applyOverlayTheme('system');
      return 'system';
    }
    const initialThemeMode = result[THEME_STORAGE_KEY] || 'system';
    const rawAdaptationEnabled = result[OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY];
    overlayState.overlayPageThemeAdaptationEnabled = normalizeOverlayPageThemeAdaptationEnabled(
      rawAdaptationEnabled
    );
    if (rawAdaptationEnabled !== overlayState.overlayPageThemeAdaptationEnabled) {
      overlayState.storageArea.set({
        [OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]: overlayState.overlayPageThemeAdaptationEnabled
      });
    }
    applyOverlayTheme(initialThemeMode);
    return initialThemeMode;
  });

  const PANEL_SETTINGS_SYNC = globalThis.LumnoOverlayPanelSettingsSync;
  const {
    initialOverlaySizeReady,
    initialOverlayFontFamilyReady
  } = PANEL_SETTINGS_SYNC.createSettingsSync({
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
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    overlayState
  });

  function rerenderReplacedFaviconRows() {
    const failedSlots = Array.from(overlayState.suggestionsContainer.querySelectorAll(
      '[data-favicon-failed="true"]'
    ));
    if (failedSlots.length === 0) {
      return false;
    }
    failedSlots.forEach((slot) => {
      slot.dispatchEvent(new CustomEvent('lumno-favicon-retry'));
    });
    return true;
  }

  overlayState.inputModeController = SEARCH_INPUT_MODE.createInputModeController(overlayState.inputParts, {
    surface: 'overlay',
    useImportantStyles: !overlayState.inputUsesIsolatedStyles,
    prefixTransition: inputModePrefixTransition,
    defaultPlaceholder: overlayState.defaultPlaceholderText || defaultPlaceholder,
    getDefaultPlaceholder: () => overlayState.defaultPlaceholderText || defaultPlaceholder,
    defaultCaretColor,
    modeBadgeElement: overlayState.modeBadge,
    rightReserveBase: 92,
    rightAnchorOffset: 86,
    // The clear button adds a 30px slot plus a 6px gap left of the close-other-tabs button.
    getExtraRightInset: () => (overlayState.inputParts.syncClearAction() ? 36 : 0),
    baseInputPaddingLeft: 50,
    setInputStyle: setInputScopedStyle,
    applyNoTranslate,
    getThemeForMode,
    defaultTheme: overlayState.defaultTheme,
    defaultAccentColor,
    parseCssColor,
    rgbToCss,
    isDarkMode: isOverlayDarkMode,
    getProviderIcon: getPageRenderableProviderIcon,
    resolveProviderIconUrl: (provider, iconUrl) => {
      const pageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
      return toPageRenderableIconUrl(getOverlayFaviconUrlResolver().getProviderFaviconUrl(pageUrl, iconUrl), pageUrl);
    },
    getProviderThemeHost,
    getThemeForProvider,
    getSiteSearchPrefixText,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    attachFaviconData: attachInputModeFaviconData,
    attachProviderIcon: attachInputModeProviderIcon,
    preferDirectProviderIcons: true,
    formatMessage,
    modeMenuDoubleTabDuration: OVERLAY_MODE_MENU_DOUBLE_TAB_DURATION_MS,
    modeMenuCursorTooltipController: overlayModeMenuCursorTooltipController,
    getModeMenuItems: getSearchModeMenuItems,
    onModeMenuSelect: selectSearchModeMenuItem,
    onModeMenuReorder: reorderSearchModeMenu,
    onModeMenuGroupMove: moveSearchModeMenuGroup,
    onModeMenuHistory: stepSearchModeMenuHistory,
    onModeTagRemovalConfirmation: () => {
      showOverlayToast(t(
        'search_scope_remove_confirmation',
        'Press Backspace again to remove the scope.'
      ));
    },
    onModeTagRemovalConfirmationReset: hideOverlayToast,
    onModeTagActiveChange: (active) => {
      setSearchScopeIconEnabled(!active);
    },
    onModeMenuLayoutChange: syncSearchModeMenuResultOffset,
    isTabHintSuppressed: () => Boolean(
      overlayState.siteSearchState ||
      overlayState.localSearchScopeState ||
      overlayState.openTabsSearchModeActive
    )
  });
  syncSearchModeMenuResultOffset();
  if (typeof window.ResizeObserver === 'function') {
    const modeMenuResultResizeObserver = new window.ResizeObserver(
      syncSearchModeMenuResultOffset
    );
    modeMenuResultResizeObserver.observe(overlayState.suggestionsContainer);
    addOverlaySessionCleanup(() => {
      modeMenuResultResizeObserver.disconnect();
    });
  }
  loadSiteSearchIconCache().then(() => {
    if (!overlayState.siteSearchState || !overlayState.inputModeController) {
      return;
    }
    const activeProvider = overlayState.siteSearchState;
    setSiteSearchPrefix(activeProvider, overlayState.defaultTheme);
    getThemeForProvider(activeProvider).then((theme) => {
      if (overlayState.siteSearchState === activeProvider) {
        setSiteSearchPrefix(activeProvider, theme);
      }
    }).catch(() => {});
  });

  getSiteSearchProviders();
  getAggregateSearches().then(() => {
    if (overlayState.inputModeController && typeof overlayState.inputModeController.refreshModeMenu === 'function') {
      overlayState.inputModeController.refreshModeMenu();
    }
    if (overlayState.searchInput && overlayState.searchInput.value) {
      syncSearchTriggerHintFromInput(overlayState.searchInput.value);
    }
    if (overlayState.latestOverlayQuery) {
      requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
    }
  });

  overlayState.storageChangeListeners.add((changes, areaName) => {
    if (!isPrimaryStorageAreaName(areaName) || !(
      changes[SITE_SEARCH_STORAGE_KEY] ||
      changes[SITE_SEARCH_DISABLED_STORAGE_KEY] ||
      changes[AGGREGATE_SEARCH_STORAGE_KEY] ||
      changes[SEARCH_SOURCE_ORDER_STORAGE_KEY]
    )) {
      return;
    }
    // A new order from Settings or another surface reaches an open scope
    // panel now; a closed one reads it when it opens.
    if (changes[SEARCH_SOURCE_ORDER_STORAGE_KEY] &&
        overlayState.inputModeController && typeof overlayState.inputModeController.refreshModeMenu === 'function') {
      overlayState.inputModeController.refreshModeMenu();
    }
    if (changes[AGGREGATE_SEARCH_STORAGE_KEY]) {
      overlayState.aggregateSearchesLoadVersion += 1;
      overlayState.aggregateSearchesLoadPromise = null;
      overlayState.aggregateSearchesCache = AGGREGATE_SEARCH_STORE.normalizeAggregateSearches(
        changes[AGGREGATE_SEARCH_STORAGE_KEY].newValue
      );
      if (isAggregateSearchProvider(overlayState.siteSearchState)) {
        const currentId = String(overlayState.siteSearchState.aggregateId || '');
        const updatedDefinition = overlayState.aggregateSearchesCache.find(
          (item) => String(item && item.id ? item.id : '') === currentId
        );
        const updatedProvider = isAggregateSearchDefinitionAvailable(
          updatedDefinition,
          getSearchModeProviders()
        )
          ? AGGREGATE_SEARCH_STORE.createScopeProvider(updatedDefinition)
          : null;
        if (updatedProvider) {
          overlayState.siteSearchState = updatedProvider;
          setSiteSearchPrefix(updatedProvider, overlayState.defaultTheme, { animate: false });
        } else {
          clearSiteSearch();
        }
      }
      if (overlayState.inputModeController && typeof overlayState.inputModeController.refreshModeMenu === 'function') {
        overlayState.inputModeController.refreshModeMenu();
      }
      if (overlayState.latestOverlayQuery) {
        requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
      }
    }
    if (!changes[SITE_SEARCH_STORAGE_KEY] && !changes[SITE_SEARCH_DISABLED_STORAGE_KEY]) {
      return;
    }
    if (!overlayState.storageArea) {
      return;
    }
    const providerReload = reloadSiteSearchProvidersFromStorage();
    providerReload.promise.then(() => {
      if (providerReload.version !== overlayState.siteSearchProvidersLoadVersion) {
        return;
      }
      if (isAggregateSearchProvider(overlayState.siteSearchState)) {
        const activeDefinition = (overlayState.aggregateSearchesCache || []).find((item) => (
          String(item && item.id ? item.id : '') === String(overlayState.siteSearchState.aggregateId || '')
        ));
        if (!isAggregateSearchDefinitionAvailable(activeDefinition, overlayState.siteSearchProvidersCache)) {
          clearSiteSearch();
        }
      }
      if (overlayState.inputModeController && typeof overlayState.inputModeController.refreshModeMenu === 'function') {
        overlayState.inputModeController.refreshModeMenu();
      }
      if (overlayState.latestOverlayQuery) {
        requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
      }
    });
  });

  overlayState.storageChangeListeners.add((changes, areaName) => {
    const iconChange = changes && changes[SITE_SEARCH_ICON_CACHE_STORAGE_KEY];
    if (areaName !== 'local' || !iconChange) {
      return;
    }
    overlayState.siteSearchIconCache = SHORTCUT_FAVICON.normalizeCacheMap(
      iconChange.newValue,
      Date.now(),
      siteSearchIconCacheOptions
    );
    overlayState.siteSearchIconCacheLoaded = true;
    siteSearchIconCacheRevision += 1;
    siteSearchIconCacheLoadPromise = Promise.resolve(overlayState.siteSearchIconCache);
    if (overlayState.siteSearchState && overlayState.inputModeController) {
      const activeProvider = overlayState.siteSearchState;
      setSiteSearchPrefix(activeProvider, overlayState.defaultTheme);
      getThemeForProvider(activeProvider).then((theme) => {
        if (overlayState.siteSearchState === activeProvider) {
          setSiteSearchPrefix(activeProvider, theme);
        }
      }).catch(() => {});
    }
    if (overlayState.inputModeController && typeof overlayState.inputModeController.refreshModeMenu === 'function') {
      overlayState.inputModeController.refreshModeMenu();
    }
    if (overlayState.latestOverlayQuery) {
      requestOverlaySearchSuggestions(overlayState.latestOverlayQuery);
    }
  });

  // Moves, undos and redos run one after another, so each reads what the
  // previous one stored.
  overlayState.searchSourceOrderQueue = Promise.resolve();

  overlayState.searchInput.addEventListener('compositionstart', handleSearchInputCompositionStart);
  overlayState.searchInput.addEventListener('compositionend', handleSearchInputCompositionEnd);
  overlayState.searchInput.addEventListener('input', handleSearchInputEvent);
  overlayState.inputContainer.addEventListener('compositionstart', handleSearchInputCompositionStart, true);
  overlayState.inputContainer.addEventListener('compositionend', handleSearchInputCompositionEnd, true);
  overlayState.inputContainer.addEventListener('input', handleSearchInputEvent, true);
  const handleOverlayLoadingSessionSelection = (event) => {
    notifyOverlayLoadingSession(syncLiveSearchInputFromEvent(event));
  };
  overlayState.inputContainer.addEventListener('select', handleOverlayLoadingSessionSelection, true);
  overlayState.inputContainer.addEventListener('focusin', handleOverlayLoadingSessionSelection, true);
  overlayState.inputContainer.addEventListener('pointerup', handleOverlayLoadingSessionSelection, true);

  // Add click outside to close functionality
  overlayState.clickOutsideHandler = function(e) {
    const eventPath = e && typeof e.composedPath === 'function' ? e.composedPath() : [];
    const clickedInsideOverlay = overlayState.overlay.contains(e.target) ||
      eventPath.includes(overlayState.overlay) ||
      eventPath.includes(overlayState.overlay._lumnoOverlayHost);
    if (!clickedInsideOverlay) {
      removeOverlay(overlayState.overlay);
    }
  };
  document.addEventListener('click', overlayState.clickOutsideHandler);
  overlayState.searchInput.addEventListener('keydown', handleSearchInputKeydown);
  overlayState.searchInput.addEventListener('keypress', function(e) {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.stopPropagation();
    }
  });
  overlayState.searchInput.addEventListener('keyup', function(e) {
    syncSuggestionActionModifiersFromEvent(e);
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      e.stopPropagation();
    }
  });

  const overlayKeyRouter = OVERLAY_KEYBOARD.createOverlayKeyRouter(window, {
    getMount: () => ({
      document,
      host: getOverlayMountHost(overlayState.overlay),
      panel: overlayState.overlay
    }),
    isOverlayConnected: () => Boolean(overlayState.overlay && overlayState.overlay.isConnected),
    isSearchInputActive,
    shouldHandleModeMenuKey: (e) => Boolean(
      overlayState.inputModeController &&
      typeof overlayState.inputModeController.shouldHandleModeMenuKeyEvent === 'function' &&
      overlayState.inputModeController.shouldHandleModeMenuKeyEvent(e)
    ),
    handleModeMenuKey(e) {
      if (!overlayState.inputModeController ||
          typeof overlayState.inputModeController.handleModeMenuKeyEvent !== 'function') {
        return false;
      }
      overlayState.inputModeController.handleModeMenuKeyEvent(e);
      return true;
    },
    isImeComposition: isImeCompositionEvent,
    onKeyUp: () => overlayState.imeKeyGuard.markKeyUp(),
    syncModifiers: syncSuggestionActionModifiersFromEvent,
    handleNumberShortcut: (e) => SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
      e,
      suggestionItems,
      overlayState.suggestionsContainer,
      numberShortcutOptions
    ),
    getSuggestionNavigationKey,
    handleInputKeydown: handleSearchInputKeydown,
    handleTab: handleTabKey,
    handleOverlayKeydown,
    handleOverlayKeyup,
    onEscapeOutside: () => {
      if (overlayState.overlay) {
        removeOverlay(overlayState.overlay);
      }
    },
    onBlur: () => {
      setSuggestionActionModifiersActive(false, false, false);
      SUGGESTION_NAVIGATION.cancelNumberShortcuts(overlayState.suggestionsContainer);
    }
  });
  overlayKeyRouter.start();
  addOverlaySessionCleanup(() => overlayKeyRouter.stop());

  overlayState.overlay.appendChild(overlayState.inputContainer);
  overlayState.overlay.appendChild(overlayState.suggestionsContainer);
  if (!shouldShowOpenTabsForEmptyQuery()) {
    clearDefaultOpenTabsSuggestions();
  }
  applyNoTranslateDeep(overlayState.overlay);
  applyOverlayThemeVariables(overlayState.overlay, overlayState.overlayThemeMode);
  // Reader extensions such as SimpRead can hide the original body and mount
  // their reading surface directly under <html>. Keep the overlay out of a
  // potentially hidden body while preserving fullscreen containment.
  const overlayMountParent = document.fullscreenElement ||
    document.documentElement ||
    document.body;
  overlayMountParent.appendChild(overlayHost);
  window._x_extension_search_overlay_open_2026_unique_ = true;
  if (typeof overlayHost.showPopover === 'function') {
    try {
      overlayHost.showPopover();
    } catch (e) {
      // Keep the fixed-position fallback visible if top-layer promotion fails.
      overlayHost.removeAttribute('popover');
    }
  }
  const mountConnectionGuard = overlayLifecycle.createMountConnectionGuard(window, {
    getMountParent(doc) {
      return doc.fullscreenElement || doc.documentElement || doc.body;
    },
    onRestore(restoredHost) {
      window._x_extension_search_overlay_open_2026_unique_ = true;
      if (typeof restoredHost.showPopover === 'function') {
        try {
          restoredHost.showPopover();
        } catch (error) {
          restoredHost.removeAttribute('popover');
        }
      }
      overlayState.overlayViewportSizeSync.apply(overlayState.overlay);
      const restoreFocus = () => {
        if (restoredHost.isConnected &&
            window._x_extension_search_overlay_open_2026_unique_ === true) {
          focusOverlayInputForReveal();
        }
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(restoreFocus);
      } else {
        window.setTimeout(restoreFocus, 0);
      }
    }
  });
  addOverlaySessionCleanup(() => {
    mountConnectionGuard.stop();
  });
  mountConnectionGuard.start(overlayHost);
  startOverlayViewportSizeSync(overlayState.overlay);
  overlayState.overlayNoticeLayer.startFrameSync(overlayState.overlay);
  startOverlayAntiTranslateObserver(overlayState.overlay);

  function focusOverlayInputForReveal() {
    if (!overlayState.searchInput || !overlayState.searchInput.isConnected ||
        typeof overlayState.searchInput.focus !== 'function') {
      return;
    }
    if (initialLoadingSession && initialLoadingSession.focused === false) {
      return;
    }
    overlayState.searchInput.focus({ preventScroll: true });
  }

  const initialOverlayContentReady = Promise.all([
    overlayState.initialOverlayOpenTabsDefaultVisibleReady,
    overlayState.initialFaviconEnhancedFetchReady,
    initialSimpleModeReady
  ]).then(() => initialSearchResultDisplayLimitReady).then(() => {
    if (!overlayState.overlay || !overlayState.overlay.isConnected) {
      return false;
    }
    if (initialLoadingSession || initialPrefillQuery) {
      const initialInputValue = initialLoadingSession
        ? initialLoadingSession.inputValue
        : initialPrefillQuery;
      overlayState.searchInput.value = initialInputValue;
      if (typeof overlayState.searchInput.setSelectionRange === 'function') {
        const selectionStart = initialLoadingSession
          ? initialLoadingSession.selectionStart
          : initialInputValue.length;
        const selectionEnd = initialLoadingSession
          ? initialLoadingSession.selectionEnd
          : initialInputValue.length;
        const selectionDirection = initialLoadingSession
          ? initialLoadingSession.selectionDirection
          : 'none';
        overlayState.searchInput.setSelectionRange(
          selectionStart,
          selectionEnd,
          selectionDirection
        );
      }
      overlayState.latestRawInputValue = initialInputValue;
      overlayState.latestOverlayQuery = initialInputValue.trim();
      updateModeBadge(initialInputValue);
      overlayState.suppressOverlayLoadingSessionNotification = true;
      try {
        overlayState.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      } finally {
        overlayState.suppressOverlayLoadingSessionNotification = false;
      }
      return true;
    }
    return initialLanguageReady.catch(() => {}).then(() => {
      requestTabsAndRender();
      return true;
    });
  }).catch(() => false);

  const revealOverlay = (options) => {
    if (!overlayState.overlay || !overlayState.overlay.isConnected) {
      return;
    }
    const revealOptions = options && typeof options === 'object' ? options : {};
    setOverlayMountVisibility(overlayHost, false);
    if (overlayState.overlayRevealGate && typeof overlayState.overlayRevealGate.release === 'function') {
      overlayState.overlayRevealGate.release();
    }
    // The style gate has just released the result surface, so take one last
    // measurement before it can become visible on a slow stylesheet load.
    syncOpenTabsScrollbarGutter();
    // Focusing before the two animation frames lets typing begin as soon as
    // the command bar is visually released, instead of after the entry
    // motion has already started.
    focusOverlayInputForReveal();
    const reduceMotion = revealOptions.forceInstant === true ||
      shouldSkipOverlayEntryMotion();
    const revealTransform = getOverlayEnterAnimationRevealTransform();
    if (reduceMotion) {
      overlayState.overlay.style.setProperty('transition', 'none', 'important');
      overlayState.overlay.style.setProperty('opacity', '1', 'important');
      overlayState.overlay.style.setProperty('transform', revealTransform, 'important');
      finishOverlayPanelEnterAnimation(overlayState.overlay);
      overlayState.overlayNoticeLayer.scheduleMount(overlayState.overlay, overlayState.overlayStyleRoot, 0);
    } else {
      clearOverlayEnterAnimationFrames();
      overlayFrameTracker.runEnterAnimation(overlayState.overlay, () => {
        playOverlayPanelEnterAnimation(overlayState.overlay, revealTransform);
        overlayState.overlayNoticeLayer.scheduleMount(overlayState.overlay, overlayState.overlayStyleRoot, 360);
      });
    }
  };
  const revealReady = overlayState.overlayRevealGate && typeof overlayState.overlayRevealGate.waitUntilReady === 'function'
    ? overlayState.overlayRevealGate.waitUntilReady()
    : Promise.resolve({ ok: true, reason: 'no-site-fix' });
  Promise.all([
    Promise.resolve(revealReady).catch(() => null),
    initialOverlayThemeReady,
    initialOverlaySizeReady,
    initialOverlayEnterAnimationReady.catch(() => {
      overlayState.overlayEnterAnimation = 'elastic';
    }),
    initialOverlayFontFamilyReady.catch(() => {}),
    initialMotionEffectsReady.catch(() => {
      overlayState.motionEffectsEnabled = true;
    }),
    initialSimpleModeReady.catch(() => {
      overlayState.simpleModeEnabled = false;
    }),
    initialNumberShortcutInstantReady.catch(() => {
      overlayState.numberShortcutInstantEnabled = false;
    }),
    initialMacosCtrlSuggestionNavigationReady.catch(() => {
      overlayState.macosCtrlSuggestionNavigationEnabled = false;
    })
  ]).then((readyStates) => {
    if (!overlayState.overlay || !overlayState.overlay.isConnected) {
      return;
    }
    applyOverlayEnterAnimationInitialState(overlayState.overlay);
    const styleGateResult = readyStates[0];
    revealOverlay({
      // A late stylesheet uses the shell's stable fallback. Starting a
      // spring while that fallback is about to upgrade only makes slow
      // devices look more broken, so reveal its final state instead.
      forceInstant: !styleGateResult || styleGateResult.ok !== true ||
        shouldSkipOverlayEntryMotionForSlowStartup()
    });
  });
  overlayState.overlayScrollPauseHandler = () => {
    pauseOverlayAntiTranslateObserverForScroll();
  };
  window.addEventListener('scroll', overlayState.overlayScrollPauseHandler, true);
  window.addEventListener('wheel', overlayState.overlayScrollPauseHandler, { passive: true, capture: true });
  window.addEventListener('touchmove', overlayState.overlayScrollPauseHandler, { passive: true, capture: true });

};

// Keep the injected script completion value structured-clonable (Firefox rejects functions).
void 0;
