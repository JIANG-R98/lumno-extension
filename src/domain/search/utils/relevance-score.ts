// The relevance score of a suggestion for a query, the selection boost,
// source ranks and the comparison results are sorted by.
import type {
  BrowserItem,
  SearchQueryContext,
  SearchRankingOptions,
  SearchSuggestion,
  SuggestionLike
} from '../types';
import { normalizeHost } from './direct-navigation';
import { getOwnExtensionUtilityPenalty, getSearchSourceAdjustment, getSearchSuggestionCategoryAdjustment, getSearchSuggestionClusterInfo, getSearchTermCoverageStats, matchesSearchHostSpelling } from './query-intent';
import { buildSearchDedupUrlKey, getSearchSuggestionDisplayTitle } from './result-dedup';
import { SEARCH_POLICY, SEARCH_SELECTION_POLICY } from './search-policy';
import { getNow, normalizeSearchSelectionQuery } from './selection-stats';
import { getSearchDirectNavigationAdjustment } from './suggestion-slate';
import { normalizeSearchText, shouldAllowLooseTextContains, splitSearchTitleTokens } from './text-normalize';
import { getSearchTitleUnitMatch } from './text-matching';

// What a ranking pass scores: a browser page, with the source it came from.
type ScoredItem = Pick<BrowserItem, 'url' | 'title' | 'lastVisitTime' | 'visitCount' | 'typedCount' | 'type' | 'isTopSite'>;

// Selection stats as they come from storage; read defensively.
interface StoredSelectionStats {
  queries?: Record<string, { entries?: Record<string, { lastSelectedAt?: number; count?: number } | undefined> } | undefined>;
}

// Extra fields for createSearchSuggestion; they are copied onto the result.
interface SuggestionExtras {
  favicon?: string;
  reasons?: string[];
  [field: string]: unknown;
}

// How a query word appears in the title: a whole token, a token's start,
// anywhere, or spelled by its units.
function scoreTitleWord(word: string, title: string, titleLower: string, titleTokens: readonly string[], settings: SearchRankingOptions): number {
  if (titleTokens.includes(word)) {
    return 24;
  }
  if (titleTokens.some((token) => token.startsWith(word))) {
    return 14;
  }
  if (shouldAllowLooseTextContains(word) && titleLower.includes(word)) {
    return 8;
  }
  const wordUnitMatch = getSearchTitleUnitMatch(title, word, settings, { skipLiteral: true });
  if (!wordUnitMatch) {
    return 0;
  }
  if (wordUnitMatch.pieces > 1) {
    return 6;
  }
  return wordUnitMatch.exact ? 24 : (wordUnitMatch.anchored ? 16 : 10);
}

function scoreTitleText(title: string, titleLower: string, titleTokens: readonly string[], context: SearchQueryContext, settings: SearchRankingOptions): number {
  let score = 0;
  if (titleLower === context.queryLower) score += 140;
  if (titleLower.startsWith(context.queryLower)) score += 70;
  if (titleTokens.includes(context.queryLower)) score += 45;
  // Pinyin, initials and words spelled across spaces, where the title does
  // not already hold the query as typed.
  const titleUnitMatch = context.unitQuery
    ? getSearchTitleUnitMatch(title, context.unitQuery, settings, { skipLiteral: true })
    : null;
  if (titleUnitMatch) score += titleUnitMatch.score;
  context.queryTerms.forEach((word) => {
    if (word) score += scoreTitleWord(word, title, titleLower, titleTokens, settings);
  });
  if (shouldAllowLooseTextContains(context.queryLower) && titleLower.includes(context.queryLower)) score += 24;
  return score;
}

function readHostLabels(url: string): { hostname: string; hostLabels: string[] } {
  try {
    const hostname = normalizeHost(new URL(url).hostname);
    return { hostname, hostLabels: hostname.split('.').filter(Boolean) };
  } catch (e) {
    return { hostname: '', hostLabels: [] };
  }
}

