// A thumbnail per tab, with its capture status.
import { normalizeThumbnailEntry, normalizeThumbnailStatus, normalizeUrl, sanitizeText } from './records';
import type { ThumbnailEntry, ThumbnailState, TrackerContext } from './types';

function pruneThumbnails(ctx: TrackerContext, now: number): void {
  const referenceNow = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  Array.from(ctx.thumbnailByTabId.entries()).forEach(([tabId, entry]) => {
    const normalized = normalizeThumbnailEntry(tabId, entry, {
      now: referenceNow,
      ttlMs: ctx.thumbnailTtlMs
    });
    if (!normalized) {
      ctx.thumbnailByTabId.delete(tabId);
    }
  });
  const sortedEntries = Array.from(ctx.thumbnailByTabId.entries())
    .sort((a, b) => {
      const timeA = Number(a[1] && (a[1].updatedAt || a[1].capturedAt)) || 0;
      const timeB = Number(b[1] && (b[1].updatedAt || b[1].capturedAt)) || 0;
      return timeB - timeA;
    });
  sortedEntries.slice(ctx.thumbnailLimit).forEach(([tabId]) => {
    ctx.thumbnailByTabId.delete(tabId);
  });
}


function setThumbnail(ctx: TrackerContext, tabId: unknown, dataUrl: unknown, capturedAt?: number, metadata?: { url?: unknown } | null): boolean {
  if (typeof tabId !== 'number') {
    return false;
  }
  const value = typeof dataUrl === 'string' ? dataUrl : '';
  if (!value || !value.startsWith('data:image/')) {
    ctx.thumbnailByTabId.delete(tabId);
    return false;
  }
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const entry = normalizeThumbnailEntry(tabId, {
    dataUrl: value,
    url: normalizeUrl(meta.url),
    capturedAt: Number(capturedAt) || Date.now(),
    updatedAt: Number(capturedAt) || Date.now(),
    status: 'ok',
    reason: ''
  }, {
    ttlMs: ctx.thumbnailTtlMs
  });
  if (!entry) {
    ctx.thumbnailByTabId.delete(tabId);
    return false;
  }
  ctx.thumbnailByTabId.set(tabId, entry);
  pruneThumbnails(ctx, entry.capturedAt);
  return true;
}

// The existing thumbnail stays while it still shows the tab's page.
function keptThumbnailImage(existing: ThumbnailEntry | null, url: string): ThumbnailEntry | null {
  return existing && existing.dataUrl && (!url || !existing.url || existing.url === url) ? existing : null;
}

function setThumbnailStatus(
  ctx: TrackerContext,
  tabId: unknown,
  status: unknown,
  updatedAt?: number,
  metadata?: { url?: unknown; reason?: unknown } | null
): boolean {
  if (typeof tabId !== 'number') {
    return false;
  }
  const normalizedStatus = normalizeThumbnailStatus(status);
  if (normalizedStatus === 'missing' || normalizedStatus === 'ok') {
    return false;
  }
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const url = normalizeUrl(meta.url);
  const existing = normalizeThumbnailEntry(tabId, ctx.thumbnailByTabId.get(tabId), {
    ttlMs: ctx.thumbnailTtlMs
  });
  const keptImage = keptThumbnailImage(existing, url);
  const entry = normalizeThumbnailEntry(tabId, {
    dataUrl: keptImage ? keptImage.dataUrl : '',
    url: url || (existing ? existing.url : ''),
    capturedAt: keptImage ? keptImage.capturedAt : 0,
    updatedAt: Number(updatedAt) || Date.now(),
    status: normalizedStatus,
    reason: sanitizeText(meta.reason)
  }, {
    ttlMs: ctx.thumbnailTtlMs
  });
  if (!entry) {
    ctx.thumbnailByTabId.delete(tabId);
    return false;
  }
  ctx.thumbnailByTabId.set(tabId, entry);
  pruneThumbnails(ctx, entry.updatedAt);
  return true;
}

function getThumbnailState(ctx: TrackerContext, tabId: number, expectedUrl?: unknown): ThumbnailState {
  const entry = ctx.thumbnailByTabId.get(tabId);
  const normalized = normalizeThumbnailEntry(tabId, entry, {
    ttlMs: ctx.thumbnailTtlMs
  });
  if (!normalized) {
    ctx.thumbnailByTabId.delete(tabId);
    return {
      status: 'missing',
      reason: '',
      dataUrl: '',
      capturedAt: 0,
      updatedAt: 0
    };
  }
  const url = normalizeUrl(expectedUrl);
  if (url && normalized.url && normalized.url !== url) {
    return {
      status: 'stale',
      reason: 'url-mismatch',
      dataUrl: '',
      capturedAt: normalized.capturedAt || 0,
      updatedAt: normalized.updatedAt || normalized.capturedAt || 0
    };
  }
  return {
    status: normalized.status || (normalized.dataUrl ? 'ok' : 'missing'),
    reason: normalized.reason || '',
    dataUrl: normalized.dataUrl || '',
    capturedAt: normalized.capturedAt || 0,
    updatedAt: normalized.updatedAt || normalized.capturedAt || 0
  };
}

function clearThumbnails(ctx: TrackerContext): boolean {
  const hadThumbnails = ctx.thumbnailByTabId.size > 0;
  ctx.thumbnailByTabId.clear();
  return hadThumbnails;
}

function getThumbnail(ctx: TrackerContext, tabId: number, expectedUrl?: unknown): string {
  return getThumbnailState(ctx, tabId, expectedUrl).dataUrl || '';
}


function mergeThumbnailEntries(ctx: TrackerContext, tabId: number, baseEntry: unknown, overlayEntry: unknown, now: number): ThumbnailEntry | null {
  const base = normalizeThumbnailEntry(tabId, baseEntry, {
    now,
    ttlMs: ctx.thumbnailTtlMs
  });
  const overlay = normalizeThumbnailEntry(tabId, overlayEntry, {
    now,
    ttlMs: ctx.thumbnailTtlMs
  });
  if (!base) {
    return overlay;
  }
  if (!overlay) {
    return base;
  }
  const sameTarget = !base.url || !overlay.url || base.url === overlay.url;
  if (!sameTarget || overlay.dataUrl) {
    return overlay;
  }
  if (!base.dataUrl) {
    return overlay;
  }
  return normalizeThumbnailEntry(tabId, {
    ...overlay,
    url: overlay.url || base.url,
    dataUrl: base.dataUrl,
    capturedAt: base.capturedAt,
    updatedAt: Math.max(Number(base.updatedAt) || 0, Number(overlay.updatedAt) || 0)
  }, {
    now,
    ttlMs: ctx.thumbnailTtlMs
  });
}

export {
  clearThumbnails,
  getThumbnail,
  getThumbnailState,
  mergeThumbnailEntries,
  pruneThumbnails,
  setThumbnail,
  setThumbnailStatus
};
