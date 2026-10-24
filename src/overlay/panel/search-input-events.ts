// @ts-nocheck
// Input events in the search box: reading the live value, the trigger
// hint, IME composition and the main input handler.
function createSearchInputEvents(deps) {
  const {
    applyNoTranslate,
    clearSiteSearchTabHint,
    isSlashCommandInput,
    getSearchTriggerProviders,
    getInlineSiteSearchCandidate,
    getSiteSearchTriggerCandidate,
    setSiteSearchTabHint,
    getLocalSearchScopeCandidate,
    getLocalSearchScopeTabHintProvider,
    cancelPendingOverlaySuggestionRequests,
    clearAutocomplete,
    notifyOverlayLoadingSession,
    updateModeBadge,
    updateSelection,
    updateSearchSuggestions,
    renderCachedTabsOrRequest,
    getDirectUrlSuggestion,
    updatePendingSearchSuggestions,
    requestOverlaySearchSuggestions,
    clearSearchSuggestions
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  const handledSearchInputEvents = new WeakSet();

  function openDocumentPipPickerFromOverlay() {
    chrome.runtime.sendMessage({ action: 'openDocumentPipPicker' });
  }

  function getLiveSearchInputFromEvent(event) {
    const target = event && event.target && event.target.tagName
      ? event.target
      : null;
    if (target &&
        String(target.tagName || '').toLowerCase() === 'input' &&
        overlayState.inputContainer &&
        typeof overlayState.inputContainer.contains === 'function' &&
        overlayState.inputContainer.contains(target)) {
      return target;
    }
    if (overlayState.inputContainer && typeof overlayState.inputContainer.querySelector === 'function') {
      const currentInput = overlayState.inputContainer.querySelector('#_x_extension_search_input_2024_unique_') ||
        overlayState.inputContainer.querySelector('input');
      if (currentInput) {
        return currentInput;
      }
    }
    return overlayState.searchInput;
  }

  function syncLiveSearchInputFromEvent(event) {
    const liveInput = getLiveSearchInputFromEvent(event);
    if (liveInput && liveInput !== overlayState.searchInput) {
      overlayState.searchInput = liveInput;
      applyNoTranslate(overlayState.searchInput);
    }
    return overlayState.searchInput;
  }

  function runSearchInputEventOnce(event, handler) {
    if (event) {
      if (handledSearchInputEvents.has(event)) {
        return;
      }
      handledSearchInputEvents.add(event);
    }
    handler(event);
  }

  function clearPendingSearchTriggerHint() {
    overlayState.siteSearchTriggerState = null;
    overlayState.localSearchScopeTriggerState = null;
    clearSiteSearchTabHint();
  }

  function syncSearchTriggerHintFromInput(rawValue) {
    const triggerInput = String(rawValue || '').trim();
    if (!triggerInput ||
        overlayState.siteSearchState ||
        overlayState.localSearchScopeState ||
        overlayState.openTabsSearchModeActive ||
        isSlashCommandInput(triggerInput)) {
      clearPendingSearchTriggerHint();
      return;
    }

    const siteProviders = (overlayState.siteSearchProvidersCache && overlayState.siteSearchProvidersCache.length > 0)
      ? overlayState.siteSearchProvidersCache
      : overlayState.defaultSiteSearchProviders;
    const providers = getSearchTriggerProviders(
      siteProviders,
      overlayState.aggregateSearchesCache
    );
    if (getInlineSiteSearchCandidate(triggerInput, providers)) {
      clearPendingSearchTriggerHint();
      return;
    }

    // Resolve every exact configured key, name, alias, domain, or local-scope
    // trigger synchronously so its matching Tab hint does not wait for the
    // asynchronous suggestion request to finish.
    const provider = getSiteSearchTriggerCandidate(triggerInput, providers, null);
    if (provider) {
      overlayState.siteSearchTriggerState = { provider, rawInput: triggerInput };
      overlayState.localSearchScopeTriggerState = null;
      setSiteSearchTabHint(provider);
      return;
    }

    const shortcutRules = window._x_extension_shortcut_rules_2024_unique_;
    const localScope = getLocalSearchScopeCandidate(triggerInput, shortcutRules);
    if (localScope) {
      overlayState.siteSearchTriggerState = null;
      overlayState.localSearchScopeTriggerState = { scope: localScope, rawInput: triggerInput };
      setSiteSearchTabHint(getLocalSearchScopeTabHintProvider(localScope));
      return;
    }

    clearPendingSearchTriggerHint();
  }

  // Add input event for search suggestions
  function handleSearchInputCompositionStart(event) {
    runSearchInputEventOnce(event, () => {
      cancelPendingOverlaySuggestionRequests();
      syncLiveSearchInputFromEvent(event);
      overlayState.imeKeyGuard.markCompositionStart(event);
      clearAutocomplete();
      clearPendingSearchTriggerHint();
    });
  }

  function handleSearchInputCompositionEnd(event) {
    runSearchInputEventOnce(event, () => {
      overlayState.imeKeyGuard.markCompositionEnd(event);
      const liveInput = syncLiveSearchInputFromEvent(event);
      notifyOverlayLoadingSession(liveInput);
      const rawValue = liveInput ? (liveInput.value || '') : '';
      const query = rawValue.trim();
      updateModeBadge(rawValue);
      if (overlayState.selectedIndex >= 0) {
        overlayState.selectedIndex = -1;
        updateSelection();
      }
      overlayState.latestOverlayQuery = query;
      overlayState.latestRawInputValue = rawValue;
      clearAutocomplete();
      syncSearchTriggerHintFromInput(rawValue);
      if (query.length > 0) {
        if (!overlayState.localSearchScopeState && isSlashCommandInput(query)) {
          updateSearchSuggestions([], query);
          return;
        }
        if (overlayState.openTabsSearchModeActive) {
          renderCachedTabsOrRequest(query);
          return;
        }
        if (getDirectUrlSuggestion(query)) {
          updatePendingSearchSuggestions(query);
        }
        requestOverlaySearchSuggestions(query);
      } else {
        if (overlayState.openTabsSearchModeActive) {
          renderCachedTabsOrRequest('');
          return;
        }
        clearSearchSuggestions();
      }
    });
  }

  function handleSearchInputEvent(event) {
    runSearchInputEventOnce(event, () => {
      if (overlayState.inputHistoryController && !overlayState.isApplyingSearchInputHistory) {
        overlayState.inputHistoryController.resetNavigation();
      }
      const liveInput = syncLiveSearchInputFromEvent(event);
      notifyOverlayLoadingSession(liveInput);
      const rawValue = liveInput ? liveInput.value : '';
      const query = rawValue.trim();
      if (query &&
          overlayState.overlayEngagementNoticeController &&
          typeof overlayState.overlayEngagementNoticeController.recordMeaningfulUse === 'function') {
        overlayState.overlayEngagementNoticeController.recordMeaningfulUse();
      }
      updateModeBadge(rawValue);
      const inputType = event && event.inputType;
      const isPaste = inputType === 'insertFromPaste';
      const isDelete = inputType && inputType.startsWith('delete');
      if (isDelete) {
        overlayState.lastDeletionAt = Date.now();
      }
      if (overlayState.imeKeyGuard.isComposing()) {
        overlayState.latestRawInputValue = rawValue;
        overlayState.latestOverlayQuery = query;
        return;
      }
      if (overlayState.selectedIndex >= 0) {
        overlayState.selectedIndex = -1;
        updateSelection();
      }
      if (!query && overlayState.siteSearchState) {
        overlayState.latestOverlayQuery = '';
        overlayState.latestRawInputValue = '';
        clearAutocomplete();
        clearSearchSuggestions();
        return;
      }
      overlayState.latestOverlayQuery = query;
      overlayState.latestRawInputValue = rawValue;
      clearAutocomplete();
      syncSearchTriggerHintFromInput(rawValue);
      if (query.length > 0) {
        if (!overlayState.localSearchScopeState && isSlashCommandInput(query)) {
          updateSearchSuggestions([], query);
          return;
        }
        if (overlayState.openTabsSearchModeActive) {
          renderCachedTabsOrRequest(query);
          return;
        }
        if (isPaste || getDirectUrlSuggestion(query)) {
          updatePendingSearchSuggestions(query);
        }
        requestOverlaySearchSuggestions(query);
      } else {
        if (overlayState.openTabsSearchModeActive) {
          renderCachedTabsOrRequest('');
          return;
        }
        // Clear suggestions and show tabs
        clearSearchSuggestions();
      }
    });
  }

  return {
    openDocumentPipPickerFromOverlay,
    syncLiveSearchInputFromEvent,
    syncSearchTriggerHintFromInput,
    handleSearchInputCompositionStart,
    handleSearchInputCompositionEnd,
    handleSearchInputEvent
  };
}

export { createSearchInputEvents };
