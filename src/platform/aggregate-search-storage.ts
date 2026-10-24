// Reading the stored aggregate searches.
import { STORAGE_KEY, normalizeAggregateSearches } from '../domain/search/aggregate-search-store';
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { StorageAreaLike } from '../domain/storage-port';
import { readStorageValue } from './settings-storage';
import type { StorageChromeApi } from './settings-storage';

// A failed read rejects, so it stays distinguishable from an empty list.
async function loadAggregateSearches(
  storageArea: StorageAreaLike | null | undefined,
  storageKey: string | null | undefined,
  chromeApi: StorageChromeApi | null | undefined
): Promise<AggregateSearch[]> {
  const value = await readStorageValue(storageArea, chromeApi, storageKey || STORAGE_KEY);
  return normalizeAggregateSearches(value);
}

export { loadAggregateSearches };
