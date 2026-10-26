// The suggestion slate: brand and navigation representations, search
// engine suggestion scores and limits, and composing and ranking the slate
// shown under the input.
import type { SearchQueryContext, SiteSearchProvider, SuggestionLike } from '../types';
import { normalizeHost } from './direct-navigation';
import { findSearchOpenTabMatchIndex } from './navigation-matching';
import type { OpenTabMatchOptions } from './navigation-matching';
import { getSearchSuggestionClusterInfo, getSearchTermCoverageStats } from './query-intent';
import type { IntentItem } from './query-intent';
import { SEARCH_POLICY } from './search-policy';
import { findProviderForSiteSearchSuggestion } from './site-search-matching';
import { normalizeSearchText, splitSearchTerms, splitSearchTitleTokens } from './text-normalize';
import type { TitleMatchOptions } from './text-matching';
import { getSearchTitleUnitMatch } from './text-matching';

type SlateContext = Pick<SearchQueryContext, 'queryLower' | 'queryTerms' | 'intentType' | 'hasSettingsIntent' |
  'hasInformationalIntent' | 'coreQueryTerms'>;

// The text an autocompletion would put in the input, and its page.
interface AutocompleteCandidate {
  url?: string;
  completion?: string;
}

// What the overlay and the New Tab search box supply to rank a slate.
interface SlateMatchers<T> {
  filterSuggestions?: (items: T[]) => T[];
  promoteStrongNavigationMatch: (list: T[], rawQuery: string) => T | null;
  promoteTopSiteMatch: (list: T[], rawQuery: string) => T | null;
  getSiteSearchTriggerCandidate: (
    input: unknown,
    providers: SiteSearchProvider[] | undefined,
    topSiteMatch: T | null
  ) => SiteSearchProvider | null;
  getAutocompleteCandidate: (suggestions: T[] | undefined, rawQuery: string) => AutocompleteCandidate | null;
  getUrlDisplay: (url: string | undefined) => string;
}

interface RankSlateOptions<T> {
  matchers: SlateMatchers<T>;
  query?: string;
  rawQuery?: string;
  triggerInput?: unknown;
  providers?: SiteSearchProvider[];
  inlineSuggestion?: T | null;
  siteSearchActive?: boolean;
  // false when the reader wants search rows before local results.
  preferAutocompleteFirst?: boolean;
  onlyKeywordSuggestions?: boolean;
  autocompleteSuggestions?: T[];
  openTabMatch?: OpenTabMatchOptions | null;
}

type PrimaryHighlightReason =
  | 'none' | 'navigation' | 'autocomplete' | 'inline' | 'topSite' | 'currentOpenTab' | 'openTab' | 'default';

interface RankedSlate<T> {
  suggestions: T[];
  primaryHighlightIndex: number;
  primaryHighlightReason: PrimaryHighlightReason;
  primarySuggestion: T | null;
  mergedProvider: SiteSearchProvider | null;
  siteSearchTrigger: SiteSearchProvider | null;
}

interface EngineSuggestionPolicy {
  hasLocalResults: boolean;
  limit: number;
  score: number;
}

interface EngineSuggestionLimits {
  maxEngineSuggestions?: number;
  maxEngineSuggestionsWithLocalResults?: number;
  searchFirst?: boolean;
}

const SEARCH_HOME_TITLE_TERMS = new Set([
  'home',
  'homepage',
  'overview',
  'workspace',
  'console',
  'dashboard',
  '首页',
  '主页',
  '概览',
  '控制台',
  '工作台'
]);

function hasSearchHomeTitle(title: unknown): boolean {
  const titleTerms = splitSearchTerms(String(title || '').toLowerCase());
  return titleTerms.some((term) => SEARCH_HOME_TITLE_TERMS.has(term));
}

