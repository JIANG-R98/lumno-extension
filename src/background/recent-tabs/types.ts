// The shapes of the recent-tab switcher's memory.
import type { TabSwitcherThumbnailStatus } from '../../domain/messages';

// The tab fields the tracker reads; chrome.tabs.Tab has them all.
interface TrackableTab {
  id?: number;
  windowId?: number;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  lastAccessed?: number;
  incognito?: boolean;
}

// A tab as it was last seen.
interface TabSnapshot {
  id: number;
  windowId: number;
  url: string;
  title: string;
  favIconUrl: string;
  lastAccessed: number;
  // When the person last switched to it.
  visitedAt: number;
}

// The thumbnail states a capture leaves behind; 'missing' and 'stale' are
// only ever reported, never kept.
type KeptThumbnailStatus = 'ok' | 'pending' | 'failed' | 'restricted';

interface ThumbnailEntry {
  tabId: number;
  // The page the thumbnail shows.
  url: string;
  dataUrl: string;
  capturedAt: number;
  updatedAt: number;
  status: KeptThumbnailStatus;
  reason: string;
}

interface ThumbnailState {
  status: TabSwitcherThumbnailStatus;
  reason: string;
  dataUrl: string;
  capturedAt: number;
  updatedAt: number;
}

// The fields getRecentTabs adds to each tab.
interface SwitcherFields {
  url: string;
  title: string;
  favIconUrl: string;
  _xSwitcherVisitedAt: number;
  _xSwitcherThumbnail: string;
  _xSwitcherThumbnailStatus: TabSwitcherThumbnailStatus;
  _xSwitcherThumbnailReason: string;
}

interface TrackerState {
  version: number;
  savedAt: number;
  stack: TabSnapshot[];
  thumbnails: ThumbnailEntry[];
}

interface RecentTabTrackerOptions {
  limit?: number;
  thumbnailLimit?: number;
  thumbnailTtlMs?: number;
  shouldIncludeTab?: (tab: TrackableTab) => boolean;
}

interface RecentTabTracker {
  recordTab(tab: TrackableTab | null | undefined, visitedAt?: number): TabSnapshot | null;
  updateTab(tab: TrackableTab | null | undefined, visitedAt?: number): TabSnapshot | null;
  removeTab(tabId: unknown): boolean;
  getRecentTabs<T extends TrackableTab>(tabs: readonly T[] | null | undefined, requestOptions?: { limit?: number } | null): Array<T & SwitcherFields>;
  setThumbnail(tabId: unknown, dataUrl: unknown, capturedAt?: number, metadata?: { url?: unknown } | null): boolean;
  setThumbnailStatus(tabId: unknown, status: unknown, updatedAt?: number, metadata?: { url?: unknown; reason?: unknown } | null): boolean;
  clearThumbnails(): boolean;
  getThumbnailState(tabId: number, expectedUrl?: unknown): ThumbnailState;
  getThumbnail(tabId: number, expectedUrl?: unknown): string;
  getStackSnapshot(): TabSnapshot[];
  exportState(options?: { now?: number } | null): TrackerState;
  hydrateState(state: unknown, options?: { now?: number; merge?: boolean } | null): boolean;
}

interface FocusResult {
  ok: boolean;
  tabId?: number;
  windowId?: number | null;
  reason?: string;
}


interface TrackerContext {
  readonly settings: RecentTabTrackerOptions;
  readonly limit: number;
  readonly stackLimit: number;
  readonly thumbnailLimit: number;
  readonly thumbnailTtlMs: number;
  readonly shouldIncludeTab: (tab: TrackableTab) => boolean;
  readonly recentStack: TabSnapshot[];
  readonly thumbnailByTabId: Map<number, ThumbnailEntry>;
}

export type {
  FocusResult,
  KeptThumbnailStatus,
  RecentTabTracker,
  RecentTabTrackerOptions,
  SwitcherFields,
  TabSnapshot,
  ThumbnailEntry,
  ThumbnailState,
  TrackableTab,
  TrackerContext,
  TrackerState
};
