// Marks recorded on visits that a site's favicon may have changed, so New Tab
// refreshes it.
import { normalizeHost, workerSettings } from '../worker-context';
import { faviconVisitDirty } from '../../domain/settings/search';

import { shouldBlockFaviconForHost } from './candidates';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}


const FAVICON_VISIT_DIRTY_TTL_MS = 1000 * 60 * 60 * 24;

const FAVICON_VISIT_DIRTY_MAX_ENTRIES = 600;

const faviconVisitDirtyWriteDebounceMs = 400;

const faviconVisitDirtyMarkThrottleMs = 2 * 60 * 1000;

// Pending dirty marks; losing them only delays a favicon refresh.
const faviconVisitDirtyMarkCache = new Map<string, number>();

let faviconVisitDirtyPersistTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeFaviconVisitDirtyHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  return normalizeHost(String(hostname).trim());
}


function getValidFaviconVisitDirtyEntries(rawEntries: unknown): Array<{ key: string; updatedAt: number }> {
  const now = Date.now();
  const input = isRecord(rawEntries) ? rawEntries : {};
  const valid: Array<{ key: string; updatedAt: number }> = [];
  Object.keys(input).forEach((key) => {
    const updatedAt = Number(input[key] || 0);
    if (!key || !Number.isFinite(updatedAt)) {
      return;
    }
    if (now - updatedAt > FAVICON_VISIT_DIRTY_TTL_MS) {
      return;
    }
    valid.push({ key, updatedAt });
  });
  valid.sort((a, b) => b.updatedAt - a.updatedAt);
  return valid.slice(0, FAVICON_VISIT_DIRTY_MAX_ENTRIES);
}

function schedulePersistFaviconVisitDirtyHost(hostname: string): void {
  const host = normalizeFaviconVisitDirtyHost(hostname);
  if (!host) {
    return;
  }
  const now = Date.now();
  const lastMarkedAt = Number(faviconVisitDirtyMarkCache.get(host) || 0);
  if (lastMarkedAt && (now - lastMarkedAt) < faviconVisitDirtyMarkThrottleMs) {
    return;
  }
  faviconVisitDirtyMarkCache.set(host, now);
  if (faviconVisitDirtyPersistTimer !== null) {
    clearTimeout(faviconVisitDirtyPersistTimer);
  }
  faviconVisitDirtyPersistTimer = setTimeout(() => {
    faviconVisitDirtyPersistTimer = null;
    void workerSettings.ready.then(() => {
      const payload = workerSettings.getStored(faviconVisitDirty);
      const existing = getValidFaviconVisitDirtyEntries(isRecord(payload) && payload.entries ? payload.entries : null);
      const merged = new Map(existing.map((item) => [item.key, item.updatedAt]));
      faviconVisitDirtyMarkCache.forEach((updatedAt, key) => {
        merged.set(key, updatedAt);
      });
      const serializedEntries = Array.from(merged.entries())
        .map(([key, updatedAt]) => ({
          key: String(key || ''),
          updatedAt: Number(updatedAt || 0)
        }))
        .filter((item) => item.key && Number.isFinite(item.updatedAt))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, FAVICON_VISIT_DIRTY_MAX_ENTRIES);
      const serialized: Record<string, number> = {};
      serializedEntries.forEach((item) => {
        serialized[item.key] = item.updatedAt;
      });
      void workerSettings.set(faviconVisitDirty, {
        version: 1,
        entries: serialized,
        updatedAt: Date.now()
      }).then(() => {
        faviconVisitDirtyMarkCache.clear();
      }, () => {});
    });
  }, faviconVisitDirtyWriteDebounceMs);
}

function markFaviconDirtyForUrl(url: unknown): void {
  if (!url) {
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch (_error) {
    return;
  }
  if (!/^https?:$/i.test(parsed.protocol)) {
    return;
  }
  const host = normalizeFaviconVisitDirtyHost(parsed.hostname);
  if (!host || shouldBlockFaviconForHost(host)) {
    return;
  }
  schedulePersistFaviconVisitDirtyHost(host);
}

export {
  FAVICON_VISIT_DIRTY_MAX_ENTRIES,
  FAVICON_VISIT_DIRTY_TTL_MS,
  faviconVisitDirtyMarkCache,
  faviconVisitDirtyMarkThrottleMs,
  faviconVisitDirtyPersistTimer,
  faviconVisitDirtyWriteDebounceMs,
  getValidFaviconVisitDirtyEntries,
  isRecord,
  markFaviconDirtyForUrl,
  normalizeFaviconVisitDirtyHost,
  schedulePersistFaviconVisitDirtyHost
};
