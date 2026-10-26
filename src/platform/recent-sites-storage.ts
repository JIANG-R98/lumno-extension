// Loading and saving the New Tab's pinned and hidden recent sites
// (domain/recent-sites-store.ts normalizes them).
import { normalizeHiddenRecentSites, normalizePinnedRecentSites } from '../domain/recent-sites-store';
import type { HiddenRecentSite, RecentSite, RecentSiteOptions } from '../domain/recent-sites-store';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import { hiddenRecentSites, pinnedRecentSites } from '../domain/settings/recent-sites';

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
  const key = opts.key || pinnedRecentSites.key;
  return storageGet(storage, key).then((result) => normalizePinnedRecentSites(result[key], opts));
}

function savePinnedRecentSites(
  storage: StorageAreaLike | null | undefined,
  items: unknown,
  options?: RecentSiteStorageOptions | null
): Promise<RecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || pinnedRecentSites.key;
  const normalized = normalizePinnedRecentSites(items, opts);
  return storageSet(storage, { [key]: normalized }).then(() => normalized);
}

function loadHiddenRecentSites(
  storage: StorageAreaLike | null | undefined,
  options?: RecentSiteStorageOptions | null
): Promise<HiddenRecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || hiddenRecentSites.key;
  return storageGet(storage, key).then((result) => normalizeHiddenRecentSites(result[key], opts));
}

function saveHiddenRecentSites(
  storage: StorageAreaLike | null | undefined,
  items: unknown,
  options?: RecentSiteStorageOptions | null
): Promise<HiddenRecentSite[]> {
  const opts = options && typeof options === 'object' ? options : {};
  const key = opts.key || hiddenRecentSites.key;
  const normalized = normalizeHiddenRecentSites(items, opts);
  return storageSet(storage, { [key]: normalized }).then(() => normalized);
}

export { loadHiddenRecentSites, loadPinnedRecentSites, saveHiddenRecentSites, savePinnedRecentSites };
export type { RecentSiteStorageOptions };
