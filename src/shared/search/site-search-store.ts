// The site search providers a page offers: the background's list, or when
// the background does not answer, the bundled list merged with the custom
// and disabled providers from settings.
import * as LumnoMessaging from '../../platform/messaging';
import type { MessageRuntime } from '../../platform/messaging';
import { readSiteSearchProviders } from '../../domain/search/site-search-provider-reader';
import type { SiteSearchProvider } from '../../domain/search/types';
import type { StorageAreaLike, StorageItems } from '../../domain/storage-port';

interface SiteSearchStorageKeys {
  custom: string;
  disabled: string;
}

type MergeCustomProviders = (
  baseItems: readonly SiteSearchProvider[],
  customItems: readonly SiteSearchProvider[]
) => SiteSearchProvider[];

interface SiteSearchStoreOptions {
  chromeApi?: { runtime?: MessageRuntime & { getURL?(path: string): string } } | null;
  storageArea?: StorageAreaLike | null;
  storageKeys?: SiteSearchStorageKeys;
  // Used when the bundled list cannot load.
  defaultProviders?: SiteSearchProvider[];
  mergeCustomProviders?: MergeCustomProviders | null;
  getResourceUrl?(path: string): string;
  getStorageValues?(keys: string[]): Promise<StorageItems>;
}

const STORAGE_KEYS: Readonly<SiteSearchStorageKeys> = Object.freeze({
  custom: '_x_extension_site_search_custom_2024_unique_',
  disabled: '_x_extension_site_search_disabled_2024_unique_'
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getRuntimeUrl(chromeApi: SiteSearchStoreOptions['chromeApi'], path: string): string {
  const runtime = chromeApi ? chromeApi.runtime : null;
  return runtime && typeof runtime.getURL === 'function' ? runtime.getURL(path) : path;
}

// The stored values, read through the callback or the promise the area
// returns; empty when the area is missing or the read fails.
function getStorageValues(storageArea: StorageAreaLike | null | undefined, keys: string[]): Promise<StorageItems> {
  return new Promise((resolve) => {
    if (!storageArea) {
      resolve({});
      return;
    }
    let settled = false;
    const finish = (result?: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(isRecord(result) ? result : {});
    };
    try {
      const maybePromise = storageArea.get(keys, finish);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finish).catch(() => finish({}));
      }
    } catch (_error) {
      finish({});
    }
  });
}

function normalizeDisabledKeys(items: unknown): string[] {
  return Array.isArray(items)
    ? items.map((item: unknown) => String(item || '').toLowerCase()).filter(Boolean)
    : [];
}

function getProviderKey(item: SiteSearchProvider | null | undefined): string {
  return String(item && item.key ? item.key : '').toLowerCase();
}

// Custom providers first (each inheriting how its built-in submits), then
// the built-in ones they do not replace.
function mergeProviders(
  baseItems: readonly SiteSearchProvider[] | null | undefined,
  customItems: readonly SiteSearchProvider[] | null | undefined,
  mergeCustomProviders?: MergeCustomProviders | null
): SiteSearchProvider[] {
  if (typeof mergeCustomProviders === 'function') {
    return mergeCustomProviders(baseItems || [], customItems || []);
  }
  const merged: SiteSearchProvider[] = [];
  const seen = new Set<string>();
  const baseMap = new Map((baseItems || []).map((item) => [getProviderKey(item), item]));
  (customItems || []).forEach((item) => {
    if (item.disabled) {
      return;
    }
    const key = getProviderKey(item);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    const builtinKey = String(item.builtinKey || '').toLowerCase();
    const baseProvider = baseMap.get(builtinKey || key);
    merged.push({
      ...item,
      action: String(item.action || (baseProvider && baseProvider.action) || '').trim(),
      submitStrategy: String(item.submitStrategy || (baseProvider && baseProvider.submitStrategy) || '').trim(),
      _xIsCustom: true
    });
  });
  (baseItems || []).forEach((item) => {
    const key = getProviderKey(item);
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    merged.push(item);
  });
  return merged;
}

