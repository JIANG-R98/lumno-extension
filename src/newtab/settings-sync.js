// Keeps an open New Tab in step with settings changed elsewhere (Settings,
// another tab, sync): one listener per storage key on the shared change
// registry, and the runtime messages that ask the page to refresh a section.
import * as LumnoNewtabRemoteContent from './remote-content.js';
import * as LumnoNewtabStorageChangeRegistry from './storage-change-registry.js';

function createSettingsSync(deps) {
  const {
    SETTINGS,
    normalizeBookmarkCount,
    markBookmarkDataDirty,
    loadBookmarks,
    normalizeBookmarkColumns,
    getBookmarkLimit,
    keepBookmarkPageAnchorAfterLimitChange,
    applyBookmarkGridColumns,
    renderCurrentBookmarkPage,
    updateBookmarkGridHeightLock,
    updateBookmarkSectionPosition,
    normalizeBookmarkFolderIconsVisible,
    normalizeRecentCount,
    markRecentDataDirty,
    loadRecentSites,
    storageArea,
    isPrimaryStorageAreaName,
    FOLDER_REFERENCES,
    shortcutFolderRuntime,
    renderShortcuts,
    FOLDER_COLOR_REFS_STORAGE_KEY,
    NEWTAB_BOOKMARK_FOLDER_ICON,
    syncFolderColorsWithBookmarks,
    NEWTAB_SHORTCUT_ICONS_STORAGE_KEY,
    NEWTAB_SHORTCUT_ICON_STORE,
    NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY,
    SHORTCUT_FAVICON,
    SITE_SEARCH_ICON_CACHE_STORAGE_KEY,
    siteSearchIconCacheOptions,
    setSiteSearchPrefix,
    defaultTheme,
    getThemeForProvider,
    requestSuggestions,
    NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY,
    isShortcutSyncStorageActive,
    scheduleShortcutStorageReload,
    registerBookmarkDisplayStorageChanges,
    PROGRESS_HISTORY,
    NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
    settingsRuntimeApi,
    THEME_STORAGE_KEY,
    normalizeThemeMode,
    isNewtabThemeFollowingGlobal,
    applyScopedThemeMode,
    updateWallpaperAppearanceSelectionUi,
    updateModeCommandSuggestions,
    NEWTAB_THEME_MODE_STORAGE_KEY,
    normalizeNewtabThemeMode,
    NEWTAB_THEME_SCOPE_STORAGE_KEY,
    normalizeNewtabThemeScope,
    updateWallpaperLanguageStrings,
    LANGUAGE_STORAGE_KEY,
    applyLanguageMode,
    NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    normalizeNewtabInputAutoFocusEnabled,
    updateNewtabInputAutoFocusUi,
    RECENT_COUNT_STORAGE_KEY,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    normalizeNewtabWidthMode,
    applyNewtabWidthMode,
    applyRecentGridColumns,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    normalizeNewtabSearchWidth,
    updateNewtabSearchWidthLayout,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    setNewtabTopContentMode,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    normalizeNewtabTimeFontWeight,
    setNewtabTimeFontWeight,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    setNewtabTimeFontSize,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    setNewtabTimeOpacity,
    NEWTAB_TIME_INK_STORAGE_KEY,
    setNewtabTimeInk,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    normalizeNewtabTimeFont,
    setNewtabTimeFont,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    normalizeNewtabTimeSecondsVisible,
    setNewtabTimeSecondsVisible,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    setNewtabTime12Hour,
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    applyNewtabGlassStyle,
    NEWTAB_GLASS_THEME_STORAGE_KEY,
    applyNewtabGlassTheme,
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
    normalizeNewtabFeedbackButtonVisible,
    applyNewtabActionButtonVisibility,
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
    normalizeNewtabAppearanceButtonVisible,
    NEWTAB_ZEN_MODE_STORAGE_KEY,
    normalizeZenModeEnabled,
    applyZenMode,
    updateZenCommandSuggestions,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    normalizeNewtabShortcutsVisible,
    applyNewtabShortcutsVisibility,
    updateNewtabShortcutPreferencesUi,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    normalizeNewtabShortcutAddVisible,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    normalizeNewtabShortcutDockMagnificationEnabled,
    applyNewtabShortcutDockMagnification,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    normalizeNewtabShortcutColumns,
    applyNewtabShortcutColumns,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    normalizeNewtabShortcutSize,
    applyNewtabShortcutLayoutPreferences,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    normalizeNewtabShortcutGap,
    RECENT_MODE_STORAGE_KEY,
    normalizeRecentMode,
    updateRecentModeMenu,
    updateRecentHeading,
    BOOKMARK_VIEW_MODE_STORAGE_KEY,
    normalizeBookmarkViewMode,
    shouldRepairBookmarkViewModeStorageValue,
    persistBookmarkViewMode,
    applyBookmarkViewMode,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    BOOKMARK_COUNT_STORAGE_KEY,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    normalizeTabRankScoreDebugMode,
    requestTabsAndRender,
    PINNED_RECENT_SITES_STORAGE_KEY,
    normalizePinnedRecentSites,
    renderRecentSites,
    HIDDEN_RECENT_SITES_STORAGE_KEY,
    normalizeHiddenRecentSites,
    NEWTAB_SHORTCUTS_STORAGE_KEYS
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function addStorageChangeListener(listener) {
    return SETTINGS.addStorageChangeListener(chrome, listener);
  }

  // Bookmark and site-card preferences arrive from storage (Options page, other tabs) and from
  // the appearance panel, which previews a value here before saving it; an unchanged value
  // leaves the section alone.
  function applyBookmarkCountPreference(value) {
    const nextCount = normalizeBookmarkCount(value);
    if (nextCount === pageState.currentBookmarkCount) {
      return;
    }
    pageState.currentBookmarkCount = nextCount;
    pageState.bookmarkCurrentPage = 0;
    markBookmarkDataDirty();
    loadBookmarks({ force: true });
  }

  function applyBookmarkColumnsPreference(value) {
    const nextColumns = normalizeBookmarkColumns(value);
    if (nextColumns === pageState.currentBookmarkColumns) {
      return;
    }
    const previousLimit = getBookmarkLimit();
    pageState.currentBookmarkColumns = nextColumns;
    keepBookmarkPageAnchorAfterLimitChange(previousLimit);
    applyBookmarkGridColumns();
    renderCurrentBookmarkPage();
    updateBookmarkGridHeightLock();
    updateBookmarkSectionPosition();
  }

  function applyBookmarkFolderIconsVisiblePreference(value) {
    pageState.bookmarkFolderIconsVisible = normalizeBookmarkFolderIconsVisible(value);
    if (pageState.bookmarksView && typeof pageState.bookmarksView.setFolderIconsVisible === 'function') {
      pageState.bookmarksView.setFolderIconsVisible(pageState.bookmarkFolderIconsVisible);
    }
  }

  function applyRecentCountPreference(value) {
    const nextCount = normalizeRecentCount(value);
    if (nextCount === pageState.currentRecentCount) {
      return;
    }
    pageState.currentRecentCount = nextCount;
    markRecentDataDirty();
    loadRecentSites({ force: true });
  }

  function setSectionPreference(storageKey, value, apply, options) {
    apply(value);
    if (options && options.persist === true && storageArea) {
      storageArea.set({ [storageKey]: value });
    }
  }

  // Every storage change the page reacts to goes through this registry;
  // each part registers the keys it owns (see storage-change-registry.js).
  const storageChanges = LumnoNewtabStorageChangeRegistry.createStorageChangeRegistry({
    isPrimaryArea: isPrimaryStorageAreaName
  });
  addStorageChangeListener(storageChanges.dispatch);

  storageChanges.on(FOLDER_REFERENCES.BINDINGS_KEY, (changes) => {
    shortcutFolderRuntime.accept(changes[FOLDER_REFERENCES.BINDINGS_KEY].newValue);
    renderShortcuts();
  }, { area: 'local' });
  storageChanges.on(FOLDER_COLOR_REFS_STORAGE_KEY, (changes) => {
    pageState.folderColorRefs = NEWTAB_BOOKMARK_FOLDER_ICON.normalizeFolderColorRefs(changes[FOLDER_COLOR_REFS_STORAGE_KEY].newValue);
    syncFolderColorsWithBookmarks(false).catch(() => {});
  });
  storageChanges.on(NEWTAB_SHORTCUT_ICONS_STORAGE_KEY, (changes) => {
    pageState.newtabShortcutIcons = NEWTAB_SHORTCUT_ICON_STORE.normalizeIconMap(
      changes[NEWTAB_SHORTCUT_ICONS_STORAGE_KEY].newValue
    );
    renderShortcuts();
  }, { area: 'local' });
  storageChanges.on(NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY, (changes) => {
    pageState.newtabShortcutFavicons = SHORTCUT_FAVICON.normalizeCacheMap({
      ...(changes[NEWTAB_SHORTCUT_FAVICON_CACHE_STORAGE_KEY].newValue || {}),
      ...pageState.shortcutFaviconPendingCacheEntries
    });
    renderShortcuts();
  }, { area: 'local' });
  storageChanges.on(SITE_SEARCH_ICON_CACHE_STORAGE_KEY, (changes) => {
    pageState.siteSearchIconCache = SHORTCUT_FAVICON.normalizeCacheMap(
      changes[SITE_SEARCH_ICON_CACHE_STORAGE_KEY].newValue,
      Date.now(),
      siteSearchIconCacheOptions
    );
    pageState.siteSearchIconCacheLoaded = true;
    pageState.siteSearchIconCacheRevision += 1;
    pageState.siteSearchIconCacheLoadPromise = Promise.resolve(pageState.siteSearchIconCache);
    if (pageState.siteSearchState && pageState.inputModeController) {
      const activeProvider = pageState.siteSearchState;
      setSiteSearchPrefix(activeProvider, defaultTheme);
      getThemeForProvider(activeProvider).then((theme) => {
        if (pageState.siteSearchState === activeProvider) {
          setSiteSearchPrefix(activeProvider, theme);
        }
      }).catch(() => {});
    }
    if (pageState.inputModeController && typeof pageState.inputModeController.refreshModeMenu === 'function') {
      pageState.inputModeController.refreshModeMenu();
    }
    if (pageState.latestQuery) {
      requestSuggestions(pageState.latestQuery, { immediate: true });
    }
  }, { area: 'local' });
  storageChanges.on(NEWTAB_SHORTCUTS_LOCAL_OVERFLOW_STORAGE_KEY, () => {
    if (isShortcutSyncStorageActive() && pageState.shortcutPersistenceInFlightCount === 0) {
      scheduleShortcutStorageReload();
    }
  }, { area: 'local' });
  registerBookmarkDisplayStorageChanges(storageChanges);
  storageChanges.on(PROGRESS_HISTORY.STORAGE_KEY, (changes) => {
    pageState.progressHistoryMap = PROGRESS_HISTORY.normalizeHistoryMap(changes[PROGRESS_HISTORY.STORAGE_KEY].newValue);
  }, { area: 'local' });
  // With settings in sync, wallpaper files and caches still change in local.
  storageChanges.on([
    NEWTAB_LOCAL_WALLPAPER_STORAGE_KEY,
    settingsRuntimeApi.ASSET_REVISION_STORAGE_KEY,
    LumnoNewtabRemoteContent.BING_DAILY_CACHE_KEY
  ], (changes) => {
    if (pageState.wallpaperRuntime) {
      pageState.wallpaperRuntime.handleStorageChange(changes);
    }
  }, { area: (areaName) => areaName === 'local' && !isPrimaryStorageAreaName(areaName) });
  storageChanges.on(THEME_STORAGE_KEY, (changes) => {
    pageState.globalThemeMode = normalizeThemeMode(changes[THEME_STORAGE_KEY].newValue);
    if (isNewtabThemeFollowingGlobal()) {
      applyScopedThemeMode();
    } else {
      updateWallpaperAppearanceSelectionUi();
      updateModeCommandSuggestions();
    }
  });
  storageChanges.on(NEWTAB_THEME_MODE_STORAGE_KEY, (changes) => {
    pageState.newtabThemeMode = normalizeNewtabThemeMode(changes[NEWTAB_THEME_MODE_STORAGE_KEY].newValue);
    applyScopedThemeMode();
  });
  storageChanges.on(NEWTAB_THEME_SCOPE_STORAGE_KEY, (changes) => {
    pageState.newtabThemeScope = normalizeNewtabThemeScope(changes[NEWTAB_THEME_SCOPE_STORAGE_KEY].newValue);
    updateWallpaperLanguageStrings();
    updateModeCommandSuggestions();
  });
  storageChanges.onAny((changes) => {
    if (pageState.wallpaperRuntime) {
    pageState.wallpaperRuntime.handleStorageChange(changes);
    }
  });
  storageChanges.on(LANGUAGE_STORAGE_KEY, (changes) => {
    applyLanguageMode(changes[LANGUAGE_STORAGE_KEY].newValue || 'system');
  });
  storageChanges.on(NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY, (changes) => {
    const rawValue = changes[NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY].newValue;
    pageState.newtabInputAutoFocusEnabled = normalizeNewtabInputAutoFocusEnabled(rawValue);
    settingsRuntimeApi.cacheNewtabInputAutoFocusEnabled(pageState.newtabInputAutoFocusEnabled);
    updateNewtabInputAutoFocusUi();
  });
  storageChanges.on(RECENT_COUNT_STORAGE_KEY, (changes) => {
    applyRecentCountPreference(changes[RECENT_COUNT_STORAGE_KEY].newValue);
  });
  storageChanges.on(NEWTAB_WIDTH_MODE_STORAGE_KEY, (changes) => {
    const previousBookmarkLimit = getBookmarkLimit();
    const rawMode = changes[NEWTAB_WIDTH_MODE_STORAGE_KEY].newValue;
    const nextMode = normalizeNewtabWidthMode(rawMode);
    pageState.currentNewtabWidthMode = nextMode;
    if (storageArea && rawMode !== nextMode) {
      storageArea.set({ [NEWTAB_WIDTH_MODE_STORAGE_KEY]: nextMode });
    }
    applyNewtabWidthMode();
    if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateSearchWidthUi === 'function') {
      pageState.wallpaperRuntime.updateSearchWidthUi();
    }
    const recentColumnsChanged = applyRecentGridColumns();
    const bookmarkColumnsChanged = applyBookmarkGridColumns();
    if (recentColumnsChanged) {
      markRecentDataDirty();
      loadRecentSites({ force: true });
    }
    if (bookmarkColumnsChanged) {
      keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
      renderCurrentBookmarkPage();
    }
    updateBookmarkGridHeightLock();
    updateBookmarkSectionPosition();
  });
  storageChanges.on(NEWTAB_SEARCH_WIDTH_STORAGE_KEY, (changes) => {
    const rawWidth = changes[NEWTAB_SEARCH_WIDTH_STORAGE_KEY].newValue;
    pageState.currentNewtabSearchWidth = normalizeNewtabSearchWidth(rawWidth, { allowNull: true });
    updateNewtabSearchWidthLayout();
    if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateSearchWidthUi === 'function') {
      pageState.wallpaperRuntime.updateSearchWidthUi();
    }
  });
  storageChanges.on(NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabTopContentMode(raw);
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
    }
    setNewtabTopContentMode(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabTimeFontWeight(raw);
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeFontWeight(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_FONT_SIZE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_FONT_SIZE_STORAGE_KEY].newValue;
    const nextValue = SETTINGS.normalizeNewtabTimeFontSize(raw);
    if (storageArea && raw !== undefined && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_FONT_SIZE_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeFontSize(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_OPACITY_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_OPACITY_STORAGE_KEY].newValue;
    const nextValue = SETTINGS.normalizeNewtabTimeOpacity(raw);
    if (storageArea && raw !== undefined && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_OPACITY_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeOpacity(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_INK_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_INK_STORAGE_KEY].newValue;
    const nextValue = SETTINGS.normalizeNewtabTimeInk(raw);
    if (storageArea && raw !== undefined && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_INK_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeInk(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_FONT_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_FONT_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabTimeFont(raw);
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_FONT_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeFont(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabTimeSecondsVisible(raw);
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: nextValue });
    }
    setNewtabTimeSecondsVisible(nextValue);
  });
  storageChanges.on(NEWTAB_TIME_12_HOUR_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_TIME_12_HOUR_STORAGE_KEY].newValue;
    const nextValue = SETTINGS.normalizeNewtabTime12Hour(raw);
    if (storageArea && raw !== undefined && raw !== nextValue) {
      storageArea.set({ [NEWTAB_TIME_12_HOUR_STORAGE_KEY]: nextValue });
    }
    setNewtabTime12Hour(nextValue);
  });
  storageChanges.on(NEWTAB_GLASS_STYLE_STORAGE_KEY, (changes) => {
    applyNewtabGlassStyle(changes[NEWTAB_GLASS_STYLE_STORAGE_KEY].newValue);
  });
  storageChanges.on(NEWTAB_GLASS_THEME_STORAGE_KEY, (changes) => {
    applyNewtabGlassTheme(changes[NEWTAB_GLASS_THEME_STORAGE_KEY].newValue);
  });
  storageChanges.on(NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY].newValue;
    pageState.newtabFeedbackButtonVisible = normalizeNewtabFeedbackButtonVisible(raw);
    if (storageArea && raw !== pageState.newtabFeedbackButtonVisible) {
      storageArea.set({
        [NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY]: pageState.newtabFeedbackButtonVisible
      });
    }
    applyNewtabActionButtonVisibility();
  });
  storageChanges.on(NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY].newValue;
    pageState.newtabAppearanceButtonVisible = normalizeNewtabAppearanceButtonVisible(raw);
    if (storageArea && raw !== pageState.newtabAppearanceButtonVisible) {
      storageArea.set({
        [NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY]: pageState.newtabAppearanceButtonVisible
      });
    }
    applyNewtabActionButtonVisibility();
  });
  storageChanges.on(NEWTAB_ZEN_MODE_STORAGE_KEY, (changes) => {
    pageState.zenModeEnabled = normalizeZenModeEnabled(changes[NEWTAB_ZEN_MODE_STORAGE_KEY].newValue);
    applyZenMode();
    updateZenCommandSuggestions();
  });
  storageChanges.on(NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutsVisible(raw);
    pageState.newtabShortcutsVisible = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]: nextValue });
    }
    applyNewtabShortcutsVisibility();
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutAddVisible(raw);
    pageState.newtabShortcutAddVisible = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: nextValue });
    }
    renderShortcuts();
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutDockMagnificationEnabled(raw);
    pageState.newtabShortcutDockMagnificationEnabled = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]: nextValue });
    }
    applyNewtabShortcutDockMagnification();
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutColumns(raw);
    pageState.newtabShortcutColumns = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: nextValue });
    }
    applyNewtabShortcutColumns();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(NEWTAB_SHORTCUT_SIZE_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutSize(raw);
    pageState.newtabShortcutSize = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: nextValue });
    }
    applyNewtabShortcutLayoutPreferences();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(NEWTAB_SHORTCUT_GAP_STORAGE_KEY, (changes) => {
    const raw = changes[NEWTAB_SHORTCUT_GAP_STORAGE_KEY].newValue;
    const nextValue = normalizeNewtabShortcutGap(raw);
    pageState.newtabShortcutGap = nextValue;
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: nextValue });
    }
    applyNewtabShortcutLayoutPreferences();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    updateNewtabShortcutPreferencesUi();
  });
  storageChanges.on(RECENT_MODE_STORAGE_KEY, (changes) => {
    const nextMode = normalizeRecentMode(changes[RECENT_MODE_STORAGE_KEY].newValue, 'latest');
    if (pageState.currentRecentMode === nextMode) {
      updateRecentModeMenu();
    } else {
      pageState.currentRecentMode = nextMode;
      updateRecentHeading();
      updateRecentModeMenu();
      markRecentDataDirty();
      loadRecentSites({ force: true });
    }
  });
  storageChanges.on(BOOKMARK_VIEW_MODE_STORAGE_KEY, (changes) => {
    const rawMode = changes[BOOKMARK_VIEW_MODE_STORAGE_KEY].newValue;
    const nextMode = normalizeBookmarkViewMode(rawMode);
    if (shouldRepairBookmarkViewModeStorageValue(rawMode, nextMode)) {
      persistBookmarkViewMode(nextMode);
    }
    applyBookmarkViewMode(nextMode, { force: true });
  });
  storageChanges.on(BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY, (changes) => {
    const raw = changes[BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY].newValue;
    const nextValue = normalizeBookmarkFolderIconsVisible(raw);
    if (storageArea && raw !== nextValue) {
      storageArea.set({ [BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY]: nextValue });
    }
    applyBookmarkFolderIconsVisiblePreference(nextValue);
  });
  storageChanges.on(BOOKMARK_COUNT_STORAGE_KEY, (changes) => {
    const raw = changes[BOOKMARK_COUNT_STORAGE_KEY].newValue;
    const nextCount = normalizeBookmarkCount(raw);
    if (storageArea && raw !== nextCount) {
      storageArea.set({ [BOOKMARK_COUNT_STORAGE_KEY]: nextCount });
    }
    applyBookmarkCountPreference(nextCount);
  });
  storageChanges.on(BOOKMARK_COLUMNS_STORAGE_KEY, (changes) => {
    const raw = changes[BOOKMARK_COLUMNS_STORAGE_KEY].newValue;
    const nextColumns = normalizeBookmarkColumns(raw);
    if (storageArea && raw !== nextColumns) {
      storageArea.set({ [BOOKMARK_COLUMNS_STORAGE_KEY]: nextColumns });
    }
    applyBookmarkColumnsPreference(nextColumns);
  });
  storageChanges.on(TAB_RANK_SCORE_DEBUG_STORAGE_KEY, (changes) => {
    pageState.tabRankScoreDebugEnabled = normalizeTabRankScoreDebugMode(changes[TAB_RANK_SCORE_DEBUG_STORAGE_KEY].newValue);
    if (!pageState.latestQuery || !pageState.latestQuery.trim()) {
      requestTabsAndRender();
    }
  });
  storageChanges.on(PINNED_RECENT_SITES_STORAGE_KEY, (changes) => {
    pageState.pinnedRecentSites = normalizePinnedRecentSites(changes[PINNED_RECENT_SITES_STORAGE_KEY].newValue);
    pageState.recentRenderSignature = '';
    renderRecentSites(pageState.recentSourceItems);
  });
  storageChanges.on(settingsRuntimeApi.PROGRESS_TRACKING_ENABLED_STORAGE_KEY, (changes) => {
    pageState.progressTrackingEnabled = settingsRuntimeApi.normalizeProgressTrackingEnabled(
      changes[settingsRuntimeApi.PROGRESS_TRACKING_ENABLED_STORAGE_KEY].newValue
    );
    if (!pageState.progressTrackingEnabled && pageState.recentHistoryDialogController) {
      pageState.recentHistoryDialogController.close({ restoreFocus: false });
    }
    pageState.recentRenderSignature = '';
    renderRecentSites(pageState.recentSourceItems);
  });
  storageChanges.on(HIDDEN_RECENT_SITES_STORAGE_KEY, (changes) => {
    pageState.hiddenRecentSites = normalizeHiddenRecentSites(changes[HIDDEN_RECENT_SITES_STORAGE_KEY].newValue);
    pageState.recentRenderSignature = '';
    renderRecentSites(pageState.recentSourceItems);
  });
  storageChanges.on(NEWTAB_SHORTCUTS_STORAGE_KEYS, () => {
    if (pageState.shortcutPersistenceInFlightCount === 0) {
      scheduleShortcutStorageReload();
    }
  });

  if (chrome && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) {
        return;
      }
      if (message.action === 'lumno:wallpapers-updated') {
        if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.refreshCustomWallpapers === 'function') {
          pageState.wallpaperRuntime.refreshCustomWallpapers();
        }
        return;
      }
      if (message.action !== 'lumno:newtab-refresh-sections') return;
      const section = message.section || 'all';
      if (section === 'recent' || section === 'all') {
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
      if (section === 'bookmarks' || section === 'all') {
        markBookmarkDataDirty();
        loadBookmarks({ force: true });
      }
    });
  }

  return {
    applyBookmarkCountPreference,
    applyBookmarkColumnsPreference,
    applyBookmarkFolderIconsVisiblePreference,
    applyRecentCountPreference,
    setSectionPreference,
    storageChanges
  };
}

export { createSettingsSync };
