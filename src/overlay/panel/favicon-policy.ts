// Which favicons the overlay may fetch: the search and favicon
// blacklists, local network hosts, and the display limit for results.
import * as LumnoBlacklistUtils from '../../domain/blacklist-utils';
import type { BlacklistRule } from '../../domain/blacklist-utils';
import type * as SearchUtils from '../../domain/search/search-utils';
import type * as Settings from '../../domain/settings';
import * as FaviconCanonical from '../../domain/favicon/canonical';
import * as FaviconHostPolicy from '../../domain/favicon/host-policy';
import * as FaviconResolver from '../../domain/favicon/resolver';
import type { FaviconUrlResolver } from '../../domain/favicon/resolver';
import type { FaviconDecisionLogger } from '../../domain/favicon/types';

interface FaviconPolicyState {
  // Results under these addresses are left out of search.
  overlaySearchBlacklistItems: BlacklistRule[];
  // Pages whose icons are never fetched from icon services.
  overlayFaviconRequestBlacklistItems: BlacklistRule[];
  faviconEnhancedFetchEnabled: boolean;
  overlaySearchResultDisplayLimit: number;
}

interface FaviconPolicyDeps {
  SETTINGS: Pick<typeof Settings, 'searchResultDisplayLimit'>;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'limitSearchSuggestionsForDisplay'>;
  logOverlayFaviconDecision: FaviconDecisionLogger;
  overlayState: FaviconPolicyState;
}

// What the search blacklist reads from a row.
interface FilterableSuggestion {
  type?: string;
  url?: string;
}

function createFaviconPolicy(deps: FaviconPolicyDeps) {
  const {
    SETTINGS,
    SEARCH_UTILS,
    logOverlayFaviconDecision
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  function normalizeOverlaySearchBlacklistItems(items: unknown): BlacklistRule[] {
    return LumnoBlacklistUtils.normalizeItems(items, 'prefix');
  }

  function normalizeOverlayFaviconRequestBlacklistItems(items: unknown): BlacklistRule[] {
    return LumnoBlacklistUtils.normalizeItems(items, 'prefix');
  }

  function getOverlayFaviconMatchUrl(url: string): string {
    const raw = String(url || '').trim();
    return String(FaviconCanonical.getCanonicalPageUrlForFavicon(raw) || raw);
  }

  function isUrlExcludedFromOverlayFaviconRequests(url: string): boolean {
    const target = getOverlayFaviconMatchUrl(url);
    return Boolean(
      target &&
      LumnoBlacklistUtils.isUrlBlocked(target, overlayState.overlayFaviconRequestBlacklistItems)
    );
  }

  // Why icon services are off for a page: 'exclusion', 'global-off', or ''.
  function getOverlayStrictFaviconReason(pageUrl: string): string {
    if (isUrlExcludedFromOverlayFaviconRequests(pageUrl)) {
      return 'exclusion';
    }
    if (!overlayState.faviconEnhancedFetchEnabled) {
      return 'global-off';
    }
    return '';
  }

  function isOverlayEnhancedFaviconFetchEnabled(pageUrl: string): boolean {
    return getOverlayStrictFaviconReason(pageUrl) === '';
  }

  function isUrlBlockedByOverlaySearchBlacklist(url: string): boolean {
    return LumnoBlacklistUtils.isUrlBlocked(url, overlayState.overlaySearchBlacklistItems);
  }

  // Search actions and site search rows stay; they lead to no blocked page.
  function isOverlaySuggestionBlockedBySearchBlacklist(suggestion: FilterableSuggestion | null): boolean {
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
    if (suggestion.url && isUrlBlockedByOverlaySearchBlacklist(suggestion.url)) {
      return true;
    }
    return false;
  }

  function filterOverlayBlacklistedSuggestions<T extends FilterableSuggestion>(list: T[] | null): T[] {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }
    return list.filter((suggestion) => !isOverlaySuggestionBlockedBySearchBlacklist(suggestion));
  }

  function normalizeSearchResultDisplayLimit(value: unknown): number {
    return SETTINGS.searchResultDisplayLimit.parse(value);
  }

  // The rows the user's display limit allows; uncapped keeps them all.
  function limitOverlaySuggestionsForDisplay<T>(list: T[] | null, options?: { uncapped?: boolean } | null): T[] {
    const config = options && typeof options === 'object' ? options : {};
    if (config.uncapped === true) {
      return Array.isArray(list) ? list : [];
    }
    return SEARCH_UTILS.limitSearchSuggestionsForDisplay(list, {
      limit: overlayState.overlaySearchResultDisplayLimit
    });
  }

  function isLocalNetworkHost(hostname: string): boolean {
    return FaviconHostPolicy.isLocalNetworkHost(hostname);
  }

  function shouldBlockFaviconForHost(hostname: string): boolean {
    return FaviconHostPolicy.shouldBlockFaviconForHost(hostname);
  }

  function shouldBlockOverlayFaviconForHost(hostname: string): boolean {
    return shouldBlockFaviconForHost(hostname);
  }

  let overlayFaviconUrlResolver: FaviconUrlResolver | null = null;

  function getOverlayFaviconUrlResolver(): FaviconUrlResolver {
    if (!overlayFaviconUrlResolver) {
      overlayFaviconUrlResolver = FaviconResolver.createFaviconUrlResolver({
        chromeApi: chrome,
        size: 128,
        shouldBlockFaviconForHost: shouldBlockOverlayFaviconForHost,
        shouldAvoidDirectFaviconForHost: FaviconHostPolicy.shouldAvoidDirectFaviconForHost,
        isEnhancedFaviconFetchEnabled: isOverlayEnhancedFaviconFetchEnabled,
        getStrictFaviconReason: getOverlayStrictFaviconReason,
        logFaviconDecision: logOverlayFaviconDecision,
        isBlockedLocalFaviconUrl: FaviconHostPolicy.isBlockedLocalFaviconUrl
      });
    }
    return overlayFaviconUrlResolver;
  }

  function isBlockedOverlayFaviconUrl(url: string): boolean {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.isBlockedFaviconUrl(url) : false;
  }

  // Whether typed text addresses a host on the local network.
  function isLocalNetworkInput(input: string): boolean {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) {
      return false;
    }
    const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    const authority = withoutScheme.split(/[/?#]/)[0] || '';
    const host = authority.includes('@') ? authority.split('@').pop() : authority;
    const normalizedHost = (() => {
      const value = String(host || '').trim().toLowerCase();
      if (!value) {
        return '';
      }
      if (value.startsWith('[')) {
        const endBracket = value.indexOf(']');
        if (endBracket > 1) {
          return value.slice(1, endBracket);
        }
      }
      return value.replace(/^\[|\]$/g, '').split(':')[0];
    })();
    if (!normalizedHost) {
      return false;
    }
    return isLocalNetworkHost(normalizedHost);
  }

  return {
    normalizeOverlaySearchBlacklistItems,
    normalizeOverlayFaviconRequestBlacklistItems,
    getOverlayStrictFaviconReason,
    isOverlayEnhancedFaviconFetchEnabled,
    filterOverlayBlacklistedSuggestions,
    normalizeSearchResultDisplayLimit,
    limitOverlaySuggestionsForDisplay,
    isLocalNetworkHost,
    shouldBlockOverlayFaviconForHost,
    getOverlayFaviconUrlResolver,
    isBlockedOverlayFaviconUrl,
    isLocalNetworkInput
  };
}

export { createFaviconPolicy };
export type { FaviconPolicyDeps, FaviconPolicyState };