// The bundled providers without the disabled ones, merged with the custom
// ones from settings.
function mergeStoredProviders(
  baseItems: readonly SiteSearchProvider[] | null | undefined,
  customItems: readonly SiteSearchProvider[] | null | undefined,
  disabledKeys: unknown,
  mergeCustomProviders?: MergeCustomProviders | null
): SiteSearchProvider[] {
  const disabled = normalizeDisabledKeys(disabledKeys);
  const baseMap = new Map((baseItems || []).map((item) => [getProviderKey(item), item]));
  const hydratedCustom = (customItems || []).map((item): SiteSearchProvider => {
    const key = getProviderKey(item);
    const builtinKey = String(item.builtinKey || '').toLowerCase();
    const baseProvider = baseMap.get(builtinKey || key);
    return {
      ...item,
      action: String(item.action || (baseProvider && baseProvider.action) || '').trim(),
      submitStrategy: String(
        item.submitStrategy || (baseProvider && baseProvider.submitStrategy) || ''
      ).trim()
    };
  });
  const filteredBase = (baseItems || []).filter((item) => {
    const key = getProviderKey(item);
    return key && !disabled.includes(key);
  });
  return mergeProviders(filteredBase, hydratedCustom, mergeCustomProviders);
}

function loadSiteSearchProviders(options?: SiteSearchStoreOptions | null): Promise<SiteSearchProvider[]> {
  const settings: SiteSearchStoreOptions = options || {};
  const chromeApi = settings.chromeApi;
  const storageArea = settings.storageArea || null;
  const storageKeys = settings.storageKeys || STORAGE_KEYS;
  const defaultProviders = Array.isArray(settings.defaultProviders) ? settings.defaultProviders : [];
  const mergeCustomProviders = settings.mergeCustomProviders;
  const getResourceUrl = typeof settings.getResourceUrl === 'function'
    ? settings.getResourceUrl
    : (path: string) => getRuntimeUrl(chromeApi, path);
  const getValues = typeof settings.getStorageValues === 'function'
    ? settings.getStorageValues
    : (keys: string[]) => getStorageValues(storageArea, keys);

  const loadLocalProviders = fetch(getResourceUrl('assets/data/site-search.json'))
    .then((response) => response.json())
    .then((data: unknown) => readSiteSearchProviders(isRecord(data) ? data.items : null))
    .catch((): SiteSearchProvider[] => []);

  const loadCustomProviders = getValues([storageKeys.custom])
    .then((result) => readSiteSearchProviders(result[storageKeys.custom]));

  const loadDisabledKeys = getValues([storageKeys.disabled])
    .then((result) => normalizeDisabledKeys(result[storageKeys.disabled]));

  const loadFallback = () => Promise.all([loadLocalProviders, loadCustomProviders, loadDisabledKeys])
    .then(([localItems, customItems, disabledKeys]) => {
      const baseItems = localItems.length > 0 ? localItems : defaultProviders;
      return mergeStoredProviders(baseItems, customItems, disabledKeys, mergeCustomProviders);
    });

  return new Promise((resolve) => {
    const runtime = chromeApi ? chromeApi.runtime : null;
    if (!runtime || typeof runtime.sendMessage !== 'function') {
      loadFallback().then(resolve);
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'getSiteSearchProviders' }, (response) => {
        const items = response && 'items' in response && Array.isArray(response.items) ? response.items : [];
        if (items.length > 0) {
          resolve(items);
          return;
        }
        loadFallback().then(resolve);
      });
    } catch (_error) {
      loadFallback().then(resolve);
    }
  });
}

export type { MergeCustomProviders, SiteSearchStorageKeys, SiteSearchStoreOptions };
export {
  STORAGE_KEYS,
  getStorageValues,
  normalizeDisabledKeys,
  mergeProviders,
  mergeStoredProviders,
  loadSiteSearchProviders
};
