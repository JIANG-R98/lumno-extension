// The favicon caches of one page or worker, kept in memory and written to
// the extension's local storage a moment after they change
// (domain/favicon/favicon-cache.ts reads and writes the records).
import {
  DEFAULTS,
  PAGE_FAVICON_CACHE_VERSION,
  createRecord,
  isExpired,
  isSameSiteTheme,
  isValidDataUrlIcon,
  keepNewest,
  normalizeSiteThemeEntry,
  readFaviconDataRecord,
  readFaviconUrlRecord,
  readSiteThemeRecord,
  readVisitDirtyRecord
} from '../domain/favicon/favicon-cache';
import type {
  FaviconCacheSettings,
  FaviconDataEntry,
  FaviconUrlEntry,
  SiteThemeEntry
} from '../domain/favicon/favicon-cache';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';

// What schedules the delayed writes: the page's window or the worker.
interface TimerHost {
  setTimeout(callback: () => void, delay?: number): unknown;
}

interface FaviconCacheOptions extends Partial<FaviconCacheSettings> {
  // Where the caches persist; without one they live in memory only.
  storageArea?: StorageAreaLike | null;
  windowObj?: TimerHost;
  normalizeFaviconHost?: (hostname: unknown) => string;
  // Addresses never kept as favicon URLs.
  isBlockedLocalFaviconUrl?: (url: string) => boolean;
  isChromeMonogramFaviconUrl?: (url: string) => boolean;
}

interface FaviconCacheRuntime {
  isFaviconPersistLoaded(): boolean;
  isFaviconDataPersistLoaded(): boolean;
  isSiteThemePersistLoaded(): boolean;
  // Settles once every cache is loaded, also when a read failed.
  ensureCachesReady(): Promise<void>;
  // Settles when the caches are loaded or after maxWaitMs, whichever is first.
  waitForCachesOrTimeout(maxWaitMs?: number): Promise<void>;
  isHostVisitDirty(hostname: unknown): boolean;
  clearHostVisitDirty(hostname: unknown): void;
  getPersistedEntry(cacheKey: string): FaviconUrlEntry | null;
  setPersistedUrl(cacheKey: unknown, url: unknown): void;
  getPersistedDataEntry(cacheKey: string): FaviconDataEntry | null;
  setPersistedData(cacheKey: unknown, dataUrl: unknown): void;
  getPersistedThemeEntry(cacheKey: unknown): SiteThemeEntry | null;
  // Resolves false when the entry names no color or matches the cached one.
  setPersistedThemeEntry(cacheKey: unknown, entry: unknown): boolean;
}

// One persisted cache: its entries, whether they are loaded, and its
// pending write.
interface PersistedCache<T> {
  entries: Map<string, T>;
  loaded: boolean;
  loadPromise: Promise<void> | null;
  writePending: boolean;
}

// Writes wait this long, so a burst of changes is written once.
const WRITE_DELAY_MS = 600;

function defaultNormalizeHost(value: unknown): string {
  return String(value || '').toLowerCase().replace(/^www\./i, '');
}

