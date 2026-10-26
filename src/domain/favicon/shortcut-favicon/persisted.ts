// Saved icon snapshots keyed by page, and the rules for keeping them.
import * as FaviconCanonical from '../canonical';
import * as FaviconUrlKinds from '../url-kinds';
import { SUPPORTED_DATA_URL_PATTERN } from './image-dimensions';
import type { CachedIcon, CachedIconMap, CachedIconSource, IconCacheOptions } from './types';

// Shortcut artwork is a saved snapshot; deletion or a URL edit prunes it.
const CACHE_TTL_MS = 0;
const CACHE_MAX_ENTRIES = 60;
const MAX_DATA_URL_LENGTH = 384 * 1024;
const SITE_SEARCH_CACHE_OPTIONS: Readonly<IconCacheOptions> = Object.freeze({
  cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
  cacheMaxEntries: 40,
  maxDataUrlLength: 192 * 1024
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}


function normalizePageUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    parsed.hash = '';
    return parsed.href;
  } catch (_error) {
    return '';
  }
}

function getCacheKey(pageUrl: unknown): string {
  return normalizePageUrl(pageUrl);
}

function normalizeIconSourceUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (FaviconUrlKinds.isSafeVirtualFaviconRequestUrl(raw)) {
    try { return new URL(raw).href; } catch (_error) { return ''; }
  }
  return normalizePageUrl(raw);
}

function getCachedIconSource(entry: Partial<CachedIcon> | null | undefined): CachedIconSource {
  const sourceUrl = String(entry && entry.sourceUrl || '');
  if (FaviconUrlKinds.isFaviconIsUrl(sourceUrl)) return 'favicon-is';
  return !FaviconUrlKinds.isSafeVirtualFaviconRequestUrl(sourceUrl) && FaviconUrlKinds.isFaviconProxyUrl(sourceUrl)
    ? 'service' : 'cache';
}

// A favicon service's or the browser cache's icon, matched by the page or
// site it was asked about.
function isServiceIconForPage(sourceUrl: string, page: string, parsedPage: URL): boolean {
  const target = normalizePageUrl(FaviconCanonical.getPageUrlFromFaviconProxyUrl(sourceUrl));
  if (target && FaviconUrlKinds.isFaviconIsUrl(sourceUrl)) {
    return new URL(target).hostname === parsedPage.hostname;
  }
  // Remote services are asked about the site, never the page, so their
  // icon stands for every page on it.
  if (target && !FaviconUrlKinds.isSafeVirtualFaviconRequestUrl(sourceUrl) &&
      target === normalizePageUrl(`${parsedPage.origin}/`)) {
    return true;
  }
  if (!target || target !== page) return false;
  if (FaviconUrlKinds.isSafeVirtualFaviconRequestUrl(sourceUrl)) {
    return new URL(sourceUrl).searchParams.get('fallbackToHost') === '0';
  }
  return true;
}

function isCachedIconForPage(entry: Partial<CachedIcon> | null | undefined, pageUrl: unknown): boolean {
  const page = normalizePageUrl(pageUrl);
  if (!entry || !page) return false;
  const parsedPage = new URL(page);
  const isOriginPage = parsedPage.pathname === '/' && !parsedPage.search;
  const sourceUrl = normalizeIconSourceUrl(entry.sourceUrl);
  // Older Chrome snapshots lost their source URL. Reacquire path-specific
  // entries once, since their page-to-icon mapping cannot be verified.
  if (!sourceUrl) return isOriginPage;
  // The chrome://favicon2 local-storage branch ignores fallbackToHost=0.
  if (FaviconUrlKinds.isChromeMonogramFaviconUrl(sourceUrl)) return false;
  if (FaviconUrlKinds.isFaviconProxyUrl(sourceUrl) || FaviconUrlKinds.isSafeVirtualFaviconRequestUrl(sourceUrl)) {
    return isServiceIconForPage(sourceUrl, page, parsedPage);
  }
  return true;
}


function normalizeCacheOptions(options: unknown): Readonly<IconCacheOptions> {
  const settings = isRecord(options) ? options : {};
  const ttl = Number(settings.cacheTtlMs);
  const maxEntries = Number(settings.cacheMaxEntries);
  const maxLength = Number(settings.maxDataUrlLength);
  return Object.freeze({
    cacheTtlMs: Number.isFinite(ttl) && ttl >= 0 ? ttl : CACHE_TTL_MS,
    cacheMaxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : CACHE_MAX_ENTRIES,
    maxDataUrlLength: Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : MAX_DATA_URL_LENGTH
  });
}

