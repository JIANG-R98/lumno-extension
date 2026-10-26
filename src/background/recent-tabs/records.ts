// Reading tabs and stored entries into the tracker's plain-data records.
import type { KeptThumbnailStatus, TabSnapshot, ThumbnailEntry, TrackableTab } from './types';

const DEFAULT_LIMIT = 5;
const STACK_BUFFER_MULTIPLIER = 4;
const DEFAULT_THUMBNAIL_LIMIT = 10;
const DEFAULT_THUMBNAIL_TTL_MS = 1000 * 60 * 60 * 2;
const STATE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getResolvedTabUrl(tab: TrackableTab | null | undefined): string {
  if (!tab || typeof tab !== 'object') {
    return '';
  }
  const directUrl = typeof tab.url === 'string' ? tab.url.trim() : '';
  if (directUrl) {
    return directUrl;
  }
  return typeof tab.pendingUrl === 'string' ? tab.pendingUrl.trim() : '';
}

function defaultShouldIncludeTab(tab: TrackableTab | null | undefined): boolean {
  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number' || tab.incognito === true) {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

// A tab restored from storage, with only the fields of the expected types.
function readStoredTab(value: unknown): (TrackableTab & { visitedAt?: unknown }) | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    id: typeof value.id === 'number' ? value.id : undefined,
    windowId: typeof value.windowId === 'number' ? value.windowId : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
    pendingUrl: typeof value.pendingUrl === 'string' ? value.pendingUrl : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    favIconUrl: typeof value.favIconUrl === 'string' ? value.favIconUrl : undefined,
    lastAccessed: typeof value.lastAccessed === 'number' ? value.lastAccessed : undefined,
    incognito: value.incognito === true,
    visitedAt: value.visitedAt
  };
}


function sanitizeText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: unknown): string {
  return String(value || '').trim();
}

function normalizeThumbnailStatus(value: unknown, fallback: 'ok' | 'missing' = 'missing'): KeptThumbnailStatus | 'missing' {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'ok' ||
      status === 'pending' ||
      status === 'failed' ||
      status === 'restricted') {
    return status;
  }
  return fallback;
}

function readEntryClock(options: { now?: number; ttlMs?: number } | null | undefined): { now: number; ttlMs: number } {
  const opts = options && typeof options === 'object' ? options : {};
  return {
    now: Number.isFinite(Number(opts.now)) ? Number(opts.now) : Date.now(),
    ttlMs: Number.isFinite(Number(opts.ttlMs)) ? Math.max(0, Number(opts.ttlMs)) : DEFAULT_THUMBNAIL_TTL_MS
  };
}

function normalizeThumbnailEntry(
  tabId: unknown,
  raw: unknown,
  options?: { now?: number; ttlMs?: number } | null
): ThumbnailEntry | null {
  const { now, ttlMs } = readEntryClock(options);
  if (typeof tabId !== 'number' || !isRecord(raw)) {
    return null;
  }
  const dataUrl = typeof raw.dataUrl === 'string' ? raw.dataUrl : '';
  const hasImage = dataUrl.startsWith('data:image/');
  const status = normalizeThumbnailStatus(raw.status, hasImage ? 'ok' : 'missing');
  if (status === 'missing' || (status === 'ok' && !hasImage)) {
    return null;
  }
  const capturedAt = Number(raw.capturedAt) || (hasImage ? now : 0);
  const updatedAt = Number(raw.updatedAt) || capturedAt || now;
  if (ttlMs > 0 && (now - updatedAt) > ttlMs) {
    return null;
  }
  return {
    tabId,
    url: normalizeUrl(raw.url),
    dataUrl: hasImage ? dataUrl : '',
    capturedAt,
    updatedAt,
    status,
    reason: sanitizeText(raw.reason)
  };
}

function normalizeTabSnapshot(
  tab: TrackableTab | null | undefined,
  visitedAt: unknown,
  shouldIncludeTab: (tab: TrackableTab) => boolean
): TabSnapshot | null {
  if (!tab || !shouldIncludeTab(tab) || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return null;
  }
  const now = Number.isFinite(Number(visitedAt)) ? Number(visitedAt) : Date.now();
  return {
    id: tab.id,
    windowId: tab.windowId,
    url: getResolvedTabUrl(tab),
    title: sanitizeText(tab.title),
    favIconUrl: typeof tab.favIconUrl === 'string' ? tab.favIconUrl : '',
    lastAccessed: Number(tab.lastAccessed) || now,
    visitedAt: now
  };
}

export {
  DEFAULT_LIMIT,
  DEFAULT_THUMBNAIL_LIMIT,
  DEFAULT_THUMBNAIL_TTL_MS,
  STACK_BUFFER_MULTIPLIER,
  STATE_VERSION,
  defaultShouldIncludeTab,
  getResolvedTabUrl,
  isRecord,
  normalizeTabSnapshot,
  normalizeThumbnailEntry,
  normalizeThumbnailStatus,
  normalizeUrl,
  readStoredTab,
  sanitizeText,
  toPositiveInteger
};
