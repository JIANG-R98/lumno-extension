// Rendering suggestions: the React suggestions view, selection and
// scrolling, activating or deleting a row, favicons in rows, the empty
// state and the open tabs list.
function createSuggestionsRender(deps) {
  const {
    updateSearchSuggestions,
    requestOverlaySearchSuggestions,
    suggestionItems,
    SUGGESTION_NAVIGATION,
    SUGGESTIONS_HEIGHT_LAYOUT,
    syncSearchModeMenuResultOffset,
    removeOverlay,
    activateOpenTabsSearchMode,
    openDocumentPipPickerFromOverlay,
    activateSiteSearch,
    openOverlayCommunityQrDialog,
    applyThemeModeChange,
    applyWebAppearanceMode,
    shouldSwitchMatchedTabSuggestion,
    openMatchedTabSuggestion,
    finishOverlayResultActivation,
    openSiteSearchProviderQuery,
    shouldOpenSearchResultInBackgroundTab,
    recordSearchSuggestionSelectionFromSuggestion,
    getSearchResultCreateDisposition,
    getOverlayFaviconUrlResolver,
    t,
    formatMessage,
    getRiSvg,
    SEARCH_UTILS,
    shouldBlockOverlayFaviconForHost,
    isLocalNetworkHost,
    getChromeFaviconUrl,
    getPageFaviconCandidateUrl,
    getHostFromUrl,
    getUrlDisplay,
    getImmediateThemeForSuggestion,
    getThemeForSuggestion,
    getThemeForMode,
    getHoverColors,
    getHighlightColors,
    getNeutralHoverActionColors,
    applyThemeVariables,
    applyMarkVariables,
    copySearchResultUrl,
    getSearchActionLabel,
    getSiteSearchDisplayName,
    isAiSiteSearchProvider,
    getDefaultSearchEngineThemeUrlForOverlay,
    getBrandAccentForUrl,
    buildTheme,
    SUGGESTION_ACTION_MODEL,
    normalizeSearchResultDisplayLimit,
    pauseOverlayAntiTranslateObserverForMutationBurst,
    setOpenTabsResultsViewport,
    setOverlayResultsCollapsed,
    isAggregateSearchProvider,
    getSearchModeProviderId,
    filterTabsForOverlay,
    shouldShowOpenTabsForEmptyQuery,
    clearDefaultOpenTabsSuggestions
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  const OVERLAY_SUGGESTIONS_VIEW = globalThis.LumnoOverlaySuggestionsView;

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
  let overlayTabsRequestInFlight = false;
  let overlayTabsRequestSeq = 0;
  const showTopActionTooltip = (button, text) => {
    if (!button || !text) {
      return;
    }
    overlayState.topActionTooltipController.show(button, text, {
      boundaryElement: overlayState.overlay,
      positionMode: 'absolute',
      maxWidth: 420
    });
  };
  const hideTopActionTooltip = () => {
    overlayState.topActionTooltipController.hide();
  };

  function getOverlaySuggestionRefreshQuery() {
    return overlayState.latestOverlayQuery || (overlayState.searchInput ? String(overlayState.searchInput.value || '').trim() : '');
  }

  function refreshOverlaySuggestionsAfterHistoryDelete() {
    const queryToRefresh = getOverlaySuggestionRefreshQuery();
    if (!queryToRefresh) {
      updateSearchSuggestions([], '');
      return;
    }
    requestOverlaySearchSuggestions(queryToRefresh);
  }

  function deleteHistorySuggestionUrl(suggestion) {
    const targetUrl = suggestion && suggestion.url ? String(suggestion.url) : '';
    if (!targetUrl) {
      return;
    }
    chrome.runtime.sendMessage({
      action: 'deleteHistoryUrl',
      url: targetUrl
    }, function(response) {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      if (!response || response.ok !== true) {
        return;
      }
      refreshOverlaySuggestionsAfterHistoryDelete();
    });
  }

  function updateSelection() {
    ensureOverlaySuggestionsView().updateSelection(overlayState.selectedIndex);
  }

  function syncSuggestionLastState() {
    suggestionItems.forEach((item, index) => {
      if (item && typeof item.setAttribute === 'function') {
        item.setAttribute('data-last', index === suggestionItems.length - 1 ? 'true' : 'false');
      }
    });
  }

  function scrollSelectedSuggestionIntoView(direction, didWrap) {
    if (!overlayState.suggestionsContainer || overlayState.selectedIndex < 0) {
      return;
    }
    const item = suggestionItems[overlayState.selectedIndex];
    SUGGESTION_NAVIGATION.scrollItemIntoView(overlayState.suggestionsContainer, item, {
      direction,
      didWrap,
      inset: 8
    });
  }

  function getSearchPanelsLayoutTransitionMenu() {
    if (!overlayState.inputModeController ||
        typeof overlayState.inputModeController.isModeMenuVisible !== 'function' ||
        !overlayState.inputModeController.isModeMenuVisible()) {
      return null;
    }
    const menu = overlayState.inputModeController && overlayState.inputModeController.menuElement
      ? overlayState.inputModeController.menuElement
      : overlayState.inputParts.modeMenu;
    return menu && !menu.hidden ? menu : null;
  }

  function commitSuggestionsNaturalHeightAfterRender() {
    SUGGESTIONS_HEIGHT_LAYOUT.applyNaturalSuggestionsHeightLayout(
      overlayState.suggestionsContainer
    );
    syncSearchModeMenuResultOffset();
  }

  function activateRenderedOverlaySuggestion(suggestion, query, event, index, item) {
    if (!suggestion) {
      return;
    }
    if (suggestion.type === 'commandNewTab') {
      chrome.runtime.sendMessage({ action: 'openNewTab' });
      removeOverlay(overlayState.overlay);
      return;
    }
    if (suggestion.type === 'commandSettings') {
      chrome.runtime.sendMessage({ action: 'openOptionsPage' });
      removeOverlay(overlayState.overlay);
      return;
    }
    if (suggestion.type === 'commandOpenTabs') {
      overlayState.searchInput.value = '';
      overlayState.latestRawInputValue = '';
      overlayState.latestOverlayQuery = '';
      activateOpenTabsSearchMode();
      overlayState.searchInput.focus();
      return;
    }
    if (suggestion.type === 'commandCopyUrl') {
      chrome.runtime.sendMessage({ action: 'copyCurrentPageUrl' });
      removeOverlay(overlayState.overlay);
      return;
    }
    if (suggestion.type === 'commandDocumentPip') {
      openDocumentPipPickerFromOverlay();
      removeOverlay(overlayState.overlay);
      return;
    }
    if (suggestion.type === 'siteSearchPrompt' && suggestion.provider) {
      activateSiteSearch(suggestion.provider);
      overlayState.searchInput.focus();
      return;
    }
    if (suggestion.type === 'helpFeedback' && suggestion.feedbackKey === 'community') {
      openOverlayCommunityQrDialog(suggestion.url);
      return;
    }
    if (suggestion.type === 'modeSwitch') {
      applyThemeModeChange(suggestion.nextMode);
      overlayState.searchInput.focus();
      return;
    }
    if (suggestion.type === 'webAppearanceSwitch') {
      applyWebAppearanceMode(suggestion.nextMode);
      overlayState.searchInput.focus();
      return;
    }
    if (shouldSwitchMatchedTabSuggestion(suggestion, index)) {
      openMatchedTabSuggestion(suggestion, event, item, query);
      finishOverlayResultActivation(event, Boolean(suggestion.url));
      return;
    }
    if (suggestion.provider && suggestion.searchQuery) {
      if (openSiteSearchProviderQuery(
        suggestion.provider,
        suggestion.searchQuery,
        event
      )) {
        finishOverlayResultActivation(event, true);
      }
      return;
    }
    if (suggestion.forceSearch && suggestion.searchQuery) {
      if (shouldOpenSearchResultInBackgroundTab(event) && suggestion.url) {
        recordSearchSuggestionSelectionFromSuggestion(
          suggestion,
          query,
          'overlay'
        );
        chrome.runtime.sendMessage({
          action: 'createTab',
          url: suggestion.url,
          disposition: 'backgroundTab'
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'searchOrNavigate',
          query: suggestion.searchQuery,
          forceSearch: true
        });
      }
    } else {
      recordSearchSuggestionSelectionFromSuggestion(
        suggestion,
        query,
        'overlay'
      );
      chrome.runtime.sendMessage({
        action: 'createTab',
        url: suggestion.url,
        disposition: getSearchResultCreateDisposition(
          suggestion,
          event,
          item
        )
      });
    }
    finishOverlayResultActivation(
      event,
      !(suggestion.forceSearch && !suggestion.url)
    );
  }

  function deleteRenderedOverlayHistorySuggestion(suggestion) {
    deleteHistorySuggestionUrl(suggestion);
  }

  function attachReactOverlayFavicon(image, pageUrl, host, candidates) {
    const resolvedCandidates = candidates && typeof candidates === 'object'
      ? candidates
      : {};
    overlayState.attachResolvedFaviconWithFallbacks(
      image,
      pageUrl || '',
      host || '',
      resolvedCandidates.primaryUrl || resolvedCandidates.browserUrl || '',
      () => {
        image.dispatchEvent(new CustomEvent('lumno-favicon-fallback', {
          bubbles: true
        }));
      },
      { allowRemoteImage: resolvedCandidates.allowRemoteImage === true }
    );
  }

  function getReactOverlayFaviconCandidates(url, explicitUrl, options) {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.getPageFaviconRenderCandidates(url, explicitUrl, options) : {};
  }

  function ensureOverlaySuggestionsView() {
    if (overlayState.overlaySuggestionsView) {
      return overlayState.overlaySuggestionsView;
    }
    overlayState.overlaySuggestionsView = OVERLAY_SUGGESTIONS_VIEW.createSuggestionsView({
      surface: 'overlay',
      document,
      container: overlayState.suggestionsContainer,
      items: suggestionItems,
      t,
      formatMessage,
      getRiSvg,
      sanitizeDisplayText: SEARCH_UTILS.sanitizeDisplayText,
      formatTabRankDebugText,
      isTabRankScoreDebugEnabled: () => overlayState.overlayTabScoreDebugEnabled,
      shouldBlockFaviconForHost: shouldBlockOverlayFaviconForHost,
      isLocalNetworkHost,
      getChromeFaviconUrl,
      getBrowserPageFaviconUrl: getPageFaviconCandidateUrl,
      getPageFaviconRenderCandidates: getReactOverlayFaviconCandidates,
      getHostFromUrl,
      getUrlDisplay,
      isSimpleModeEnabled: () => overlayState.simpleModeEnabled,
      getThemeHostForSuggestion: (suggestion) => (
        suggestion && suggestion.url ? getHostFromUrl(suggestion.url) : ''
      ),
      getImmediateThemeForSuggestion,
      getThemeForSuggestion,
      getThemeForMode,
      getHoverColors,
      getHighlightColors,
      getNeutralHoverActionColors,
      applyThemeVariables,
      applyMarkVariables,
      applyFaviconOpticalAlignment: overlayState.applyFaviconOpticalAlignment,
      attachFaviconWithFallbacks: attachReactOverlayFavicon,
      preloadIcon: overlayState.preloadIcon,
      onSetSelectedIndex: (nextIndex) => {
        overlayState.selectedIndex = nextIndex;
      },
      getSelectedIndex: () => overlayState.selectedIndex,
      onSwitchToTab: (tab, event) => {
        const suggestion = {
          type: 'openTab',
          title: tab && tab.title ? tab.title : '',
          url: tab && tab.url ? tab.url : '',
          favicon: tab && tab.favIconUrl ? tab.favIconUrl : '',
          _xMatchedTabId: tab && typeof tab.id === 'number' ? tab.id : null
        };
        openMatchedTabSuggestion(
          suggestion,
          event,
          null,
          overlayState.searchInput.value.trim()
        );
        finishOverlayResultActivation(event, Boolean(suggestion.url));
      },
      onActivateSuggestion: activateRenderedOverlaySuggestion,
      onDeleteHistory: deleteRenderedOverlayHistorySuggestion,
      onCopyUrl: copySearchResultUrl,
      showTopActionTooltip,
      hideTopActionTooltip,
      bindCursorTooltip: (target, getText, options) => (
        overlayState.overlayCursorTooltipController.bind(
          target,
          getText,
          Object.assign(
            {
              boundaryElement: overlayState.overlay,
              positionMode: 'absolute'
            },
            options || {}
          )
        )
      ),
      // Fixed in the overlay's shadow root, like the mode menu's tooltip, so it can sit beside the panel.
      getHelpPassageHost: () => overlayState.overlayStyleRoot || document.body,
      getSearchActionLabel,
      getSiteSearchDisplayName,
      isAiSiteSearchProvider,
      getDefaultSearchEngineThemeUrl: getDefaultSearchEngineThemeUrlForOverlay,
      getBrandAccentForUrl,
      buildThemeFromAccent: (accent) => buildTheme(accent),
      actionModel: SUGGESTION_ACTION_MODEL,
      shouldSwitchMatchedTabSuggestion,
      defaultTheme: overlayState.defaultTheme,
      urlHighlightTheme: overlayState.urlHighlightTheme,
      openTabSuggestionLimit: 1000,
      // Keep every visible row immediately keyboard-accessible. Rows below
      // the viewport hydrate during browser idle time; use smaller commits
      // while the host Document is still spending its own loading budget.
      openTabInitialRenderLimit: 10,
      getOpenTabInitialRenderLimit: () =>
        normalizeSearchResultDisplayLimit(overlayState.overlaySearchResultDisplayLimit),
      openTabRenderBatchSize: 16,
      getOpenTabRenderBatchSize: () =>
        overlayState.loadingSessionTrackingActive || document.readyState === 'loading'
          ? 8
          : 16,
      enterAction: 'openNewTab',
      autoHighlightFirstTab: true
    });
    return overlayState.overlaySuggestionsView;
  }

  function renderOverlayEmptyState(message, art) {
    pauseOverlayAntiTranslateObserverForMutationBurst();
    ensureOverlaySuggestionsView().render({
      suggestions: [],
      query: overlayState.latestOverlayQuery,
      emptyMessage: message || t('overlay_empty_result', '无匹配结果'),
      emptyArt: art || 'noResults'
    });
  }

  function renderTabSuggestions(tabList) {
    pauseOverlayAntiTranslateObserverForMutationBurst();
    overlayState.suggestionsContainer.removeAttribute('data-scope-result-enter');
    const reactView = ensureOverlaySuggestionsView();
    suggestionItems.length = 0;
    overlayState.currentSuggestions = [];
    overlayState.lastRenderedQuery = '';
    overlayState.lastRenderedActionContextKey = '';
    const list = Array.isArray(tabList) ? tabList.slice() : [];
    setOpenTabsResultsViewport(true, list.length);
    if (list.length === 0) {
      const emptyText = overlayState.openTabsSearchModeActive
        ? t('overlay_empty_open_tabs', '未找到匹配的已打开标签页')
        : t('overlay_empty_result', '无匹配结果');
      renderOverlayEmptyState(emptyText, 'noTabs');
      setOverlayResultsCollapsed(false, { deferLayoutSync: true });
      commitSuggestionsNaturalHeightAfterRender();
      return;
    }
    reactView.renderTabs(list);
    overlayState.suggestionsContainer.scrollTop = 0;
    setOverlayResultsCollapsed(false, { deferLayoutSync: true });
    overlayState.selectedIndex = -1;
    updateSelection();
    commitSuggestionsNaturalHeightAfterRender();
  }

  function getOverlaySearchModeKey() {
    if (overlayState.openTabsSearchModeActive) {
      return 'openTabs';
    }
    if (overlayState.localSearchScopeState && overlayState.localSearchScopeState.sourceType) {
      return `local:${overlayState.localSearchScopeState.sourceType}`;
    }
    if (overlayState.siteSearchState) {
      if (isAggregateSearchProvider(overlayState.siteSearchState)) {
        return `aggregate:${String(overlayState.siteSearchState.aggregateId || '')}`;
      }
      return `provider:${getSearchModeProviderId(overlayState.siteSearchState)}`;
    }
    return 'default';
  }

  function renderCachedTabsForOverlay(filterQuery) {
    if (!overlayState.overlayTabsCacheReady) {
      return false;
    }
    const query = typeof filterQuery === 'string'
      ? filterQuery
      : String(overlayState.searchInput.value || '').trim();
    renderTabSuggestions(filterTabsForOverlay(overlayState.tabs, query));
    return true;
  }

  function renderCachedTabsOrRequest(filterQuery) {
    if (renderCachedTabsForOverlay(filterQuery)) {
      return;
    }
    if (!overlayTabsRequestInFlight) {
      requestTabsAndRender(filterQuery);
    }
  }

  function requestTabsAndRender(filterQuery) {
    const request = { action: 'getTabsForOverlay' };
    const requestQuery = typeof filterQuery === 'string'
      ? filterQuery
      : String(overlayState.searchInput.value || '').trim();
    const requestModeKey = getOverlaySearchModeKey();
    if (!requestQuery && !shouldShowOpenTabsForEmptyQuery()) {
      clearDefaultOpenTabsSuggestions();
      return;
    }
    if (typeof overlayState.currentOverlayTabId === 'number') {
      request.currentTabId = overlayState.currentOverlayTabId;
    }
    overlayTabsRequestSeq += 1;
    const requestSeq = overlayTabsRequestSeq;
    overlayTabsRequestInFlight = true;
    chrome.runtime.sendMessage(request, (response) => {
      if (requestSeq !== overlayTabsRequestSeq) {
        return;
      }
      overlayTabsRequestInFlight = false;
      const freshTabs = response && Array.isArray(response.tabs) ? response.tabs : [];
      overlayState.currentOverlayTabId = (response && typeof response.currentTabId === 'number')
        ? response.currentTabId
        : null;
      overlayState.tabs = freshTabs;
      overlayState.overlayTabsCacheReady = true;
      if (requestModeKey !== getOverlaySearchModeKey()) {
        return;
      }
      const activeQuery = overlayState.latestOverlayQuery;
      if (!overlayState.openTabsSearchModeActive &&
          (activeQuery || !shouldShowOpenTabsForEmptyQuery())) {
        return;
      }
      renderCachedTabsForOverlay(activeQuery);
    });
  }

  return {
    updateSelection,
    syncSuggestionLastState,
    scrollSelectedSuggestionIntoView,
    getSearchPanelsLayoutTransitionMenu,
    commitSuggestionsNaturalHeightAfterRender,
    ensureOverlaySuggestionsView,
    renderTabSuggestions,
    renderCachedTabsForOverlay,
    renderCachedTabsOrRequest,
    requestTabsAndRender
  };
}

export { createSuggestionsRender };
