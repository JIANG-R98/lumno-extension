// Builds the bookmark section: its heading, breadcrumb, view mode select,
// pager buttons and grid, then the bookmark view, the cascade menu runtime
// and the top bar runtime that render into it.
import * as LumnoMenuSurface from '../../shared/ui/menu-surface';
import type { TooltipController } from '../../shared/ui/tooltip';
import type * as CrossSurfaceDrag from '../cross-surface-drag';
import type { DismissStack } from '../dismiss-stack';
import type { BindCursorTooltip, FormatMessage, Translate } from '../newtab-types';
import type { BookmarkCardElement, BookmarksViewController, BookmarksViewOptions } from '../react/bookmarks';
import type { createBookmarksTopbarApi } from '../react/bookmarks-topbar';
import type { BookmarksTopbarRuntime } from '../react/bookmarks-topbar';
import type { createBookmarkBreadcrumbController } from '../react/bookmark-breadcrumb';
import type { PageStructureRuntime } from '../react/page-structure';
import type { SectionModeOptionSource, SectionModeSelect, SectionModeSelectConfig } from '../section-mode-select';
import * as NEWTAB_BOOKMARK_CASCADE_MENU from './bookmark-cascade-menu';
import type { BookmarkCascadeRuntime, CascadeItemEventDetail } from './bookmark-cascade-menu';
import * as NEWTAB_BOOKMARK_CASCADE_POSITION from './bookmark-cascade-position';
import type { PointLike } from './bookmark-cascade-position';
import type { BookmarkItemContextMenuEvent } from './bookmark-context-menu';
import type * as FolderIcon from './bookmark-folder-icon';
import type { BookmarksRuntime } from './bookmarks-runtime';

type ViewOption<K extends keyof BookmarksViewOptions> = NonNullable<BookmarksViewOptions[K]>;

// The bookmarks heading, which leads back to the bookmarks bar from a folder.
type BookmarkBreadcrumbController = ReturnType<typeof createBookmarkBreadcrumbController>;

interface BookmarkSectionState {
  bookmarkTitleWrap: HTMLElement | null;
  bookmarkHeading: HTMLElement | null;
  // Whether the heading leads back to the bookmarks bar.
  bookmarkCanNavigateRoot: boolean;
  bookmarkBreadcrumbController: BookmarkBreadcrumbController | null;
  bookmarkModeMenu: SectionModeSelect | null;
  currentBookmarkViewMode: string;
  bookmarkPagerPrevButton: HTMLElement | null;
  bookmarkPagerNextButton: HTMLElement | null;
  bookmarkOpenManagerButton: HTMLElement | null;
  bookmarkGrid: HTMLElement | null;
  bookmarkFolderIconsVisible: boolean;
  bookmarksView: BookmarksViewController | null;
  bookmarkCascadeRuntime: BookmarkCascadeRuntime | null;
  bookmarkTopbarRuntime: BookmarksTopbarRuntime | null;
  bookmarkRootFolderId: string;
  bookmarkRenderSignature: string;
  sectionDataRevision: number;
  bookmarkLoadedOnce: boolean;
}

interface BookmarkSectionDeps {
  setContentSectionVisible(section: HTMLElement | null, visible: boolean): void;
  bookmarkSection: HTMLElement | null;
  pageStructureRuntime: PageStructureRuntime;
  updateBookmarkHeading(): void;
  navigateBookmarkFolder(folderId: string): void;
  createSectionModeSelect(config: SectionModeSelectConfig): SectionModeSelect | null;
  setBookmarkViewMode(mode: string): void;
  handleBookmarkModeMenuAction(action: string): void;
  getBookmarkViewModeOptions(): SectionModeOptionSource[];
  bindBookmarkPagerTooltip(button: HTMLElement | null, getLabel: () => string): void;
  t: Translate;
  updateBookmarkPagerLabels(): void;
  updateBookmarkBreadcrumb(): void;
  handleBookmarkDragPointerDown(event: PointerEvent): void;
  applyBookmarkGridColumns(): void;
  bookmarkCards: BookmarkCardElement[];
  formatMessage: FormatMessage;
  sanitizeDisplayText(value: unknown): string;
  getHostFromUrl(url: string): string;
  getSiteDisplayName(host: string, title?: string): string;
  getUrlDisplay(url: string): string;
  getRiSvg(icon: string, className?: string): string;
  getFigmaFolderSvg: typeof FolderIcon.getFigmaFolderSvg;
  initFolderPathMorph: typeof FolderIcon.initFolderPathMorph;
  playFolderPathMorph: typeof FolderIcon.playFolderPathMorph;
  stableHashCode: ViewOption<'stableHashCode'>;
  normalizeHost(host: string): string;
  attachFaviconWithFallbacks(
    image: HTMLImageElement,
    url: string,
    host: string,
    candidates?: { primaryUrl?: string; browserUrl?: string }
  ): void;
  isLocalNetworkHost(host: string): boolean;
  getChromeFaviconUrl(url: string): string;
  getBrowserPageFaviconUrl(url: string): string;
  getImmediateThemeForSuggestion: ViewOption<'getImmediateThemeForSuggestion'>;
  queueThemeForTarget: ViewOption<'queueThemeForTarget'>;
  applyBookmarkCardTheme: ViewOption<'applyCardTheme'>;
  shouldDelayBookmarkHoverFromRecent: ViewOption<'shouldDelayHoverFromRecent'>;
  shouldSuppressBookmarkHover(target: Element, event?: Event | PointLike | null): boolean;
  bindCursorTooltip: BindCursorTooltip;
  hideCursorTooltip(): void;
  openBookmarkFolder: ViewOption<'openFolder'>;
  openBookmarkCascadeMenu: ViewOption<'openFolderMenu'>;
  copyBookmarkUrl: ViewOption<'copyUrl'>;
  handleBookmarkItemContextMenu(payload: BookmarkItemContextMenuEvent): void;
  isCardActivationSuppressed(): boolean;
  navigateToUrl(url?: string): void;
  openUrlFromNewtabCard(
    url: string | undefined,
    options: { openInBackgroundTab?: boolean; anchor?: HTMLElement | null; surface: string }
  ): unknown;
  dismissStack: DismissStack;
  NEWTAB_CROSS_SURFACE_DRAG: typeof CrossSurfaceDrag;
  isShortcutFolderAnchor(anchor: HTMLElement | null | undefined): boolean;
  getFolderItemIconUrl(bookmarkId: string, url: string): string;
  bookmarksRuntime: BookmarksRuntime;
  bookmarkCascadeCopyTooltipController: TooltipController;
  hideTopActionTooltip(): void;
  handleBookmarkCascadeItemPointerDown(detail: CascadeItemEventDetail<PointerEvent>): void;
  isBookmarkContextMenuNode(node: EventTarget | null): boolean;
  getBookmarkCascadeViewportTopPaddingPx(): number;
  NEWTAB_BOOKMARKS_TOPBAR: Pick<ReturnType<typeof createBookmarksTopbarApi>, 'createBookmarksTopbar'>;
  setNewtabTopOccupied(occupied: boolean): void;
  syncBookmarkTopbarSurfaceAppearance(options?: { updateMenu?: boolean; scheduleTone?: boolean }): unknown;
  syncBookmarkSurfaceMode(): void;
  pageState: BookmarkSectionState;
}

