// Favicons and site theme colors for every surface: candidate resolution and
// the favicon-request blacklist, fetched favicon data, high-resolution
// shortcut and site-search provider icons (with their cache and warmup), site
// theme colors, and the "favicon may have changed" marks recorded on visits.
//
// A module of the service worker; background.ts imports it before its own code
// runs.
//
// The caches below are rebuildable; the pending visit marks only delay a
// favicon refresh if a suspension drops them.

import * as BLACKLIST_UTILS from '../domain/blacklist-utils';
import * as BROWSER_PROFILE from '../platform/browser-profile';
import * as FAVICON_CACHE from '../platform/favicon-cache';
import * as LumnoBrowserIcons from '../platform/browser-icons';
import * as LumnoShortcutFaviconStore from '../platform/shortcut-favicon-store';
import * as FAVICON_UTILS from '../domain/favicon/favicon-utils';
import * as SETTINGS from '../domain/settings';
import {
  FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
  FAVICON_REQUEST_BLACKLIST_STORAGE_KEY
} from '../domain/settings';
import * as SHORTCUT_FAVICON from '../domain/favicon/shortcut-favicon';
import { normalizeHost, storageArea, warnBackgroundFailure } from './worker-context';
import './browser-urls-service';
import type { BlacklistRule } from '../domain/blacklist-utils';
import type { FaviconCacheRuntime } from '../platform/favicon-cache';
import type { ShortcutFaviconStore } from '../platform/shortcut-favicon-store';
import type { FaviconUrlResolver, ShortcutFetchCandidate, ShortcutFetchCandidateKind, ThemeRgb } from '../domain/favicon/favicon-utils';
import type { CachedIconMap } from '../domain/favicon/shortcut-favicon';
import type { SiteSearchProvider } from '../domain/search/types';
import type { ShortcutFaviconData, SiteThemeColor } from '../domain/messages';

// What the favicon policy allows for a page and its host.
type FaviconTargetPolicy =
  | { ok: false; inputUrl: string; parsed: URL | null }
  | {
    ok: true;
    inputUrl: string;
    parsed: URL;
    normalizedHost: string;
    hardBlocked: boolean;
    avoidDirect: boolean;
    // The person excluded the page from favicon requests.
    requestBlacklisted: boolean;
    directFetchBlocked: boolean;
  };

interface ScoredCandidate {
  url: string;
  score: number;
}

// A source a shortcut icon is downloaded from, as one attempt sees it.
interface ShortcutResourceCandidate {
  url: string;
  kind: ShortcutFetchCandidateKind;
  placeholderUrl?: string;
  refresh?: boolean;
  declaredSize?: number;
  vector?: boolean;
}

// A downloaded shortcut icon.
interface ShortcutIconResult extends ShortcutFaviconData {
  sourceUrl: string;
  width: number;
  height: number;
  vector: boolean;
  pageUrl: string;
}

interface SiteSearchIconWarmItem {
  provider: SiteSearchProvider;
  pageUrl: string;
  explicitIcon: string;
  preferredTheme: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isSiteSearchProvider(value: unknown): value is SiteSearchProvider {
  return isRecord(value) && typeof value.key === 'string';
}

// Hosts whose favicon may have changed since it was cached, marked on visits.
const FAVICON_VISIT_DIRTY_STORAGE_KEY = '_x_extension_favicon_visit_dirty_2026_unique_';
const SITE_SEARCH_ICON_STORAGE_KEY = SHORTCUT_FAVICON.SITE_SEARCH_STORAGE_KEY;
const SITE_SEARCH_ICON_CACHE_OPTIONS = SHORTCUT_FAVICON.SITE_SEARCH_CACHE_OPTIONS;
const SITE_SEARCH_PINNED_ICON_KEYS = new Set(Object.keys(SHORTCUT_FAVICON.SITE_SEARCH_PINNED_ICON_ASSETS));
const logBackgroundFaviconDecision = FAVICON_UTILS.createFaviconDecisionLogger({ surface: 'background' });

const FAVICON_VISIT_DIRTY_TTL_MS = 1000 * 60 * 60 * 24;

const FAVICON_VISIT_DIRTY_MAX_ENTRIES = 600;

const faviconVisitDirtyWriteDebounceMs = 400;

const faviconVisitDirtyMarkThrottleMs = 2 * 60 * 1000;

// Pending dirty marks; losing them only delays a favicon refresh.
const faviconVisitDirtyMarkCache = new Map<string, number>();

let faviconVisitDirtyPersistTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeFaviconVisitDirtyHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  return normalizeHost(String(hostname).trim());
}

