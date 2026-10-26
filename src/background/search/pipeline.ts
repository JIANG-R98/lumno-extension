// A local search for the overlay and New Tab: reads the sources the reader
// keeps on, collects one row per page, ranks them, and falls back to other
// keyboard layouts when nothing matched.
import * as FAVICON_UTILS from '../../domain/favicon/favicon-utils';
import type { BlacklistRule } from '../../domain/blacklist-utils';
import * as SEARCH_UTILS from '../../domain/search/search-utils';
import type {
  SearchPolicy,
  SearchQueryContext,
  SearchRankingOptions,
  SearchSelectionStats,
  SearchSourceType
} from '../../domain/search/types';
import { isOwnExtensionUrl } from '../browser-urls-service';
import { loadFaviconEnhancedFetchEnabled, loadFaviconRequestBlacklistItems } from '../favicon-service';
import { normalizeHost } from '../worker-context';
import { filterBlacklistedSuggestions, isUrlBlockedBySearchBlacklist, loadSearchBlacklistItems } from './blacklist';
import { isSearchEngineResultUrl } from './default-engine';
import { getKeyboardLayoutSuggestions } from './keyboard-layout';
import {
  LOCAL_SUGGEST_SOURCE_TIMEOUT_MS,
  callChromeApiWithTimeout,
  ensureLocalSearchSourceCacheListeners,
  getCachedBookmarkItemsOrWarm,
  getCachedBookmarkNodeMap,
  getCachedFallbackHistoryItemsOrWarm,
  getCachedHanTitleHistoryItemsOrWarm,
  getOpenTabSearchItems,
  getTopSitesCached
} from './local-sources';
import { loadSearchSelectionStats } from './selection-stats';
import { buildBookmarkPath, buildSearchSuggestionFavicon, buildSuggestionReasons } from './suggestion-rows';
import { SuggestionSet, takeRankedUniqueRows } from './suggestion-set';
import {
  attachSuggestionTitleHighlight,
  buildBackgroundSearchQueryContext,
  getBackgroundSearchPolicy,
  getTitleTextMatcher,
  loadSearchFuzzyPinyinEnabled,
  loadSearchResultSourceTypes
} from './text-matching';
import type { BookmarkItem, OpenTabItem, SearchSuggestionOptions, SourceItem, SuggestionRow } from './types';

// The matches of each source for one query.
interface SourceMatches {
  history: SourceItem[];
  topSites: SourceItem[];
  bookmarks: SourceItem[];
  openTabs: Promise<OpenTabItem[]>;
  blacklist: BlacklistRule[];
  selectionStats: SearchSelectionStats;
}

interface SearchRun {
  context: SearchQueryContext;
  policy: Readonly<SearchPolicy>;
  scoreOptions: SearchRankingOptions;
  sourceTypes: SearchSourceType[];
  options: SearchSuggestionOptions;
}

// The source types the reader keeps on, narrowed to those the request asks for.
async function readSourceTypes(options: SearchSuggestionOptions): Promise<SearchSourceType[]> {
  const [configured] = await Promise.all([loadSearchResultSourceTypes(), loadSearchFuzzyPinyinEnabled()]);
  const requested: unknown[] = Array.isArray(options.sourceTypes) ? options.sourceTypes : [];
  const requestedTypes = requested
    .map((item) => String(item || '').trim())
    .filter((item, index, items): item is SearchSourceType => (
      (item === 'topSite' || item === 'bookmark' || item === 'history') && items.indexOf(item) === index
    ));
  return requestedTypes.length > 0 ? configured.filter((type) => requestedTypes.includes(type)) : configured;
}

