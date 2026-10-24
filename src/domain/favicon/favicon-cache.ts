// The persisted favicon caches: favicon URLs, favicon images as data URLs,
// site theme colors, and hosts whose favicon may have changed since a
// visit. Each is stored as one record of entries with their update times;
// reading drops expired and malformed entries and keeps the newest ones.

// Page entries ("page:https://...") written under an older version used
// the host's icon as a fallback, so they are dropped and acquired again.
const PAGE_FAVICON_CACHE_VERSION = 3;

type AccentRgb = [number, number, number];

// Where a site's theme color was found.
type SiteThemeSource = 'brand' | 'mask-icon' | 'meta' | 'manifest' | 'favicon';

// Whether the color reads as a color or as a neutral gray, white or black.
type SiteThemeConfidence = 'color' | 'neutral';

interface FaviconUrlEntry {
  url: string;
  updatedAt: number;
}

interface FaviconDataEntry {
  dataUrl: string;
  updatedAt: number;
}

interface SiteThemeEntry {
  accentRgb: AccentRgb;
  source: SiteThemeSource;
  neutral: boolean;
  confidence: SiteThemeConfidence;
  updatedAt: number;
}

// One stored cache record.
interface FaviconCacheRecord<T> {
  version: number;
  entries: Record<string, T>;
  updatedAt: number;
}

interface FaviconCacheSettings {
  faviconPersistStorageKey: string;
  faviconPersistTtlMs: number;
  faviconPersistMaxEntries: number;
  faviconDataPersistStorageKey: string;
  faviconDataPersistMaxEntries: number;
  // Longest data URL kept, in characters.
  faviconDataPersistMaxLength: number;
  siteThemePersistStorageKey: string;
  siteThemePersistTtlMs: number;
  siteThemePersistMaxEntries: number;
  faviconVisitDirtyStorageKey: string;
  faviconVisitDirtyTtlMs: number;
  faviconVisitDirtyMaxEntries: number;
  // How long a page waits for the caches before resolving icons without them.
  faviconCacheBootWaitMs: number;
}

// How long entries of one cache live and how many are kept.
interface CacheRetention {
  ttlMs: number;
  maxEntries: number;
}

const DEFAULTS: Readonly<FaviconCacheSettings> = Object.freeze({
  faviconPersistStorageKey: '_x_extension_favicon_url_cache_2024_unique_',
  faviconPersistTtlMs: 1000 * 60 * 60 * 24 * 14,
  faviconPersistMaxEntries: 800,
  faviconDataPersistStorageKey: '_x_extension_favicon_data_cache_2024_unique_',
  faviconDataPersistMaxEntries: 220,
  faviconDataPersistMaxLength: 96000,
  siteThemePersistStorageKey: '_x_extension_site_theme_cache_2026_unique_',
  siteThemePersistTtlMs: 1000 * 60 * 60 * 24 * 30,
  siteThemePersistMaxEntries: 800,
  faviconVisitDirtyStorageKey: '_x_extension_favicon_visit_dirty_2026_unique_',
  faviconVisitDirtyTtlMs: 1000 * 60 * 60 * 24,
  faviconVisitDirtyMaxEntries: 600,
  faviconCacheBootWaitMs: 120
});

const DATA_URL_ICON_PATTERN = /^data:image\/(?:png|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg);base64,/i;
const PAGE_ENTRY_PATTERN = /^page:https?:\/\//i;
const THEME_SOURCES: readonly SiteThemeSource[] = Object.freeze(['brand', 'mask-icon', 'meta', 'manifest', 'favicon']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isThemeSource(value: string): value is SiteThemeSource {
  return THEME_SOURCES.some((source) => source === value);
}

function isValidDataUrlIcon(value: unknown, maxLength: number): boolean {
  const raw = String(value || '');
  if (!raw || raw.length > maxLength) {
    return false;
  }
  return DATA_URL_ICON_PATTERN.test(raw);
}

function normalizeAccentRgb(value: unknown): AccentRgb | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const [red, green, blue] = value.map((channel) => Math.round(Number(channel)));
  const rgb: AccentRgb = [red, green, blue];
  if (!rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
    return null;
  }
  return rgb;
}

function normalizeThemeSource(value: unknown): SiteThemeSource | '' {
  const source = String(value || '').trim().toLowerCase();
  return isThemeSource(source) ? source : '';
}

function isNeutralThemeColor(rgb: unknown): boolean {
  const channels = normalizeAccentRgb(rgb);
  if (!channels) {
    return false;
  }
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const range = max - min;
  const saturation = max === 0 ? 0 : range / max;
  return range <= 24 ||
    saturation <= 0.12 ||
    (min >= 235 && max >= 245) ||
    (max <= 36 && min <= 24);
}

function normalizeThemeConfidence(value: unknown, accentRgb: unknown): SiteThemeConfidence {
  const confidence = String(value || '').trim().toLowerCase();
  if (confidence === 'color' || confidence === 'neutral') {
    return confidence;
  }
  return isNeutralThemeColor(accentRgb) ? 'neutral' : 'color';
}

