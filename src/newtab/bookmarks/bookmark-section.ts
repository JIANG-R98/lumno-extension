// Builds the bookmark section: its heading, breadcrumb, view mode select,
// pager buttons and grid, then the bookmark view, the cascade menu runtime
// and the top bar runtime that render into it.
import * as LumnoMenuSurface from '../../shared/ui/menu-surface';
import * as NEWTAB_BOOKMARK_CASCADE_MENU from './bookmark-cascade-menu';
import * as NEWTAB_BOOKMARK_CASCADE_POSITION from './bookmark-cascade-position';

function createBookmarkSection(deps) {
  const {
    setContentSectionVisible,
    bookmarkSection,
    pageStructureRuntime,
    updateBookmarkHeading,
    navigateBookmarkFolder,
    createSectionModeSelect,
    setBookmarkViewMode,
    handleBookmarkModeMenuAction,
    getBookmarkViewModeOptions,
    bindBookmarkPagerTooltip,
    t,
    updateBookmarkPagerLabels,
    updateBookmarkBreadcrumb,
    handleBookmarkDragPointerDown,
    applyBookmarkGridColumns,
    bookmarkCards,
    formatMessage,
    sanitizeDisplayText,
    getHostFromUrl,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    stableHashCode,
    normalizeHost,
    attachFaviconWithFallbacks,
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyBookmarkCardTheme,
    shouldDelayBookmarkHoverFromRecent,
    shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    openBookmarkFolder,
    openBookmarkCascadeMenu,
    copyBookmarkUrl,
    handleBookmarkItemContextMenu,
    isCardActivationSuppressed,
    navigateToUrl,
    openUrlFromNewtabCard,
    dismissStack,
    NEWTAB_CROSS_SURFACE_DRAG,
    isShortcutFolderAnchor,
    getFolderItemIconUrl,
    bookmarksRuntime,
    bookmarkCascadeCopyTooltipController,
    hideTopActionTooltip,
    handleBookmarkCascadeItemPointerDown,
    isBookmarkContextMenuNode,
    getBookmarkCascadeViewportTopPaddingPx,
    NEWTAB_BOOKMARKS_TOPBAR,
    setNewtabTopOccupied,
    syncBookmarkTopbarSurfaceAppearance,
    syncBookmarkSurfaceMode
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const NEWTAB_BOOKMARKS_VIEW = globalThis.LumnoNewtabBookmarksView;
  const NEWTAB_BOOKMARK_CASCADE_VIEW =
    globalThis.LumnoNewtabBookmarkCascadeView;
  const NEWTAB_BOOKMARK_BREADCRUMB =
    globalThis.LumnoNewtabBookmarkBreadcrumb;
  const bookmarkCardElementCache = new Map();
  let bookmarkBreadcrumb = null;
  const BOOKMARK_HOVER_DELAY_FROM_RECENT_MS = 56;

  setContentSectionVisible(bookmarkSection, false);
  pageState.bookmarkTitleWrap = pageStructureRuntime.bookmark.titleWrap;
  pageState.bookmarkHeading = pageStructureRuntime.bookmark.heading;
  updateBookmarkHeading();
  bookmarkBreadcrumb = pageStructureRuntime.bookmark.breadcrumb;
  pageState.bookmarkBreadcrumbController =
    NEWTAB_BOOKMARK_BREADCRUMB.createBookmarkBreadcrumbController(
      bookmarkBreadcrumb,
      { onNavigate: navigateBookmarkFolder }
    );
  pageState.bookmarkBreadcrumbController.render({ items: [] });
  pageState.bookmarkModeMenu = createSectionModeSelect({
    id: '_x_extension_newtab_bookmark_mode_2026_unique_',
    menuTitleKey: 'display_mode_title',
    menuTitleFallback: 'Display mode',
    getValue: () => pageState.currentBookmarkViewMode,
    onChange: setBookmarkViewMode,
    onAction: handleBookmarkModeMenuAction,
    getOptions: getBookmarkViewModeOptions
  });
  const bookmarkPager = pageStructureRuntime.bookmark.pager;
  pageState.bookmarkPagerPrevButton = pageStructureRuntime.bookmark.previousButton;
  pageState.bookmarkPagerNextButton = pageStructureRuntime.bookmark.nextButton;
  pageState.bookmarkOpenManagerButton = pageStructureRuntime.bookmark.managerButton;
  bindBookmarkPagerTooltip(
    pageState.bookmarkPagerPrevButton,
    () => pageState.bookmarkPagerPrevButton.getAttribute('data-tooltip') || t('bookmarks_page_prev', '上一页')
  );
  bindBookmarkPagerTooltip(
    pageState.bookmarkPagerNextButton,
    () => pageState.bookmarkPagerNextButton.getAttribute('data-tooltip') || t('bookmarks_page_next', '下一页')
  );
  bindBookmarkPagerTooltip(
    pageState.bookmarkOpenManagerButton,
    () => pageState.bookmarkOpenManagerButton.getAttribute('data-tooltip') || t('bookmarks_open_manager', '打开书签管理页')
  );
  if (pageState.bookmarkModeMenu) {
    bookmarkPager.appendChild(pageState.bookmarkModeMenu.control);
  }
  pageState.bookmarkHeading.addEventListener('click', () => {
    if (!pageState.bookmarkHeading._xCanNavigateRoot) {
      return;
    }
    navigateBookmarkFolder(pageState.bookmarkRootFolderId);
  });
  pageState.bookmarkHeading.addEventListener('keydown', (event) => {
    if (!pageState.bookmarkHeading._xCanNavigateRoot) {
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    event.preventDefault();
    navigateBookmarkFolder(pageState.bookmarkRootFolderId);
  });
  updateBookmarkPagerLabels();
  updateBookmarkBreadcrumb();
  pageState.bookmarkGrid = pageStructureRuntime.bookmark.grid;
  pageState.bookmarkGrid.setAttribute('data-view-mode', pageState.currentBookmarkViewMode);
  pageState.bookmarkGrid.addEventListener('pointerdown', handleBookmarkDragPointerDown, true);
  applyBookmarkGridColumns();
  pageState.bookmarksView = NEWTAB_BOOKMARKS_VIEW.createBookmarksView({
    documentObj: document,
    windowObj: window,
    grid: pageState.bookmarkGrid,
    cards: bookmarkCards,
    cardElementCache: bookmarkCardElementCache,
    folderIconsVisible: pageState.bookmarkFolderIconsVisible,
    t,
    formatMessage,
    sanitizeDisplayText,
    getHostFromUrl,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    stableHashCode,
    normalizeHost,
    attachFaviconWithFallbacks,
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyCardTheme: applyBookmarkCardTheme,
    shouldDelayHoverFromRecent: shouldDelayBookmarkHoverFromRecent,
    hoverDelayFromRecentMs: BOOKMARK_HOVER_DELAY_FROM_RECENT_MS,
    shouldSuppressHover: shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    openFolder: openBookmarkFolder,
    openFolderMenu: openBookmarkCascadeMenu,
    copyUrl: copyBookmarkUrl,
    onItemContextMenu: handleBookmarkItemContextMenu,
    isActivationSuppressed: isCardActivationSuppressed,
    navigateToUrl,
    openUrl: (url, options) => openUrlFromNewtabCard(url, { ...options, surface: 'bookmarks' })
  });
  pageState.bookmarkCascadeRuntime = NEWTAB_BOOKMARK_CASCADE_MENU.createBookmarkCascadeMenuRuntime({
    documentObj: document,
    windowObj: window,
    dismissStack,
    positionUtils: NEWTAB_BOOKMARK_CASCADE_POSITION,
    crossSurfaceDrag: NEWTAB_CROSS_SURFACE_DRAG,
    menuSurface: LumnoMenuSurface,
    t,
    sanitizeDisplayText,
    getHostFromUrl,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    getFigmaFolderSvg,
    initFolderPathMorph,
    playFolderPathMorph,
    attachFaviconWithFallbacks,
    getItemIconUrl: (item, anchor) => isShortcutFolderAnchor(anchor) && item.url
      ? getFolderItemIconUrl(item.id, item.url) : '',
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    ensureReady: (forceReload) => bookmarksRuntime.ensureReady(forceReload),
    getItems: (folderId) => {
      return bookmarksRuntime.getFolderItems(folderId);
    },
    navigateToUrl,
    // Folder shortcuts open their bookmarks as shortcuts.
    openUrl: (url, options) => openUrlFromNewtabCard(url, {
      ...options,
      surface: isShortcutFolderAnchor(options && options.anchor) ? 'shortcuts' : 'bookmarks'
    }),
    shouldSuppressHover: shouldSuppressBookmarkHover,
    bindCursorTooltip,
    hideCursorTooltip,
    copyUrl: copyBookmarkUrl,
    copyTooltipController: bookmarkCascadeCopyTooltipController,
    hideTopActionTooltip,
    onItemPointerDown: handleBookmarkCascadeItemPointerDown,
    onItemContextMenu: handleBookmarkItemContextMenu,
    isActivationSuppressed: isCardActivationSuppressed,
    shouldKeepOpenForExternalNode: isBookmarkContextMenuNode,
    getViewportTopPadding: getBookmarkCascadeViewportTopPaddingPx,
    view: NEWTAB_BOOKMARK_CASCADE_VIEW
  });
  pageState.bookmarkTopbarRuntime = NEWTAB_BOOKMARKS_TOPBAR.createBookmarksTopbar({
    documentObj: document,
    windowObj: window,
    grid: pageState.bookmarkGrid,
    modeControl: pageState.bookmarkModeMenu ? pageState.bookmarkModeMenu.control : null,
    managerButton: pageState.bookmarkOpenManagerButton,
    ariaLabel: t('bookmark_view_mode_top', 'Top bookmarks bar'),
    onVisibilityChange: setNewtabTopOccupied
  });
  syncBookmarkTopbarSurfaceAppearance({ updateMenu: false, scheduleTone: false });
  syncBookmarkSurfaceMode();
  pageState.bookmarkRenderSignature = '';
  pageState.sectionDataRevision = 0;
  pageState.bookmarkLoadedOnce = false;

  return {};
}

export { createBookmarkSection };