function isSearchLikelyBrandProductQuery(context: SlateContext | null | undefined): boolean {
  if (!context || context.intentType !== 'object') {
    return false;
  }
  if (context.hasInformationalIntent || context.hasSettingsIntent) {
    return false;
  }
  // queryTerms also carries the whole phrase, so count the split words.
  if (!Array.isArray(context.coreQueryTerms) || context.coreQueryTerms.length !== 2) {
    return false;
  }
  return context.queryLower.length <= 28;
}

function isSearchLikelyDirectNavigationQuery(context: SlateContext | null | undefined): boolean {
  if (!context || context.hasInformationalIntent) {
    return false;
  }
  return context.intentType === 'brand' || isSearchLikelyBrandProductQuery(context);
}

function getSearchBrandHostMatchScore(host: string, context: SlateContext | null | undefined): number {
  if (!host || !context || context.intentType !== 'brand') {
    return 0;
  }
  const query = String(context.queryLower || '').trim();
  if (!query) {
    return 0;
  }
  const hostLabels = normalizeHost(host).split('.').filter(Boolean);
  let score = 0;
  hostLabels.forEach((label) => {
    if (label === query) {
      score = Math.max(score, 100);
      return;
    }
    if (query.length >= 2 && label.startsWith(query)) {
      score = Math.max(score, 60);
    }
  });
  return score;
}

function getSearchNavigationRepresentativeSignal(item: IntentItem | null | undefined, context: SlateContext): number {
  if (!item || !item.url) {
    return 0;
  }
  const info = getSearchSuggestionClusterInfo(item.url);
  const titleLower = normalizeSearchText(item.title);
  const hasHomeTitle = hasSearchHomeTitle(titleLower);
  let signal = 0;

  if (info.category === 'site-root' || info.category === 'repo-root') {
    signal += 4;
  } else if (info.category === 'section' || info.category === 'landing') {
    signal += 3;
  } else if (hasHomeTitle && info.category !== 'utility' && info.category !== 'action') {
    signal += 3;
  } else if (info.category === 'content' && info.depth <= 2) {
    signal += 1;
  }

  if (info.category === 'utility' || info.category === 'action' || info.category === 'user') {
    signal -= 3;
  } else if (info.category === 'content' && info.depth >= 2 && !hasHomeTitle) {
    signal -= 1;
  }

  if (titleLower === context.queryLower) {
    signal += 4;
  } else if (titleLower.startsWith(context.queryLower)) {
    signal += 3;
  } else if (context.queryTerms.every((term) => term && titleLower.includes(term))) {
    signal += 2;
  }

  try {
    const hostLabels = normalizeHost(new URL(item.url).hostname).split('.').filter(Boolean);
    context.queryTerms.forEach((term) => {
      if (!term) {
        return;
      }
      if (hostLabels.includes(term)) {
        signal += 2;
        return;
      }
      if (term.length >= 2 && hostLabels.some((label) => label.startsWith(term))) {
        signal += 1;
      }
    });
  } catch (e) {
    // Ignore invalid URL.
  }

  if (item.type === 'topSite' || item.isTopSite) {
    signal += 1;
  } else if (item.type === 'bookmark') {
    signal += 1;
  }

  return signal;
}

