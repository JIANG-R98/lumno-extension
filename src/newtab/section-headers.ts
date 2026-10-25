// Headings, mode menus, pager labels and breadcrumbs for the bookmark and
// recent-site sections.
import type { StorageAreaLike } from '../domain/storage-port';
import type { BookmarkCascadeActions } from './bookmarks/bookmark-cascade-actions';
import type { BookmarkCascadeRuntime } from './bookmarks/bookmark-cascade-menu';
import type { BookmarkDisplaySettings, BookmarkViewMode } from './bookmarks/bookmark-display-settings';
import type { BookmarkPathEntry } from './bookmarks/bookmarks-store';
import type { Translate } from './newtab-types';
import type { PageLayout } from './page-layout';
import type { createBookmarkBreadcrumbController } from './react/bookmark-breadcrumb';
import type { BookmarksTopbarRuntime } from './react/bookmarks-topbar';
import type { RecentModeSwitch } from './recent/recent-mode-switch';
import type { SectionLoaders } from './section-loaders';
import type { SectionModeSelect } from './section-mode-select';
import type { TooltipBindings } from './tooltip-bindings';
import type { ViewportInsets } from './viewport-insets';

type BookmarkBreadcrumbController = ReturnType<typeof createBookmarkBreadcrumbController>;

interface BookmarkViewModeOptions {
  // Applies only while the view mode is still at this revision.
  expectedRevision?: number;
  // Loads the bookmarks when the mode stays the same but none are loaded yet.
  ensureLoaded?: boolean;
  force?: boolean;
  persist?: boolean;
}

interface BookmarkViewModeResult {
  applied: boolean;
  changed: boolean;
  mode: BookmarkViewMode;
  revision: number;
}

interface SectionHeadersState {
  recentHeading: HTMLElement | null;
  recentModeMenu: Pick<RecentModeSwitch, 'update'> | null;
  currentRecentMode: string;
  bookmarkHeading: HTMLElement | null;
  bookmarkModeMenu: Pick<SectionModeSelect, 'update'> | null;
  bookmarkGrid: HTMLElement | null;
  bookmarkCascadeRuntime: Pick<BookmarkCascadeRuntime, 'positionLevels' | 'isOpen'> | null;
  bookmarkTopbarRuntime: Pick<BookmarksTopbarRuntime, 'activate' | 'deactivate' | 'setVisible' | 'element'> | null;
  bookmarkBreadcrumbController: Pick<BookmarkBreadcrumbController, 'render'> | null;
  bookmarkPagerPrevButton: HTMLElement | null;
  bookmarkPagerNextButton: HTMLElement | null;
  bookmarkOpenManagerButton: HTMLElement | null;
  currentBookmarkViewMode: BookmarkViewMode;
  bookmarkViewModeRevision: number;
  bookmarkCurrentFolderId: string;
  bookmarkRootFolderId: string;
  bookmarkFolderPath: BookmarkPathEntry[];
  bookmarkCanNavigateRoot: boolean;
  bookmarkCurrentPage: number;
  bookmarkRenderSignature: string;
  bookmarkLoadedOnce: boolean;
  currentBookmarkCount: number;
  zenModeEnabled: boolean;
}

interface SectionHeadersDeps extends
  Pick<PageLayout, 'normalizeRecentMode' | 'updateSearchEntryLayout' | 'setContentSectionVisible'>,
  Pick<BookmarkDisplaySettings, 'normalizeBookmarkViewMode' | 'persistBookmarkViewMode'>,
  Pick<BookmarkCascadeActions, 'closeBookmarkCascadeMenu'>,
  Pick<TooltipBindings, 'showTopActionTooltip' | 'hideTopActionTooltip'>,
  Pick<ViewportInsets, 'getNewtabVisualViewportInsets'> {
  t: Translate;
  markRecentDataDirty: SectionLoaders['markRecentDataDirty'];
  loadRecentSites: SectionLoaders['loadRecentSites'];
  markBookmarkDataDirty: SectionLoaders['markBookmarkDataDirty'];
  loadBookmarks: SectionLoaders['loadBookmarks'];
  storageArea: StorageAreaLike | null;
  RECENT_MODE_STORAGE_KEY: string;
  BOOKMARK_TOPBAR_HEIGHT_PX: number;
  bookmarkSection: HTMLElement | null;
  bookmarkCards: readonly HTMLElement[];
  pageState: SectionHeadersState;
}

