// The tabs in the order they were last used.
import { getResolvedTabUrl, normalizeTabSnapshot, normalizeUrl, sanitizeText, toPositiveInteger } from './records';
import { getThumbnailState } from './thumbnails';
import type { SwitcherFields, TabSnapshot, TrackableTab, TrackerContext } from './types';

function trimStack(ctx: TrackerContext): void {
  if (ctx.recentStack.length > ctx.stackLimit) {
    ctx.recentStack.splice(ctx.stackLimit);
  }
}


function removeStackEntry(ctx: TrackerContext, tabId: unknown): boolean {
  if (typeof tabId !== 'number') {
    return false;
  }
  const before = ctx.recentStack.length;
  for (let index = ctx.recentStack.length - 1; index >= 0; index -= 1) {
    if (ctx.recentStack[index] && ctx.recentStack[index].id === tabId) {
      ctx.recentStack.splice(index, 1);
    }
  }
  return ctx.recentStack.length !== before;
}

function removeTab(ctx: TrackerContext, tabId: unknown): boolean {
  if (typeof tabId !== 'number') {
    return false;
  }
  const didRemoveStackEntry = removeStackEntry(ctx, tabId);
  const didRemoveThumbnail = ctx.thumbnailByTabId.delete(tabId);
  return didRemoveStackEntry || didRemoveThumbnail;
}

function recordTab(ctx: TrackerContext, tab: TrackableTab | null | undefined, visitedAt?: number): TabSnapshot | null {
  const snapshot = normalizeTabSnapshot(tab, visitedAt, ctx.shouldIncludeTab);
  if (!snapshot) {
    if (tab && typeof tab.id === 'number') {
      removeTab(ctx, tab.id);
    }
    return null;
  }
  removeStackEntry(ctx, snapshot.id);
  ctx.recentStack.unshift(snapshot);
  trimStack(ctx);
  return snapshot;
}

function updateTab(ctx: TrackerContext, tab: TrackableTab | null | undefined, visitedAt?: number): TabSnapshot | null {
  if (!tab || typeof tab.id !== 'number') {
    return null;
  }
  const existingIndex = ctx.recentStack.findIndex((item) => item && item.id === tab.id);
  if (existingIndex < 0) {
    return null;
  }
  const previous = ctx.recentStack[existingIndex];
  const snapshot = normalizeTabSnapshot(tab, visitedAt || previous.visitedAt, ctx.shouldIncludeTab);
  if (!snapshot) {
    removeTab(ctx, tab.id);
    return null;
  }
  if (normalizeUrl(previous.url) !== normalizeUrl(snapshot.url)) {
    ctx.thumbnailByTabId.delete(tab.id);
  }
  ctx.recentStack[existingIndex] = {
    ...previous,
    ...snapshot,
    visitedAt: previous.visitedAt
  };
  return ctx.recentStack[existingIndex];
}

function getRecentTabs<T extends TrackableTab>(
  ctx: TrackerContext,
  tabs: readonly T[] | null | undefined,
  requestOptions?: { limit?: number } | null
): Array<T & SwitcherFields> {
  const request = requestOptions && typeof requestOptions === 'object' ? requestOptions : {};
  const requestedLimit = toPositiveInteger(request.limit, ctx.limit);
  const tabList: readonly T[] = Array.isArray(tabs) ? tabs : [];
  const tabById = new Map<number, T & { url: string }>();
  tabList.forEach((tab) => {
    if (tab && typeof tab.id === 'number' && ctx.shouldIncludeTab(tab)) {
      tabById.set(tab.id, {
        ...tab,
        url: getResolvedTabUrl(tab)
      });
    }
  });

  const results: Array<T & SwitcherFields> = [];
  const seenIds = new Set<number>();
  ctx.recentStack.forEach((snapshot) => {
    if (!snapshot || seenIds.has(snapshot.id)) {
      return;
    }
    const liveTab = tabById.get(snapshot.id);
    if (!liveTab) {
      return;
    }
    seenIds.add(snapshot.id);
    const thumbnailState = getThumbnailState(ctx, snapshot.id, getResolvedTabUrl(liveTab) || snapshot.url);
    results.push({
      ...snapshot,
      ...liveTab,
      url: getResolvedTabUrl(liveTab) || snapshot.url,
      title: sanitizeText(liveTab.title) || snapshot.title,
      favIconUrl: liveTab.favIconUrl || snapshot.favIconUrl || '',
      _xSwitcherVisitedAt: snapshot.visitedAt,
      _xSwitcherThumbnail: thumbnailState.dataUrl,
      _xSwitcherThumbnailStatus: thumbnailState.status,
      _xSwitcherThumbnailReason: thumbnailState.reason
    });
  });

  if (results.length < requestedLimit) {
    tabList
      .filter((tab): tab is T & { id: number } => (
        Boolean(tab) && typeof tab.id === 'number' && !seenIds.has(tab.id) && ctx.shouldIncludeTab(tab)
      ))
      .slice()
      .sort((a, b) => {
        const accessA = Number(a.lastAccessed) || 0;
        const accessB = Number(b.lastAccessed) || 0;
        return accessB - accessA;
      })
      .forEach((tab) => {
        if (results.length >= requestedLimit || seenIds.has(tab.id)) {
          return;
        }
        seenIds.add(tab.id);
        const thumbnailState = getThumbnailState(ctx, tab.id, getResolvedTabUrl(tab));
        results.push({
          ...tab,
          url: getResolvedTabUrl(tab),
          title: sanitizeText(tab.title),
          favIconUrl: tab.favIconUrl || '',
          _xSwitcherVisitedAt: Number(tab.lastAccessed) || 0,
          _xSwitcherThumbnail: thumbnailState.dataUrl,
          _xSwitcherThumbnailStatus: thumbnailState.status,
          _xSwitcherThumbnailReason: thumbnailState.reason
        });
      });
  }

  return results.slice(0, requestedLimit);
}


function getStackSnapshot(ctx: TrackerContext): TabSnapshot[] {
  return ctx.recentStack.map((item) => ({ ...item }));
}

export {
  getRecentTabs,
  getStackSnapshot,
  recordTab,
  removeStackEntry,
  removeTab,
  trimStack,
  updateTab
};