function getFaviconVisitDirtyStorageArea(): chrome.storage.LocalStorageArea | null {
  if (!chrome || !chrome.storage || !chrome.storage.local) {
    return null;
  }
  return chrome.storage.local;
}

function getValidFaviconVisitDirtyEntries(rawEntries: unknown): Array<{ key: string; updatedAt: number }> {
  const now = Date.now();
  const input = isRecord(rawEntries) ? rawEntries : {};
  const valid: Array<{ key: string; updatedAt: number }> = [];
  Object.keys(input).forEach((key) => {
    const updatedAt = Number(input[key] || 0);
    if (!key || !Number.isFinite(updatedAt)) {
      return;
    }
    if (now - updatedAt > FAVICON_VISIT_DIRTY_TTL_MS) {
      return;
    }
    valid.push({ key, updatedAt });
  });
  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  return valid.slice(0, FAVICON_VISIT_DIRTY_MAX_ENTRIES);
}

function schedulePersistFaviconVisitDirtyHost(hostname: string): void {
  const host = normalizeFaviconVisitDirtyHost(hostname);
  const storageArea = getFaviconVisitDirtyStorageArea();
  if (!host || !storageArea) {
    return;
  }
  const now = Date.now();
  const lastMarkedAt = Number(faviconVisitDirtyMarkCache.get(host) || 0);
  if (lastMarkedAt && (now - lastMarkedAt) < faviconVisitDirtyMarkThrottleMs) {
    return;
  }
  faviconVisitDirtyMarkCache.set(host, now);
  if (faviconVisitDirtyPersistTimer !== null) {
    clearTimeout(faviconVisitDirtyPersistTimer);
  }
  faviconVisitDirtyPersistTimer = setTimeout(() => {
    faviconVisitDirtyPersistTimer = null;
    storageArea.get([FAVICON_VISIT_DIRTY_STORAGE_KEY], (result) => {
      const payload = result && result[FAVICON_VISIT_DIRTY_STORAGE_KEY];
      const existing = getValidFaviconVisitDirtyEntries(isRecord(payload) && payload.entries ? payload.entries : null);
      const merged = new Map(existing.map((item) => [item.key, item.updatedAt]));
      faviconVisitDirtyMarkCache.forEach((updatedAt, key) => {
        merged.set(key, updatedAt);
      });
      const serializedEntries = Array.from(merged.entries())
        .map(([key, updatedAt]) => ({
          key: String(key || ''),
          updatedAt: Number(updatedAt || 0)
        }))
        .filter((item) => item.key && Number.isFinite(item.updatedAt))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, FAVICON_VISIT_DIRTY_MAX_ENTRIES);
      const serialized: Record<string, number> = {};
      serializedEntries.forEach((item) => {
        serialized[item.key] = item.updatedAt;
      });
      storageArea.set({
        [FAVICON_VISIT_DIRTY_STORAGE_KEY]: {
          version: 1,
          entries: serialized,
          updatedAt: Date.now()
        }
      }, () => {
        faviconVisitDirtyMarkCache.clear();
      });
    });
  }, faviconVisitDirtyWriteDebounceMs);
}

export function markFaviconDirtyForUrl(url: unknown): void {
  if (!url) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch (_error) {
    return;
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return;
  }
  const host = normalizeFaviconVisitDirtyHost(parsed.hostname);
  if (!host || shouldBlockFaviconForHost(host)) {
    return;
  }
  schedulePersistFaviconVisitDirtyHost(host);
}

let faviconRequestBlacklistCache: BlacklistRule[] | null = null;

let faviconRequestBlacklistPromise: Promise<BlacklistRule[]> | null = null;

let faviconEnhancedFetchEnabledCache: boolean | null = null;

let faviconEnhancedFetchEnabledPromise: Promise<boolean> | null = null;

// Storage listeners call these when the stored values change elsewhere.
export function invalidateFaviconRequestBlacklistCache(): void {
  faviconRequestBlacklistCache = null;
  faviconRequestBlacklistPromise = null;
}

export function invalidateFaviconEnhancedFetchEnabledCache(): void {
  faviconEnhancedFetchEnabledCache = null;
  faviconEnhancedFetchEnabledPromise = null;
}

const FAVICON_PROXY_SIZE = 128;

let backgroundFaviconUrlResolver: FaviconUrlResolver | null = null;

