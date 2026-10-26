// The favicon request blacklist and the enhanced fetch preference.
import * as BLACKLIST_UTILS from '../../domain/blacklist-utils';
import { faviconEnhancedFetchEnabled, faviconRequestBlacklist } from '../../domain/settings';
import { workerSettings } from '../worker-context';
import { deriveFromSetting } from '../../platform/settings-store';
import type { BlacklistRule } from '../../domain/blacklist-utils';
import * as FaviconCanonical from '../../domain/favicon/canonical';


const getFaviconRequestBlacklistRules = deriveFromSetting(
  workerSettings,
  faviconRequestBlacklist,
  (stored) => normalizeFaviconRequestBlacklistItems(stored)
);


function normalizeFaviconRequestBlacklistItems(items: unknown): BlacklistRule[] {
  if (BLACKLIST_UTILS.normalizeItems) {
    return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
  }
  return [];
}

function loadFaviconRequestBlacklistItems(): Promise<BlacklistRule[]> {
  return workerSettings.ready.then(getFaviconRequestBlacklistRules);
}

function loadFaviconEnhancedFetchEnabled(): Promise<boolean> {
  return workerSettings.ready.then(() => workerSettings.get(faviconEnhancedFetchEnabled));
}

function getFaviconRequestMatchUrl(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) {
    return '';
  }
  return String(FaviconCanonical.getCanonicalPageUrlForFavicon(raw) || raw).trim();
}

function isUrlBlockedByFaviconRequestBlacklist(url: unknown): boolean {
  const target = getFaviconRequestMatchUrl(url);
  return Boolean(
    target &&
    BLACKLIST_UTILS.isUrlBlocked &&
    BLACKLIST_UTILS.isUrlBlocked(target, getFaviconRequestBlacklistRules())
  );
}

export {
  getFaviconRequestBlacklistRules,
  getFaviconRequestMatchUrl,
  isUrlBlockedByFaviconRequestBlacklist,
  loadFaviconEnhancedFetchEnabled,
  loadFaviconRequestBlacklistItems,
  normalizeFaviconRequestBlacklistItems
};
