// @ts-nocheck
// Remote search suggestions: requesting them from the background and
// merging late responses into what is shown.
function createRemoteSuggestions(deps) {
  const {
    updateSearchSuggestions,
    isSlashCommandInput,
    getDirectUrlSuggestion
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  const OVERLAY_FIRST_RESULT_REVEAL_DELAY_MS = 120;

  function updatePendingSearchSuggestions(query) {
    if (overlayState.suggestionsContainer.getAttribute('data-collapsed') === 'true' ||
        overlayState.suggestionsContainer.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    updateSearchSuggestions(overlayState.lastSuggestionResponse, query);
    return true;
  }

  function requestOverlaySearchSuggestions(query) {
    const requestQuery = String(query || '').trim();
    const requestLocalSearchScope = overlayState.localSearchScopeState;
    if (!requestLocalSearchScope && isSlashCommandInput(requestQuery)) {
      updateSearchSuggestions([], requestQuery);
      return;
    }
    if (overlayState.siteSearchState && requestQuery) {
      updateSearchSuggestions([], requestQuery);
      return;
    }
    if (!requestQuery || !chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    const requestSeq = ++overlayState.overlaySuggestionRequestSeq;
    const requestStartedAt = Date.now();
    const requestSearchFirst = overlayState.overlaySearchResultPriorityMode === 'search';
    const showExactSearchPendingState = requestSearchFirst &&
      !requestLocalSearchScope &&
      !getDirectUrlSuggestion(requestQuery);
    const remoteMixState = { settled: false };
    if (overlayState.overlayRemoteSuggestionDebounceTimer) {
      clearTimeout(overlayState.overlayRemoteSuggestionDebounceTimer);
      overlayState.overlayRemoteSuggestionDebounceTimer = null;
    }
    if (overlayState.overlayFirstResultRevealTimer) {
      clearTimeout(overlayState.overlayFirstResultRevealTimer);
      overlayState.overlayFirstResultRevealTimer = null;
    }
    if (showExactSearchPendingState) {
      updateSearchSuggestions([], requestQuery, { remoteMixState });
    }
    chrome.runtime.sendMessage({
      action: 'getSearchSuggestions',
      query: requestQuery,
      context: 'overlay',
      sourceTypes: requestLocalSearchScope ? [requestLocalSearchScope.sourceType] : undefined,
      includeOpenTabs: requestLocalSearchScope ? false : undefined
    }, function(response) {
      if (requestSeq !== overlayState.overlaySuggestionRequestSeq || requestQuery !== overlayState.latestOverlayQuery) {
        return;
      }
      if (chrome.runtime && chrome.runtime.lastError) {
        updatePendingSearchSuggestions(requestQuery);
        return;
      }
      const localSuggestions = response && Array.isArray(response.suggestions) ? response.suggestions : [];
      if (requestLocalSearchScope) {
        remoteMixState.settled = true;
        updateSearchSuggestions(localSuggestions, requestQuery);
        return;
      }
      // Search-first already shows the exact search action while remote
      // suggestions are pending. Autocomplete-first keeps its short mix
      // budget so a collapsed result surface still opens only once.
      const waitForFirstResultMix = !requestSearchFirst &&
        overlayState.suggestionsContainer.getAttribute('data-collapsed') === 'true';
      if (waitForFirstResultMix) {
        overlayState.overlayFirstResultRevealTimer = setTimeout(() => {
          overlayState.overlayFirstResultRevealTimer = null;
          if (requestSeq !== overlayState.overlaySuggestionRequestSeq ||
              requestQuery !== overlayState.latestOverlayQuery ||
              remoteMixState.visualSettled) {
            return;
          }
          remoteMixState.visualSettled = true;
          updateSearchSuggestions(localSuggestions, requestQuery, {
            remoteMixState,
            finalRemoteMix: true
          });
        }, OVERLAY_FIRST_RESULT_REVEAL_DELAY_MS);
      } else if (!showExactSearchPendingState) {
        updateSearchSuggestions(localSuggestions, requestQuery, {
          remoteMixState
        });
      }
      const remoteDelay = (requestSearchFirst || waitForFirstResultMix)
        ? 0
        : Math.max(0, 120 - (Date.now() - requestStartedAt));
      overlayState.overlayRemoteSuggestionDebounceTimer = setTimeout(function() {
        overlayState.overlayRemoteSuggestionDebounceTimer = null;
        if (requestSeq !== overlayState.overlaySuggestionRequestSeq || requestQuery !== overlayState.latestOverlayQuery) {
          return;
        }
        chrome.runtime.sendMessage({
          action: 'getSearchEngineSuggestions',
          query: requestQuery,
          context: 'overlay',
          localSuggestions: localSuggestions,
          searchFirst: requestSearchFirst
        }, function(remoteResponse) {
          if (requestSeq !== overlayState.overlaySuggestionRequestSeq || requestQuery !== overlayState.latestOverlayQuery) {
            return;
          }
          if (chrome.runtime && chrome.runtime.lastError) {
            remoteMixState.settled = true;
            if (waitForFirstResultMix && !remoteMixState.visualSettled) {
              clearTimeout(overlayState.overlayFirstResultRevealTimer);
              overlayState.overlayFirstResultRevealTimer = null;
              remoteMixState.visualSettled = true;
              updateSearchSuggestions(localSuggestions, requestQuery, {
                remoteMixState,
                finalRemoteMix: true
              });
            } else {
              updateSearchSuggestions(localSuggestions, requestQuery, {
                remoteMixState,
                finalRemoteMix: true
              });
            }
            return;
          }
          if (!remoteResponse ||
              remoteResponse.aborted === true ||
              remoteResponse.hasRemoteSuggestions !== true ||
              !Array.isArray(remoteResponse.suggestions)) {
            remoteMixState.settled = true;
            if (waitForFirstResultMix && !remoteMixState.visualSettled) {
              clearTimeout(overlayState.overlayFirstResultRevealTimer);
              overlayState.overlayFirstResultRevealTimer = null;
              remoteMixState.visualSettled = true;
              updateSearchSuggestions(localSuggestions, requestQuery, {
                remoteMixState,
                finalRemoteMix: true
              });
            } else {
              updateSearchSuggestions(localSuggestions, requestQuery, {
                remoteMixState,
                finalRemoteMix: true
              });
            }
            return;
          }
          remoteMixState.settled = true;
          if (waitForFirstResultMix) {
            if (remoteMixState.visualSettled) {
              return;
            }
            clearTimeout(overlayState.overlayFirstResultRevealTimer);
            overlayState.overlayFirstResultRevealTimer = null;
            remoteMixState.visualSettled = true;
            updateSearchSuggestions(remoteResponse.suggestions, requestQuery, {
              remoteMixState,
              finalRemoteMix: true
            });
            return;
          }
          updateSearchSuggestions(remoteResponse.suggestions, requestQuery, {
            remoteMixState,
            finalRemoteMix: true
          });
        });
      }, remoteDelay);
    });
  }

  return {
    updatePendingSearchSuggestions,
    requestOverlaySearchSuggestions
  };
}

export { createRemoteSuggestions };
