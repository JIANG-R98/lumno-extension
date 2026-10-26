import { createQuoteLineViewApi } from './quote-line';
import { createBookmarksViewApi } from './bookmarks';
import { createSegmentedIndicatorApi } from '../../shared/react/segmented-indicator';
import { createDockApi } from './dock';
import { createFeedbackControlApi } from './feedback';
import { createRecentSitesViewApi } from './recent-sites';
import { createSelectMenuApi } from './select-menu';
import { createShortcutDialogApi } from './shortcut-dialog-lazy';
import { createRecentHistoryDialogApi } from './recent-history-dialog-lazy';
import { createFolderColorPickerApi } from './folder-color-picker-lazy';
import { createShortcutsViewApi } from './shortcuts';
import { createSuggestionsViewApi } from '../../shared/react/search/suggestions';
import { createToastApi } from './toast';
import { createTopContentApi } from './wordmark';
import { createPageStructureApi } from './page-structure';
import { createBookmarksTopbarApi } from './bookmarks-topbar';
import { createLiquidSurfaces } from './liquid-glass';
import { createPageNoticeApi } from './page-notice';
import { createBookmarkCascadeViewApi } from './bookmark-cascade-view';
import { createWallpaperViewApi } from './wallpaper-view';
import { createBookmarkBreadcrumbApi } from './bookmark-breadcrumb';
import { createSearchInputApi } from '../../shared/react/search-input';
import { createFeatureHintViewApi } from '../../shared/react/feature-hint-view';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';
import { createTabSwitcherViewApi } from '../../shared/react/tab-switcher';

declare global {
  var LumnoNewtabReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoNewtabReactIslands: {
      bookmarks: ReturnType<typeof createBookmarksViewApi>;
      dock: ReturnType<typeof createDockApi>;
      feedback: ReturnType<typeof createFeedbackControlApi>;
      shortcutDialog: ReturnType<typeof createShortcutDialogApi>;
      recentHistoryDialog: ReturnType<typeof createRecentHistoryDialogApi>;
      recentSites: ReturnType<typeof createRecentSitesViewApi>;
      searchInput: ReturnType<typeof createSearchInputApi>;
      selectMenu: ReturnType<typeof createSelectMenuApi>;
      shortcuts: ReturnType<typeof createShortcutsViewApi>;
      suggestions: ReturnType<typeof createSuggestionsViewApi>;
      toast: ReturnType<typeof createToastApi>;
      topContent: ReturnType<typeof createTopContentApi>;
      wordmark: ReturnType<typeof createTopContentApi>;
      pageStructure: ReturnType<typeof createPageStructureApi>;
      bookmarksTopbar: ReturnType<typeof createBookmarksTopbarApi>;
      pageNotice: ReturnType<typeof createPageNoticeApi>;
      bookmarkCascadeView: ReturnType<typeof createBookmarkCascadeViewApi>;
      wallpaperView: ReturnType<typeof createWallpaperViewApi>;
      bookmarkBreadcrumb: ReturnType<typeof createBookmarkBreadcrumbApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoNewtabReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const bookmarksApi = createBookmarksViewApi();
  const dockApi = createDockApi();
  const feedbackApi = createFeedbackControlApi();
  const shortcutDialogApi = createShortcutDialogApi();
  const recentHistoryDialogApi = createRecentHistoryDialogApi();
  const folderColorPickerApi = createFolderColorPickerApi();
  const recentSitesApi = createRecentSitesViewApi();
  const selectMenuApi = createSelectMenuApi();
  const shortcutsApi = createShortcutsViewApi();
  const suggestionsApi = createSuggestionsViewApi();
  const toastApi = createToastApi();
  const topContentApi = createTopContentApi();
  const pageStructureApi = createPageStructureApi();
  const bookmarksTopbarApi = createBookmarksTopbarApi();
  const pageNoticeApi = createPageNoticeApi();
  const bookmarkCascadeViewApi = createBookmarkCascadeViewApi();
  const wallpaperViewApi = createWallpaperViewApi();
  const bookmarkBreadcrumbApi = createBookmarkBreadcrumbApi();
  const searchInputApi = createSearchInputApi();
  const featureHintViewApi = createFeatureHintViewApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoNewtabLiquidSurfaces = { create: createLiquidSurfaces };
  runtime.LumnoNewtabBookmarksView = bookmarksApi;
  runtime.LumnoNewtabDock = dockApi;
  runtime.LumnoNewtabFeedbackControl = feedbackApi;
  runtime.LumnoNewtabShortcutDialog = shortcutDialogApi;
  runtime.LumnoNewtabRecentHistoryDialog = recentHistoryDialogApi;
  runtime.LumnoNewtabFolderColorPicker = folderColorPickerApi;
  runtime.LumnoNewtabRecentSitesView = recentSitesApi;
  runtime.LumnoNewtabSelectMenu = selectMenuApi;
  runtime.LumnoNewtabShortcutsView = shortcutsApi;
  runtime.LumnoNewtabSuggestionsView = suggestionsApi;
  runtime.LumnoNewtabToast = toastApi;
  runtime.LumnoNewtabTopContent = topContentApi;
  runtime.LumnoNewtabWordmark = topContentApi;
  runtime.LumnoNewtabPageStructure = pageStructureApi;
  runtime.LumnoNewtabBookmarksTopbar = bookmarksTopbarApi;
  runtime.LumnoNewtabPageNotice = pageNoticeApi;
  runtime.LumnoNewtabBookmarkCascadeView = bookmarkCascadeViewApi;
  runtime.LumnoNewtabWallpaperView = wallpaperViewApi;
  runtime.LumnoNewtabBookmarkBreadcrumb = bookmarkBreadcrumbApi;
  runtime.LumnoNewtabQuoteLine = createQuoteLineViewApi();
  runtime.LumnoSearchInputUI = searchInputApi;
  runtime.LumnoFeatureHintView = featureHintViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoSegmentedIndicator = createSegmentedIndicatorApi();
  runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
  runtime._x_extension_createSearchInput_2024_unique_ =
    searchInputApi.createSearchInput;
  runtime.LumnoNewtabReactIslands = Object.freeze({
    bookmarks: bookmarksApi,
    dock: dockApi,
    feedback: feedbackApi,
    shortcutDialog: shortcutDialogApi,
    recentHistoryDialog: recentHistoryDialogApi,
    recentSites: recentSitesApi,
    searchInput: searchInputApi,
    selectMenu: selectMenuApi,
    shortcuts: shortcutsApi,
    suggestions: suggestionsApi,
    toast: toastApi,
    topContent: topContentApi,
    wordmark: topContentApi,
    pageStructure: pageStructureApi,
    bookmarksTopbar: bookmarksTopbarApi,
    pageNotice: pageNoticeApi,
    bookmarkCascadeView: bookmarkCascadeViewApi,
    wallpaperView: wallpaperViewApi,
    bookmarkBreadcrumb: bookmarkBreadcrumbApi,
    tabSwitcher: tabSwitcherApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
