(function(root) {
  // How the results area is laid out: the open tabs viewport and its
  // scrollbar gutter, the divider, the offset under an open mode menu,
  // collapsing results, the input's right padding and the tab hint.
  function createResultsLayout(deps) {
    const {
      normalizeSearchResultDisplayLimit,
      SUGGESTION_NAVIGATION,
      setInputScopedStyle,
      SUGGESTIONS_HEIGHT_LAYOUT,
      ensureOverlaySuggestionsView,
      suggestionItems,
      updateSelection
    } = deps;

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    const setOverlayPanelScopedStyle = (element, property, value) => {
      if (!element) {
        return;
      }
      element.style.setProperty(property, value, 'important');
    };
    function readComputedCssPixels(computedStyle, property) {
      if (!computedStyle) {
        return 0;
      }
      const rawValue = property.startsWith('--') &&
          typeof computedStyle.getPropertyValue === 'function'
        ? computedStyle.getPropertyValue(property)
        : computedStyle[property];
      const value = Number.parseFloat(rawValue);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    function syncOpenTabsScrollbarGutter(computedStyle) {
      if (!overlayState.suggestionsContainer.hasAttribute('data-open-tabs-visible-row-limit')) {
        return;
      }
      const style = computedStyle || window.getComputedStyle(overlayState.suggestionsContainer);
      const gutterWidth = Math.max(
        0,
        Math.round(
          (Number(overlayState.suggestionsContainer.offsetWidth) || 0) -
          (Number(overlayState.suggestionsContainer.clientWidth) || 0) -
          readComputedCssPixels(style, 'borderLeftWidth') -
          readComputedCssPixels(style, 'borderRightWidth')
        )
      );
      // Keep the CSS fallback while an async stylesheet has not exposed its
      // native gutter yet. Once it has, give that exact width back to rows.
      if (!gutterWidth) {
        return;
      }
      overlayState.suggestionsContainer.style.setProperty(
        '--x-ov-open-tabs-scrollbar-gutter',
        `${gutterWidth}px`,
        overlayState.inputUsesIsolatedStyles ? '' : 'important'
      );
    }
    function setOpenTabsResultsViewport(active, itemCount) {
      if (!active) {
        overlayState.suggestionsContainer.style.removeProperty('--x-ov-suggestions-max-height');
        overlayState.suggestionsContainer.style.removeProperty('--x-ov-open-tabs-scrollbar-gutter');
        overlayState.suggestionsContainer.removeAttribute('data-open-tabs-visible-row-limit');
        return;
      }
      const visibleRowLimit = normalizeSearchResultDisplayLimit(
        overlayState.overlaySearchResultDisplayLimit
      );
      const normalizedItemCount = Math.max(0, Math.floor(Number(itemCount) || 0));
      // A complete result set should keep its natural height. Only reserve a
      // scrollbar and cap the viewport when there are rows that actually need
      // to scroll; otherwise one opened tab can look clipped by an empty
      // scrollbar gutter.
      if (normalizedItemCount <= visibleRowLimit) {
        overlayState.suggestionsContainer.style.removeProperty('--x-ov-suggestions-max-height');
        overlayState.suggestionsContainer.style.removeProperty('--x-ov-open-tabs-scrollbar-gutter');
        overlayState.suggestionsContainer.removeAttribute('data-open-tabs-visible-row-limit');
        return;
      }
      overlayState.suggestionsContainer.setAttribute(
        'data-open-tabs-visible-row-limit',
        String(visibleRowLimit)
      );
      const computedStyle = window.getComputedStyle(overlayState.suggestionsContainer);
      syncOpenTabsScrollbarGutter(computedStyle);
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          syncOpenTabsScrollbarGutter();
        });
      }
      const maxHeight = SUGGESTION_NAVIGATION.getVisibleRowsViewportHeight({
        visibleRowLimit,
        itemCount,
        rowHeight: readComputedCssPixels(computedStyle, '--x-ov-suggestion-row-height'),
        rowGap: readComputedCssPixels(computedStyle, '--x-ov-suggestion-row-gap'),
        paddingTop: readComputedCssPixels(computedStyle, 'paddingTop'),
        paddingBottom: readComputedCssPixels(computedStyle, 'paddingBottom')
      });
      if (maxHeight > 0) {
        overlayState.suggestionsContainer.style.setProperty(
          '--x-ov-suggestions-max-height',
          `${maxHeight}px`,
          overlayState.inputUsesIsolatedStyles ? '' : 'important'
        );
      } else {
        overlayState.suggestionsContainer.style.removeProperty('--x-ov-suggestions-max-height');
      }
    }

    function setInputDividerVisible(visible) {
      if (!overlayState.inputDivider) {
        return;
      }
      overlayState.inputDivider.setAttribute('data-visible', visible ? 'true' : 'false');
      overlayState.inputDivider.style.setProperty('display', visible ? 'block' : 'none', overlayState.inputUsesIsolatedStyles ? '' : 'important');
    }

    function getSearchModeMenuResultOffset() {
      if (!overlayState.suggestionsContainer ||
          overlayState.suggestionsContainer.getAttribute('data-collapsed') === 'true' ||
          overlayState.suggestionsContainer.getAttribute('aria-hidden') === 'true') {
        return 0;
      }
      const layoutHeight = Math.max(
        0,
        Number(overlayState.suggestionsContainer.offsetHeight) || 0
      );
      if (layoutHeight > 0) {
        return layoutHeight;
      }
      const rect = overlayState.suggestionsContainer.getBoundingClientRect();
      return Math.max(0, Number(rect && rect.height) || 0);
    }

    function syncSearchModeMenuResultOffset() {
      if (!overlayState.inputModeController ||
          typeof overlayState.inputModeController.setModeMenuResultOffset !== 'function') {
        return;
      }
      const fitMaxHeightProperty =
        '--x-ov-suggestions-menu-fit-max-height';
      const resultHeightLimit =
        typeof overlayState.inputModeController.fitModeMenuWithinViewport === 'function'
          ? overlayState.inputModeController.fitModeMenuWithinViewport({ bottomInset: 24 })
          : null;
      if (Number.isFinite(resultHeightLimit)) {
        overlayState.suggestionsContainer.style.setProperty(
          fitMaxHeightProperty,
          `${resultHeightLimit}px`,
          overlayState.inputUsesIsolatedStyles ? '' : 'important'
        );
      } else {
        overlayState.suggestionsContainer.style.removeProperty(fitMaxHeightProperty);
      }
      overlayState.inputModeController.setModeMenuResultOffset(
        getSearchModeMenuResultOffset()
      );
    }

    function setOverlayResultsCollapsed(collapsed, options) {
      const stateOptions = options && typeof options === 'object'
        ? options
        : {};
      const shouldSyncLayout = stateOptions.deferLayoutSync !== true;
      const shouldCollapse = Boolean(collapsed);
      const wasCollapsed = overlayState.suggestionsContainer.getAttribute('data-collapsed') === 'true';
      overlayState.overlay.setAttribute('data-open-tabs-default-collapsed', shouldCollapse ? 'true' : 'false');
      overlayState.suggestionsContainer.setAttribute('data-collapsed', shouldCollapse ? 'true' : 'false');
      overlayState.suggestionsContainer.setAttribute('aria-hidden', shouldCollapse ? 'true' : 'false');
      setOverlayPanelScopedStyle(
        overlayState.overlay,
        'border-radius',
        'var(--x-ov-panel-radius, 26px)'
      );
      setInputScopedStyle(
        overlayState.inputContainer,
        'border-radius',
        shouldCollapse
          ? 'var(--x-ov-content-radius, 25px)'
          : 'var(--x-ov-content-radius, 25px) var(--x-ov-content-radius, 25px) 0 0'
      );
      if (shouldCollapse) {
        SUGGESTIONS_HEIGHT_LAYOUT.applyNaturalSuggestionsHeightLayout(
          overlayState.suggestionsContainer
        );
        overlayState.suggestionsContainer.style.setProperty('max-height', '0px', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('min-height', '0px', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('padding-top', '0px', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('padding-bottom', '0px', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('opacity', '0', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('pointer-events', 'none', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        overlayState.suggestionsContainer.style.setProperty('overflow', 'hidden', overlayState.inputUsesIsolatedStyles ? '' : 'important');
        setInputDividerVisible(false);
        syncSearchModeMenuResultOffset();
        return;
      }
      SUGGESTIONS_HEIGHT_LAYOUT.applyNaturalSuggestionsHeightLayout(
        overlayState.suggestionsContainer
      );
      if (!wasCollapsed) {
        setInputDividerVisible(true);
        if (shouldSyncLayout) {
          syncSearchModeMenuResultOffset();
        }
        return;
      }
      overlayState.suggestionsContainer.style.removeProperty('max-height');
      overlayState.suggestionsContainer.style.removeProperty('min-height');
      overlayState.suggestionsContainer.style.removeProperty('padding-top');
      overlayState.suggestionsContainer.style.removeProperty('padding-bottom');
      overlayState.suggestionsContainer.style.removeProperty('opacity');
      overlayState.suggestionsContainer.style.removeProperty('pointer-events');
      overlayState.suggestionsContainer.style.removeProperty('overflow');
      overlayState.suggestionsContainer.removeAttribute('aria-hidden');
      setInputDividerVisible(true);
      if (shouldSyncLayout) {
        syncSearchModeMenuResultOffset();
      }
    }

    function shouldShowOpenTabsForEmptyQuery() {
      if (overlayState.siteSearchState || overlayState.localSearchScopeState) {
        return false;
      }
      return overlayState.openTabsSearchModeActive ||
        (overlayState.overlayOpenTabsDefaultVisibleLoaded && overlayState.overlayOpenTabsDefaultVisible);
    }

    function clearDefaultOpenTabsSuggestions() {
      ensureOverlaySuggestionsView().clear();
      setOpenTabsResultsViewport(false);
      overlayState.suggestionsContainer.removeAttribute('data-scope-result-enter');
      suggestionItems.length = 0;
      overlayState.currentSuggestions = [];
      overlayState.lastRenderedQuery = '';
      overlayState.lastRenderedActionContextKey = '';
      overlayState.selectedIndex = -1;
      setOverlayResultsCollapsed(true);
      updateSelection();
    }

    function updateInputRightPadding() {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.updateLayout();
      }
    }

    function setSiteSearchTabHint(provider) {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.setTabHintVisible(true, provider);
      }
    }

    function clearSiteSearchTabHint() {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.setTabHintVisible(false);
      }
    }

    return {
      syncOpenTabsScrollbarGutter,
      setOpenTabsResultsViewport,
      syncSearchModeMenuResultOffset,
      setOverlayResultsCollapsed,
      shouldShowOpenTabsForEmptyQuery,
      clearDefaultOpenTabsSuggestions,
      updateInputRightPadding,
      setSiteSearchTabHint,
      clearSiteSearchTabHint
    };
  }

  root.LumnoOverlayPanelResultsLayout = { createResultsLayout };
})(globalThis);
