// URL classification, favicon source policy and the search/favicon blacklists
// used by New Tab suggestions, recent sites and favicons.
import type { BlacklistRule } from '../domain/blacklist-utils';
import type * as BlacklistUtils from '../domain/blacklist-utils';
import type * as ExtensionRoutes from '../domain/extension-routes';
import type * as FaviconUtils from '../domain/favicon/favicon-utils';
import type { FaviconUrlResolver } from '../domain/favicon/favicon-utils';
import type * as LumnoSettings from '../domain/settings';
import type * as SearchUtils from '../domain/search/search-utils';
import type { StorageAreaLike } from '../domain/storage-port';
import * as LumnoUrlGuards from '../platform/url-guards';
import type { Translate } from './newtab-types';

// What the search blacklist reads from a suggestion.
interface BlacklistableSuggestion {
  type?: string;
  url?: string;
}

interface UrlPolicyState {
  searchBlacklistItems: BlacklistRule[];
  faviconRequestBlacklistItems: BlacklistRule[];
  faviconEnhancedFetchEnabled: boolean;
  searchResultDisplayLimit: number;
}

interface UrlPolicyDeps {
  EXTENSION_ROUTES: Pick<typeof ExtensionRoutes, 'classifyExtensionUrl'>;
  t: Translate;
  getPageFaviconUrlResolver(): FaviconUrlResolver | null;
  FAVICON_UTILS: Pick<typeof FaviconUtils,
    'isLocalNetworkHost' | 'shouldBlockFaviconForHost' | 'shouldAvoidDirectFaviconForHost' | 'getCanonicalPageUrlForFavicon'>;
  BLACKLIST_UTILS: Pick<typeof BlacklistUtils, 'normalizeItems' | 'isUrlBlocked'>;
  SETTINGS: Pick<typeof LumnoSettings, 'faviconEnhancedFetchEnabled'>;
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  SEARCH_BLACKLIST_STORAGE_KEY: string;
  FAVICON_REQUEST_BLACKLIST_STORAGE_KEY: string;
  FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY: string;
  SEARCH_UTILS: Pick<typeof SearchUtils, 'limitSearchSuggestionsForDisplay'>;
  // The browser's own icon for a page, where _favicon is missing (Firefox).
  getBrowserIconUrl?: (pageUrl: string) => string;
  pageState: UrlPolicyState;
}

