// Which favicons the overlay may fetch: the search and favicon
// blacklists, local network hosts, and the display limit for results.
import * as LumnoBlacklistUtils from '../../shared/blacklist-utils.js';

function createFaviconPolicy(deps) {
  const {
    FAVICON_UTILS,
    SETTINGS,
    SEARCH_UTILS,
    logOverlayFaviconDecision
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  function normalizeOverlaySearchBlacklistItems(items) {
    return LumnoBlacklistUtils.normalizeItems(items, 'prefix');
  }

  function normalizeOverlayFaviconRequestBlacklistItems(items) {
    return LumnoBlacklistUtils.normalizeItems(items, 'prefix');
  }

  function getOverlayFaviconMatchUrl(url) {
    const raw = String(url || '').trim();
    return String(FAVICON_UTILS.getCanonicalPageUrlForFavicon(raw) || raw);
  }

  function isUrlExcludedFromOverlayFaviconRequests(url) {
    const target = getOverlayFaviconMatchUrl(url);
    return Boolean(
      target &&
      LumnoBlacklistUtils &&
      LumnoBlacklistUtils.isUrlBlocked(target, overlayState.overlayFaviconRequestBlacklistItems)
    );
  }

  function getOverlayStrictFaviconReason(pageUrl) {
    if (isUrlExcludedFromOverlayFaviconRequests(pageUrl)) {
      return 'exclusion';
    }
    if (!overlayState.faviconEnhancedFetchEnabled) {
      return 'global-off';
    }
    return '';
  }

  function isOverlayEnhancedFaviconFetchEnabled(pageUrl) {
    return getOverlayStrictFaviconReason(pageUrl) === '';
  }

  function isUrlBlockedByOverlaySearchBlacklist(url) {
    return LumnoBlacklistUtils.isUrlBlocked(url, overlayState.overlaySearchBlacklistItems);
  }

  function isOverlaySuggestionBlockedBySearchBlacklist(suggestion, queryForProvider) {
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

  function filterOverlayBlacklistedSuggestions(list, queryForProvider) {
    if (!Array.isArray(list) || list.length === 0) {
      return [];
    }
    return list.filter((suggestion) => !isOverlaySuggestionBlockedBySearchBlacklist(suggestion, queryForProvider));
  }

  function normalizeSearchResultDisplayLimit(value) {
    return SETTINGS.normalizeSearchResultDisplayLimit(value);
  }

  function limitOverlaySuggestionsForDisplay(list, options) {
    const config = options && typeof options === 'object' ? options : {};
    if (config.uncapped === true) {
      return Array.isArray(list) ? list : [];
    }
    return SEARCH_UTILS.limitSearchSuggestionsForDisplay(list, {
      limit: overlayState.overlaySearchResultDisplayLimit
    });
  }

  function isLocalNetworkHost(hostname) {
    return FAVICON_UTILS.isLocalNetworkHost(hostname);
  }

  function shouldBlockFaviconForHost(hostname) {
    return FAVICON_UTILS.shouldBlockFaviconForHost(hostname);
  }

  function shouldBlockOverlayFaviconForHost(hostname) {
    return shouldBlockFaviconForHost(hostname);
  }

  let overlayFaviconUrlResolver = null;

  function getOverlayFaviconUrlResolver() {
    if (!overlayFaviconUrlResolver) {
      overlayFaviconUrlResolver = FAVICON_UTILS.createFaviconUrlResolver({
        chromeApi: chrome,
        size: 128,
        shouldBlockFaviconForHost: shouldBlockOverlayFaviconForHost,
        shouldAvoidDirectFaviconForHost: FAVICON_UTILS.shouldAvoidDirectFaviconForHost,
        isEnhancedFaviconFetchEnabled: isOverlayEnhancedFaviconFetchEnabled,
        getStrictFaviconReason: getOverlayStrictFaviconReason,
        logFaviconDecision: logOverlayFaviconDecision,
        isBlockedLocalFaviconUrl: FAVICON_UTILS.isBlockedLocalFaviconUrl
      });
    }
    return overlayFaviconUrlResolver;
  }

  function isBlockedOverlayFaviconUrl(url) {
    const resolver = getOverlayFaviconUrlResolver();
    return resolver ? resolver.isBlockedFaviconUrl(url) : false;
  }

  function isLocalNetworkInput(input) {
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
