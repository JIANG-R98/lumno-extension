(function(root) {
  // Where the suggestion list sits: shown or hidden, floating under the
  // search box, and offset below an open search mode menu.
  function createSuggestionsLayout(deps) {
    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    function getSearchModeMenuResultOffset() {
      if (!pageState.suggestionsContainer ||
          pageState.suggestionsContainer.getAttribute('data-visible') !== 'true') {
        return 0;
      }
      const layoutHeight = Math.max(
        0,
        Number(pageState.suggestionsContainer.offsetHeight) || 0
      );
      if (layoutHeight > 0) {
        return layoutHeight;
      }
      const rect = pageState.suggestionsContainer.getBoundingClientRect();
      return Math.max(0, Number(rect && rect.height) || 0);
    }

    function syncSearchModeMenuResultOffset() {
      if (!pageState.inputModeController ||
          typeof pageState.inputModeController.setModeMenuResultOffset !== 'function') {
        return;
      }
      const fitMaxHeightProperty =
        '--x-nt-suggestions-menu-fit-max-height';
      const resultHeightLimit =
        typeof pageState.inputModeController.fitModeMenuWithinViewport === 'function'
          ? pageState.inputModeController.fitModeMenuWithinViewport({ bottomInset: 24 })
          : null;
      if (Number.isFinite(resultHeightLimit)) {
        pageState.suggestionsContainer.style.setProperty(
          fitMaxHeightProperty,
          `${resultHeightLimit}px`
        );
      } else {
        pageState.suggestionsContainer.style.removeProperty(fitMaxHeightProperty);
      }
      pageState.inputModeController.setModeMenuResultOffset(
        getSearchModeMenuResultOffset()
      );
    }

    function setSuggestionsVisible(visible) {
      // The open list is placed from the search box's drawn position, so the
      // box lands first.
      if (visible && pageState.layoutMotion) {
        pageState.layoutMotion.cancelAll();
      }
      if (pageState.layoutController && typeof pageState.layoutController.setSuggestionsVisible === 'function') {
        pageState.layoutController.setSuggestionsVisible(visible);
      }
      syncSearchModeMenuResultOffset();
    }

    function updateSuggestionsFloatingLayout() {
      if (pageState.layoutController && typeof pageState.layoutController.updateSuggestionsFloatingLayout === 'function') {
        pageState.layoutController.updateSuggestionsFloatingLayout();
      }
    }

    return {
      syncSearchModeMenuResultOffset,
      setSuggestionsVisible,
      updateSuggestionsFloatingLayout
    };
  }

  root.LumnoNewtabSuggestionsLayout = { createSuggestionsLayout };
})(globalThis);