function createUrlPolicy(deps: UrlPolicyDeps) {
  const {
    EXTENSION_ROUTES,
    t,
    getPageFaviconUrlResolver,
    FAVICON_UTILS,
    BLACKLIST_UTILS,
    SETTINGS,
    storageArea,
    SEARCH_BLACKLIST_STORAGE_KEY,
    FAVICON_REQUEST_BLACKLIST_STORAGE_KEY,
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY,
    SEARCH_UTILS,
    getBrowserIconUrl
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function isEnglishQuery(query: string | null | undefined): boolean {
    if (!query) {
      return false;
    }
    return /^[A-Za-z0-9\s._/-]+$/.test(query);
  }

  function getUrlDisplay(url: string | null | undefined): string {
    if (!url) {
      return '';
    }
    const ownExtensionDisplay = getOwnExtensionPageDisplay(url);
    if (ownExtensionDisplay) {
      return ownExtensionDisplay.urlText;
    }
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.replace(/^www\./i, '');
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return `${host}${path}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      return url;
    }
  }

  function isBrowserExtensionProtocol(protocol: unknown): boolean {
    const guards = LumnoUrlGuards;
    return guards.isBrowserExtensionProtocol(protocol);
  }

  function isBrowserNewtabUrl(url: unknown): boolean {
    const guards = LumnoUrlGuards;
    return guards.isBrowserNewtabUrl(url);
  }

  function isBrowserInternalUrl(url: unknown): boolean {
    const guards = LumnoUrlGuards;
    return guards.isBrowserInternalUrl(url);
  }

  function isBrowserPageRecentUrl(url: string | null | undefined): boolean {
    return Boolean(url && isBrowserInternalUrl(url) && !isBrowserNewtabUrl(url));
  }

  function isOwnExtensionUrl(url: string | null | undefined): boolean {
    if (!url || !chrome || !chrome.runtime || !chrome.runtime.id) {
      return false;
    }
    try {
      const parsed = new URL(url);
      return isBrowserExtensionProtocol(parsed.protocol) &&
        String(parsed.hostname || '') === String(chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function getOwnExtensionPageLabel(url: string | null | undefined): string {
    if (!url || !isOwnExtensionUrl(url)) {
      return '';
    }
    try {
      const routeType = EXTENSION_ROUTES.classifyExtensionUrl(url);
      if (routeType === 'newtab') {
        return t('newtab_page_label', '新标签页');
      }
      if (routeType === 'options') {
        return t('settings_title', '设置');
      }
      const parsed = new URL(url);
      const path = String(parsed.pathname || '').toLowerCase();
      if (path.endsWith('/newtab.html') || path === '/newtab.html') {
        return t('newtab_page_label', '新标签页');
      }
      if (path.endsWith('/options.html') || path === '/options.html') {
        return t('settings_title', '设置');
      }
      return t('extension_page_label', '扩展页面');
    } catch {
      return t('extension_page_label', '扩展页面');
    }
  }

  function getOwnExtensionPageDisplay(
    url: string | null | undefined,
    title?: unknown
  ): { siteName: string; titleText: string; urlText: string } | null {
    if (!isOwnExtensionUrl(url)) {
      return null;
    }
    const pageLabel = getOwnExtensionPageLabel(url);
    const rawTitle = String(title || '').trim();
    const runtimeId = String(chrome && chrome.runtime && chrome.runtime.id ? chrome.runtime.id : '').toLowerCase();
    const titleLooksLikeId = rawTitle && runtimeId && rawTitle.toLowerCase().includes(runtimeId);
    const titleText = rawTitle && !titleLooksLikeId
      ? rawTitle
      : `Lumno ${pageLabel}`.trim();
    return {
      siteName: 'Lumno',
      titleText: titleText,
      urlText: `Lumno · ${pageLabel}`.trim()
    };
  }

  function getExtensionFaviconUrl(pageUrl: string): string {
    const resolver = getPageFaviconUrlResolver();
    const extensionUrl = resolver ? resolver.getExtensionFaviconUrl(pageUrl) : '';
    // Without _favicon (Firefox), the browser's own icons stand in for it.
    return extensionUrl || (typeof getBrowserIconUrl === 'function' ? getBrowserIconUrl(pageUrl) : '');
  }

  function getGstaticFaviconUrl(pageUrl: string): string {
    const resolver = getPageFaviconUrlResolver();
    return resolver ? resolver.getGstaticFaviconUrl(pageUrl) : '';
  }

  function getChromeFaviconUrl(pageUrl: string): string {
    const resolver = getPageFaviconUrlResolver();
    return resolver ? resolver.getChromeFaviconUrl(pageUrl) : '';
  }

  function getBrowserPageFaviconUrl(pageUrl: string): string {
    const resolver = getPageFaviconUrlResolver();
    return resolver ? resolver.getBrowserPageFaviconUrl(pageUrl) : '';
  }

  function getPageFaviconCandidateUrl(pageUrl: string): string {
    const resolver = getPageFaviconUrlResolver();
    return resolver ? resolver.getPageFaviconCandidateUrl(pageUrl) : '';
  }

  function getPageFaviconRenderCandidates(
    pageUrl: Parameters<FaviconUrlResolver['getPageFaviconRenderCandidates']>[0],
    explicitUrl?: Parameters<FaviconUrlResolver['getPageFaviconRenderCandidates']>[1],
    options?: Parameters<FaviconUrlResolver['getPageFaviconRenderCandidates']>[2]
  ): ReturnType<FaviconUrlResolver['getPageFaviconRenderCandidates']> {
    const resolver = getPageFaviconUrlResolver();
    return resolver && typeof resolver.getPageFaviconRenderCandidates === 'function'
      ? resolver.getPageFaviconRenderCandidates(pageUrl, explicitUrl, options)
      : { primaryUrl: '', browserUrl: '' };
  }

  function isLocalNetworkHost(hostname: string): boolean {
    return FAVICON_UTILS.isLocalNetworkHost(hostname);
  }

  function shouldBlockFaviconForHost(hostname: string): boolean {
    return FAVICON_UTILS.shouldBlockFaviconForHost(hostname);
  }

  function shouldAvoidDirectFaviconForHost(hostname: string): boolean {
    return FAVICON_UTILS.shouldAvoidDirectFaviconForHost(hostname);
  }

  function normalizeSearchBlacklistItems(items: unknown): BlacklistRule[] {
    if (BLACKLIST_UTILS.normalizeItems) {
      return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
    }
    return [];
  }

  function normalizeFaviconRequestBlacklistItems(items: unknown): BlacklistRule[] {
    if (BLACKLIST_UTILS.normalizeItems) {
      return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
    }
    return [];
  }

  function normalizeFaviconEnhancedFetchEnabled(value: unknown): boolean {
    return SETTINGS.faviconEnhancedFetchEnabled.parse(value);
  }

  function loadSearchBlacklistItems(): Promise<BlacklistRule[]> {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve([]);
        return;
      }
      void storageArea.get([SEARCH_BLACKLIST_STORAGE_KEY], (result) => {
        const items = normalizeSearchBlacklistItems(result && result[SEARCH_BLACKLIST_STORAGE_KEY]);
        pageState.searchBlacklistItems = items;
        resolve(items);
      });
    });
  }

  function getFaviconRequestMatchUrl(url: unknown): string {
    const raw = String(url || '').trim();
    if (!raw) {
      return '';
    }
    return String(FAVICON_UTILS.getCanonicalPageUrlForFavicon(raw) || raw).trim();
  }

  function isUrlBlockedByFaviconRequestBlacklist(url: unknown): boolean {
    const target = getFaviconRequestMatchUrl(url);
    return Boolean(
      target &&
      BLACKLIST_UTILS.isUrlBlocked &&
      BLACKLIST_UTILS.isUrlBlocked(target, pageState.faviconRequestBlacklistItems)
    );
  }

  function getNewtabStrictFaviconReason(pageUrl: unknown): '' | 'exclusion' | 'global-off' {
    if (isUrlBlockedByFaviconRequestBlacklist(pageUrl)) {
      return 'exclusion';
    }
    if (!pageState.faviconEnhancedFetchEnabled) {
      return 'global-off';
    }
    return '';
  }

  function isNewtabEnhancedFaviconFetchEnabled(pageUrl: unknown): boolean {
    return getNewtabStrictFaviconReason(pageUrl) === '';
  }

  function loadFaviconRequestBlacklistItems(): Promise<BlacklistRule[]> {
    return new Promise((resolve) => {
      if (!storageArea) {
        resolve([]);
        return;
      }
      void storageArea.get([FAVICON_REQUEST_BLACKLIST_STORAGE_KEY], (result) => {
        const items = normalizeFaviconRequestBlacklistItems(result && result[FAVICON_REQUEST_BLACKLIST_STORAGE_KEY]);
        pageState.faviconRequestBlacklistItems = items;
        resolve(items);
      });
    });
  }

  function loadFaviconEnhancedFetchEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!storageArea) {
        pageState.faviconEnhancedFetchEnabled = true;
        resolve(true);
        return;
      }
      void storageArea.get([FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY];
        const enabled = normalizeFaviconEnhancedFetchEnabled(rawValue);
        pageState.faviconEnhancedFetchEnabled = enabled;
        if (rawValue !== enabled) {
          void storageArea.set({ [FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]: enabled });
        }
        resolve(enabled);
      });
    });
  }

  function isUrlBlockedBySearchBlacklist(url: unknown): boolean {
    return BLACKLIST_UTILS.isUrlBlocked
      ? BLACKLIST_UTILS.isUrlBlocked(url, pageState.searchBlacklistItems)
      : false;
  }

  function isSuggestionBlockedBySearchBlacklist(suggestion: BlacklistableSuggestion | null | undefined): boolean {
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
    if (suggestion.url && isUrlBlockedBySearchBlacklist(suggestion.url)) {
      return true;
    }
    return false;
  }

  function filterBlacklistedSuggestions<T extends BlacklistableSuggestion>(
    list: readonly T[] | null | undefined,
    _queryForProvider?: unknown
  ): T[] {
    if (!list || list.length === 0) {
      return [];
    }
    return list.filter((suggestion) => !isSuggestionBlockedBySearchBlacklist(suggestion));
  }

  function limitSuggestionsForDisplay<T>(list: T[] | null | undefined, options?: { uncapped?: boolean } | null): T[] {
    const config = options && typeof options === 'object' ? options : {};
    if (config.uncapped === true) {
      return list || [];
    }
    return SEARCH_UTILS.limitSearchSuggestionsForDisplay(list, {
      limit: pageState.searchResultDisplayLimit
    });
  }

  function shouldExcludeFromRecentSites(url: string | null | undefined): boolean {
    if (!url) {
      return true;
    }
    if (isBrowserNewtabUrl(url)) {
      return true;
    }
    try {
      const parsed = new URL(url);
      if (isBrowserExtensionProtocol(parsed.protocol)) {
        return true;
      }
      return isUrlBlockedBySearchBlacklist(parsed.toString());
    } catch {
      return true;
    }
  }

  return {
    isEnglishQuery,
    getUrlDisplay,
    isBrowserPageRecentUrl,
    isOwnExtensionUrl,
    getOwnExtensionPageDisplay,
    getExtensionFaviconUrl,
    getGstaticFaviconUrl,
    getChromeFaviconUrl,
    getBrowserPageFaviconUrl,
    getPageFaviconCandidateUrl,
    getPageFaviconRenderCandidates,
    isLocalNetworkHost,
    shouldBlockFaviconForHost,
    shouldAvoidDirectFaviconForHost,
    normalizeSearchBlacklistItems,
    normalizeFaviconRequestBlacklistItems,
    normalizeFaviconEnhancedFetchEnabled,
    loadSearchBlacklistItems,
    isUrlBlockedByFaviconRequestBlacklist,
    getNewtabStrictFaviconReason,
    isNewtabEnhancedFaviconFetchEnabled,
    loadFaviconRequestBlacklistItems,
    loadFaviconEnhancedFetchEnabled,
    filterBlacklistedSuggestions,
    limitSuggestionsForDisplay,
    shouldExcludeFromRecentSites
  };
}

type UrlPolicy = ReturnType<typeof createUrlPolicy>;

export { createUrlPolicy };
export type { UrlPolicy, UrlPolicyDeps, UrlPolicyState };
