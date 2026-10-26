// Search suggestions for the overlay and New Tab: local sources (open tabs,
// history, top sites, bookmarks) with their short-lived caches, title pinyin
// matching, remote search-engine suggestions, the default search engine, site
// search providers, the search blacklist and selection stats.
//
// A module of the service worker; background.ts imports it before its own code
// runs.
//
// Every cache and promise below is a rebuildable in-memory cache; nothing here
// must survive a service-worker suspension.

import * as BLACKLIST_UTILS from '../domain/blacklist-utils';
import * as BROWSER_PROFILE from '../platform/browser-profile';
import * as FAVICON_UTILS from '../domain/favicon/favicon-utils';
import * as SEARCH_UTILS from '../domain/search/search-utils';
import * as SETTINGS from '../domain/settings';
import {
  DEFAULT_SEARCH_ENGINE_STORAGE_KEY,
  SEARCH_BLACKLIST_STORAGE_KEY,
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
  SITE_SEARCH_DISABLED_STORAGE_KEY,
  SITE_SEARCH_STORAGE_KEY
} from '../domain/settings';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import { loadWorkerLazyModule } from '../platform/worker-lazy';
import { readPinyinApi } from '../domain/search/pinyin-api';
import { PINYIN_DATA_SCRIPT_PATH, getImportScripts, localStorageArea, normalizeHost, storageArea } from './worker-context';
import {
  getFaviconFallbackHost,
  getHostFaviconUrl,
  getPageFaviconCandidateUrl,
  isBrowserInternalPageUrl,
  loadFaviconEnhancedFetchEnabled,
  loadFaviconRequestBlacklistItems,
  scheduleSiteSearchProviderIconWarmup,
  shouldBlockFaviconForHost
} from './favicon-service';
import {
  getOwnExtensionFaviconUrl,
  getResolvedTabUrl,
  getSourceTabGroupContext,
  isOwnExtensionUrl
} from './browser-urls-service';
import type { BlacklistRule } from '../domain/blacklist-utils';
import type {
  BrowserItem,
  NormalizedSiteSearchProvider,
  SearchPolicy,
  SearchQueryContext,
  SearchRankingOptions,
  SearchSelectionStats,
  SearchSourceType,
  SearchTextMatcher,
  SiteSearchProvider,
  SuggestionLike
} from '../domain/search/types';
import type { PinyinApi } from '../domain/search/pinyin-api';
import type { TabGroupContext } from './tab-groups';
import type { MessageSender } from './message-router';

// A suggestion row as the surfaces get it: the ranking's fields plus
// whatever the row carries for display.
type SuggestionRow = SuggestionLike & Record<string, unknown>;

// The default search engine this device last searched with.
interface DefaultSearchEngineState {
  id: string;
  name: string;
  host: string;
  searchTemplate: string;
  updatedAt: number;
}

interface SearchEngineDef {
  id: string;
  name: string;
  hostMatches: string[];
  searchTemplate: string;
  searchUrl(query: string): string;
}

// A short-lived copy of a browser source.
interface TimedCache<T> {
  expiresAt: number;
  items: T[];
}

interface BookmarkNodeInfo {
  title: string;
  parentId: string | null;
  hasUrl: boolean;
}

interface BookmarkItem extends BrowserItem {
  id: string;
  parentId: string | null;
  title: string;
}

interface OpenTabItem extends BrowserItem {
  title: string;
  _xMatchedTabId: number;
}

// One search engine suggestion fetch, shared by the prefetch and the request
// that consumes it.
interface EngineSuggestionRequest {
  requestKey: string;
  query: string;
  controller: AbortController;
  startTimer: ReturnType<typeof setTimeout> | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  // The engine's raw answer, read by normalizeSearchEngineSuggestions.
  promise: Promise<unknown[]> | null;
  consumed: boolean;
}

interface SearchSuggestionOptions {
  sourceTypes?: unknown;
  includeOpenTabs?: unknown;
  // Retry with the query read in other keyboard layouts when nothing matched.
  keyboardLayoutRetry?: boolean;
}

interface EngineSuggestionOptions {
  signal?: AbortSignal | null;
  rawEngineSuggestionsPromise?: Promise<unknown> | null;
  searchFirst?: boolean;
}

type HistoryRemoval = { allHistory: boolean; urls?: string[] };

// A page from one of the local sources, as ranking reads it.
interface SourceItem {
  id?: string | number;
  url?: string;
  title?: string;
  parentId?: string | null;
  lastVisitTime?: number;
  visitCount?: number;
  typedCount?: number;
  type?: string;
  isTopSite?: boolean;
  _xMatchedTabId?: number;
}

