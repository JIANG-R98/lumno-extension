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

// One kind of cached entry: where it persists, how long and how many are
// kept, how a stored record is read and how an entry is stored.
interface PersistedCacheSpec<T, S> {
  key: string;
  version: number;
  ttlMs: number;
  maxEntries: number;
  // Writes wait this long, so a burst of changes is written once.
  writeDelayMs: number;
  read(record: unknown, now: number): Array<[string, T]>;
  toStored(entry: T): S;
}

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

// One persisted cache: its entries in memory, loaded once from storage and
// written back a moment after they change.
class PersistedCache<T extends { updatedAt: number }, S> {
  loaded = false;
  private readonly entries = new Map<string, T>();
  private loadPromise: Promise<void> | null = null;
  private writePending = false;
  private readonly spec: PersistedCacheSpec<T, S>;
  private readonly area: StorageAreaLike | null;
  private readonly timers: TimerHost;

  constructor(spec: PersistedCacheSpec<T, S>, area: StorageAreaLike | null, timers: TimerHost) {
    this.spec = spec;
    this.area = area;
    this.timers = timers;
  }

  load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    const area = this.area;
    if (!area || this.loaded) {
      this.loaded = true;
      this.loadPromise = Promise.resolve();
      return this.loadPromise;
    }
    this.loadPromise = new Promise((resolve) => {
      area.get([this.spec.key], (result: StorageItems | undefined) => {
        for (const [entryKey, entry] of this.spec.read(result && result[this.spec.key], Date.now())) {
          this.entries.set(entryKey, entry);
        }
        this.loaded = true;
        resolve();
      });
    });
    return this.loadPromise;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  peek(key: string): T | undefined {
    return this.entries.get(key);
  }

  // The entry while it is usable and fresh; an expired one is dropped.
  fresh(key: string, isUsable: (entry: T) => boolean): T | null {
    const entry = key ? this.entries.get(key) : undefined;
    if (!entry || !isUsable(entry)) {
      return null;
    }
    if (isExpired(entry.updatedAt, this.spec.ttlMs, Date.now())) {
      this.drop(key);
      return null;
    }
    return entry;
  }

  put(key: string, entry: T): void {
    this.entries.set(key, entry);
    this.compact();
    this.scheduleWrite();
  }

  drop(key: string): void {
    this.entries.delete(key);
    this.scheduleWrite();
  }

  // Keeps a map that grew past twice its limit at its newest entries.
  private compact(): void {
    const { maxEntries } = this.spec;
    if (this.entries.size <= maxEntries * 2) {
      return;
    }
    const newest = keepNewest(this.entries.entries(), maxEntries);
    this.entries.clear();
    newest.forEach(([key, entry]) => this.entries.set(key, entry));
  }

  // Writes the newest entries after the delay; changes made meanwhile go
  // into the same write.
  private scheduleWrite(): void {
    const area = this.area;
    if (!area || this.writePending) {
      return;
    }
    const { key, version, maxEntries, toStored, writeDelayMs } = this.spec;
    this.writePending = true;
    this.timers.setTimeout(() => {
      this.writePending = false;
      const newest = keepNewest(this.entries.entries(), maxEntries)
        .map(([entryKey, entry]): [string, S] => [entryKey, toStored(entry)]);
      area.set({ [key]: createRecord(version, newest, Date.now()) });
    }, writeDelayMs);
  }
}

// The caches of one page or worker: favicon URLs and data URLs by page,
// site themes and hosts visited since their icon was read, by host.
interface FaviconCaches {
  urls: PersistedCache<FaviconUrlEntry, FaviconUrlEntry>;
  data: PersistedCache<FaviconDataEntry, FaviconDataEntry>;
  themes: PersistedCache<SiteThemeEntry, SiteThemeEntry>;
  visitDirty: PersistedCache<{ updatedAt: number }, number>;
}

interface FaviconCacheRules {
  normalizeHost: (hostname: unknown) => string;
  // Addresses never kept as favicon URLs.
  isRejectedUrl: (url: string) => boolean;
  dataMaxLength: number;
  bootWaitMs: number;
}

