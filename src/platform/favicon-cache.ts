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

function createFaviconCache(options?: FaviconCacheOptions | null): FaviconCacheRuntime {
  const config = options || {};
  const storageArea = config.storageArea || null;
  const timers: TimerHost = config.windowObj || globalThis;
  const normalizeFaviconHost = config.normalizeFaviconHost || defaultNormalizeHost;
  const isBlockedLocalFaviconUrl = config.isBlockedLocalFaviconUrl || (() => false);
  const isChromeMonogramFaviconUrl = config.isChromeMonogramFaviconUrl || isMonogramUrl;
  const isRejectedUrl = (url: string): boolean => isBlockedLocalFaviconUrl(url) || isChromeMonogramFaviconUrl(url);

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

  function load<T>(cache: PersistedCache<T>, key: string, read: (record: unknown, now: number) => Array<[string, T]>): Promise<void> {
    if (cache.loadPromise) {
      return cache.loadPromise;
    }
    const area = storageArea;
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

  function ensureCachesReady(): Promise<void> {
    return Promise.all([
      load(urlCache, urlKey, (record, now) => readFaviconUrlRecord(record, urlRetention, isRejectedUrl, now)),
      load(dataCache, dataKey, (record, now) => readFaviconDataRecord(record, dataRetention, dataMaxLength, now)),
      load(themeCache, themeKey, (record, now) => readSiteThemeRecord(record, themeRetention, now)),
      load(visitDirtyCache, visitDirtyKey, (record, now) => readVisitDirtyRecord(record, visitDirtyRetention, now)
        .map(([host, updatedAt]): [string, { updatedAt: number }] => [host, { updatedAt }]))
    ]).then(() => undefined).catch(() => undefined);
  }

  function waitForCachesOrTimeout(maxWaitMs?: number): Promise<void> {
    const waitMs = typeof maxWaitMs === 'number' && Number.isFinite(maxWaitMs) && maxWaitMs >= 0 ? maxWaitMs : bootWaitMs;
    return Promise.race([
      ensureCachesReady(),
      new Promise<void>((resolve) => {
        timers.setTimeout(resolve, waitMs);
      })
    ]).then(() => undefined).catch(() => undefined);
  }

  // Writes the cache's newest entries after `delay`; changes made meanwhile
  // go into the same write.
  function scheduleWrite<T extends { updatedAt: number }, S>(
    cache: PersistedCache<T>,
    key: string,
    version: number,
    maxEntries: number,
    toStored: (entry: T) => S,
    delay: number
  ): void {
    const area = storageArea;
    if (!area || cache.writePending) {
      return;
    }
    cache.writePending = true;
    timers.setTimeout(() => {
      cache.writePending = false;
      const newest = keepNewest(cache.entries.entries(), maxEntries)
        .map(([entryKey, entry]): [string, S] => [entryKey, toStored(entry)]);
      area.set({ [key]: createRecord(version, newest, Date.now()) });
    }, delay);
  }

  function persistUrls(): void {
    scheduleWrite(urlCache, urlKey, PAGE_FAVICON_CACHE_VERSION, urlRetention.maxEntries,
      (entry) => ({ url: entry.url, updatedAt: entry.updatedAt }), WRITE_DELAY_MS);
  }

  function persistData(): void {
    scheduleWrite(dataCache, dataKey, PAGE_FAVICON_CACHE_VERSION, dataRetention.maxEntries,
      (entry) => ({ dataUrl: entry.dataUrl, updatedAt: entry.updatedAt }), WRITE_DELAY_MS);
  }

  function persistThemes(): void {
    scheduleWrite(themeCache, themeKey, 1, themeRetention.maxEntries, (entry) => ({
      accentRgb: entry.accentRgb,
      source: entry.source,
      neutral: entry.neutral,
      confidence: entry.confidence,
      updatedAt: entry.updatedAt
    }), WRITE_DELAY_MS);
  }

  function persistVisitDirty(): void {
    scheduleWrite(visitDirtyCache, visitDirtyKey, 1, visitDirtyRetention.maxEntries, (entry) => entry.updatedAt, 0);
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

  function isHostVisitDirty(hostname: unknown): boolean {
    const host = normalizeFaviconHost(hostname);
    if (!host) {
      return false;
    }
    const entry = visitDirtyCache.entries.get(host);
    const updatedAt = Number(entry ? entry.updatedAt : 0);
    if (!Number.isFinite(updatedAt) || !updatedAt) {
      return false;
    }
    if (Date.now() - updatedAt > visitDirtyRetention.ttlMs) {
      visitDirtyCache.entries.delete(host);
      persistVisitDirty();
      return false;
    }
    return true;
  }

  function clearHostVisitDirty(hostname: unknown): void {
    const host = normalizeFaviconHost(hostname);
    if (!host || !visitDirtyCache.entries.has(host)) {
      return;
    }
    visitDirtyCache.entries.delete(host);
    persistVisitDirty();
  }

  function getPersistedEntry(cacheKey: string): FaviconUrlEntry | null {
    const cached = cacheKey ? urlCache.entries.get(cacheKey) : undefined;
    if (!cached || !cached.url) {
      return null;
    }
    if (isExpired(cached.updatedAt, urlRetention.ttlMs, Date.now())) {
      urlCache.entries.delete(cacheKey);
      persistUrls();
      return null;
    }
    return { url: cached.url, updatedAt: cached.updatedAt };
  }

  function setPersistedUrl(cacheKey: unknown, url: unknown): void {
    const key = String(cacheKey || '').trim();
    const nextUrl = String(url || '').trim();
    if (!key || !nextUrl || nextUrl.startsWith('data:') || isRejectedUrl(nextUrl)) {
      return;
    }
    urlCache.entries.set(key, { url: nextUrl, updatedAt: Date.now() });
    compact(urlCache, urlRetention.maxEntries);
    persistUrls();
  }

  function getPersistedDataEntry(cacheKey: string): FaviconDataEntry | null {
    const cached = cacheKey ? dataCache.entries.get(cacheKey) : undefined;
    if (!cached || !isValidDataUrlIcon(cached.dataUrl, dataMaxLength)) {
      return null;
    }
    if (isExpired(cached.updatedAt, dataRetention.ttlMs, Date.now())) {
      dataCache.entries.delete(cacheKey);
      persistData();
      return null;
    }
    return { dataUrl: cached.dataUrl, updatedAt: cached.updatedAt };
  }

  function setPersistedData(cacheKey: unknown, dataUrl: unknown): void {
    const key = String(cacheKey || '').trim();
    const nextDataUrl = String(dataUrl || '').trim();
    if (!key || !isValidDataUrlIcon(nextDataUrl, dataMaxLength)) {
      return;
    }
    dataCache.entries.set(key, { dataUrl: nextDataUrl, updatedAt: Date.now() });
    compact(dataCache, dataRetention.maxEntries);
    persistData();
  }

  function getPersistedThemeEntry(cacheKey: unknown): SiteThemeEntry | null {
    const key = normalizeFaviconHost(cacheKey);
    const cached = key ? themeCache.entries.get(key) : undefined;
    if (!cached) {
      return null;
    }
    if (isExpired(cached.updatedAt, themeRetention.ttlMs, Date.now())) {
      themeCache.entries.delete(key);
      persistThemes();
      return null;
    }
    return { ...cached, accentRgb: [...cached.accentRgb] };
  }

  function setPersistedThemeEntry(cacheKey: unknown, entry: unknown): boolean {
    const key = normalizeFaviconHost(cacheKey);
    const next = normalizeSiteThemeEntry(entry, Date.now());
    if (!key || !next) {
      return false;
    }
    const current = themeCache.entries.get(key);
    if (current && isSameSiteTheme(current, next)) {
      return false;
    }
    themeCache.entries.set(key, next);
    compact(themeCache, themeRetention.maxEntries);
    persistThemes();
    return true;
  }

  return {
    isFaviconPersistLoaded: () => urlCache.loaded,
    isFaviconDataPersistLoaded: () => dataCache.loaded,
    isSiteThemePersistLoaded: () => themeCache.loaded,
    ensureCachesReady,
    waitForCachesOrTimeout,
    isHostVisitDirty,
    clearHostVisitDirty,
    getPersistedEntry,
    setPersistedUrl,
    getPersistedDataEntry,
    setPersistedData,
    getPersistedThemeEntry,
    setPersistedThemeEntry
  };
}

export { createFaviconCache };
export type { FaviconCacheOptions, FaviconCacheRuntime, TimerHost };
