// The saved icon snapshots (domain/favicon/shortcut-favicon.ts) in the
// extension's local storage. Updates run one at a time across pages when
// the page has Web Locks, so two pages never overwrite each other's icons.
import type { StorageAreaLike } from '../domain/storage-port';
import type { StorageChromeApi } from './settings-storage';
import { newtabShortcutFaviconCache } from '../domain/settings/newtab-shortcuts';
import { normalizeCacheMap, normalizeCacheOptions, retainCachedIcons } from '../domain/favicon/shortcut-favicon/persisted';
import type { CachedIconMap, IconCacheOptions } from '../domain/favicon/shortcut-favicon/types';

// navigator.locks.
interface LockManagerLike {
  request(name: string, callback: () => Promise<CachedIconMap>): Promise<CachedIconMap>;
}

interface ShortcutFaviconStoreOptions extends Partial<IconCacheOptions> {
  storageArea?: StorageAreaLike | null;
  storageKey?: string;
  chromeApi?: StorageChromeApi | null;
  lockManager?: LockManagerLike | null;
}

interface ShortcutFaviconStore {
  storageKey: string;
  cacheOptions: Readonly<IconCacheOptions>;
  // The stored icons; empty when they cannot be read.
  readAll(): Promise<CachedIconMap>;
  writeAll(cacheMap: unknown): Promise<CachedIconMap>;
  // Adds icons to the stored ones.
  mergeAll(cacheMap: unknown): Promise<CachedIconMap>;
  // Keeps only the icons of these pages.
  retainAll(pageUrls: unknown): Promise<CachedIconMap>;
}

function createShortcutFaviconStore(options?: ShortcutFaviconStoreOptions | null): Readonly<ShortcutFaviconStore> {
  const settings = options || {};
  const storageArea = settings.storageArea || null;
  const storageKey = String(settings.storageKey || newtabShortcutFaviconCache.key);
  const chromeApi = settings.chromeApi || null;
  const lockManager = settings.lockManager || null;
  const lockName = `lumno-shortcut-favicon-store:${storageKey}`;
  const cacheOptions = normalizeCacheOptions(settings);

  function getRuntimeError(): { message?: string } | null | undefined {
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  function readAll(): Promise<CachedIconMap> {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve({});
        return;
      }
      storageArea.get([storageKey], (result) => {
        if (getRuntimeError()) {
          resolve({});
          return;
        }
        resolve(normalizeCacheMap(result && result[storageKey], undefined, cacheOptions));
      });
    });
  }

  function writeAll(cacheMap: unknown): Promise<CachedIconMap> {
    const normalized = normalizeCacheMap(cacheMap, undefined, cacheOptions);
    return new Promise((resolve, reject) => {
      if (!storageArea) {
        resolve(normalized);
        return;
      }
      storageArea.set({ [storageKey]: normalized }, () => {
        const runtimeError = getRuntimeError();
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Failed to store shortcut favicons.'));
          return;
        }
        resolve(normalized);
      });
    });
  }

  function runExclusive(task: () => Promise<CachedIconMap>): Promise<CachedIconMap> {
    if (lockManager && typeof lockManager.request === 'function') {
      return Promise.resolve(lockManager.request(lockName, task));
    }
    return Promise.resolve().then(task);
  }

  function updateAll(updater: (current: CachedIconMap) => CachedIconMap): Promise<CachedIconMap> {
    return runExclusive(() => readAll().then((current) => writeAll(updater(current))));
  }

  function mergeAll(cacheMap: unknown): Promise<CachedIconMap> {
    const additions = normalizeCacheMap(cacheMap, undefined, cacheOptions);
    return updateAll((current) => normalizeCacheMap({
      ...current,
      ...additions
    }, undefined, cacheOptions));
  }

  function retainAll(pageUrls: unknown): Promise<CachedIconMap> {
    return updateAll((current) => retainCachedIcons(current, pageUrls, undefined, cacheOptions));
  }

  return Object.freeze({ storageKey, cacheOptions, readAll, writeAll, mergeAll, retainAll });
}

export { createShortcutFaviconStore };
export type { LockManagerLike, ShortcutFaviconStore, ShortcutFaviconStoreOptions };
