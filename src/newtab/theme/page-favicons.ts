// @ts-nocheck
// Favicons on the page: the persisted favicon, data and site theme caches,
// the favicon view runtime that renders icons with their fallbacks, and the
// favicon sources suggestions and themes resolve from.
import * as NEWTAB_FAVICON_CACHE from '../../domain/favicon/favicon-cache';
import * as NEWTAB_FAVICON_VIEW from './favicon-view';

function createPageFavicons(deps) {
  const {
    normalizeFaviconHost,
    FAVICON_CACHE_BOOT_WAIT_MS,
    isPersistableTheme,
    normalizeAccentRgb,
    parseCssColor,
    getThemeSource,
    isLowConfidenceTheme,
    normalizeThemeConfidence,
    FAVICON_UTILS,
    getRiSvg,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    isOwnExtensionUrl,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    isNewtabEnhancedFaviconFetchEnabled,
    getNewtabStrictFaviconReason,
    getHostFromUrl,
    isFaviconProxyUrl,
    themeHostCache,
    isUrlBlockedByFaviconRequestBlacklist,
    themeColorCache,
    normalizeHost,
    getThemeSourcePriority,
    extractAverageColor,
    buildThemeFromAccent,
    setResolvedThemeForHost,
    getShortcutFaviconCandidateUrl,
    getShortcutFaviconDataUrl,
    getProviderIcon,
    getProviderFaviconPageUrl
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;


  pageState.faviconDataCache = new Map();
  const faviconDataPending = new Map();
  pageState.faviconCacheRuntime = NEWTAB_FAVICON_CACHE.createFaviconCache({
    storageArea: (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null,
    windowObj: window,
    normalizeFaviconHost,
    isBlockedLocalFaviconUrl,
    isChromeMonogramFaviconUrl,
    faviconCacheBootWaitMs: FAVICON_CACHE_BOOT_WAIT_MS
  });

  function isFaviconPersistLoaded() {
    return pageState.faviconCacheRuntime.isFaviconPersistLoaded();
  }

  function isFaviconDataPersistLoaded() {
    return pageState.faviconCacheRuntime.isFaviconDataPersistLoaded();
  }

  function isSiteThemePersistLoaded() {
    return pageState.faviconCacheRuntime.isSiteThemePersistLoaded();
  }

  function waitForFaviconCachesOrTimeout(maxWaitMs) {
    return pageState.faviconCacheRuntime.waitForCachesOrTimeout(maxWaitMs);
  }

  function areFaviconRenderCachesReady() {
    return isFaviconPersistLoaded() && isFaviconDataPersistLoaded() && isSiteThemePersistLoaded();
  }

  function waitForFaviconRenderCaches(maxWaitMs) {
    if (areFaviconRenderCachesReady()) {
      return Promise.resolve();
    }
    return waitForFaviconCachesOrTimeout(maxWaitMs);
  }

  function isHostFaviconVisitDirty(hostname) {
    return pageState.faviconCacheRuntime.isHostVisitDirty(hostname);
  }

  function setPersistedFaviconUrl(cacheKey, url) {
    pageState.faviconCacheRuntime.setPersistedUrl(cacheKey, url);
  }

  function getPersistedFaviconEntry(cacheKey) {
    return pageState.faviconCacheRuntime.getPersistedEntry(cacheKey);
  }

  function getPersistedFaviconDataEntry(cacheKey) {
    return pageState.faviconCacheRuntime.getPersistedDataEntry(cacheKey);
  }

  function setPersistedFaviconData(cacheKey, dataUrl) {
    pageState.faviconCacheRuntime.setPersistedData(cacheKey, dataUrl);
  }

  function getPersistedSiteThemeEntry(hostKey) {
    return pageState.faviconCacheRuntime.getPersistedThemeEntry(hostKey);
  }

  function setPersistedSiteThemeEntry(hostKey, theme) {
    if (!theme || !isPersistableTheme(theme)) {
      return false;
    }
    const accentRgb = normalizeAccentRgb(theme.accentRgb || parseCssColor(theme.accent));
    if (!accentRgb) {
      return false;
    }
    return pageState.faviconCacheRuntime.setPersistedThemeEntry(hostKey, {
      accentRgb,
      source: getThemeSource(theme),
      neutral: isLowConfidenceTheme(theme) || theme._xThemeNeutral === true,
      confidence: normalizeThemeConfidence(theme._xThemeConfidence, accentRgb)
    });
  }

  const logNewtabFaviconDecision = FAVICON_UTILS.createFaviconDecisionLogger({ surface: 'newtab' });
  pageState.faviconViewRuntime = NEWTAB_FAVICON_VIEW.createFaviconViewRuntime({
    document,
    windowObj: window,
    chromeApi: chrome,
    getRiSvg,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    isOwnExtensionUrl,
    isBlockedLocalFaviconUrl,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    isEnhancedFaviconFetchEnabled: isNewtabEnhancedFaviconFetchEnabled,
    getStrictFaviconReason: getNewtabStrictFaviconReason,
    logFaviconDecision: logNewtabFaviconDecision,
    getHostFromUrl,
    isFaviconProxyUrl,
    isChromeMonogramFaviconUrl,
    getPersistedFaviconEntry,
    getPersistedFaviconDataEntry,
    setPersistedFaviconUrl,
    setPersistedFaviconData,
    preloadThemeFromFavicon,
    faviconDataCache: pageState.faviconDataCache,
    faviconDataPending,
    hasThemeForHost: (hostKey) => Boolean(hostKey && themeHostCache.has(hostKey))
  });
  const applyFaviconOpticalShift = pageState.faviconViewRuntime.applyFaviconOpticalShift;
  const applyFaviconOpticalAlignment = pageState.faviconViewRuntime.applyFaviconOpticalAlignment;
  const reportMissingIcon = pageState.faviconViewRuntime.reportMissingIcon;
  const applyFallbackIcon = pageState.faviconViewRuntime.applyFallbackIcon;
  pageState.requestFaviconData = pageState.faviconViewRuntime.requestFaviconData;
  const setFaviconSrcWithAnimation = pageState.faviconViewRuntime.setFaviconSrcWithAnimation;
  const attachFaviconData = pageState.faviconViewRuntime.attachFaviconData;
  const preloadIcon = pageState.faviconViewRuntime.preloadIcon;
  const warmIconCache = pageState.faviconViewRuntime.warmIconCache;
  const attachFaviconWithFallbacks = pageState.faviconViewRuntime.attachFaviconWithFallbacks;

  function isAllowedFaviconProxyRequestUrl(url) {
    return FAVICON_UTILS.isAllowedFaviconProxyRequestUrl(url);
  }

  function isBlockedLocalFaviconUrl(url) {
    const blockedByLocalRules = FAVICON_UTILS.isBlockedLocalFaviconUrl(url);
    return blockedByLocalRules ||
      (!isAllowedFaviconProxyRequestUrl(url) && isUrlBlockedByFaviconRequestBlacklist(url));
  }

  function isChromeMonogramFaviconUrl(url) {
    return FAVICON_UTILS.isChromeMonogramFaviconUrl(url);
  }

  function preloadThemeFromFavicon(url, dataUrl, hostOverride) {
    const cachedTheme = themeColorCache.get(url);
    if (!url || (cachedTheme && !cachedTheme._xIsDefault)) {
      return;
    }
    const hostKey = normalizeHost(hostOverride || getHostFromUrl(url));
    const useHostCache = hostKey && (Boolean(hostOverride) || !isFaviconProxyUrl(url));
    const cachedHostTheme = useHostCache ? themeHostCache.get(hostKey) : null;
    if (
      cachedHostTheme &&
      getThemeSourcePriority(getThemeSource(cachedHostTheme), cachedHostTheme) > getThemeSourcePriority('favicon')
    ) {
      return;
    }
    if (!dataUrl) {
      return;
    }
    const image = new Image();
    image.onload = function() {
      const avg = extractAverageColor(image);
      // Generic globes would otherwise become the whole host's theme.
      if (!avg || FAVICON_UTILS.isPlaceholderFaviconColor(avg)) {
        return;
      }
      const theme = buildThemeFromAccent(avg, 'favicon');
      themeColorCache.set(url, theme);
      if (useHostCache) {
        setResolvedThemeForHost(hostKey, theme, { iconUrl: url });
      }
    };
    image.onerror = function() {};
    image.src = dataUrl;
  }

  const FAVICON_PROXY_SIZE = 128;
  let pageFaviconUrlResolver = null;

  function getPageFaviconUrlResolver() {
    if (!pageFaviconUrlResolver) {
      pageFaviconUrlResolver = FAVICON_UTILS.createFaviconUrlResolver({
        chromeApi: chrome,
        size: FAVICON_PROXY_SIZE,
        shouldBlockFaviconForHost,
        shouldAvoidDirectFaviconForHost,
        isEnhancedFaviconFetchEnabled: isNewtabEnhancedFaviconFetchEnabled,
        getStrictFaviconReason: getNewtabStrictFaviconReason,
        logFaviconDecision: logNewtabFaviconDecision
      });
    }
    return pageFaviconUrlResolver;
  }

  function getThemeSourceForSuggestion(suggestion) {
    if (suggestion && suggestion.type === 'shortcut') {
      return getShortcutFaviconCandidateUrl(suggestion.url) || getShortcutFaviconDataUrl(suggestion.url);
    }
    if (suggestion && suggestion.provider) {
      const resolver = getPageFaviconUrlResolver();
      return resolver ? resolver.resolveFaviconSource(
        getProviderIcon(suggestion.provider), getProviderFaviconPageUrl(suggestion.provider)
      ) : '';
    }
    const resolver = getPageFaviconUrlResolver();
    return resolver
      ? resolver.resolveFaviconSource(suggestion && suggestion.favicon, suggestion && suggestion.url)
      : '';
  }

  return {
    areFaviconRenderCachesReady,
    waitForFaviconRenderCaches,
    isHostFaviconVisitDirty,
    getPersistedFaviconDataEntry,
    getPersistedSiteThemeEntry,
    setPersistedSiteThemeEntry,
    applyFaviconOpticalShift,
    applyFaviconOpticalAlignment,
    reportMissingIcon,
    applyFallbackIcon,
    setFaviconSrcWithAnimation,
    attachFaviconData,
    preloadIcon,
    warmIconCache,
    attachFaviconWithFallbacks,
    getPageFaviconUrlResolver,
    getThemeSourceForSuggestion
  };
}

export { createPageFavicons };