// Favicon data URLs by source URL.
const faviconDataCache = new Map<string, string>();

const faviconPending = new Map<string, Promise<string | null>>();

const shortcutFaviconDataCache = new Map<string, ShortcutIconResult>();

const shortcutFaviconPending = new Map<string, Promise<ShortcutIconResult | null>>();

let shortcutFaviconPolicyRevision = 0;

// Theme colors by host, origin and theme ("host::origin::auto").
export const siteThemeColorCache = new Map<string, SiteThemeColor>();

export const siteThemeColorPending = new Map<string, Promise<SiteThemeColor | null>>();

const BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES = 256;

const BACKGROUND_SHORTCUT_FAVICON_CACHE_MAX_ENTRIES = 64;

const SHORTCUT_FAVICON_FETCH_TIMEOUT_MS = 6500;

const SHORTCUT_FAVICON_RESOURCE_MAX_BYTES = 256 * 1024;

export function invalidateShortcutFaviconPolicyCache(): void {
  shortcutFaviconPolicyRevision += 1;
  shortcutFaviconDataCache.clear();
  shortcutFaviconPending.clear();
}

const SITE_SEARCH_ICON_WARM_CONCURRENCY = 2;

export const BACKGROUND_SITE_THEME_CACHE_MAX_ENTRIES = 512;

let backgroundFaviconCacheRuntime: FaviconCacheRuntime | null = null;

let siteSearchIconStore: Readonly<ShortcutFaviconStore> | null = null;

let siteSearchIconCache: CachedIconMap | null = null;

let siteSearchIconCacheLoadPromise: Promise<CachedIconMap> | null = null;

let siteSearchIconCacheWriteTimer: ReturnType<typeof setTimeout> | null = null;

let siteSearchIconCacheRevision = 0;

let siteSearchIconWarmActiveCount = 0;

const siteSearchIconWarmQueue: SiteSearchIconWarmItem[] = [];

const siteSearchIconWarmPending = new Set<string>();

export function logBlockedLocalFavicon(url: unknown, candidateKind?: string, reason?: string, pageUrl?: unknown): boolean | void {
  return logBackgroundFaviconDecision(url, reason || 'local-rule', {
    pageUrl: String(pageUrl || url || ''),
    candidateKind: candidateKind || 'unknown'
  });
}

export function getBackgroundFaviconCacheRuntime(): FaviconCacheRuntime {
  if (!backgroundFaviconCacheRuntime) {
    backgroundFaviconCacheRuntime = FAVICON_CACHE.createFaviconCache({
      storageArea: (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null,
      windowObj: globalThis,
      normalizeFaviconHost,
      isBlockedLocalFaviconUrl,
      isChromeMonogramFaviconUrl: FAVICON_UTILS.isChromeMonogramFaviconUrl
    });
    if (backgroundFaviconCacheRuntime &&
        typeof backgroundFaviconCacheRuntime.ensureCachesReady === 'function') {
      backgroundFaviconCacheRuntime.ensureCachesReady()
        .catch(warnBackgroundFailure('Failed to load the favicon caches.'));
    }
  }
  return backgroundFaviconCacheRuntime;
}

export function getBackgroundFaviconUrlResolver(): FaviconUrlResolver {
  if (!backgroundFaviconUrlResolver) {
    backgroundFaviconUrlResolver = FAVICON_UTILS.createFaviconUrlResolver({
      chromeApi: chrome,
      size: FAVICON_PROXY_SIZE,
      shouldBlockFaviconForHost,
      shouldAvoidDirectFaviconForHost,
      isEnhancedFaviconFetchEnabled: (pageUrl) => (
        faviconEnhancedFetchEnabledCache === true &&
        !isUrlBlockedByFaviconRequestBlacklist(pageUrl)
      ),
      getStrictFaviconReason: (pageUrl) => {
        if (isUrlBlockedByFaviconRequestBlacklist(pageUrl)) {
          return 'exclusion';
        }
        if (faviconEnhancedFetchEnabledCache !== true) {
          return 'global-off';
        }
        return '';
      },
      logFaviconDecision: logBackgroundFaviconDecision
    });
  }
  return backgroundFaviconUrlResolver;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getExtensionFaviconUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getExtensionFaviconUrl(pageUrl) : '';
}

export function isBrowserInternalPageUrl(url: unknown): boolean {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.isBrowserInternalPageUrl(url) : false;
}

function getGstaticFaviconUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getGstaticFaviconUrl(pageUrl) : '';
}

