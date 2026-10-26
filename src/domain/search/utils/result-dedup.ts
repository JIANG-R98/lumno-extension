// Deduplicating results: URL keys without tracking parameters, which of
import { getSearchDirectNavigationTitle, getSearchDirectNavigationUrl, getSearchSiteConfig, normalizeHost } from './direct-navigation';
// two duplicates to keep, and merging item lists by URL.

// What dedup reads from a result: browser items and suggestion rows alike.
interface DedupItem {
  id?: string | number;
  url?: string;
  title?: string;
  lastVisitTime?: number;
  typedCount?: number;
  visitCount?: number;
}

const SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES = new Set([
  'entry',
  'reason',
  'ref',
  'ref_src',
  'source',
  'from',
  'from_source',
  'feature',
  'feature_source',
  'campaign',
  'campaign_id',
  'campaign_source',
  'channel',
  'via',
  'trk',
  'track',
  'tracking',
  'tracking_id',
  'spm',
  'si'
]);

function shouldIgnoreSearchDedupQueryParam(paramName: string): boolean {
  const normalized = String(paramName || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.startsWith('utm_') || SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES.has(normalized);
}

// The query a page is told apart by: tracking parameters dropped, the rest
// in a stable order, or none on paths whose parameters never matter.
function getDedupSearch(parsed: URL, normalizedPathname: string): string {
  const siteConfig = getSearchSiteConfig(normalizeHost(parsed.hostname));
  const ignoreAllSearchParamsPaths = siteConfig && siteConfig.ignoreAllSearchParamsPaths
    ? siteConfig.ignoreAllSearchParamsPaths
    : null;
  if (ignoreAllSearchParamsPaths && ignoreAllSearchParamsPaths.has(normalizedPathname)) {
    return '';
  }
  const nextParams = new URLSearchParams();
  Array.from(parsed.searchParams.entries())
    .filter(([key]) => !shouldIgnoreSearchDedupQueryParam(key))
    .sort(([keyA, valueA], [keyB, valueB]) => (keyA === keyB
      ? String(valueA).localeCompare(String(valueB))
      : String(keyA).localeCompare(String(keyB))))
    .forEach(([key, value]) => {
      nextParams.append(key, value);
    });
  return nextParams.toString() ? `?${nextParams.toString()}` : '';
}

function buildSearchDedupUrlKey(url: unknown): string {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    const parsed = new URL(url);
    parsed.protocol = String(parsed.protocol || '').toLowerCase();
    parsed.hostname = normalizeHost(parsed.hostname);
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }
    parsed.hash = '';
    const normalizedPathname = parsed.pathname !== '/'
      ? (parsed.pathname.replace(/\/+$/, '') || '/')
      : '/';
    parsed.pathname = normalizedPathname;
    parsed.search = getDedupSearch(parsed, normalizedPathname);
    return parsed.toString();
  } catch (e) {
    return String(url).trim().toLowerCase();
  }
}

function getStableDirectNavigationTitleForUrl(url: unknown, sourceType: unknown): string {
  if (sourceType === 'bookmark') {
    return '';
  }
  try {
    const parsed = new URL(String(url || '').trim());
    const directTitle = getSearchDirectNavigationTitle(parsed.hostname);
    if (!directTitle) {
      return '';
    }
    return buildSearchDedupUrlKey(url) === buildSearchDedupUrlKey(getSearchDirectNavigationUrl(parsed.hostname))
      ? directTitle
      : '';
  } catch (e) {
    return '';
  }
}

function getSearchSuggestionDisplayTitle(item: DedupItem | null | undefined, sourceType: unknown): string {
  return getStableDirectNavigationTitleForUrl(item && item.url, sourceType) ||
    (item && item.title) ||
    (item && item.url) ||
    '';
}

// What decides between two results for one page, most important first.
const DEDUP_PREFERENCE: ReadonlyArray<(item: DedupItem) => number> = [
  (item) => Number(item && item.lastVisitTime) || 0,
  (item) => Number(item && item.typedCount) || 0,
  (item) => Number(item && item.visitCount) || 0,
  (item) => String(item && item.title || '').trim().length
];

function shouldReplaceDedupedSearchItem(candidate: DedupItem, existing: DedupItem | undefined): boolean {
  if (!existing) {
    return true;
  }
  for (const read of DEDUP_PREFERENCE) {
    const candidateValue = read(candidate);
    const existingValue = read(existing);
    if (candidateValue !== existingValue) {
      return candidateValue > existingValue;
    }
  }
  return false;
}

function normalizeSearchDedupTitle(title: unknown): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchDedupEntryKey(item: DedupItem | null | undefined): string {
  if (!item) {
    return '';
  }
  const urlKey = typeof item.url === 'string' && item.url
    ? buildSearchDedupUrlKey(item.url)
    : '';
  // One page is one result: the same URL seen as history, bookmark, top
  // site or open tab (often under different titles) must merge, not repeat.
  if (urlKey) {
    return `url:${urlKey}`;
  }
  const titleKey = normalizeSearchDedupTitle(item.title);
  if (titleKey) {
    return `title:${titleKey}`;
  }
  return `id:${item.id || ''}:${String(item.title || '').trim()}`;
}

// Lists of results into one, keeping one result per page.
function mergeItemsByUrl<T extends DedupItem>(itemGroups: ReadonlyArray<ReadonlyArray<T | null | undefined> | null | undefined>): T[] {
  const merged: T[] = [];
  const mergedIndexByKey = new Map<string, number>();
  (Array.isArray(itemGroups) ? itemGroups : []).forEach((items) => {
    (Array.isArray(items) ? items : []).forEach((item: T | null | undefined) => {
      if (!item) {
        return;
      }
      const urlKey = buildSearchDedupEntryKey(item);
      const existingIndex = mergedIndexByKey.get(urlKey);
      if (typeof existingIndex === 'number') {
        if (shouldReplaceDedupedSearchItem(item, merged[existingIndex])) {
          merged[existingIndex] = item;
        }
        return;
      }
      mergedIndexByKey.set(urlKey, merged.length);
      merged.push(item);
    });
  });
  return merged;
}

export {
  buildSearchDedupEntryKey,
  buildSearchDedupUrlKey,
  getSearchSuggestionDisplayTitle,
  mergeItemsByUrl
};
export type { DedupItem };