function scoreHostWord(word: string, hostname: string, hostLabels: readonly string[]): number {
  if (hostLabels.includes(word)) {
    return 28;
  }
  if (hostLabels.some((label) => label.startsWith(word))) {
    return 16;
  }
  return shouldAllowLooseTextContains(word) && hostname.includes(word) ? 8 : 0;
}

function scoreHostText(hostname: string, hostLabels: string[], context: SearchQueryContext): number {
  if (!hostname) {
    return 0;
  }
  let score = 0;
  if (shouldAllowLooseTextContains(context.queryLower) && hostname.includes(context.queryLower)) score += 14;
  if (hostname.startsWith(context.queryLower)) score += 20;
  if (hostLabels.includes(context.queryLower)) {
    score += 42;
  } else if (matchesSearchHostSpelling(hostLabels, context)) {
    score += 28;
  }
  context.queryTerms.forEach((word) => {
    if (word) score += scoreHostWord(word, hostname, hostLabels);
  });
  return score;
}

// The decoded path and its word tokens; nothing for a path that does not decode.
function readPathTokens(url: string): { decodedPathnameLower: string; pathTokens: string[] } {
  try {
    const decodedPathnameLower = decodeURIComponent(String(new URL(url).pathname || '').toLowerCase());
    const pathTokens = decodedPathnameLower.split('/').filter(Boolean)
      .flatMap((segment) => segment.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean));
    return { decodedPathnameLower, pathTokens };
  } catch (e) {
    return { decodedPathnameLower: '', pathTokens: [] };
  }
}

function scorePathWord(word: string, decodedPathnameLower: string, pathTokens: readonly string[]): number {
  if (pathTokens.includes(word)) {
    return 32;
  }
  if (pathTokens.some((token) => token.startsWith(word))) {
    return 18;
  }
  if (shouldAllowLooseTextContains(word) && pathTokens.some((token) => token.includes(word))) {
    return 10;
  }
  return shouldAllowLooseTextContains(word) && decodedPathnameLower.includes(word) ? 8 : 0;
}

// A page on this computer or the local network matches by its title.
function scoreLocalNetworkTitle(hostname: string, titleLower: string, urlLower: string, context: SearchQueryContext, settings: SearchRankingOptions): number {
  if (!hostname || typeof settings.isLocalNetworkHost !== 'function' || !settings.isLocalNetworkHost(hostname)) {
    return 0;
  }
  const loose = shouldAllowLooseTextContains(context.queryLower);
  if (titleLower === context.queryLower) return 60;
  if (titleLower.startsWith(context.queryLower)) return 42;
  if (loose && titleLower.includes(context.queryLower)) return 24;
  return loose && urlLower.includes(context.queryLower) ? 20 : 0;
}

// Recent, frequent and typed visits.
function scoreVisits(item: ScoredItem, now: number): number {
  let score = 0;
  const lastVisitTime = Number(item.lastVisitTime) || 0;
  if (lastVisitTime) {
    const hoursSinceVisit = (now - lastVisitTime) / (1000 * 60 * 60);
    const daysSinceVisit = hoursSinceVisit / 24;
    if (daysSinceVisit < 1) score += 10;
    else if (daysSinceVisit < 7) score += 5;
    else if (daysSinceVisit < 30) score += 2;
    if (hoursSinceVisit < 2) score += 20;
    else if (hoursSinceVisit < 24) score += 14;
    else if (hoursSinceVisit < 72) score += 8;
  }
  const visitCount = Number(item.visitCount) > 0 ? Number(item.visitCount) : 0;
  const typedCount = Number(item.typedCount) > 0 ? Number(item.typedCount) : 0;
  if (visitCount > 0) score += Math.min(18, Math.log2(visitCount + 1) * 4);
  if (typedCount > 0) score += Math.min(12, typedCount * 2);
  return score;
}

const SOURCE_BASE_SCORES: Readonly<Record<string, number>> = Object.freeze({ bookmark: 12, history: 4, topSite: 6 });

