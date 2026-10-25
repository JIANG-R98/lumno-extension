// Types the recent-site modules share.
import type { RecentSite } from '../../domain/recent-sites-store';

// What a recent card's context menu was opened for.
interface RecentContextTarget {
  item: RecentSite;
  element: HTMLElement;
}

// The browser reads the first recent-sites pass starts, which later passes
// share while they are fresh.
interface StartupRecentSourceReads {
  historyItems: Promise<chrome.history.HistoryItem[] | null>;
  topSites: Promise<chrome.topSites.MostVisitedURL[] | null>;
  tabs: Promise<chrome.tabs.Tab[]>;
}

export type { RecentContextTarget, StartupRecentSourceReads };
