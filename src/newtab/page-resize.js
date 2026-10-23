// Window resizes: re-measures the layout once per frame, and once more
// after the resize settles, without animating the blocks.
function createPageResize(deps) {
  const {
    getBookmarkLimit,
    applyNewtabWidthMode,
    applyNewtabShortcutColumns,
    shouldAnimateNewtabLayoutShift,
    captureRecentCardLayout,
    applyRecentGridColumns,
    applyBookmarkGridColumns,
    updateSiteSearchPrefixLayout,
    keepBookmarkPageAnchorAfterLimitChange,
    renderCurrentBookmarkPage,
    updateBookmarkGridHeightLock,
    updateBookmarkSectionPosition,
    positionBookmarkCascadeLevels,
    updateSuggestionsFloatingLayout,
    cancelRecentResizeLayoutAnimations,
    renderRecentSites,
    animateRecentResizeLayout,
    scheduleNewtabReadyAfterViewportSettle
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const NEWTAB_RESIZE_DENSITY_SETTLE_MS = 140;

  let newtabResizeFrame = 0;
  let newtabResizeSettleTimer = 0;
  function handleNewtabResize() {
    newtabResizeFrame = 0;
    const previousBookmarkLimit = getBookmarkLimit();
    applyNewtabWidthMode();
    applyNewtabShortcutColumns();
    const recentLayoutBefore = pageState.recentLoadedOnce && shouldAnimateNewtabLayoutShift()
      ? captureRecentCardLayout()
      : null;
    const recentColumnsChanged = applyRecentGridColumns();
    const bookmarkColumnsChanged = applyBookmarkGridColumns();
    updateSiteSearchPrefixLayout();
    if (bookmarkColumnsChanged && pageState.bookmarkLoadedOnce) {
      keepBookmarkPageAnchorAfterLimitChange(previousBookmarkLimit);
      renderCurrentBookmarkPage();
    }
    updateBookmarkGridHeightLock();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    positionBookmarkCascadeLevels();
    updateSuggestionsFloatingLayout();
    if (recentColumnsChanged && pageState.recentLoadedOnce) {
      cancelRecentResizeLayoutAnimations();
      renderRecentSites(pageState.recentSourceItems);
      animateRecentResizeLayout(recentLayoutBefore);
    }
  }

  window.addEventListener('resize', () => {
    pageState.newtabReadyViewportRevision += 1;
    pageState.newtabResizeLayoutLocked = true;
    if (newtabResizeSettleTimer) {
      window.clearTimeout(newtabResizeSettleTimer);
    }
    // Releasing the lock re-centers the search box; layout motion eases it
    // there from where the resize held it.
    newtabResizeSettleTimer = window.setTimeout(() => {
      newtabResizeSettleTimer = 0;
      pageState.newtabResizeLayoutLocked = false;
      updateBookmarkSectionPosition();
    }, NEWTAB_RESIZE_DENSITY_SETTLE_MS);
    if (pageState.newtabReadyRequested &&
        document.body &&
        document.body.getAttribute('data-nt-ready') !== '1') {
      scheduleNewtabReadyAfterViewportSettle();
    }
    if (newtabResizeFrame) {
      return;
    }
    newtabResizeFrame = window.requestAnimationFrame(handleNewtabResize);
  }, { passive: true });

  return {};
}

export { createPageResize };
