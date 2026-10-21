// Page geometry: bookmark and recent grid column counts, the width modes
// and search width, shortcut grid sizing, which content sections show, and
// the search entry's vertical position as the viewport changes.
function createPageLayout(deps) {
  const {
    NEWTAB_RECENT_STORE,
    normalizeBookmarkColumns,
    NEWTAB_LAYOUT,
    NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
    NEWTAB_WIDTH_MODE_CONFIGS,
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    NEWTAB_SEARCH_WIDTH_CONFIG,
    RECENT_CARD_TARGET_WIDTH_PX,
    RECENT_GRID_GAP_PX,
    getBookmarkLimit,
    updateSuggestionsFloatingLayout,
    storageArea,
    NEWTAB_SEARCH_WIDTH_STORAGE_KEY,
    closeRecentContextMenu,
    scheduleWallpaperAdaptiveToneUpdate,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    getVisibleShortcuts,
    MAX_NEWTAB_SHORTCUTS,
    resetShortcutDockHover,
    closeShortcutContextMenu,
    closeShortcutDialog
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const RESTORE_SEARCH_LAYOUT_LOCK_MS = 900;
  let searchEntryRestoreLayoutLockUntil = 0;
  let searchEntryLastVisibleViewportWidth = Math.max(0, window.innerWidth || 0);
  let searchEntryLastVisibleViewportHeight = Math.max(0, window.innerHeight || 0);
  const BOOKMARK_CARD_TARGET_WIDTH_PX = 154;
  const BOOKMARK_GRID_GAP_PX = 12;
  let currentRecentGridColumns = 4;

  function normalizeRecentCount(value) {
    return NEWTAB_RECENT_STORE.normalizeRecentCount(value);
  }

  function normalizeRecentMode(value, fallback) {
    if (value === 'latest' || value === 'most') {
      return value;
    }
    return fallback === 'latest' || fallback === 'most' ? fallback : 'latest';
  }

  function getBookmarkGridColumnCount() {
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(2, normalizeBookmarkColumns(pageState.currentBookmarkColumns));
    return NEWTAB_LAYOUT.getAdaptiveGridColumnCount({
      viewportWidth: window.innerWidth,
      mobileBreakpointPx: NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
      mobileColumns: 2,
      compactBreakpointPx: 860,
      compactColumns: 2,
      contentMaxWidth: Number(config.contentMaxWidth || NEWTAB_LAYOUT.CONTENT_MAX_WIDTH_PX),
      targetColumnWidth: BOOKMARK_CARD_TARGET_WIDTH_PX,
      gap: BOOKMARK_GRID_GAP_PX,
      minColumns: 2,
      maxColumns
    });
  }

  function getNewtabWidthModeBaseConfig() {
    return NEWTAB_WIDTH_MODE_CONFIGS[normalizeNewtabWidthMode(pageState.currentNewtabWidthMode)] || NEWTAB_WIDTH_MODE_CONFIGS.wide;
  }

  function getEffectiveNewtabSearchWidth() {
    const customWidth = normalizeNewtabSearchWidth(pageState.currentNewtabSearchWidth, { allowNull: true });
    return customWidth || getNewtabWidthModeBaseConfig().searchMaxWidth || NEWTAB_SEARCH_WIDTH_CONFIG.fallback;
  }

  function getNewtabWidthModeConfig() {
    return Object.assign({}, getNewtabWidthModeBaseConfig(), {
      searchMaxWidth: getEffectiveNewtabSearchWidth()
    });
  }

  function getRecentGridColumnCount() {
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(4, Number(config.recentMaxColumns || 4));
    return NEWTAB_LAYOUT.getAdaptiveGridColumnCount({
      viewportWidth: window.innerWidth,
      mobileBreakpointPx: NEWTAB_MOBILE_FLOW_BREAKPOINT_PX,
      mobileColumns: 2,
      compactBreakpointPx: 860,
      compactColumns: 2,
      contentMaxWidth: Number(config.contentMaxWidth || NEWTAB_LAYOUT.CONTENT_MAX_WIDTH_PX),
      targetColumnWidth: RECENT_CARD_TARGET_WIDTH_PX,
      gap: RECENT_GRID_GAP_PX,
      minColumns: 4,
      maxColumns
    });
  }

  function getRecentLimit() {
    const normalized = normalizeRecentCount(pageState.currentRecentCount);
    if (normalized <= 0) {
      return 0;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    return rows * Math.max(1, getRecentGridColumnCount());
  }

  function getRecentSourceLimit() {
    const normalized = normalizeRecentCount(pageState.currentRecentCount);
    if (normalized <= 0) {
      return 0;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    const config = getNewtabWidthModeConfig();
    const maxColumns = Math.max(4, Number(config.recentMaxColumns || 4));
    return rows * maxColumns;
  }

  function applyBookmarkGridColumns() {
    if (!pageState.bookmarkGrid) {
      return false;
    }
    const previousColumns = Number.parseInt(pageState.bookmarkGrid.style.getPropertyValue('--x-nt-bookmark-columns'), 10);
    const columns = Math.max(1, getBookmarkGridColumnCount());
    pageState.bookmarkGrid.style.setProperty('--x-nt-bookmark-columns', String(columns));
    return previousColumns !== columns;
  }

  function keepBookmarkPageAnchorAfterLimitChange(previousLimit) {
    const prev = Math.max(1, Number.parseInt(previousLimit, 10) || 1);
    const next = Math.max(1, getBookmarkLimit());
    const firstVisibleIndex = Math.max(0, pageState.bookmarkCurrentPage * prev);
    pageState.bookmarkCurrentPage = Math.floor(firstVisibleIndex / next);
  }

  function applyRecentGridColumns() {
    if (!pageState.recentGrid) {
      return false;
    }
    const columns = getRecentGridColumnCount();
    const changed = currentRecentGridColumns !== columns;
    currentRecentGridColumns = columns;
    pageState.recentGrid.style.setProperty('--x-nt-recent-columns', String(columns));
    return changed;
  }

  function applyNewtabWidthMode() {
    if (pageState.layoutController && typeof pageState.layoutController.applyWidthMode === 'function') {
      pageState.layoutController.applyWidthMode(getNewtabWidthModeConfig());
    }
  }

  function updateNewtabSearchWidthLayout() {
    applyNewtabWidthMode();
    updateSuggestionsFloatingLayout();
    updateBookmarkSectionPosition();
  }

  function setNewtabSearchWidth(value, options) {
    const config = options || {};
    const nextWidth = normalizeNewtabSearchWidth(value, { allowNull: Boolean(config.allowNull) });
    const changed = pageState.currentNewtabSearchWidth !== nextWidth;
    pageState.currentNewtabSearchWidth = nextWidth;
    updateNewtabSearchWidthLayout();
    if (pageState.wallpaperRuntime && typeof pageState.wallpaperRuntime.updateSearchWidthUi === 'function') {
      pageState.wallpaperRuntime.updateSearchWidthUi();
    }
    if (config.persist && storageArea && nextWidth !== null) {
      storageArea.set({ [NEWTAB_SEARCH_WIDTH_STORAGE_KEY]: nextWidth });
    }
    return changed;
  }

  function setContentSectionVisible(section, visible) {
    if (!section) {
      return;
    }
    section.setAttribute('data-content-visible', visible ? 'true' : 'false');
    section.setAttribute('data-visible', visible && !pageState.zenModeEnabled ? 'true' : 'false');
    if (section === pageState.recentSection && (!visible || pageState.zenModeEnabled)) {
      closeRecentContextMenu();
    }
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function isContentSectionVisible(section) {
    return Boolean(section && section.getAttribute('data-visible') === 'true');
  }

  function applyNewtabShortcutLayoutPreferences() {
    if (!document.documentElement || !document.documentElement.style) {
      return;
    }
    const rootStyle = document.documentElement.style;
    const size = normalizeNewtabShortcutSize(pageState.newtabShortcutSize);
    const gap = normalizeNewtabShortcutGap(pageState.newtabShortcutGap);
    // Whole pixels with matching parity leave an even margin on each side, so
    // the icon sits centered in its tile and the favicon in its icon on 1x screens.
    const iconSize = roundToParityOf(size * 0.75, size);
    const faviconSize = roundToParityOf(size * 0.4375, iconSize);
    rootStyle.setProperty('--x-nt-shortcut-user-tile-size', `${size}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-icon-size', `${iconSize}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-icon-radius', `${size * 0.25}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-favicon-size', `${faviconSize}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-tile-padding', `${size * 0.125}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-column-gap', `${gap}px`);
    rootStyle.setProperty('--x-nt-shortcut-user-row-gap', `${gap + 6}px`);
    applyNewtabShortcutColumns();
  }

  function roundToParityOf(value, reference) {
    const floor = Math.floor(value);
    const lower = (floor - reference) % 2 === 0 ? floor : floor - 1;
    return value - lower <= 1 ? lower : lower + 2;
  }

  function applyNewtabShortcutColumns() {
    if (!document.documentElement || !document.documentElement.style) {
      return;
    }
    document.documentElement.style.setProperty(
      '--x-nt-shortcut-columns',
      String(pageState.newtabShortcutColumns)
    );
    if (!pageState.shortcutGrid || typeof window.getComputedStyle !== 'function') {
      return;
    }
    const gridStyle = window.getComputedStyle(pageState.shortcutGrid);
    const tileSize = Number.parseFloat(
      gridStyle.getPropertyValue('--x-nt-shortcut-tile-size')
    );
    const columnGap = Number.parseFloat(gridStyle.columnGap);
    const paddingLeft = Number.parseFloat(gridStyle.paddingLeft);
    const paddingRight = Number.parseFloat(gridStyle.paddingRight);
    if (![tileSize, columnGap, paddingLeft, paddingRight].every(Number.isFinite)) {
      return;
    }
    const targetWidth =
      (tileSize * pageState.newtabShortcutColumns) +
      (columnGap * Math.max(0, pageState.newtabShortcutColumns - 1)) +
      paddingLeft +
      paddingRight;
    document.documentElement.style.setProperty(
      '--x-nt-shortcuts-target-width',
      `${Math.round(targetWidth)}px`
    );
  }

  function applyNewtabShortcutsVisibility() {
    if (!pageState.shortcutSection) {
      return;
    }
    const hasVisibleContent = getVisibleShortcuts().length > 0 ||
      (pageState.newtabShortcutAddVisible && pageState.newtabShortcuts.length < MAX_NEWTAB_SHORTCUTS);
    setContentSectionVisible(
      pageState.shortcutSection,
      Boolean(pageState.newtabShortcutsVisible && hasVisibleContent)
    );
    if (!pageState.newtabShortcutsVisible || !hasVisibleContent || pageState.zenModeEnabled) {
      resetShortcutDockHover();
      closeShortcutContextMenu();
      closeShortcutDialog();
    }
  }

  function getCurrentSearchEntryPaddingTop() {
    if (!document.body || !document.body.style) {
      return null;
    }
    const value = Number.parseFloat(document.body.style.getPropertyValue('padding-top'));
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  function getSearchEntryViewportSnapshot() {
    return {
      width: Math.max(0, Math.round(window.innerWidth || 0)),
      height: Math.max(0, Math.round(window.innerHeight || 0))
    };
  }

  function hasSearchEntryViewportChanged(referenceViewport) {
    const currentViewport = getSearchEntryViewportSnapshot();
    const reference = referenceViewport || {};
    return Math.abs(currentViewport.width - (Number(reference.width) || 0)) > 1 ||
      Math.abs(currentViewport.height - (Number(reference.height) || 0)) > 1;
  }

  function rememberSearchEntryViewport() {
    const viewport = getSearchEntryViewportSnapshot();
    searchEntryLastVisibleViewportWidth = viewport.width;
    searchEntryLastVisibleViewportHeight = viewport.height;
  }

  function hasSearchEntryViewportChangedSinceLastVisible() {
    const viewport = getSearchEntryViewportSnapshot();
    return Math.abs(viewport.width - searchEntryLastVisibleViewportWidth) > 1 ||
      Math.abs(viewport.height - searchEntryLastVisibleViewportHeight) > 1;
  }

  function beginSearchEntryRestoreLayoutLock() {
    if (!document.body ||
        document.body.getAttribute('data-nt-ready') !== '1' ||
        hasSearchEntryViewportChangedSinceLastVisible() ||
        getCurrentSearchEntryPaddingTop() === null) {
      return;
    }
    searchEntryRestoreLayoutLockUntil = Date.now() + RESTORE_SEARCH_LAYOUT_LOCK_MS;
  }

  function shouldPreserveSearchEntryLayout() {
    if (!searchEntryRestoreLayoutLockUntil || Date.now() > searchEntryRestoreLayoutLockUntil) {
      searchEntryRestoreLayoutLockUntil = 0;
      return false;
    }
    if (getCurrentSearchEntryPaddingTop() === null) {
      searchEntryRestoreLayoutLockUntil = 0;
      return false;
    }
    return true;
  }

  function updateBookmarkSectionPosition(options) {
    const layoutOptions = options || {};
    if (pageState.layoutController && typeof pageState.layoutController.updateBottomDockLayout === 'function') {
      pageState.layoutController.updateBottomDockLayout({
        preserveSearchEntryLayout: Boolean(layoutOptions.preserveSearchEntryLayout) ||
          pageState.newtabResizeLayoutLocked ||
          shouldPreserveSearchEntryLayout(),
        // A live resize holds the dock's density until the resize settles.
        stabilizeDockDensity: Boolean(layoutOptions.stabilizeDockDensity) || pageState.newtabResizeLayoutLocked,
        onRecentHidden: () => {
          pageState.recentMouseInsideSection = false;
          pageState.recentMouseLeftAt = 0;
        }
      });
    }
    if (pageState.layoutMotion) {
      pageState.layoutMotion.commit();
    }
    rememberSearchEntryViewport();
    scheduleWallpaperAdaptiveToneUpdate();
  }

  function updateSearchEntryLayout(options) {
    if (pageState.layoutController && typeof pageState.layoutController.updateSearchEntryLayout === 'function') {
      pageState.layoutController.updateSearchEntryLayout(options);
    }
    if (pageState.layoutMotion) {
      pageState.layoutMotion.commit();
    }
  }

  return {
    normalizeRecentCount,
    normalizeRecentMode,
    getBookmarkGridColumnCount,
    getEffectiveNewtabSearchWidth,
    getRecentLimit,
    getRecentSourceLimit,
    applyBookmarkGridColumns,
    keepBookmarkPageAnchorAfterLimitChange,
    applyRecentGridColumns,
    applyNewtabWidthMode,
    updateNewtabSearchWidthLayout,
    setNewtabSearchWidth,
    setContentSectionVisible,
    isContentSectionVisible,
    applyNewtabShortcutLayoutPreferences,
    applyNewtabShortcutColumns,
    applyNewtabShortcutsVisibility,
    getSearchEntryViewportSnapshot,
    hasSearchEntryViewportChanged,
    rememberSearchEntryViewport,
    beginSearchEntryRestoreLayoutLock,
    updateBookmarkSectionPosition,
    updateSearchEntryLayout
  };
}

export { createPageLayout };