function getSearchDirectNavigationAdjustment(
  item: IntentItem | null | undefined,
  sourceType: unknown,
  context: SlateContext,
  options?: TitleMatchOptions | null
): number {
  if (!isSearchLikelyDirectNavigationQuery(context) || !item || !item.url) {
    return 0;
  }
  const url = item.url;
  const info = getSearchSuggestionClusterInfo(item.url);
  const hasHomeTitle = hasSearchHomeTitle(item.title);
  const representativeSignal = getSearchNavigationRepresentativeSignal(item, context);
  const titleLower = normalizeSearchText(item.title);
  const pathTokens: string[] = [];
  let hostname = '';
  let hostLabels: string[] = [];
  try {
    const parsedUrl = new URL(url);
    hostname = normalizeHost(parsedUrl.hostname);
    hostLabels = hostname.split('.').filter(Boolean);
    decodeURIComponent(String(parsedUrl.pathname || '').toLowerCase())
      .split('/')
      .filter(Boolean)
      .forEach((segment) => {
        const segmentTokens = segment.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean);
        if (segmentTokens.length > 0) {
          pathTokens.push(...segmentTokens);
        }
      });
  } catch (e) {
    hostname = '';
    hostLabels = [];
  }
  const coverageStats = getSearchTermCoverageStats(context, {
    titleLower,
    hostname,
    urlLower: url.toLowerCase(),
    titleTokens: splitSearchTitleTokens(item.title),
    hostLabels,
    pathTokens,
    matchesTitleUnits: (term: string) => Boolean(getSearchTitleUnitMatch(item.title, term, options))
  });
  let adjustment = 0;

  if (context.intentType === 'brand') {
    if (info.category === 'site-root' || info.category === 'repo-root') {
      adjustment += 70;
    } else if (info.category === 'section' || info.category === 'landing') {
      adjustment += 32;
    } else if (hasHomeTitle) {
      adjustment += 42;
    } else if (info.category === 'content' && info.depth >= 2) {
      adjustment -= 28;
    }
  } else if (isSearchLikelyBrandProductQuery(context)) {
    if (info.category === 'site-root' || info.category === 'repo-root') {
      adjustment += 34;
    } else if (info.category === 'section' || info.category === 'landing' || hasHomeTitle) {
      adjustment += 28;
    } else if (info.category === 'content' && info.depth >= 2) {
      adjustment -= 12;
    }
  }

  if (representativeSignal >= 6) {
    adjustment += 18;
  } else if (representativeSignal <= 0) {
    adjustment -= 12;
  }

  if ((info.category === 'utility' || info.category === 'action' || info.category === 'user') && !context.hasSettingsIntent) {
    adjustment -= 36;
  }

  if (sourceType === 'topSite' && (info.category === 'site-root' || hasHomeTitle)) {
    adjustment += 10;
  }

  if (coverageStats.total >= 2 && !coverageStats.allMatched) {
    if (info.category === 'site-root' || info.category === 'section' || info.category === 'landing') {
      adjustment -= Math.min(42, coverageStats.missingCount * 22);
    }
    if (representativeSignal >= 6) {
      adjustment -= 10;
    }
  }

  return adjustment;
}

function getSearchEngineSuggestionScore(
  context: SlateContext,
  localSuggestions: ReadonlyArray<SuggestionLike | null | undefined> | null | undefined
): number {
  const candidates: ReadonlyArray<SuggestionLike | null | undefined> = Array.isArray(localSuggestions) ? localSuggestions : [];
  const hasStrongLocalDirectMatch = candidates.some((suggestion) => (
    suggestion &&
    suggestion.type !== 'googleSuggest' &&
    getSearchNavigationRepresentativeSignal(suggestion, context) >= 6
  ));

  if (context.intentType === 'brand') {
    return hasStrongLocalDirectMatch ? 18 : 48;
  }
  if (isSearchLikelyBrandProductQuery(context)) {
    return hasStrongLocalDirectMatch ? 34 : 78;
  }
  if (context.intentType === 'path' || context.intentType === 'revisit') {
    return 52;
  }
  if (context.hasInformationalIntent) {
    return 220;
  }
  return 160;
}

function getSearchEngineSuggestionLimit(value: unknown): number {
  const rawLimit = Number(value);
  return Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.floor(rawLimit)
    : SEARCH_POLICY.maxEngineSuggestions;
}

function normalizeSearchEngineSuggestionText(value: unknown): string {
  return String(value || '').trim();
}

