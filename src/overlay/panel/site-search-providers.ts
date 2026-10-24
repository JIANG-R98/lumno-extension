// @ts-nocheck
// Site search providers and aggregate searches in the overlay: their
// URLs and icons, running an interactive provider, recording a selection,
// and loading and reloading both lists.
import * as AGGREGATE_SEARCH_SURFACE from '../../domain/search/aggregate-search-surface';
import * as SITE_SEARCH_STORE from '../../shared/search/site-search-store';

function createSiteSearchProviders(deps) {
  const {
    SEARCH_UTILS,
    getHelpCenterLocale,
    AGGREGATE_SEARCH_STORE,
    showOverlayToast,
    t,
    getSearchResultNewTabDisposition,
    finishOverlayResultActivation,
    getOverlayFaviconUrlResolver,
    SHORTCUT_FAVICON,
    siteSearchIconCacheOptions,
    FAVICON_UTILS,
    faviconDataCache,
    getHostFromUrl,
    SITE_SEARCH_STORAGE_KEY,
    SITE_SEARCH_DISABLED_STORAGE_KEY,
    getStorageValuesAsync,
    AGGREGATE_SEARCH_STORAGE_KEY
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  let siteSearchProvidersLoadPromise = null;
  let aggregateSearchRequestController = null;

  function buildSearchUrl(template, query, provider) {
    if (!template) {
      return '';
    }
    const url = template.replace(/\{query\}/g, encodeURIComponent(query));
    return provider ? SEARCH_UTILS.withHelpCenterLocale(url, provider, getHelpCenterLocale()) : url;
  }

  function isAiSiteSearchProvider(provider) {
    return SEARCH_UTILS.isAiSiteSearchProvider(provider);
  }

  function isSearchEngineSiteSearchProvider(provider) {
    return SEARCH_UTILS.isSearchEngineSiteSearchProvider(provider);
  }

  function isAggregateSearchProvider(provider) {
    return AGGREGATE_SEARCH_STORE.isAggregateSearchProvider(provider);
  }

  function isInteractiveSiteSearchProvider(provider) {
    return SEARCH_UTILS.isInteractiveSiteSearchProvider(provider);
  }

  function getAggregateSearchRequestController() {
    if (aggregateSearchRequestController) {
      return aggregateSearchRequestController;
    }
    aggregateSearchRequestController = AGGREGATE_SEARCH_SURFACE.createAggregateSearchRequestController({
      chromeApi: chrome,
      onFeedback(descriptor) {
        showOverlayToast(t(descriptor.messageKey, descriptor.fallback), descriptor.isError);
      }
    });
    return aggregateSearchRequestController;
  }

  function openSiteSearchProviderQuery(provider, query, event) {
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
            setTimeout(() => {
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
      chrome.runtime.sendMessage({
        action: 'runSiteSearchProviderQuery',
        provider: provider,
        query: trimmedQuery,
        disposition: getSearchResultNewTabDisposition(event)
      });
      return true;
    }
    const siteUrl = buildSearchUrl(provider.template, trimmedQuery, provider);
    if (!siteUrl) {
      return false;
    }
    chrome.runtime.sendMessage({
      action: 'createTab',
      url: siteUrl,
      disposition: getSearchResultNewTabDisposition(event)
    });
    return true;
  }

  function recordSearchSuggestionSelectionFromSuggestion(suggestion, query, source) {
    if (!suggestion || suggestion.forceSearch || suggestion.provider || !suggestion.url) {
      return;
    }
    try {
      chrome.runtime.sendMessage({
        action: 'recordSearchSuggestionSelection',
        query: String(query || '').trim(),
        url: suggestion.url,
        title: suggestion.title || '',
        type: suggestion.type || 'history',
        source: source || 'overlay'
      });
    } catch (e) {
      // Selection ranking is best-effort; never block opening the target.
    }
  }

  function getProviderIcon(provider) {
    const resolver = getOverlayFaviconUrlResolver();
    if (!resolver) {
      return '';
    }
    const iconUrl = SHORTCUT_FAVICON.getSiteSearchProviderIcon(
      overlayState.siteSearchIconCacheLoaded ? overlayState.siteSearchIconCache : {}, provider, Date.now(), {
        ...siteSearchIconCacheOptions,
        resolveAssetUrl: (path) => chrome.runtime.getURL(path)
      }
    );
    return resolver.getProviderFaviconUrl(SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider), iconUrl);
  }

  // Input-mode icons load straight into an <img> in the page, which cannot
  // load the browser's _favicon cache; those arrive as data: URLs from the
  // background, and the provider keeps its glyph until one is cached.
  function toPageRenderableIconUrl(iconUrl, pageUrl) {
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

  function getPageRenderableProviderIcon(provider) {
    return toPageRenderableIconUrl(getProviderIcon(provider), SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider));
  }

  function getProviderIconAttachPageUrl(provider, iconUrl, iconHost) {
    const providerPageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
    if (providerPageUrl) {
      return providerPageUrl;
    }
    const canonicalIconPageUrl = FAVICON_UTILS.getCanonicalPageUrlForFavicon(iconUrl);
    if (canonicalIconPageUrl && canonicalIconPageUrl !== iconUrl) {
      return canonicalIconPageUrl;
    }
    const host = String(iconHost || '').trim();
    return host ? `https://${host}/` : '';
  }

  function attachInputModeProviderIcon(icon, context) {
    const iconUrl = context && context.iconUrl ? String(context.iconUrl).trim() : '';
    if (!icon || !iconUrl || iconUrl.startsWith('data:') || /^(?:chrome|moz)-extension:/i.test(iconUrl)) {
      return false;
    }
    const iconHost = context && context.iconHost ? String(context.iconHost).trim() : '';
    const pageUrl = getProviderIconAttachPageUrl(
      context && context.provider ? context.provider : null,
      iconUrl,
      iconHost
    );
    if (!pageUrl) {
      return false;
    }
    const hostKey = iconHost || getHostFromUrl(pageUrl);
    overlayState.attachResolvedFaviconWithFallbacks(icon, pageUrl, hostKey, iconUrl, () => {
      if (context && typeof context.onIconUnavailable === 'function') {
        context.onIconUnavailable();
        return;
      }
      if (icon && typeof icon.remove === 'function') {
        icon.remove();
      }
    });
    return true;
  }

  function beginSiteSearchProviderLoad(loader, options) {
    const settings = options && typeof options === 'object' ? options : {};
    if (settings.invalidate === true) {
      overlayState.siteSearchProvidersLoadVersion += 1;
      siteSearchProvidersLoadPromise = null;
    }
    const loadVersion = overlayState.siteSearchProvidersLoadVersion;
    let loadTask = null;
    loadTask = Promise.resolve().then(() => loader()).then((items) => {
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

  function getSiteSearchProviders() {
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

  function reloadSiteSearchProvidersFromStorage() {
    return beginSiteSearchProviderLoad(() => getStorageValuesAsync([
      SITE_SEARCH_STORAGE_KEY,
      SITE_SEARCH_DISABLED_STORAGE_KEY
    ]).then((result) => {
      const customItems = Array.isArray(result[SITE_SEARCH_STORAGE_KEY])
        ? result[SITE_SEARCH_STORAGE_KEY]
        : [];
      const disabledKeys = Array.isArray(result[SITE_SEARCH_DISABLED_STORAGE_KEY])
        ? result[SITE_SEARCH_DISABLED_STORAGE_KEY]
        : [];
      return SITE_SEARCH_STORE.mergeStoredProviders(
        overlayState.defaultSiteSearchProviders,
        customItems,
        disabledKeys,
        SEARCH_UTILS.mergeCustomProviders
      );
    }), { invalidate: true });
  }

  function getAggregateSearches() {
    if (overlayState.aggregateSearchesCache) {
      return Promise.resolve(overlayState.aggregateSearchesCache);
    }
    if (overlayState.aggregateSearchesLoadPromise) {
      return overlayState.aggregateSearchesLoadPromise;
    }
    const loadVersion = overlayState.aggregateSearchesLoadVersion;
    const loadTask = AGGREGATE_SEARCH_STORE.loadAggregateSearches(
      overlayState.storageArea,
      AGGREGATE_SEARCH_STORAGE_KEY,
      chrome
    ).then((items) => {
      if (loadVersion === overlayState.aggregateSearchesLoadVersion) {
        overlayState.aggregateSearchesCache = items;
        return items;
      }
      return overlayState.aggregateSearchesCache || [];
    }).catch(() => {
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
    attachInputModeProviderIcon,
    getSiteSearchProviders,
    reloadSiteSearchProvidersFromStorage,
    getAggregateSearches
  };
}

export { createSiteSearchProviders };
