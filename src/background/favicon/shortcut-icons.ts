// High-resolution shortcut icons: picking a source, fetching it and caching
// the result.
import * as BROWSER_PROFILE from '../../platform/browser-profile';
import * as LumnoBrowserIcons from '../../platform/browser-icons';
import { faviconEnhancedFetchEnabled, faviconRequestBlacklist } from '../../domain/settings';
import * as SHORTCUT_FAVICON from '../../domain/favicon/shortcut-favicon';
import { workerSettings } from '../worker-context';
import * as BoundedCache from '../../domain/bounded-cache';
import * as FaviconBrowserIconIndex from '../../domain/favicon/browser-icon-index';
import * as FaviconCanonical from '../../domain/favicon/canonical';
import type { ShortcutFetchCandidate } from '../../domain/favicon/types';

import { arrayBufferToBase64, getBackgroundFaviconUrlResolver, getFaviconTargetPolicy, isAllowedFaviconProxyRequestUrl } from './candidates';
import { BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES, faviconDataCache } from './favicon-data';
import { loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from './request-policy';
import type { ShortcutIconResult, ShortcutResourceCandidate } from './types';

const shortcutFaviconDataCache = new Map<string, ShortcutIconResult>();

const shortcutFaviconPending = new Map<string, Promise<ShortcutIconResult | null>>();

let shortcutFaviconPolicyRevision = 0;


const BACKGROUND_SHORTCUT_FAVICON_CACHE_MAX_ENTRIES = 64;

const SHORTCUT_FAVICON_FETCH_TIMEOUT_MS = 6500;

const SHORTCUT_FAVICON_RESOURCE_MAX_BYTES = 256 * 1024;

function invalidateShortcutFaviconPolicyCache(): void {
  shortcutFaviconPolicyRevision += 1;
  shortcutFaviconDataCache.clear();
  shortcutFaviconPending.clear();
}

// A changed blocklist or fetch setting changes which shortcut icons may be
// fetched.
workerSettings.subscribe([faviconRequestBlacklist, faviconEnhancedFetchEnabled], invalidateShortcutFaviconPolicyCache);


function getShortcutFaviconPreferredTheme(value: unknown): 'dark' | 'light' | '' {
  const theme = String(value || '').trim().toLowerCase();
  return theme === 'dark' || theme === 'light' ? theme : '';
}

// Whether the policy lets a shortcut icon come from this URL, before the
// request and again for the URL that answered.
function allowsShortcutSource(url: string, pageUrl: string, phase: string, candidate: ShortcutResourceCandidate): boolean {
  const resolver = getBackgroundFaviconUrlResolver();
  return isAllowedFaviconProxyRequestUrl(url) && Boolean(resolver) &&
    Boolean(resolver.getSafeFaviconCandidateUrl(url, pageUrl, phase, { allowDomainProxy: candidate.kind === 'favicon-is' }));
}

function readShortcutResponse(
  response: Response,
  sourceUrl: string,
  pageUrl: string,
  candidate: ShortcutResourceCandidate
): Promise<{ blob: Blob; sourceUrl: string }> | null {
  if (!response || !response.ok) {
    return null;
  }
  const resolvedSourceUrl = typeof response.url === 'string' && response.url ? response.url : sourceUrl;
  if (!allowsShortcutSource(resolvedSourceUrl, pageUrl, 'shortcut-response', candidate)) {
    return null;
  }
  const contentLength = Number(response.headers && response.headers.get
    ? response.headers.get('content-length') || 0
    : 0);
  if (Number.isFinite(contentLength) && contentLength > SHORTCUT_FAVICON_RESOURCE_MAX_BYTES) {
    return null;
  }
  return response.blob().then((blob) => ({ blob, sourceUrl: resolvedSourceUrl }));
}

async function inspectShortcutResource(
  result: { blob: Blob; sourceUrl: string },
  pageUrl: string,
  candidate: ShortcutResourceCandidate
): Promise<ShortcutIconResult | null> {
  const { blob } = result;
  if (!blob || blob.size <= 0 || blob.size > SHORTCUT_FAVICON_RESOURCE_MAX_BYTES) {
    return null;
  }
  const buffer = await blob.arrayBuffer();
  const inspection = SHORTCUT_FAVICON.inspectIconResource(buffer, blob.type, result.sourceUrl, candidate, { minDimension: 16 });
  if (inspection.usable !== true) {
    return null;
  }
  return {
    data: `data:${inspection.mimeType || blob.type || 'image/png'};base64,${arrayBufferToBase64(buffer)}`,
    sourceUrl: result.sourceUrl,
    width: Number(inspection.width || 0),
    height: Number(inspection.height || 0),
    vector: inspection.vector === true,
    pageUrl
  };
}

function fetchShortcutFaviconResource(
  candidate: ShortcutResourceCandidate,
  pageUrl: string,
  signal: AbortSignal | undefined
): Promise<ShortcutIconResult | null> {
  const sourceUrl = candidate && candidate.url ? String(candidate.url) : '';
  if (!sourceUrl || !allowsShortcutSource(sourceUrl, pageUrl, 'shortcut-snapshot', candidate)) {
    return Promise.resolve(null);
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const abort = () => controller && controller.abort();
  if (signal && signal.aborted) {
    return Promise.resolve(null);
  }
  if (signal && controller) {
    signal.addEventListener('abort', abort, { once: true });
  }
  // Leave time for the local Chrome snapshot if the proxy is unreachable.
  const timeoutId = controller ? setTimeout(abort,
    candidate.kind === 'favicon-is' ? 5000 : candidate.kind === 'proxy' ? 2500 : 1500) : null;
  return fetch(sourceUrl, {
    cache: candidate.refresh === true ? 'reload' : 'force-cache',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    signal: controller ? controller.signal : signal
  }).then((response) => readShortcutResponse(response, sourceUrl, pageUrl, candidate))
    .then((result) => result && inspectShortcutResource(result, pageUrl, candidate))
    .catch(() => null).finally(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (signal && controller) {
        signal.removeEventListener('abort', abort);
      }
    });
}

// Firefox has no _favicon endpoint. Its own icon cache is reachable through
// open tabs and top sites; like Chrome's cache it never contacts the site.
async function getFirefoxBrowserFaviconUrl(pageUrl: string): Promise<string> {
  const browserIcons = FaviconBrowserIconIndex.createBrowserIconIndex();
  await LumnoBrowserIcons.loadBrowserIcons(browserIcons, chrome);
  return browserIcons.get(pageUrl);
}

async function fetchFirefoxBrowserCacheFavicon(
  candidate: ShortcutResourceCandidate,
  pageUrl: string,
  signal: AbortSignal | undefined
): Promise<ShortcutIconResult | null> {
  const iconUrl = await getFirefoxBrowserFaviconUrl(pageUrl);
  if (!iconUrl || (signal && signal.aborted)) {
    return null;
  }
  try {
    // A data: URL from Firefox's icon cache; decoding it is local.
    const response = await fetch(iconUrl, { signal });
    if (!response || !response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob || blob.size <= 0 || blob.size > SHORTCUT_FAVICON_RESOURCE_MAX_BYTES) {
      return null;
    }
    const buffer = await blob.arrayBuffer();
    const inspection = SHORTCUT_FAVICON.inspectIconResource(buffer, blob.type, iconUrl, candidate, { minDimension: 16 });
    if (inspection.usable !== true) {
      return null;
    }
    // Keep the browser-cache request URL as the source so the snapshot reads
    // as a cache icon for this page, exactly like a Chrome snapshot.
    return {
      data: `data:${inspection.mimeType || blob.type || 'image/png'};base64,${arrayBufferToBase64(buffer)}`,
      sourceUrl: candidate.url,
      width: Number(inspection.width || 0),
      height: Number(inspection.height || 0),
      vector: inspection.vector === true,
      pageUrl
    };
  } catch (_error) {
    return null;
  }
}

// The browser's generic globe for a page it has no icon for. Chrome's
// cached artwork is saved once rather than kept as a live cache URL, and the
// globe must not become a permanent shortcut snapshot.
async function isBrowserPlaceholder(
  candidate: ShortcutFetchCandidate,
  result: ShortcutIconResult,
  signal: AbortSignal | undefined
): Promise<boolean> {
  const placeholderUrl = candidate.placeholderUrl;
  if (!placeholderUrl || !(candidate.kind === 'browser-cache' || candidate.kind === 'favicon-is' ||
      (result.width <= 16 && result.height <= 16))) {
    return false;
  }
  let placeholderData = faviconDataCache.get(placeholderUrl);
  if (!placeholderData) {
    const placeholder = await fetchShortcutFaviconResource({
      url: placeholderUrl,
      kind: candidate.kind,
      declaredSize: 128
    }, FaviconCanonical.getPageUrlFromFaviconProxyUrl(placeholderUrl), signal);
    placeholderData = placeholder ? placeholder.data : undefined;
    if (placeholderData) {
      BoundedCache.setBoundedCacheEntry(faviconDataCache, placeholderUrl,
        placeholderData, BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES);
    }
  }
  return Boolean(placeholderData) && placeholderData === result.data;
}

async function resolveShortcutFaviconData(
  pageUrl: string,
  signal: AbortSignal | undefined,
  refresh: boolean,
  iconSource: string
): Promise<ShortcutIconResult | null> {
  const resolver = getBackgroundFaviconUrlResolver();
  const candidates: ShortcutFetchCandidate[] = resolver ? resolver.getShortcutFaviconFetchCandidates(pageUrl, iconSource) : [];
  const firefoxRuntime = BROWSER_PROFILE.isFirefoxExtensionRuntime();
  for (const candidate of candidates) {
    if (signal && signal.aborted) {
      break;
    }
    if (firefoxRuntime && candidate.kind === 'browser-cache') {
      const firefoxResult = await fetchFirefoxBrowserCacheFavicon({
        ...candidate,
        refresh: refresh === true
      }, pageUrl, signal);
      if (firefoxResult) {
        return firefoxResult;
      }
      continue;
    }
    const result = await fetchShortcutFaviconResource({
      ...candidate,
      refresh: refresh === true,
      declaredSize: 128,
      vector: false
    }, pageUrl, signal);
    if (!result) {
      continue;
    }
    // Save Chrome's cached artwork once rather than keeping a live cache URL.
    // Its generic globe must not become a permanent shortcut snapshot.
    if (await isBrowserPlaceholder(candidate, result, signal)) {
      continue;
    }
    return result;
  }
  return null;
}

function fetchShortcutFaviconData(
  pageUrl: unknown,
  preferredTheme?: unknown,
  explicitIconUrl?: unknown,
  refresh?: boolean,
  iconSource?: unknown
): Promise<ShortcutIconResult | null> {
  const normalizedPageUrl = SHORTCUT_FAVICON.normalizePageUrl(pageUrl);
  const theme = getShortcutFaviconPreferredTheme(preferredTheme);
  if (!normalizedPageUrl) {
    return Promise.resolve(null);
  }
  const explicitIcon = String(explicitIconUrl || '').trim();
  const selectedSource = iconSource === 'service' || iconSource === 'favicon-is' || iconSource === 'cache' ? iconSource : '';
  const cacheKey = `${normalizedPageUrl}::${theme || 'auto'}::${explicitIcon}${selectedSource ? `::${selectedSource}` : ''}`;
  const pendingKey = refresh === true ? `${cacheKey}::refresh` : cacheKey;
  const cachedResult = shortcutFaviconDataCache.get(cacheKey);
  if (refresh !== true && cachedResult) {
    return Promise.resolve(cachedResult);
  }
  const pending = shortcutFaviconPending.get(pendingKey);
  if (pending) {
    return pending;
  }
  const cachedResultAtStart = cachedResult;
  const policyRevision = shortcutFaviconPolicyRevision;
  const promise: Promise<ShortcutIconResult | null> = Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(() => {
    const targetPolicy = getFaviconTargetPolicy(normalizedPageUrl, '');
    if (!targetPolicy.ok || targetPolicy.hardBlocked) {
      return null;
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = setTimeout(() => {
      if (controller) {
        controller.abort();
      }
    }, SHORTCUT_FAVICON_FETCH_TIMEOUT_MS);
    return resolveShortcutFaviconData(
      normalizedPageUrl,
      controller ? controller.signal : undefined,
      refresh === true,
      selectedSource
    ).finally(() => clearTimeout(timeoutId));
  }).then((result) => {
    if (result && policyRevision === shortcutFaviconPolicyRevision &&
        (refresh === true || shortcutFaviconDataCache.get(cacheKey) === cachedResultAtStart)) {
      BoundedCache.setBoundedCacheEntry(
        shortcutFaviconDataCache,
        cacheKey,
        result,
        BACKGROUND_SHORTCUT_FAVICON_CACHE_MAX_ENTRIES
      );
    }
    if (shortcutFaviconPending.get(pendingKey) === promise) {
      shortcutFaviconPending.delete(pendingKey);
    }
    return result || null;
  }).catch(() => {
    if (shortcutFaviconPending.get(pendingKey) === promise) {
      shortcutFaviconPending.delete(pendingKey);
    }
    return null;
  });
  shortcutFaviconPending.set(pendingKey, promise);
  return promise;
}

export {
  BACKGROUND_SHORTCUT_FAVICON_CACHE_MAX_ENTRIES,
  SHORTCUT_FAVICON_FETCH_TIMEOUT_MS,
  SHORTCUT_FAVICON_RESOURCE_MAX_BYTES,
  fetchFirefoxBrowserCacheFavicon,
  fetchShortcutFaviconData,
  fetchShortcutFaviconResource,
  getFirefoxBrowserFaviconUrl,
  getShortcutFaviconPreferredTheme,
  invalidateShortcutFaviconPolicyCache,
  resolveShortcutFaviconData,
  shortcutFaviconDataCache,
  shortcutFaviconPending,
  shortcutFaviconPolicyRevision
};
