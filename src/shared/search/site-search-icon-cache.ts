// The site search provider icons saved on this device, as a surface holds
// them: read once, and replaced whenever the stored copy changes. A change
// bumps the revision, so a read that started before it does not overwrite
// the newer icons when it lands.
import * as SHORTCUT_FAVICON from '../../domain/favicon/shortcut-favicon';
import type { CachedIconMap } from '../../domain/favicon/shortcut-favicon';
import type { ShortcutFaviconStore } from '../../platform/shortcut-favicon-store';

interface SiteSearchIconCacheState {
  siteSearchIconCache: CachedIconMap;
  siteSearchIconCacheLoaded: boolean;
  siteSearchIconCacheRevision: number;
  siteSearchIconCacheLoadPromise: Promise<CachedIconMap> | null;
}

interface SiteSearchIconCacheDeps {
  store: Pick<ShortcutFaviconStore, 'readAll' | 'storageKey' | 'cacheOptions'>;
  state: SiteSearchIconCacheState;
  now?: () => number;
}

function createSiteSearchIconCache(deps: SiteSearchIconCacheDeps) {
  const { store, state } = deps;
  const now = deps.now || Date.now;

  // Resolves with the icons; a failed read leaves none rather than failing.
  function loadSiteSearchIconCache(): Promise<CachedIconMap> {
    if (state.siteSearchIconCacheLoaded) {
      return Promise.resolve(state.siteSearchIconCache);
    }
    if (state.siteSearchIconCacheLoadPromise) {
      return state.siteSearchIconCacheLoadPromise;
    }
    const loadRevision = state.siteSearchIconCacheRevision;
    const settle = (cache: CachedIconMap): CachedIconMap => {
      if (state.siteSearchIconCacheRevision === loadRevision) {
        state.siteSearchIconCache = cache;
      }
      state.siteSearchIconCacheLoaded = true;
      return state.siteSearchIconCache;
    };
    state.siteSearchIconCacheLoadPromise = store.readAll()
      .then(settle, (): CachedIconMap => settle({}));
    return state.siteSearchIconCacheLoadPromise;
  }

  // The stored copy changed (newValue of a storage change): it replaces the
  // icons now, and outranks any read still underway.
  function applyStoredSiteSearchIcons(value: unknown): CachedIconMap {
    const cache = SHORTCUT_FAVICON.normalizeCacheMap(value, now(), store.cacheOptions);
    state.siteSearchIconCache = cache;
    state.siteSearchIconCacheLoaded = true;
    state.siteSearchIconCacheRevision += 1;
    state.siteSearchIconCacheLoadPromise = Promise.resolve(cache);
    return cache;
  }

  return {
    storageKey: store.storageKey,
    loadSiteSearchIconCache,
    applyStoredSiteSearchIcons
  };
}

type SiteSearchIconCache = ReturnType<typeof createSiteSearchIconCache>;

export { createSiteSearchIconCache };
export type { SiteSearchIconCache, SiteSearchIconCacheState };