// The engine's suggested queries, trimmed, without the query itself or
// repeats, up to the limit.
function normalizeSearchEngineSuggestions(items: unknown, query: unknown, options?: { limit?: number } | null): string[] {
  const suggestions: unknown[] = Array.isArray(items) ? items : [];
  const settings: { limit?: number } = options && typeof options === 'object' ? options : {};
  const limit = getSearchEngineSuggestionLimit(settings.limit);
  const queryText = normalizeSearchEngineSuggestionText(query);
  const queryKey = queryText.toLowerCase();
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (let i = 0; i < suggestions.length && normalized.length < limit; i += 1) {
    const suggestion = normalizeSearchEngineSuggestionText(suggestions[i]);
    if (!suggestion) {
      continue;
    }
    const suggestionKey = suggestion.toLowerCase();
    if (suggestionKey === queryKey || seen.has(suggestionKey)) {
      continue;
    }
    seen.add(suggestionKey);
    normalized.push(suggestion);
  }
  return normalized;
}

function isSearchEngineSuggestion(suggestion: SuggestionLike | null | undefined): boolean {
  return Boolean(suggestion && suggestion.type === 'googleSuggest');
}

function isSearchActionSuggestion(suggestion: SuggestionLike | null | undefined): boolean {
  return Boolean(suggestion && suggestion.type === 'newtab');
}

function isKeywordSearchSuggestion(suggestion: SuggestionLike | null | undefined): boolean {
  return isSearchEngineSuggestion(suggestion) || isSearchActionSuggestion(suggestion);
}

// Navigation rows, then search rows (or the other way round with searchFirst).
function groupSearchSuggestionsByKind<T extends SuggestionLike>(
  list: ReadonlyArray<T | null | undefined> | null | undefined,
  options?: { searchFirst?: boolean } | null
): T[] {
  const suggestions: T[] = Array.isArray(list) ? list.filter((item): item is T => Boolean(item)) : [];
  const settings: { searchFirst?: boolean } = options && typeof options === 'object' ? options : {};
  const navigationSuggestions: T[] = [];
  const keywordSuggestions: T[] = [];
  suggestions.forEach((suggestion) => {
    if (isKeywordSearchSuggestion(suggestion)) {
      keywordSuggestions.push(suggestion);
    } else {
      navigationSuggestions.push(suggestion);
    }
  });
  return settings.searchFirst
    ? [...keywordSuggestions, ...navigationSuggestions]
    : [...navigationSuggestions, ...keywordSuggestions];
}

function composeSearchFirstSuggestionSlate<T extends SuggestionLike>(
  list: ReadonlyArray<T | null | undefined> | null | undefined,
  options?: { limit?: number } | null
): T[] {
  const suggestions: T[] = Array.isArray(list) ? list.filter((item): item is T => Boolean(item)) : [];
  const settings: { limit?: number } = options && typeof options === 'object' ? options : {};
  const rawLimit = Number(settings.limit);
  const fallbackLimit = Number(SEARCH_POLICY.displaySuggestionLimit) || 10;
  const limit = Number.isInteger(rawLimit) && rawLimit >= 5 && rawLimit <= 12
    ? rawLimit
    : fallbackLimit;
  const searchSlotTarget = Math.ceil(limit * 0.6);
  const searchActions = suggestions.filter(isSearchActionSuggestion);
  const engineSuggestions = suggestions.filter(isSearchEngineSuggestion);
  const localSuggestions = suggestions.filter((suggestion) => !isKeywordSearchSuggestion(suggestion));
  const selected: T[] = [];
  const selectedSuggestions = new Set<T>();

  const take = (suggestion: T | undefined) => {
    if (!suggestion || selectedSuggestions.has(suggestion) || selected.length >= limit) {
      return false;
    }
    selected.push(suggestion);
    selectedSuggestions.add(suggestion);
    return true;
  };

  if (searchActions.length > 0) {
    take(searchActions[0]);
  }
  for (let i = 0; i < engineSuggestions.length && selected.length < searchSlotTarget; i += 1) {
    take(engineSuggestions[i]);
  }

  const localSlotTarget = Math.max(0, limit - searchSlotTarget);
  const localSourceCap = Math.max(1, Math.ceil(localSlotTarget / 2));
  const localSourceCounts = new Map<string, number>();
  const deferredLocalSuggestions: T[] = [];
  for (let i = 0; i < localSuggestions.length && selected.length < limit; i += 1) {
    const suggestion = localSuggestions[i];
    const sourceType = suggestion && (suggestion.type === 'history' || suggestion.type === 'bookmark')
      ? suggestion.type
      : '';
    const sourceCount = sourceType ? (localSourceCounts.get(sourceType) || 0) : 0;
    if (sourceType && sourceCount >= localSourceCap) {
      deferredLocalSuggestions.push(suggestion);
      continue;
    }
    if (take(suggestion) && sourceType) {
      localSourceCounts.set(sourceType, sourceCount + 1);
    }
  }

  for (let i = 0; i < engineSuggestions.length && selected.length < limit; i += 1) {
    take(engineSuggestions[i]);
  }
  for (let i = 0; i < deferredLocalSuggestions.length && selected.length < limit; i += 1) {
    take(deferredLocalSuggestions[i]);
  }
  for (let i = 1; i < searchActions.length && selected.length < limit; i += 1) {
    take(searchActions[i]);
  }

  suggestions.forEach(take);
  return [
    ...selected,
    ...suggestions.filter((suggestion) => !selectedSuggestions.has(suggestion))
  ];
}