function createSectionHeaders(deps: SectionHeadersDeps) {
  const {
    t,
    normalizeRecentMode,
    storageArea,
    RECENT_MODE_STORAGE_KEY,
    markRecentDataDirty,
    loadRecentSites,
    getNewtabVisualViewportInsets,
    BOOKMARK_TOPBAR_HEIGHT_PX,
    updateSearchEntryLayout,
    setContentSectionVisible,
    bookmarkSection,
    bookmarkCards,
    normalizeBookmarkViewMode,
    markBookmarkDataDirty,
    loadBookmarks,
    closeBookmarkCascadeMenu,
    persistBookmarkViewMode,
    showTopActionTooltip,
    hideTopActionTooltip
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const NEWTAB_FLOATING_TOP_GAP_PX = 12;
  const BOOKMARK_CASCADE_TOPBAR_GAP_PX = 4;
  // Matches the floating bar's 8px top offset and 40px height in styles/bookmarks-topbar.css.
  const BOOKMARK_TOPBAR_FLOATING_OCCUPIED_PX = 48;

  function updateRecentHeading(): void {
    if (!pageState.recentHeading) {
      return;
    }
    const key = pageState.currentRecentMode === 'most' ? 'recent_heading_most' : 'recent_heading_latest';
    const fallback = pageState.currentRecentMode === 'most' ? 'Most visited' : 'Recent visits';
    pageState.recentHeading.textContent = t(key, fallback);
  }

  function updateRecentModeMenu(): void {
    if (pageState.recentModeMenu) {
      pageState.recentModeMenu.update();
    }
  }

  function setRecentMode(nextMode: unknown): void {
    const mode = normalizeRecentMode(nextMode, 'latest');
    if (pageState.currentRecentMode === mode) {
      updateRecentModeMenu();
      return;
    }
    pageState.currentRecentMode = mode;
    updateRecentHeading();
    updateRecentModeMenu();
    if (storageArea) {
      void storageArea.set({ [RECENT_MODE_STORAGE_KEY]: mode });
    }
    markRecentDataDirty();
    void loadRecentSites({ force: true });
  }

  function canDismissRecentCard(): boolean {
    return true;
  }

  function updateBookmarkHeading(): void {
    if (!pageState.bookmarkHeading) {
      return;
    }
    pageState.bookmarkHeading.textContent = t('bookmarks_heading', '书签');
  }

  function isBookmarkTopbarMode(): boolean {
    return pageState.currentBookmarkViewMode === 'top';
  }

  function getNewtabTopOccupiedInsetPx(): number {
    const visualViewportTopInset = getNewtabVisualViewportInsets().top;
    const body = document.body;
    const bookmarkTopbarInset = body && body.getAttribute('data-nt-top-occupied') === 'true'
      ? (body.getAttribute('data-nt-top-layout') === 'floating'
        ? BOOKMARK_TOPBAR_FLOATING_OCCUPIED_PX
        : BOOKMARK_TOPBAR_HEIGHT_PX)
      : 0;
    return visualViewportTopInset + bookmarkTopbarInset;
  }

  function getNewtabViewportTopPaddingPx(): number {
    return getNewtabTopOccupiedInsetPx() + Math.min(8, NEWTAB_FLOATING_TOP_GAP_PX);
  }

  function getBookmarkCascadeViewportTopPaddingPx(): number {
    const occupiedTopInset = getNewtabTopOccupiedInsetPx();
    return occupiedTopInset > 0
      ? occupiedTopInset + BOOKMARK_CASCADE_TOPBAR_GAP_PX
      : 8;
  }

  function setNewtabTopOccupied(occupied: unknown): void {
    if (!document.body) {
      return;
    }
    const nextValue = occupied === true ? 'true' : 'false';
    if (document.body.getAttribute('data-nt-top-occupied') === nextValue) {
      return;
    }
    document.body.setAttribute('data-nt-top-occupied', nextValue);
    refreshTopOccupiedLayout();
  }

  function setNewtabTopLayout(layout: unknown): void {
    if (!document.body) {
      return;
    }
    const nextValue = layout === 'floating' ? 'floating' : 'docked';
    if (document.body.getAttribute('data-nt-top-layout') === nextValue) {
      return;
    }
    document.body.setAttribute('data-nt-top-layout', nextValue);
    if (document.body.getAttribute('data-nt-top-occupied') === 'true') {
      refreshTopOccupiedLayout();
    }
  }

  function refreshTopOccupiedLayout(): void {
    updateSearchEntryLayout();
    if (pageState.bookmarkCascadeRuntime && pageState.bookmarkCascadeRuntime.isOpen()) {
      pageState.bookmarkCascadeRuntime.positionLevels();
    }
  }

  function syncBookmarkSurfaceMode(): void {
    if (!pageState.bookmarkTopbarRuntime) {
      return;
    }
    if (isBookmarkTopbarMode()) {
      pageState.bookmarkTopbarRuntime.activate();
      setContentSectionVisible(bookmarkSection, false);
      pageState.bookmarkTopbarRuntime.setVisible(
        bookmarkCards.length > 0 && pageState.currentBookmarkCount > 0
      );
    } else {
      pageState.bookmarkTopbarRuntime.deactivate();
      setContentSectionVisible(
        bookmarkSection,
        bookmarkCards.length > 0 && pageState.currentBookmarkCount > 0
      );
    }
  }

  function setBookmarkSurfaceVisible(visible: unknown): void {
    const nextVisible = visible === true;
    if (isBookmarkTopbarMode()) {
      setContentSectionVisible(bookmarkSection, false);
      if (pageState.bookmarkTopbarRuntime) {
        pageState.bookmarkTopbarRuntime.setVisible(nextVisible && !pageState.zenModeEnabled);
      }
      return;
    }
    if (pageState.bookmarkTopbarRuntime) {
      pageState.bookmarkTopbarRuntime.setVisible(false);
    }
    setContentSectionVisible(bookmarkSection, nextVisible);
  }

  function updateBookmarkModeMenu(): void {
    if (pageState.bookmarkModeMenu) {
      pageState.bookmarkModeMenu.update();
    }
    if (pageState.bookmarkGrid) {
      pageState.bookmarkGrid.setAttribute('data-view-mode', pageState.currentBookmarkViewMode);
    }
    if (document.body) {
      document.body.setAttribute('data-bookmark-view-mode', pageState.currentBookmarkViewMode);
    }
    syncBookmarkSurfaceMode();
  }

  function applyBookmarkViewMode(
    nextMode: unknown,
    options?: BookmarkViewModeOptions | null
  ): BookmarkViewModeResult {
    const config: BookmarkViewModeOptions = options && typeof options === 'object' ? options : {};
    if (Object.prototype.hasOwnProperty.call(config, 'expectedRevision') &&
        config.expectedRevision !== pageState.bookmarkViewModeRevision) {
      return {
        applied: false,
        changed: false,
        mode: pageState.currentBookmarkViewMode,
        revision: pageState.bookmarkViewModeRevision
      };
    }
    const mode = normalizeBookmarkViewMode(nextMode);
    const changed = pageState.currentBookmarkViewMode !== mode;
    if (!changed) {
      updateBookmarkModeMenu();
      if (config.ensureLoaded === true && !pageState.bookmarkLoadedOnce) {
        pageState.bookmarkCurrentPage = 0;
        pageState.bookmarkRenderSignature = '';
        markBookmarkDataDirty();
        void loadBookmarks(config.force === true ? { force: true } : undefined);
      }
      return {
        applied: true,
        changed: false,
        mode,
        revision: pageState.bookmarkViewModeRevision
      };
    }
    closeBookmarkCascadeMenu();
    pageState.currentBookmarkViewMode = mode;
    pageState.bookmarkViewModeRevision += 1;
    if (mode === 'top') {
      pageState.bookmarkCurrentFolderId = pageState.bookmarkRootFolderId;
    }
    pageState.bookmarkCurrentPage = 0;
    pageState.bookmarkRenderSignature = '';
    updateBookmarkModeMenu();
    if (config.persist === true) {
      persistBookmarkViewMode(mode);
    }
    markBookmarkDataDirty();
    void loadBookmarks(config.force === true ? { force: true } : undefined);
    return {
      applied: true,
      changed: true,
      mode,
      revision: pageState.bookmarkViewModeRevision
    };
  }

  function setBookmarkViewMode(nextMode: unknown): BookmarkViewModeResult {
    return applyBookmarkViewMode(nextMode, {
      persist: true,
      force: true
    });
  }

  function navigateBookmarkFolder(targetId: unknown): void {
    const id = String(targetId || '').trim();
    if (!id) {
      return;
    }
    closeBookmarkCascadeMenu();
    pageState.bookmarkCurrentFolderId = id;
    pageState.bookmarkCurrentPage = 0;
    pageState.bookmarkRenderSignature = '';
    void loadBookmarks({ force: true });
  }

  function updateBookmarkHeadingRootLinkState(isNested: boolean): void {
    if (!pageState.bookmarkHeading) {
      return;
    }
    const nested = !!isNested;
    const rootLabel = t('bookmarks_heading', '书签');
    pageState.bookmarkHeading.setAttribute('data-bookmark-drop-folder-id', String(pageState.bookmarkRootFolderId || '1'));
    pageState.bookmarkHeading.setAttribute('data-bookmark-drop-folder-title', rootLabel);
    pageState.bookmarkHeading.classList.toggle('x-nt-bookmarks-heading--link', nested);
    pageState.bookmarkCanNavigateRoot = nested;
    if (nested) {
      pageState.bookmarkHeading.setAttribute('role', 'button');
      pageState.bookmarkHeading.setAttribute('tabindex', '0');
      pageState.bookmarkHeading.setAttribute('aria-label', rootLabel);
      pageState.bookmarkHeading.title = rootLabel;
    } else {
      pageState.bookmarkHeading.removeAttribute('role');
      pageState.bookmarkHeading.removeAttribute('tabindex');
      pageState.bookmarkHeading.removeAttribute('aria-label');
      pageState.bookmarkHeading.removeAttribute('data-bookmark-drop-target');
      pageState.bookmarkHeading.title = '';
    }
  }

  function updateBookmarkPagerLabels(): void {
    if (pageState.bookmarkPagerPrevButton) {
      const prevLabel = t('bookmarks_page_prev', '上一页');
      pageState.bookmarkPagerPrevButton.setAttribute('aria-label', prevLabel);
      pageState.bookmarkPagerPrevButton.setAttribute('data-tooltip', prevLabel);
      pageState.bookmarkPagerPrevButton.removeAttribute('title');
    }
    if (pageState.bookmarkPagerNextButton) {
      const nextLabel = t('bookmarks_page_next', '下一页');
      pageState.bookmarkPagerNextButton.setAttribute('aria-label', nextLabel);
      pageState.bookmarkPagerNextButton.setAttribute('data-tooltip', nextLabel);
      pageState.bookmarkPagerNextButton.removeAttribute('title');
    }
    if (pageState.bookmarkOpenManagerButton) {
      const managerLabel = t('bookmarks_open_manager', '打开书签管理页');
      pageState.bookmarkOpenManagerButton.setAttribute('aria-label', managerLabel);
      pageState.bookmarkOpenManagerButton.setAttribute('data-tooltip', managerLabel);
      pageState.bookmarkOpenManagerButton.removeAttribute('title');
    }
  }

  function bindBookmarkPagerTooltip(button: HTMLElement | null, getLabel: () => string): void {
    if (!button || typeof getLabel !== 'function') {
      return;
    }
    const showTooltip = () => {
      const label = String(getLabel() || '').trim();
      if (!label) {
        return;
      }
      const inTopbar = Boolean(
        pageState.bookmarkTopbarRuntime &&
        pageState.bookmarkTopbarRuntime.element &&
        pageState.bookmarkTopbarRuntime.element.contains(button)
      );
      showTopActionTooltip(button, label, { placement: inTopbar ? 'bottom' : 'top' });
    };
    button.addEventListener('pointerenter', showTooltip);
    button.addEventListener('pointerleave', hideTopActionTooltip);
    button.addEventListener('focus', showTooltip);
    button.addEventListener('blur', hideTopActionTooltip);
  }

  function updateBookmarkBreadcrumb(): void {
    if (!pageState.bookmarkBreadcrumbController) {
      return;
    }
    const path = Array.isArray(pageState.bookmarkFolderPath) ? pageState.bookmarkFolderPath : [];
    if (path.length <= 1) {
      pageState.bookmarkBreadcrumbController.render({ items: [] });
      updateBookmarkHeadingRootLinkState(false);
      return;
    }
    updateBookmarkHeadingRootLinkState(true);
    pageState.bookmarkBreadcrumbController.render({
      items: path.slice(1).map((crumb) => {
      const title = String(crumb && crumb.title ? crumb.title : '').trim() || t('bookmarks_heading', '书签');
        return {
          id: String(crumb && crumb.id ? crumb.id : ''),
          title
        };
      })
    });
  }

  return {
    updateRecentHeading,
    updateRecentModeMenu,
    setRecentMode,
    canDismissRecentCard,
    updateBookmarkHeading,
    isBookmarkTopbarMode,
    getNewtabTopOccupiedInsetPx,
    getNewtabViewportTopPaddingPx,
    getBookmarkCascadeViewportTopPaddingPx,
    setNewtabTopOccupied,
    setNewtabTopLayout,
    syncBookmarkSurfaceMode,
    setBookmarkSurfaceVisible,
    updateBookmarkModeMenu,
    applyBookmarkViewMode,
    setBookmarkViewMode,
    navigateBookmarkFolder,
    updateBookmarkPagerLabels,
    bindBookmarkPagerTooltip,
    updateBookmarkBreadcrumb
  };
}

type SectionHeaders = ReturnType<typeof createSectionHeaders>;

export { createSectionHeaders };
export type { BookmarkViewModeOptions, BookmarkViewModeResult, SectionHeaders, SectionHeadersDeps, SectionHeadersState };
