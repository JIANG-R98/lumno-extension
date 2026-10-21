(function(root) {
  // Building suggestions: keywords, direct navigation, help center
  // answers, and the update that merges local, tab and remote results.
  function createSuggestionSources(deps) {
    const {
      formatMessage,
      getPageFaviconCandidateUrl,
      isLocalNetworkInput,
      getHostFromUrl,
      isLocalNetworkHost,
      SUGGESTION_ACTION_MODEL,
      getSystemLocale,
      SETTINGS,
      SEARCH_UTILS,
      getProviderIcon,
      COMMUNITY_LINKS,
      t,
      isSlashCommandInput,
      isModeCommand,
      THEME_STORAGE_KEY,
      applyOverlayTheme,
      buildDefaultSearchUrlForOverlay,
      getDefaultSearchEngineFaviconUrlForOverlay,
      getCommandMatches,
      buildModeSuggestion,
      buildCommandSuggestion,
      isCurrentOverlayTabUrl,
      getSearchTriggerProviders,
      getSiteSearchProviders,
      getInlineSiteSearchCandidate,
      buildSearchUrl,
      getSiteSearchActionTitle,
      isAggregateSearchProvider,
      getMatchedOpenTabIdForSuggestion,
      filterOverlayBlacklistedSuggestions,
      getKeywordSearchSuggestionState,
      promoteStrongNavigationMatch,
      promoteTopSiteMatch,
      getSiteSearchTriggerCandidate,
      getAutocompleteCandidate,
      getUrlDisplay,
      clearAutocomplete,
      applyAutocomplete,
      getLocalSearchScopeCandidate,
      setSiteSearchTabHint,
      getLocalSearchScopeTabHintProvider,
      clearSiteSearchTabHint,
      limitOverlaySuggestionsForDisplay,
      getSearchPanelsLayoutTransitionMenu,
      pauseOverlayAntiTranslateObserverForMutationBurst,
      setOpenTabsResultsViewport,
      ensureOverlaySuggestionsView,
      setOverlayResultsCollapsed,
      syncSuggestionLastState,
      updateSelection,
      commitSuggestionsNaturalHeightAfterRender,
      cancelPendingOverlaySuggestionRequests,
      shouldShowOpenTabsForEmptyQuery,
      requestTabsAndRender,
      clearDefaultOpenTabsSuggestions
    } = deps;

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    const BROWSER_PROFILE = globalThis.LumnoBrowserProfile;
    const HELP_CENTER_SEARCH = globalThis.LumnoHelpCenterSearch;
    function getSearchUtilsRuntime() {
      return globalThis.LumnoSearchUtils;
    }
    // Lumno Help Center search lists the matching help pages under its search row.
    let helpCenterSuggestionSource = null;
    let helpCenterFeedbackLinksRequested = false;
    let pendingProviderReload = false;

    function getBrowserPageSuggestionTitle(browserProfile, targetUrl) {
      const browserName = browserProfile && browserProfile.name ? browserProfile.name : '';
      if (browserName) {
        return formatMessage('open_browser_url', '打开 {browser}：{url}', {
          browser: browserName,
          url: targetUrl
        });
      }
      return formatMessage('open_url', '打开 {url}', { url: targetUrl });
    }

    function getShortcutRules() {
      const cacheKey = '_x_extension_shortcut_rules_2024_unique_';
      const promiseKey = '_x_extension_shortcut_rules_promise_2024_unique_';
      if (window[cacheKey]) {
        return Promise.resolve(window[cacheKey]);
      }
      if (window[promiseKey]) {
        return window[promiseKey];
      }
      const rulesUrl = chrome.runtime.getURL('assets/data/shortcut-rules.json');
      const rulesPromise = fetch(rulesUrl)
        .then((response) => response.json())
        .then((data) => {
          const items = data && Array.isArray(data.items) ? data.items : [];
          window[cacheKey] = items;
          return items;
        })
        .catch(() => new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'getShortcutRules' }, (response) => {
            const items = response && Array.isArray(response.items) ? response.items : [];
            window[cacheKey] = items;
            resolve(items);
          });
        }));
      window[promiseKey] = rulesPromise;
      return rulesPromise;
    }

    function buildKeywordSuggestions(input, rules) {
      const queryLower = input.toLowerCase();
      const browserProfile = BROWSER_PROFILE.getBrowserInternalProfile(navigator);
      const scheme = browserProfile.scheme;
      const matches = [];
      rules.forEach((rule) => {
        if (!rule || !Array.isArray(rule.keys)) {
          return;
        }
        const isMatch = rule.keys.some((key) => queryLower.startsWith(key));
        if (!isMatch) {
          return;
        }
        if (rule.type === 'browserPage' && rule.path) {
          if (!BROWSER_PROFILE.canOpenBrowserPages(scheme)) {
            return;
          }
          const targetUrl = `${scheme}${rule.path}`;
          matches.push({
            type: 'browserPage',
            title: getBrowserPageSuggestionTitle(browserProfile, targetUrl),
            url: targetUrl,
            favicon: getPageFaviconCandidateUrl(targetUrl) ||
              'https://img.icons8.com/?size=100&id=1LqgD1Q7n2fy&format=png&color=000000'
          });
        } else if (rule.type === 'url' && rule.url) {
          matches.push({
            type: 'browserPage',
            title: formatMessage('open_url', '打开 {url}', { url: rule.url }),
            url: rule.url,
            favicon: getPageFaviconCandidateUrl(rule.url) ||
              'https://img.icons8.com/?size=100&id=1LqgD1Q7n2fy&format=png&color=000000'
          });
        }
      });
      return matches;
    }

    function getDirectNavigationUrl(input) {
      const searchUtils = getSearchUtilsRuntime();
      if (searchUtils && typeof searchUtils.getDirectNavigationUrl === 'function') {
        return searchUtils.getDirectNavigationUrl(input);
      }
      return '';
    }

    function getDirectUrlSuggestion(input) {
      const targetUrl = getDirectNavigationUrl(input);
      if (!targetUrl) {
        return null;
      }
      let isLocalNetwork = isLocalNetworkInput(input);
      if (!isLocalNetwork) {
        const host = getHostFromUrl(targetUrl);
        isLocalNetwork = isLocalNetworkHost(host);
      }
      return {
        type: 'directUrl',
        title: formatMessage('open_url', '打开 {url}', { url: targetUrl }),
        url: targetUrl,
        favicon: getPageFaviconCandidateUrl(targetUrl),
        isLocalNetwork: isLocalNetwork
      };
    }

    function resolveQuickNavigation(query) {
      const directUrlSuggestion = getDirectUrlSuggestion(query);
      if (directUrlSuggestion) {
        return Promise.resolve(directUrlSuggestion.url);
      }
      return getShortcutRules().then((rules) => {
        const keywordSuggestions = buildKeywordSuggestions(query, rules);
        if (keywordSuggestions.length > 0) {
          return keywordSuggestions[0].url;
        }
        return null;
      });
    }

    function getSuggestionUpdateKind(options) {
      return SUGGESTION_ACTION_MODEL.getSuggestionUpdateKind({
        ...(options || {}),
        includeDebugReasons: Boolean(overlayState.overlayTabScoreDebugEnabled)
      });
    }

    function getSuggestionActionContextKey(options) {
      return SUGGESTION_ACTION_MODEL.getActionContextKey(options);
    }

    function getHelpCenterLocale() {
      return overlayState.overlayLanguageMode === 'system' ? getSystemLocale() : SETTINGS.normalizeLocale(overlayState.overlayLanguageMode);
    }

    function getHelpCenterSuggestions(query) {
      if (!HELP_CENTER_SEARCH || !SEARCH_UTILS.isHelpCenterSiteSearchProvider(overlayState.siteSearchState)) {
        return [];
      }
      if (!helpCenterSuggestionSource) {
        helpCenterSuggestionSource = HELP_CENTER_SEARCH.createSuggestionSource({
          sendMessage: (message, callback) => {
            try {
              chrome.runtime.sendMessage(message, (response) => {
                callback(chrome.runtime.lastError ? null : response);
              });
              return true;
            } catch (error) {
              return false;
            }
          },
          onUpdate: (updatedQuery) => {
            if (updatedQuery === overlayState.latestOverlayQuery) {
              updateSearchSuggestions(overlayState.lastSuggestionResponse, updatedQuery);
            }
          }
        });
      }
      const locale = getHelpCenterLocale();
      return helpCenterSuggestionSource.getSuggestions(
        query,
        locale,
        getProviderIcon(overlayState.siteSearchState),
        getHelpCenterFeedback(query, locale)
      );
    }

    // Where to ask when the help center has nothing; community links are fetched fresh once.
    function getHelpCenterFeedback(query, locale) {
      if (!COMMUNITY_LINKS) {
        return null;
      }
      if (!helpCenterFeedbackLinksRequested) {
        helpCenterFeedbackLinksRequested = true;
        COMMUNITY_LINKS.load().then(() => {
          if (query === overlayState.latestOverlayQuery) {
            updateSearchSuggestions(overlayState.lastSuggestionResponse, query);
          }
        });
      }
      const links = COMMUNITY_LINKS.getLinks();
      return {
        links,
        channel: COMMUNITY_LINKS.getCommunityChannel(links, locale),
        t
      };
    }

    function updateSearchSuggestions(suggestions, query, options) {
      if (query !== overlayState.latestOverlayQuery) {
        return;
      }
      const renderOptions = options && typeof options === 'object' ? options : {};
      const forceFullRerender = renderOptions.forceFullRerender === true;
      const finalRemoteMix = renderOptions.finalRemoteMix === true;
      const remoteMixState = renderOptions.remoteMixState && typeof renderOptions.remoteMixState === 'object'
        ? renderOptions.remoteMixState
        : null;
      overlayState.lastSuggestionResponse = Array.isArray(suggestions) ? suggestions : [];
      const rawTagInput = (overlayState.latestRawInputValue || query || '').trim();
      const localSearchQueryModeActive = Boolean(overlayState.localSearchScopeState && String(query || '').trim());
      const slashCommandModeActive = !localSearchQueryModeActive && isSlashCommandInput(rawTagInput);
      const siteSearchQueryModeActive = !localSearchQueryModeActive &&
        !slashCommandModeActive &&
        Boolean(overlayState.siteSearchState && String(query || '').trim());
      const modeCommandActive = slashCommandModeActive && !siteSearchQueryModeActive && isModeCommand(rawTagInput);
      if (modeCommandActive) {
        if (overlayState.storageArea) {
          overlayState.storageArea.get([THEME_STORAGE_KEY], (result) => {
            const storedMode = result[THEME_STORAGE_KEY] || 'system';
            if (storedMode !== overlayState.overlayThemeMode && query === overlayState.latestOverlayQuery) {
              applyOverlayTheme(storedMode);
              updateSearchSuggestions([], query);
            }
          });
        }
      }

      // Add New Tab suggestion as first item
      const newTabSuggestion = (localSearchQueryModeActive || slashCommandModeActive ||
          modeCommandActive || siteSearchQueryModeActive)
        ? null
        : {
          type: 'newtab',
          title: overlayState.simpleModeEnabled
            ? query
            : formatMessage('search_query', '搜索 "{query}"', {
                query: query
              }),
          url: buildDefaultSearchUrlForOverlay(query),
          favicon: getDefaultSearchEngineFaviconUrlForOverlay(),
          searchQuery: query,
          forceSearch: true
        };

      // Add ChatGPT suggestion as second item
      // const chatGptSuggestion = {
      //   type: 'chatgpt',
      //   title: `Ask ChatGPT: "${query}"`,
      //   url: `https://chatgpt.com/?q=${encodeURIComponent(query)}`,
      //   favicon: 'https://img.icons8.com/?size=100&id=fO5yVwARGUEB&format=png&color=ffffff'
      // };

      // Add Perplexity suggestion as third item
      // const perplexitySuggestion = {
      //   type: 'perplexity',
      //   title: `Ask Perplexity: "${query}"`,
      //   url: `https://perplexity.ai/search?q=${encodeURIComponent(query)}`,
      //   favicon: 'https://img.icons8.com/?size=100&id=kzJWN5jCDzpq&format=png&color=000000'
      // };

      getShortcutRules().then((rules) => {
        if (query !== overlayState.latestOverlayQuery) {
          return;
        }
        if (!finalRemoteMix && remoteMixState && remoteMixState.settled) {
          return;
        }
        const commandMatches = (slashCommandModeActive && !modeCommandActive && !siteSearchQueryModeActive)
          ? getCommandMatches(rawTagInput)
          : [];
        const hasCommand = commandMatches.length > 0;
        const preSuggestions = [];
        if (modeCommandActive) {
          preSuggestions.push(buildModeSuggestion());
        } else if (slashCommandModeActive && !siteSearchQueryModeActive) {
          commandMatches.forEach((command) => {
            preSuggestions.push(buildCommandSuggestion(command));
          });
        } else if (!siteSearchQueryModeActive && !localSearchQueryModeActive) {
          const directUrlSuggestion = getDirectUrlSuggestion(query);
          if (directUrlSuggestion && !isCurrentOverlayTabUrl(directUrlSuggestion.url)) {
            preSuggestions.push(directUrlSuggestion);
          }
          const keywordSuggestions = buildKeywordSuggestions(query, rules);
          preSuggestions.push(...keywordSuggestions);
        }

        const siteProvidersForTags = (overlayState.siteSearchProvidersCache && overlayState.siteSearchProvidersCache.length > 0)
          ? overlayState.siteSearchProvidersCache
          : overlayState.defaultSiteSearchProviders;
        const providersForTags = getSearchTriggerProviders(
          siteProvidersForTags,
          overlayState.aggregateSearchesCache
        );
        if (!overlayState.siteSearchProvidersCache && !pendingProviderReload) {
          pendingProviderReload = true;
          getSiteSearchProviders().then((items) => {
            pendingProviderReload = false;
            if (query !== overlayState.latestOverlayQuery) {
              return;
            }
            updateSearchSuggestions(overlayState.lastSuggestionResponse, query);
          });
        }
        const rawTagInputForInline = (overlayState.latestRawInputValue || overlayState.searchInput.value || '').trim();
        const inlineCandidate = (!localSearchQueryModeActive && !slashCommandModeActive &&
            !siteSearchQueryModeActive && !modeCommandActive && !hasCommand)
          ? getInlineSiteSearchCandidate(rawTagInputForInline, providersForTags)
          : null;
        let inlineSuggestion = null;
        if (inlineCandidate) {
          const inlineUrl = buildSearchUrl(
            inlineCandidate.provider.template,
            inlineCandidate.query,
            inlineCandidate.provider
          );
          if (inlineUrl) {
            inlineSuggestion = {
              type: 'inlineSiteSearch',
              title: getSiteSearchActionTitle(inlineCandidate.provider),
              url: inlineUrl,
              favicon: getProviderIcon(inlineCandidate.provider),
              provider: inlineCandidate.provider,
              searchQuery: inlineCandidate.query
            };
          }
        }

        const siteSearchSuggestion = siteSearchQueryModeActive
          ? (() => {
              const aggregateSearch = isAggregateSearchProvider(overlayState.siteSearchState);
              const siteUrl = aggregateSearch
                ? ''
                : buildSearchUrl(overlayState.siteSearchState.template, query, overlayState.siteSearchState);
              if (!aggregateSearch && !siteUrl) {
                return null;
              }
              return {
                type: 'siteSearch',
                title: getSiteSearchActionTitle(overlayState.siteSearchState, query),
                url: siteUrl,
                favicon: aggregateSearch ? '' : getProviderIcon(overlayState.siteSearchState),
                provider: overlayState.siteSearchState,
                searchQuery: query
              };
            })()
          : null;

        // Add New Tab, ChatGPT and Perplexity suggestions to the beginning
        let allSuggestions = localSearchQueryModeActive
          ? suggestions.filter((item) => (
            item &&
            overlayState.localSearchScopeState &&
            item.type === overlayState.localSearchScopeState.sourceType
          ))
          : (slashCommandModeActive ? [...preSuggestions] : (siteSearchQueryModeActive
            ? (siteSearchSuggestion ? [siteSearchSuggestion, ...getHelpCenterSuggestions(query)] : [])
            : (modeCommandActive ? [...preSuggestions] : [...preSuggestions, newTabSuggestion, /*chatGptSuggestion, perplexitySuggestion,*/ ...suggestions])));
        allSuggestions.forEach((item) => {
          if (!item || !item.url) {
            return;
          }
          const matchedTabId = getMatchedOpenTabIdForSuggestion(item);
          if (typeof matchedTabId === 'number') {
            item._xMatchedTabId = matchedTabId;
            return;
          }
          if (Object.prototype.hasOwnProperty.call(item, '_xMatchedTabId')) {
            delete item._xMatchedTabId;
          }
        });
        allSuggestions = filterOverlayBlacklistedSuggestions(allSuggestions, query);
        const hasDirectUrlSuggestion = preSuggestions.some((suggestion) => (
          suggestion && suggestion.type === 'directUrl'
        ));
        if (overlayState.overlaySearchResultPriorityMode === 'search' &&
            !localSearchQueryModeActive &&
            !slashCommandModeActive &&
            !modeCommandActive &&
            !siteSearchQueryModeActive &&
            !hasDirectUrlSuggestion) {
          allSuggestions = SEARCH_UTILS.composeSearchFirstSuggestionSlate(allSuggestions, {
            limit: overlayState.overlaySearchResultDisplayLimit
          });
        }
        const keywordSuggestionState = getKeywordSearchSuggestionState(allSuggestions);
        const onlyKeywordSuggestions = keywordSuggestionState.onlyKeywordSuggestions;

        let primaryHighlightIndex = -1;
        let primaryHighlightReason = 'none';
        let mergedProvider = null;
        let primarySuggestion = null;
        if (!localSearchQueryModeActive && !slashCommandModeActive && !modeCommandActive && !hasCommand) {
          const rankedSlate = SEARCH_UTILS.rankSearchSuggestionSlate(allSuggestions, {
            query,
            rawQuery: overlayState.latestRawInputValue,
            triggerInput: rawTagInput,
            providers: providersForTags,
            inlineSuggestion,
            siteSearchActive: Boolean(overlayState.siteSearchState),
            preferAutocompleteFirst: overlayState.overlaySearchResultPriorityMode !== 'search',
            onlyKeywordSuggestions,
            autocompleteSuggestions: keywordSuggestionState.autocompleteSuggestions,
            openTabMatch: overlayState.overlayTabQuickSwitchEnabled || overlayState.prioritizeCurrentPageMatch
              ? {
                  prioritizeCurrentPageMatch: overlayState.prioritizeCurrentPageMatch,
                  currentTabId: overlayState.currentOverlayTabId,
                  openTabQuickSwitchEnabled: overlayState.overlayTabQuickSwitchEnabled,
                  getDirectNavigationUrl
                }
              : null,
            matchers: {
              promoteStrongNavigationMatch,
              promoteTopSiteMatch,
              getSiteSearchTriggerCandidate,
              getAutocompleteCandidate,
              getUrlDisplay,
              filterSuggestions: (list) => filterOverlayBlacklistedSuggestions(list, query)
            }
          });
          allSuggestions = rankedSlate.suggestions;
          primaryHighlightIndex = rankedSlate.primaryHighlightIndex;
          primaryHighlightReason = rankedSlate.primaryHighlightReason;
          primarySuggestion = rankedSlate.primarySuggestion;
          mergedProvider = rankedSlate.mergedProvider;
          const siteSearchTrigger = rankedSlate.siteSearchTrigger;
          if (onlyKeywordSuggestions) {
            clearAutocomplete();
          } else {
            applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason);
          }
          const inlineAutoHighlight = Boolean(inlineSuggestion && primaryHighlightIndex === 0);
          overlayState.inlineSearchState = inlineSuggestion
            ? {
                url: inlineSuggestion.url,
                provider: inlineSuggestion.provider,
                query: inlineSuggestion.searchQuery || '',
                rawInput: rawTagInputForInline,
                isAuto: inlineAutoHighlight
              }
            : null;
          const resolvedProvider = siteSearchTrigger;
          const resolvedLocalScope = !resolvedProvider
            ? getLocalSearchScopeCandidate(rawTagInputForInline, rules)
            : null;
          overlayState.siteSearchTriggerState = resolvedProvider
            ? { provider: resolvedProvider, rawInput: rawTagInputForInline }
            : null;
          overlayState.localSearchScopeTriggerState = resolvedLocalScope
            ? { scope: resolvedLocalScope, rawInput: rawTagInputForInline }
            : null;
          if (overlayState.siteSearchTriggerState) {
            setSiteSearchTabHint(resolvedProvider);
          } else if (overlayState.localSearchScopeTriggerState) {
            setSiteSearchTabHint(getLocalSearchScopeTabHintProvider(resolvedLocalScope));
          } else {
            clearSiteSearchTabHint();
          }
        } else if (localSearchQueryModeActive) {
          clearAutocomplete();
          overlayState.inlineSearchState = null;
          overlayState.siteSearchTriggerState = null;
          overlayState.localSearchScopeTriggerState = null;
          clearSiteSearchTabHint();
          if (allSuggestions.length > 0) {
            primaryHighlightIndex = 0;
            primaryHighlightReason = 'localScope';
            primarySuggestion = allSuggestions[0];
          }
        } else if (modeCommandActive) {
          clearAutocomplete();
          overlayState.inlineSearchState = null;
          overlayState.siteSearchTriggerState = null;
          overlayState.localSearchScopeTriggerState = null;
          clearSiteSearchTabHint();
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'modeSwitch';
        } else if (slashCommandModeActive) {
          clearAutocomplete();
          overlayState.inlineSearchState = null;
          overlayState.siteSearchTriggerState = null;
          overlayState.localSearchScopeTriggerState = null;
          clearSiteSearchTabHint();
          primaryHighlightIndex = 0;
          primaryHighlightReason = 'command';
        }
        if (hasCommand) {
          applyAutocomplete(allSuggestions, primarySuggestion, primaryHighlightReason);
        }
        allSuggestions = limitOverlaySuggestionsForDisplay(allSuggestions, {
          uncapped: slashCommandModeActive
        });
        const actionContextKey = getSuggestionActionContextKey({
          primaryHighlightIndex,
          primaryHighlightReason,
          onlyKeywordSuggestions,
          primarySuggestion,
          mergedProvider
        });
        const updateKind = getSuggestionUpdateKind({
          forceFullRerender,
          query,
          lastRenderedQuery: overlayState.lastRenderedQuery,
          actionContextKey,
          lastRenderedActionContextKey: overlayState.lastRenderedActionContextKey,
          currentSuggestions: overlayState.currentSuggestions,
          allSuggestions
        });
        const shouldAnimateScopeResultEnter = Boolean(
          getSearchPanelsLayoutTransitionMenu() &&
          siteSearchQueryModeActive &&
          updateKind === 'structure' &&
          overlayState.currentSuggestions.length === 0 &&
          allSuggestions.some((suggestion) => suggestion && suggestion.type === 'siteSearch')
        );
        const canAppend = updateKind === 'append';
        const shouldPreserveVisualState =
          updateKind === 'content' || updateKind === 'append';
        const previousScrollTop = shouldPreserveVisualState
          ? Math.max(0, Number(overlayState.suggestionsContainer.scrollTop) || 0)
          : 0;
        const startIndex = canAppend ? overlayState.currentSuggestions.length : 0;
        pauseOverlayAntiTranslateObserverForMutationBurst();
        setOpenTabsResultsViewport(false);
        const reactView = ensureOverlaySuggestionsView();
        overlayState.currentSuggestions = allSuggestions;
        overlayState.lastRenderedQuery = query;
        overlayState.lastRenderedActionContextKey = actionContextKey;
        if (updateKind !== 'highlight') {
          overlayState.warmIconCache(allSuggestions.filter((item) => (
            item && item.type !== 'directUrl'
          )));
        }
        const emptyMessage = slashCommandModeActive && allSuggestions.length === 0
          ? t('slash_command_empty', '无匹配命令')
          : (localSearchQueryModeActive && allSuggestions.length === 0
            ? t('overlay_empty_result', '无匹配结果')
            : '');
        reactView.render({
          suggestions: allSuggestions,
          query,
          updateKind,
          canAppend,
          startIndex,
          primaryHighlightIndex,
          primarySuggestion,
          primaryHighlightReason,
          onlyKeywordSuggestions,
          mergedProvider,
          emptyMessage
        });
        // Reveal only after the target rows render, then adopt their natural
        // height directly in the same commit.
        setOverlayResultsCollapsed(false, {
          deferLayoutSync: true
        });
        if (shouldAnimateScopeResultEnter) {
          overlayState.suggestionsContainer.setAttribute('data-scope-result-enter', 'run');
        } else {
          overlayState.suggestionsContainer.removeAttribute('data-scope-result-enter');
        }
        if (updateKind !== 'highlight') {
          if (shouldPreserveVisualState) {
            overlayState.suggestionsContainer.scrollTop = previousScrollTop;
          }
          syncSuggestionLastState();
          updateSelection();
        }
        commitSuggestionsNaturalHeightAfterRender();
        if (updateKind === 'structure') {
          overlayState.selectedIndex = -1;
        }
      });
    }
    function clearSearchSuggestions() {
      cancelPendingOverlaySuggestionRequests();
      overlayState.inlineSearchState = null;
      overlayState.siteSearchTriggerState = null;
      overlayState.localSearchScopeTriggerState = null;
      clearSiteSearchTabHint();
      overlayState.lastSuggestionResponse = [];
      if (shouldShowOpenTabsForEmptyQuery()) {
        requestTabsAndRender();
        return;
      }
      clearDefaultOpenTabsSuggestions();
    }

    return {
      getShortcutRules,
      getDirectNavigationUrl,
      getDirectUrlSuggestion,
      resolveQuickNavigation,
      getHelpCenterLocale,
      updateSearchSuggestions,
      clearSearchSuggestions
    };
  }

  root.LumnoOverlayPanelSuggestionSources = { createSuggestionSources };
})(globalThis);
