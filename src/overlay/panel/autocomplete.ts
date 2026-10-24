// @ts-nocheck
// Inline autocomplete: the candidate for what is typed (domains, prefixes,
// suggestions), showing it in the input and dismissing it.
function createAutocomplete(deps) {
  const {
    getUrlDisplay,
    isEnglishQuery,
    getKeywordSearchSuggestionState
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function getAutocompleteCandidate(allSuggestions, rawQuery) {
    if (!Array.isArray(allSuggestions) || !rawQuery) {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    const passes = [true, false];
    for (let passIndex = 0; passIndex < passes.length; passIndex += 1) {
      const skipGoogleSuggest = passes[passIndex];
      for (let i = 0; i < allSuggestions.length; i += 1) {
        const suggestion = allSuggestions[i];
        if (!suggestion || suggestion.type === 'newtab') {
          continue;
        }
        if (skipGoogleSuggest && suggestion.type === 'googleSuggest') {
          continue;
        }
        if (suggestion.commandText) {
          const commandText = String(suggestion.commandText).toLowerCase();
          if (commandText.startsWith(rawLower)) {
            return {
              completion: suggestion.commandText,
              url: '',
              title: suggestion.title || '',
              type: 'command'
            };
          }
          const aliases = Array.isArray(suggestion.commandAliases) ? suggestion.commandAliases : [];
          for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
            const alias = String(aliases[aliasIndex] || '').toLowerCase();
            if (alias && alias.startsWith(rawLower)) {
              return {
                completion: aliases[aliasIndex],
                url: '',
                title: suggestion.title || '',
                type: 'command'
              };
            }
          }
        }
        const urlText = getUrlDisplay(suggestion.url);
        if (urlText && urlText.toLowerCase().startsWith(rawLower)) {
          return {
            completion: urlText,
            url: suggestion.url || '',
            title: suggestion.title || '',
            type: 'url'
          };
        }
        const titleText = suggestion.title || '';
        if (titleText && titleText.toLowerCase().startsWith(rawLower)) {
          return {
            completion: titleText,
            url: suggestion.url || '',
            title: suggestion.title || '',
            type: 'title'
          };
        }
      }
    }
    return null;
  }

  function getDomainPrefixCandidate(allSuggestions, rawQuery) {
    if (!Array.isArray(allSuggestions) || !rawQuery) {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    for (let i = 0; i < allSuggestions.length; i += 1) {
      const suggestion = allSuggestions[i];
      if (!suggestion || suggestion.type === 'newtab') {
        continue;
      }
      const urlText = getUrlDisplay(suggestion.url);
      if (!urlText) {
        continue;
      }
      const host = urlText.split('/')[0] || '';
      if (host.toLowerCase().startsWith(rawLower)) {
        return {
          completion: urlText,
          url: suggestion.url || '',
          title: suggestion.title || '',
          type: 'url'
        };
      }
    }
    return null;
  }

  function getAutocompleteCandidateFromSuggestion(suggestion, rawQuery) {
    if (!suggestion || !rawQuery || suggestion.type === 'newtab') {
      return null;
    }
    const rawLower = rawQuery.toLowerCase();
    if (suggestion.commandText) {
      const commandText = String(suggestion.commandText).toLowerCase();
      if (commandText.startsWith(rawLower)) {
        return {
          completion: suggestion.commandText,
          url: '',
          title: suggestion.title || '',
          type: 'command'
        };
      }
      const aliases = Array.isArray(suggestion.commandAliases) ? suggestion.commandAliases : [];
      for (let aliasIndex = 0; aliasIndex < aliases.length; aliasIndex += 1) {
        const alias = String(aliases[aliasIndex] || '');
        if (alias.toLowerCase().startsWith(rawLower)) {
          return {
            completion: alias,
            url: '',
            title: suggestion.title || '',
            type: 'command'
          };
        }
      }
    }
    const urlText = getUrlDisplay(suggestion.url);
    if (urlText) {
      const host = urlText.split('/')[0] || '';
      if (host.toLowerCase().startsWith(rawLower) || urlText.toLowerCase().startsWith(rawLower)) {
        return {
          completion: urlText,
          url: suggestion.url || '',
          title: suggestion.title || '',
          type: 'url'
        };
      }
    }
    const titleText = suggestion.title || '';
    if (titleText && titleText.toLowerCase().startsWith(rawLower)) {
      return {
        completion: titleText,
        url: suggestion.url || '',
        title: suggestion.title || '',
        type: 'title'
      };
    }
    return null;
  }

  function clearAutocomplete() {
    overlayState.autocompleteState = null;
  }

  function dismissAutocompletePreviewOnNonTabKey(event) {
    if (!event || event.key === 'Tab' || event.key === 'Enter') {
      return false;
    }
    const isModifierOnly = event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta';
    if (isModifierOnly) {
      return false;
    }
    if (!overlayState.autocompleteState || !overlayState.autocompleteState.completion) {
      return false;
    }
    const rawQuery = typeof overlayState.autocompleteState.rawQuery === 'string'
      ? overlayState.autocompleteState.rawQuery
      : String(overlayState.latestRawInputValue || '');
    if (overlayState.searchInput && overlayState.searchInput.value !== rawQuery) {
      overlayState.searchInput.value = rawQuery;
      overlayState.searchInput.setSelectionRange(rawQuery.length, rawQuery.length);
    }
    overlayState.latestRawInputValue = rawQuery;
    overlayState.latestOverlayQuery = rawQuery.trim();
    clearAutocomplete();
    return true;
  }

  function applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason) {
    const rawQuery = overlayState.latestRawInputValue;
    const trimmedQuery = rawQuery.trim();
    if (overlayState.overlaySearchResultPriorityMode === 'search') {
      if (overlayState.searchInput && overlayState.searchInput.value !== rawQuery) {
        overlayState.searchInput.value = rawQuery;
        overlayState.searchInput.setSelectionRange(rawQuery.length, rawQuery.length);
      }
      clearAutocomplete();
      return;
    }
    if (Date.now() - overlayState.lastDeletionAt < 250) {
      clearAutocomplete();
      return;
    }
    if (overlayState.siteSearchState || overlayState.localSearchScopeState) {
      clearAutocomplete();
      return;
    }
    if (!isEnglishQuery(trimmedQuery) || !rawQuery) {
      clearAutocomplete();
      return;
    }
    if (!allSuggestions || !Array.isArray(allSuggestions)) {
      clearAutocomplete();
      return;
    }
    if (overlayState.searchInput.selectionStart !== overlayState.searchInput.value.length || overlayState.searchInput.selectionEnd !== overlayState.searchInput.value.length) {
      return;
    }
    const shouldForcePrimaryAlignment = Boolean(
      primarySuggestion &&
      primaryHighlightReason &&
      primaryHighlightReason !== 'autocomplete' &&
      primaryHighlightReason !== 'default'
    );
    let candidate = null;
    if (primarySuggestion) {
      candidate = getAutocompleteCandidateFromSuggestion(primarySuggestion, rawQuery);
    }
    if (!candidate && shouldForcePrimaryAlignment) {
      clearAutocomplete();
      return;
    }
    if (!candidate) {
      const autocompleteSuggestions = getKeywordSearchSuggestionState(allSuggestions).autocompleteSuggestions;
      candidate = getDomainPrefixCandidate(autocompleteSuggestions, rawQuery) ||
        getAutocompleteCandidate(autocompleteSuggestions, rawQuery);
    }
    if (!candidate || !candidate.completion) {
      clearAutocomplete();
      return;
    }
    if (candidate.type === 'title') {
      clearAutocomplete();
      return;
    }
    if (candidate.completion.length <= rawQuery.length) {
      clearAutocomplete();
      return;
    }
    if (!candidate.completion.toLowerCase().startsWith(rawQuery.toLowerCase())) {
      clearAutocomplete();
      return;
    }
    // The typed part stays as typed: "4A" completes to "4Anet.com", not
    // the candidate's own "4anet.com".
    const displayText = rawQuery + candidate.completion.slice(rawQuery.length);
    overlayState.searchInput.value = displayText;
    overlayState.searchInput.setSelectionRange(rawQuery.length, displayText.length);
    overlayState.autocompleteState = {
      completion: displayText,
      displayText: displayText,
      url: candidate.url || '',
      rawQuery: rawQuery,
      title: candidate.title || '',
      type: candidate.type || ''
    };
  }

  return {
    getAutocompleteCandidate,
    clearAutocomplete,
    dismissAutocompletePreviewOnNonTabKey,
    applyAutocomplete
  };
}

export { createAutocomplete };
