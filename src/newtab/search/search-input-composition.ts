// IME composition in the search input: holds suggestion updates while a
// composition is open and runs them once it commits.
function createSearchInputComposition(deps) {
  const {
    directNavigationSettleController,
    imeKeyGuard,
    clearAutocomplete,
    clearSearchSuggestions,
    getDirectUrlSuggestion,
    renderPendingSuggestions,
    requestSuggestions
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  pageState.inputParts.input.addEventListener('compositionstart', function(event) {
    pageState.suggestionRequestSeq += 1;
    directNavigationSettleController.cancel();
    if (pageState.remoteSuggestionDebounceTimer) {
      clearTimeout(pageState.remoteSuggestionDebounceTimer);
      pageState.remoteSuggestionDebounceTimer = null;
    }
    if (pageState.suggestionRequestWatchdogTimer) {
      clearTimeout(pageState.suggestionRequestWatchdogTimer);
      pageState.suggestionRequestWatchdogTimer = null;
    }
    imeKeyGuard.markCompositionStart(event);
    clearAutocomplete();
  });

  pageState.inputParts.input.addEventListener('keyup', imeKeyGuard.markKeyUp, true);

  pageState.inputParts.input.addEventListener('compositionend', function(event) {
    imeKeyGuard.markCompositionEnd(event);
    const rawValue = event.target.value;
    const query = rawValue.trim();
    pageState.latestQuery = query;
    pageState.latestRawQuery = rawValue;
    clearAutocomplete();
    if (!query) {
      if (pageState.remoteSuggestionDebounceTimer) {
        clearTimeout(pageState.remoteSuggestionDebounceTimer);
        pageState.remoteSuggestionDebounceTimer = null;
      }
      clearSearchSuggestions();
      return;
    }
    const directUrlSuggestion = getDirectUrlSuggestion(query);
    if (directUrlSuggestion) {
      const hasCachedOpenTabMatch =
        typeof directUrlSuggestion._xMatchedTabId === 'number';
      if (hasCachedOpenTabMatch) {
        renderPendingSuggestions(query);
      }
      requestSuggestions(query, {
        immediate: true,
        deferInitialDirectNavigationRender: !hasCachedOpenTabMatch
      });
      return;
    }
    requestSuggestions(query);
  });

  return {};
}

export { createSearchInputComposition };
