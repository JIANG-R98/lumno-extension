import type { BrowserIconIndex } from './types';

// Firefox has no _favicon endpoint, and blocks page-icon:/cached-favicon:
// for extensions. Its cached icons reach extension pages only through open
// tabs (favIconUrl) and topSites({ includeFavicon }); this indexes them
// (platform/browser-icons.ts fills it). An exact page wins; otherwise the
// latest icon seen for the same host.
function createBrowserIconIndex(): Readonly<BrowserIconIndex> {
  const byPage = new Map<string, string>();
  const byHost = new Map<string, string>();
  const getPageKey = (url: unknown): string => {
    try {
      const parsed = new URL(String(url || ''));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      parsed.hash = '';
      return parsed.href;
    } catch (_error) {
      return '';
    }
  };
  const getHostKey = (pageKey: string): string => {
    try {
      return new URL(pageKey).hostname.toLowerCase().replace(/^www\./, '');
    } catch (_error) {
      return '';
    }
  };
  // Firefox hands these out as data: URLs read from its own icon cache.
  // Anything else would be a request to the site, which automatic sources
  // never make (see resolveFaviconSource).
  const isUsableIconUrl = (iconUrl: unknown): boolean => /^data:image\//i.test(String(iconUrl || ''));
  function add(pageUrl: unknown, iconUrl: unknown): void {
    const pageKey = getPageKey(pageUrl);
    if (!pageKey || !isUsableIconUrl(iconUrl)) {
      return;
    }
    byPage.set(pageKey, String(iconUrl));
    const hostKey = getHostKey(pageKey);
    if (hostKey) {
      byHost.set(hostKey, String(iconUrl));
    }
  }
  function get(pageUrl: unknown): string {
    const pageKey = getPageKey(pageUrl);
    if (!pageKey) {
      return '';
    }
    return byPage.get(pageKey) || byHost.get(getHostKey(pageKey)) || '';
  }
  return Object.freeze({ add, get });
}

export {
  createBrowserIconIndex
};