function createCaches(config: FaviconCacheOptions, rules: FaviconCacheRules): FaviconCaches {
  const area = config.storageArea || null;
  const timers: TimerHost = config.windowObj || globalThis;
  const urlRetention = {
    ttlMs: finiteOr(config.faviconPersistTtlMs, DEFAULTS.faviconPersistTtlMs),
    maxEntries: finiteOr(config.faviconPersistMaxEntries, DEFAULTS.faviconPersistMaxEntries)
  };
  // Data URLs expire with the favicon URLs.
  const dataRetention = {
    ttlMs: urlRetention.ttlMs,
    maxEntries: finiteOr(config.faviconDataPersistMaxEntries, DEFAULTS.faviconDataPersistMaxEntries)
  };
  const themeRetention = {
    ttlMs: finiteOr(config.siteThemePersistTtlMs, DEFAULTS.siteThemePersistTtlMs),
    maxEntries: finiteOr(config.siteThemePersistMaxEntries, DEFAULTS.siteThemePersistMaxEntries)
  };
  const visitDirtyRetention = {
    ttlMs: finiteOr(config.faviconVisitDirtyTtlMs, DEFAULTS.faviconVisitDirtyTtlMs),
    maxEntries: finiteOr(config.faviconVisitDirtyMaxEntries, DEFAULTS.faviconVisitDirtyMaxEntries)
  };
  return {
    urls: new PersistedCache({
      key: config.faviconPersistStorageKey || DEFAULTS.faviconPersistStorageKey,
      version: PAGE_FAVICON_CACHE_VERSION,
      ...urlRetention,
      writeDelayMs: WRITE_DELAY_MS,
      read: (record, now) => readFaviconUrlRecord(record, urlRetention, rules.isRejectedUrl, now),
      toStored: (entry) => ({ url: entry.url, updatedAt: entry.updatedAt })
    }, area, timers),
    data: new PersistedCache({
      key: config.faviconDataPersistStorageKey || DEFAULTS.faviconDataPersistStorageKey,
      version: PAGE_FAVICON_CACHE_VERSION,
      ...dataRetention,
      writeDelayMs: WRITE_DELAY_MS,
      read: (record, now) => readFaviconDataRecord(record, dataRetention, rules.dataMaxLength, now),
      toStored: (entry) => ({ dataUrl: entry.dataUrl, updatedAt: entry.updatedAt })
    }, area, timers),
    themes: new PersistedCache({
      key: config.siteThemePersistStorageKey || DEFAULTS.siteThemePersistStorageKey,
      version: 1,
      ...themeRetention,
      writeDelayMs: WRITE_DELAY_MS,
      read: (record, now) => readSiteThemeRecord(record, themeRetention, now),
      toStored: (entry) => ({
        accentRgb: entry.accentRgb,
        source: entry.source,
        neutral: entry.neutral,
        confidence: entry.confidence,
        updatedAt: entry.updatedAt
      })
    }, area, timers),
    visitDirty: new PersistedCache({
      key: config.faviconVisitDirtyStorageKey || DEFAULTS.faviconVisitDirtyStorageKey,
      version: 1,
      ...visitDirtyRetention,
      writeDelayMs: 0,
      read: (record, now) => readVisitDirtyRecord(record, visitDirtyRetention, now)
        .map(([host, updatedAt]): [string, { updatedAt: number }] => [host, { updatedAt }]),
      toStored: (entry) => entry.updatedAt
    }, area, timers)
  };
}

function ensureCachesReady(caches: FaviconCaches): Promise<void> {
  return Promise.all([caches.urls.load(), caches.data.load(), caches.themes.load(), caches.visitDirty.load()])
    .then(() => undefined).catch(() => undefined);
}

function waitForCachesOrTimeout(caches: FaviconCaches, timers: TimerHost, bootWaitMs: number, maxWaitMs?: number): Promise<void> {
  const waitMs = typeof maxWaitMs === 'number' && Number.isFinite(maxWaitMs) && maxWaitMs >= 0 ? maxWaitMs : bootWaitMs;
  return Promise.race([
    ensureCachesReady(caches),
    new Promise<void>((resolve) => {
      timers.setTimeout(resolve, waitMs);
    })
  ]).then(() => undefined).catch(() => undefined);
}

function isHostVisitDirty(caches: FaviconCaches, rules: FaviconCacheRules, hostname: unknown): boolean {
  const host = rules.normalizeHost(hostname);
  return Boolean(host && caches.visitDirty.fresh(host, (entry) => Number.isFinite(Number(entry.updatedAt)) && Boolean(entry.updatedAt)));
}

function clearHostVisitDirty(caches: FaviconCaches, rules: FaviconCacheRules, hostname: unknown): void {
  const host = rules.normalizeHost(hostname);
  if (host && caches.visitDirty.has(host)) {
    caches.visitDirty.drop(host);
  }
}