function scoreSource(sourceType: string, intentType: unknown): number {
  const base = Object.prototype.hasOwnProperty.call(SOURCE_BASE_SCORES, sourceType) ? SOURCE_BASE_SCORES[sourceType] : 0;
  return base + getSearchSourceAdjustment(sourceType, intentType);
}

function calculateSearchRelevanceScore(
  item: ScoredItem,
  sourceType: string,
  context: SearchQueryContext,
  options?: SearchRankingOptions | null
): number {
  const settings: SearchRankingOptions = options && typeof options === 'object' ? options : {};
  const title = item.title ? String(item.title) : '';
  const titleLower = normalizeSearchText(title);
  const urlLower = item.url.toLowerCase();
  const titleTokens = splitSearchTitleTokens(title);
  const { hostname, hostLabels } = readHostLabels(item.url);
  const { decodedPathnameLower, pathTokens } = readPathTokens(item.url);
  let textScore = scoreTitleText(title, titleLower, titleTokens, context, settings) +
    scoreHostText(hostname, hostLabels, context);
  if (shouldAllowLooseTextContains(context.queryLower) && urlLower.includes(context.queryLower)) textScore += 10;
  if (decodedPathnameLower) {
    context.queryTerms.forEach((word) => {
      if (word) textScore += scorePathWord(word, decodedPathnameLower, pathTokens);
    });
  }
  textScore += scoreLocalNetworkTitle(hostname, titleLower, urlLower, context, settings);
  if (textScore <= 0) {
    return 0;
  }
  const coverageStats = getSearchTermCoverageStats(context, {
    titleLower,
    hostname,
    urlLower,
    titleTokens,
    hostLabels,
    pathTokens,
    matchesTitleUnits: (term: string) => (
      Boolean(getSearchTitleUnitMatch(title, term, settings)) ||
      matchesSearchHostSpelling(hostLabels, context)
    )
  });
  const clusterInfo = getSearchSuggestionClusterInfo(item.url);
  const isGenericBrandDeepTitle = context.intentType === 'brand' && titleLower === context.queryLower && clusterInfo.depth > 0;
  return textScore +
    scoreVisits(item, getNow(settings)) +
    scoreSource(sourceType, context.intentType) +
    getSearchSuggestionCategoryAdjustment(item, context, coverageStats) +
    getSearchDirectNavigationAdjustment(item, sourceType, context, settings) -
    (isGenericBrandDeepTitle ? SEARCH_POLICY.genericBrandDeepTitlePenalty : 0) -
    getOwnExtensionUtilityPenalty(item, {
      hasSettingsIntent: context.hasSettingsIntent,
      isOwnExtensionUrl: settings.isOwnExtensionUrl
    });
}

type SelectionEntry = { lastSelectedAt?: number; count?: number };

// The stats entry for this query and page.
function findSelectionEntry(
  item: SuggestionLike & { url: string },
  context: Pick<SearchQueryContext, 'lookupQuery' | 'queryLower'>,
  stats: StoredSelectionStats
): SelectionEntry | null {
  const queryKey = normalizeSearchSelectionQuery(context.lookupQuery || context.queryLower);
  const bucket = queryKey && stats.queries && stats.queries[queryKey] ? stats.queries[queryKey] : null;
  if (!bucket || !bucket.entries) {
    return null;
  }
  const urlKey = buildSearchDedupUrlKey(item.url);
  return (urlKey && bucket.entries[urlKey]) || null;
}

function positiveSetting(value: unknown, fallback: number): number {
  return Number(value) > 0 ? Number(value) : fallback;
}

function getRecencyBoost(ageDays: number): number {
  if (ageDays < 1) return 64;
  if (ageDays < 7) return 44;
  return ageDays < 30 ? 24 : 10;
}

// A brand query's deep pages are capped, so the site itself stays first.
function capBrandDeepPage(boost: number, item: SuggestionLike & { url: string }, intentType: unknown, settings: SearchRankingOptions): number {
  if (intentType !== 'brand' || getSearchSuggestionClusterInfo(item.url).depth <= 0) {
    return boost;
  }
  return Math.min(boost, positiveSetting(settings.brandDeepSelectionBoostLimit, SEARCH_POLICY.brandDeepSelectionBoostLimit));
}