// Extra fields createSearchSuggestion copies onto a row.
interface RowExtras {
  favicon?: string;
  reasons?: string[];
  [field: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The ranking's fields of a row a page sent back, each kept only when it has
// the expected type; the row's other fields pass through.
const SUGGESTION_FIELD_CHECKS: Readonly<Record<string, (value: unknown) => boolean>> = Object.freeze({
  type: (value: unknown) => typeof value === 'string',
  url: (value: unknown) => typeof value === 'string',
  title: (value: unknown) => typeof value === 'string',
  score: (value: unknown) => typeof value === 'number',
  isTopSite: (value: unknown) => typeof value === 'boolean',
  selectionBoost: (value: unknown) => typeof value === 'number',
  lastVisitTime: (value: unknown) => typeof value === 'number',
  visitCount: (value: unknown) => typeof value === 'number',
  typedCount: (value: unknown) => typeof value === 'number',
  _xMatchedTabId: (value: unknown) => typeof value === 'number'
});

function readSuggestionRow(value: unknown): SuggestionRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const row: SuggestionRow = {};
  Object.keys(value).forEach((key) => {
    const check = Object.prototype.hasOwnProperty.call(SUGGESTION_FIELD_CHECKS, key) ? SUGGESTION_FIELD_CHECKS[key] : null;
    if (!check || check(value[key])) {
      row[key] = value[key];
    }
  });
  return row;
}

// Which suggestion the user picked for a query; device-only, in local storage.
export const SEARCH_SELECTION_STATS_STORAGE_KEY = '_x_extension_search_selection_stats_2026_unique_';

export function getSearchEngineSuggestionRequestKey(request: { context?: unknown } | null | undefined, sender: MessageSender | null | undefined): string {
  const senderTabId = sender && sender.tab && typeof sender.tab.id === 'number'
    ? sender.tab.id
    : 'extension';
  const senderFrameId = sender && typeof sender.frameId === 'number' ? sender.frameId : 0;
  const context = request && request.context ? String(request.context) : 'unknown';
  return `${senderTabId}:${senderFrameId}:${context}`;
}

export function deleteHistoryUrlFromSearch(
  targetUrl: string,
  sendResponse: (reply: { ok: boolean; reason?: string; url?: string }) => void
): true | void {
  if (!targetUrl) {
    sendResponse({ ok: false, reason: 'invalid-url' });
    return;
  }
  if (!chrome.history || typeof chrome.history.deleteUrl !== 'function') {
    sendResponse({ ok: false, reason: 'history-api-unavailable' });
    return;
  }
  chrome.history.deleteUrl({ url: targetUrl }, () => {
    if (chrome.runtime && chrome.runtime.lastError) {
      sendResponse({ ok: false, reason: chrome.runtime.lastError.message || 'delete-history-failed' });
      return;
    }
    invalidateLocalSearchSourceCaches();
    sendResponse({ ok: true, url: targetUrl });
  });
  return true;
}

export let siteSearchCache: SiteSearchProvider[] | null = null;

let siteSearchPromise: Promise<SiteSearchProvider[]> | null = null;

let siteSearchLoadGeneration = 0;

let searchBlacklistCache: BlacklistRule[] | null = null;

let searchBlacklistPromise: Promise<BlacklistRule[]> | null = null;

let searchResultSourceTypesCache: SearchSourceType[] | null = null;

let searchResultSourceTypesPromise: Promise<SearchSourceType[]> | null = null;

let searchSelectionStatsCache: SearchSelectionStats | null = null;

let searchSelectionStatsPromise: Promise<SearchSelectionStats> | null = null;

// Storage listeners call these when the stored values change elsewhere.
export function invalidateSearchBlacklistCache(): void {
  searchBlacklistCache = null;
  searchBlacklistPromise = null;
}

export function invalidateSearchResultSourceTypesCache(): void {
  searchResultSourceTypesCache = null;
  searchResultSourceTypesPromise = null;
}

export function replaceSearchSelectionStatsCache(stats: SearchSelectionStats): void {
  searchSelectionStatsCache = stats;
  searchSelectionStatsPromise = null;
}

const SEARCH_ENGINE_SUGGEST_TIMEOUT_MS = 900;

const SEARCH_ENGINE_SUGGEST_PREFETCH_DELAY_MS = 120;

const SEARCH_ENGINE_SUGGEST_PREFETCH_RETENTION_MS = 1500;

const LOCAL_SUGGEST_SOURCE_TIMEOUT_MS = 800;

const LOCAL_SEARCH_INDEX_WARMUP_TIMEOUT_MS = 80;

const HISTORY_FALLBACK_CACHE_TTL_MS = 45 * 1000;

const TOP_SITES_CACHE_TTL_MS = 30 * 1000;

const BOOKMARK_TREE_CACHE_TTL_MS = 2 * 60 * 1000;

let historyFallbackCache: TimedCache<chrome.history.HistoryItem> = {
  expiresAt: 0,
  items: []
};

// History pages whose titles hold Han characters, from further back than the
// recent list. Pinyin and initials ("wxds") can only be matched against
// titles already in hand, because the browser's history search reads typed
// text. New visits land in the recent list, so this one only refreshes on a
// long interval; removed history leaves it at once.
const HAN_TITLE_HISTORY_CACHE_TTL_MS = 10 * 60 * 1000;

let hanTitleHistoryCache: TimedCache<chrome.history.HistoryItem> = {
  expiresAt: 0,
  items: []
};

let hanTitleHistoryRequest: Promise<chrome.history.HistoryItem[]> | null = null;

let topSitesCache: TimedCache<chrome.topSites.MostVisitedURL> = {
  expiresAt: 0,
  items: []
};

let localSearchSourceCacheListenersBound = false;

let bookmarkTreeIndexCache: { expiresAt: number; map: Map<string, BookmarkNodeInfo> | null } = {
  expiresAt: 0,
  map: null
};

let bookmarkItemsCache: TimedCache<BookmarkItem> = {
  expiresAt: 0,
  items: []
};

let bookmarkItemsPromise: Promise<BookmarkItem[]> | null = null;

let bookmarkTreeCacheListenersBound = false;

export const searchEngineSuggestionRequests = new Map<string, EngineSuggestionRequest>();

// Titles whose units (and pinyin readings) were built for matching, about
// 1 KB each. It holds the Han-title history and the bookmarks, so typing one
// more letter never rebuilds them.
const BACKGROUND_TITLE_PINYIN_CACHE_MAX_ENTRIES = 6144;

let titleTextMatcher: SearchTextMatcher | null = null;

// Fuzzy pinyin (模糊音) is off unless the reader turns it on in Options.
let searchFuzzyPinyinEnabled = false;
let searchFuzzyPinyinEnabledLoaded = false;
let searchFuzzyPinyinEnabledPromise: Promise<boolean> | null = null;

const SEARCH_ENGINE_DEFS: readonly SearchEngineDef[] = [
  {
    id: 'google',
    name: 'Google',
    hostMatches: ['google.'],
    searchTemplate: 'https://www.google.com/search?q={query}',
    searchUrl: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: 'kagi',
    name: 'Kagi',
    hostMatches: ['kagi.com'],
    searchTemplate: 'https://kagi.com/search?q={query}',
    searchUrl: (query) => `https://kagi.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: 'bing',
    name: 'Bing',
    hostMatches: ['bing.com'],
    searchTemplate: 'https://www.bing.com/search?q={query}',
    searchUrl: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}`
  },
  {
    id: 'baidu',
    name: 'Baidu',
    hostMatches: ['baidu.com'],
    searchTemplate: 'https://www.baidu.com/s?wd={query}',
    searchUrl: (query) => `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    hostMatches: ['duckduckgo.com'],
    searchTemplate: 'https://duckduckgo.com/?q={query}',
    searchUrl: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    hostMatches: ['search.yahoo.com'],
    searchTemplate: 'https://search.yahoo.com/search?p={query}',
    searchUrl: (query) => `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`
  },
  {
    id: 'yandex',
    name: 'Yandex',
    hostMatches: ['yandex.com'],
    searchTemplate: 'https://yandex.com/search/?text={query}',
    searchUrl: (query) => `https://yandex.com/search/?text=${encodeURIComponent(query)}`
  },
  {
    id: 'sogou',
    name: '搜狗',
    hostMatches: ['sogou.com'],
    searchTemplate: 'https://www.sogou.com/web?query={query}',
    searchUrl: (query) => `https://www.sogou.com/web?query=${encodeURIComponent(query)}`
  },
  {
    id: 'shenma',
    name: '神马',
    hostMatches: ['sm.cn'],
    searchTemplate: 'https://m.sm.cn/s?q={query}',
    searchUrl: (query) => `https://m.sm.cn/s?q=${encodeURIComponent(query)}`
  }
];

let defaultSearchEngineState: DefaultSearchEngineState = {
  id: 'google',
  name: 'Google',
  host: 'www.google.com',
  searchTemplate: 'https://www.google.com/search?q={query}',
  updatedAt: 0
};

let defaultSearchEngineStateReady: Promise<DefaultSearchEngineState> = Promise.resolve(defaultSearchEngineState);

// A search the overlay or New Tab handed to the browser's default engine:
// its results tab is found as it opens, and joins the source tab's group.
export let pendingSearchAt = 0;

export let pendingSearchTabId: number | null = null;

export let pendingSearchGroupContext: TabGroupContext | null = null;

function getSearchEngineByHostname(hostname: unknown): SearchEngineDef | null {
  const normalized = normalizeHost(hostname);
  if (!normalized) {
    return null;
  }
  return SEARCH_ENGINE_DEFS.find((engine) =>
    engine.hostMatches.some((match) => normalized.includes(match))
  ) || null;
}

function getSearchEngineById(id: unknown): SearchEngineDef | null {
  if (!id) {
    return null;
  }
  return SEARCH_ENGINE_DEFS.find((engine) => engine.id === id) || null;
}

export function setDefaultSearchEngineState(nextState: unknown, shouldPersist: boolean): void {
  if (!isRecord(nextState) || !nextState.id) {
    return;
  }
  const engine = getSearchEngineById(nextState.id);
  const updated: DefaultSearchEngineState = {
    id: String(nextState.id),
    name: String(nextState.name || ''),
    host: String(nextState.host || ''),
    searchTemplate: String(nextState.searchTemplate || (engine ? engine.searchTemplate : '')),
    updatedAt: Number(nextState.updatedAt) || Date.now()
  };
  defaultSearchEngineState = updated;
  if (shouldPersist && storageArea) {
    storageArea.set({ [DEFAULT_SEARCH_ENGINE_STORAGE_KEY]: updated });
  }
}

// Re-reads the stored default engine; callers wait on defaultSearchEngineStateReady.
export function refreshDefaultSearchEngineState(): void {
  defaultSearchEngineStateReady = loadDefaultSearchEngineState();
}

function loadDefaultSearchEngineState(): Promise<DefaultSearchEngineState> {
  if (!storageArea) {
    return Promise.resolve(defaultSearchEngineState);
  }
  return new Promise((resolve) => {
    storageArea.get([DEFAULT_SEARCH_ENGINE_STORAGE_KEY], (result) => {
      const stored = result ? result[DEFAULT_SEARCH_ENGINE_STORAGE_KEY] : null;
      if (isRecord(stored) && stored.id) {
        if (SEARCH_UTILS.isRetiredSearchEngineState({
          id: typeof stored.id === 'string' ? stored.id : undefined,
          host: typeof stored.host === 'string' ? stored.host : undefined,
          searchTemplate: typeof stored.searchTemplate === 'string' ? stored.searchTemplate : undefined
        })) {
          setDefaultSearchEngineState({
            id: 'google',
            name: 'Google',
            host: 'www.google.com',
            searchTemplate: 'https://www.google.com/search?q={query}',
            updatedAt: Date.now()
          }, true);
        } else {
          setDefaultSearchEngineState(stored, false);
        }
      }
      resolve(defaultSearchEngineState);
    });
  });
}

export function isSearchEngineResultUrl(url: unknown): boolean {
  try {
    const parsedUrl = new URL(String(url));
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return false;
    }
    const hostname = parsedUrl.hostname.toLowerCase();
    const engine = SEARCH_ENGINE_DEFS.find((candidate) =>
      candidate.hostMatches.some((match) => {
        if (match === 'google.') {
          return /(^|\.)google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})$/.test(hostname);
        }
        return hostname === match || hostname.endsWith(`.${match}`);
      })
    );
    if (!engine) {
      return false;
    }
    const queryMarker = '__lumno_search_query__';
    const searchUrl = new URL(engine.searchTemplate.replace('{query}', queryMarker));
    const normalizePath = (value: string): string => value.toLowerCase().replace(/\/+$/, '') || '/';
    // A prefix such as /web also matches ordinary pages like /webstore.
    if (normalizePath(parsedUrl.pathname) !== normalizePath(searchUrl.pathname)) {
      return false;
    }
    const queryParam = Array.from(searchUrl.searchParams.entries())
      .find(([, value]) => value === queryMarker);
    return Boolean(queryParam && String(parsedUrl.searchParams.get(queryParam[0]) || '').trim());
  } catch (_error) {
    return false;
  }
}

export function updateDefaultSearchEngineFromUrl(url: unknown): boolean {
  if (!url || !isSearchEngineResultUrl(url)) {
    return false;
  }
  try {
    const parsedUrl = new URL(String(url));
    const engine = getSearchEngineByHostname(parsedUrl.hostname);
    if (!engine) {
      return false;
    }
    setDefaultSearchEngineState({
      id: engine.id,
      name: engine.name,
      host: normalizeHost(parsedUrl.hostname),
      searchTemplate: engine.searchTemplate,
      updatedAt: Date.now()
    }, true);
    return true;
  } catch (_error) {
    return false;
  }
}

export function buildDefaultSearchUrl(query: string): string {
  const engine = getSearchEngineById(defaultSearchEngineState.id);
  if (engine && typeof engine.searchUrl === 'function') {
    return engine.searchUrl(query);
  }
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function getDirectNavigationUrl(input: unknown): string {
  return SEARCH_UTILS.getDirectNavigationUrl(input);
}

function getDefaultSearchEngineFaviconUrl(): string {
  if (defaultSearchEngineState.id === 'google') {
    return 'https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png';
  }
  if (defaultSearchEngineState.host) {
    return `https://${defaultSearchEngineState.host}/favicon.ico`;
  }
  const engine = getSearchEngineById(defaultSearchEngineState.id);
  if (engine) {
    try {
      const host = new URL(engine.searchUrl('test')).hostname;
      return `https://${host}/favicon.ico`;
    } catch (_error) {
      return '';
    }
  }
  return 'https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png';
}

function parseJsonpPayload(text: string): unknown {
  if (!text) {
    return null;
  }
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) {
    return null;
  }
  const payload = text.slice(start + 1, end);
  try {
    return JSON.parse(payload);
  } catch (_error) {
    return null;
  }
}

function extractJsonArray(text: string): unknown {
  if (!text) {
    return null;
  }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return null;
  }
  const payload = text.slice(start, end + 1);
  try {
    return JSON.parse(payload);
  } catch (_error) {
    return null;
  }
}

// What a suggestion service answered; the parsers below check its shape.
async function fetchJson(url: string, options?: { signal?: AbortSignal } | null): Promise<unknown> {
  if (!url) {
    return null;
  }
  const settings = options && typeof options === 'object' ? options : {};
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    ...(settings.signal ? { signal: settings.signal } : {})
  });
  if (!response || !response.ok) {
    return null;
  }
  const data: unknown = await response.json();
  return data;
}

