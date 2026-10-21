(function(root) {
  // Search modes: site search, local scopes and open tabs, their input
  // prefixes and labels, and the top-site and trigger candidates that suggest
  // switching.
  function createSearchModes(deps) {
    const {
      t,
      SEARCH_UTILS,
      isAggregateSearchProvider,
      formatMessage,
      isAiSiteSearchProvider,
      getDirectNavigationUrl,
      getUrlDisplay,
      cancelPendingOverlaySuggestionRequests,
      clearAutocomplete,
      clearSearchSuggestions,
      getImmediateThemeForSuggestion,
      getThemeForProvider,
      renderCachedTabsForOverlay,
      requestTabsAndRender,
      isSlashCommandInput,
      updateSearchSuggestions,
      requestOverlaySearchSuggestions
    } = deps;

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    const OVERLAY_OPEN_TABS_PREFIX_FEEDBACK_DELAY_MS = 120;
    let pendingOpenTabsPrefixEntryTimer = 0;

    function updateSiteSearchPrefixLayout() {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.updateLayout();
      }
    }

    function setSiteSearchPrefix(provider, theme, options) {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.setProviderPrefix(provider, theme, options);
      }
    }

    function setOpenTabsSearchPrefix(theme, options) {
      if (overlayState.inputModeController) {
        const prefixOptions = options || {};
        overlayState.inputModeController.setPrefixText(
          t('search_open_tabs_only_entry', '搜索已打开标签页'),
          theme,
          {
            animate: prefixOptions.animate !== false,
            iconClass: 'ri-window-line',
            menuIconName: 'browser',
            modeId: 'openTabs',
            preserveModeMenuDoubleTab: Boolean(
              prefixOptions.preserveModeMenuDoubleTab
            )
          }
        );
      }
    }

    function cancelPendingOpenTabsPrefixEntry() {
      if (!pendingOpenTabsPrefixEntryTimer) {
        return false;
      }
      window.clearTimeout(pendingOpenTabsPrefixEntryTimer);
      pendingOpenTabsPrefixEntryTimer = 0;
      return true;
    }

    function scheduleOpenTabsPrefixEntry(options) {
      cancelPendingOpenTabsPrefixEntry();
      const prefixOptions = options || {};
      pendingOpenTabsPrefixEntryTimer = window.setTimeout(() => {
        pendingOpenTabsPrefixEntryTimer = 0;
        if (!overlayState.openTabsSearchModeActive || overlayState.siteSearchState || overlayState.localSearchScopeState) {
          return;
        }
        setOpenTabsSearchPrefix(overlayState.defaultTheme, {
          animate: true,
          preserveModeMenuDoubleTab: Boolean(
            prefixOptions.preserveModeMenuDoubleTab
          )
        });
      }, OVERLAY_OPEN_TABS_PREFIX_FEEDBACK_DELAY_MS);
    }

    function clearSiteSearchPrefix() {
      if (overlayState.inputModeController) {
        overlayState.inputModeController.clearProviderPrefix();
      }
    }

    function getSiteSearchDisplayName(provider) {
      if (!provider) {
        return t('site_search_default', '站内');
      }
      const mapping = SEARCH_UTILS.getSiteSearchProviderDisplayNameMessage(provider);
      if (mapping) {
        return t(mapping.messageKey, mapping.fallback);
      }
      return provider.name || provider.key || t('site_search_default', '站内');
    }

    function getSiteSearchActionTitle(provider, query) {
      const site = getSiteSearchDisplayName(provider);
      const queryText = String(query || '').trim();
      if (isAggregateSearchProvider(provider)) {
        return queryText
          ? formatMessage('aggregate_search_action_query', '使用{name}搜索“{query}”', {
              name: site,
              query: queryText
            })
          : formatMessage('aggregate_search_action', '使用{name}搜索', { name: site });
      }
      if (isAiSiteSearchProvider(provider)) {
        return queryText
          ? formatMessage('ask_ai_provider_query', '向 {site} 提问 "{query}"', { site, query: queryText })
          : formatMessage('ask_ai_provider', '向 {site} 提问', { site });
      }
      return queryText
        ? formatMessage('search_in_site_query', '在 {site} 中搜索 "{query}"', { site, query: queryText })
        : formatMessage('search_in_site', '在 {site} 中搜索', { site });
    }

    function getSiteSearchPrefixText(provider) {
      if (isAiSiteSearchProvider(provider)) {
        return getSiteSearchDisplayName(provider);
      }
      return getSiteSearchDisplayName(provider) || formatMessage('search_in_site', '在 {site} 中搜索', {
        site: provider && provider.name ? provider.name : ''
      });
    }

    function getInlineSiteSearchCandidate(input, providers) {
      return SEARCH_UTILS.getInlineSiteSearchCandidate(input, providers);
    }

    function promoteStrongNavigationMatch(list, rawQuery) {
      return SEARCH_UTILS.promoteStrongNavigationMatch(list, rawQuery, {
        getDirectNavigationUrl,
        getUrlDisplay
      });
    }

    function getKeywordSearchSuggestionState(list) {
      return SEARCH_UTILS.getKeywordSearchSuggestionState(list);
    }

    function matchesTopSitePrefix(suggestion, input) {
      if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
        return false;
      }
      const query = String(input || '').trim().toLowerCase();
      if (!query) {
        return false;
      }
      const titleText = String(suggestion.title || '').toLowerCase();
      if (titleText.startsWith(query)) {
        return true;
      }
      const urlText = getUrlDisplay(suggestion.url || '');
      if (!urlText) {
        return false;
      }
      const host = urlText.split('/')[0] || '';
      return host.toLowerCase().startsWith(query);
    }

    function getTopSiteMatchCandidate(list, input) {
      if (!Array.isArray(list)) {
        return null;
      }
      const query = String(input || '').trim();
      if (!query || /\s/.test(query)) {
        return null;
      }
      let fallback = null;
      for (let i = 0; i < list.length; i += 1) {
        const suggestion = list[i];
        if (!suggestion || !(suggestion.type === 'topSite' || suggestion.isTopSite)) {
          continue;
        }
        const urlText = getUrlDisplay(suggestion.url || '');
        const host = urlText ? (urlText.split('/')[0] || '') : '';
        if (host && host.toLowerCase().startsWith(query.toLowerCase())) {
          return suggestion;
        }
        if (!fallback && matchesTopSitePrefix(suggestion, query)) {
          fallback = suggestion;
        }
      }
      return fallback;
    }

    function promoteTopSiteMatch(list, queryText) {
      const match = getTopSiteMatchCandidate(list, queryText);
      if (!match) {
        return null;
      }
      const matchIndex = list.indexOf(match);
      const firstResultIndex = Array.isArray(list)
        ? list.findIndex((item) => item && item.type !== 'newtab')
        : -1;
      if (matchIndex !== firstResultIndex) {
        return null;
      }
      if (matchIndex > 0) {
        const [picked] = list.splice(matchIndex, 1);
        list.unshift(picked);
        return picked;
      }
      if (matchIndex === 0) {
        return list[0];
      }
      return null;
    }

    function getSiteSearchTriggerCandidate(input, providers, topSiteMatch) {
      return SEARCH_UTILS.getSiteSearchTriggerCandidate(input, providers, topSiteMatch, {
        matchesTopSitePrefix
      });
    }

    function getLocalSearchScopeCandidate(input, rules) {
      const scope = SEARCH_UTILS.findLocalSearchScope(input, rules);
      if (!scope || !overlayState.enabledSearchResultSourceTypes.includes(scope.sourceType)) {
        return null;
      }
      return scope;
    }

    function getLocalSearchScopeLabel(scope) {
      const sourceType = scope && scope.sourceType ? scope.sourceType : '';
      if (sourceType === 'bookmark') {
        return t('search_tag_bookmark', '书签');
      }
      if (sourceType === 'history') {
        return t('search_tag_history', '历史');
      }
      if (sourceType === 'topSite') {
        return t('search_tag_top_site', '常用');
      }
      return '';
    }

    function getLocalSearchScopeIconClass(sourceType) {
      if (sourceType === 'bookmark') {
        return 'ri-bookmark-3-line';
      }
      if (sourceType === 'history') {
        return 'ri-history-line';
      }
      return 'ri-star-line';
    }

    function getLocalSearchScopeTabHintProvider(scope) {
      const source = getLocalSearchScopeLabel(scope);
      return {
        name: source,
        tabHintLabel: formatMessage(
          'local_search_tab_hint',
          '仅搜索{source}',
          { source }
        )
      };
    }

    function setLocalSearchScopePrefix(scope) {
      if (!overlayState.inputModeController || !scope) {
        return;
      }
      overlayState.inputModeController.setPrefixText(
        getLocalSearchScopeLabel(scope),
        overlayState.defaultTheme,
        {
          animate: true,
          iconClass: getLocalSearchScopeIconClass(scope.sourceType),
          menuIconName: scope.sourceType === 'topSite' ? 'star' : scope.sourceType,
          modeId: `local:${scope.sourceType}`
        }
      );
    }

    function activateLocalSearchScope(scope, activationOptions) {
      if (!scope || !overlayState.enabledSearchResultSourceTypes.includes(scope.sourceType)) {
        return false;
      }
      const options = activationOptions && typeof activationOptions === 'object'
        ? activationOptions
        : {};
      cancelPendingOverlaySuggestionRequests();
      overlayState.openTabsSearchModeActive = false;
      overlayState.localSearchScopeState = scope;
      overlayState.localSearchScopeTriggerState = null;
      overlayState.siteSearchState = null;
      overlayState.siteSearchTriggerState = null;
      overlayState.inlineSearchState = null;
      overlayState.searchInput.value = '';
      overlayState.latestRawInputValue = '';
      overlayState.latestOverlayQuery = '';
      clearAutocomplete();
      setLocalSearchScopePrefix(scope);
      if (options.preserveResults !== true) {
        clearSearchSuggestions();
      }
      return true;
    }

    function clearLocalSearchScope() {
      if (!overlayState.localSearchScopeState) {
        return false;
      }
      overlayState.overlaySuggestionRequestSeq += 1;
      overlayState.localSearchScopeState = null;
      overlayState.localSearchScopeTriggerState = null;
      overlayState.inlineSearchState = null;
      clearSiteSearchPrefix();
      clearAutocomplete();
      return true;
    }

    function activateSiteSearch(provider, activationOptions) {
      if (!provider) {
        return;
      }
      const options = activationOptions && typeof activationOptions === 'object'
        ? activationOptions
        : {};
      cancelPendingOpenTabsPrefixEntry();
      if (options.preserveResults === true) {
        cancelPendingOverlaySuggestionRequests();
      }
      overlayState.openTabsSearchModeActive = false;
      overlayState.localSearchScopeState = null;
      overlayState.localSearchScopeTriggerState = null;
      overlayState.siteSearchState = provider;
      overlayState.inlineSearchState = null;
      overlayState.searchInput.value = '';
      overlayState.latestRawInputValue = '';
      overlayState.latestOverlayQuery = '';
      clearAutocomplete();
      const immediateTheme = getImmediateThemeForSuggestion({ provider }) || overlayState.defaultTheme;
      setSiteSearchPrefix(provider, immediateTheme, {
        animate: options.animatePrefix !== false
      });
      getThemeForProvider(provider).then((theme) => {
        if (overlayState.siteSearchState === provider) {
          setSiteSearchPrefix(provider, theme);
        }
      });
      if (options.preserveResults !== true) {
        clearSearchSuggestions();
      }
    }

    function clearSiteSearch() {
      if (!overlayState.siteSearchState) {
        return;
      }
      overlayState.siteSearchState = null;
      overlayState.inlineSearchState = null;
      clearSiteSearchPrefix();
      clearAutocomplete();
    }

    function activateOpenTabsSearchMode(options) {
      const prefixOptions = options || {};
      cancelPendingOpenTabsPrefixEntry();
      cancelPendingOverlaySuggestionRequests();
      overlayState.openTabsSearchModeActive = true;
      overlayState.siteSearchState = null;
      overlayState.localSearchScopeState = null;
      overlayState.localSearchScopeTriggerState = null;
      overlayState.inlineSearchState = null;
      overlayState.siteSearchTriggerState = null;
      clearAutocomplete();
      if (prefixOptions.deferPrefixEntry === true) {
        scheduleOpenTabsPrefixEntry(prefixOptions);
      } else {
        setOpenTabsSearchPrefix(overlayState.defaultTheme, prefixOptions);
      }
      overlayState.latestRawInputValue = overlayState.searchInput.value || '';
      overlayState.latestOverlayQuery = overlayState.latestRawInputValue.trim();
      if (prefixOptions.deferResults !== true) {
        renderCachedTabsForOverlay(overlayState.latestOverlayQuery);
        requestTabsAndRender(overlayState.latestOverlayQuery);
      }
    }

    function clearOpenTabsSearchMode() {
      if (!overlayState.openTabsSearchModeActive) {
        return;
      }
      cancelPendingOpenTabsPrefixEntry();
      overlayState.openTabsSearchModeActive = false;
      clearSiteSearchPrefix();
      clearAutocomplete();
      const rawValue = overlayState.searchInput.value || '';
      const query = rawValue.trim();
      overlayState.latestRawInputValue = rawValue;
      overlayState.latestOverlayQuery = query;
      if (!query) {
        clearSearchSuggestions();
        return;
      }
      if (isSlashCommandInput(query)) {
        updateSearchSuggestions([], query);
        return;
      }
      requestOverlaySearchSuggestions(query);
    }

    return {
      updateSiteSearchPrefixLayout,
      setSiteSearchPrefix,
      cancelPendingOpenTabsPrefixEntry,
      getSiteSearchDisplayName,
      getSiteSearchActionTitle,
      getSiteSearchPrefixText,
      getInlineSiteSearchCandidate,
      promoteStrongNavigationMatch,
      getKeywordSearchSuggestionState,
      getTopSiteMatchCandidate,
      promoteTopSiteMatch,
      getSiteSearchTriggerCandidate,
      getLocalSearchScopeCandidate,
      getLocalSearchScopeLabel,
      getLocalSearchScopeIconClass,
      getLocalSearchScopeTabHintProvider,
      setLocalSearchScopePrefix,
      activateLocalSearchScope,
      clearLocalSearchScope,
      activateSiteSearch,
      clearSiteSearch,
      activateOpenTabsSearchMode,
      clearOpenTabsSearchMode
    };
  }

  root.LumnoOverlayPanelSearchModes = { createSearchModes };
})(globalThis);
