// The storage area the page reads settings from, and the one batched read
// that fetches every key the first render needs before the modules ask for
// them one by one.
import * as LumnoSettings from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';

function createStartupStorage() {
  const settingsRuntimeApi = LumnoSettings;
  const providerStorageRuntime = LumnoSettingsStorage.createProviderStorageRuntime(chrome);
  const rawStorageArea = providerStorageRuntime.area;
  // The next New Tab prefetches these keys before its scripts load (newtab-storage-prefetch.ts).
  function rememberStartupStorageKeys(keys: readonly string[] | null | undefined): void {
    if (!keys || !keys.length) {
      return;
    }
    try {
      const value = JSON.stringify(keys.slice().sort());
      const cacheKey = settingsRuntimeApi.NEWTAB_STARTUP_STORAGE_KEYS_CACHE_KEY;
      if (window.localStorage.getItem(cacheKey) !== value) {
        window.localStorage.setItem(cacheKey, value);
      }
    } catch {
      // localStorage is only a fast path; the next load reads storage as before.
    }
  }
  const startupStorageReadBatch = rawStorageArea
    ? LumnoSettingsStorage.createStorageReadBatch(rawStorageArea)
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

  return {
    settingsRuntimeApi,
    providerStorageRuntime,
    rawStorageArea,
    startupStorageReadBatch,
    storageArea
  };
}

type StartupStorage = ReturnType<typeof createStartupStorage>;

export { createStartupStorage };
export type { StartupStorage };
