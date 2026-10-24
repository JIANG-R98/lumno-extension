// Placing search result tabs and running the browser's search in them.

interface RuntimeErrorApi {
  runtime?: { lastError?: { message?: string } | null };
}

interface PlacementChromeApi extends RuntimeErrorApi {
  tabs?: {
    get?(tabId: number, callback: (tab: chrome.tabs.Tab) => void): void;
    query?(queryInfo: { active: boolean; currentWindow: boolean }, callback: (tabs: chrome.tabs.Tab[]) => void): void;
  };
}

interface SearchChromeApi extends RuntimeErrorApi {
  tabs: {
    update(tabId: number, updateProperties: { url: string }, callback: () => void): void;
  };
  search: {
    query(queryInfo: { text: string; tabId: number }, callback: () => void): void;
  };
}

interface TabPlacement {
  sourceTab: chrome.tabs.Tab | null;
  windowId?: number;
  // The tab index to open at; the end of the window when absent.
  index?: number;
}

interface SearchInTabOptions {
  query: string;
  tabId: number;
  fallbackUrl: string;
  // Runs before the fallback URL loads.
  onFallback?: () => void;
}

// Where a result tab opens: next to the source tab, before it, or at the end.
function resolvePlacement(
  chromeApi: PlacementChromeApi | null | undefined,
  sourceTab: chrome.tabs.Tab | null | undefined,
  position: unknown
): Promise<TabPlacement> {
  return new Promise((resolve) => {
    const finish = (tab: chrome.tabs.Tab | null | undefined): void => {
      const context: TabPlacement = { sourceTab: tab || null };
      if (tab && Number.isInteger(tab.windowId)) {
        context.windowId = tab.windowId;
      }
      if ((position === 'afterCurrent' || position === 'beforeCurrent') &&
          tab && Number.isInteger(tab.index) && tab.index >= 0) {
        context.index = tab.index + (position === 'afterCurrent' ? 1 : 0);
      }
      resolve(context);
    };
    if ((position !== 'afterCurrent' && position !== 'beforeCurrent') || !chromeApi || !chromeApi.tabs) {
      finish(sourceTab);
      return;
    }
    const tabs = chromeApi.tabs;
    try {
      if (sourceTab && typeof sourceTab.id === 'number' && typeof tabs.get === 'function') {
        // Refresh the index: tabs can move while search suggestions are loading.
        tabs.get(sourceTab.id, (tab) => {
          finish(chromeApi.runtime && chromeApi.runtime.lastError ? null : tab);
        });
      } else if (!sourceTab && typeof tabs.query === 'function') {
        tabs.query({ active: true, currentWindow: true }, (activeTabs) => {
          finish(chromeApi.runtime && chromeApi.runtime.lastError ? null : activeTabs && activeTabs[0]);
        });
      } else {
        finish(sourceTab);
      }
    } catch (_error) {
      finish(null);
    }
  });
}

// Runs the browser's default search in an already placed tab, or loads the
// fallback search URL there when the search API refuses.
function searchInTab(
  chromeApi: SearchChromeApi,
  options: SearchInTabOptions,
  callback: (result: { ok: boolean; reason?: string }) => void
): void {
  const fallback = (): void => {
    if (typeof options.onFallback === 'function') {
      options.onFallback();
    }
    // Reuse the positioned tab if the browser search API fails.
    try {
      chromeApi.tabs.update(options.tabId, { url: options.fallbackUrl }, () => {
        const error = chromeApi.runtime && chromeApi.runtime.lastError;
        callback({ ok: !error, reason: error ? error.message : '' });
      });
    } catch (error) {
      callback({ ok: false, reason: (error instanceof Error && error.message) || 'tab-update-failed' });
    }
  };
  try {
    chromeApi.search.query({ text: options.query, tabId: options.tabId }, () => {
      if (chromeApi.runtime && chromeApi.runtime.lastError) {
        fallback();
        return;
      }
      callback({ ok: true });
    });
  } catch (_error) {
    fallback();
  }
}

export { resolvePlacement, searchInTab };
export type { PlacementChromeApi, SearchChromeApi, SearchInTabOptions, TabPlacement };
