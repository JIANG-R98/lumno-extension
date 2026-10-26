// Site search providers and aggregate searches in the overlay: their
// URLs and icons, running an interactive provider, recording a selection,
// and loading and reloading both lists.
import type * as FaviconUtils from '../../domain/favicon/favicon-utils';
import type { FaviconUrlResolver } from '../../domain/favicon/favicon-utils';
import type * as ShortcutFavicon from '../../domain/favicon/shortcut-favicon';
import type { CachedIconMap, SiteSearchIconOptions } from '../../domain/favicon/shortcut-favicon';
import type { Disposition } from '../../domain/navigation-disposition';
import type * as AggregateSearchStore from '../../domain/search/aggregate-search-store';
import type { AggregateSearch } from '../../domain/search/aggregate-search-store';
import * as AGGREGATE_SEARCH_SURFACE from '../../domain/search/aggregate-search-surface';
import { readSiteSearchProviders } from '../../domain/search/site-search-provider-reader';
import type { DisplayedSuggestion } from '../../domain/search/suggestion-action-model';
import type * as SearchUtils from '../../domain/search/search-utils';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { StorageAreaFacade } from '../../platform/settings-storage';
import type { InputModeProvider } from '../../shared/search/input-mode/types';
import * as SITE_SEARCH_STORE from '../../shared/search/site-search-store';
import * as LumnoAggregateSearchStorage from '../../platform/aggregate-search-storage';
import * as LumnoMessaging from '../../platform/messaging';
import type { ActivationEvent } from './result-activation';
import type { Translate } from './types';

interface SiteSearchProvidersState {
  storageArea: StorageAreaFacade | null;
  // The bundled providers, for when the stored list cannot load.
  defaultSiteSearchProviders: SiteSearchProvider[];
  siteSearchProvidersCache: SiteSearchProvider[] | null;
  // Raised to drop a load that a newer one replaced.
  siteSearchProvidersLoadVersion: number;
  aggregateSearchesCache: AggregateSearch[] | null;
  aggregateSearchesLoadPromise: Promise<AggregateSearch[]> | null;
  aggregateSearchesLoadVersion: number;
  siteSearchIconCache: CachedIconMap;
  siteSearchIconCacheLoaded: boolean;
  // A favicon as a data: URL from the worker; empty or null when there is none.
  requestFaviconData(url: string, pageUrl?: string): Promise<string | null>;
}

interface SiteSearchProvidersDeps {
  SEARCH_UTILS: Pick<typeof SearchUtils,
    'withHelpCenterLocale' | 'isAiSiteSearchProvider' | 'isSearchEngineSiteSearchProvider' |
    'isInteractiveSiteSearchProvider' | 'mergeCustomProviders'>;
  AGGREGATE_SEARCH_STORE: Pick<typeof AggregateSearchStore, 'isAggregateSearchProvider'>;
  SHORTCUT_FAVICON: Pick<typeof ShortcutFavicon, 'getSiteSearchProviderIcon' | 'getSiteSearchProviderPageUrl'>;
  FAVICON_UTILS: Pick<typeof FaviconUtils, 'isExtensionFaviconEndpointUrl'>;
  getHelpCenterLocale(): string;
  showOverlayToast(message: string, isError?: boolean): void;
  t: Translate;
  getSearchResultDisposition(event: ActivationEvent | null): Disposition;
  getSearchResultNewTabDisposition(event: ActivationEvent | null): 'backgroundTab' | 'newTab';
  finishOverlayResultActivation(event: ActivationEvent | null, canOpenInBackground: boolean): boolean;
  getOverlayFaviconUrlResolver(): FaviconUrlResolver | null;
  siteSearchIconCacheOptions: SiteSearchIconOptions;
  // Favicon images already fetched, as data: URLs by address.
  faviconDataCache: Map<string, string>;
  SITE_SEARCH_STORAGE_KEY: string;
  SITE_SEARCH_DISABLED_STORAGE_KEY: string;
  AGGREGATE_SEARCH_STORAGE_KEY: string;
  getStorageValuesAsync(keys: string[]): Promise<Record<string, unknown>>;
  overlayState: SiteSearchProvidersState;
}

