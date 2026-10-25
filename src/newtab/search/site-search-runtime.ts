// Site search providers and aggregate searches while the page is open:
// their first load, restoring a search the shortcut's reload interrupted,
// and refreshing both when their storage changes.
import type * as AggregateSearchStore from '../../domain/search/aggregate-search-store';
import type { AggregateSearch } from '../../domain/search/aggregate-search-store';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { StorageAreaLike } from '../../domain/storage-port';
import type { Suggestion } from '../../shared/react/search/suggestion-list/types';
import type { InputModeController } from '../../shared/search/search-input-mode';
import type { InputModeTheme } from '../../shared/search/input-mode/types';
import * as LumnoNewtabFocusResume from '../focus-resume';
import type { FocusResume, FocusResumeState } from '../focus-resume';
import type { StorageChangeRegistry } from '../storage-change-registry';
import type { SearchModeController } from './search-mode-controller';
import type { SearchModes } from './search-modes';
import { getAggregateSearchId } from './search-types';
import type { RequestSuggestions } from './search-types';
import type { SiteSearchProviders } from './site-search-providers';

interface SiteSearchRuntimeState extends FocusResumeState {
  // Carries the search across the reload the search shortcut makes.
  focusResume: FocusResume | null;
  inputModeController: Pick<InputModeController, 'refreshModeMenu'> | null;
  latestQuery: string;
  AGGREGATE_SEARCH_STORAGE_KEY: string;
  aggregateSearchesLoadVersion: number;
  aggregateSearchesLoadPromise: Promise<AggregateSearch[]> | null;
  aggregateSearchesCache: AggregateSearch[] | null;
  siteSearchState: SiteSearchProvider | null;
  siteSearchProvidersLoadVersion: number;
  siteSearchProvidersCache: SiteSearchProvider[] | null;
}

interface SiteSearchRuntimeDeps {
  getSiteSearchProviders: SiteSearchProviders['getSiteSearchProviders'];
  getAggregateSearches: SiteSearchProviders['getAggregateSearches'];
  isAggregateSearchProvider: SiteSearchProviders['isAggregateSearchProvider'];
  getSearchModeProviderId: SiteSearchProviders['getSearchModeProviderId'];
  getSearchModeProviders: SearchModes['getSearchModeProviders'];
  isAggregateSearchDefinitionAvailable: SearchModes['isAggregateSearchDefinitionAvailable'];
  createAggregateSearchScopeProvider: SiteSearchProviders['createAggregateSearchScopeProvider'];
  activateSiteSearch: SearchModes['activateSiteSearch'];
  activateLocalSearchScope: SearchModes['activateLocalSearchScope'];
  restoreSearchModeQuery: SearchModes['restoreSearchModeQuery'];
  showSuggestionSnapshot(suggestions: Suggestion[], query: string, selectedIndex: number): Promise<void>;
  focusSearchInputPreservingScroll(): boolean;
  requestSuggestions: RequestSuggestions;
  storageChanges: Pick<StorageChangeRegistry, 'on'>;
  SETTINGS: { SEARCH_SOURCE_ORDER_STORAGE_KEY: string };
  SITE_SEARCH_STORAGE_KEY: string;
  SITE_SEARCH_DISABLED_STORAGE_KEY: string;
  AGGREGATE_SEARCH_STORE: Pick<typeof AggregateSearchStore, 'normalizeAggregateSearches'>;
  setSiteSearchPrefix: SearchModeController['setSiteSearchPrefix'];
  defaultTheme: InputModeTheme;
  clearSiteSearch: SearchModes['clearSiteSearch'];
  storageArea: StorageAreaLike | null;
  reloadSiteSearchProvidersFromStorage: SiteSearchProviders['reloadSiteSearchProvidersFromStorage'];
  pageState: SiteSearchRuntimeState;
}

function createSiteSearchRuntime(deps: SiteSearchRuntimeDeps): void {
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
  function getSiteSearchSnapshotId(provider: SiteSearchProvider): string {
    return isAggregateSearchProvider(provider)
      ? `aggregate:${getAggregateSearchId(provider)}`
      : getSearchModeProviderId(provider);
  }

  function findSiteSearchBySnapshotId(id: unknown): SiteSearchProvider | null {
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

  const focusResume = LumnoNewtabFocusResume.createFocusResume({
    getSiteSearchSnapshotId,
    findSiteSearchBySnapshotId,
    activateSiteSearch,
    activateLocalSearchScope,
    restoreSearchModeQuery,
    showSuggestionSnapshot,
    focusSearchInputPreservingScroll,
    pageState
  });
  pageState.focusResume = focusResume;
  void focusResume.resume(siteSearchProvidersReady);

  void getAggregateSearches().then(() => {
    if (pageState.inputModeController) {
      pageState.inputModeController.refreshModeMenu();
    }
    if (pageState.latestQuery) {
      requestSuggestions(pageState.latestQuery, { immediate: true });
    }
  });

  // A new order from Settings or another tab reaches an open scope panel now;
  // a closed one reads it when it opens.
  storageChanges.on(SETTINGS.SEARCH_SOURCE_ORDER_STORAGE_KEY, () => {
    if (pageState.inputModeController) {
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
      const aggregates = pageState.aggregateSearchesCache;
      if (isAggregateSearchProvider(pageState.siteSearchState)) {
        const currentId = getAggregateSearchId(pageState.siteSearchState);
        const updatedDefinition = aggregates.find(
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
      if (pageState.inputModeController) {
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
    void providerReload.promise.then(() => {
      if (providerReload.version !== pageState.siteSearchProvidersLoadVersion) {
        return;
      }
      if (isAggregateSearchProvider(pageState.siteSearchState)) {
        const activeId = getAggregateSearchId(pageState.siteSearchState);
        const activeDefinition = (pageState.aggregateSearchesCache || []).find((item) => (
          String(item && item.id ? item.id : '') === activeId
        ));
        if (!isAggregateSearchDefinitionAvailable(activeDefinition, pageState.siteSearchProvidersCache)) {
          clearSiteSearch();
        }
      }
      if (pageState.inputModeController) {
        pageState.inputModeController.refreshModeMenu();
      }
      if (pageState.latestQuery) {
        requestSuggestions(pageState.latestQuery, { immediate: true });
      }
    });
  });
}

export { createSiteSearchRuntime };
export type { SiteSearchRuntimeDeps, SiteSearchRuntimeState };
