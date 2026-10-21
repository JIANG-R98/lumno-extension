// The search mode menu: its providers and items, the order the user
// gives them, stepping through it, opening it with a double Tab, and
// picking an item.
function createSearchModeMenu(deps) {
  const {
    SEARCH_UTILS,
    AGGREGATE_SEARCH_STORE,
    t,
    isAggregateSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAiSiteSearchProvider,
    getSiteSearchDisplayName,
    getPageRenderableProviderIcon,
    getLocalSearchScopeLabel,
    getLocalSearchScopeIconClass,
    SEARCH_SOURCE_ORDER,
    getStorageValuesAsync,
    SEARCH_SOURCE_ORDER_STORAGE_KEY,
    loadSiteSearchIconCache,
    getSiteSearchProviders,
    getAggregateSearches,
    cancelPendingOpenTabsPrefixEntry,
    activateSiteSearch,
    activateOpenTabsSearchMode,
    activateLocalSearchScope
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  function getSearchModeProviderId(provider) {
    return `provider:${provider && (provider.key || provider.name) ? (provider.key || provider.name) : ''}`;
  }

  function getOverlayDefaultSearchModeProvider(providers) {
    return SEARCH_UTILS.getSearchEngineSiteSearchProvider(
      overlayState.overlaySearchEngineState,
      providers
    );
  }

  function getCurrentPageSiteSearchModeProvider(providers) {
    return SEARCH_UTILS.findSiteSearchProviderForPageUrl(
      overlayState.initialContextTabUrl,
      providers
    );
  }

  function getSearchModeProviders() {
    const providers = (overlayState.siteSearchProvidersCache && overlayState.siteSearchProvidersCache.length > 0)
      ? overlayState.siteSearchProvidersCache
      : overlayState.defaultSiteSearchProviders;
    const defaultProvider = getOverlayDefaultSearchModeProvider(providers);
    if (!defaultProvider || providers.some((provider) => (
      getSearchModeProviderId(provider) === getSearchModeProviderId(defaultProvider)
    ))) {
      return providers;
    }
    return [defaultProvider].concat(providers);
  }

  function isAggregateSearchDefinitionAvailable(definition, providers) {
    return AGGREGATE_SEARCH_STORE.isAggregateSearchAvailable(
      definition,
      Array.isArray(providers) ? providers : getSearchModeProviders()
    );
  }

  function getSearchTriggerProviders(providers, definitions) {
    const sourceProviders = Array.isArray(providers) ? providers : [];
    const availableDefinitions = (Array.isArray(definitions) ? definitions : [])
      .filter((definition) => isAggregateSearchDefinitionAvailable(
        definition,
        sourceProviders
      ));
    return AGGREGATE_SEARCH_STORE.mergeTriggerProviders(
      sourceProviders,
      availableDefinitions
    );
  }

  function buildSearchModeMenuItems(sourceOrder) {
    const engineGroup = t('search_scope_group_engines', '搜索引擎');
    const localGroup = t('search_scope_group_local', '浏览器内容');
    const aiGroup = t('search_scope_group_ai', 'AI 搜索');
    const siteGroup = t('search_scope_group_sites', '站内搜索');
    const aggregateGroup = t('search_scope_group_aggregates', '聚合搜索');
    const items = [];
    const providers = getSearchModeProviders();
    (overlayState.aggregateSearchesCache || []).forEach((definition) => {
      if (!isAggregateSearchDefinitionAvailable(definition, providers)) {
        return;
      }
      const provider = AGGREGATE_SEARCH_STORE.createScopeProvider(definition);
      if (!provider) {
        return;
      }
      items.push({
        id: `aggregate:${definition.id}`,
        kind: 'aggregate',
        aggregate: definition,
        provider,
        label: definition.name,
        group: aggregateGroup,
        groupKey: 'aggregate',
        orderList: 'aggregate',
        orderKey: definition.id,
        iconClass: 'ri-stack-line',
        searchTerms: [definition.name].concat(definition.sourceRefs || []),
        active: Boolean(
          isAggregateSearchProvider(overlayState.siteSearchState) &&
          String(overlayState.siteSearchState.aggregateId || '') === String(definition.id || '')
        )
      });
    });
    providers
      .filter((provider) => isSearchEngineSiteSearchProvider(provider))
      .concat(providers.filter((provider) => (
        !isSearchEngineSiteSearchProvider(provider) && !isAiSiteSearchProvider(provider)
      )))
      .concat(providers.filter((provider) => isAiSiteSearchProvider(provider)))
      .forEach((provider) => {
        const isAi = isAiSiteSearchProvider(provider);
        const isSearchEngine = isSearchEngineSiteSearchProvider(provider);
        const groupKey = isSearchEngine ? 'engine' : (isAi ? 'ai' : 'site');
        items.push({
          id: getSearchModeProviderId(provider),
          kind: 'provider',
          provider,
          label: getSiteSearchDisplayName(provider),
          group: isSearchEngine ? engineGroup : (isAi ? aiGroup : siteGroup),
          groupKey,
          orderList: provider._xIsCustom ? 'custom' : groupKey,
          orderKey: provider.key,
          iconUrl: getPageRenderableProviderIcon(provider),
          iconClass: isAi ? 'ri-search-ai-line' : 'ri-global-line',
          isAi,
          active: Boolean(overlayState.siteSearchState && getSearchModeProviderId(overlayState.siteSearchState) === getSearchModeProviderId(provider))
        });
      });
    items.push({
      id: 'openTabs',
      kind: 'openTabs',
      label: t('search_open_tabs_only_entry', '搜索已打开标签页'),
      searchTerms: ['open tabs', 'tabs', 'browser'],
      group: localGroup,
      // Leads browser content and is not reorderable.
      groupKey: 'local',
      orderList: 'pinned',
      iconClass: 'ri-window-line',
      menuIconName: 'browser',
      active: overlayState.openTabsSearchModeActive
    });
    ['topSite', 'bookmark', 'history'].forEach((sourceType) => {
      if (!overlayState.enabledSearchResultSourceTypes.includes(sourceType)) {
        return;
      }
      items.push({
        id: `local:${sourceType}`,
        kind: 'local',
        sourceType,
        label: getLocalSearchScopeLabel({ sourceType }),
        groupKey: 'local',
        orderList: 'local',
        orderKey: sourceType,
        searchTerms: sourceType === 'topSite'
          ? ['top sites', 'frequent sites', 'favorites']
          : (sourceType === 'bookmark'
            ? ['bookmark', 'bookmarks']
            : ['history', 'browsing history']),
        group: localGroup,
        iconClass: getLocalSearchScopeIconClass(sourceType),
        menuIconName: sourceType === 'topSite' ? 'star' : sourceType,
        active: Boolean(overlayState.localSearchScopeState && overlayState.localSearchScopeState.sourceType === sourceType)
      });
    });
    return SEARCH_SOURCE_ORDER
      ? SEARCH_SOURCE_ORDER.rankScopeItems(items, sourceOrder)
      : items;
  }

  function loadSearchSourceOrder() {
    return getStorageValuesAsync([SEARCH_SOURCE_ORDER_STORAGE_KEY])
      .then((result) => result && result[SEARCH_SOURCE_ORDER_STORAGE_KEY])
      .catch(() => null);
  }

  function getSearchModeMenuItems() {
    return Promise.all([
      overlayState.siteSearchIconCacheLoaded
        ? Promise.resolve(overlayState.siteSearchIconCache)
        : loadSiteSearchIconCache(),
      getSiteSearchProviders(),
      getAggregateSearches(),
      loadSearchSourceOrder()
    ]).then((results) => buildSearchModeMenuItems(results[3]));
  }

  // A tile dragged in the panel: store the new order on top of the latest
  // stored one, so a concurrent change from Settings is not lost.
  function reorderSearchModeMenu(payload) {
    if (!SEARCH_SOURCE_ORDER || !overlayState.storageArea) {
      return Promise.resolve();
    }
    return queueSearchSourceOrderTask(() => loadSearchSourceOrder()
      .then((value) => recordSearchSourceOrder(value, SEARCH_SOURCE_ORDER.applyScopeMenuMove(value, payload))));
  }
  function queueSearchSourceOrderTask(task) {
    overlayState.searchSourceOrderQueue = overlayState.searchSourceOrderQueue.then(task).catch(() => {});
    return overlayState.searchSourceOrderQueue;
  }

  function writeSearchSourceOrder(value) {
    return new Promise((resolve) => {
      overlayState.storageArea.set({ [SEARCH_SOURCE_ORDER_STORAGE_KEY]: value }, () => resolve());
    });
  }

  // Undo and redo for the moves made in this page's panel. Kept on the
  // content script's global so it outlives one opening of the command bar.
  function getSearchSourceOrderHistory() {
    if (!globalThis.__lumnoSearchSourceOrderHistory2026) {
      globalThis.__lumnoSearchSourceOrderHistory2026 = SEARCH_SOURCE_ORDER.createHistory();
    }
    return globalThis.__lumnoSearchSourceOrderHistory2026;
  }

  function recordSearchSourceOrder(before, after) {
    getSearchSourceOrderHistory().record(before, after);
    return writeSearchSourceOrder(after);
  }

  // Returns whether there was a step to take, so the panel only claims
  // Ctrl/Cmd+Z when it does something.
  function stepSearchModeMenuHistory(direction) {
    if (!SEARCH_SOURCE_ORDER || !overlayState.storageArea) {
      return false;
    }
    const history = getSearchSourceOrderHistory();
    if (!(direction === 'redo' ? history.canRedo() : history.canUndo())) {
      return false;
    }
    queueSearchSourceOrderTask(() => loadSearchSourceOrder()
      .then((value) => {
        const target = direction === 'redo' ? history.redo(value) : history.undo(value);
        return target ? writeSearchSourceOrder(target) : null;
      }));
    return true;
  }

  // A group block moved from its title in the panel.
  function moveSearchModeMenuGroup(payload) {
    if (!SEARCH_SOURCE_ORDER || !overlayState.storageArea || !payload) {
      return Promise.resolve();
    }
    return queueSearchSourceOrderTask(() => loadSearchSourceOrder()
      .then((value) => recordSearchSourceOrder(
        value,
        SEARCH_SOURCE_ORDER.applyGroupMove(value, payload.groups, payload.group, payload.delta)
      )));
  }

  function openSearchModeMenuFromDoubleTab() {
    cancelPendingOpenTabsPrefixEntry();
    const expectedSiteSearchState = overlayState.siteSearchState;
    const expectedLocalSearchScopeState = overlayState.localSearchScopeState;
    const expectedOpenTabsSearchModeActive = overlayState.openTabsSearchModeActive;
    const expectedInputValue = String(overlayState.searchInput.value || '');
    const isActivationCurrent = () => Boolean(
      overlayState.inputModeController &&
      overlayState.siteSearchState === expectedSiteSearchState &&
      overlayState.localSearchScopeState === expectedLocalSearchScopeState &&
      overlayState.openTabsSearchModeActive === expectedOpenTabsSearchModeActive &&
      String(overlayState.searchInput.value || '') === expectedInputValue &&
      !expectedSiteSearchState &&
      !expectedLocalSearchScopeState
    );
    const activateDefaultProvider = (providers) => {
      if (!isActivationCurrent()) {
        return false;
      }
      const currentPageProvider = getCurrentPageSiteSearchModeProvider(providers);
      const provider = currentPageProvider ||
        getOverlayDefaultSearchModeProvider(providers);
      if (!provider) {
        return false;
      }
      if (expectedInputValue.trim()) {
        activateSiteSearch(provider, {
          animatePrefix: false,
          preserveResults: true
        });
        restoreSearchModeQuery(expectedInputValue);
      } else {
        activateSiteSearch(provider, { animatePrefix: false });
      }
      const openResult = overlayState.inputModeController.openModeMenu(
        currentPageProvider ? 'input' : 'none'
      );
      return Promise.resolve(openResult).then(Boolean);
    };
    return Promise.all([
      overlayState.overlaySearchEngineStateReady.catch(() => overlayState.overlaySearchEngineState),
      getSiteSearchProviders().catch(() => overlayState.defaultSiteSearchProviders),
      loadSiteSearchIconCache().catch(() => overlayState.siteSearchIconCache)
    ]).then(([, providers]) => activateDefaultProvider(providers));
  }

  function restoreSearchModeQuery(rawQuery) {
    const value = String(rawQuery || '');
    overlayState.searchInput.value = value;
    overlayState.latestRawInputValue = value;
    overlayState.latestOverlayQuery = value.trim();
    overlayState.searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function shouldPreserveSearchModeResults(rawQuery) {
    return Boolean(String(rawQuery || '').trim());
  }

  function selectSearchModeMenuItem(item) {
    if (!item || !item.kind) {
      return;
    }
    const rawQuery = overlayState.searchInput.value || '';
    const preserveResults = shouldPreserveSearchModeResults(rawQuery);
    if (item.kind === 'openTabs') {
      activateOpenTabsSearchMode({
        deferResults: true,
        preserveResults
      });
      restoreSearchModeQuery(rawQuery);
      return;
    }
    if (item.kind === 'local') {
      activateLocalSearchScope(
        { sourceType: item.sourceType },
        { preserveResults }
      );
      restoreSearchModeQuery(rawQuery);
      return;
    }
    if (item.kind === 'aggregate' && item.provider) {
      activateSiteSearch(item.provider, { preserveResults });
      restoreSearchModeQuery(rawQuery);
      return;
    }
    if (item.kind === 'provider' && item.provider) {
      activateSiteSearch(item.provider, { preserveResults });
      restoreSearchModeQuery(rawQuery);
    }
  }

  return {
    getSearchModeProviderId,
    getSearchModeProviders,
    isAggregateSearchDefinitionAvailable,
    getSearchTriggerProviders,
    getSearchModeMenuItems,
    reorderSearchModeMenu,
    stepSearchModeMenuHistory,
    moveSearchModeMenuGroup,
    openSearchModeMenuFromDoubleTab,
    selectSearchModeMenuItem
  };
}

export { createSearchModeMenu };