function normalizeDataUrl(value: unknown, options?: unknown): string {
  const cacheOptions = normalizeCacheOptions(options);
  const dataUrl = String(value || '').trim();
  if (!SUPPORTED_DATA_URL_PATTERN.test(dataUrl) || dataUrl.length > cacheOptions.maxDataUrlLength) {
    return '';
  }
  return dataUrl;
}


// The valid, unexpired icons of a stored map, the newest `cacheMaxEntries`.
function normalizeCacheMap(value: unknown, nowValue?: unknown, options?: unknown): CachedIconMap {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const cacheOptions = normalizeCacheOptions(options);
  const source = isRecord(value) && !Array.isArray(value) ? value : {};
  const entries = Object.keys(source).flatMap((rawKey) => {
    const item = source[rawKey];
    const fields = isRecord(item) ? item : {};
    const key = getCacheKey(rawKey);
    const dataUrl = normalizeDataUrl(fields.dataUrl, cacheOptions);
    const sourceUrl = normalizeIconSourceUrl(fields.sourceUrl);
    const updatedAt = Number(fields.updatedAt || 0);
    if (!key || !dataUrl || !Number.isFinite(updatedAt) || updatedAt <= 0 ||
        (cacheOptions.cacheTtlMs > 0 && now - updatedAt > cacheOptions.cacheTtlMs)) {
      return [];
    }
    return [{ key, dataUrl, sourceUrl, updatedAt, fromShortcut: fields.fromShortcut === true }];
  }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, cacheOptions.cacheMaxEntries);
  const result: CachedIconMap = {};
  for (const entry of entries) {
    result[entry.key] = {
      dataUrl: entry.dataUrl,
      sourceUrl: entry.sourceUrl,
      updatedAt: entry.updatedAt,
      ...(entry.fromShortcut ? { fromShortcut: true } : {})
    };
  }
  return result;
}


function setCachedIcon(
  cacheMap: unknown,
  pageUrl: unknown,
  dataUrl: unknown,
  sourceUrl: unknown,
  nowValue?: unknown,
  options?: unknown
): CachedIconMap {
  const key = getCacheKey(pageUrl);
  const iconDataUrl = normalizeDataUrl(dataUrl, options);
  if (!key || !iconDataUrl) {
    return normalizeCacheMap(cacheMap, nowValue, options);
  }
  return normalizeCacheMap({
    ...(isRecord(cacheMap) ? cacheMap : {}),
    [key]: {
      dataUrl: iconDataUrl,
      sourceUrl: normalizeIconSourceUrl(sourceUrl),
      updatedAt: Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now()
    }
  }, nowValue, options);
}

// Only the icons of these pages; the rest belong to removed shortcuts.
function retainCachedIcons(cacheMap: unknown, pageUrls: unknown, nowValue?: unknown, options?: unknown): CachedIconMap {
  const urls: unknown[] = Array.isArray(pageUrls) ? pageUrls : [];
  const allowed = new Set(urls.map(getCacheKey).filter(Boolean));
  const normalized = normalizeCacheMap(cacheMap, nowValue, options);
  const result: CachedIconMap = {};
  for (const [key, entry] of Object.entries(normalized)) {
    if (allowed.has(key)) {
      result[key] = entry;
    }
  }
  return result;
}

function getCachedIconDataUrl(cacheMap: unknown, pageUrl: unknown, nowValue?: unknown, options?: unknown): string {
  const normalized = normalizeCacheMap(cacheMap, nowValue, options);
  const entry = lookup(normalized, getCacheKey(pageUrl));
  return entry && isCachedIconForPage(entry, pageUrl) ? entry.dataUrl : '';
}

// An own value of a lookup table, so "constructor" and its kin never match.
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

export {
  CACHE_MAX_ENTRIES,
  CACHE_TTL_MS,
  MAX_DATA_URL_LENGTH,
  SITE_SEARCH_CACHE_OPTIONS,
  getCacheKey,
  getCachedIconDataUrl,
  getCachedIconSource,
  isCachedIconForPage,
  isRecord,
  lookup,
  normalizeCacheMap,
  normalizeCacheOptions,
  normalizeDataUrl,
  normalizeIconSourceUrl,
  normalizePageUrl,
  retainCachedIcons,
  setCachedIcon
};