export function getPageFaviconCandidateUrl(pageUrl: unknown): string {
  const resolver = getBackgroundFaviconUrlResolver();
  return resolver ? resolver.getPageFaviconCandidateUrl(pageUrl) : '';
}

export function getHostFaviconUrl(hostname: unknown): string {
  const normalized = normalizeFaviconHost(hostname);
  if (!normalized) {
    return '';
  }
  if (normalized === 'lumno.kubai.design') {
    return (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function')
      ? chrome.runtime.getURL('assets/images/lumno.png')
      : 'https://lumno.kubai.design/favicon.png';
  }
  return getGstaticFaviconUrl(`https://${normalized}/`);
}

function isFaviconProxyUrl(url: unknown): boolean {
  return FAVICON_UTILS.isFaviconProxyUrl(url);
}

export function getFaviconFallbackHost(rawInput: unknown): string {
  const withoutScheme = String(rawInput || '').replace(/^https?:\/\//i, '');
  const authority = withoutScheme.split(/[/?#]/)[0] || '';
  if (!authority) {
    return '';
  }
  if (authority.startsWith('[')) {
    const endBracket = authority.indexOf(']');
    if (endBracket > 1) {
      return authority.slice(1, endBracket).toLowerCase();
    }
    return '';
  }
  if (authority.includes('::') && !authority.includes('.')) {
    return authority.toLowerCase();
  }
  return (authority.split(':')[0] || '').toLowerCase();
}

export function shouldBlockFaviconForHost(hostname: unknown): boolean {
  return FAVICON_UTILS.shouldBlockFaviconForHost(hostname);
}

function shouldAvoidDirectFaviconForHost(hostname: unknown): boolean {
  return FAVICON_UTILS.shouldAvoidDirectFaviconForHost(hostname);
}

function isAllowedFaviconProxyRequestUrl(url: unknown): boolean {
  return FAVICON_UTILS.isAllowedFaviconProxyRequestUrl(url);
}

function isFaviconRequestBlockedByBlacklist(url: unknown): boolean {
  return !isAllowedFaviconProxyRequestUrl(url) && isUrlBlockedByFaviconRequestBlacklist(url);
}

export function isBlockedLocalFaviconUrl(url: unknown): boolean {
  const blockedByLocalRules = FAVICON_UTILS.isBlockedLocalFaviconUrl(url);
  return blockedByLocalRules || isFaviconRequestBlockedByBlacklist(url);
}

function getFaviconHostPolicy(hostname: unknown): FAVICON_UTILS.FaviconHostPolicy {
  return FAVICON_UTILS.getFaviconHostPolicy(hostname, {
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost
  });
}

function getFaviconTargetPolicy(targetUrl: unknown, hostOverride: unknown): FaviconTargetPolicy {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return { ok: false, inputUrl: '', parsed: null };
  }
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch (_error) {
    return { ok: false, inputUrl, parsed: null };
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return { ok: false, inputUrl, parsed };
  }
  const hosts = [parsed.hostname, hostOverride].filter(Boolean);
  const policies = hosts.map((host) => getFaviconHostPolicy(host));
  const hardBlocked = policies.some((policy) => policy.hardBlocked);
  const avoidDirect = policies.some((policy) => policy.avoidDirect);
  const requestBlacklisted = isUrlBlockedByFaviconRequestBlacklist(inputUrl);
  return {
    ok: true,
    inputUrl,
    parsed,
    normalizedHost: normalizeFaviconHost(hostOverride || parsed.hostname),
    hardBlocked,
    avoidDirect,
    requestBlacklisted,
    directFetchBlocked: requestBlacklisted || hardBlocked || avoidDirect
  };
}

export function normalizeFaviconHost(hostname: unknown): string {
  return FAVICON_UTILS.normalizeFaviconHost(hostname);
}

export function normalizeThemeAccentRgb(value: unknown): ThemeRgb | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const channels: unknown[] = value;
  const [red, green, blue] = channels.map((channel) => Math.round(Number(channel)));
  return [red, green, blue].every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
    ? [red, green, blue]
    : null;
}

// Pages are never fetched for their theme color, so this only records why.
export function resolveSiteThemeColor(targetUrl: unknown, hostOverride: unknown, _preferredTheme?: unknown): Promise<SiteThemeColor | null> {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return Promise.resolve(null);
  }
  return Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(([, enhancedFetchEnabled]) => {
    const targetPolicy = getFaviconTargetPolicy(inputUrl, hostOverride);
    if (!targetPolicy.ok) {
      return null;
    }
    logBlockedLocalFavicon(
      inputUrl,
      'theme-page',
      !enhancedFetchEnabled
        ? 'global-off'
        : (targetPolicy.requestBlacklisted ? 'exclusion' : 'direct-network-disabled'),
      inputUrl
    );
    return null;
  });
}

function buildFaviconFallbackCandidates(
  pageUrl: string,
  hostOverride: unknown,
  options?: { allowThirdPartyFetch?: boolean; targetPolicy?: FaviconTargetPolicy } | null
): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = [];
  const inputUrl = String(pageUrl || '').trim();
  const settings = options && typeof options === 'object' ? options : {};
  const targetPolicy = settings.targetPolicy || getFaviconTargetPolicy(inputUrl, hostOverride);
  if (targetPolicy.ok && targetPolicy.hardBlocked) {
    return [];
  }
  if (inputUrl) {
    candidates.push({ url: getExtensionFaviconUrl(inputUrl), score: 30 });
    if (settings.allowThirdPartyFetch === true) {
      candidates.push({ url: getGstaticFaviconUrl(inputUrl), score: 20 });
    }
  }
  return candidates.filter((item) => item && item.url);
}

