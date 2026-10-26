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
import { getSearchTitleUnitMatch } from './text-matching';
import { normalizeSearchText, shouldAllowLooseTextContains, splitSearchTitleTokens } from './text-normalize';

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
  let hostname = '';
  let hostLabels: string[] = [];
  let titleTokens: string[] = [];
  const pathTokens: string[] = [];
  let textScore = 0;
  let behaviorScore = 0;
  let sourceScore = 0;
  const now = getNow(settings);
  const clusterInfo = getSearchSuggestionClusterInfo(item.url);
  const isGenericBrandDeepTitle = Boolean(
    context &&
    context.intentType === 'brand' &&
    titleLower === context.queryLower &&
    clusterInfo.depth > 0
  );

  if (titleLower === context.queryLower) textScore += 140;
  if (titleLower.startsWith(context.queryLower)) textScore += 70;

  titleTokens = splitSearchTitleTokens(title);
  if (titleTokens.includes(context.queryLower)) {
    textScore += 45;
  }

  // Pinyin, initials and words spelled across spaces, where the title does
  // not already hold the query as typed.
  const titleUnitMatch = context.unitQuery
    ? getSearchTitleUnitMatch(title, context.unitQuery, settings, { skipLiteral: true })
    : null;
  if (titleUnitMatch) {
    textScore += titleUnitMatch.score;
  }

  context.queryTerms.forEach((word) => {
    if (!word) {
      return;
    }
    if (titleTokens.includes(word)) {
      textScore += 24;
      return;
    }
    if (titleTokens.some((token) => token.startsWith(word))) {
      textScore += 14;
      return;
    }
    if (shouldAllowLooseTextContains(word) && titleLower.includes(word)) {
      textScore += 8;
      return;
    }
    const wordUnitMatch = getSearchTitleUnitMatch(title, word, settings, { skipLiteral: true });
    if (wordUnitMatch) {
      if (wordUnitMatch.pieces > 1) {
        textScore += 6;
      } else {
        textScore += wordUnitMatch.exact ? 24 : (wordUnitMatch.anchored ? 16 : 10);
      }
    }
  });

  if (shouldAllowLooseTextContains(context.queryLower) && titleLower.includes(context.queryLower)) textScore += 24;

  try {
    hostname = normalizeHost(new URL(item.url).hostname);
    hostLabels = hostname.split('.').filter(Boolean);
    if (shouldAllowLooseTextContains(context.queryLower) && hostname.includes(context.queryLower)) textScore += 14;
    if (hostname.startsWith(context.queryLower)) textScore += 20;
    if (hostLabels.includes(context.queryLower)) {
      textScore += 42;
    } else if (matchesSearchHostSpelling(hostLabels, context)) {
      textScore += 28;
    }
    context.queryTerms.forEach((word) => {
      if (!word) {
        return;
      }
      if (hostLabels.includes(word)) {
        textScore += 28;
        return;
      }
      if (hostLabels.some((label) => label.startsWith(word))) {
        textScore += 16;
        return;
      }
      if (shouldAllowLooseTextContains(word) && hostname.includes(word)) {
        textScore += 8;
      }
    });
  } catch (e) {
    // Ignore invalid URL.
  }

  if (shouldAllowLooseTextContains(context.queryLower) && urlLower.includes(context.queryLower)) textScore += 10;
  try {
    const parsedUrl = new URL(item.url);
    const pathnameLower = String(parsedUrl.pathname || '').toLowerCase();
    const decodedPathnameLower = decodeURIComponent(pathnameLower);
    const pathSegments = decodedPathnameLower.split('/').filter(Boolean);
    pathSegments.forEach((segment) => {
      const segmentTokens = segment.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean);
      if (segmentTokens.length > 0) {
        pathTokens.push(...segmentTokens);
      }
    });
    if (decodedPathnameLower && context.queryTerms.length > 0) {
      context.queryTerms.forEach((word) => {
        if (!word) {
          return;
        }
        if (pathTokens.includes(word)) {
          textScore += 32;
          return;
        }
        if (pathTokens.some((token) => token.startsWith(word))) {
          textScore += 18;
          return;
        }
        if (shouldAllowLooseTextContains(word) && pathTokens.some((token) => token.includes(word))) {
          textScore += 10;
          return;
        }
        if (shouldAllowLooseTextContains(word) && decodedPathnameLower.includes(word)) {
          textScore += 8;
        }
      });
    }
  } catch (e) {
    // Ignore invalid URL parsing/decoding errors.
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

  const isLocalNetworkHost = typeof settings.isLocalNetworkHost === 'function'
    ? settings.isLocalNetworkHost
    : () => false;
  if (hostname && isLocalNetworkHost(hostname)) {
    if (titleLower === context.queryLower) textScore += 60;
    else if (titleLower.startsWith(context.queryLower)) textScore += 42;
    else if (shouldAllowLooseTextContains(context.queryLower) && titleLower.includes(context.queryLower)) textScore += 24;
    else if (shouldAllowLooseTextContains(context.queryLower) && urlLower.includes(context.queryLower)) textScore += 20;
  }

  if (textScore <= 0) {
    return 0;
  }

  const lastVisitTime = Number(item.lastVisitTime) || 0;
  if (lastVisitTime) {
    const daysSinceVisit = (now - lastVisitTime) / (1000 * 60 * 60 * 24);
    if (daysSinceVisit < 1) behaviorScore += 10;
    else if (daysSinceVisit < 7) behaviorScore += 5;
    else if (daysSinceVisit < 30) behaviorScore += 2;
  }

  const visitCount = Number(item.visitCount) > 0 ? Number(item.visitCount) : 0;
  const typedCount = Number(item.typedCount) > 0 ? Number(item.typedCount) : 0;
  if (visitCount > 0) {
    behaviorScore += Math.min(18, Math.log2(visitCount + 1) * 4);
  }
  if (typedCount > 0) {
    behaviorScore += Math.min(12, typedCount * 2);
  }
  if (lastVisitTime) {
    const hoursSinceVisit = (now - lastVisitTime) / (1000 * 60 * 60);
    if (hoursSinceVisit < 2) behaviorScore += 20;
    else if (hoursSinceVisit < 24) behaviorScore += 14;
    else if (hoursSinceVisit < 72) behaviorScore += 8;
  }

  if (sourceType === 'bookmark') {
    sourceScore += 12;
  } else if (sourceType === 'history') {
    sourceScore += 4;
  } else if (sourceType === 'topSite') {
    sourceScore += 6;
  }
  sourceScore += getSearchSourceAdjustment(sourceType, context.intentType);

  return textScore +
    behaviorScore +
    sourceScore +
    getSearchSuggestionCategoryAdjustment(item, context, coverageStats) +
    getSearchDirectNavigationAdjustment(item, sourceType, context, settings) -
    (isGenericBrandDeepTitle ? SEARCH_POLICY.genericBrandDeepTitlePenalty : 0) -
    getOwnExtensionUtilityPenalty(item, {
      hasSettingsIntent: context.hasSettingsIntent,
      isOwnExtensionUrl: settings.isOwnExtensionUrl
    });
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
  const queryKey = normalizeSearchSelectionQuery(context.lookupQuery || context.queryLower);
  if (!queryKey) {
    return 0;
  }
  const bucket = stats.queries && stats.queries[queryKey] ? stats.queries[queryKey] : null;
  if (!bucket || !bucket.entries) {
    return 0;
  }
  const urlKey = buildSearchDedupUrlKey(item.url);
  const entry = urlKey ? bucket.entries[urlKey] : null;
  if (!entry) {
    return 0;
  }
  const settings: SearchRankingOptions = options && typeof options === 'object' ? options : {};
  const now = getNow(settings);
  const lastSelectedAt = Number(entry.lastSelectedAt) || 0;
  if (!lastSelectedAt) {
    return 0;
  }
  const retentionDays = Number(settings.retentionDays) > 0
    ? Number(settings.retentionDays)
    : SEARCH_SELECTION_POLICY.retentionDays;
  const ageDays = (now - lastSelectedAt) / (1000 * 60 * 60 * 24);
  if (ageDays > retentionDays) {
    return 0;
  }
  const count = Math.max(1, Number(entry.count) || 1);
  const frequencyBoost = Math.min(256, Math.log2(count + 1) * 64);
  let recencyBoost = 0;
  if (ageDays < 1) recencyBoost = 64;
  else if (ageDays < 7) recencyBoost = 44;
  else if (ageDays < 30) recencyBoost = 24;
  else recencyBoost = 10;
  const maxBoost = Number(settings.maxSelectionBoost) > 0
    ? Number(settings.maxSelectionBoost)
    : SEARCH_SELECTION_POLICY.maxSelectionBoost;
  let boost = Math.min(maxBoost, frequencyBoost + recencyBoost);
  if (context.intentType === 'brand') {
    const info = getSearchSuggestionClusterInfo(item.url);
    if (info.depth > 0) {
      const deepPageLimit = Number(settings.brandDeepSelectionBoostLimit) > 0
        ? Number(settings.brandDeepSelectionBoostLimit)
        : SEARCH_POLICY.brandDeepSelectionBoostLimit;
      boost = Math.min(boost, deepPageLimit);
    }
  }
  return boost;
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
