// The storage area the page reads settings from, the one batched read that
// fetches every key the first render needs before the modules ask for them
// one by one, and moving preferences an older version kept locally.
import * as LumnoSettings from '../domain/settings';
import * as ProviderStorage from '../platform/provider-storage';
import * as SettingsStorage from '../platform/settings-storage';
import * as StorageReadBatch from '../platform/storage-read-batch';

function createStartupStorage() {
  const settingsRuntimeApi = LumnoSettings;
  const providerStorageRuntime = ProviderStorage.createProviderStorageRuntime(chrome);
  const rawStorageArea = providerStorageRuntime.area;
  // The next New Tab prefetches these keys before its scripts load (newtab-storage-prefetch.ts).
  function rememberStartupStorageKeys(keys: readonly string[] | null | undefined): void {
    if (!keys || !keys.length) {
      return;
    }
    try {
      const value = JSON.stringify(keys.slice().sort());
      const cacheKey = settingsRuntimeApi.newtabStartupStorageKeys.key;
      if (window.localStorage.getItem(cacheKey) !== value) {
        window.localStorage.setItem(cacheKey, value);
      }
    } catch {
      // localStorage is only a fast path; the next load reads storage as before.
    }
  }
  const startupStorageReadBatch = rawStorageArea
    ? StorageReadBatch.createStorageReadBatch(rawStorageArea)
    : null;
  const storageArea = startupStorageReadBatch
    ? startupStorageReadBatch.area
    : rawStorageArea;
  if (startupStorageReadBatch) {
    void startupStorageReadBatch.ready.then((metrics) => {
      rememberStartupStorageKeys(metrics && metrics.keys);
      if (!document.documentElement) {
        return;
      }
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-reads',
        String(Number(metrics && metrics.underlyingReadCount) || 0)
      );
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-requests',
        String(Number(metrics && metrics.requestCount) || 0)
      );
      document.documentElement.setAttribute(
        'data-lumno-newtab-bootstrap-storage-keys',
        metrics && metrics.keyCount === null
          ? 'all'
          : String(Number(metrics && metrics.keyCount) || 0)
      );
    });
  }

  // Whether a storage change came from the area settings live in.
  function isPrimaryStorageAreaName(areaName: string): boolean {
    return providerStorageRuntime.isActiveAreaName(areaName);
  }

  // Copies preferences an older version kept in local storage into browser
  // sync, once the settings area is known and turns out to be sync.
  function migrateLocalSettingsIfNeeded(keys: string[]): void {
    void providerStorageRuntime.ready.then(() => {
      if (!chrome.storage || !chrome.storage.local || isPrimaryStorageAreaName('local')) {
        return;
      }
      SettingsStorage.migrateLocalSettingsToSync(chrome.storage.local, storageArea, keys);
    });
  }

  return {
    settingsRuntimeApi,
    providerStorageRuntime,
    rawStorageArea,
    startupStorageReadBatch,
    storageArea,
    isPrimaryStorageAreaName,
    migrateLocalSettingsIfNeeded
  };
}

type StartupStorage = ReturnType<typeof createStartupStorage>;

export { createStartupStorage };
export type { StartupStorage };