function pinExactSearchActionSecond<T extends SuggestionLike>(list: ReadonlyArray<T | null | undefined> | null | undefined): T[] {
  const suggestions: T[] = Array.isArray(list) ? list.filter((item): item is T => Boolean(item)) : [];
  if (suggestions.length < 2) {
    return suggestions;
  }
  const searchActionIndex = suggestions.findIndex(isSearchActionSuggestion);
  const primaryResultIndex = suggestions.findIndex((suggestion) => (
    !isKeywordSearchSuggestion(suggestion)
  ));
  if (searchActionIndex < 0 || primaryResultIndex < 0) {
    return suggestions;
  }
  const primaryResult = suggestions[primaryResultIndex];
  const searchAction = suggestions[searchActionIndex];
  const remainingSuggestions = suggestions.filter((suggestion, index) => (
    index !== primaryResultIndex && index !== searchActionIndex
  ));
  return [primaryResult, searchAction, ...remainingSuggestions];
}

function findAutocompleteCandidateSuggestionIndex<T extends SuggestionLike>(
  list: T[],
  candidate: AutocompleteCandidate,
  getUrlDisplay: (url: string | undefined) => string
): number {
  const completion = String(candidate && candidate.completion || '').toLowerCase();
  return list.findIndex((suggestion) => {
    if (!suggestion || suggestion.type === 'newtab') {
      return false;
    }
    if (candidate.url && suggestion.url === candidate.url) {
      return true;
    }
    const suggestionUrlText = getUrlDisplay(suggestion.url);
    if (suggestionUrlText && suggestionUrlText.toLowerCase() === completion) {
      return true;
    }
    return Boolean(suggestion.title && suggestion.title.toLowerCase().startsWith(completion));
  });
}

function moveSuggestionToFront<T>(list: T[], index: number): void {
  if (index > 0) {
    const [suggestion] = list.splice(index, 1);
    list.unshift(suggestion);
  }
}