function createSiteSearchProviders(deps: SiteSearchProvidersDeps) {
  const {
    SEARCH_UTILS,
    getHelpCenterLocale,
    AGGREGATE_SEARCH_STORE,
    showOverlayToast,
    t,
    getSearchResultDisposition,
    getSearchResultNewTabDisposition,
    finishOverlayResultActivation,
    getOverlayFaviconUrlResolver,
    SHORTCUT_FAVICON,
    siteSearchIconCacheOptions,
    FAVICON_UTILS,
    faviconDataCache,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    getStorageValuesAsync,
    AGGREGATE_SEARCH_STORAGE_KEY
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  let siteSearchProvidersLoadPromise: Promise<SiteSearchProvider[]> | null = null;
  let aggregateSearchRequestController: ReturnType<typeof AGGREGATE_SEARCH_SURFACE.createAggregateSearchRequestController> | null = null;

  function buildSearchUrl(template: string, query: string, provider?: SiteSearchProvider | null): string {
    if (!template) {
      return '';
    }
    const url = template.replace(/\{query\}/g, encodeURIComponent(query));
    return provider ? SEARCH_UTILS.withHelpCenterLocale(url, provider, getHelpCenterLocale()) : url;
  }

  function isAiSiteSearchProvider(provider: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SEARCH_UTILS.isAiSiteSearchProvider(provider);
  }

  function isSearchEngineSiteSearchProvider(provider: Partial<SiteSearchProvider> | null | undefined): boolean {
    return SEARCH_UTILS.isSearchEngineSiteSearchProvider(provider);
  }

  function isAggregateSearchProvider(provider: Partial<SiteSearchProvider> | null): boolean {
    return AGGREGATE_SEARCH_STORE.isAggregateSearchProvider(provider);
  }

  function isInteractiveSiteSearchProvider(provider: SiteSearchProvider): boolean {
    return SEARCH_UTILS.isInteractiveSiteSearchProvider(provider);
  }

  function getAggregateSearchRequestController(): ReturnType<typeof AGGREGATE_SEARCH_SURFACE.createAggregateSearchRequestController> {
    if (aggregateSearchRequestController) {
      return aggregateSearchRequestController;
    }
    const controller = AGGREGATE_SEARCH_SURFACE.createAggregateSearchRequestController({
      chromeApi: chrome,
      onFeedback(descriptor) {
        showOverlayToast(t(descriptor.messageKey, descriptor.fallback), descriptor.isError);
      }
    });
    aggregateSearchRequestController = controller;
    return controller;
  }

  // Runs a site search, an interactive provider or an aggregate search;
  // true when a tab opened at once, so the panel may close.
  function openSiteSearchProviderQuery(provider: InputModeProvider | null, query: string, event: ActivationEvent | null): boolean {
    const trimmedQuery = String(query || '').trim();
    if (!provider || !trimmedQuery) {
      return false;
    }
    if (isAggregateSearchProvider(provider) && provider.aggregateId) {
      const disposition = getSearchResultNewTabDisposition(event);
      const controller = getAggregateSearchRequestController();
      if (!controller) {
        showOverlayToast(t('toast_error', 'Operation failed. Please try again.'), true);
        return false;
      }
      controller.run({
        aggregateId: String(provider.aggregateId),
        disposition,
        query: trimmedQuery
      }, {
        onSuccess(response) {
          const feedbackDelayMs = AGGREGATE_SEARCH_SURFACE.getSuccessFeedbackDelayMs(response);
          if (feedbackDelayMs > 0) {
            window.setTimeout(() => {
              finishOverlayResultActivation(event, true);
            }, feedbackDelayMs);
            return;
          }
          finishOverlayResultActivation(event, true);
        }
      });
      return false;
    }
    if (isInteractiveSiteSearchProvider(provider)) {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'runSiteSearchProviderQuery',
        provider: provider,
        query: trimmedQuery,
        disposition: getSearchResultDisposition(event)
      });
      return true;
    }
    const siteUrl = buildSearchUrl(provider.template || '', trimmedQuery, provider);
    if (!siteUrl) {
      return false;
    }
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
      action: 'createTab',
      url: siteUrl,
      disposition: getSearchResultDisposition(event)
    });
    return true;
  }

  // Teaches the ranking which result was picked for the query.
  function recordSearchSuggestionSelectionFromSuggestion(suggestion: DisplayedSuggestion, query: string, source: string): void {
    if (!suggestion || suggestion.forceSearch || suggestion.provider || !suggestion.url) {
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'recordSearchSuggestionSelection',
        query: String(query || '').trim(),
        url: suggestion.url,
        title: suggestion.title || '',
        type: suggestion.type || 'history',
        source: source || 'overlay'
      });
    } catch (_error) {
      // Selection ranking is best-effort; never block opening the target.
    }
  }

  function getProviderIcon(provider: Partial<SiteSearchProvider>): string {
    const resolver = getOverlayFaviconUrlResolver();
    if (!resolver) {
      return '';
    }
    const iconUrl = SHORTCUT_FAVICON.getSiteSearchProviderIcon(
      overlayState.siteSearchIconCacheLoaded ? overlayState.siteSearchIconCache : {}, provider, Date.now(), {
        ...siteSearchIconCacheOptions,
        resolveAssetUrl: (path: string) => chrome.runtime.getURL(path)
      }
    );
    return resolver.getProviderFaviconUrl(SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider), iconUrl);
  }

  // Input-mode icons load straight into an <img> in the page, which cannot
  // load the browser's _favicon cache; those arrive as data: URLs from the
  // background, and the provider keeps its glyph until one is cached.
  function toPageRenderableIconUrl(iconUrl: string, pageUrl: string): string {
    if (!FAVICON_UTILS.isExtensionFaviconEndpointUrl(iconUrl)) {
      return iconUrl;
    }
    const cachedData = faviconDataCache.get(iconUrl);
    if (cachedData) {
      return cachedData;
    }
    overlayState.requestFaviconData(iconUrl, pageUrl).catch(() => null);
    return '';
  }

  function getPageRenderableProviderIcon(provider: Partial<SiteSearchProvider> | null | undefined): string {
    if (!provider) {
      return '';
    }
    return toPageRenderableIconUrl(getProviderIcon(provider), SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider));
  }

  // Starts a load of the providers; a newer load, or an invalidating one,
  // wins over any still running.
  function beginSiteSearchProviderLoad(
    loader: () => Promise<SiteSearchProvider[]>,
    options?: { invalidate?: boolean }
  ): { promise: Promise<SiteSearchProvider[]>; version: number } {
    const settings: { invalidate?: boolean } = options && typeof options === 'object' ? options : {};
    if (settings.invalidate === true) {
      overlayState.siteSearchProvidersLoadVersion += 1;
      siteSearchProvidersLoadPromise = null;
    }
    const loadVersion = overlayState.siteSearchProvidersLoadVersion;
    const loadTask: Promise<SiteSearchProvider[]> = Promise.resolve().then(() => loader()).then((items) => {
      const normalizedItems = Array.isArray(items) ? items : [];
      if (loadVersion === overlayState.siteSearchProvidersLoadVersion &&
          siteSearchProvidersLoadPromise === loadTask) {
        overlayState.siteSearchProvidersCache = normalizedItems;
        return normalizedItems;
      }
      return overlayState.siteSearchProvidersCache || [];
    }).catch(() => {
      if (loadVersion === overlayState.siteSearchProvidersLoadVersion &&
          siteSearchProvidersLoadPromise === loadTask) {
        overlayState.siteSearchProvidersCache = null;
      }
      return overlayState.siteSearchProvidersCache || [];
    }).finally(() => {
      if (siteSearchProvidersLoadPromise === loadTask) {
        siteSearchProvidersLoadPromise = null;
      }
    });
    siteSearchProvidersLoadPromise = loadTask;
    return {
      promise: loadTask,
      version: loadVersion
    };
  }

  function getSiteSearchProviders(): Promise<SiteSearchProvider[]> {
    if (siteSearchProvidersLoadPromise) {
      return siteSearchProvidersLoadPromise;
    }
    if (overlayState.siteSearchProvidersCache) {
      return Promise.resolve(overlayState.siteSearchProvidersCache);
    }
    return beginSiteSearchProviderLoad(() => SITE_SEARCH_STORE.loadSiteSearchProviders({
      chromeApi: chrome,
      storageArea: overlayState.storageArea,
      storageKeys: {
        custom: SITE_SEARCH_STORAGE_KEY,
        disabled: SITE_SEARCH_DISABLED_STORAGE_KEY
      },
      defaultProviders: overlayState.defaultSiteSearchProviders,
      mergeCustomProviders: SEARCH_UTILS.mergeCustomProviders,
      getStorageValues: getStorageValuesAsync
    })).promise;
  }

  function reloadSiteSearchProvidersFromStorage(): { promise: Promise<SiteSearchProvider[]>; version: number } {
    return beginSiteSearchProviderLoad(() => getStorageValuesAsync([
      SITE_SEARCH_STORAGE_KEY,
      SITE_SEARCH_DISABLED_STORAGE_KEY
    ]).then((result) => {
      const customItems = readSiteSearchProviders(result[SITE_SEARCH_STORAGE_KEY]);
      const storedDisabledKeys = result[SITE_SEARCH_DISABLED_STORAGE_KEY];
      const disabledKeys = Array.isArray(storedDisabledKeys) ? storedDisabledKeys : [];
      return SITE_SEARCH_STORE.mergeStoredProviders(
        overlayState.defaultSiteSearchProviders,
        customItems,
        disabledKeys,
        SEARCH_UTILS.mergeCustomProviders
      );
    }), { invalidate: true });
  }

  function getAggregateSearches(): Promise<AggregateSearch[]> {
    if (overlayState.aggregateSearchesCache) {
      return Promise.resolve(overlayState.aggregateSearchesCache);
    }
    if (overlayState.aggregateSearchesLoadPromise) {
      return overlayState.aggregateSearchesLoadPromise;
    }
    const loadVersion = overlayState.aggregateSearchesLoadVersion;
    const loadTask = LumnoAggregateSearchStorage.loadAggregateSearches(
      overlayState.storageArea,
      AGGREGATE_SEARCH_STORAGE_KEY,
      chrome
    ).then((items) => {
      if (loadVersion === overlayState.aggregateSearchesLoadVersion) {
        overlayState.aggregateSearchesCache = items;
        return items;
      }
      return overlayState.aggregateSearchesCache || [];
    }).catch((): AggregateSearch[] => {
      if (loadVersion === overlayState.aggregateSearchesLoadVersion) {
        overlayState.aggregateSearchesCache = null;
        return [];
      }
      return overlayState.aggregateSearchesCache || [];
    }).finally(() => {
      if (overlayState.aggregateSearchesLoadPromise === loadTask) {
        overlayState.aggregateSearchesLoadPromise = null;
      }
    });
    overlayState.aggregateSearchesLoadPromise = loadTask;
    return loadTask;
  }

  return {
    buildSearchUrl,
    isAiSiteSearchProvider,
    isSearchEngineSiteSearchProvider,
    isAggregateSearchProvider,
    openSiteSearchProviderQuery,
    recordSearchSuggestionSelectionFromSuggestion,
    getProviderIcon,
    toPageRenderableIconUrl,
    getPageRenderableProviderIcon,
    getSiteSearchProviders,
    reloadSiteSearchProvidersFromStorage,
    getAggregateSearches
  };
}

export { createSiteSearchProviders };
export type { SiteSearchProvidersDeps, SiteSearchProvidersState };
