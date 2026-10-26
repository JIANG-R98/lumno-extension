// The recent-tab switcher's memory: the tabs in the order they were last
// used, with a thumbnail of each, kept across worker restarts as plain data.
import { exportState, hydrateState } from './persistence';
import { DEFAULT_LIMIT, DEFAULT_THUMBNAIL_LIMIT, DEFAULT_THUMBNAIL_TTL_MS, STACK_BUFFER_MULTIPLIER, defaultShouldIncludeTab, toPositiveInteger } from './records';
import { getRecentTabs, getStackSnapshot, recordTab, removeTab, updateTab } from './stack';
import { clearThumbnails, getThumbnail, getThumbnailState, setThumbnail, setThumbnailStatus } from './thumbnails';
import type { RecentTabTracker, RecentTabTrackerOptions, TabSnapshot, ThumbnailEntry, TrackableTab, TrackerContext } from './types';

function createRecentTabTracker(options?: RecentTabTrackerOptions | null): Readonly<RecentTabTracker> {
  const settings = options && typeof options === 'object' ? options : {};
  const limit = toPositiveInteger(settings.limit, DEFAULT_LIMIT);
  const stackLimit = Math.max(limit, limit * STACK_BUFFER_MULTIPLIER);
  const thumbnailLimit = toPositiveInteger(settings.thumbnailLimit, DEFAULT_THUMBNAIL_LIMIT);
  const thumbnailTtlMs = Math.max(0, Number(settings.thumbnailTtlMs) || DEFAULT_THUMBNAIL_TTL_MS);
  const shouldIncludeTab = typeof settings.shouldIncludeTab === 'function'
    ? settings.shouldIncludeTab
    : defaultShouldIncludeTab;
  const recentStack: TabSnapshot[] = [];
  const thumbnailByTabId = new Map<number, ThumbnailEntry>();
  const ctx: TrackerContext = {
    settings,
    limit,
    stackLimit,
    thumbnailLimit,
    thumbnailTtlMs,
    shouldIncludeTab,
    recentStack,
    thumbnailByTabId
  };

  return Object.freeze({
    recordTab: (tab: TrackableTab | null | undefined, visitedAt?: number) => recordTab(ctx, tab, visitedAt),
    updateTab: (tab: TrackableTab | null | undefined, visitedAt?: number) => updateTab(ctx, tab, visitedAt),
    removeTab: (tabId: unknown) => removeTab(ctx, tabId),
    getRecentTabs: <T extends TrackableTab>(tabs: readonly T[] | null | undefined, requestOptions?: { limit?: number } | null) =>
      getRecentTabs(ctx, tabs, requestOptions),
    setThumbnail: (tabId: unknown, dataUrl: unknown, capturedAt?: number, metadata?: { url?: unknown } | null) => setThumbnail(ctx, tabId, dataUrl, capturedAt, metadata),
    setThumbnailStatus: (tabId: unknown, status: unknown, updatedAt?: number, metadata?: { url?: unknown; reason?: unknown } | null) => setThumbnailStatus(ctx, tabId, status, updatedAt, metadata),
    clearThumbnails: () => clearThumbnails(ctx),
    getThumbnailState: (tabId: number, expectedUrl?: unknown) => getThumbnailState(ctx, tabId, expectedUrl),
    getThumbnail: (tabId: number, expectedUrl?: unknown) => getThumbnail(ctx, tabId, expectedUrl),
    getStackSnapshot: () => getStackSnapshot(ctx),
    exportState: (optionsArg?: { now?: number } | null) => exportState(ctx, optionsArg),
    hydrateState: (state: unknown, optionsArg?: { now?: number; merge?: boolean } | null) => hydrateState(ctx, state, optionsArg)
  });
}

export {
  createRecentTabTracker
};
