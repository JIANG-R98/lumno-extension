// The tab a search from the overlay or New Tab opened, until it loads, so
// its group and the default engine can follow it.
import { getSourceTabGroupContext } from '../browser-urls-service';
import type { TabGroupContext } from '../tab-groups';

let pendingSearchAt = 0;

let pendingSearchTabId: number | null = null;

let pendingSearchGroupContext: TabGroupContext | null = null;

function markPendingSearchTab(tabId: unknown, sourceTab: chrome.tabs.Tab | null | undefined): void {
  pendingSearchAt = Date.now();
  pendingSearchTabId = typeof tabId === 'number' ? tabId : null;
  pendingSearchGroupContext = getSourceTabGroupContext(sourceTab);
}

// The pending search's results tab once it is known.
function setPendingSearchTabId(tabId: number): void {
  pendingSearchTabId = tabId;
}

function clearPendingSearch(): void {
  pendingSearchAt = 0;
  pendingSearchTabId = null;
  pendingSearchGroupContext = null;
}


export { clearPendingSearch, markPendingSearchTab, pendingSearchAt, pendingSearchGroupContext, pendingSearchTabId, setPendingSearchTabId };
