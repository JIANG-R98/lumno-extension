// The search blacklist: the rules from settings and what they hide.
import * as BLACKLIST_UTILS from '../../domain/blacklist-utils';
import { searchBlacklist } from '../../domain/settings';
import { workerSettings } from '../worker-context';
import { deriveFromSetting } from '../../platform/settings-store';
import type { BlacklistRule } from '../../domain/blacklist-utils';
import type { SuggestionLike } from '../../domain/search/types';

const getSearchBlacklistRules = deriveFromSetting(workerSettings, searchBlacklist, (stored) => normalizeSearchBlacklistItems(stored));

function normalizeSearchBlacklistItems(items: unknown): BlacklistRule[] {
  if (BLACKLIST_UTILS.normalizeItems) {
    return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
  }
  return [];
}



function loadSearchBlacklistItems(): Promise<BlacklistRule[]> {
  return workerSettings.ready.then(getSearchBlacklistRules);
}


function isUrlBlockedBySearchBlacklist(url: unknown, items: readonly BlacklistRule[]): boolean {
  return BLACKLIST_UTILS.isUrlBlocked(url, items);
}

function isSuggestionBlockedBySearchBlacklist(suggestion: SuggestionLike | null | undefined, items: readonly BlacklistRule[]): boolean {
  if (!suggestion) {
    return false;
  }
  if (
    suggestion.type === 'newtab' ||
    suggestion.type === 'siteSearch' ||
    suggestion.type === 'inlineSiteSearch' ||
    suggestion.type === 'siteSearchPrompt'
  ) {
    return false;
  }
  if (suggestion.url && isUrlBlockedBySearchBlacklist(suggestion.url, items)) {
    return true;
  }
  return false;
}

function filterBlacklistedSuggestions<T extends SuggestionLike>(list: readonly T[], items: readonly BlacklistRule[]): T[] {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }
  return list.filter((suggestion) => !isSuggestionBlockedBySearchBlacklist(suggestion, items));
}


export { filterBlacklistedSuggestions, isSuggestionBlockedBySearchBlacklist, isUrlBlockedBySearchBlacklist, loadSearchBlacklistItems };
