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
  var LumnoNewtabBookmarksViewReact: ReturnType<typeof createBookmarksViewApi> | undefined;
  var LumnoNewtabFeedbackControlReact: ReturnType<typeof createFeedbackControlApi> | undefined;
  var LumnoNewtabDockReact: ReturnType<typeof createDockApi> | undefined;
  var LumnoNewtabShortcutDialogReact: ReturnType<typeof createShortcutDialogApi> | undefined;
  var LumnoNewtabShortcutsViewReact: ReturnType<typeof createShortcutsViewApi> | undefined;
  var LumnoNewtabRecentSitesViewReact: ReturnType<typeof createRecentSitesViewApi> | undefined;
  var LumnoNewtabSelectMenuReact: ReturnType<typeof createSelectMenuApi> | undefined;
  var LumnoNewtabSuggestionsViewReact: ReturnType<typeof createSuggestionsViewApi> | undefined;
  var LumnoNewtabToastReact: ReturnType<typeof createToastApi> | undefined;
  var LumnoNewtabTopContentReact: ReturnType<typeof createTopContentApi> | undefined;
  var LumnoNewtabWordmarkReact: ReturnType<typeof createTopContentApi> | undefined;
  var LumnoNewtabPageStructureReact: ReturnType<typeof createPageStructureApi> | undefined;
  var LumnoNewtabBookmarksTopbarReact: ReturnType<typeof createBookmarksTopbarApi> | undefined;
  var LumnoNewtabPageNoticeReact: ReturnType<typeof createPageNoticeApi> | undefined;
  var LumnoNewtabBookmarkCascadeViewReact: ReturnType<
      typeof createBookmarkCascadeViewApi
    > | undefined;
  var LumnoNewtabWallpaperViewReact: ReturnType<typeof createWallpaperViewApi> | undefined;
  var LumnoNewtabBookmarkBreadcrumbReact: ReturnType<typeof createBookmarkBreadcrumbApi> | undefined;
  var LumnoSearchInputUIReact: ReturnType<typeof createSearchInputApi> | undefined;
  var LumnoFeatureHintViewReact: ReturnType<typeof createFeatureHintViewApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOverlayTabSwitcherViewReact: ReturnType<typeof createTabSwitcherViewApi> | undefined;
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
  runtime.LumnoNewtabBookmarksViewReact = bookmarksApi;
  runtime.LumnoNewtabBookmarksView = bookmarksApi;
  runtime.LumnoNewtabDockReact = dockApi;
  runtime.LumnoNewtabDock = dockApi;
  runtime.LumnoNewtabFeedbackControlReact = feedbackApi;
  runtime.LumnoNewtabFeedbackControl = feedbackApi;
  runtime.LumnoNewtabShortcutDialogReact = shortcutDialogApi;
  runtime.LumnoNewtabShortcutDialog = shortcutDialogApi;
  runtime.LumnoNewtabRecentHistoryDialog = recentHistoryDialogApi;
  runtime.LumnoNewtabFolderColorPicker = folderColorPickerApi;
  runtime.LumnoNewtabRecentSitesViewReact = recentSitesApi;
  runtime.LumnoNewtabRecentSitesView = recentSitesApi;
  runtime.LumnoNewtabSelectMenuReact = selectMenuApi;
  runtime.LumnoNewtabSelectMenu = selectMenuApi;
  runtime.LumnoNewtabShortcutsViewReact = shortcutsApi;
  runtime.LumnoNewtabShortcutsView = shortcutsApi;
  runtime.LumnoNewtabSuggestionsViewReact = suggestionsApi;
  runtime.LumnoNewtabSuggestionsView = suggestionsApi;
  runtime.LumnoNewtabToastReact = toastApi;
  runtime.LumnoNewtabToast = toastApi;
  runtime.LumnoNewtabTopContentReact = topContentApi;
  runtime.LumnoNewtabTopContent = topContentApi;
  runtime.LumnoNewtabWordmarkReact = topContentApi;
  runtime.LumnoNewtabWordmark = topContentApi;
  runtime.LumnoNewtabPageStructureReact = pageStructureApi;
  runtime.LumnoNewtabPageStructure = pageStructureApi;
  runtime.LumnoNewtabBookmarksTopbarReact = bookmarksTopbarApi;
  runtime.LumnoNewtabBookmarksTopbar = bookmarksTopbarApi;
  runtime.LumnoNewtabPageNoticeReact = pageNoticeApi;
  runtime.LumnoNewtabPageNotice = pageNoticeApi;
  runtime.LumnoNewtabBookmarkCascadeViewReact = bookmarkCascadeViewApi;
  runtime.LumnoNewtabBookmarkCascadeView = bookmarkCascadeViewApi;
  runtime.LumnoNewtabWallpaperViewReact = wallpaperViewApi;
  runtime.LumnoNewtabWallpaperView = wallpaperViewApi;
  runtime.LumnoNewtabBookmarkBreadcrumbReact = bookmarkBreadcrumbApi;
  runtime.LumnoNewtabBookmarkBreadcrumb = bookmarkBreadcrumbApi;
  runtime.LumnoSearchInputUIReact = searchInputApi;
  runtime.LumnoSearchInputUI = searchInputApi;
  runtime.LumnoFeatureHintViewReact = featureHintViewApi;
  runtime.LumnoFeatureHintView = featureHintViewApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoSegmentedIndicator = createSegmentedIndicatorApi();
  runtime.LumnoOverlayTabSwitcherViewReact = tabSwitcherApi;
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