async function fetchText(url: string, options?: { signal?: AbortSignal } | null): Promise<string> {
  if (!url) {
    return '';
  }
  const settings = options && typeof options === 'object' ? options : {};
  const response = await fetch(url, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    ...(settings.signal ? { signal: settings.signal } : {})
  });
  if (!response || !response.ok) {
    return '';
  }
  return response.text();
}

// The values of a list field of a suggestion service's answer.
function readField(list: unknown, field: string): unknown[] {
  return Array.isArray(list) ? list.map((item: unknown) => (isRecord(item) ? item[field] : null)).filter(Boolean) : [];
}

function readSecondList(data: unknown): unknown[] | null {
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : null;
}

async function fetchSearchSuggestionsForEngine(query: string, options?: { signal?: AbortSignal } | null): Promise<unknown[]> {
  const engineId = defaultSearchEngineState.id;
  const settings = options && typeof options === 'object' ? options : {};
  // A URL, host or path (the prefilled current page among them) stays local.
  if (!query || !engineId || SEARCH_UTILS.isUrlLikeSearchQuery(query)) {
    return [];
  }
  try {
    if (engineId === 'google') {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
      return readSecondList(await fetchJson(url, settings)) || [];
    }
    if (engineId === 'bing') {
      const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`;
      return readSecondList(await fetchJson(url, settings)) || [];
    }
    if (engineId === 'baidu') {
      const url = `https://www.baidu.com/sugrec?ie=utf-8&json=1&prod=pc&wd=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, settings);
      return isRecord(data) ? readField(data.g, 'q') : [];
    }
    if (engineId === 'sogou') {
      const url = `https://sor.html5.qq.com/api/getsug?m=searxng&key=${encodeURIComponent(query)}`;
      const text = await fetchText(url, settings);
      return readSecondList(extractJsonArray(text)) || [];
    }
    if (engineId === 'duckduckgo') {
      const url = `https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, settings);
      if (Array.isArray(data)) {
        return readSecondList(data) || readField(data, 'phrase');
      }
      return [];
    }
    if (engineId === 'yandex') {
      const url = `https://suggest.yandex.com/suggest-ff.cgi?part=${encodeURIComponent(query)}`;
      return readSecondList(await fetchJson(url, settings)) || [];
    }
    if (engineId === 'quark') {
      const url = `https://sugs.m.sm.cn/web?q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, settings);
      return isRecord(data) ? readField(data.r, 'w') : [];
    }
    if (engineId === 'shenma') {
      const url = `https://sugs.m.sm.cn/web?q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, settings);
      return isRecord(data) ? readField(data.r, 'w') : [];
    }
    if (engineId === 'yahoo') {
      const url = `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&command=${encodeURIComponent(query)}`;
      const text = await fetchText(url, settings);
      const data = parseJsonpPayload(text) || extractJsonArray(text);
      if (Array.isArray(data)) {
        const second = readSecondList(data);
        if (second) {
          return second;
        }
        if (data[0] && Array.isArray(data[0])) {
          return data[0];
        }
      }
      const gossip = isRecord(data) ? data.gossip : null;
      if (isRecord(gossip) && Array.isArray(gossip.results)) {
        return readField(gossip.results, 'key');
      }
      return [];
    }
    return [];
  } catch (_error) {
    return [];
  }
}

export function markPendingSearchTab(tabId: unknown, sourceTab: chrome.tabs.Tab | null | undefined): void {
  pendingSearchAt = Date.now();
  pendingSearchTabId = typeof tabId === 'number' ? tabId : null;
  pendingSearchGroupContext = getSourceTabGroupContext(sourceTab);
}

// The pending search's results tab once it is known.
export function setPendingSearchTabId(tabId: number): void {
  pendingSearchTabId = tabId;
}

export function clearPendingSearch(): void {
  pendingSearchAt = 0;
  pendingSearchTabId = null;
  pendingSearchGroupContext = null;
}

export function isInteractiveSiteSearchProvider(provider: SiteSearchProvider | null | undefined): boolean {
  return SEARCH_UTILS.isInteractiveSiteSearchProvider(provider);
}

export function sanitizeSiteSearchProviders(items: unknown): NormalizedSiteSearchProvider[] {
  return SEARCH_UTILS.sanitizeSiteSearchProviders(items);
}

function loadCustomSiteSearchProviders(): Promise<NormalizedSiteSearchProvider[]> {
  return LumnoSettingsStorage.readStorageValue(
    storageArea,
    chrome,
    SITE_SEARCH_STORAGE_KEY
  ).then(sanitizeSiteSearchProviders);
}

function loadDisabledSiteSearchKeys(): Promise<string[]> {
  return LumnoSettingsStorage.readStorageValue(
    storageArea,
    chrome,
    SITE_SEARCH_DISABLED_STORAGE_KEY
  ).then((value) => {
    const items: unknown[] = Array.isArray(value) ? value : [];
    return items.map((item) => String(item).toLowerCase()).filter(Boolean);
  });
}

function normalizeSearchBlacklistItems(items: unknown): BlacklistRule[] {
  if (BLACKLIST_UTILS.normalizeItems) {
    return BLACKLIST_UTILS.normalizeItems(items, 'prefix');
  }
  return [];
}

function areStringArraysEqual(a: unknown, b: unknown): boolean {
  const left: unknown[] = Array.isArray(a) ? a : [];
  const right: unknown[] = Array.isArray(b) ? b : [];
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (String(left[i]) !== String(right[i])) {
      return false;
    }
  }
  return true;
}

function loadSearchResultSourceTypes(): Promise<SearchSourceType[]> {
  if (searchResultSourceTypesCache) {
    return Promise.resolve(searchResultSourceTypesCache);
  }
  if (searchResultSourceTypesPromise) {
    return searchResultSourceTypesPromise;
  }
  searchResultSourceTypesPromise = new Promise<SearchSourceType[]>((resolve) => {
    if (!storageArea) {
      const defaults = SETTINGS.normalizeSearchResultSourceTypes(null);
      searchResultSourceTypesCache = defaults;
      resolve(defaults);
      return;
    }
    storageArea.get([SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY], (result) => {
      const raw = result && result[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY];
      const normalized = SETTINGS.normalizeSearchResultSourceTypes(raw);
      searchResultSourceTypesCache = normalized;
      if (!areStringArraysEqual(raw, normalized)) {
        storageArea.set({ [SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]: normalized });
      }
      resolve(normalized);
    });
  }).finally(() => {
    searchResultSourceTypesPromise = null;
  });
  return searchResultSourceTypesPromise;
}

function loadSearchFuzzyPinyinEnabled(): Promise<boolean> {
  if (searchFuzzyPinyinEnabledLoaded) {
    return Promise.resolve(searchFuzzyPinyinEnabled);
  }
  if (searchFuzzyPinyinEnabledPromise) {
    return searchFuzzyPinyinEnabledPromise;
  }
  searchFuzzyPinyinEnabledPromise = LumnoSettingsStorage.readStorageValue(
    storageArea,
    chrome,
    SETTINGS.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY
  )
    .catch(() => undefined)
    .then((value) => {
      setSearchFuzzyPinyinEnabled(SETTINGS.normalizeSearchFuzzyPinyinEnabled(value));
      return searchFuzzyPinyinEnabled;
    })
    .finally(() => {
      searchFuzzyPinyinEnabledPromise = null;
    });
  return searchFuzzyPinyinEnabledPromise;
}

// Titles were indexed with the readings of the old choice, so they are
// indexed again.
export function setSearchFuzzyPinyinEnabled(enabled: unknown): void {
  const next = enabled === true;
  if (searchFuzzyPinyinEnabledLoaded && next !== searchFuzzyPinyinEnabled && titleTextMatcher) {
    titleTextMatcher.clear();
  }
  searchFuzzyPinyinEnabled = next;
  searchFuzzyPinyinEnabledLoaded = true;
}

function loadSearchBlacklistItems(): Promise<BlacklistRule[]> {
  if (searchBlacklistCache) {
    return Promise.resolve(searchBlacklistCache);
  }
  if (searchBlacklistPromise) {
    return searchBlacklistPromise;
  }
  searchBlacklistPromise = new Promise<BlacklistRule[]>((resolve) => {
    if (!storageArea) {
      resolve([]);
      return;
    }
    storageArea.get([SEARCH_BLACKLIST_STORAGE_KEY], (result) => {
      const items = normalizeSearchBlacklistItems(result && result[SEARCH_BLACKLIST_STORAGE_KEY]);
      searchBlacklistCache = items;
      resolve(items);
    });
  }).finally(() => {
    searchBlacklistPromise = null;
  });
  return searchBlacklistPromise;
}

export function normalizeSearchSelectionStats(rawStats: unknown): SearchSelectionStats {
  return SEARCH_UTILS.normalizeSearchSelectionStats(rawStats);
}

function loadSearchSelectionStats(): Promise<SearchSelectionStats> {
  if (searchSelectionStatsCache) {
    return Promise.resolve(searchSelectionStatsCache);
  }
  if (searchSelectionStatsPromise) {
    return searchSelectionStatsPromise;
  }
  searchSelectionStatsPromise = new Promise<SearchSelectionStats>((resolve) => {
    if (!localStorageArea) {
      const emptyStats = normalizeSearchSelectionStats(null);
      searchSelectionStatsCache = emptyStats;
      resolve(emptyStats);
      return;
    }
    localStorageArea.get([SEARCH_SELECTION_STATS_STORAGE_KEY], (result) => {
      const stats = normalizeSearchSelectionStats(result && result[SEARCH_SELECTION_STATS_STORAGE_KEY]);
      searchSelectionStatsCache = stats;
      resolve(stats);
    });
  }).finally(() => {
    searchSelectionStatsPromise = null;
  });
  return searchSelectionStatsPromise;
}

