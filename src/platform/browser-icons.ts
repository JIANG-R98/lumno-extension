import type { BrowserIconIndex } from '../domain/favicon/types';
// Fills a browser icon index (domain/favicon/favicon-utils.ts) from the
// icons Firefox reports for top sites and open tabs, its only way to share
// its icon cache with extensions.

interface BrowserIconChromeApi {
  topSites: {
    get(options: { includeFavicon: boolean; limit: number }): Promise<Array<{ url?: string; favicon?: string } | null>>;
  };
  tabs: {
    query(queryInfo: Record<string, never>): Promise<Array<{ url?: string; favIconUrl?: string } | null>>;
  };
}

// Tabs go last so their current icons win.
async function loadBrowserIcons(index: BrowserIconIndex, chromeApi: BrowserIconChromeApi): Promise<void> {
  const [sites, tabs] = await Promise.all([
    Promise.resolve().then(() => chromeApi.topSites.get({ includeFavicon: true, limit: 100 })).catch(() => []),
    Promise.resolve().then(() => chromeApi.tabs.query({})).catch(() => [])
  ]);
  for (const site of Array.isArray(sites) ? sites : []) {
    if (site) index.add(site.url, site.favicon);
  }
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (tab) index.add(tab.url, tab.favIconUrl);
  }
}

export { loadBrowserIcons };
export type { BrowserIconChromeApi };