function setPersistedUrl(caches: FaviconCaches, rules: FaviconCacheRules, cacheKey: unknown, url: unknown): void {
  const key = String(cacheKey || '').trim();
  const nextUrl = String(url || '').trim();
  if (key && nextUrl && !nextUrl.startsWith('data:') && !rules.isRejectedUrl(nextUrl)) {
    caches.urls.put(key, { url: nextUrl, updatedAt: Date.now() });
  }
}

function setPersistedData(caches: FaviconCaches, rules: FaviconCacheRules, cacheKey: unknown, dataUrl: unknown): void {
  const key = String(cacheKey || '').trim();
  const nextDataUrl = String(dataUrl || '').trim();
  if (key && isValidDataUrlIcon(nextDataUrl, rules.dataMaxLength)) {
    caches.data.put(key, { dataUrl: nextDataUrl, updatedAt: Date.now() });
  }
}

function getPersistedThemeEntry(caches: FaviconCaches, rules: FaviconCacheRules, cacheKey: unknown): SiteThemeEntry | null {
  const cached = caches.themes.fresh(rules.normalizeHost(cacheKey), () => true);
  return cached ? { ...cached, accentRgb: [...cached.accentRgb] } : null;
}

function setPersistedThemeEntry(caches: FaviconCaches, rules: FaviconCacheRules, cacheKey: unknown, entry: unknown): boolean {
  const key = rules.normalizeHost(cacheKey);
  const next = normalizeSiteThemeEntry(entry, Date.now());
  const current = key && next ? caches.themes.peek(key) : undefined;
  if (!key || !next || (current && isSameSiteTheme(current, next))) {
    return false;
  }
  caches.themes.put(key, next);
  return true;
}

function createFaviconCache(options?: FaviconCacheOptions | null): FaviconCacheRuntime {
  const config = options || {};
  const timers: TimerHost = config.windowObj || globalThis;
  const isBlockedLocalFaviconUrl = config.isBlockedLocalFaviconUrl || (() => false);
  const isChromeMonogramFaviconUrl = config.isChromeMonogramFaviconUrl || isMonogramUrl;
  const rules: FaviconCacheRules = {
    normalizeHost: config.normalizeFaviconHost || defaultNormalizeHost,
    isRejectedUrl: (url) => isBlockedLocalFaviconUrl(url) || isChromeMonogramFaviconUrl(url),
    dataMaxLength: finiteOr(config.faviconDataPersistMaxLength, DEFAULTS.faviconDataPersistMaxLength),
    bootWaitMs: finiteOr(config.faviconCacheBootWaitMs, DEFAULTS.faviconCacheBootWaitMs)
  };
  const caches = createCaches(config, rules);
  return {
    isFaviconPersistLoaded: () => caches.urls.loaded,
    isFaviconDataPersistLoaded: () => caches.data.loaded,
    isSiteThemePersistLoaded: () => caches.themes.loaded,
    ensureCachesReady: () => ensureCachesReady(caches),
    waitForCachesOrTimeout: (maxWaitMs?: number) => waitForCachesOrTimeout(caches, timers, rules.bootWaitMs, maxWaitMs),
    isHostVisitDirty: (hostname: unknown) => isHostVisitDirty(caches, rules, hostname),
    clearHostVisitDirty: (hostname: unknown) => clearHostVisitDirty(caches, rules, hostname),
    getPersistedEntry: (cacheKey: string) => {
      const cached = caches.urls.fresh(cacheKey, (entry) => Boolean(entry.url));
      return cached ? { url: cached.url, updatedAt: cached.updatedAt } : null;
    },
    setPersistedUrl: (cacheKey: unknown, url: unknown) => setPersistedUrl(caches, rules, cacheKey, url),
    getPersistedDataEntry: (cacheKey: string) => {
      const cached = caches.data.fresh(cacheKey, (entry) => isValidDataUrlIcon(entry.dataUrl, rules.dataMaxLength));
      return cached ? { dataUrl: cached.dataUrl, updatedAt: cached.updatedAt } : null;
    },
    setPersistedData: (cacheKey: unknown, dataUrl: unknown) => setPersistedData(caches, rules, cacheKey, dataUrl),
    getPersistedThemeEntry: (cacheKey: unknown) => getPersistedThemeEntry(caches, rules, cacheKey),
    setPersistedThemeEntry: (cacheKey: unknown, entry: unknown) => setPersistedThemeEntry(caches, rules, cacheKey, entry)
  };
}

export { createFaviconCache };
export type { FaviconCacheOptions, FaviconCacheRuntime, TimerHost };
