// Loading and saving the New Tab's pinned and hidden recent sites
// (domain/recent-sites-store.ts normalizes them).
import {
  DEFAULT_HIDDEN_KEY,
  DEFAULT_PINNED_KEY,
  normalizeHiddenRecentSites,
  normalizePinnedRecentSites
} from '../domain/recent-sites-store';
import type { HiddenRecentSite, RecentSite, RecentSiteOptions } from '../domain/recent-sites-store';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';

interface RecentSiteStorageOptions extends RecentSiteOptions {
  // The storage key; the default pinned or hidden key when absent.
  key?: string;
}

function storageGet(storage: StorageAreaLike | null | undefined, key: string): Promise<StorageItems> {
  return new Promise((resolve) => {
    if (!storage) {
      resolve({});
      return;
    }
    storage.get([key], (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(storage: StorageAreaLike | null | undefined, value: StorageItems): Promise<void> {
  return new Promise((resolve) => {
    if (!storage) {
      resolve();
      return;
    }
    storage.set(value, () => resolve());
  });
}

function loadPinnedRecentSites(
  storage: StorageAreaLike | null | undefined,
  options?: RecentSiteStorageOptions | null
): Promise<RecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || DEFAULT_PINNED_KEY;
  return storageGet(storage, key).then((result) => normalizePinnedRecentSites(result[key], opts));
}

function savePinnedRecentSites(
  storage: StorageAreaLike | null | undefined,
  items: unknown,
  options?: RecentSiteStorageOptions | null
): Promise<RecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || DEFAULT_PINNED_KEY;
  const normalized = normalizePinnedRecentSites(items, opts);
  return storageSet(storage, { [key]: normalized }).then(() => normalized);
}

function loadHiddenRecentSites(
  storage: StorageAreaLike | null | undefined,
  options?: RecentSiteStorageOptions | null
): Promise<HiddenRecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || DEFAULT_HIDDEN_KEY;
  return storageGet(storage, key).then((result) => normalizeHiddenRecentSites(result[key], opts));
}

function saveHiddenRecentSites(
  storage: StorageAreaLike | null | undefined,
  items: unknown,
  options?: RecentSiteStorageOptions | null
): Promise<HiddenRecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || DEFAULT_HIDDEN_KEY;
  const normalized = normalizeHiddenRecentSites(items, opts);
  return storageSet(storage, { [key]: normalized }).then(() => normalized);
}

export { loadHiddenRecentSites, loadPinnedRecentSites, saveHiddenRecentSites, savePinnedRecentSites };
export type { RecentSiteStorageOptions };
