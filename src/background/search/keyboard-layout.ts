// Retrying a search that found nothing with the query read in other
// keyboard layouts.
import type { SearchPolicy, SearchQueryContext } from '../../domain/search/types';
import {
  getCachedBookmarkItemsOrWarm,
  getCachedFallbackHistoryItemsOrWarm,
  getOpenTabSearchItems,
  getTopSitesCached
} from './local-sources';
import { isRecord } from './types';
import type { SearchSuggestionOptions, SuggestionRow } from './types';
import * as SearchKeyboardLayouts from '../../domain/search/utils/keyboard-layouts';
import * as SearchRelevanceScore from '../../domain/search/utils/relevance-score';
import * as SearchResultDedup from '../../domain/search/utils/result-dedup';

const KEYBOARD_LAYOUT_SCORE_PENALTY = 12;

// Nothing local matched the query as typed, so it may have been typed with
// another keyboard layout on ("vjcrdf" for москва, "пшерги" for github).
// A reading in a script no local title uses is not searched, so someone with
// no Hebrew pages never pays for a Hebrew search. What a reading finds ranks
// below a match of the query itself and keeps the reading's highlight, shown
// for the query the user typed.
async function getKeyboardLayoutSuggestions(
  context: SearchQueryContext,
  requestOptions: SearchSuggestionOptions,
  searchPolicy: Readonly<SearchPolicy>,
  search: (query: string, options: SearchSuggestionOptions) => Promise<SuggestionRow[]>
): Promise<SuggestionRow[]> {
  const candidates = SearchKeyboardLayouts.getSearchKeyboardLayoutQueries(context.lookupQuery);
  if (candidates.length === 0) {
    return [];
  }
  const corpora: ReadonlyArray<ReadonlyArray<{ title?: string }>> = await Promise.all([
    getCachedFallbackHistoryItemsOrWarm(searchPolicy),
    getCachedBookmarkItemsOrWarm(),
    getTopSitesCached(),
    requestOptions.includeOpenTabs !== false ? getOpenTabSearchItems() : Promise.resolve([])
  ]);
  const readings = candidates.filter((reading) => corpora.some((items) => (
    Array.isArray(items) && items.some((item) => (
      item && SearchKeyboardLayouts.hasSearchKeyboardLayoutScript(reading.layout, item.title)
    ))
  )));
  if (readings.length === 0) {
    return [];
  }
  const groups = await Promise.all(readings.map((reading) => (
    search(reading.query, { ...requestOptions, keyboardLayoutRetry: false })
  )));
  const typedQuery = String(context.lookupQuery || '').trim().toLowerCase();
  const merged: SuggestionRow[] = [];
  const seenKeys = new Set<string>();
  groups.forEach((group, index) => {
    const reading = readings[index];
    group.forEach((suggestion) => {
      const key = SearchResultDedup.buildSearchDedupEntryKey(suggestion);
      if (!key || seenKeys.has(key)) {
        return;
      }
      seenKeys.add(key);
      merged.push({
        ...suggestion,
        score: Math.max(1, (Number(suggestion.score) || 0) - KEYBOARD_LAYOUT_SCORE_PENALTY),
        keyboardLayout: reading.layout,
        keyboardLayoutQuery: reading.query,
        reasons: [`键盘布局纠正：${reading.query}`].concat(readReasons(suggestion.reasons)).slice(0, 3),
        ...(isRecord(suggestion.titleHighlight)
          ? { titleHighlight: { ...suggestion.titleHighlight, query: typedQuery } }
          : {})
      });
    });
  });
  merged.sort((a, b) => SearchRelevanceScore.compareSearchSuggestions(a, b));
  return merged.slice(0, searchPolicy.candidatePoolLimit || 20);
}

function readReasons(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((reason: unknown): reason is string => typeof reason === 'string') : [];
}

export { getKeyboardLayoutSuggestions };
