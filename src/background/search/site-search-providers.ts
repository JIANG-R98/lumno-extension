// The site search providers: the bundled list merged with the custom and
// disabled ones from settings, cached until either changes.
import * as SEARCH_UTILS from '../../domain/search/search-utils';
import { siteSearchDisabled, siteSearchCustom } from '../../domain/settings';
import { workerSettings } from '../worker-context';
import { scheduleSiteSearchProviderIconWarmup } from '../favicon-service';
import type { NormalizedSiteSearchProvider, SiteSearchProvider } from '../../domain/search/types';
import { isRecord } from './types';

let siteSearchCache: SiteSearchProvider[] | null = null;

let siteSearchPromise: Promise<SiteSearchProvider[]> | null = null;

let siteSearchLoadGeneration = 0;

function isInteractiveSiteSearchProvider(provider: SiteSearchProvider | null | undefined): boolean {
  return SEARCH_UTILS.isInteractiveSiteSearchProvider(provider);
}

function sanitizeSiteSearchProviders(items: unknown): NormalizedSiteSearchProvider[] {
  return SEARCH_UTILS.sanitizeSiteSearchProviders(items);
}

function loadCustomSiteSearchProviders(): Promise<NormalizedSiteSearchProvider[]> {
  return workerSettings.ready.then(() => sanitizeSiteSearchProviders(workerSettings.get(siteSearchCustom)));
}

function loadDisabledSiteSearchKeys(): Promise<string[]> {
  return workerSettings.ready.then(() => {
    const value = workerSettings.get(siteSearchDisabled);
    const items: unknown[] = Array.isArray(value) ? value : [];
    return items.map((item) => String(item).toLowerCase()).filter(Boolean);
  });
}


function mergeCustomProviders(
  baseItems: readonly SiteSearchProvider[],
  customItems: readonly SiteSearchProvider[]
): SiteSearchProvider[] {
  return SEARCH_UTILS.mergeCustomProviders(baseItems, customItems);
}

function getSiteSearchProviderEntryUrl(provider: SiteSearchProvider | null | undefined, query: unknown): string {
  if (!provider || !provider.template) {
    return '';
  }
  return SEARCH_UTILS.buildSearchUrlFromTemplate(provider.template, query || '');
}

function invalidateSiteSearchProviderCache(): void {
  siteSearchLoadGeneration += 1;
  siteSearchCache = null;
  siteSearchPromise = null;
}

workerSettings.subscribe([siteSearchCustom, siteSearchDisabled], invalidateSiteSearchProviderCache);

function loadSiteSearchProviders(): Promise<SiteSearchProvider[]> {
  if (siteSearchCache) {
    return Promise.resolve(siteSearchCache);
  }
  if (siteSearchPromise) {
    return siteSearchPromise;
  }
  const localUrl = chrome.runtime.getURL('assets/data/site-search.json');
  const fallbackDefaults = SEARCH_UTILS.getDefaultSiteSearchProviders();
  const loadGeneration = siteSearchLoadGeneration;
  const loadTask: Promise<SiteSearchProvider[]> = fetch(localUrl)
    .then((response) => response.json())
    .then((data: unknown) => {
      const items: unknown[] = isRecord(data) && Array.isArray(data.items) ? data.items : [];
      const source = items.length > 0 ? items : fallbackDefaults;
      return sanitizeSiteSearchProviders(source);
    })
    .catch(() => sanitizeSiteSearchProviders(fallbackDefaults))
    .then((items) => Promise.all([loadCustomSiteSearchProviders(), loadDisabledSiteSearchKeys()])
    .then(([customItems, disabledKeys]) => {
      const baseMap = new Map(items.map((item) => [
        String(item && item.key ? item.key : '').toLowerCase(),
        item
      ]));
      const hydratedCustom = customItems.map((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        const builtinKey = String(item && item.builtinKey ? item.builtinKey : '').toLowerCase();
        const baseProvider = baseMap.get(builtinKey || key);
        return {
          ...item,
          action: String(item.action || (baseProvider && baseProvider.action) || '').trim(),
          submitStrategy: String(
            item.submitStrategy || (baseProvider && baseProvider.submitStrategy) || ''
          ).trim()
        };
      });
      const filteredBase = items.filter((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        return key && !disabledKeys.includes(key);
      });
      const merged = mergeCustomProviders(filteredBase, hydratedCustom);
      if (loadGeneration === siteSearchLoadGeneration &&
          siteSearchPromise === loadTask) {
        siteSearchCache = merged;
        return merged;
      }
      return siteSearchCache || [];
    })).catch((error: unknown) => {
      if (loadGeneration === siteSearchLoadGeneration &&
          siteSearchPromise === loadTask) {
        siteSearchPromise = null;
      }
      throw error;
    });
  siteSearchPromise = loadTask;
  return loadTask;
}

function warmSiteSearchProviderIcons(): Promise<SiteSearchProvider[]> {
  return loadSiteSearchProviders().then((providers) => {
    scheduleSiteSearchProviderIconWarmup(providers, '');
    return providers;
  }).catch(() => []);
}


export {
  getSiteSearchProviderEntryUrl,
  invalidateSiteSearchProviderCache,
  isInteractiveSiteSearchProvider,
  loadSiteSearchProviders,
  sanitizeSiteSearchProviders,
  siteSearchCache,
  warmSiteSearchProviderIcons
};
