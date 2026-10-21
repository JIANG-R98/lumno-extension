(function(root) {
  // Builds the search box: the suggestions view, the search input with its
  // key, input and focus handling, the global listeners that return focus to
  // it, and the search scope icon.
  function createSearchBox(deps) {
    const {
      suggestionItems,
      t,
      formatMessage,
      getRiSvg,
      sanitizeDisplayText,
      shouldBlockFaviconForHost,
      isLocalNetworkHost,
      getHostFromUrl,
      getUrlDisplay,
      getThemeHostForSuggestion,
      getImmediateThemeForSuggestion,
      getThemeForSuggestion,
      shouldUseUrlFallbackThemeForSuggestion,
      getThemeForMode,
      getHoverColors,
      getNeutralHoverActionColors,
      applyThemeVariables,
      applyMarkVariables,
      applyFaviconOpticalAlignment,
      applyFaviconOpticalShift,
      applyFallbackIcon,
      setFaviconSrcWithAnimation,
      attachFaviconWithFallbacks,
      reportMissingIcon,
      preloadIcon,
      getChromeFaviconUrl,
      getBrowserPageFaviconUrl,
      getPageFaviconRenderCandidates,
      setSuggestionsVisible,
      shouldOpenSearchResultInBackgroundTab,
      activateRenderedSuggestion,
      deleteRenderedHistorySuggestion,
      copySearchResultUrl,
      showTopActionTooltip,
      hideTopActionTooltip,
      bindCursorTooltip,
      getSearchActionLabel,
      getSiteSearchDisplayName,
      isAiSiteSearchProvider,
      getDefaultSearchEngineThemeUrl,
      getBrandAccentForUrl,
      buildThemeFromAccent,
      newtabSuggestionActionModel,
      shouldSwitchMatchedTabSuggestion,
      defaultTheme,
      urlHighlightTheme,
      createSearchInput,
      searchInputHistoryController,
      updateModeBadge,
      imeKeyGuard,
      clearAutocomplete,
      clearSearchSuggestions,
      isSlashCommandInput,
      renderSuggestions,
      getDirectUrlSuggestion,
      renderPendingSuggestions,
      requestSuggestions,
      syncSuggestionActionModifiersFromEvent,
      dismissAutocompletePreviewOnNonTabKey,
      SUGGESTION_NAVIGATION,
      clearSiteSearch,
      clearLocalSearchScope,
      isImeCompositionEvent,
      SEARCH_INPUT_HISTORY,
      getNextSuggestionIndex,
      getAutoHighlightIndex,
      updateSelection,
      scrollSelectedSuggestionIntoView,
      submitSearchQuery,
      markNewtabStartupMilestone,
      root,
      dismissSearchSuggestionsFromBackground,
      focusSearchInputPreservingScroll,
      finishNewtabEntryAnimation,
      handleGlobalTypingFocus,
      refreshFallbackShortcut,
      restoreDismissedSearchSuggestions,
      hideSearchInputCursorTooltip,
      onLanguageChange,
      openSearchModeMenuFromDoubleTab,
      bindSearchInputCursorTooltip
    } = deps;

    // The page state object shared with newtab.js and the other modules.
    const pageState = deps.pageState;

    const NEWTAB_BACKGROUND_SEARCH_FOCUS = globalThis.LumnoNewtabBackgroundSearchFocus;
    const NEWTAB_SUGGESTIONS_VIEW = globalThis.LumnoNewtabSuggestionsView;
    const NEWTAB_OPEN_TAB_SUGGESTION_LIMIT = 8;

    function formatTabRankDebugText(tab) {
      const scoreRaw = Number(tab && tab._xTabRankScore);
      const score = Number.isFinite(scoreRaw) ? scoreRaw.toFixed(2) : '0.00';
      const count30mRaw = Number(tab && tab._xTabSwitchCount30m);
      const count24hRaw = Number(tab && tab._xTabSwitchCount24h);
      const debugTotalRaw = Number(tab && tab._xTabDebugEventTotal);
      const lastAccessedRaw = Number(tab && tab._xTabLastAccessedRaw);
      const sortAtRaw = Number(tab && tab._xTabSortAt);
      const fetchSeqRaw = Number(tab && tab._xTabFetchSeq);
      const count30m = Number.isFinite(count30mRaw) ? Math.max(0, Math.round(count30mRaw)) : 0;
      const count24h = Number.isFinite(count24hRaw) ? Math.max(0, Math.round(count24hRaw)) : 0;
      const debugTotal = Number.isFinite(debugTotalRaw) ? Math.max(0, Math.round(debugTotalRaw)) : 0;
      const lastAccessedSec = Number.isFinite(lastAccessedRaw) && lastAccessedRaw > 0 ? Math.round(lastAccessedRaw / 1000) : 0;
      const sortAtSec = Number.isFinite(sortAtRaw) && sortAtRaw > 0 ? Math.round(sortAtRaw / 1000) : 0;
      const fetchSeq = Number.isFinite(fetchSeqRaw) ? Math.max(0, Math.round(fetchSeqRaw)) : 0;
      return `score ${score} · 30m ${count30m} · 24h ${count24h} · ev ${debugTotal} · la ${lastAccessedSec} · s ${sortAtSec} · fs ${fetchSeq} · build 20260308-1`;
    }
    let isApplyingSearchInputHistory = false;
    let searchInputRef = null;
    pageState.suggestionsView = NEWTAB_SUGGESTIONS_VIEW.createSuggestionsView({
      document,
      container: pageState.suggestionsContainer,
      items: suggestionItems,
      t,
      formatMessage,
      getRiSvg,
      sanitizeDisplayText,
      formatTabRankDebugText,
      isTabRankScoreDebugEnabled: () => pageState.tabRankScoreDebugEnabled,
      shouldBlockFaviconForHost,
      isLocalNetworkHost,
      getHostFromUrl,
      getUrlDisplay,
      isSimpleModeEnabled: () => pageState.simpleModeEnabled,
      getThemeHostForSuggestion,
      getImmediateThemeForSuggestion,
      getThemeForSuggestion,
      shouldUseUrlFallbackThemeForSuggestion,
      getThemeForMode,
      getHoverColors,
      getNeutralHoverActionColors,
      applyThemeVariables,
      applyMarkVariables,
      applyFaviconOpticalAlignment,
      applyFaviconOpticalShift,
      applyFallbackIcon,
      setFaviconSrcWithAnimation,
      attachFaviconWithFallbacks,
      reportMissingIcon,
      preloadIcon,
      getChromeFaviconUrl,
      getBrowserPageFaviconUrl,
      getPageFaviconRenderCandidates,
      setSuggestionsVisible,
      onSetSelectedIndex: (nextIndex) => {
        pageState.selectedIndex = nextIndex;
      },
      getSelectedIndex: () => pageState.selectedIndex,
      onSwitchToTab: (tab, event) => {
        if (shouldOpenSearchResultInBackgroundTab(event) && tab && tab.url) {
          chrome.runtime.sendMessage({
            action: 'createTab',
            url: tab.url,
            disposition: 'backgroundTab'
          });
          return;
        }
        chrome.runtime.sendMessage({
          action: 'switchToTab',
          tabId: tab.id
        });
      },
      onActivateSuggestion: activateRenderedSuggestion,
      onDeleteHistory: deleteRenderedHistorySuggestion,
      onCopyUrl: copySearchResultUrl,
      showTopActionTooltip,
      hideTopActionTooltip,
      bindCursorTooltip,
      getSearchActionLabel,
      getSiteSearchDisplayName,
      isAiSiteSearchProvider,
      getDefaultSearchEngineThemeUrl,
      getBrandAccentForUrl,
      buildThemeFromAccent,
      actionModel: newtabSuggestionActionModel,
      shouldSwitchMatchedTabSuggestion,
      defaultTheme,
      urlHighlightTheme,
      openTabSuggestionLimit: NEWTAB_OPEN_TAB_SUGGESTION_LIMIT
    });

    function shouldRemoveSearchModeTagOnBackspace(event) {
      if (!pageState.inputModeController ||
          typeof pageState.inputModeController.shouldRemoveModeTagOnBackspace !== 'function') {
        return true;
      }
      const shouldRemove = pageState.inputModeController.shouldRemoveModeTagOnBackspace(event);
      if (!shouldRemove && event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      return shouldRemove;
    }

    pageState.inputParts = createSearchInput({
      useImportantStyles: false,
      useInlineBaseStyles: false,
      containerId: '_x_extension_newtab_input_container_2024_unique_',
      inputId: '_x_extension_newtab_search_input_2024_unique_',
      iconId: '_x_extension_newtab_search_icon_2024_unique_',
      placeholder: t('search_placeholder', pageState.defaultPlaceholderText),
      modeBadge: {
        id: '_x_extension_newtab_mode_badge_2024_unique_',
        className: 'x-lumno-search-input-mode__badge',
        surface: 'newtab',
        visible: false
      },
      containerStyleOverrides: {
        'border-radius': '24px',
        'background': 'transparent',
        'border': 'none',
        'box-shadow': 'none',
        'min-width': '100%',
        'min-height': '44px',
        'height': '44px',
        'position': 'relative',
        'z-index': '2',
        'overflow': 'visible'
      },
      inputStyleOverrides: {
        'border-bottom': 'none',
        'color': 'var(--x-nt-text, #111827)',
        'caret-color': 'var(--x-nt-link, #2563EB)',
        'padding': '8px 100px 8px 44px',
        'min-height': '44px',
        'height': '44px',
        'line-height': '24px'
      },
      iconStyleOverrides: {
        'color': 'var(--x-nt-subtext, #6B7280)',
        'left': '7px'
      },
      rightIconStyleOverrides: {
        '--x-ext-input-right-icon-inset': '7px',
        '--x-ext-input-icon-hover-bg': 'var(--x-nt-settings-action-hover-bg, rgba(148, 163, 184, 0.16))',
        '--x-ext-input-icon-hover': 'var(--x-nt-settings-action-hover-color, #4B5563)',
        cursor: 'pointer'
      },
      clearAction: {
        id: '_x_extension_newtab_search_clear_2026_unique_',
        ariaLabel: t('search_input_clear', '清空'),
        html: getRiSvg('ri-close-line', 'ri-size-16'),
        styleOverrides: {
          '--x-ext-input-clear-right': '79px',
          '--x-ext-input-clear-top': '7px',
          '--x-ext-input-icon-hover-bg': 'var(--x-nt-settings-action-hover-bg, rgba(148, 163, 184, 0.16))',
          '--x-ext-input-icon-hover': 'var(--x-nt-settings-action-hover-color, #4B5563)'
        }
      },
      secondaryAction: {
        id: '_x_extension_newtab_close_other_tabs_2026_unique_',
        className: 'x-nt-close-other-tabs',
        ariaLabel: t('overlay_close_other_tabs_tooltip', '关闭其他标签页'),
        html: getRiSvg('ri-brush-2-line', 'ri-size-16'),
        confirm: {
          getCopy: getCloseOtherTabsConfirmCopy,
          onConfirm: closeOtherTabs
        }
      },
      onInput: function(event) {
        pageState.searchSuggestionsDismissed = false;
        if (!isApplyingSearchInputHistory) {
          searchInputHistoryController.resetNavigation();
        }
        const rawValue = event.target.value;
        const query = rawValue.trim();
        updateModeBadge(rawValue);
        const inputType = event && event.inputType;
        const isPaste = inputType === 'insertFromPaste';
        const isDelete = inputType && inputType.startsWith('delete');
        if (isDelete) {
          pageState.lastDeletionAt = Date.now();
        }
        if (imeKeyGuard.isComposing()) {
          pageState.latestQuery = query;
          pageState.latestRawQuery = rawValue;
          return;
        }
        if (!query) {
          pageState.latestQuery = '';
          pageState.latestRawQuery = '';
          clearAutocomplete();
          if (pageState.remoteSuggestionDebounceTimer) {
            clearTimeout(pageState.remoteSuggestionDebounceTimer);
            pageState.remoteSuggestionDebounceTimer = null;
          }
          if (pageState.suggestionRequestWatchdogTimer) {
            clearTimeout(pageState.suggestionRequestWatchdogTimer);
            pageState.suggestionRequestWatchdogTimer = null;
          }
          clearSearchSuggestions();
          return;
        }
        pageState.latestRawQuery = rawValue;
        clearAutocomplete();
        if (!pageState.localSearchScopeState && isSlashCommandInput(query)) {
          pageState.latestQuery = query;
          renderSuggestions([], query);
          return;
        }
        const directUrlSuggestion = getDirectUrlSuggestion(query);
        const hasCachedOpenTabMatch = Boolean(
          directUrlSuggestion &&
          typeof directUrlSuggestion._xMatchedTabId === 'number'
        );
        if (isPaste || directUrlSuggestion) {
          pageState.latestQuery = query;
          if (!directUrlSuggestion || hasCachedOpenTabMatch) {
            renderPendingSuggestions(query);
          }
          requestSuggestions(query, {
            immediate: true,
            deferInitialDirectNavigationRender: Boolean(
              directUrlSuggestion && !hasCachedOpenTabMatch
            )
          });
          return;
        }
        requestSuggestions(query);
      },
      onKeyDown: function(event) {
        syncSuggestionActionModifiersFromEvent(event);
        dismissAutocompletePreviewOnNonTabKey(event);
        const suggestionNavigationKey =
          SUGGESTION_NAVIGATION.getSuggestionNavigationKey(event, {
            macosCtrlEnabled: pageState.macosCtrlSuggestionNavigationEnabled,
            navigatorLike: typeof navigator === 'object' && navigator ? navigator : null
          });
        if (event.key !== 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
          pageState.latestRawQuery = pageState.inputParts.input.value;
          pageState.latestQuery = pageState.inputParts.input.value.trim();
        }
        if (event.key === 'Escape' && pageState.siteSearchState) {
          event.preventDefault();
          clearSiteSearch();
          return;
        }
        if (event.key === 'Escape' && pageState.localSearchScopeState) {
          event.preventDefault();
          clearLocalSearchScope();
          const fallbackQuery = pageState.inputParts.input.value.trim();
          if (fallbackQuery) {
            requestSuggestions(fallbackQuery, { immediate: true });
          } else {
            clearSearchSuggestions();
          }
          return;
        }
        if (event.key === 'Backspace' && pageState.siteSearchState && !pageState.inputParts.input.value) {
          if (!shouldRemoveSearchModeTagOnBackspace(event)) {
            return;
          }
          clearSiteSearch();
          return;
        }
        if (event.key === 'Backspace' && pageState.localSearchScopeState && !pageState.inputParts.input.value) {
          if (!shouldRemoveSearchModeTagOnBackspace(event)) {
            return;
          }
          clearLocalSearchScope();
          clearSearchSuggestions();
          return;
        }
        if (isImeCompositionEvent(event)) {
          return;
        }
        const inputHistoryDirection =
          SEARCH_INPUT_HISTORY.getShortcutDirection(event);
        if (inputHistoryDirection) {
          event.preventDefault();
          event.stopPropagation();
          const result = searchInputHistoryController.move(
            inputHistoryDirection,
            pageState.inputParts.input.value
          );
          if (result.handled) {
            isApplyingSearchInputHistory = true;
            try {
              pageState.inputParts.input.value = result.value;
              pageState.inputParts.input.setSelectionRange(result.value.length, result.value.length);
              pageState.inputParts.input.dispatchEvent(new Event('input', { bubbles: true }));
            } finally {
              isApplyingSearchInputHistory = false;
            }
          }
          return;
        }
        if (suggestionNavigationKey) {
          if (suggestionItems.length === 0) {
            return;
          }
          event.preventDefault();
          const next = getNextSuggestionIndex(
            suggestionNavigationKey === 'ArrowDown' ? 1 : -1,
            pageState.selectedIndex,
            suggestionItems.length,
            pageState.selectedIndex === -1 ? getAutoHighlightIndex() : -1
          );
          pageState.selectedIndex = next.index;
          const didWrap = next.didWrap;
          updateSelection();
          scrollSelectedSuggestionIntoView(
            suggestionNavigationKey === 'ArrowDown' ? 'down' : 'up',
            didWrap
          );
          return;
        }
        if (event.key === 'Tab' && pageState.handleTabKey) {
          pageState.handleTabKey(event);
          return;
        }
        if (event.key !== 'Enter') {
          return;
        }
        const query = event.target.value.trim();
        if (!query) {
          return;
        }
        searchInputHistoryController.record(query);
        submitSearchQuery(query, event);
      }
    });
    markNewtabStartupMilestone('search-input-created');

    const handleBackgroundPointerFocus = NEWTAB_BACKGROUND_SEARCH_FOCUS.createBackgroundFocusHandler({
      getBackgroundTargets: () => [document.body, root, pageState.searchLayer],
      getSearchValue: () => pageState.inputParts.input.value,
      dismissSearchResults: dismissSearchSuggestionsFromBackground,
      focusSearch: focusSearchInputPreservingScroll
    });

    window.addEventListener('keydown', finishNewtabEntryAnimation, true);
    window.addEventListener('pointerdown', finishNewtabEntryAnimation, true);
    window.addEventListener('keydown', handleGlobalTypingFocus, true);
    window.addEventListener('focus', () => refreshFallbackShortcut(true), true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshFallbackShortcut(false);
      }
    }, true);
    window.addEventListener('pointerdown', handleBackgroundPointerFocus, true);
    window.addEventListener('mousedown', handleBackgroundPointerFocus, true);
    pageState.modeBadge = pageState.inputParts.modeBadge;
    const searchInput = pageState.inputParts.input;
    searchInput.addEventListener('focus', restoreDismissedSearchSuggestions);
    searchInputRef = searchInput;
    pageState.searchScopeIcon = pageState.inputParts.icon;
    const rightIcon = pageState.inputParts.rightIcon;
    const searchScopeTooltipText = () => t(
      'shortcut_reference_search_open_scope_menu_title',
      '打开搜索范围面板'
    );
    function setSearchScopeIconVisualState(active) {
      if (!pageState.searchScopeIcon) {
        return;
      }
      const enabled = pageState.searchScopeIcon.getAttribute('aria-disabled') !== 'true';
      pageState.searchScopeIcon.dataset.hoverActive = active && enabled ? 'true' : 'false';
    }
    function setSearchScopeIconEnabled(enabled) {
      if (!pageState.searchScopeIcon) {
        return;
      }
      const nextEnabled = enabled !== false;
      pageState.searchScopeIcon.setAttribute('aria-disabled', nextEnabled ? 'false' : 'true');
      pageState.searchScopeIcon.setAttribute('tabindex', nextEnabled ? '0' : '-1');
      pageState.searchScopeIcon.setAttribute('aria-label', searchScopeTooltipText());
      if (nextEnabled) {
        pageState.searchScopeIcon.setAttribute('data-tooltip', searchScopeTooltipText());
        return;
      }
      pageState.searchScopeIcon.removeAttribute('data-tooltip');
      hideSearchInputCursorTooltip();
      setSearchScopeIconVisualState(false);
      if (typeof pageState.searchScopeIcon.blur === 'function') {
        pageState.searchScopeIcon.blur();
      }
    }
    onLanguageChange(() => {
      if (pageState.searchScopeIcon) {
        setSearchScopeIconEnabled(pageState.searchScopeIcon.getAttribute('aria-disabled') !== 'true');
      }
    });
    function activateSearchScopeIcon(event) {
      if (!pageState.searchScopeIcon || pageState.searchScopeIcon.getAttribute('aria-disabled') === 'true') {
        return;
      }
      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
      }
      hideSearchInputCursorTooltip();
      setSearchScopeIconVisualState(false);
      if (pageState.inputModeController &&
          typeof pageState.inputModeController.resetModeMenuDoubleTab === 'function') {
        pageState.inputModeController.resetModeMenuDoubleTab();
      }
      openSearchModeMenuFromDoubleTab();
      if (pageState.searchScopeIcon && typeof pageState.searchScopeIcon.blur === 'function') {
        pageState.searchScopeIcon.blur();
      }
    }
    if (pageState.searchScopeIcon) {
      pageState.searchScopeIcon.dataset.searchScopeAction = 'true';
      pageState.searchScopeIcon.setAttribute('role', 'button');
      setSearchScopeIconEnabled(true);
      setSearchScopeIconVisualState(false);
      pageState.searchScopeIcon.addEventListener('mouseenter', () => {
        setSearchScopeIconVisualState(true);
      });
      pageState.searchScopeIcon.addEventListener('focus', () => {
        setSearchScopeIconVisualState(true);
      });
      ['mouseleave', 'blur', 'pointerup', 'pointercancel'].forEach((type) => {
        pageState.searchScopeIcon.addEventListener(type, () => {
          setSearchScopeIconVisualState(false);
        });
      });
      pageState.searchScopeIcon.addEventListener('click', activateSearchScopeIcon);
      pageState.searchScopeIcon.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        activateSearchScopeIcon(event);
      });
      bindSearchInputCursorTooltip(pageState.searchScopeIcon, searchScopeTooltipText);
    }

    function getCloseOtherTabsConfirmCopy() {
      return {
        message: t('overlay_close_other_tabs_confirm', '关闭此窗口中的其他标签页？置顶和分组内的标签页会保留。'),
        messageKey: 'overlay_close_other_tabs_confirm',
        confirmLabel: t('overlay_close_other_tabs_confirm_button', '关闭'),
        confirmLabelKey: 'overlay_close_other_tabs_confirm_button'
      };
    }

    function closeOtherTabs(event) {
      if (!event || event.isTrusted !== true) {
        return;
      }
      const closeOtherTabsButton = pageState.inputParts && pageState.inputParts.secondaryAction;
      // The confirm button is going away with its bubble; keep typing in the field.
      searchInput.focus({ preventScroll: true });
      chrome.runtime.sendMessage({ action: 'closeOtherTabsForOverlay' }, (response) => {
        if (closeOtherTabsButton) {
          closeOtherTabsButton.removeAttribute('data-hover-active');
        }
        if (chrome.runtime.lastError || !response || response.ok !== true) {
          return;
        }
        // Closed tabs may still be listed among the open-tab suggestions.
        const query = searchInput.value.trim();
        if (query) {
          requestSuggestions(query, { immediate: true });
        }
      });
    }

    return {
      searchInput,
      rightIcon,
      setSearchScopeIconEnabled
    };
  }

  root.LumnoNewtabSearchBox = { createSearchBox };
})(globalThis);
