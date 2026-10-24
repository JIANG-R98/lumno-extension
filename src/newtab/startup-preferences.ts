// @ts-nocheck
// Reads the stored New Tab preferences once at startup (language, clock,
// sections, shortcuts, pinned and hidden recent sites, appearance) and
// applies them before the first reveal.
import * as LumnoSettingsStorage from '../platform/settings-storage';
function createStartupPreferences(deps) {
  const {
    storageArea,
    bootstrapInitialLanguageMode,
    settingsRuntimeApi,
    renderRecentSites,
    localStorageArea,
    PROGRESS_HISTORY,
    readPinnedRecentSites,
    readHiddenRecentSites,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    markRecentDataDirty,
    loadRecentSites,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    getBookmarkLimit,
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    applyNewtabWidthMode,
    applyRecentGridColumns,
    applyBookmarkGridColumns,
    keepBookmarkPageAnchorAfterLimitChange,
    renderCurrentBookmarkPage,
    updateBookmarkGridHeightLock,
    updateBookmarkSectionPosition,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    NEWTAB_TIME_INK_STORAGE_KEY,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabTimeSecondsVisible,
    loadNewtabTimeFont,
    setNewtabTimeFontWeight,
    setNewtabTimeFontSize,
    setNewtabTimeOpacity,
    setNewtabTimeInk,
    setNewtabTimeSecondsVisible,
    setNewtabTime12Hour,
    setNewtabTopContentMode,
    RECENT_MODE_STORAGE_KEY,
    normalizeRecentMode,
    updateRecentHeading,
    updateRecentModeMenu,
    loadInitialBookmarkViewMode,
    loadInitialBookmarkTopbarSurfaceColors,
    loadInitialBookmarkTopbarSurfaceMode,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    normalizeBookmarkFolderIconsVisible,
    BOOKMARK_COUNT_STORAGE_KEY,
    normalizeBookmarkCount,
    markBookmarkDataDirty,
    loadBookmarks,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    normalizeBookmarkColumns,
    TAB_RANK_SCORE_DEBUG_STORAGE_KEY,
    normalizeTabRankScoreDebugMode
  } = deps;
  // Writes the normalized value back for a missing or invalid stored one,
  // leaving a missing one alone while this device's local copy migrates in.
  const repairStoredSetting = (key, stored, value) => {
    if (stored !== value) {
      LumnoSettingsStorage.writeSettingRepairs(chrome, storageArea, { [key]: value }, { [key]: stored });
    }
  };

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  // Settles once the stored clock face has loaded, so the first reveal never
  // draws the clock in a fallback face.
  let resolveInitialTimeFontReady = () => {};
  const initialTimeFontReadyTask = new Promise((resolve) => {
    resolveInitialTimeFontReady = resolve;
  });
  if (!storageArea) {
    resolveInitialTimeFontReady(true);
  }

  if (storageArea) {
    bootstrapInitialLanguageMode();
    storageArea.get([settingsRuntimeApi.PROGRESS_TRACKING_ENABLED_STORAGE_KEY], (result) => {
      pageState.progressTrackingEnabled = settingsRuntimeApi.normalizeProgressTrackingEnabled(
        result && result[settingsRuntimeApi.PROGRESS_TRACKING_ENABLED_STORAGE_KEY]
      );
      if (pageState.progressTrackingEnabled && pageState.recentSourceItems.length > 0) {
        pageState.recentRenderSignature = '';
        renderRecentSites(pageState.recentSourceItems);
      }
    });
    if (localStorageArea) {
      localStorageArea.get([PROGRESS_HISTORY.STORAGE_KEY], (result) => {
        pageState.progressHistoryMap = PROGRESS_HISTORY.normalizeHistoryMap(result && result[PROGRESS_HISTORY.STORAGE_KEY]);
      });
    }
    pageState.initialPinnedRecentSitesReadyTask = readPinnedRecentSites().then((items) => {
      pageState.pinnedRecentSites = items;
      if (pageState.recentSourceItems.length > 0) {
        pageState.recentRenderSignature = '';
        renderRecentSites(pageState.recentSourceItems);
      }
      return items;
    }).catch(() => {
      pageState.pinnedRecentSites = [];
      return pageState.pinnedRecentSites;
    });
    pageState.initialHiddenRecentSitesReadyTask = readHiddenRecentSites().then((items) => {
      pageState.hiddenRecentSites = items;
      if (pageState.recentSourceItems.length > 0) {
        pageState.recentRenderSignature = '';
        renderRecentSites(pageState.recentSourceItems);
      }
      return items;
    }).catch(() => {
      pageState.hiddenRecentSites = [];
      return pageState.hiddenRecentSites;
    });

    storageArea.get([RECENT_COUNT_STORAGE_KEY], (result) => {
      const stored = result[RECENT_COUNT_STORAGE_KEY];
      const count = normalizeRecentCount(stored);
      const changed = pageState.currentRecentCount !== count;
      pageState.currentRecentCount = count;
      repairStoredSetting(RECENT_COUNT_STORAGE_KEY, stored, count);
      if (changed || !pageState.recentLoadedOnce) {
        markRecentDataDirty();
        loadRecentSites();
      }
    });
    storageArea.get([NEWTAB_WIDTH_MODE_STORAGE_KEY, NEWTAB_SEARCH_WIDTH_STORAGE_KEY], (result) => {
      const previousBookmarkLimit = getBookmarkLimit();
      const stored = result[NEWTAB_WIDTH_MODE_STORAGE_KEY];
      const mode = normalizeNewtabWidthMode(stored);
      const changed = pageState.currentNewtabWidthMode !== mode;
      pageState.currentNewtabWidthMode = mode;
      pageState.currentNewtabSearchWidth = normalizeNewtabSearchWidth(result[NEWTAB_SEARCH_WIDTH_STORAGE_KEY], {
        allowNull: true
      });
      repairStoredSetting(NEWTAB_WIDTH_MODE_STORAGE_KEY, stored, mode);
      applyNewtabWidthMode();
      if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateSearchWidthUi === 'function') {
        pageState.wallpaperRuntime.updateSearchWidthUi();
      }
      const recentColumnsChanged = applyRecentGridColumns();
      const bookmarkColumnsChanged = applyBookmarkGridColumns();
      if (changed || recentColumnsChanged) {
        markRecentDataDirty();
        loadRecentSites({ force: true });
      }
      if (bookmarkColumnsChanged && pageState.bookmarkLoadedOnce) {
        keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
        renderCurrentBookmarkPage();
      }
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    });
    storageArea.get([
      NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
      NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
      NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
      NEWTAB_TIME_OPACITY_STORAGE_KEY,
      NEWTAB_TIME_INK_STORAGE_KEY,
      NEWTAB_TIME_FONT_STORAGE_KEY,
      NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
      NEWTAB_TIME_12_HOUR_STORAGE_KEY
    ], (result) => {
      const raw = result[NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY];
      const nextValue = normalizeNewtabTopContentMode(raw);
      const rawFontWeight = result[NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY];
      const nextFontWeight = normalizeNewtabTimeFontWeight(rawFontWeight);
      const rawFont = result[NEWTAB_TIME_FONT_STORAGE_KEY];
      const nextFont = normalizeNewtabTimeFont(rawFont);
      const rawSecondsVisible = result[NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY];
      const nextSecondsVisible = normalizeNewtabTimeSecondsVisible(rawSecondsVisible);
      repairStoredSetting(NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY, raw, nextValue);
      repairStoredSetting(NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY, rawFontWeight, nextFontWeight);
      if (rawFont !== undefined && rawFont !== nextFont) {
        storageArea.set({ [NEWTAB_TIME_FONT_STORAGE_KEY]: nextFont });
      }
      repairStoredSetting(NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY, rawSecondsVisible, nextSecondsVisible);
      // The face is set before the mode so the first clock render already
      // uses it, and the startup reveal waits for it to load.
      pageState.newtabTimeFont = nextFont;
      resolveInitialTimeFontReady(nextValue === 'time' ? loadNewtabTimeFont(nextFont) : true);
      setNewtabTimeFontWeight(nextFontWeight);
      // Unset stays unset, so the defaults can still change later.
      setNewtabTimeFontSize(result[NEWTAB_TIME_FONT_SIZE_STORAGE_KEY]);
      setNewtabTimeOpacity(result[NEWTAB_TIME_OPACITY_STORAGE_KEY]);
      setNewtabTimeInk(result[NEWTAB_TIME_INK_STORAGE_KEY]);
      setNewtabTimeSecondsVisible(nextSecondsVisible);
      // Unset stays unset, so the clock keeps 24 hours until it's turned on.
      setNewtabTime12Hour(result[NEWTAB_TIME_12_HOUR_STORAGE_KEY]);
      setNewtabTopContentMode(nextValue);
      if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateTopContentModeUi === 'function') {
        pageState.wallpaperRuntime.updateTopContentModeUi();
      }
    });
    storageArea.get([RECENT_MODE_STORAGE_KEY], (result) => {
      const stored = result[RECENT_MODE_STORAGE_KEY];
      const hasStored = stored === 'latest' || stored === 'most';
      const mode = normalizeRecentMode(stored, 'most');
      const changed = pageState.currentRecentMode !== mode;
      pageState.currentRecentMode = mode;
      updateRecentHeading();
      updateRecentModeMenu();
      if (!hasStored) {
        repairStoredSetting(RECENT_MODE_STORAGE_KEY, stored, mode);
      }
      if (changed || !pageState.recentLoadedOnce) {
        markRecentDataDirty();
        loadRecentSites();
      }
    });
    loadInitialBookmarkViewMode();
    loadInitialBookmarkTopbarSurfaceColors();
    loadInitialBookmarkTopbarSurfaceMode();
    storageArea.get([BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY], (result) => {
      const raw = result[BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY];
      const nextValue = normalizeBookmarkFolderIconsVisible(raw);
      pageState.bookmarkFolderIconsVisible = nextValue;
      repairStoredSetting(BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY, raw, nextValue);
      if (pageState.bookmarksView && typeof pageState.bookmarksView.setFolderIconsVisible === 'function') {
        pageState.bookmarksView.setFolderIconsVisible(nextValue);
      }
    });
    storageArea.get([BOOKMARK_COUNT_STORAGE_KEY], (result) => {
      const stored = result[BOOKMARK_COUNT_STORAGE_KEY];
      const count = normalizeBookmarkCount(stored);
      const changed = pageState.currentBookmarkCount !== count;
      pageState.currentBookmarkCount = count;
      repairStoredSetting(BOOKMARK_COUNT_STORAGE_KEY, stored, count);
      if (changed || !pageState.bookmarkLoadedOnce) {
        markBookmarkDataDirty();
        loadBookmarks();
      }
    });
    storageArea.get([BOOKMARK_COLUMNS_STORAGE_KEY], (result) => {
      const stored = result[BOOKMARK_COLUMNS_STORAGE_KEY];
      const columns = normalizeBookmarkColumns(stored);
      pageState.currentBookmarkColumns = columns;
      repairStoredSetting(BOOKMARK_COLUMNS_STORAGE_KEY, stored, columns);
      applyBookmarkGridColumns();
      updateBookmarkGridHeightLock();
      updateBookmarkSectionPosition();
    });
    storageArea.get([TAB_RANK_SCORE_DEBUG_STORAGE_KEY], (result) => {
      const raw = result[TAB_RANK_SCORE_DEBUG_STORAGE_KEY];
      const next = normalizeTabRankScoreDebugMode(raw);
      pageState.tabRankScoreDebugEnabled = next;
      repairStoredSetting(TAB_RANK_SCORE_DEBUG_STORAGE_KEY, raw, next);
    });
  }

  return {
    initialTimeFontReadyTask
  };
}

export { createStartupPreferences };
