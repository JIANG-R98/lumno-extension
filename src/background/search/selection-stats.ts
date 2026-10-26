// Which suggestion the user picked for a query (this device only), and the
// boost it gives that page the next time.
import { workerSettings } from '../worker-context';
import { deriveFromSetting } from '../../platform/settings-store';
import type {
  BrowserItem,
  SearchQueryContext,
  SearchRankingOptions,
  SearchSelectionStats
} from '../../domain/search/types';
import { searchSelectionStats } from '../../domain/settings/search';
import { isRecord } from './types';
import * as SearchRelevanceScore from '../../domain/search/utils/relevance-score';
import * as SelectionStatsRules from '../../domain/search/utils/selection-stats';

const getSearchSelectionStats = deriveFromSetting(workerSettings, searchSelectionStats, (stored) => normalizeSearchSelectionStats(stored));

function normalizeSearchSelectionStats(rawStats: unknown): SearchSelectionStats {
  return SelectionStatsRules.normalizeSearchSelectionStats(rawStats);
}

function loadSearchSelectionStats(): Promise<SearchSelectionStats> {
  return workerSettings.ready.then(getSearchSelectionStats);
}

function saveSearchSelectionStats(stats: SearchSelectionStats): Promise<boolean> {
  return workerSettings.set(searchSelectionStats, normalizeSearchSelectionStats(stats))
    .then(() => true, () => false);
}

function shouldRecordSearchSuggestionSelectionPayload(selection: unknown): selection is Record<string, unknown> {
  if (!isRecord(selection)) {
    return false;
  }
  const query = String(selection.query || '').trim();
  const url = String(selection.url || '').trim();
  if (!query || !url) {
    return false;
  }
  const type = String(selection.type || '').trim();
  if (type === 'newtab' ||
      type === 'googleSuggest' ||
      type === 'siteSearch' ||
      type === 'inlineSiteSearch' ||
      type === 'siteSearchPrompt' ||
      type === 'modeSwitch' ||
      type === 'commandNewTab' ||
      type === 'commandSettings') {
    return false;
  }
  return true;
}

function recordSearchSuggestionSelection(selection: unknown): Promise<{ ok: boolean; reason?: string }> {
  if (!shouldRecordSearchSuggestionSelectionPayload(selection)) {
    return Promise.resolve({ ok: false, reason: 'invalid-selection' });
  }
  const recorded = {
    query: String(selection.query || ''),
    url: String(selection.url || ''),
    title: typeof selection.title === 'string' ? selection.title : undefined,
    type: typeof selection.type === 'string' ? selection.type : undefined
  };
  return loadSearchSelectionStats()
    .then((stats) => {
      const updatedStats = SelectionStatsRules.recordSearchSelectionInStats(stats, recorded);
      return saveSearchSelectionStats(updatedStats);
    })
    .then((ok) => ({ ok: ok === true }));
}

function getSearchSelectionBoost(
  item: BrowserItem,
  context: SearchQueryContext,
  stats: SearchSelectionStats,
  options: SearchRankingOptions
): number {
  return SearchRelevanceScore.getSearchSelectionBoost(item, context, stats, options);
}


export { getSearchSelectionBoost, loadSearchSelectionStats, normalizeSearchSelectionStats, recordSearchSuggestionSelection };
