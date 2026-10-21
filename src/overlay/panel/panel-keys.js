(function(root) {
  // Keys inside the panel: Tab into modes and autocomplete, the input's
  // keydown, and navigating, opening and deleting results.
  function createPanelKeys(deps) {
    const {
      cancelPendingOpenTabsPrefixEntry,
      openSearchModeMenuFromDoubleTab,
      activateOpenTabsSearchMode,
      activateSiteSearch,
      activateLocalSearchScope,
      getSearchTriggerProviders,
      getTopSiteMatchCandidate,
      getSiteSearchTriggerCandidate,
      getLocalSearchScopeCandidate,
      getSiteSearchProviders,
      getAggregateSearches,
      getShortcutRules,
      syncSuggestionActionModifiersFromEvent,
      clearSiteSearch,
      clearLocalSearchScope,
      requestOverlaySearchSuggestions,
      clearSearchSuggestions,
      clearOpenTabsSearchMode,
      isImeCompositionEvent,
      SEARCH_INPUT_HISTORY,
      dismissAutocompletePreviewOnNonTabKey,
      suggestionItems,
      SUGGESTION_NAVIGATION,
      numberShortcutOptions,
      removeOverlay,
      updateSelection,
      scrollSelectedSuggestionIntoView,
      getCommandMatch,
      applyThemeModeChange,
      getNextThemeMode,
      openDocumentPipPickerFromOverlay,
      isModeCommand,
      openOverlayCommunityQrDialog,
      openSiteSearchProviderQuery,
      finishOverlayResultActivation,
      openMatchedTabSuggestion,
      shouldOpenSearchResultInBackgroundTab,
      recordSearchSuggestionSelectionFromSuggestion,
      getSearchResultCreateDisposition,
      isSlashCommandInput,
      updateSearchSuggestions,
      isAggregateSearchProvider,
      getSearchResultNewTabDisposition,
      resolveQuickNavigation
    } = deps;

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    function handleTabKey(e) {
      if (!e || e.defaultPrevented) {
        return false;
      }
      if (overlayState.inputModeController &&
          typeof overlayState.inputModeController.handleModeMenuTabFocusToggle === 'function' &&
          overlayState.inputModeController.handleModeMenuTabFocusToggle(e)) {
        return true;
      }
      if (overlayState.inputModeController &&
          typeof overlayState.inputModeController.shouldCompleteModeMenuDoubleTab === 'function') {
        const shouldOpenModeMenu =
          overlayState.inputModeController.shouldCompleteModeMenuDoubleTab(e);
        if (shouldOpenModeMenu) {
          cancelPendingOpenTabsPrefixEntry();
          openSearchModeMenuFromDoubleTab();
          return true;
        }
        if (e.defaultPrevented) {
          return true;
        }
      }
      if (overlayState.inputModeController &&
          typeof overlayState.inputModeController.shouldOpenModeMenuForActiveModeOnTab === 'function' &&
          overlayState.inputModeController.shouldOpenModeMenuForActiveModeOnTab(e)) {
        overlayState.inputModeController.openModeMenu('none');
        return true;
      }
      if (overlayState.siteSearchState || overlayState.localSearchScopeState || overlayState.openTabsSearchModeActive) {
        return false;
      }
      const rawValue = overlayState.searchInput.value;
      const rawTrigger = overlayState.latestRawInputValue || rawValue;
      const triggerInput = (rawTrigger || rawValue).trim();
      if (!triggerInput && overlayState.inputModeController &&
          typeof overlayState.inputModeController.shouldOpenModeMenuOnDoubleTab === 'function') {
        const shouldOpenModeMenu = overlayState.inputModeController.shouldOpenModeMenuOnDoubleTab(e);
        if (shouldOpenModeMenu) {
          cancelPendingOpenTabsPrefixEntry();
          openSearchModeMenuFromDoubleTab();
          return true;
        }
        if (e.defaultPrevented) {
          activateOpenTabsSearchMode({
            deferPrefixEntry: true,
            preserveModeMenuDoubleTab: true
          });
          return true;
        }
        return false;
      }
      if (overlayState.siteSearchTriggerState &&
          overlayState.siteSearchTriggerState.rawInput === triggerInput &&
          overlayState.siteSearchTriggerState.provider) {
        e.preventDefault();
        activateSiteSearch(overlayState.siteSearchTriggerState.provider);
        return true;
      }
      if (overlayState.localSearchScopeTriggerState &&
          overlayState.localSearchScopeTriggerState.rawInput === triggerInput &&
          overlayState.localSearchScopeTriggerState.scope) {
        e.preventDefault();
        return activateLocalSearchScope(overlayState.localSearchScopeTriggerState.scope);
      }
      if (triggerInput) {
        e.preventDefault();
        const siteProviders = (overlayState.siteSearchProvidersCache && overlayState.siteSearchProvidersCache.length > 0)
          ? overlayState.siteSearchProvidersCache
          : overlayState.defaultSiteSearchProviders;
        const providers = getSearchTriggerProviders(
          siteProviders,
          overlayState.aggregateSearchesCache
        );
        const topSiteMatch = getTopSiteMatchCandidate(overlayState.currentSuggestions, triggerInput);
        const directProvider = getSiteSearchTriggerCandidate(triggerInput, providers, topSiteMatch);
        if (directProvider) {
          activateSiteSearch(directProvider);
          return true;
        }
        const cachedRules = window._x_extension_shortcut_rules_2024_unique_;
        const directLocalScope = getLocalSearchScopeCandidate(triggerInput, cachedRules);
        if (overlayState.siteSearchProvidersCache && directLocalScope) {
          activateLocalSearchScope(directLocalScope);
          return true;
        }
        Promise.all([
          getSiteSearchProviders(),
          getAggregateSearches(),
          getShortcutRules()
        ]).then(([items, definitions, rules]) => {
          if (overlayState.siteSearchState || overlayState.localSearchScopeState || overlayState.openTabsSearchModeActive ||
              String(overlayState.searchInput.value || '').trim() !== triggerInput) {
            return;
          }
          const asyncTopSiteMatch = getTopSiteMatchCandidate(overlayState.currentSuggestions, triggerInput);
          const asyncProvider = getSiteSearchTriggerCandidate(
            triggerInput,
            getSearchTriggerProviders(items, definitions),
            asyncTopSiteMatch
          );
          if (asyncProvider) {
            activateSiteSearch(asyncProvider);
            return;
          }
          const asyncLocalScope = getLocalSearchScopeCandidate(triggerInput, rules);
          if (asyncLocalScope) {
            activateLocalSearchScope(asyncLocalScope);
            return;
          }
          if (overlayState.autocompleteState && overlayState.autocompleteState.completion) {
            overlayState.searchInput.value = overlayState.autocompleteState.completion;
            overlayState.searchInput.setSelectionRange(overlayState.autocompleteState.completion.length, overlayState.autocompleteState.completion.length);
            overlayState.latestRawInputValue = overlayState.autocompleteState.completion;
            overlayState.latestOverlayQuery = overlayState.autocompleteState.completion.trim();
            overlayState.autocompleteState = null;
            overlayState.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        return true;
      }
      if (overlayState.autocompleteState && overlayState.autocompleteState.completion) {
        e.preventDefault();
        overlayState.searchInput.value = overlayState.autocompleteState.completion;
        overlayState.searchInput.setSelectionRange(overlayState.autocompleteState.completion.length, overlayState.autocompleteState.completion.length);
        overlayState.latestRawInputValue = overlayState.autocompleteState.completion;
        overlayState.latestOverlayQuery = overlayState.autocompleteState.completion.trim();
        overlayState.autocompleteState = null;
        overlayState.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    }

    function shouldRemoveSearchModeTagOnBackspace(event) {
      if (!overlayState.inputModeController ||
          typeof overlayState.inputModeController.shouldRemoveModeTagOnBackspace !== 'function') {
        return true;
      }
      const shouldRemove = overlayState.inputModeController.shouldRemoveModeTagOnBackspace(event);
      if (!shouldRemove && event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      return shouldRemove;
    }

    function handleSearchInputKeydown(e) {
      syncSuggestionActionModifiersFromEvent(e);
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        e.stopPropagation();
      }
      if (e.key === 'Escape' && overlayState.siteSearchState) {
        e.preventDefault();
        e.stopPropagation();
        clearSiteSearch();
        return;
      }
      if (e.key === 'Escape' && overlayState.localSearchScopeState) {
        e.preventDefault();
        e.stopPropagation();
        clearLocalSearchScope();
        const fallbackQuery = overlayState.searchInput.value.trim();
        if (fallbackQuery) {
          requestOverlaySearchSuggestions(fallbackQuery);
        } else {
          clearSearchSuggestions();
        }
        return;
      }
      if (e.key === 'Escape' && overlayState.openTabsSearchModeActive) {
        e.preventDefault();
        e.stopPropagation();
        clearOpenTabsSearchMode();
        return;
      }
      if (e.key === 'Backspace' && overlayState.siteSearchState && !overlayState.searchInput.value) {
        if (!shouldRemoveSearchModeTagOnBackspace(e)) {
          return;
        }
        clearSiteSearch();
        return;
      }
      if (e.key === 'Backspace' && overlayState.localSearchScopeState && !overlayState.searchInput.value) {
        if (!shouldRemoveSearchModeTagOnBackspace(e)) {
          return;
        }
        clearLocalSearchScope();
        clearSearchSuggestions();
        return;
      }
      if (e.key === 'Backspace' && overlayState.openTabsSearchModeActive && !overlayState.searchInput.value) {
        if (!shouldRemoveSearchModeTagOnBackspace(e)) {
          return;
        }
        clearOpenTabsSearchMode();
        return;
      }
      if (isImeCompositionEvent(e)) {
        return;
      }
      const inputHistoryDirection =
        SEARCH_INPUT_HISTORY.getShortcutDirection(e);
      if (inputHistoryDirection) {
        e.preventDefault();
        e.stopPropagation();
        if (overlayState.inputHistoryController) {
          const result = overlayState.inputHistoryController.move(
            inputHistoryDirection,
            overlayState.searchInput.value
          );
          if (result.handled) {
            overlayState.isApplyingSearchInputHistory = true;
            try {
              overlayState.searchInput.value = result.value;
              overlayState.searchInput.setSelectionRange(result.value.length, result.value.length);
              overlayState.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            } finally {
              overlayState.isApplyingSearchInputHistory = false;
            }
          }
        }
        return;
      }
      if (e.key === 'Tab') {
        handleTabKey(e);
        return;
      }
      const suggestionNavigationKey = getSuggestionNavigationKey(e);
      if (suggestionNavigationKey || e.key === 'Enter' || e.key === 'Escape') {
        if (suggestionNavigationKey) {
          e.stopPropagation();
        }
        if (e.isTrusted === true) {
          handleOverlayKeydown(e);
        }
        return;
      }
      dismissAutocompletePreviewOnNonTabKey(e);
      if (e.key !== 'Backspace' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        overlayState.latestRawInputValue = overlayState.searchInput.value;
        overlayState.latestOverlayQuery = overlayState.searchInput.value.trim();
      }
    }

    // Add keyboard navigation
    function getAutoHighlightIndex() {
      return suggestionItems.findIndex((item) => Boolean(item && item._xIsAutocompleteTop));
    }

    function shouldSwitchMatchedTabSuggestion(suggestion, index) {
      if (!suggestion || typeof suggestion._xMatchedTabId !== 'number') {
        return false;
      }
      if (overlayState.prioritizeCurrentPageMatch &&
        typeof overlayState.currentOverlayTabId === 'number' &&
        suggestion._xMatchedTabId === overlayState.currentOverlayTabId &&
        index === 0) {
        return true;
      }
      if (!overlayState.overlayTabQuickSwitchEnabled) {
        return false;
      }
      return index === 0;
    }

    function getSuggestionNavigationKey(event) {
      return SUGGESTION_NAVIGATION.getSuggestionNavigationKey(event, {
        macosCtrlEnabled: overlayState.macosCtrlSuggestionNavigationEnabled,
        navigatorLike: window && window.navigator ? window.navigator : null
      });
    }

    // Keys that belong to the overlay (see LumnoOverlayKeyboard), plus the
    // navigation, Enter and Escape keys forwarded by the input handler.
    function handleOverlayKeydown(e) {
      syncSuggestionActionModifiersFromEvent(e);
      if (SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
        e,
        suggestionItems,
        overlayState.suggestionsContainer,
        numberShortcutOptions
      )) {
        return;
      }
      if (isImeCompositionEvent(e)) {
        return;
      }
      const suggestionNavigationKey = getSuggestionNavigationKey(e);
      dismissAutocompletePreviewOnNonTabKey(e);
      if (e.key === 'Escape' && overlayState.overlay) {
        removeOverlay(overlayState.overlay);
      } else if (suggestionNavigationKey === 'ArrowDown') {
        e.preventDefault();
        if (suggestionItems.length === 0) {
          return;
        }
        let didWrap = false;
        if (overlayState.selectedIndex === -1) {
          // Move from auto highlight (or input) to next suggestion
          const autoIndex = getAutoHighlightIndex();
          overlayState.selectedIndex = autoIndex >= 0
            ? (autoIndex + 1) % suggestionItems.length
            : 0;
          didWrap = autoIndex >= 0 && overlayState.selectedIndex === 0;
        } else {
          // Move to next suggestion
          const previousIndex = overlayState.selectedIndex;
          overlayState.selectedIndex = (overlayState.selectedIndex + 1) % suggestionItems.length;
          didWrap = previousIndex === suggestionItems.length - 1 && overlayState.selectedIndex === 0;
        }
        updateSelection();
        scrollSelectedSuggestionIntoView('down', didWrap);
        overlayState.searchInput.focus();
      } else if (suggestionNavigationKey === 'ArrowUp') {
        e.preventDefault();
        if (suggestionItems.length === 0) {
          return;
        }
        let didWrap = false;
        if (overlayState.selectedIndex === 0) {
          // Wrap from first suggestion to the last suggestion
          overlayState.selectedIndex = suggestionItems.length - 1;
          didWrap = true;
        } else if (overlayState.selectedIndex === -1) {
          const autoIndex = getAutoHighlightIndex();
          if (autoIndex > 0) {
            overlayState.selectedIndex = autoIndex - 1;
          } else if (autoIndex === 0) {
            overlayState.selectedIndex = suggestionItems.length - 1;
            didWrap = true;
          } else {
            // Move from input to last suggestion
            overlayState.selectedIndex = suggestionItems.length - 1;
            didWrap = true;
          }
        } else {
          // Move to previous suggestion
          overlayState.selectedIndex = overlayState.selectedIndex - 1;
        }
        updateSelection();
        scrollSelectedSuggestionIntoView('up', didWrap);
        overlayState.searchInput.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const query = overlayState.searchInput.value.trim();
        if (query && overlayState.inputHistoryController) {
          overlayState.inputHistoryController.record(query);
        }
        const commandMatch = overlayState.localSearchScopeState ? null : getCommandMatch(query);
        if (commandMatch && overlayState.selectedIndex === -1) {
          if (commandMatch.command.type === 'modeSwitch') {
            applyThemeModeChange(getNextThemeMode(overlayState.overlayThemeMode || 'system'));
            overlayState.searchInput.focus();
            return;
          } else if (commandMatch.command.type === 'commandNewTab') {
            chrome.runtime.sendMessage({ action: 'openNewTab' });
          } else if (commandMatch.command.type === 'commandSettings') {
            chrome.runtime.sendMessage({ action: 'openOptionsPage' });
          } else if (commandMatch.command.type === 'commandOpenTabs') {
            overlayState.searchInput.value = '';
            overlayState.latestRawInputValue = '';
            overlayState.latestOverlayQuery = '';
            activateOpenTabsSearchMode();
            overlayState.searchInput.focus();
            return;
          } else if (commandMatch.command.type === 'commandCopyUrl') {
            chrome.runtime.sendMessage({ action: 'copyCurrentPageUrl' });
          } else if (commandMatch.command.type === 'commandDocumentPip') {
            openDocumentPipPickerFromOverlay();
          }
          removeOverlay(overlayState.overlay);
          return;
        }
        if (!overlayState.localSearchScopeState && isModeCommand(query) && overlayState.selectedIndex === -1) {
          applyThemeModeChange(getNextThemeMode(overlayState.overlayThemeMode || 'system'));
          return;
        }

        const activeSuggestionIndex = overlayState.selectedIndex >= 0
          ? overlayState.selectedIndex
          : getAutoHighlightIndex();
        if (activeSuggestionIndex >= 0 && suggestionItems[activeSuggestionIndex]) {
          // Check if we're showing search suggestions or tab suggestions
          const activeItem = suggestionItems[activeSuggestionIndex];
          const isSearchSuggestion = Boolean(activeItem._xIsSearchSuggestion);
          let canKeepOverlayOpen = false;

          if (isSearchSuggestion && overlayState.currentSuggestions[activeSuggestionIndex]) {
            const selectedSuggestion = overlayState.currentSuggestions[activeSuggestionIndex];
            if (selectedSuggestion.type === 'modeSwitch') {
              applyThemeModeChange(selectedSuggestion.nextMode);
              overlayState.searchInput.focus();
              return;
            }
            if (selectedSuggestion.type === 'commandNewTab') {
              chrome.runtime.sendMessage({ action: 'openNewTab' });
              removeOverlay(overlayState.overlay);
              return;
            }
            if (selectedSuggestion.type === 'commandSettings') {
              chrome.runtime.sendMessage({ action: 'openOptionsPage' });
              removeOverlay(overlayState.overlay);
              return;
            }
            if (selectedSuggestion.type === 'commandOpenTabs') {
              overlayState.searchInput.value = '';
              overlayState.latestRawInputValue = '';
              overlayState.latestOverlayQuery = '';
              activateOpenTabsSearchMode();
              overlayState.searchInput.focus();
              return;
            }
            if (selectedSuggestion.type === 'commandCopyUrl') {
              chrome.runtime.sendMessage({ action: 'copyCurrentPageUrl' });
              removeOverlay(overlayState.overlay);
              return;
            }
            if (selectedSuggestion.type === 'commandDocumentPip') {
              openDocumentPipPickerFromOverlay();
              removeOverlay(overlayState.overlay);
              return;
            }
            if (selectedSuggestion.type === 'siteSearchPrompt' && selectedSuggestion.provider) {
              activateSiteSearch(selectedSuggestion.provider);
              overlayState.searchInput.focus();
              return;
            }
            if (selectedSuggestion.type === 'helpFeedback' && selectedSuggestion.feedbackKey === 'community') {
              openOverlayCommunityQrDialog(selectedSuggestion.url);
              return;
            }
            if (selectedSuggestion.provider && selectedSuggestion.searchQuery) {
              if (openSiteSearchProviderQuery(selectedSuggestion.provider, selectedSuggestion.searchQuery, e)) {
                finishOverlayResultActivation(e, true);
              }
              return;
            }
            if (shouldSwitchMatchedTabSuggestion(selectedSuggestion, activeSuggestionIndex)) {
              openMatchedTabSuggestion(selectedSuggestion, e, activeItem, query);
              canKeepOverlayOpen = Boolean(selectedSuggestion.url);
            } else if (selectedSuggestion.forceSearch && selectedSuggestion.searchQuery) {
              if (shouldOpenSearchResultInBackgroundTab(e) && selectedSuggestion.url) {
                recordSearchSuggestionSelectionFromSuggestion(selectedSuggestion, query, 'overlay');
                chrome.runtime.sendMessage({
                  action: 'createTab',
                  url: selectedSuggestion.url,
                  disposition: 'backgroundTab'
                });
              } else {
                chrome.runtime.sendMessage({
                  action: 'searchOrNavigate',
                  query: selectedSuggestion.searchQuery,
                  forceSearch: true
                });
              }
              canKeepOverlayOpen = Boolean(selectedSuggestion.url);
            } else {
              // Navigate to the suggested URL
              recordSearchSuggestionSelectionFromSuggestion(selectedSuggestion, query, 'overlay');
              chrome.runtime.sendMessage({
                action: 'createTab',
                url: selectedSuggestion.url,
                disposition: getSearchResultCreateDisposition(selectedSuggestion, e, activeItem)
              });
              canKeepOverlayOpen = true;
            }
          } else if (!isSearchSuggestion) {
            if (activeItem && activeItem._xIsOpenTabsModeEntry) {
              activateOpenTabsSearchMode();
              overlayState.searchInput.focus();
              return;
            }
            // Switch to existing tab
            if (activeItem && activeItem._xIsRenderedTabSuggestion && activeItem._xSuggestion) {
              openMatchedTabSuggestion(activeItem._xSuggestion, e, activeItem, query);
              canKeepOverlayOpen = Boolean(activeItem._xSuggestion.url);
            } else if (activeItem && typeof activeItem._xTabId === 'number') {
              chrome.runtime.sendMessage({
                action: 'switchToTab',
                tabId: activeItem._xTabId
              });
            }
          }
          finishOverlayResultActivation(e, canKeepOverlayOpen);
        } else if (query) {
          if (!overlayState.localSearchScopeState && isSlashCommandInput(query)) {
            updateSearchSuggestions([], query);
            return;
          }
          if (overlayState.localSearchScopeState) {
            return;
          }
          if (overlayState.siteSearchState) {
            const activeAggregateSearch = isAggregateSearchProvider(overlayState.siteSearchState);
            if (openSiteSearchProviderQuery(overlayState.siteSearchState, query, e)) {
              finishOverlayResultActivation(e, true);
              return;
            }
            if (activeAggregateSearch) {
              return;
            }
          }
          const currentRawInput = (overlayState.latestRawInputValue || overlayState.searchInput.value || '').trim();
          if (overlayState.inlineSearchState && overlayState.inlineSearchState.isAuto &&
              overlayState.inlineSearchState.rawInput === currentRawInput) {
            if (overlayState.inlineSearchState.provider && overlayState.inlineSearchState.query) {
              if (!openSiteSearchProviderQuery(overlayState.inlineSearchState.provider, overlayState.inlineSearchState.query, e)) {
                return;
              }
            } else if (overlayState.inlineSearchState.url) {
              chrome.runtime.sendMessage({
                action: 'createTab',
                url: overlayState.inlineSearchState.url,
                disposition: getSearchResultNewTabDisposition(e)
              });
            } else {
              return;
            }
            finishOverlayResultActivation(e, true);
            return;
          }
          if (overlayState.autocompleteState && overlayState.autocompleteState.url) {
            recordSearchSuggestionSelectionFromSuggestion({
              url: overlayState.autocompleteState.url,
              title: overlayState.autocompleteState.title || '',
              type: 'autocomplete'
            }, query, 'overlay');
            chrome.runtime.sendMessage({
              action: 'createTab',
              url: overlayState.autocompleteState.url,
              disposition: getSearchResultNewTabDisposition(e)
            });
            finishOverlayResultActivation(e, true);
            return;
          }
          resolveQuickNavigation(query).then((targetUrl) => {
            if (targetUrl) {
              chrome.runtime.sendMessage({
                action: 'createTab',
                url: targetUrl,
                disposition: getSearchResultNewTabDisposition(e)
              });
            } else if (shouldOpenSearchResultInBackgroundTab(e)) {
              chrome.runtime.sendMessage({
                action: 'searchOrNavigate',
                query: query,
                disposition: 'backgroundTab'
              });
            } else {
              // Handle search or URL navigation
              chrome.runtime.sendMessage({
                action: 'searchOrNavigate',
                query: query
              });
            }
            finishOverlayResultActivation(e, true);
          });
        }
      }
    }

    function handleOverlayKeyup(e) {
      syncSuggestionActionModifiersFromEvent(e);
      SUGGESTION_NAVIGATION.handleNumberShortcutKeyEvent(
        e,
        suggestionItems,
        overlayState.suggestionsContainer,
        numberShortcutOptions
      );
    }

    function isSearchInputActive() {
      const searchRoot = overlayState.searchInput && typeof overlayState.searchInput.getRootNode === 'function'
        ? overlayState.searchInput.getRootNode()
        : null;
      const activeInRoot = searchRoot && searchRoot.activeElement ? searchRoot.activeElement : null;
      return document.activeElement === overlayState.searchInput || activeInRoot === overlayState.searchInput;
    }

    return {
      handleTabKey,
      handleSearchInputKeydown,
      shouldSwitchMatchedTabSuggestion,
      getSuggestionNavigationKey,
      handleOverlayKeydown,
      handleOverlayKeyup,
      isSearchInputActive
    };
  }

  root.LumnoOverlayPanelPanelKeys = { createPanelKeys };
})(globalThis);