// Orders a default-mode suggestion slate (no slash command, scope or
// site-search tag active) and decides which row the input highlights first:
// a strong navigation match, the autocomplete target, an inline site search,
// a top site, a matching open tab, or else the first row. Shared by the
// Overlay and the New Tab search box, which supply their own matchers.
// Returns a new list; `suggestions` itself is not reordered.
function rankSearchSuggestionSlate<T extends SuggestionLike>(
  suggestions: readonly T[] | null | undefined,
  options: RankSlateOptions<T>
): RankedSlate<T> {
  const config = options;
  const matchers = config.matchers;
  const identity = (items: T[]) => items;
  const filterSuggestions = typeof matchers.filterSuggestions === 'function'
    ? matchers.filterSuggestions
    : identity;
  const rawQuery = String(config.rawQuery || '');
  const trimmedRawQuery = rawQuery.trim();
  const inlineSuggestion = config.inlineSuggestion || null;
  const siteSearchActive = Boolean(config.siteSearchActive);
  const preferAutocompleteFirst = config.preferAutocompleteFirst !== false;
  const onlyKeywordSuggestions = Boolean(config.onlyKeywordSuggestions);
  const canPromoteLocalMatches = !siteSearchActive && !inlineSuggestion && preferAutocompleteFirst;
  let list: T[] = Array.isArray(suggestions) ? suggestions.slice() : [];
  let primaryHighlightIndex = -1;
  let primaryHighlightReason: PrimaryHighlightReason = 'none';
  let strongNavigationMatch: T | null = null;
  let topSiteMatch: T | null = null;

  if (canPromoteLocalMatches) {
    strongNavigationMatch = matchers.promoteStrongNavigationMatch(list, trimmedRawQuery);
    if (strongNavigationMatch) {
      primaryHighlightIndex = 0;
      primaryHighlightReason = 'navigation';
    }
    topSiteMatch = matchers.promoteTopSiteMatch(list, trimmedRawQuery);
  }
  const siteSearchTrigger = !siteSearchActive && !inlineSuggestion
    ? matchers.getSiteSearchTriggerCandidate(config.triggerInput, config.providers, topSiteMatch)
    : null;
  if (canPromoteLocalMatches && !strongNavigationMatch && !onlyKeywordSuggestions) {
    const autocompleteCandidate = matchers.getAutocompleteCandidate(
      config.autocompleteSuggestions,
      rawQuery
    );
    if (autocompleteCandidate) {
      moveSuggestionToFront(list, findAutocompleteCandidateSuggestionIndex(
        list,
        autocompleteCandidate,
        matchers.getUrlDisplay
      ));
      primaryHighlightIndex = 0;
      primaryHighlightReason = 'autocomplete';
    }
  }
  if (inlineSuggestion) {
    list.unshift(inlineSuggestion);
    list = filterSuggestions(list);
    primaryHighlightIndex = 0;
    primaryHighlightReason = 'inline';
  } else if (!strongNavigationMatch && topSiteMatch && preferAutocompleteFirst) {
    primaryHighlightIndex = 0;
    primaryHighlightReason = 'topSite';
  }
  if (preferAutocompleteFirst && !siteSearchActive && config.query &&
      !onlyKeywordSuggestions && config.openTabMatch) {
    const openTabMatch = findSearchOpenTabMatchIndex(list, Object.assign({}, config.openTabMatch, {
      rawQuery: trimmedRawQuery,
      primaryHighlightIndex
    }));
    if (openTabMatch.index >= 0) {
      moveSuggestionToFront(list, openTabMatch.index);
      primaryHighlightIndex = 0;
      primaryHighlightReason = openTabMatch.reason || 'openTab';
    }
  }
  if (preferAutocompleteFirst) {
    list = pinExactSearchActionSecond(list);
  }
  if (config.query && primaryHighlightIndex < 0 && list.length > 0) {
    primaryHighlightIndex = 0;
    primaryHighlightReason = 'default';
  }
  const primarySuggestion = primaryHighlightIndex >= 0
    ? (list[primaryHighlightIndex] || null)
    : null;
  const mergedProvider = primaryHighlightIndex >= 0
    ? findProviderForSiteSearchSuggestion(primarySuggestion, config.providers)
    : null;
  return {
    suggestions: list,
    primaryHighlightIndex,
    primaryHighlightReason,
    primarySuggestion,
    mergedProvider,
    siteSearchTrigger
  };
}