// A theme entry from storage or from a caller, or null when it names no
// usable color.
function normalizeSiteThemeEntry(value: unknown, updatedAt: number): SiteThemeEntry | null {
  const source = isRecord(value) ? value : {};
  const accentRgb = normalizeAccentRgb(source.accentRgb);
  const themeSource = normalizeThemeSource(source.source);
  const confidence = normalizeThemeConfidence(source.confidence, accentRgb);
  if (!accentRgb || !themeSource) {
    return null;
  }
  return {
    accentRgb,
    source: themeSource,
    neutral: typeof source.neutral === 'boolean' ? source.neutral : confidence === 'neutral',
    confidence,
    updatedAt
  };
}

function isSameSiteTheme(left: SiteThemeEntry, right: SiteThemeEntry): boolean {
  return left.source === right.source &&
    left.accentRgb.join(',') === right.accentRgb.join(',') &&
    left.neutral === right.neutral &&
    left.confidence === right.confidence;
}

function isExpired(updatedAt: number, ttlMs: number, now: number): boolean {
  return !Number.isFinite(updatedAt) || now - updatedAt > ttlMs;
}

// The entries of a stored record that `read` accepts and that have not
// expired, newest first.
function readRecordEntries<T extends { updatedAt: number }>(
  record: unknown,
  retention: CacheRetention,
  now: number,
  read: (key: string, value: unknown) => T | null
): Array<[string, T]> {
  const entries = isRecord(record) && isRecord(record.entries) ? record.entries : {};
  const valid: Array<[string, T]> = [];
  for (const [key, value] of Object.entries(entries)) {
    const entry = key ? read(key, value) : null;
    if (entry && !isExpired(entry.updatedAt, retention.ttlMs, now)) {
      valid.push([key, entry]);
    }
  }
  valid.sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  return valid.slice(0, retention.maxEntries);
}

function readUpdatedAt(value: unknown): number {
  return Number(isRecord(value) && value.updatedAt ? value.updatedAt : 0);
}

function isCurrentPageEntry(record: unknown, key: string): boolean {
  return !PAGE_ENTRY_PATTERN.test(key) || (isRecord(record) && record.version === PAGE_FAVICON_CACHE_VERSION);
}

// Data URLs and blocked addresses are never kept as favicon URLs.
function readFaviconUrlRecord(
  record: unknown,
  retention: CacheRetention,
  isRejectedUrl: (url: string) => boolean,
  now: number
): Array<[string, FaviconUrlEntry]> {
  return readRecordEntries(record, retention, now, (key, value) => {
    const url = String(isRecord(value) && value.url ? value.url : '').trim();
    if (!url || url.startsWith('data:') || isRejectedUrl(url) || !isCurrentPageEntry(record, key)) {
      return null;
    }
    return { url, updatedAt: readUpdatedAt(value) };
  });
}

function readFaviconDataRecord(
  record: unknown,
  retention: CacheRetention,
  maxLength: number,
  now: number
): Array<[string, FaviconDataEntry]> {
  return readRecordEntries(record, retention, now, (key, value) => {
    const dataUrl = String(isRecord(value) && value.dataUrl ? value.dataUrl : '').trim();
    if (!isValidDataUrlIcon(dataUrl, maxLength) || !isCurrentPageEntry(record, key)) {
      return null;
    }
    return { dataUrl, updatedAt: readUpdatedAt(value) };
  });
}

function readSiteThemeRecord(record: unknown, retention: CacheRetention, now: number): Array<[string, SiteThemeEntry]> {
  return readRecordEntries(record, retention, now, (_key, value) => normalizeSiteThemeEntry(value, readUpdatedAt(value)));
}

// Hosts mapped to when a visit marked their favicon as possibly changed.
function readVisitDirtyRecord(record: unknown, retention: CacheRetention, now: number): Array<[string, number]> {
  return readRecordEntries(record, retention, now, (_key, value) => ({ updatedAt: Number(value || 0) }))
    .map(([key, entry]) => [key, entry.updatedAt]);
}

// The newest `maxEntries` entries, newest first.
function keepNewest<T extends { updatedAt: number }>(entries: Iterable<[string, T]>, maxEntries: number): Array<[string, T]> {
  return Array.from(entries)
    .sort((left, right) => (right[1].updatedAt || 0) - (left[1].updatedAt || 0))
    .slice(0, maxEntries);
}

function createRecord<T>(version: number, entries: Array<[string, T]>, now: number): FaviconCacheRecord<T> {
  return { version, entries: Object.fromEntries(entries), updatedAt: now };
}

export {
  DEFAULTS,
  PAGE_FAVICON_CACHE_VERSION,
  createRecord,
  isExpired,
  isNeutralThemeColor,
  isSameSiteTheme,
  isValidDataUrlIcon,
  keepNewest,
  normalizeAccentRgb,
  normalizeSiteThemeEntry,
  normalizeThemeConfidence,
  normalizeThemeSource,
  readFaviconDataRecord,
  readFaviconUrlRecord,
  readSiteThemeRecord,
  readVisitDirtyRecord
};
export type {
  AccentRgb,
  CacheRetention,
  FaviconCacheRecord,
  FaviconCacheSettings,
  FaviconDataEntry,
  FaviconUrlEntry,
  SiteThemeConfidence,
  SiteThemeEntry,
  SiteThemeSource
};
