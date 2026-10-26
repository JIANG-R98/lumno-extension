// The tracker's state as plain data, kept across worker restarts.
import { STATE_VERSION, isRecord, normalizeTabSnapshot, normalizeThumbnailEntry, readStoredTab } from './records';
import { getStackSnapshot, trimStack } from './stack';
import { mergeThumbnailEntries, pruneThumbnails } from './thumbnails';
import type { TabSnapshot, ThumbnailEntry, TrackerContext, TrackerState } from './types';

function exportState(ctx: TrackerContext, optionsArg?: { now?: number } | null): TrackerState {
  const opts = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  pruneThumbnails(ctx, now);
  return {
    version: STATE_VERSION,
    savedAt: now,
    stack: getStackSnapshot(ctx),
    thumbnails: Array.from(ctx.thumbnailByTabId.values()).map((entry) => ({ ...entry }))
  };
}

function hydrateState(ctx: TrackerContext, state: unknown, optionsArg?: { now?: number; merge?: boolean } | null): boolean {
  const opts = optionsArg && typeof optionsArg === 'object' ? optionsArg : {};
  const now = Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now();
  const shouldMerge = opts.merge === true;
  if (!isRecord(state)) {
    return false;
  }
  const pendingStack: TabSnapshot[] = shouldMerge ? getStackSnapshot(ctx) : [];
  const pendingThumbnails: Array<[number, ThumbnailEntry]> = shouldMerge
    ? Array.from(ctx.thumbnailByTabId.entries()).map(([tabId, entry]): [number, ThumbnailEntry] => [tabId, { ...entry }])
    : [];
  ctx.recentStack.splice(0, ctx.recentStack.length);
  ctx.thumbnailByTabId.clear();
  const stack: unknown[] = Array.isArray(state.stack) ? state.stack : [];
  const stackItems: unknown[] = shouldMerge ? [...pendingStack, ...stack] : stack;
  stackItems.forEach((item) => {
    const storedTab = readStoredTab(item);
    const snapshot = normalizeTabSnapshot(storedTab, storedTab && storedTab.visitedAt, ctx.shouldIncludeTab);
    if (!snapshot) {
      return;
    }
    if (ctx.recentStack.some((existing) => existing && existing.id === snapshot.id)) {
      return;
    }
    ctx.recentStack.push(snapshot);
  });
  trimStack(ctx);
  const thumbnails: unknown[] = Array.isArray(state.thumbnails) ? state.thumbnails : [];
  thumbnails.forEach((item) => {
    const tabId = Number(isRecord(item) ? item.tabId : undefined);
    if (!Number.isInteger(tabId)) {
      return;
    }
    const entry = normalizeThumbnailEntry(tabId, item, {
      now,
      ttlMs: ctx.thumbnailTtlMs
    });
    if (entry) {
      ctx.thumbnailByTabId.set(tabId, entry);
    }
  });
  pendingThumbnails.forEach(([tabId, item]) => {
    const entry = mergeThumbnailEntries(ctx, tabId, ctx.thumbnailByTabId.get(tabId), item, now);
    if (entry) {
      ctx.thumbnailByTabId.set(tabId, entry);
    }
  });
  pruneThumbnails(ctx, now);
  return true;
}

export {
  exportState,
  hydrateState
};
