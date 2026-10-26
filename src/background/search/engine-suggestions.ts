// The search engine's suggestions merged into a local search's rows: on the
// overlay below the pages, or after them for a search-first New Tab.
import type { SearchPolicy, SearchQueryContext } from '../../domain/search/types';
import { filterBlacklistedSuggestions, isSuggestionBlockedBySearchBlacklist, loadSearchBlacklistItems } from './blacklist';
import { buildDefaultSearchUrl, defaultSearchEngineStateReady, getDefaultSearchEngineFaviconUrl } from './default-engine';
import { fetchSearchEngineSuggestionsWithTimeout } from './engine-requests';
import { takeRankedUniqueRows } from './suggestion-set';
import { buildBackgroundSearchQueryContext, getBackgroundSearchPolicy, loadSearchResultSourceTypes } from './text-matching';
import { readSuggestionRow } from './types';
import type { EngineSuggestionOptions, SuggestionRow } from './types';
import * as SearchBrandSuggestions from '../../domain/search/utils/brand-suggestions';
import * as SearchEngineSuggestions from '../../domain/search/utils/engine-suggestions';
import * as SearchSuggestionSlate from '../../domain/search/utils/suggestion-slate';

// The engine's suggestions as rows, as many as the policy lets in.
function buildEngineRows(
  rawEngineSuggestions: unknown,
  context: SearchQueryContext,
  localRows: readonly SuggestionRow[],
  policy: Readonly<SearchPolicy>,
  searchFirst: boolean
): SuggestionRow[] {
  const engineSuggestions = SearchEngineSuggestions.normalizeSearchEngineSuggestions(
    rawEngineSuggestions,
    context.lookupQuery,
    { limit: policy.maxEngineSuggestions }
  );
  const enginePolicy = SearchEngineSuggestions.getSearchEngineSuggestionPolicy(context, localRows, { ...policy, searchFirst });
  return engineSuggestions.slice(0, enginePolicy.limit).map((suggestion): SuggestionRow => ({
    type: 'googleSuggest',
    title: suggestion,
    url: buildDefaultSearchUrl(suggestion),
    favicon: getDefaultSearchEngineFaviconUrl(),
    score: enginePolicy.score,
    searchQuery: suggestion,
    forceSearch: true,
    reasons: ['来源：搜索建议']
  }));
}

// The final slate: search-first keeps the pages first and the engine's
// suggestions after them; otherwise everything is ranked together.
function composeSlate(rows: SuggestionRow[], context: SearchQueryContext, policy: Readonly<SearchPolicy>, searchFirst: boolean): SuggestionRow[] {
  if (!searchFirst) {
    return SearchBrandSuggestions.composeSearchSuggestionSlate(SearchBrandSuggestions.applySearchSuggestionHostDiversity(rows, { context }), context);
  }
  const engineCandidates = rows.filter((row) => row && row.type === 'googleSuggest');
  const localCandidates = SearchBrandSuggestions.applySearchSuggestionHostDiversity(
    rows.filter((row) => !row || row.type !== 'googleSuggest'),
    { context }
  );
  const limit = policy.finalSuggestionLimit || 12;
  return SearchSuggestionSlate.composeSearchFirstSuggestionSlate([...localCandidates, ...engineCandidates], { limit }).slice(0, limit);
}

async function getSearchEngineSuggestions(
  query: unknown,
  localSuggestions: unknown,
  options?: EngineSuggestionOptions | null
): Promise<SuggestionRow[]> {
  await defaultSearchEngineStateReady;
  const policy = getBackgroundSearchPolicy();
  const context = buildBackgroundSearchQueryContext(query);
  const settings: EngineSuggestionOptions = options && typeof options === 'object' ? options : {};
  const signal = settings.signal || null;
  const pageRows: unknown[] = Array.isArray(localSuggestions) ? localSuggestions : [];
  const localRows = pageRows
    .map(readSuggestionRow)
    .filter((row): row is SuggestionRow => row !== null)
    .slice(0, policy.candidatePoolLimit || 20);
  if (!context.queryLower || (signal && signal.aborted)) {
    return localRows;
  }
  const rawEngineSuggestionsPromise: Promise<unknown> = settings.rawEngineSuggestionsPromise &&
    typeof settings.rawEngineSuggestionsPromise.then === 'function'
    ? settings.rawEngineSuggestionsPromise
    : fetchSearchEngineSuggestionsWithTimeout(String(query || ''), signal);
  const [rawEngineSuggestions, blacklist, sourceTypes] = await Promise.all([
    rawEngineSuggestionsPromise,
    loadSearchBlacklistItems(),
    loadSearchResultSourceTypes()
  ]);
  if (signal && signal.aborted) {
    return localRows;
  }
  const searchFirst = settings.searchFirst === true;
  const engineRows = buildEngineRows(rawEngineSuggestions, context, localRows, policy, searchFirst)
    .filter((row) => !isSuggestionBlockedBySearchBlacklist(row, blacklist));
  let rows = takeRankedUniqueRows([...localRows, ...engineRows], policy.candidatePoolLimit || 20);
  rows = filterBlacklistedSuggestions(rows, blacklist);
  rows = SearchBrandSuggestions.filterSearchSuggestionsBySourceTypes(rows, sourceTypes);
  return composeSlate(rows, context, policy, searchFirst);
}

export { getSearchEngineSuggestions };