function saveSearchSelectionStats(stats: SearchSelectionStats): Promise<boolean> {
  const normalizedStats = normalizeSearchSelectionStats(stats);
  searchSelectionStatsCache = normalizedStats;
  return new Promise((resolve) => {
    if (!localStorageArea) {
      resolve(false);
      return;
    }
    localStorageArea.set({ [SEARCH_SELECTION_STATS_STORAGE_KEY]: normalizedStats }, () => {
      resolve(!(chrome.runtime && chrome.runtime.lastError));
    });
  });
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

export function recordSearchSuggestionSelection(selection: unknown): Promise<{ ok: boolean; reason?: string }> {
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
      const updatedStats = SEARCH_UTILS.recordSearchSelectionInStats(stats, recorded);
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
  return SEARCH_UTILS.getSearchSelectionBoost(item, context, stats, options);
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

function mergeCustomProviders(
  baseItems: readonly SiteSearchProvider[],
  customItems: readonly SiteSearchProvider[]
): SiteSearchProvider[] {
  return SEARCH_UTILS.mergeCustomProviders(baseItems, customItems);
}

export function getSiteSearchProviderEntryUrl(provider: SiteSearchProvider | null | undefined, query: unknown): string {
  if (!provider || !provider.template) {
    return '';
  }
  return SEARCH_UTILS.buildSearchUrlFromTemplate(provider.template, query || '');
}

export function invalidateSiteSearchProviderCache(): void {
  siteSearchLoadGeneration += 1;
  siteSearchCache = null;
  siteSearchPromise = null;
}

export function loadSiteSearchProviders(): Promise<SiteSearchProvider[]> {
  if (siteSearchCache) {
    return Promise.resolve(siteSearchCache);
  }
  if (siteSearchPromise) {
    return siteSearchPromise;
  }
  const localUrl = chrome.runtime.getURL('assets/data/site-search.json');
  const fallbackDefaults = SEARCH_UTILS.getDefaultSiteSearchProviders();
  const loadGeneration = siteSearchLoadGeneration;
  const loadTask: Promise<SiteSearchProvider[]> = fetch(localUrl)
    .then((response) => response.json())
    .then((data: unknown) => {
      const items: unknown[] = isRecord(data) && Array.isArray(data.items) ? data.items : [];
      const source = items.length > 0 ? items : fallbackDefaults;
      return sanitizeSiteSearchProviders(source);
    })
    .catch(() => sanitizeSiteSearchProviders(fallbackDefaults))
    .then((items) => Promise.all([loadCustomSiteSearchProviders(), loadDisabledSiteSearchKeys()])
    .then(([customItems, disabledKeys]) => {
      const baseMap = new Map(items.map((item) => [
        String(item && item.key ? item.key : '').toLowerCase(),
        item
      ]));
      const hydratedCustom = customItems.map((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        const builtinKey = String(item && item.builtinKey ? item.builtinKey : '').toLowerCase();
        const baseProvider = baseMap.get(builtinKey || key);
        return {
          ...item,
          action: String(item.action || (baseProvider && baseProvider.action) || '').trim(),
          submitStrategy: String(
            item.submitStrategy || (baseProvider && baseProvider.submitStrategy) || ''
          ).trim()
        };
      });
      const filteredBase = items.filter((item) => {
        const key = String(item && item.key ? item.key : '').toLowerCase();
        return key && !disabledKeys.includes(key);
      });
      const merged = mergeCustomProviders(filteredBase, hydratedCustom);
      if (loadGeneration === siteSearchLoadGeneration &&
          siteSearchPromise === loadTask) {
        siteSearchCache = merged;
        return merged;
      }
      return siteSearchCache || [];
    })).catch((error: unknown) => {
      if (loadGeneration === siteSearchLoadGeneration &&
          siteSearchPromise === loadTask) {
        siteSearchPromise = null;
      }
      throw error;
    });
  siteSearchPromise = loadTask;
  return loadTask;
}

export function warmSiteSearchProviderIcons(): Promise<SiteSearchProvider[]> {
  return loadSiteSearchProviders().then((providers) => {
    scheduleSiteSearchProviderIconWarmup(providers, '');
    return providers;
  }).catch(() => []);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  const safePromise = promise
    .then((value) => value)
    .catch(() => fallbackValue);
  if (!timeoutMs || timeoutMs <= 0) {
    return safePromise;
  }
  return Promise.race([
    safePromise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
}

async function fetchSearchEngineSuggestionsWithTimeout(query: string, externalSignal: AbortSignal | null | undefined): Promise<unknown[]> {
  if (externalSignal && externalSignal.aborted) {
    return [];
  }
  const requestController = new AbortController();
  const forwardExternalAbort = () => requestController.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', forwardExternalAbort, { once: true });
  }
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<unknown[]>((resolve) => {
      timeoutId = setTimeout(() => {
        requestController.abort();
        resolve([]);
      }, SEARCH_ENGINE_SUGGEST_TIMEOUT_MS);
    });
    return await Promise.race([
      fetchSearchSuggestionsForEngine(query, { signal: requestController.signal }).catch(() => []),
      timeoutPromise
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    if (externalSignal) {
      externalSignal.removeEventListener('abort', forwardExternalAbort);
    }
  }
}

export function shouldPrefetchSearchEngineSuggestions(
  request: { context?: unknown; sourceTypes?: unknown } | null | undefined,
  query: unknown
): boolean {
  const context = request && request.context ? String(request.context) : '';
  const normalizedQuery = String(query || '').trim();
  const sourceTypes = request ? request.sourceTypes : undefined;
  const isScopedLocalSearch = Array.isArray(sourceTypes) && sourceTypes.length > 0;
  return (context === 'newtab' || context === 'overlay') &&
    Boolean(normalizedQuery) &&
    !normalizedQuery.startsWith('/') &&
    !SEARCH_UTILS.isUrlLikeSearchQuery(normalizedQuery) &&
    !isScopedLocalSearch;
}

function clearSearchEngineSuggestionRequestTimers(record: EngineSuggestionRequest | null | undefined): void {
  if (!record) {
    return;
  }
  if (record.startTimer !== null) {
    clearTimeout(record.startTimer);
    record.startTimer = null;
  }
  if (record.releaseTimer !== null) {
    clearTimeout(record.releaseTimer);
    record.releaseTimer = null;
  }
}

export function releaseSearchEngineSuggestionRequest(requestKey: string, record: EngineSuggestionRequest | null | undefined): void {
  if (!record || searchEngineSuggestionRequests.get(requestKey) !== record) {
    return;
  }
  clearSearchEngineSuggestionRequestTimers(record);
  searchEngineSuggestionRequests.delete(requestKey);
}

export function abortSearchEngineSuggestionRequest(requestKey: string): void {
  const record = searchEngineSuggestionRequests.get(requestKey);
  if (!record) {
    return;
  }
  clearSearchEngineSuggestionRequestTimers(record);
  if (record.controller && !record.controller.signal.aborted) {
    record.controller.abort();
  }
  if (searchEngineSuggestionRequests.get(requestKey) === record) {
    searchEngineSuggestionRequests.delete(requestKey);
  }
}

export function startSearchEngineSuggestionRequest(record: EngineSuggestionRequest | null | undefined): Promise<unknown[]> {
  if (!record) {
    return Promise.resolve([]);
  }
  if (record.promise) {
    return record.promise;
  }
  if (record.startTimer !== null) {
    clearTimeout(record.startTimer);
    record.startTimer = null;
  }
  const promise = Promise.resolve(defaultSearchEngineStateReady)
    .then((): unknown[] | Promise<unknown[]> => {
      if (record.controller.signal.aborted) {
        return [];
      }
      return fetchSearchEngineSuggestionsWithTimeout(record.query, record.controller.signal);
    })
    .catch((): unknown[] => []);
  record.promise = promise;
  void promise.then(() => {
    if (record.consumed ||
        searchEngineSuggestionRequests.get(record.requestKey) !== record ||
        record.releaseTimer !== null) {
      return;
    }
    record.releaseTimer = setTimeout(() => {
      releaseSearchEngineSuggestionRequest(record.requestKey, record);
    }, SEARCH_ENGINE_SUGGEST_PREFETCH_RETENTION_MS);
  });
  return promise;
}

function getOrCreateSearchEngineSuggestionRequest(
  requestKey: string,
  query: unknown,
  options?: { consume?: boolean; startImmediately?: boolean; delayMs?: number } | null
): EngineSuggestionRequest | null {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    abortSearchEngineSuggestionRequest(requestKey);
    return null;
  }
  const settings = options && typeof options === 'object' ? options : {};
  const existing = searchEngineSuggestionRequests.get(requestKey);
  if (existing && existing.query === normalizedQuery && !existing.controller.signal.aborted) {
    if (settings.consume === true) {
      existing.consumed = true;
      if (existing.releaseTimer !== null) {
        clearTimeout(existing.releaseTimer);
        existing.releaseTimer = null;
      }
    }
    if (settings.startImmediately === true) {
      void startSearchEngineSuggestionRequest(existing);
    }
    return existing;
  }
  if (existing) {
    abortSearchEngineSuggestionRequest(requestKey);
  }
  const record: EngineSuggestionRequest = {
    requestKey,
    query: normalizedQuery,
    controller: new AbortController(),
    startTimer: null,
    releaseTimer: null,
    promise: null,
    consumed: settings.consume === true
  };
  searchEngineSuggestionRequests.set(requestKey, record);
  const delayMs = Math.max(0, Number(settings.delayMs) || 0);
  if (delayMs > 0 && settings.startImmediately !== true) {
    record.startTimer = setTimeout(() => {
      record.startTimer = null;
      void startSearchEngineSuggestionRequest(record);
    }, delayMs);
  } else {
    void startSearchEngineSuggestionRequest(record);
  }
  return record;
}

export function scheduleSearchEngineSuggestionPrefetch(requestKey: string, query: unknown): EngineSuggestionRequest | null {
  return getOrCreateSearchEngineSuggestionRequest(requestKey, query, {
    delayMs: SEARCH_ENGINE_SUGGEST_PREFETCH_DELAY_MS
  });
}

export function consumeSearchEngineSuggestionRequest(requestKey: string, query: unknown): EngineSuggestionRequest | null {
  return getOrCreateSearchEngineSuggestionRequest(requestKey, query, {
    consume: true,
    startImmediately: true
  });
}

function callChromeApiWithTimeout<T>(invoke: (done: (value: T) => void) => void, fallbackValue: T, timeoutMs: number): Promise<T> {
  return withTimeout(new Promise<T>((resolve) => {
    let settled = false;
    const finish = (value: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    try {
      invoke(finish);
    } catch (_error) {
      finish(fallbackValue);
    }
  }), timeoutMs, fallbackValue);
}

function invalidateBookmarkTreeCache(): void {
  bookmarkTreeIndexCache = {
    expiresAt: 0,
    map: null
  };
  bookmarkItemsCache = {
    expiresAt: 0,
    items: []
  };
  bookmarkItemsPromise = null;
}

function invalidateLocalSearchSourceCaches(): void {
  historyFallbackCache = {
    expiresAt: 0,
    items: []
  };
  topSitesCache = {
    expiresAt: 0,
    items: []
  };
}

function removeHanTitleHistoryItems(removed: HistoryRemoval | null | undefined): void {
  if (!removed || removed.allHistory) {
    hanTitleHistoryCache = {
      expiresAt: 0,
      items: []
    };
    hanTitleHistoryRequest = null;
    return;
  }
  const removedUrls = new Set(Array.isArray(removed.urls) ? removed.urls : []);
  if (removedUrls.size > 0) {
    hanTitleHistoryCache = {
      ...hanTitleHistoryCache,
      items: hanTitleHistoryCache.items.filter((item) => !(item && item.url && removedUrls.has(item.url)))
    };
  }
}

function ensureLocalSearchSourceCacheListeners(): void {
  if (localSearchSourceCacheListenersBound || !chrome || !chrome.history) {
    return;
  }
  if (chrome.history.onVisited && typeof chrome.history.onVisited.addListener === 'function') {
    chrome.history.onVisited.addListener(invalidateLocalSearchSourceCaches);
  }
  if (chrome.history.onVisitRemoved && typeof chrome.history.onVisitRemoved.addListener === 'function') {
    chrome.history.onVisitRemoved.addListener(invalidateLocalSearchSourceCaches);
  }
  if (chrome.history.onVisitRemoved && typeof chrome.history.onVisitRemoved.addListener === 'function') {
    chrome.history.onVisitRemoved.addListener(removeHanTitleHistoryItems);
  }
  localSearchSourceCacheListenersBound = true;
}

function ensureBookmarkTreeCacheListeners(): void {
  if (bookmarkTreeCacheListenersBound || !chrome || !chrome.bookmarks) {
    return;
  }
  const events: Array<{ addListener(listener: () => void): void } | undefined> = [
    chrome.bookmarks.onCreated,
    chrome.bookmarks.onRemoved,
    chrome.bookmarks.onChanged,
    chrome.bookmarks.onMoved,
    chrome.bookmarks.onChildrenReordered,
    chrome.bookmarks.onImportEnded
  ];
  events.forEach((eventTarget) => {
    if (eventTarget && typeof eventTarget.addListener === 'function') {
      eventTarget.addListener(invalidateBookmarkTreeCache);
    }
  });
  bookmarkTreeCacheListenersBound = true;
}

function buildBookmarkNodeMap(tree: chrome.bookmarks.BookmarkTreeNode[] | null | undefined): Map<string, BookmarkNodeInfo> {
  const bookmarkNodeMap = new Map<string, BookmarkNodeInfo>();
  function indexBookmarkNodes(node: chrome.bookmarks.BookmarkTreeNode | null | undefined, parentId: string | null): void {
    if (!node || !node.id) {
      return;
    }
    bookmarkNodeMap.set(node.id, {
      title: node.title || '',
      parentId: parentId || null,
      hasUrl: Boolean(node.url)
    });
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => indexBookmarkNodes(child, node.id));
    }
  }
  if (Array.isArray(tree)) {
    tree.forEach((node) => indexBookmarkNodes(node, null));
  }
  return bookmarkNodeMap;
}

function buildBookmarkItems(tree: chrome.bookmarks.BookmarkTreeNode[] | null | undefined): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  function collectBookmarkNodes(node: chrome.bookmarks.BookmarkTreeNode | null | undefined): void {
    if (!node || !node.id) {
      return;
    }
    if (node.url) {
      items.push({
        id: node.id,
        parentId: node.parentId || null,
        title: node.title || '',
        url: node.url
      });
    }
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => collectBookmarkNodes(child));
    }
  }
  if (Array.isArray(tree)) {
    tree.forEach((node) => collectBookmarkNodes(node));
  }
  return items;
}

