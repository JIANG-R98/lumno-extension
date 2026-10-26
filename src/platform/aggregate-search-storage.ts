// Reading the stored aggregate searches.
import { normalizeAggregateSearches } from '../domain/search/aggregate-search-store';
import type { AggregateSearch } from '../domain/search/aggregate-search-store';
import type { StorageAreaLike } from '../domain/storage-port';
import { readStorageValue } from './settings-storage';
import type { StorageChromeApi } from './settings-storage';
import { readStoredSetting } from './settings-store';
import type { SettingsStore } from './settings-store';
import { aggregateSearches } from '../domain/settings/search';

// A failed read rejects, so it stays distinguishable from an empty list.
async function loadAggregateSearches(
  storageArea: StorageAreaLike | null | undefined,
  storageKey: string | null | undefined,
  chromeApi: StorageChromeApi | null | undefined
): Promise<AggregateSearch[]> {
  const value = await readStorageValue(storageArea, chromeApi, storageKey || aggregateSearches.key);
  return normalizeAggregateSearches(value);
}

// The aggregate searches a settings store holds; rejects when storage could
// not be read, as loadAggregateSearches does.
async function readAggregateSearches(store: SettingsStore): Promise<AggregateSearch[]> {
  return normalizeAggregateSearches(await readStoredSetting(store, aggregateSearches));
}

export { loadAggregateSearches, readAggregateSearches };