function searchHistory(context: SearchQueryContext, policy: Readonly<SearchPolicy>): Promise<chrome.history.HistoryItem[]> {
  const now = Date.now();
  return callChromeApiWithTimeout<chrome.history.HistoryItem[]>((done) => {
    chrome.history.search({
      text: context.lookupQuery,
      maxResults: policy.lookupMaxResults || 120,
      startTime: now - (policy.lookupWindowDays * 24 * 60 * 60 * 1000),
      endTime: now
    }, done);
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS);
}

function searchBookmarks(context: SearchQueryContext): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return callChromeApiWithTimeout<chrome.bookmarks.BookmarkTreeNode[]>((done) => {
    chrome.bookmarks.search({ query: context.lookupQuery }, done);
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS);
}

// Reads every source the search uses and keeps what matches the query. The
// browser's own searches and the cached full lists are merged, so a title
// matched by pinyin or initials is found too.
async function readSourceMatches(run: SearchRun): Promise<SourceMatches> {
  const { context, policy, sourceTypes, options } = run;
  const allowHistory = sourceTypes.includes('history');
  const allowBookmarks = sourceTypes.includes('bookmark');
  const none = <T>(): Promise<T[]> => Promise.resolve([]);
  const openTabs = options.includeOpenTabs !== false ? getOpenTabSearchItems() : none<OpenTabItem>();
  const [history, topSites, bookmarks, fallbackHistory, allBookmarks, hanTitleHistory, blacklist, , , selectionStats] = await Promise.all([
    allowHistory ? searchHistory(context, policy) : none<chrome.history.HistoryItem>(),
    sourceTypes.includes('topSite') ? getTopSitesCached() : none<chrome.topSites.MostVisitedURL>(),
    allowBookmarks ? searchBookmarks(context) : none<chrome.bookmarks.BookmarkTreeNode>(),
    allowHistory ? getCachedFallbackHistoryItemsOrWarm(policy) : none<chrome.history.HistoryItem>(),
    allowBookmarks ? getCachedBookmarkItemsOrWarm() : none<BookmarkItem>(),
    allowHistory && /[a-z]/.test(context.unitQuery || '') ? getCachedHanTitleHistoryItemsOrWarm(policy) : none<chrome.history.HistoryItem>(),
    loadSearchBlacklistItems(),
    loadFaviconRequestBlacklistItems(),
    loadFaviconEnhancedFetchEnabled(),
    loadSearchSelectionStats()
  ]);
  const collect = <T extends SourceItem>(items: readonly T[]): T[] => SEARCH_UTILS.collectSearchMatches(items, context, blacklist, {
    titleMatcher: run.scoreOptions.titleMatcher,
    isUrlBlockedBySearchBlacklist
  });
  const merge = SEARCH_UTILS.mergeItemsByUrl;
  const fallbackHistoryMatches = collect(merge([fallbackHistory, hanTitleHistory]));
  return {
    history: collect(merge([Array.isArray(history) ? history : [], fallbackHistoryMatches])),
    topSites: collect(topSites),
    bookmarks: collect(merge<SourceItem>([Array.isArray(bookmarks) ? bookmarks : [], collect(allBookmarks)])),
    openTabs,
    blacklist,
    selectionStats
  };
}

// Top sites rank a little higher, more so when the query starts their host
// or their title.
function getTopSiteScoreAdjustment(site: SourceItem & { url: string }, queryLower: string): number {
  let scoreAdjustment = 4;
  try {
    if (normalizeHost(new URL(site.url).hostname).startsWith(queryLower)) {
      scoreAdjustment += 8;
    }
  } catch (_error) {
    // Ignore invalid URLs.
  }
  if ((site.title ? site.title.toLowerCase() : '').startsWith(queryLower)) {
    scoreAdjustment += 6;
  }
  return scoreAdjustment;
}

async function collectSuggestions(run: SearchRun, matches: SourceMatches): Promise<SuggestionSet> {
  const { context, scoreOptions } = run;
  const set = new SuggestionSet({ context, scoreOptions, selectionStats: matches.selectionStats });
  matches.history.forEach((item) => {
    if (item && item.title && !isSearchEngineResultUrl(item.url)) {
      set.upsert(item, 'history');
    }
  });
  matches.topSites.forEach((site) => {
    if (!site || !site.url || isUrlBlockedBySearchBlacklist(site.url, matches.blacklist) || set.markTopSite(site)) {
      return;
    }
    set.upsert(site, 'topSite', { isTopSite: true, scoreAdjustment: getTopSiteScoreAdjustment({ ...site, url: site.url }, context.queryLower) });
  });
  const nodeMap = matches.bookmarks.length > 0 ? getCachedBookmarkNodeMap() : new Map();
  matches.bookmarks.forEach((bookmark) => {
    if (bookmark && bookmark.url) {
      set.upsert(bookmark, 'bookmark', { path: buildBookmarkPath(bookmark, nodeMap), scoreAdjustment: 4 });
    }
  });
  const openTabMatches = SEARCH_UTILS.collectSearchMatches(await matches.openTabs, context, matches.blacklist, {
    titleMatcher: scoreOptions.titleMatcher,
    isUrlBlockedBySearchBlacklist
  });
  openTabMatches.forEach((item) => set.upsertOpenTab(item));
  const brandDirect = SEARCH_UTILS.buildSearchBrandDirectSuggestion(set.rows, context, {
    ...scoreOptions,
    buildFavicon: buildSearchSuggestionFavicon,
    buildReasons: (item, sourceType) => buildSuggestionReasons(item, sourceType, context, scoreOptions)
  });
  if (brandDirect) {
    set.putRow({ ...brandDirect });
  }
  return set;
}

async function getSearchSuggestions(query: unknown, options?: SearchSuggestionOptions | null): Promise<SuggestionRow[]> {
  const requestOptions: SearchSuggestionOptions = options && typeof options === 'object' ? options : {};
  ensureLocalSearchSourceCacheListeners();
  const policy = getBackgroundSearchPolicy(SEARCH_UTILS);
  const context = buildBackgroundSearchQueryContext(query, SEARCH_UTILS);
  if (!context.queryLower) {
    return [];
  }
  const scoreOptions: SearchRankingOptions = {
    titleMatcher: getTitleTextMatcher() || undefined,
    isLocalNetworkHost: FAVICON_UTILS.isLocalNetworkHost,
    isOwnExtensionUrl
  };
  const sourceTypes = await readSourceTypes(requestOptions);
  const run: SearchRun = { context, policy, scoreOptions, sourceTypes, options: requestOptions };
  try {
    const matches = await readSourceMatches(run);
    const set = await collectSuggestions(run, matches);
    let rows = filterBlacklistedSuggestions(takeRankedUniqueRows(set.rows, policy.candidatePoolLimit || 20), matches.blacklist);
    rows = SEARCH_UTILS.filterSearchSuggestionsBySourceTypes(rows, sourceTypes);
    rows = SEARCH_UTILS.applySearchSuggestionHostDiversity(rows, { context });
    if (rows.length === 0 && requestOptions.keyboardLayoutRetry !== false) {
      return getKeyboardLayoutSuggestions(context, requestOptions, policy, getSearchSuggestions);
    }
    return rows.map((row) => attachSuggestionTitleHighlight(row, context, scoreOptions, SEARCH_UTILS));
  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return [];
  }
}

export { getSearchSuggestions };