function dedupeAndSortFaviconCandidates(candidates: readonly ScoredCandidate[]): string[] {
  const byUrl = new Map<string, ScoredCandidate>();
  candidates.forEach((item) => {
    if (!item || !item.url) {
      return;
    }
    const key = String(item.url);
    const current = byUrl.get(key);
    if (!current || Number(item.score || 0) > Number(current.score || 0)) {
      byUrl.set(key, { url: key, score: Number(item.score || 0) });
    }
  });
  return Array.from(byUrl.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.url);
}

export function resolveFaviconCandidates(targetUrl: unknown, hostOverride: unknown, fallbackUrl?: unknown): Promise<string[]> {
  const inputUrl = String(targetUrl || '').trim();
  if (!inputUrl) {
    return Promise.resolve([]);
  }
  return Promise.all([
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled()
  ]).then(([, enhancedFetchEnabled]) => {
    const targetPolicy = getFaviconTargetPolicy(inputUrl, hostOverride);
    if (!targetPolicy.ok) {
      return [];
    }
    if (targetPolicy.hardBlocked) {
      logBlockedLocalFavicon(inputUrl, 'resolveFaviconCandidates');
      return [];
    }
    const strictReason = targetPolicy.requestBlacklisted
      ? 'exclusion'
      : (!enhancedFetchEnabled ? 'global-off' : '');
    if (strictReason) {
      if (fallbackUrl) {
        logBlockedLocalFavicon(fallbackUrl, 'direct', strictReason, inputUrl);
      }
      if (targetPolicy.requestBlacklisted) {
        logBlockedLocalFavicon(getGstaticFaviconUrl(inputUrl), 'third-party-proxy', strictReason, inputUrl);
      }
    }
    return dedupeAndSortFaviconCandidates(buildFaviconFallbackCandidates(inputUrl, hostOverride, {
      allowThirdPartyFetch: !targetPolicy.requestBlacklisted,
      targetPolicy
    }));
  });
}

function getShortcutFaviconPreferredTheme(value: unknown): 'dark' | 'light' | '' {
  const theme = String(value || '').trim().toLowerCase();
  return theme === 'dark' || theme === 'light' ? theme : '';
}

