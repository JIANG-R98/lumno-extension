// The query context a ranking pass shares, and the per-query selection
// stats that boost what was picked before.
import type {
  SearchQueryContext,
  SearchRankingOptions,
  SearchSelection,
  SearchSelectionBucket,
  SearchSelectionEntry,
  SearchSelectionStats,
  SearchSelectionType
} from '../types';
import { classifySearchIntent } from './query-intent';
import { buildSearchDedupUrlKey } from './result-dedup';
import { SEARCH_SELECTION_POLICY } from './search-policy';
import { compactSearchQuery, normalizeSearchText, splitSearchTerms } from './text-normalize';
import { isSearchUnitQueryEligible } from './text-matching';

type SelectionStatsOptions = Pick<SearchRankingOptions, 'now' | 'retentionDays' | 'maxQueries' | 'maxEntriesPerQuery'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const SEARCH_SETTINGS_INTENT_TERMS = new Set([
  'setting',
  'settings',
  'option',
  'options',
  'config',
  'configure',
  'preference',
  'preferences',
  'prefs',
  '设置',
  '选项',
  '配置',
  '偏好',
  '管理'
]);

const SEARCH_INFORMATIONAL_TERMS = new Set([
  'how',
  'what',
  'why',
  'when',
  'where',
  'tutorial',
  'tutorials',
  'guide',
  'guides',
  'learn',
  'docs',
  'doc',
  'help',
  'review',
  'reviews',
  'compare',
  'comparison',
  'price',
  'pricing',
  'news',
  '下载',
  '教程',
  '文档',
  '帮助',
  '对比',
  '价格',
  '评测',
  '为什么',
  '怎么',
  '如何'
]);

function buildSearchQueryContext(query: unknown): SearchQueryContext {
  const lookupQuery = String(query || '');
  const queryLower = normalizeSearchText(lookupQuery).trim();
  // The query as title units spell it ("wxds", "gh ck", "微信 读书"); empty
  // when only plain text matching applies.
  const unitQuery = isSearchUnitQueryEligible(queryLower) ? compactSearchQuery(queryLower) : '';
  const coreQueryTerms = splitSearchTerms(queryLower);
  const queryTerms = splitSearchTerms(queryLower);
  if (queryLower && !queryTerms.includes(queryLower)) {
    queryTerms.unshift(queryLower);
  }
  return {
    lookupQuery,
    queryLower,
    unitQuery,
    coreQueryTerms,
    queryTerms,
    intentType: classifySearchIntent(lookupQuery, queryTerms),
    hasSettingsIntent: queryTerms.some((term) => SEARCH_SETTINGS_INTENT_TERMS.has(term)),
    hasInformationalIntent: queryTerms.some((term) => SEARCH_INFORMATIONAL_TERMS.has(term))
  };
}

function normalizeSearchSelectionQuery(query: unknown): string {
  const value = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return value.length > 120 ? value.slice(0, 120) : value;
}

function normalizeSearchSelectionType(type: unknown): SearchSelectionType {
  const value = String(type || '').trim();
  if (!value) {
    return 'history';
  }
  if (value === 'bookmark' || value === 'topSite' || value === 'history' || value === 'directUrl' || value === 'browserPage' || value === 'autocomplete') {
    return value;
  }
  return 'history';
}

function normalizeSearchSelectionEntry(urlKey: string, entry: unknown, now: number, retentionMs: number): SearchSelectionEntry | null {
  if (!urlKey || !isRecord(entry)) {
    return null;
  }
  const lastSelectedAt = Number(entry.lastSelectedAt) || 0;
  if (!lastSelectedAt || now - lastSelectedAt > retentionMs) {
    return null;
  }
  const url = String(entry.url || '').trim();
  if (!url) {
    return null;
  }
  return {
    url,
    title: String(entry.title || '').trim().slice(0, 180),
    type: normalizeSearchSelectionType(entry.type),
    count: Math.max(1, Math.min(999, Math.floor(Number(entry.count) || 1))),
    lastSelectedAt
  };
}