function getAllBookmarksCached(): Promise<BookmarkItem[]> {
  const now = Date.now();
  if (Array.isArray(bookmarkItemsCache.items) && bookmarkItemsCache.expiresAt > now) {
    return Promise.resolve(bookmarkItemsCache.items);
  }
  if (bookmarkItemsPromise) {
    return bookmarkItemsPromise;
  }
  if (!chrome || !chrome.bookmarks || typeof chrome.bookmarks.getTree !== 'function') {
    return Promise.resolve([]);
  }
  ensureBookmarkTreeCacheListeners();
  bookmarkItemsPromise = callChromeApiWithTimeout<BookmarkItem[]>((done) => {
    chrome.bookmarks.getTree((tree) => {
      const items = buildBookmarkItems(tree);
      const nodeMap = buildBookmarkNodeMap(tree);
      const expiresAt = Date.now() + BOOKMARK_TREE_CACHE_TTL_MS;
      bookmarkItemsCache = {
        items: items,
        expiresAt
      };
      bookmarkTreeIndexCache = {
        map: nodeMap,
        expiresAt
      };
      bookmarkItemsPromise = null;
      done(items);
    });
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS).catch((): BookmarkItem[] => {
    bookmarkItemsPromise = null;
    return [];
  });
  return bookmarkItemsPromise;
}

function getTopSitesCached(): Promise<chrome.topSites.MostVisitedURL[]> {
  const now = Date.now();
  if (topSitesCache.expiresAt > now && Array.isArray(topSitesCache.items)) {
    return Promise.resolve(topSitesCache.items);
  }
  // Edge's topSites lists its own promoted sites, not ones the user visits.
  if (!chrome || !chrome.topSites || typeof chrome.topSites.get !== 'function' ||
      BROWSER_PROFILE.getBrowserInternalScheme(navigator.userAgent) === 'edge://') {
    return Promise.resolve([]);
  }
  return callChromeApiWithTimeout<chrome.topSites.MostVisitedURL[]>((done) => {
    chrome.topSites.get((items) => {
      const list = Array.isArray(items) ? items : [];
      topSitesCache = {
        items: list,
        expiresAt: Date.now() + TOP_SITES_CACHE_TTL_MS
      };
      done(list);
    });
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS).catch((): chrome.topSites.MostVisitedURL[] => []);
}

function getFallbackHistoryItemsCached(policy: Partial<SearchPolicy> | null | undefined): Promise<chrome.history.HistoryItem[]> {
  const now = Date.now();
  if (historyFallbackCache.expiresAt > now && Array.isArray(historyFallbackCache.items)) {
    return Promise.resolve(historyFallbackCache.items);
  }
  if (!chrome || !chrome.history || typeof chrome.history.search !== 'function') {
    return Promise.resolve([]);
  }
  const settings = policy && typeof policy === 'object' ? policy : {};
  const fallbackMaxResults = Number(settings.fallbackHistoryMaxResults) > 0
    ? Math.floor(Number(settings.fallbackHistoryMaxResults))
    : 600;
  const fallbackWindowDays = Number(settings.fallbackHistoryWindowDays) > 0
    ? Number(settings.fallbackHistoryWindowDays)
    : 365;
  return callChromeApiWithTimeout<chrome.history.HistoryItem[]>((done) => {
    chrome.history.search({
      text: '',
      maxResults: fallbackMaxResults,
      startTime: Date.now() - (fallbackWindowDays * 24 * 60 * 60 * 1000)
    }, (items) => {
      const list = Array.isArray(items) ? items : [];
      historyFallbackCache = {
        items: list,
        expiresAt: Date.now() + HISTORY_FALLBACK_CACHE_TTL_MS
      };
      done(list);
    });
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS).catch((): chrome.history.HistoryItem[] => []);
}

function getHanTitleHistoryItemsCached(policy: Partial<SearchPolicy> | null | undefined): Promise<chrome.history.HistoryItem[]> {
  if (hanTitleHistoryCache.expiresAt > Date.now()) {
    return Promise.resolve(hanTitleHistoryCache.items);
  }
  if (hanTitleHistoryRequest) {
    return hanTitleHistoryRequest;
  }
  if (!chrome || !chrome.history || typeof chrome.history.search !== 'function') {
    return Promise.resolve([]);
  }
  const settings = policy && typeof policy === 'object' ? policy : {};
  const scanLimit = Number(settings.hanTitleHistoryScanLimit) > 0
    ? Math.floor(Number(settings.hanTitleHistoryScanLimit))
    : 5000;
  const windowDays = Number(settings.fallbackHistoryWindowDays) > 0
    ? Number(settings.fallbackHistoryWindowDays)
    : 365;
  const request: Promise<chrome.history.HistoryItem[]> = callChromeApiWithTimeout<chrome.history.HistoryItem[]>((done) => {
    chrome.history.search({
      text: '',
      maxResults: scanLimit,
      startTime: Date.now() - (windowDays * 24 * 60 * 60 * 1000)
    }, (items) => {
      const list = (Array.isArray(items) ? items : [])
        .filter((item) => item && SEARCH_UTILS.hasSearchHanCharacters(item.title));
      if (hanTitleHistoryRequest === request) {
        hanTitleHistoryCache = {
          items: list,
          expiresAt: Date.now() + HAN_TITLE_HISTORY_CACHE_TTL_MS
        };
      }
      done(list);
    });
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS)
    .catch((): chrome.history.HistoryItem[] => [])
    .finally(() => {
      if (hanTitleHistoryRequest === request) {
        hanTitleHistoryRequest = null;
      }
    });
  hanTitleHistoryRequest = request;
  return request;
}

// The first typed letter starts the scan without waiting for it; the next
// keystrokes use it.
function getCachedHanTitleHistoryItemsOrWarm(policy: Partial<SearchPolicy>): Promise<chrome.history.HistoryItem[]> {
  if (hanTitleHistoryCache.expiresAt > Date.now()) {
    return Promise.resolve(hanTitleHistoryCache.items);
  }
  return withTimeout(
    getHanTitleHistoryItemsCached(policy),
    LOCAL_SEARCH_INDEX_WARMUP_TIMEOUT_MS,
    []
  );
}

function getCachedFallbackHistoryItemsOrWarm(policy: Partial<SearchPolicy>): Promise<chrome.history.HistoryItem[]> {
  const now = Date.now();
  if (historyFallbackCache.expiresAt > now && Array.isArray(historyFallbackCache.items)) {
    return Promise.resolve(historyFallbackCache.items);
  }
  return withTimeout(
    getFallbackHistoryItemsCached(policy),
    LOCAL_SEARCH_INDEX_WARMUP_TIMEOUT_MS,
    []
  );
}

function getCachedBookmarkItemsOrWarm(): Promise<BookmarkItem[]> {
  const now = Date.now();
  if (Array.isArray(bookmarkItemsCache.items) && bookmarkItemsCache.expiresAt > now) {
    return Promise.resolve(bookmarkItemsCache.items);
  }
  return withTimeout(
    getAllBookmarksCached(),
    LOCAL_SEARCH_INDEX_WARMUP_TIMEOUT_MS,
    []
  );
}

function getCachedBookmarkNodeMap(): Map<string, BookmarkNodeInfo> {
  const now = Date.now();
  if (bookmarkTreeIndexCache.map && bookmarkTreeIndexCache.expiresAt > now) {
    return bookmarkTreeIndexCache.map;
  }
  return new Map();
}

function getOpenTabSearchItems(): Promise<OpenTabItem[]> {
  if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
    return Promise.resolve([]);
  }
  return callChromeApiWithTimeout<OpenTabItem[]>((done) => {
    chrome.tabs.query({}, (tabs) => {
      const items: OpenTabItem[] = [];
      (Array.isArray(tabs) ? tabs : []).forEach((tab) => {
        const url = getResolvedTabUrl(tab);
        if (!url || typeof tab.id !== 'number') {
          return;
        }
        items.push({
          title: String(tab.title || '').replace(/\s+/g, ' ').trim() || url,
          url,
          _xMatchedTabId: tab.id
        });
      });
      done(items);
    });
  }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS).catch((): OpenTabItem[] => []);
}

let pinyinProApi: PinyinApi | null = null;
let pinyinProImportAttempted = false;

// pinyin-pro, imported on first use; null when it could not be loaded, in
// which case titles still match by their own text.
function getPinyinPro(): PinyinApi | null {
  if (!pinyinProApi && !pinyinProImportAttempted) {
    pinyinProImportAttempted = true;
    pinyinProApi = readPinyinApi(loadWorkerLazyModule(
      'pinyin', chrome.runtime.getURL(PINYIN_DATA_SCRIPT_PATH), getImportScripts()));
  }
  return pinyinProApi;
}

// Every reading of each Han character, so a polyphone matches either way:
// 重庆 matches "chongqing" and "zhongqing", 银行 "yinhang" and "yinxing".
// Readings depend on the character alone, so a few thousand entries cover
// every title.
const hanCharacterReadingsCache = new Map<string, string[]>();
const hanCharacterFuzzyReadingsCache = new Map<string, string[]>();
const BACKGROUND_HAN_READINGS_CACHE_MAX_ENTRIES = 8192;

function getTitleHanReadings(_text: string, characters: string[]): string[][] | null {
  const pinyinApi = getPinyinPro();
  if (!pinyinApi) {
    return null;
  }
  if (!searchFuzzyPinyinEnabled) {
    return characters.map((character) => getHanCharacterReadings(pinyinApi, character));
  }
  return characters.map((character) => {
    const cached = hanCharacterFuzzyReadingsCache.get(character);
    if (cached) {
      return cached;
    }
    const readings = SEARCH_UTILS.expandSearchFuzzyPinyinReadings(getHanCharacterReadings(pinyinApi, character));
    FAVICON_UTILS.setBoundedCacheEntry(
      hanCharacterFuzzyReadingsCache,
      character,
      readings,
      BACKGROUND_HAN_READINGS_CACHE_MAX_ENTRIES
    );
    return readings;
  });
}

function getHanCharacterReadings(pinyinApi: PinyinApi, character: string): string[] {
  const cached = hanCharacterReadingsCache.get(character);
  if (cached) {
    return cached;
  }
  const converted = pinyinApi.pinyin(character, {
    toneType: 'none',
    type: 'array',
    multiple: true,
    v: true
  });
  const readings = Array.isArray(converted) ? converted : [];
  FAVICON_UTILS.setBoundedCacheEntry(
    hanCharacterReadingsCache,
    character,
    readings,
    BACKGROUND_HAN_READINGS_CACHE_MAX_ENTRIES
  );
  return readings;
}

function getTitleTextMatcher(): SearchTextMatcher | null {
  if (!titleTextMatcher && SEARCH_UTILS && typeof SEARCH_UTILS.createSearchTextMatcher === 'function') {
    titleTextMatcher = SEARCH_UTILS.createSearchTextMatcher({
      getHanReadings: getTitleHanReadings,
      maxEntries: BACKGROUND_TITLE_PINYIN_CACHE_MAX_ENTRIES
    });
  }
  return titleTextMatcher;
}

function getBackgroundSearchPolicy(searchUtils: typeof SEARCH_UTILS): Readonly<SearchPolicy> {
  return searchUtils.SEARCH_POLICY;
}

// A query of Han characters alone, as a site's address would spell it: its
// pinyin and its initials: 知乎 is zhihu, 京东 is jd.
function getQueryHostSpellings(context: SearchQueryContext, searchUtils: typeof SEARCH_UTILS): string[] {
  const compact = typeof searchUtils.compactSearchQuery === 'function'
    ? searchUtils.compactSearchQuery(context.queryLower)
    : '';
  if (compact.length < 2 || compact.length > 8 ||
      !Array.from(compact).every((character) => searchUtils.hasSearchHanCharacters(character))) {
    return [];
  }
  const pinyinApi = getPinyinPro();
  if (!pinyinApi) {
    return [];
  }
  try {
    const syllables = pinyinApi.pinyin(compact, { toneType: 'none', type: 'array', v: true })
      .map((syllable) => String(syllable || '').toLowerCase().replace(/[^a-z]+/g, ''))
      .filter(Boolean);
    if (syllables.length !== compact.length) {
      return [];
    }
    const full = syllables.join('');
    const initials = syllables.map((syllable) => syllable.charAt(0)).join('');
    return full === initials ? [full] : [full, initials];
  } catch (_error) {
    return [];
  }
}

function buildBackgroundSearchQueryContext(query: unknown, searchUtils: typeof SEARCH_UTILS): SearchQueryContext {
  const context = searchUtils.buildSearchQueryContext(query);
  context.queryHostSpellings = getQueryHostSpellings(context, searchUtils);
  return context;
}

// Marks where a local result's title shows the query, by the same rules that
// matched it, so a pinyin or initials match marks the characters it spelled.
// The view uses the ranges only while its title text and query are these.
function attachSuggestionTitleHighlight<T extends SuggestionRow>(
  suggestion: T,
  context: SearchQueryContext,
  scoreOptions: SearchRankingOptions,
  searchUtils: typeof SEARCH_UTILS
): T {
  if (!suggestion || !suggestion.title) {
    return suggestion;
  }
  const text = searchUtils.sanitizeDisplayText(suggestion.title);
  return {
    ...suggestion,
    titleHighlight: {
      text,
      query: String(context.lookupQuery || '').trim().toLowerCase(),
      ranges: searchUtils.getSearchTitleHighlightRanges(text, context, scoreOptions)
    }
  };
}

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
  searchUtils: typeof SEARCH_UTILS,
  searchPolicy: Readonly<SearchPolicy>
): Promise<SuggestionRow[]> {
  const candidates = searchUtils.getSearchKeyboardLayoutQueries(context.lookupQuery);
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
      item && searchUtils.hasSearchKeyboardLayoutScript(reading.layout, item.title)
    ))
  )));
  if (readings.length === 0) {
    return [];
  }
  const groups = await Promise.all(readings.map((reading) => (
    getSearchSuggestions(reading.query, { ...requestOptions, keyboardLayoutRetry: false })
  )));
  const typedQuery = String(context.lookupQuery || '').trim().toLowerCase();
  const merged: SuggestionRow[] = [];
  const seenKeys = new Set<string>();
  groups.forEach((group, index) => {
    const reading = readings[index];
    group.forEach((suggestion) => {
      const key = searchUtils.buildSearchDedupEntryKey(suggestion);
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
  merged.sort((a, b) => searchUtils.compareSearchSuggestions(a, b));
  return merged.slice(0, searchPolicy.candidatePoolLimit || 20);
}

function readReasons(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((reason: unknown): reason is string => typeof reason === 'string') : [];
}

// Function to get search suggestions from history and top sites
export async function getSearchSuggestions(query: unknown, options?: SearchSuggestionOptions | null): Promise<SuggestionRow[]> {
  const suggestions: SuggestionRow[] = [];
  const requestOptions: SearchSuggestionOptions = options && typeof options === 'object' ? options : {};
  ensureLocalSearchSourceCacheListeners();
  const searchUtils = SEARCH_UTILS;
  const searchPolicy = getBackgroundSearchPolicy(searchUtils);
  const context = buildBackgroundSearchQueryContext(query, searchUtils);
  if (!context.queryLower) {
    return [];
  }
  const lookupStartTime = Date.now() - (searchPolicy.lookupWindowDays * 24 * 60 * 60 * 1000);
  const lookupEndTime = Date.now();
  const lookupMaxResults = searchPolicy.lookupMaxResults || 120;
  const titleMatcher = getTitleTextMatcher() || undefined;
  const searchScoreOptions: SearchRankingOptions = {
    titleMatcher,
    isLocalNetworkHost: FAVICON_UTILS.isLocalNetworkHost,
    isOwnExtensionUrl
  };
  const [configuredSourceTypes] = await Promise.all([
    loadSearchResultSourceTypes(),
    loadSearchFuzzyPinyinEnabled()
  ]);
  const requestedTypes: unknown[] = Array.isArray(requestOptions.sourceTypes) ? requestOptions.sourceTypes : [];
  const requestedSourceTypes = requestedTypes
    .map((item) => String(item || '').trim())
    .filter((item, index, items): item is SearchSourceType => (
      (item === 'topSite' || item === 'bookmark' || item === 'history') &&
      items.indexOf(item) === index
    ));
  const sourceTypes = requestedSourceTypes.length > 0
    ? configuredSourceTypes.filter((sourceType) => requestedSourceTypes.includes(sourceType))
    : configuredSourceTypes;
  const sourceTypeSet = new Set(sourceTypes);
  const allowTopSites = sourceTypeSet.has('topSite');
  const allowBookmarks = sourceTypeSet.has('bookmark');
  const allowHistory = sourceTypeSet.has('history');
  const allowOpenTabs = requestOptions.includeOpenTabs !== false;

  try {
    const openTabsPromise: Promise<OpenTabItem[]> = allowOpenTabs ? getOpenTabSearchItems() : Promise.resolve([]);
    const [
      historyItemsRaw,
      topSites,
      bookmarksRaw,
      fallbackHistoryItems,
      allBookmarks,
      hanTitleHistoryItems,
      searchBlacklistItems,
      _faviconRequestBlacklistItems,
      _faviconEnhancedFetchEnabled,
      searchSelectionStats
    ] = await Promise.all([
      allowHistory
        ? callChromeApiWithTimeout<chrome.history.HistoryItem[]>((done) => {
          chrome.history.search({
            text: context.lookupQuery,
            maxResults: lookupMaxResults,
            startTime: lookupStartTime,
            endTime: lookupEndTime
          }, done);
        }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS)
        : Promise.resolve<chrome.history.HistoryItem[]>([]),
      allowTopSites ? getTopSitesCached() : Promise.resolve<chrome.topSites.MostVisitedURL[]>([]),
      allowBookmarks
        ? callChromeApiWithTimeout<chrome.bookmarks.BookmarkTreeNode[]>((done) => {
          chrome.bookmarks.search({ query: context.lookupQuery }, done);
        }, [], LOCAL_SUGGEST_SOURCE_TIMEOUT_MS)
        : Promise.resolve<chrome.bookmarks.BookmarkTreeNode[]>([]),
      allowHistory ? getCachedFallbackHistoryItemsOrWarm(searchPolicy) : Promise.resolve<chrome.history.HistoryItem[]>([]),
      allowBookmarks ? getCachedBookmarkItemsOrWarm() : Promise.resolve<BookmarkItem[]>([]),
      allowHistory && /[a-z]/.test(context.unitQuery || '')
        ? getCachedHanTitleHistoryItemsOrWarm(searchPolicy)
        : Promise.resolve<chrome.history.HistoryItem[]>([]),
      loadSearchBlacklistItems(),
      loadFaviconRequestBlacklistItems(),
      loadFaviconEnhancedFetchEnabled(),
      loadSearchSelectionStats()
    ]);
    const collectSearchMatches = <T extends SourceItem>(items: readonly T[]): T[] => {
      return searchUtils.collectSearchMatches(items, context, searchBlacklistItems, {
        titleMatcher,
        isUrlBlockedBySearchBlacklist
      });
    };
    const mergeSearchItems = searchUtils.mergeItemsByUrl;
    const fallbackHistoryMatches = collectSearchMatches(mergeSearchItems([
      fallbackHistoryItems,
      hanTitleHistoryItems
    ]));
    const historyItems = collectSearchMatches(mergeSearchItems([
      Array.isArray(historyItemsRaw) ? historyItemsRaw : [],
      fallbackHistoryMatches
    ]));
    const bookmarkTextMatches = collectSearchMatches(allBookmarks);
    const bookmarks = collectSearchMatches(mergeSearchItems<SourceItem>([
      Array.isArray(bookmarksRaw) ? bookmarksRaw : [],
      bookmarkTextMatches
    ]));

    const bookmarkNodeMap = (Array.isArray(bookmarks) && bookmarks.length > 0)
      ? getCachedBookmarkNodeMap()
      : new Map();

    const rootFolderTitles = new Set([
      'Bookmarks bar',
      'Other bookmarks',
      'Mobile bookmarks',
      '书签栏',
      '其他书签',
      '移动设备书签'
    ]);

    function buildSuggestionReasons(item: SourceItem | null | undefined, sourceType: string): string[] {
      const reasons: string[] = [];
      if (sourceType === 'bookmark') {
        reasons.push('来源：书签');
      } else if (sourceType === 'topSite') {
        reasons.push('来源：常用站点');
      } else if (sourceType === 'openTab') {
        reasons.push('来源：打开的标签页');
      } else if (sourceType === 'history') {
        reasons.push('来源：浏览历史');
      }
      const unitMatch = context.unitQuery
        ? searchUtils.getSearchTitleUnitMatch(item && item.title, context.unitQuery, searchScoreOptions, { skipLiteral: true })
        : null;
      if (unitMatch && unitMatch.abbreviation) {
        reasons.push('标题首字母匹配');
      } else if (unitMatch && unitMatch.usesPinyin) {
        reasons.push('标题拼音匹配');
      }
      if (item && item.lastVisitTime) {
        const hoursSinceVisit = (Date.now() - item.lastVisitTime) / (1000 * 60 * 60);
        if (hoursSinceVisit < 24) {
          reasons.push('最近 24 小时访问');
        } else if (hoursSinceVisit < 72) {
          reasons.push('最近 3 天访问');
        }
      }
      const visitCount = Number(item && item.visitCount) || 0;
      if (visitCount > 1) {
        reasons.push(`访问 ${visitCount} 次`);
      }
      return reasons.slice(0, 3);
    }

    function buildSearchSuggestionFavicon(url: string): string {
      if (isOwnExtensionUrl(url)) {
        return getOwnExtensionFaviconUrl();
      }
      if (isBrowserInternalPageUrl(url)) {
        return getPageFaviconCandidateUrl(url);
      }
      try {
        const urlObj = new URL(url);
        const host = normalizeHost(urlObj.hostname);
        return shouldBlockFaviconForHost(host)
          ? ''
          : getPageFaviconCandidateUrl(urlObj.href);
      } catch (_error) {
        const fallbackHost = getFaviconFallbackHost(url);
        return shouldBlockFaviconForHost(fallbackHost) ? '' : getHostFaviconUrl(fallbackHost);
      }
    }

    function createSearchSuggestion(item: SourceItem & { url: string }, sourceType: string, score: number, extras: RowExtras): SuggestionRow {
      return searchUtils.createSearchSuggestion(item, sourceType, score, extras);
    }

    function calculateSearchRelevanceScore(item: SourceItem & { url: string }, sourceType: string): number {
      return searchUtils.calculateSearchRelevanceScore(item, sourceType, context, searchScoreOptions);
    }

    function buildBookmarkPath(bookmark: SourceItem): string {
      const pathParts: string[] = [];
      let parentId: string | null = bookmark && bookmark.parentId
        ? bookmark.parentId
        : (bookmark && bookmark.id !== undefined ? String(bookmark.id) : null);
      while (parentId) {
        const node = bookmarkNodeMap.get(parentId);
        if (!node) {
          break;
        }
        const isRootFolder = !node.parentId && rootFolderTitles.has(node.title);
        if (!node.hasUrl && node.title && !isRootFolder) {
          pathParts.unshift(node.title);
        }
        parentId = node.parentId;
      }
      return pathParts.join('/');
    }

    const suggestionIndexByKey = new Map<string, number>();

    function getSuggestionKey(item: SourceItem | SuggestionLike | null | undefined): string {
      return searchUtils.buildSearchDedupEntryKey(item);
    }

    function upsertSuggestion(rawItem: SourceItem | null | undefined, sourceType: string, extras?: RowExtras): SuggestionRow | null {
      if (!rawItem || !rawItem.url) {
        return null;
      }
      const itemKey = getSuggestionKey(rawItem);
      const existingIndex = suggestionIndexByKey.get(itemKey);
      const existing = typeof existingIndex === 'number' ? suggestions[existingIndex] : null;
      // Bookmarks and top sites carry no visit data. When the same page was
      // already seen in history, keep its behavior signals so adding a
      // bookmark never makes a frequently used page rank lower.
      const item: SourceItem & { url: string } = existing
        ? {
          ...rawItem,
          url: rawItem.url,
          lastVisitTime: Math.max(Number(rawItem.lastVisitTime) || 0, Number(existing.lastVisitTime) || 0),
          visitCount: Math.max(Number(rawItem.visitCount) || 0, Number(existing.visitCount) || 0),
          typedCount: Math.max(Number(rawItem.typedCount) || 0, Number(existing.typedCount) || 0),
          isTopSite: Boolean(rawItem.isTopSite || existing.isTopSite)
        }
        : { ...rawItem, url: rawItem.url };
      const baseScore = calculateSearchRelevanceScore(item, sourceType);
      if (baseScore <= 0 && sourceType !== 'openTab') {
        return null;
      }
      const normalizedExtras: RowExtras = extras && typeof extras === 'object' ? { ...extras } : {};
      const scoreAdjustment = Number(normalizedExtras.scoreAdjustment) || 0;
      delete normalizedExtras.scoreAdjustment;
      const selectionBoost = getSearchSelectionBoost(item, context, searchSelectionStats, searchScoreOptions);
      if (selectionBoost > 0) {
        normalizedExtras.selectionBoost = selectionBoost;
      }
      const rankedScore = baseScore + scoreAdjustment + selectionBoost;
      // Open tabs have already passed query matching. Ranking penalties must
      // not make a matching live page disappear from search.
      const sourceScore = sourceType === 'openTab' ? Math.max(1, rankedScore) : rankedScore;
      // The page keeps its strongest evidence: a bookmark title that matches
      // the query less well must not demote a page history already ranked.
      const score = existing ? Math.max(sourceScore, Number(existing.score) || 0) : sourceScore;
      const suggestion = createSearchSuggestion(item, sourceType, score, {
        favicon: buildSearchSuggestionFavicon(item.url),
        reasons: buildSuggestionReasons(item, sourceType),
        ...(item.isTopSite ? { isTopSite: true } : {}),
        ...normalizedExtras
      });
      if (typeof existingIndex === 'number') {
        suggestions[existingIndex] = suggestion;
      } else {
        suggestionIndexByKey.set(itemKey, suggestions.length);
        suggestions.push(suggestion);
      }
      return suggestion;
    }

    function upsertOpenTabSuggestion(item: OpenTabItem | null | undefined): SuggestionRow | null {
      if (!item || !item.url || typeof item._xMatchedTabId !== 'number') {
        return null;
      }
      const itemKey = getSuggestionKey(item);
      const existingIndex = suggestionIndexByKey.get(itemKey);
      if (typeof existingIndex === 'number') {
        suggestions[existingIndex] = {
          ...suggestions[existingIndex],
          _xMatchedTabId: item._xMatchedTabId
        };
        return suggestions[existingIndex];
      }
      return upsertSuggestion(item, 'openTab', {
        _xMatchedTabId: item._xMatchedTabId,
        scoreAdjustment: 12
      });
    }

    historyItems.forEach((item) => {
      if (!item || !item.title || isSearchEngineResultUrl(item.url)) {
        return;
      }
      upsertSuggestion(item, 'history');
    });

    const topSiteMatches = collectSearchMatches(topSites);
    topSiteMatches.forEach((site) => {
      if (!site || !site.url || isUrlBlockedBySearchBlacklist(site.url, searchBlacklistItems)) {
        return;
      }
      const itemKey = getSuggestionKey(site);
      const existingIndex = suggestionIndexByKey.get(itemKey);
      if (typeof existingIndex === 'number') {
        const existing = suggestions[existingIndex];
        suggestions[existingIndex] = {
          ...existing,
          isTopSite: true,
          score: (existing.score || 0) + 6
        };
        return;
      }

      const titleLower = site.title ? site.title.toLowerCase() : '';
      let scoreAdjustment = 4;
      try {
        const hostname = normalizeHost(new URL(site.url).hostname);
        if (hostname.startsWith(context.queryLower)) {
          scoreAdjustment += 8;
        }
      } catch (_error) {
        // Ignore invalid URLs.
      }
      if (titleLower.startsWith(context.queryLower)) {
        scoreAdjustment += 6;
      }
      upsertSuggestion(site, 'topSite', { isTopSite: true, scoreAdjustment });
    });

    bookmarks.forEach((bookmark) => {
      if (!bookmark || !bookmark.url) {
        return;
      }
      upsertSuggestion(bookmark, 'bookmark', {
        path: buildBookmarkPath(bookmark),
        scoreAdjustment: 4
      });
    });

    const openTabMatches = collectSearchMatches(await openTabsPromise);
    openTabMatches.forEach((item) => {
      upsertOpenTabSuggestion(item);
    });

    const brandDirectSuggestion = searchUtils.buildSearchBrandDirectSuggestion(suggestions, context, {
      ...searchScoreOptions,
      buildFavicon: buildSearchSuggestionFavicon,
      buildReasons: buildSuggestionReasons
    });
    if (brandDirectSuggestion) {
      const directRow: SuggestionRow = { ...brandDirectSuggestion };
      const directKey = getSuggestionKey(directRow);
      const existingIndex = suggestionIndexByKey.get(directKey);
      if (typeof existingIndex === 'number') {
        suggestions[existingIndex] = directRow;
      } else {
        suggestionIndexByKey.set(directKey, suggestions.length);
        suggestions.push(directRow);
      }
    }

    suggestions.sort((a, b) => {
      return searchUtils.compareSearchSuggestions(a, b);
    });

    const uniqueSuggestions: SuggestionRow[] = [];
    const seenSuggestionKeys = new Set<string>();
    for (let i = 0; i < suggestions.length && uniqueSuggestions.length < (searchPolicy.candidatePoolLimit || 20); i += 1) {
      const suggestion = suggestions[i];
      const suggestionKey = getSuggestionKey(suggestion);
      if (!suggestionKey || seenSuggestionKeys.has(suggestionKey)) {
        continue;
      }
      seenSuggestionKeys.add(suggestionKey);
      uniqueSuggestions.push(suggestion);
    }

    let finalSuggestions = filterBlacklistedSuggestions(uniqueSuggestions, searchBlacklistItems);
    finalSuggestions = searchUtils.filterSearchSuggestionsBySourceTypes(finalSuggestions, sourceTypes);
    finalSuggestions = searchUtils.applySearchSuggestionHostDiversity(finalSuggestions, { context });
    if (finalSuggestions.length === 0 && requestOptions.keyboardLayoutRetry !== false) {
      return getKeyboardLayoutSuggestions(context, requestOptions, searchUtils, searchPolicy);
    }

    return finalSuggestions.map((suggestion) => (
      attachSuggestionTitleHighlight(suggestion, context, searchScoreOptions, searchUtils)
    ));

  } catch (error) {
    console.error('Error getting search suggestions:', error);
    return [];
  }
}

export async function getSearchEngineSuggestions(
  query: unknown,
  localSuggestions: unknown,
  options?: EngineSuggestionOptions | null
): Promise<SuggestionRow[]> {
  await defaultSearchEngineStateReady;
  const searchUtils = SEARCH_UTILS;
  const searchPolicy = getBackgroundSearchPolicy(searchUtils);
  const context = buildBackgroundSearchQueryContext(query, searchUtils);
  const settings: EngineSuggestionOptions = options && typeof options === 'object' ? options : {};
  const signal = settings.signal || null;
  const pageRows: unknown[] = Array.isArray(localSuggestions) ? localSuggestions : [];
  const normalizedLocalSuggestions = pageRows
    .map(readSuggestionRow)
    .filter((suggestion): suggestion is SuggestionRow => suggestion !== null)
    .slice(0, searchPolicy.candidatePoolLimit || 20);
  if (!context.queryLower || (signal && signal.aborted)) {
    return normalizedLocalSuggestions;
  }

  const rawEngineSuggestionsPromise: Promise<unknown> = settings.rawEngineSuggestionsPromise &&
    typeof settings.rawEngineSuggestionsPromise.then === 'function'
    ? settings.rawEngineSuggestionsPromise
    : fetchSearchEngineSuggestionsWithTimeout(String(query || ''), signal);
  const [rawEngineSuggestions, searchBlacklistItems, sourceTypes] = await Promise.all([
    rawEngineSuggestionsPromise,
    loadSearchBlacklistItems(),
    loadSearchResultSourceTypes()
  ]);
  if (signal && signal.aborted) {
    return normalizedLocalSuggestions;
  }

  const engineSuggestions = searchUtils.normalizeSearchEngineSuggestions(
    rawEngineSuggestions,
    context.lookupQuery,
    { limit: searchPolicy.maxEngineSuggestions }
  );
  const engineSuggestionPolicy = searchUtils.getSearchEngineSuggestionPolicy(context, normalizedLocalSuggestions, {
    ...searchPolicy,
    searchFirst: settings.searchFirst === true
  });
  const mergedSuggestions: SuggestionRow[] = normalizedLocalSuggestions.slice();
  engineSuggestions.slice(0, engineSuggestionPolicy.limit).forEach((suggestion) => {
    const suggestionItem: SuggestionRow = {
      type: 'googleSuggest',
      title: suggestion,
      url: buildDefaultSearchUrl(suggestion),
      favicon: getDefaultSearchEngineFaviconUrl(),
      score: engineSuggestionPolicy.score,
      searchQuery: suggestion,
      forceSearch: true,
      reasons: ['来源：搜索建议']
    };
    if (!isSuggestionBlockedBySearchBlacklist(suggestionItem, searchBlacklistItems)) {
      mergedSuggestions.push(suggestionItem);
    }
  });

  mergedSuggestions.sort((a, b) => {
    return searchUtils.compareSearchSuggestions(a, b);
  });
  const uniqueSuggestions: SuggestionRow[] = [];
  const seenSuggestionKeys = new Set<string>();
  for (let i = 0; i < mergedSuggestions.length && uniqueSuggestions.length < (searchPolicy.candidatePoolLimit || 20); i += 1) {
    const suggestion = mergedSuggestions[i];
    const suggestionKey = searchUtils.buildSearchDedupEntryKey(suggestion);
    if (!suggestionKey || seenSuggestionKeys.has(suggestionKey)) {
      continue;
    }
    seenSuggestionKeys.add(suggestionKey);
    uniqueSuggestions.push(suggestion);
  }

  let finalSuggestions = filterBlacklistedSuggestions(uniqueSuggestions, searchBlacklistItems);
  finalSuggestions = searchUtils.filterSearchSuggestionsBySourceTypes(finalSuggestions, sourceTypes);
  if (settings.searchFirst === true) {
    const engineCandidates = finalSuggestions.filter((suggestion) => (
      suggestion && suggestion.type === 'googleSuggest'
    ));
    const localCandidates = searchUtils.applySearchSuggestionHostDiversity(
      finalSuggestions.filter((suggestion) => !suggestion || suggestion.type !== 'googleSuggest'),
      { context }
    );
    finalSuggestions = [...localCandidates, ...engineCandidates];
  } else {
    finalSuggestions = searchUtils.applySearchSuggestionHostDiversity(finalSuggestions, { context });
  }
  if (settings.searchFirst === true) {
    finalSuggestions = searchUtils.composeSearchFirstSuggestionSlate(finalSuggestions, {
      limit: searchPolicy.finalSuggestionLimit || 12
    }).slice(0, searchPolicy.finalSuggestionLimit || 12);
  } else {
    finalSuggestions = searchUtils.composeSearchSuggestionSlate(finalSuggestions, context);
  }
  return finalSuggestions;
}