function fetchShortcutFaviconResource(
  candidate: ShortcutResourceCandidate,
  pageUrl: string,
  signal: AbortSignal | undefined
): Promise<ShortcutIconResult | null> {
  const sourceUrl = candidate && candidate.url ? String(candidate.url) : '';
  const resolver = getBackgroundFaviconUrlResolver();
  if (!sourceUrl || !isAllowedFaviconProxyRequestUrl(sourceUrl) || !resolver ||
      !resolver.getSafeFaviconCandidateUrl(sourceUrl, pageUrl, 'shortcut-snapshot', {
        allowDomainProxy: candidate.kind === 'favicon-is'
      })) {
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
  }).then((response) => {
    if (!response || !response.ok) {
      return null;
    }
    const resolvedSourceUrl = typeof response.url === 'string' && response.url
      ? response.url
      : sourceUrl;
    if (!isAllowedFaviconProxyRequestUrl(resolvedSourceUrl) ||
        !resolver.getSafeFaviconCandidateUrl(resolvedSourceUrl, pageUrl, 'shortcut-response', {
          allowDomainProxy: candidate.kind === 'favicon-is'
        })) {
      return null;
    }
    const contentLength = Number(response.headers && response.headers.get
      ? response.headers.get('content-length') || 0
      : 0);
    if (Number.isFinite(contentLength) && contentLength > SHORTCUT_FAVICON_RESOURCE_MAX_BYTES) {
      return null;
    }
    return response.blob().then((blob) => ({
      blob,
      sourceUrl: resolvedSourceUrl
    }));
  }).then((result) => {
    const blob = result && result.blob;
    if (!result || !blob || blob.size <= 0 || blob.size > SHORTCUT_FAVICON_RESOURCE_MAX_BYTES) {
      return null;
    }
    return blob.arrayBuffer().then((buffer) => {
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
    });
  }).catch(() => null).finally(() => {
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
  const browserIcons = FAVICON_UTILS.createBrowserIconIndex();
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
    if (candidate.placeholderUrl && (candidate.kind === 'browser-cache' || candidate.kind === 'favicon-is' ||
        (result.width <= 16 && result.height <= 16))) {
      let placeholderData = faviconDataCache.get(candidate.placeholderUrl);
      if (!placeholderData) {
        const placeholder = await fetchShortcutFaviconResource({
          url: candidate.placeholderUrl,
          kind: candidate.kind,
          declaredSize: 128
        }, FAVICON_UTILS.getPageUrlFromFaviconProxyUrl(candidate.placeholderUrl), signal);
        placeholderData = placeholder ? placeholder.data : undefined;
        if (placeholderData) {
          FAVICON_UTILS.setBoundedCacheEntry(faviconDataCache, candidate.placeholderUrl,
            placeholderData, BACKGROUND_FAVICON_DATA_CACHE_MAX_ENTRIES);
        }
      }
      if (placeholderData && placeholderData === result.data) {
        continue;
      }
    }
    return result;
  }
  return null;
}

