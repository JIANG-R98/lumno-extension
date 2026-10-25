// The site search provider icons saved on this device, read once for the
// page. A change in storage (settings-sync.ts) replaces them and bumps the
// revision, so a read that started before it does not overwrite the newer
// icons when it lands.
import type { CachedIconMap } from '../../domain/favicon/shortcut-favicon';
import type { ShortcutFaviconStore } from '../../platform/shortcut-favicon-store';

interface SiteSearchIconCacheState {
  siteSearchIconCache: CachedIconMap;
  siteSearchIconCacheLoaded: boolean;
  siteSearchIconCacheRevision: number;
  siteSearchIconCacheLoadPromise: Promise<CachedIconMap> | null;
}

interface SiteSearchIconCacheDeps {
  store: Pick<ShortcutFaviconStore, 'readAll'>;
  pageState: SiteSearchIconCacheState;
}

function createSiteSearchIconCache(deps: SiteSearchIconCacheDeps) {
  const { store, pageState } = deps;

  // Resolves with the icons; a failed read leaves none rather than failing.
  function loadSiteSearchIconCache(): Promise<CachedIconMap> {
    if (pageState.siteSearchIconCacheLoaded) {
      return Promise.resolve(pageState.siteSearchIconCache);
    }
    if (pageState.siteSearchIconCacheLoadPromise) {
      return pageState.siteSearchIconCacheLoadPromise;
    }
    const loadRevision = pageState.siteSearchIconCacheRevision;
    const settle = (cache: CachedIconMap): CachedIconMap => {
      if (pageState.siteSearchIconCacheRevision === loadRevision) {
        pageState.siteSearchIconCache = cache;
      }
      pageState.siteSearchIconCacheLoaded = true;
      return pageState.siteSearchIconCache;
    };
    pageState.siteSearchIconCacheLoadPromise = store.readAll()
      .then(settle, (): CachedIconMap => settle({}));
    return pageState.siteSearchIconCacheLoadPromise;
  }

  return { loadSiteSearchIconCache };
}

export { createSiteSearchIconCache };
export type { SiteSearchIconCacheState };