function isMonogramUrl(url: string): boolean {
  return /^chrome:\/\/favicon2\//i.test(String(url || '').trim());
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function createPersistedCache<T>(): PersistedCache<T> {
  return { entries: new Map(), loaded: false, loadPromise: null, writePending: false };
}

interface FaviconCacheContext {
  readonly config: FaviconCacheOptions;
  readonly storageArea: StorageAreaLike | null;
  readonly timers: TimerHost;
  readonly normalizeFaviconHost: (hostname: unknown) => string;
  readonly isBlockedLocalFaviconUrl: (url: string) => boolean;
  readonly isChromeMonogramFaviconUrl: (url: string) => boolean;
  readonly urlKey: string;
  readonly urlRetention: { ttlMs: number; maxEntries: number; };
  readonly dataKey: string;
  readonly dataRetention: { ttlMs: number; maxEntries: number; };
  readonly dataMaxLength: number;
  readonly themeKey: string;
  readonly themeRetention: { ttlMs: number; maxEntries: number; };
  readonly visitDirtyKey: string;
  readonly visitDirtyRetention: { ttlMs: number; maxEntries: number; };
  readonly bootWaitMs: number;
  readonly urlCache: PersistedCache<FaviconUrlEntry>;
  readonly dataCache: PersistedCache<FaviconDataEntry>;
  readonly themeCache: PersistedCache<SiteThemeEntry>;
  readonly visitDirtyCache: PersistedCache<{ updatedAt: number; }>;
}

function isRejectedUrl(ctx: FaviconCacheContext, url: string): boolean {
  return ctx.isBlockedLocalFaviconUrl(url) || ctx.isChromeMonogramFaviconUrl(url);
}

function load<T>(ctx: FaviconCacheContext, cache: PersistedCache<T>, key: string, read: (record: unknown, now: number) => Array<[string, T]>): Promise<void> {
  if (cache.loadPromise) {
    return cache.loadPromise;
  }
  const area = ctx.storageArea;
  if (!area || cache.loaded) {
    cache.loaded = true;
    cache.loadPromise = Promise.resolve();
    return cache.loadPromise;
  }
  cache.loadPromise = new Promise((resolve) => {
    area.get([key], (result: StorageItems | undefined) => {
      for (const [entryKey, entry] of read(result && result[key], Date.now())) {
        cache.entries.set(entryKey, entry);
      }
      cache.loaded = true;
      resolve();
    });
  });
  return cache.loadPromise;
}

function ensureCachesReady(ctx: FaviconCacheContext): Promise<void> {
  return Promise.all([
    load(ctx, ctx.urlCache, ctx.urlKey, (record, now) => readFaviconUrlRecord(record, ctx.urlRetention, ((url: string) => isRejectedUrl(ctx, url)), now)),
    load(ctx, ctx.dataCache, ctx.dataKey, (record, now) => readFaviconDataRecord(record, ctx.dataRetention, ctx.dataMaxLength, now)),
    load(ctx, ctx.themeCache, ctx.themeKey, (record, now) => readSiteThemeRecord(record, ctx.themeRetention, now)),
    load(ctx, ctx.visitDirtyCache, ctx.visitDirtyKey, (record, now) => readVisitDirtyRecord(record, ctx.visitDirtyRetention, now)
      .map(([host, updatedAt]): [string, { updatedAt: number }] => [host, { updatedAt }]))
  ]).then(() => undefined).catch(() => undefined);
}

function waitForCachesOrTimeout(ctx: FaviconCacheContext, maxWaitMs?: number): Promise<void> {
  const waitMs = typeof maxWaitMs === 'number' && Number.isFinite(maxWaitMs) && maxWaitMs >= 0 ? maxWaitMs : ctx.bootWaitMs;
  return Promise.race([
    ensureCachesReady(ctx),
    new Promise<void>((resolve) => {
      ctx.timers.setTimeout(resolve, waitMs);
    })
  ]).then(() => undefined).catch(() => undefined);
}

// Writes the cache's newest entries after `delay`; changes made meanwhile
// go into the same write.
function scheduleWrite<T extends { updatedAt: number }, S>(
  ctx: FaviconCacheContext,
  cache: PersistedCache<T>,
  key: string,
  version: number,
  maxEntries: number,
  toStored: (entry: T) => S,
  delay: number
): void {
  const area = ctx.storageArea;
  if (!area || cache.writePending) {
    return;
  }
  cache.writePending = true;
  ctx.timers.setTimeout(() => {
    cache.writePending = false;
    const newest = keepNewest(cache.entries.entries(), maxEntries)
      .map(([entryKey, entry]): [string, S] => [entryKey, toStored(entry)]);
    area.set({ [key]: createRecord(version, newest, Date.now()) });
  }, delay);
}

function persistUrls(ctx: FaviconCacheContext): void {
  scheduleWrite(ctx, ctx.urlCache, ctx.urlKey, PAGE_FAVICON_CACHE_VERSION, ctx.urlRetention.maxEntries,
    (entry) => ({ url: entry.url, updatedAt: entry.updatedAt }), WRITE_DELAY_MS);
}

function persistData(ctx: FaviconCacheContext): void {
  scheduleWrite(ctx, ctx.dataCache, ctx.dataKey, PAGE_FAVICON_CACHE_VERSION, ctx.dataRetention.maxEntries,
    (entry) => ({ dataUrl: entry.dataUrl, updatedAt: entry.updatedAt }), WRITE_DELAY_MS);
}

function persistThemes(ctx: FaviconCacheContext): void {
  scheduleWrite(ctx, ctx.themeCache, ctx.themeKey, 1, ctx.themeRetention.maxEntries, (entry) => ({
    accentRgb: entry.accentRgb,
    source: entry.source,
    neutral: entry.neutral,
    confidence: entry.confidence,
    updatedAt: entry.updatedAt
  }), WRITE_DELAY_MS);
}

function persistVisitDirty(ctx: FaviconCacheContext): void {
  scheduleWrite(ctx, ctx.visitDirtyCache, ctx.visitDirtyKey, 1, ctx.visitDirtyRetention.maxEntries, (entry) => entry.updatedAt, 0);
}

// Keeps a map that grew past twice its limit at its newest entries.
function compact<T extends { updatedAt: number }>(cache: PersistedCache<T>, maxEntries: number): void {
  if (cache.entries.size <= maxEntries * 2) {
    return;
  }
  const newest = keepNewest(cache.entries.entries(), maxEntries);
  cache.entries.clear();
  newest.forEach(([key, entry]) => cache.entries.set(key, entry));
}

function isHostVisitDirty(ctx: FaviconCacheContext, hostname: unknown): boolean {
  const host = ctx.normalizeFaviconHost(hostname);
  if (!host) {
    return false;
  }
  const entry = ctx.visitDirtyCache.entries.get(host);
  const updatedAt = Number(entry ? entry.updatedAt : 0);
  if (!Number.isFinite(updatedAt) || !updatedAt) {
    return false;
  }
  if (Date.now() - updatedAt > ctx.visitDirtyRetention.ttlMs) {
    ctx.visitDirtyCache.entries.delete(host);
    persistVisitDirty(ctx);
    return false;
  }
  return true;
}

function clearHostVisitDirty(ctx: FaviconCacheContext, hostname: unknown): void {
  const host = ctx.normalizeFaviconHost(hostname);
  if (!host || !ctx.visitDirtyCache.entries.has(host)) {
    return;
  }
  ctx.visitDirtyCache.entries.delete(host);
  persistVisitDirty(ctx);
}

function getPersistedEntry(ctx: FaviconCacheContext, cacheKey: string): FaviconUrlEntry | null {
  const cached = cacheKey ? ctx.urlCache.entries.get(cacheKey) : undefined;
  if (!cached || !cached.url) {
    return null;
  }
  if (isExpired(cached.updatedAt, ctx.urlRetention.ttlMs, Date.now())) {
    ctx.urlCache.entries.delete(cacheKey);
    persistUrls(ctx);
    return null;
  }
  return { url: cached.url, updatedAt: cached.updatedAt };
}

function setPersistedUrl(ctx: FaviconCacheContext, cacheKey: unknown, url: unknown): void {
  const key = String(cacheKey || '').trim();
  const nextUrl = String(url || '').trim();
  if (!key || !nextUrl || nextUrl.startsWith('data:') || isRejectedUrl(ctx, nextUrl)) {
    return;
  }
  ctx.urlCache.entries.set(key, { url: nextUrl, updatedAt: Date.now() });
  compact(ctx.urlCache, ctx.urlRetention.maxEntries);
  persistUrls(ctx);
}

function getPersistedDataEntry(ctx: FaviconCacheContext, cacheKey: string): FaviconDataEntry | null {
  const cached = cacheKey ? ctx.dataCache.entries.get(cacheKey) : undefined;
  if (!cached || !isValidDataUrlIcon(cached.dataUrl, ctx.dataMaxLength)) {
    return null;
  }
  if (isExpired(cached.updatedAt, ctx.dataRetention.ttlMs, Date.now())) {
    ctx.dataCache.entries.delete(cacheKey);
    persistData(ctx);
    return null;
  }
  return { dataUrl: cached.dataUrl, updatedAt: cached.updatedAt };
}

function setPersistedData(ctx: FaviconCacheContext, cacheKey: unknown, dataUrl: unknown): void {
  const key = String(cacheKey || '').trim();
  const nextDataUrl = String(dataUrl || '').trim();
  if (!key || !isValidDataUrlIcon(nextDataUrl, ctx.dataMaxLength)) {
    return;
  }
  ctx.dataCache.entries.set(key, { dataUrl: nextDataUrl, updatedAt: Date.now() });
  compact(ctx.dataCache, ctx.dataRetention.maxEntries);
  persistData(ctx);
}

function getPersistedThemeEntry(ctx: FaviconCacheContext, cacheKey: unknown): SiteThemeEntry | null {
  const key = ctx.normalizeFaviconHost(cacheKey);
  const cached = key ? ctx.themeCache.entries.get(key) : undefined;
  if (!cached) {
    return null;
  }
  if (isExpired(cached.updatedAt, ctx.themeRetention.ttlMs, Date.now())) {
    ctx.themeCache.entries.delete(key);
    persistThemes(ctx);
    return null;
  }
  return { ...cached, accentRgb: [...cached.accentRgb] };
}

function setPersistedThemeEntry(ctx: FaviconCacheContext, cacheKey: unknown, entry: unknown): boolean {
  const key = ctx.normalizeFaviconHost(cacheKey);
  const next = normalizeSiteThemeEntry(entry, Date.now());
  if (!key || !next) {
    return false;
  }
  const current = ctx.themeCache.entries.get(key);
  if (current && isSameSiteTheme(current, next)) {
    return false;
  }
  ctx.themeCache.entries.set(key, next);
  compact(ctx.themeCache, ctx.themeRetention.maxEntries);
  persistThemes(ctx);
  return true;
}

function createFaviconCache(options?: FaviconCacheOptions | null): FaviconCacheRuntime {
  const config = options || {};
  const storageArea = config.storageArea || null;
  const timers: TimerHost = config.windowObj || globalThis;
  const normalizeFaviconHost = config.normalizeFaviconHost || defaultNormalizeHost;
  const isBlockedLocalFaviconUrl = config.isBlockedLocalFaviconUrl || (() => false);
  const isChromeMonogramFaviconUrl = config.isChromeMonogramFaviconUrl || isMonogramUrl;

  const urlKey = config.faviconPersistStorageKey || DEFAULTS.faviconPersistStorageKey;
  const urlRetention = {
    ttlMs: finiteOr(config.faviconPersistTtlMs, DEFAULTS.faviconPersistTtlMs),
    maxEntries: finiteOr(config.faviconPersistMaxEntries, DEFAULTS.faviconPersistMaxEntries)
  };
  const dataKey = config.faviconDataPersistStorageKey || DEFAULTS.faviconDataPersistStorageKey;
  // Data URLs expire with the favicon URLs.
  const dataRetention = {
    ttlMs: urlRetention.ttlMs,
    maxEntries: finiteOr(config.faviconDataPersistMaxEntries, DEFAULTS.faviconDataPersistMaxEntries)
  };
  const dataMaxLength = finiteOr(config.faviconDataPersistMaxLength, DEFAULTS.faviconDataPersistMaxLength);
  const themeKey = config.siteThemePersistStorageKey || DEFAULTS.siteThemePersistStorageKey;
  const themeRetention = {
    ttlMs: finiteOr(config.siteThemePersistTtlMs, DEFAULTS.siteThemePersistTtlMs),
    maxEntries: finiteOr(config.siteThemePersistMaxEntries, DEFAULTS.siteThemePersistMaxEntries)
  };
  const visitDirtyKey = config.faviconVisitDirtyStorageKey || DEFAULTS.faviconVisitDirtyStorageKey;
  const visitDirtyRetention = {
    ttlMs: finiteOr(config.faviconVisitDirtyTtlMs, DEFAULTS.faviconVisitDirtyTtlMs),
    maxEntries: finiteOr(config.faviconVisitDirtyMaxEntries, DEFAULTS.faviconVisitDirtyMaxEntries)
  };
  const bootWaitMs = finiteOr(config.faviconCacheBootWaitMs, DEFAULTS.faviconCacheBootWaitMs);

  const urlCache = createPersistedCache<FaviconUrlEntry>();
  const dataCache = createPersistedCache<FaviconDataEntry>();
  const themeCache = createPersistedCache<SiteThemeEntry>();
  const visitDirtyCache = createPersistedCache<{ updatedAt: number }>();
  const ctx: FaviconCacheContext = {
    config,
    storageArea,
    timers,
    normalizeFaviconHost,
    isBlockedLocalFaviconUrl,
    isChromeMonogramFaviconUrl,
    urlKey,
    urlRetention,
    dataKey,
    dataRetention,
    dataMaxLength,
    themeKey,
    themeRetention,
    visitDirtyKey,
    visitDirtyRetention,
    bootWaitMs,
    urlCache,
    dataCache,
    themeCache,
    visitDirtyCache
  };

  return {
    isFaviconPersistLoaded: () => ctx.urlCache.loaded,
    isFaviconDataPersistLoaded: () => ctx.dataCache.loaded,
    isSiteThemePersistLoaded: () => ctx.themeCache.loaded,
    ensureCachesReady: () => ensureCachesReady(ctx),
    waitForCachesOrTimeout: (maxWaitMs?: number) => waitForCachesOrTimeout(ctx, maxWaitMs),
    isHostVisitDirty: (hostname: unknown) => isHostVisitDirty(ctx, hostname),
    clearHostVisitDirty: (hostname: unknown) => clearHostVisitDirty(ctx, hostname),
    getPersistedEntry: (cacheKey: string) => getPersistedEntry(ctx, cacheKey),
    setPersistedUrl: (cacheKey: unknown, url: unknown) => setPersistedUrl(ctx, cacheKey, url),
    getPersistedDataEntry: (cacheKey: string) => getPersistedDataEntry(ctx, cacheKey),
    setPersistedData: (cacheKey: unknown, dataUrl: unknown) => setPersistedData(ctx, cacheKey, dataUrl),
    getPersistedThemeEntry: (cacheKey: unknown) => getPersistedThemeEntry(ctx, cacheKey),
    setPersistedThemeEntry: (cacheKey: unknown, entry: unknown) => setPersistedThemeEntry(ctx, cacheKey, entry)
  };
}

export { createFaviconCache };
export type { FaviconCacheOptions, FaviconCacheRuntime, TimerHost };