function getSearchSelectionBoost(
  item: SuggestionLike | null | undefined,
  context: Pick<SearchQueryContext, 'lookupQuery' | 'queryLower' | 'intentType'> | null | undefined,
  stats: StoredSelectionStats | null | undefined,
  options?: SearchRankingOptions | null
): number {
  if (!item || !item.url || !context || !stats || typeof stats !== 'object') {
    return 0;
  }
  const page = { ...item, url: item.url };
  const entry = findSelectionEntry(page, context, stats);
  const lastSelectedAt = Number(entry && entry.lastSelectedAt) || 0;
  if (!entry || !lastSelectedAt) {
    return 0;
  }
  const settings: SearchRankingOptions = options && typeof options === 'object' ? options : {};
  const ageDays = (getNow(settings) - lastSelectedAt) / (1000 * 60 * 60 * 24);
  if (ageDays > positiveSetting(settings.retentionDays, SEARCH_SELECTION_POLICY.retentionDays)) {
    return 0;
  }
  const count = Math.max(1, Number(entry.count) || 1);
  const frequencyBoost = Math.min(256, Math.log2(count + 1) * 64);
  const maxBoost = positiveSetting(settings.maxSelectionBoost, SEARCH_SELECTION_POLICY.maxSelectionBoost);
  return capBrandDeepPage(Math.min(maxBoost, frequencyBoost + getRecencyBoost(ageDays)), page, context.intentType, settings);
}

function getSearchSuggestionSourceRank(suggestion: SuggestionLike | null | undefined): number {
  if (!suggestion) {
    return 0;
  }
  if (suggestion.type === 'bookmark') {
    return 3;
  }
  if (suggestion.type === 'history') {
    return 2;
  }
  if (suggestion.type === 'topSite' || suggestion.isTopSite) {
    return 1;
  }
  return 0;
}

function compareSearchSuggestions(a: SuggestionLike, b: SuggestionLike): number {
  const scoreDiff = (b.score || 0) - (a.score || 0);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }
  const sourceRankDiff = getSearchSuggestionSourceRank(b) - getSearchSuggestionSourceRank(a);
  if (sourceRankDiff !== 0) {
    return sourceRankDiff;
  }
  const visitDiff = (Number(b.visitCount) || 0) - (Number(a.visitCount) || 0);
  if (visitDiff !== 0) {
    return visitDiff;
  }
  const aVisit = a.lastVisitTime || 0;
  const bVisit = b.lastVisitTime || 0;
  return bVisit - aVisit;
}

// A result row; fields in extras are copied onto it and win over the
// ones worked out here.
function createSearchSuggestion(item: ScoredItem, sourceType: string, score: number): SearchSuggestion;
function createSearchSuggestion<E extends SuggestionExtras>(
  item: ScoredItem,
  sourceType: string,
  score: number,
  extras: E
): SearchSuggestion & E;
function createSearchSuggestion(
  item: ScoredItem,
  sourceType: string,
  score: number,
  extras?: SuggestionExtras | null
): SearchSuggestion {
  const suggestion: SearchSuggestion = {
    type: sourceType,
    title: getSearchSuggestionDisplayTitle(item, sourceType),
    url: item.url,
    favicon: extras && extras.favicon ? extras.favicon : '',
    score,
    lastVisitTime: Number(item.lastVisitTime) || 0,
    visitCount: Number(item.visitCount) || 0,
    typedCount: Number(item.typedCount) || 0,
    reasons: extras && Array.isArray(extras.reasons) ? extras.reasons : []
  };
  return extras ? { ...suggestion, ...extras } : suggestion;
}

export {
  calculateSearchRelevanceScore,
  compareSearchSuggestions,
  createSearchSuggestion,
  getSearchSelectionBoost,
  getSearchSuggestionSourceRank
};
export type { ScoredItem, StoredSelectionStats, SuggestionExtras };
