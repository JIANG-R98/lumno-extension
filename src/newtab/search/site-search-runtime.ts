// Site search providers and aggregate searches while the page is open:
// their first load, restoring a search the shortcut's reload interrupted,
// and refreshing both when their storage changes.
import * as LumnoNewtabFocusResume from '../focus-resume';

function createSiteSearchRuntime(deps) {
  const {
    getSiteSearchProviders,
    getAggregateSearches,
    isAggregateSearchProvider,
    getSearchModeProviderId,
    getSearchModeProviders,
    isAggregateSearchDefinitionAvailable,
    createAggregateSearchScopeProvider,
    activateSiteSearch,
    activateLocalSearchScope,
    restoreSearchModeQuery,
    showSuggestionSnapshot,
    focusSearchInputPreservingScroll,
    requestSuggestions,
    storageChanges,
    SETTINGS,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORE,
    setSiteSearchPrefix,
    defaultTheme,
    clearSiteSearch,
    storageArea,
    reloadSiteSearchProvidersFromStorage
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  const siteSearchProvidersReady = Promise.all([getSiteSearchProviders(), getAggregateSearches()]);

  // Search modes are saved by id: a provider's, or its aggregate search's.
  function getSiteSearchSnapshotId(provider) {
    return isAggregateSearchProvider(provider)
      ? `aggregate:${provider.aggregateId}`
      : getSearchModeProviderId(provider);
  }

  function findSiteSearchBySnapshotId(id) {
    const providers = getSearchModeProviders();
    if (!String(id).startsWith('aggregate:')) {
      return providers.find((provider) => getSearchModeProviderId(provider) === id) || null;
    }
    const definition = (pageState.aggregateSearchesCache || []).find(
      (item) => `aggregate:${item && item.id ? item.id : ''}` === id
    );
    return isAggregateSearchDefinitionAvailable(definition, providers)
      ? createAggregateSearchScopeProvider(definition)
      : null;
  }

  pageState.focusResume = LumnoNewtabFocusResume.createFocusResume({
    getSiteSearchSnapshotId,
    findSiteSearchBySnapshotId,
    activateSiteSearch,
    activateLocalSearchScope,
    restoreSearchModeQuery,
    showSuggestionSnapshot,
    focusSearchInputPreservingScroll,
    pageState
  });
  pageState.focusResume.resume(siteSearchProvidersReady);

  getAggregateSearches().then(() => {
    if (pageState.inputModeController && typeof pageState.inputModeController.refreshModeMenu === 'function') {
      pageState.inputModeController.refreshModeMenu();
    }
    if (pageState.latestQuery) {
      requestSuggestions(pageState.latestQuery, { immediate: true });
    }
  });

  // A new order from Settings or another tab reaches an open scope panel now;
  // a closed one reads it when it opens.
  storageChanges.on(SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY, () => {
    if (pageState.inputModeController && typeof pageState.inputModeController.refreshModeMenu === 'function') {
      pageState.inputModeController.refreshModeMenu();
    }
  });

  storageChanges.on([
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    pageState.AGGREGATE_SEARCH_STORAGE_KEY
  ], (changes) => {
    if (changes[pageState.AGGREGATE_SEARCH_STORAGE_KEY]) {
      pageState.aggregateSearchesLoadVersion += 1;
      pageState.aggregateSearchesLoadPromise = null;
      pageState.aggregateSearchesCache = AGGREGATE_SEARCH_STORE.normalizeAggregateSearches(
        changes[pageState.AGGREGATE_SEARCH_STORAGE_KEY].newValue
      );
      if (isAggregateSearchProvider(pageState.siteSearchState)) {
        const currentId = String(pageState.siteSearchState.aggregateId || '');
        const updatedDefinition = pageState.aggregateSearchesCache.find(
          (item) => String(item && item.id ? item.id : '') === currentId
        );
        const updatedProvider = isAggregateSearchDefinitionAvailable(
          updatedDefinition,
          getSearchModeProviders()
        )
          ? createAggregateSearchScopeProvider(updatedDefinition)
          : null;
        if (updatedProvider) {
          pageState.siteSearchState = updatedProvider;
          setSiteSearchPrefix(updatedProvider, defaultTheme, { animate: false });
        } else {
          clearSiteSearch();
        }
      }
      if (pageState.inputModeController && typeof pageState.inputModeController.refreshModeMenu === 'function') {
        pageState.inputModeController.refreshModeMenu();
      }
      if (pageState.latestQuery) {
        requestSuggestions(pageState.latestQuery, { immediate: true });
      }
    }
    if (!changes[SITE_SEARCH_STORAGE_KEY] && !changes[SITE_SEARCH_DISABLED_STORAGE_KEY]) {
      return;
    }
    if (!storageArea) {
      return;
    }
    const providerReload = reloadSiteSearchProvidersFromStorage();
    providerReload.promise.then(() => {
      if (providerReload.version !== pageState.siteSearchProvidersLoadVersion) {
        return;
      }
      if (isAggregateSearchProvider(pageState.siteSearchState)) {
        const activeDefinition = (pageState.aggregateSearchesCache || []).find((item) => (
          String(item && item.id ? item.id : '') === String(pageState.siteSearchState.aggregateId || '')
        ));
        if (!isAggregateSearchDefinitionAvailable(activeDefinition, pageState.siteSearchProvidersCache)) {
          clearSiteSearch();
        }
      }
      if (pageState.inputModeController && typeof pageState.inputModeController.refreshModeMenu === 'function') {
        pageState.inputModeController.refreshModeMenu();
      }
      if (pageState.latestQuery) {
        requestSuggestions(pageState.latestQuery, { immediate: true });
      }
    });
  });

  return {};
}

export { createSiteSearchRuntime };