function createBookmarkSection(deps: BookmarkSectionDeps) {
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

  // Set by the New Tab's React islands entry, which loads first.
  const NEWTAB_BOOKMARKS_VIEW = globalThis.LumnoNewtabBookmarksView;
  const NEWTAB_BOOKMARK_CASCADE_VIEW =
    globalThis.LumnoNewtabBookmarkCascadeView;
  const NEWTAB_BOOKMARK_BREADCRUMB =
    globalThis.LumnoNewtabBookmarkBreadcrumb;
  if (!NEWTAB_BOOKMARKS_VIEW || !NEWTAB_BOOKMARK_CASCADE_VIEW || !NEWTAB_BOOKMARK_BREADCRUMB) {
    return {};
  }
  const bookmarkCardElementCache = new Map<string, BookmarkCardElement>();
  const BOOKMARK_HOVER_DELAY_FROM_RECENT_MS = 56;

  setContentSectionVisible(bookmarkSection, false);
  pageState.bookmarkTitleWrap = pageStructureRuntime.bookmark.titleWrap;
  const bookmarkHeading = pageStructureRuntime.bookmark.heading;
  pageState.bookmarkHeading = bookmarkHeading;
  updateBookmarkHeading();
  const bookmarkBreadcrumb = pageStructureRuntime.bookmark.breadcrumb;
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
  const previousButton = pageStructureRuntime.bookmark.previousButton;
  const nextButton = pageStructureRuntime.bookmark.nextButton;
  const managerButton = pageStructureRuntime.bookmark.managerButton;
  pageState.bookmarkPagerPrevButton = previousButton;
  pageState.bookmarkPagerNextButton = nextButton;
  pageState.bookmarkOpenManagerButton = managerButton;
  bindBookmarkPagerTooltip(
    previousButton,
    () => previousButton.getAttribute('data-tooltip') || t('bookmarks_page_prev', '上一页')
  );
  bindBookmarkPagerTooltip(
    nextButton,
    () => nextButton.getAttribute('data-tooltip') || t('bookmarks_page_next', '下一页')
  );
  bindBookmarkPagerTooltip(
    managerButton,
    () => managerButton.getAttribute('data-tooltip') || t('bookmarks_open_manager', '打开书签管理页')
  );
  if (pageState.bookmarkModeMenu) {
    bookmarkPager.appendChild(pageState.bookmarkModeMenu.control);
  }
  bookmarkHeading.addEventListener('click', () => {
    if (!pageState.bookmarkCanNavigateRoot) {
      return;
    }
    navigateBookmarkFolder(pageState.bookmarkRootFolderId);
  });
  bookmarkHeading.addEventListener('keydown', (event) => {
    if (!pageState.bookmarkCanNavigateRoot) {
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
  const bookmarkGrid = pageStructureRuntime.bookmark.grid;
  pageState.bookmarkGrid = bookmarkGrid;
  bookmarkGrid.setAttribute('data-view-mode', pageState.currentBookmarkViewMode);
  bookmarkGrid.addEventListener('pointerdown', handleBookmarkDragPointerDown, true);
  applyBookmarkGridColumns();
  pageState.bookmarksView = NEWTAB_BOOKMARKS_VIEW.createBookmarksView({
    documentObj: document,
    windowObj: window,
    grid: bookmarkGrid,
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
    grid: bookmarkGrid,
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
