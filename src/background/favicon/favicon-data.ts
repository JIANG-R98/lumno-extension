// Favicon images fetched as data URLs, and web pages' extension icons
// inlined for them.
import * as BoundedCache from '../../domain/bounded-cache';
import * as FaviconEnhancedFetchPolicy from '../../domain/favicon/enhanced-fetch-policy';
import * as FaviconUrlKinds from '../../domain/favicon/url-kinds';

import { arrayBufferToBase64, getBackgroundFaviconUrlResolver, getFaviconHostPolicy, isAllowedFaviconProxyRequestUrl, isBlockedLocalFaviconUrl, isFaviconProxyUrl, isFaviconRequestBlockedByBlacklist, logBlockedLocalFavicon } from './candidates';
import { getFaviconRequestMatchUrl, isUrlBlockedByFaviconRequestBlacklist, loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from './request-policy';

// Favicon data URLs by source URL.
const faviconDataCache = new Map<string, string>();

const faviconPending = new Map<string, Promise<string | null>>();


const BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES = 256;


function fetchFaviconData(requestedUrl: unknown, pageUrl?: unknown): Promise<string | null> {
  if (!requestedUrl) {
    return Promise.resolve(null);
  }
  let url = String(requestedUrl);
  return Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(([, enhancedFetchEnabled]) => {
    const canonicalPageUrl = getFaviconRequestMatchUrl(pageUrl || url);
    const requestExcluded = isUrlBlockedByFaviconRequestBlacklist(canonicalPageUrl);
    const effectiveEnhancedFetchEnabled = enhancedFetchEnabled && !requestExcluded;
    const sourceAllowedByMode = FaviconEnhancedFetchPolicy.isFaviconSourceAllowedByEnhancedFetchPolicy(url, effectiveEnhancedFetchEnabled, {
      chromeApi: chrome,
      allowThirdPartyFetch: !requestExcluded
    });
    const sourceAllowed = sourceAllowedByMode && isAllowedFaviconProxyRequestUrl(url);
    if (!sourceAllowed) {
      logBlockedLocalFavicon(
        url,
        isFaviconProxyUrl(url) ? 'third-party-proxy' : 'direct',
        requestExcluded ? 'exclusion' : 'global-off',
        canonicalPageUrl
      );
      return null;
    }
    const resolver = getBackgroundFaviconUrlResolver();
    const matchedSourceUrl = resolver && resolver.getSafeFaviconCandidateUrl(url, canonicalPageUrl, 'background-data');
    if (!matchedSourceUrl) {
      return null;
    }
    url = matchedSourceUrl;
    if (isBlockedLocalFaviconUrl(url) || isFaviconRequestBlockedByBlacklist(url)) {
      logBlockedLocalFavicon(url, 'fetchFaviconData');
      return null;
    }
    try {
      const parsed = new URL(url);
      if (getFaviconHostPolicy(parsed.hostname).hardBlocked) {
        return null;
      }
    } catch (_error) {
      // Keep existing behavior for non-standard URL formats.
    }
    const cached = faviconDataCache.get(url);
    if (cached) {
      return cached;
    }
    const pending = faviconPending.get(url);
    if (pending) {
      return pending;
    }
    const sourceUrl = url;
    const promise = fetchFaviconDataUrl(sourceUrl).then((dataUrl): string | null | Promise<string | null> => {
      if (!dataUrl || !FaviconUrlKinds.isExtensionFaviconEndpointUrl(sourceUrl)) {
        return dataUrl;
      }
      // Chromium answers an unknown page with its default globe; web-page
      // surfaces cannot compare pixels against it any more, so report no icon.
      return fetchExtensionFaviconPlaceholderData(sourceUrl).then((placeholderData) => (
        placeholderData && placeholderData === dataUrl ? null : dataUrl
      ));
    })
      .then((dataUrl) => {
        if (dataUrl) {
          BoundedCache.setBoundedCacheEntry(
            faviconDataCache,
            sourceUrl,
            dataUrl,
            BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES
          );
        }
        faviconPending.delete(sourceUrl);
        return dataUrl;
      })
      .catch(() => {
        faviconPending.delete(sourceUrl);
        return null;
      });
    faviconPending.set(sourceUrl, promise);
    return promise;
  });
}

// Web pages cannot load _favicon URLs (they are not web accessible), so items
// rendered inside a page get their browser-cache icons as data: URLs. An icon
// not ready within the wait renders as the surface's fallback instead.
function inlineExtensionFaviconsForWebPage<T extends { favIconUrl?: unknown; url?: unknown }>(
  items: readonly T[] | null | undefined,
  waitMs?: number
): Promise<T[]> {
  const list: readonly T[] = Array.isArray(items) ? items : [];
  const timeoutMs = typeof waitMs === 'number' && Number.isFinite(waitMs) ? Math.max(0, waitMs) : 400;
  return Promise.all(list.map((item): T | Promise<T> => {
    const iconUrl = item && typeof item.favIconUrl === 'string' ? item.favIconUrl : '';
    if (!FaviconUrlKinds.isExtensionFaviconEndpointUrl(iconUrl)) {
      return item;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    return Promise.race([fetchFaviconData(iconUrl, item.url || '').catch(() => null), timeout])
      .then((dataUrl) => {
        clearTimeout(timer);
        return { ...item, favIconUrl: dataUrl || '' };
      });
  }));
}

const extensionFaviconPlaceholderData = new Map<string, Promise<string | null>>();

function fetchExtensionFaviconPlaceholderData(faviconUrl: string): Promise<string | null> {
  let placeholderUrl = '';
  try {
    const parsed = new URL(faviconUrl);
    parsed.searchParams.set('pageUrl', 'https://lumno.invalid/__favicon_placeholder_probe__');
    placeholderUrl = parsed.toString();
  } catch (_error) {
    return Promise.resolve(null);
  }
  const known = extensionFaviconPlaceholderData.get(placeholderUrl);
  if (known) {
    return known;
  }
  const pending = fetchFaviconDataUrl(placeholderUrl).then((dataUrl) => {
    if (!dataUrl) {
      extensionFaviconPlaceholderData.delete(placeholderUrl);
    }
    return dataUrl;
  });
  BoundedCache.setBoundedCacheEntry(extensionFaviconPlaceholderData, placeholderUrl, pending, 16);
  return pending;
}

// Reads an approved favicon source into a data: URL (null when unusable).
function fetchFaviconDataUrl(url: string): Promise<string | null> {
  return fetch(url, {
    cache: 'force-cache',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error'
  })
    .then((response) => {
      if (!response || !response.ok) {
        return null;
      }
      const responseUrl = String(response.url || url);
      if (!isAllowedFaviconProxyRequestUrl(responseUrl)) {
        return null;
      }
      return response.blob();
    })
    .then((blob) => {
      if (!blob || blob.size > 256 * 1024) {
        return null;
      }
      return blob.arrayBuffer().then((buffer) => {
        const base64 = arrayBufferToBase64(buffer);
        return `data:${blob.type || 'image/png'};base64,${base64}`;
      });
    })
    .catch(() => null);
}

export {
  BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES,
  extensionFaviconPlaceholderData,
  faviconDataCache,
  faviconPending,
  fetchExtensionFaviconPlaceholderData,
  fetchFaviconData,
  fetchFaviconDataUrl,
  inlineExtensionFaviconsForWebPage
};