function hasLocalResultSuggestion(list: ReadonlyArray<SuggestionLike | null | undefined> | null | undefined): boolean {
  return (Array.isArray(list) ? list : []).some((suggestion) => (
    suggestion && !isKeywordSearchSuggestion(suggestion)
  ));
}

function areOnlyKeywordSearchSuggestions(list: ReadonlyArray<SuggestionLike | null | undefined> | null | undefined): boolean {
  const suggestions: ReadonlyArray<SuggestionLike | null | undefined> = Array.isArray(list) ? list : [];
  return suggestions.length > 0 && suggestions.every(isKeywordSearchSuggestion);
}

function getAutocompleteSearchSuggestionPool<T extends SuggestionLike>(list: readonly T[] | null | undefined): T[] {
  const suggestions: readonly T[] = Array.isArray(list) ? list : [];
  if (!hasLocalResultSuggestion(suggestions)) {
    return suggestions.slice();
  }
  return suggestions.filter((suggestion) => !isSearchEngineSuggestion(suggestion));
}

function getKeywordSearchSuggestionState<T extends SuggestionLike>(list: readonly T[] | null | undefined) {
  const suggestions: readonly T[] = Array.isArray(list) ? list : [];
  return {
    onlyKeywordSuggestions: areOnlyKeywordSearchSuggestions(suggestions),
    hasLocalResults: hasLocalResultSuggestion(suggestions),
    autocompleteSuggestions: getAutocompleteSearchSuggestionPool(suggestions)
  };
}

function getSearchEngineSuggestionPolicy(
  context: SlateContext,
  localSuggestions: ReadonlyArray<SuggestionLike | null | undefined> | null | undefined,
  policy?: EngineSuggestionLimits | null
): EngineSuggestionPolicy {
  const settings: EngineSuggestionLimits = policy && typeof policy === 'object' ? policy : {};
  const hasLocalResults = hasLocalResultSuggestion(localSuggestions);
  const baseScore = getSearchEngineSuggestionScore(context, localSuggestions);
  const maxEngineSuggestions = getSearchEngineSuggestionLimit(settings.maxEngineSuggestions);
  const rawLocalResultLimit = Number(settings.maxEngineSuggestionsWithLocalResults);
  const localResultLimit = Number.isFinite(rawLocalResultLimit) && rawLocalResultLimit > 0
    ? Math.floor(rawLocalResultLimit)
    : SEARCH_POLICY.maxEngineSuggestionsWithLocalResults;
  return {
    hasLocalResults,
    limit: hasLocalResults && settings.searchFirst !== true
      ? Math.min(localResultLimit, maxEngineSuggestions)
      : maxEngineSuggestions,
    score: hasLocalResults ? Math.min(baseScore, 1) : baseScore
  };
}

export {
  areOnlyKeywordSearchSuggestions,
  composeSearchFirstSuggestionSlate,
  getAutocompleteSearchSuggestionPool,
  getKeywordSearchSuggestionState,
  getSearchBrandHostMatchScore,
  getSearchDirectNavigationAdjustment,
  getSearchEngineSuggestionPolicy,
  getSearchEngineSuggestionScore,
  getSearchNavigationRepresentativeSignal,
  groupSearchSuggestionsByKind,
  hasSearchHomeTitle,
  isKeywordSearchSuggestion,
  isSearchEngineSuggestion,
  isSearchLikelyBrandProductQuery,
  isSearchLikelyDirectNavigationQuery,
  normalizeSearchEngineSuggestions,
  pinExactSearchActionSecond,
  rankSearchSuggestionSlate
};
export type {
  AutocompleteCandidate,
  EngineSuggestionPolicy,
  PrimaryHighlightReason,
  RankSlateOptions,
  RankedSlate,
  SlateContext,
  SlateMatchers
};