// Stored stats are read as untrusted input and rebuilt.
function normalizeSearchSelectionStats(rawStats: unknown, options?: SelectionStatsOptions | null): SearchSelectionStats {
  const settings: SelectionStatsOptions = options && typeof options === 'object' ? options : {};
  const now = getNow(settings);
  const retentionDays = Number(settings.retentionDays) > 0
    ? Number(settings.retentionDays)
    : SEARCH_SELECTION_POLICY.retentionDays;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const maxQueries = Number(settings.maxQueries) > 0
    ? Math.floor(Number(settings.maxQueries))
    : SEARCH_SELECTION_POLICY.maxQueries;
  const maxEntriesPerQuery = Number(settings.maxEntriesPerQuery) > 0
    ? Math.floor(Number(settings.maxEntriesPerQuery))
    : SEARCH_SELECTION_POLICY.maxEntriesPerQuery;
  const sourceQueries: Record<string, unknown> = isRecord(rawStats) && isRecord(rawStats.queries)
    ? rawStats.queries
    : {};
  const buckets: Array<[string, SearchSelectionBucket]> = [];

  Object.entries(sourceQueries).forEach(([rawQueryKey, rawBucket]) => {
    const queryKey = normalizeSearchSelectionQuery(rawQueryKey);
    const bucket: Record<string, unknown> = isRecord(rawBucket) ? rawBucket : {};
    const sourceEntries: Record<string, unknown> = isRecord(bucket.entries) ? bucket.entries : {};
    const entries: Record<string, SearchSelectionEntry> = {};
    Object.entries(sourceEntries)
      .map(([urlKey, entry]): [string, SearchSelectionEntry | null] => [urlKey, normalizeSearchSelectionEntry(urlKey, entry, now, retentionMs)])
      .filter((pair): pair is [string, SearchSelectionEntry] => Boolean(pair[1]))
      .sort((a, b) => {
        const lastDiff = b[1].lastSelectedAt - a[1].lastSelectedAt;
        if (lastDiff !== 0) {
          return lastDiff;
        }
        return b[1].count - a[1].count;
      })
      .slice(0, maxEntriesPerQuery)
      .forEach(([urlKey, entry]) => {
        entries[urlKey] = entry;
      });
    if (!queryKey || Object.keys(entries).length === 0) {
      return;
    }
    const updatedAt = Math.max(
      Number(bucket.updatedAt) || 0,
      ...Object.values(entries).map((entry) => Number(entry.lastSelectedAt) || 0)
    );
    buckets.push([queryKey, { updatedAt, entries }]);
  });

  buckets.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const queries: Record<string, SearchSelectionBucket> = {};
  buckets.slice(0, maxQueries).forEach(([queryKey, bucket]) => {
    queries[queryKey] = bucket;
  });
  return {
    version: 1,
    updatedAt: buckets.length > 0 ? buckets[0][1].updatedAt : 0,
    queries
  };
}

function recordSearchSelectionInStats(
  rawStats: unknown,
  selection: SearchSelection | null | undefined,
  options?: SelectionStatsOptions | null
): SearchSelectionStats {
  const settings: SelectionStatsOptions = options && typeof options === 'object' ? options : {};
  const now = getNow(settings);
  const queryKey = normalizeSearchSelectionQuery(selection && selection.query);
  const url = String(selection && selection.url || '').trim();
  if (!queryKey || !url) {
    return normalizeSearchSelectionStats(rawStats, settings);
  }
  const urlKey = buildSearchDedupUrlKey(url);
  if (!urlKey) {
    return normalizeSearchSelectionStats(rawStats, settings);
  }
  const stats = normalizeSearchSelectionStats(rawStats, settings);
  const bucket: SearchSelectionBucket = stats.queries[queryKey] || { updatedAt: 0, entries: {} };
  const existing = bucket.entries[urlKey] || null;
  const picked: SearchSelection = selection || {};
  bucket.entries[urlKey] = {
    url,
    title: String(picked.title || (existing && existing.title) || '').trim().slice(0, 180),
    type: normalizeSearchSelectionType(picked.type || (existing && existing.type)),
    count: Math.max(1, Math.min(999, (Number(existing && existing.count) || 0) + 1)),
    lastSelectedAt: now
  };
  bucket.updatedAt = now;
  stats.queries[queryKey] = bucket;
  stats.updatedAt = now;
  return normalizeSearchSelectionStats(stats, settings);
}

function getNow(options?: Pick<SearchRankingOptions, 'now'> | null): number {
  const settings: Pick<SearchRankingOptions, 'now'> = options && typeof options === 'object' ? options : {};
  return Number(settings.now) || Date.now();
}

export {
  buildSearchQueryContext,
  getNow,
  normalizeSearchSelectionQuery,
  normalizeSearchSelectionStats,
  recordSearchSelectionInStats
};
export type { SelectionStatsOptions };
