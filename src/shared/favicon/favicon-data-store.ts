// Icons as data URLs, which the background fetches: the ones already had,
// the requests in flight, and the icon images warmed into the browser's
// cache before a result shows.
import * as LumnoMessaging from '../../platform/messaging';
import type { MessageRuntime } from '../../platform/messaging';
import * as BoundedCache from '../../domain/bounded-cache';

type FaviconDataRequest = (url: string, pageUrl?: string) => Promise<string | null> | string | null;

interface FaviconDataStoreOptions {
  runtime: MessageRuntime | null;
  // Replaces asking the background for an icon's data URL.
  request: FaviconDataRequest | null;
  isBlockedUrl(url: string): boolean;
  // Shared with the surface, which reads them too.
  cache: Map<string, string>;
  pending: Map<string, Promise<string | null>>;
  maxEntries: number;
}

class FaviconDataStore {
  private readonly options: FaviconDataStoreOptions;

  constructor(options: FaviconDataStoreOptions) {
    this.options = options;
  }

  get(url: string): string | undefined {
    return this.options.cache.get(url);
  }

  readonly put = (url: string, dataUrl: string): string => {
    const { cache, maxEntries } = this.options;
    return BoundedCache.setBoundedCacheEntry(cache, url, dataUrl, maxEntries);
  };

  // The icon as a data URL, cached; null when it cannot be had.
  readonly request = (url: string, pageUrl?: string): Promise<string | null> => {
    const { cache, pending, request, isBlockedUrl } = this.options;
    if (!url || url.startsWith('data:') || isBlockedUrl(url)) {
      return Promise.resolve(null);
    }
    if (request) {
      return Promise.resolve(request(url, pageUrl)).catch(() => null);
    }
    const cached = cache.get(url);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    const inFlight = pending.get(url);
    if (inFlight) {
      return inFlight;
    }
    const promise = this.fetch(url, pageUrl);
    pending.set(url, promise);
    return promise;
  };

  private fetch(url: string, pageUrl: string | undefined): Promise<string | null> {
    const { runtime, pending } = this.options;
    return new Promise<string | null>((resolve) => {
      if (!runtime || typeof runtime.sendMessage !== 'function') {
        pending.delete(url);
        resolve(null);
        return;
      }
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'getFaviconData', url: url, pageUrl: pageUrl || '' }, (response) => {
        const dataUrl = response && 'data' in response && typeof response.data === 'string' ? response.data : '';
        if (dataUrl) {
          this.put(url, dataUrl);
        }
        pending.delete(url);
        resolve(dataUrl || null);
      });
    });
  }
}

export type { FaviconDataRequest, FaviconDataStoreOptions };
export { FaviconDataStore };
