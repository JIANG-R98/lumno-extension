// Builds the recent section: its pointer tracking, heading and mode
// switch, grid and the recent sites view.
import * as NEWTAB_RECENT_MODE_SWITCH from './recent-mode-switch';

function createRecentSection(deps) {
  const {
    setContentSectionVisible,
    hideTopActionTooltip,
    pageStructureRuntime,
    updateRecentHeading,
    t,
    setRecentMode,
    applyRecentGridColumns,
    recentCards,
    formatMessage,
    sanitizeDisplayText,
    getOwnExtensionPageDisplay,
    getHostFromUrl,
    getCanonicalPageUrlForFavicon,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    attachFaviconWithFallbacks,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyRecentCardTheme,
    getRecentLimit,
    isRecentSitePinned,
    MAX_PINNED_RECENT_SITES,
    updateRecentPinButton,
    showToast,
    showTopActionTooltip,
    navigateToUrl,
    bindCursorTooltip,
    hideCursorTooltip,
    openUrlFromNewtabCard,
    togglePinnedRecentSite,
    handleRecentCardContextMenu,
    isCardActivationSuppressed,
    getRecentProgressState,
    toggleRecentProgressTracking
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const NEWTAB_RECENT_VIEW = globalThis.LumnoNewtabRecentSitesView;

  setContentSectionVisible(pageState.recentSection, false);
  pageState.recentSection.addEventListener('pointerenter', (event) => {
    if (!event || event.pointerType !== 'mouse') {
      return;
    }
    pageState.recentMouseInsideSection = true;
    pageState.recentMouseLeftAt = 0;
  });
  pageState.recentSection.addEventListener('pointerleave', (event) => {
    if (!event || event.pointerType !== 'mouse') {
      return;
    }
    pageState.recentMouseInsideSection = false;
    pageState.recentMouseLeftAt = Date.now();
    hideTopActionTooltip();
  });
  pageState.recentSection.addEventListener('pointercancel', () => {
    pageState.recentMouseInsideSection = false;
    hideTopActionTooltip();
  });
  pageState.recentHeader = pageStructureRuntime.recent.header;
  pageState.recentHeading = pageStructureRuntime.recent.heading;
  updateRecentHeading();
  pageState.recentModeMenu = NEWTAB_RECENT_MODE_SWITCH.createRecentModeSwitch({
    documentObj: document,
    windowObj: window,
    t,
    getValue: () => pageState.currentRecentMode,
    onChange: (nextMode) => {
      setRecentMode(nextMode);
    },
    options: [
      {
        value: 'latest',
        labelKey: 'recent_heading_latest',
        fallback: 'Recent visits'
      },
      {
        value: 'most',
        labelKey: 'recent_heading_most',
        fallback: 'Most visited'
      }
    ]
  });
  pageState.recentGrid = pageStructureRuntime.recent.grid;
  applyRecentGridColumns();
  pageState.recentSitesView = NEWTAB_RECENT_VIEW.createRecentSitesView({
    documentObj: document,
    windowObj: window,
    grid: pageState.recentGrid,
    cards: recentCards,
    t,
    formatMessage,
    sanitizeDisplayText,
    getOwnExtensionPageDisplay,
    getHostFromUrl,
    getCanonicalPageUrlForFavicon,
    getSiteDisplayName,
    getUrlDisplay,
    getRiSvg,
    attachFaviconWithFallbacks,
    getBrowserPageFaviconUrl,
    getImmediateThemeForSuggestion,
    queueThemeForTarget,
    applyCardTheme: applyRecentCardTheme,
    getCurrentRecentCount: () => getRecentLimit(),
    isPinned: isRecentSitePinned,
    getPinnedCount: () => pageState.pinnedRecentSites.length,
    getMaxPinnedCount: () => MAX_PINNED_RECENT_SITES,
    updatePinButton: updateRecentPinButton,
    showToast,
    showTopActionTooltip,
    hideTopActionTooltip,
    navigateToUrl,
    bindCursorTooltip,
    hideCursorTooltip,
    openUrl: (url, options) => openUrlFromNewtabCard(url, { ...options, surface: 'recentSites' }),
    togglePinned: togglePinnedRecentSite,
    onItemContextMenu: handleRecentCardContextMenu,
    isActivationSuppressed: isCardActivationSuppressed,
    onCardPointerDown: (payload) => {
      if (pageState.recentCardDragRuntime) pageState.recentCardDragRuntime.handleRecentCardPointerDown(payload);
    },
    getProgressState: getRecentProgressState,
    toggleProgressTracking: toggleRecentProgressTracking
  });
  // The mode switch shows the current heading, so it stands in for the plain heading.
  pageState.recentHeading.hidden = true;
  pageState.recentHeader.appendChild(pageState.recentModeMenu.control);
  pageState.recentRenderSignature = '';
  pageState.recentLoadedOnce = false;

  return {};
}

export { createRecentSection };