export function fetchShortcutFaviconData(
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
      FAVICON_UTILS.setBoundedCacheEntry(
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

function getSiteSearchIconStore(): Readonly<ShortcutFaviconStore> {
  if (siteSearchIconStore) {
    return siteSearchIconStore;
  }
  siteSearchIconStore = LumnoShortcutFaviconStore.createShortcutFaviconStore({
    chromeApi: chrome,
    storageArea: (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null,
    storageKey: SITE_SEARCH_ICON_STORAGE_KEY,
    ...SITE_SEARCH_ICON_CACHE_OPTIONS
  });
  return siteSearchIconStore;
}

function loadSiteSearchIconCache(): Promise<CachedIconMap> {
  if (siteSearchIconCache) {
    return Promise.resolve(siteSearchIconCache);
  }
  if (siteSearchIconCacheLoadPromise) {
    return siteSearchIconCacheLoadPromise;
  }
  const store = getSiteSearchIconStore();
  if (!store || typeof store.readAll !== 'function') {
    const empty: CachedIconMap = {};
    siteSearchIconCache = empty;
    return Promise.resolve(empty);
  }
  siteSearchIconCacheLoadPromise = store.readAll()
    .then((cache) => {
      const loaded: CachedIconMap = cache && typeof cache === 'object' ? cache : {};
      siteSearchIconCache = loaded;
      return loaded;
    })
    .catch(() => {
      const empty: CachedIconMap = {};
      siteSearchIconCache = empty;
      return empty;
    });
  return siteSearchIconCacheLoadPromise;
}

function hasUsableCachedSiteSearchProviderIcon(provider: SiteSearchProvider): boolean {
  const icon = SHORTCUT_FAVICON.getSiteSearchProviderIcon(
    siteSearchIconCache || {},
    provider,
    Date.now(),
    SITE_SEARCH_ICON_CACHE_OPTIONS
  );
  return String(icon || '').startsWith('data:');
}

function scheduleSiteSearchIconCacheWrite(): void {
  if (siteSearchIconCacheWriteTimer !== null) {
    return;
  }
  siteSearchIconCacheWriteTimer = setTimeout(() => {
    siteSearchIconCacheWriteTimer = null;
    const store = getSiteSearchIconStore();
    if (!store || typeof store.writeAll !== 'function' || !siteSearchIconCache) {
      return;
    }
    const writeRevision = siteSearchIconCacheRevision;
    const writeSnapshot = siteSearchIconCache;
    store.writeAll(writeSnapshot).then((savedCache) => {
      if (siteSearchIconCacheRevision === writeRevision) {
        siteSearchIconCache = savedCache;
        return;
      }
      scheduleSiteSearchIconCacheWrite();
    }).catch(warnBackgroundFailure('Failed to save the site search icon cache.'));
  }, 700);
}

function pruneSiteSearchProviderIconCache(providers: readonly SiteSearchProvider[]): boolean {
  if (!siteSearchIconCache) {
    return false;
  }
  const pageUrls = providers.flatMap((provider) => {
    const providerKey = String(provider && provider.key || '').trim().toLowerCase();
    if (SITE_SEARCH_PINNED_ICON_KEYS.has(providerKey)) {
      return [];
    }
    const pageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
    return pageUrl ? [pageUrl] : [];
  });
  const nextCache = SHORTCUT_FAVICON.retainCachedIcons(
    siteSearchIconCache,
    pageUrls,
    Date.now(),
    SITE_SEARCH_ICON_CACHE_OPTIONS
  );
  if (JSON.stringify(nextCache) === JSON.stringify(siteSearchIconCache)) {
    return false;
  }
  siteSearchIconCache = nextCache;
  siteSearchIconCacheRevision += 1;
  scheduleSiteSearchIconCacheWrite();
  return true;
}

function cacheSiteSearchProviderIcon(pageUrl: string, result: ShortcutIconResult | null): boolean {
  if (!result || !result.data) {
    return false;
  }
  const nextCache = SHORTCUT_FAVICON.setCachedIcon(
    siteSearchIconCache || {},
    pageUrl,
    result.data,
    result.sourceUrl,
    Date.now(),
    SITE_SEARCH_ICON_CACHE_OPTIONS
  );
  const cacheKey = SHORTCUT_FAVICON.getCacheKey(pageUrl);
  const nextEntry = cacheKey && nextCache ? nextCache[cacheKey] : null;
  if (!nextEntry || nextEntry.dataUrl !== result.data) {
    return false;
  }
  siteSearchIconCache = nextCache;
  siteSearchIconCacheRevision += 1;
  scheduleSiteSearchIconCacheWrite();
  return true;
}

function drainSiteSearchIconWarmQueue(): void {
  while (siteSearchIconWarmActiveCount < SITE_SEARCH_ICON_WARM_CONCURRENCY &&
      siteSearchIconWarmQueue.length > 0) {
    const item = siteSearchIconWarmQueue.shift();
    if (!item || !item.pageUrl) {
      continue;
    }
    if (hasUsableCachedSiteSearchProviderIcon(item.provider)) {
      siteSearchIconWarmPending.delete(item.pageUrl);
      continue;
    }
    siteSearchIconWarmActiveCount += 1;
    fetchShortcutFaviconData(item.pageUrl, item.preferredTheme, item.explicitIcon)
      .then((result) => {
        cacheSiteSearchProviderIcon(item.pageUrl, result);
      })
      .catch(() => {}) // Unreachable sites keep their bundled icon.
      .finally(() => {
        siteSearchIconWarmActiveCount = Math.max(0, siteSearchIconWarmActiveCount - 1);
        siteSearchIconWarmPending.delete(item.pageUrl);
        drainSiteSearchIconWarmQueue();
      });
  }
}

export function scheduleSiteSearchProviderIconWarmup(providers: unknown, preferredTheme?: unknown): void {
  const items: SiteSearchProvider[] = Array.isArray(providers) ? providers.filter(isSiteSearchProvider) : [];
  if (items.length === 0) {
    return;
  }
  loadSiteSearchIconCache().then(() => {
    pruneSiteSearchProviderIconCache(items);
    items.forEach((provider) => {
      const explicitIcon = SHORTCUT_FAVICON.getSiteSearchProviderExplicitIcon(provider);
      const pageUrl = SHORTCUT_FAVICON.getSiteSearchProviderPageUrl(provider);
      const providerKey = String(provider && provider.key || '').trim().toLowerCase();
      if (SITE_SEARCH_PINNED_ICON_KEYS.has(providerKey)) {
        return;
      }
      if (!pageUrl || hasUsableCachedSiteSearchProviderIcon(provider) || siteSearchIconWarmPending.has(pageUrl)) {
        return;
      }
      siteSearchIconWarmPending.add(pageUrl);
      siteSearchIconWarmQueue.push({
        provider,
        pageUrl,
        explicitIcon,
        preferredTheme: String(preferredTheme || '')
      });
    });
    drainSiteSearchIconWarmQueue();
  }).catch(warnBackgroundFailure('Failed to warm site search icons.'));
}

export function fetchFaviconData(requestedUrl: unknown, pageUrl?: unknown): Promise<string | null> {
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
    const sourceAllowedByMode = FAVICON_UTILS.isFaviconSourceAllowedByEnhancedFetchPolicy(url, effectiveEnhancedFetchEnabled, {
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
      if (!dataUrl || !FAVICON_UTILS.isExtensionFaviconEndpointUrl(sourceUrl)) {
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
          FAVICON_UTILS.setBoundedCacheEntry(
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
export function inlineExtensionFaviconsForWebPage<T extends { favIconUrl?: unknown; url?: unknown }>(
  items: readonly T[] | null | undefined,
  waitMs?: number
): Promise<T[]> {
  const list: readonly T[] = Array.isArray(items) ? items : [];
  const timeoutMs = typeof waitMs === 'number' && Number.isFinite(waitMs) ? Math.max(0, waitMs) : 400;
  return Promise.all(list.map((item): T | Promise<T> => {
    const iconUrl = item && typeof item.favIconUrl === 'string' ? item.favIconUrl : '';
    if (!FAVICON_UTILS.isExtensionFaviconEndpointUrl(iconUrl)) {
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
  FAVICON_UTILS.setBoundedCacheEntry(extensionFaviconPlaceholderData, placeholderUrl, pending, 16);
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

function normalizeFaviconRequestBlacklistItems(items: unknown): BlacklistRule[] {
  if (BLACKLIST_UTILS.normalizeItems) {
    return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
  }
  return [];
}

function normalizeFaviconEnhancedFetchEnabled(value: unknown): boolean {
  return SETTINGS.normalizeFaviconEnhancedFetchEnabled(value);
}

export function loadFaviconRequestBlacklistItems(): Promise<BlacklistRule[]> {
  if (faviconRequestBlacklistCache) {
    return Promise.resolve(faviconRequestBlacklistCache);
  }
  if (faviconRequestBlacklistPromise) {
    return faviconRequestBlacklistPromise;
  }
  faviconRequestBlacklistPromise = new Promise<BlacklistRule[]>((resolve) => {
    if (!storageArea) {
      resolve([]);
      return;
    }
    storageArea.get([FAVICON_REQUEST_BLACKLIST_STORAGE_KEY], (result) => {
      const items = normalizeFaviconRequestBlacklistItems(result && result[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]);
      faviconRequestBlacklistCache = items;
      resolve(items);
    });
  }).finally(() => {
    faviconRequestBlacklistPromise = null;
  });
  return faviconRequestBlacklistPromise;
}

export function loadFaviconEnhancedFetchEnabled(): Promise<boolean> {
  if (typeof faviconEnhancedFetchEnabledCache === 'boolean') {
    return Promise.resolve(faviconEnhancedFetchEnabledCache);
  }
  if (faviconEnhancedFetchEnabledPromise) {
    return faviconEnhancedFetchEnabledPromise;
  }
  faviconEnhancedFetchEnabledPromise = new Promise<boolean>((resolve) => {
    if (!storageArea) {
      faviconEnhancedFetchEnabledCache = true;
      resolve(true);
      return;
    }
    storageArea.get([FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY], (result) => {
      const rawValue = result && result[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY];
      const enabled = normalizeFaviconEnhancedFetchEnabled(rawValue);
      faviconEnhancedFetchEnabledCache = enabled;
      if (rawValue !== enabled) {
        storageArea.set({ [FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]: enabled });
      }
      resolve(enabled);
    });
  }).finally(() => {
    faviconEnhancedFetchEnabledPromise = null;
  });
  return faviconEnhancedFetchEnabledPromise;
}

function getFaviconRequestMatchUrl(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) {
    return '';
  }
  return String(FAVICON_UTILS.getCanonicalPageUrlForFavicon(raw) || raw).trim();
}

function isUrlBlockedByFaviconRequestBlacklist(url: unknown): boolean {
  const target = getFaviconRequestMatchUrl(url);
  return Boolean(
    target &&
    faviconRequestBlacklistCache &&
    BLACKLIST_UTILS.isUrlBlocked &&
    BLACKLIST_UTILS.isUrlBlocked(target, faviconRequestBlacklistCache)
  );
}
