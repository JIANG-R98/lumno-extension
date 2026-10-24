// The New Tab's recent sites: the cards pinned in front, the sites hidden
// until their next visit, and merging open tabs, history and top sites into
// one list with a card per site.

// A card as the New Tab shows and stores it.
interface RecentSite {
  title: string;
  url: string;
  // Normalized host, the key that makes a card one per site.
  host: string;
  siteName: string;
  lastVisitTime: number;
  visitCount: number;
  // When the card was pinned; 0 for an unpinned site.
  pinnedAt: number;
  // A pinned card that follows the episodes of one work (Labs).
  progressTracking?: true;
  progressId?: string;
  // Set on merged lists: the card is one of the pinned ones.
  _xPinned?: boolean;
}

// A site hidden until a visit later than the one it was hidden at.
interface HiddenRecentSite {
  url: string;
  lastVisitTime: number;
  hiddenAt: number;
}

interface RecentSiteOptions {
  normalizeHost?: (hostname: string) => string;
  // The page a favicon proxy URL stands for.
  getCanonicalPageUrlForFavicon?: (url: string) => string;
  sanitizeDisplayText?: (text: unknown) => string;
  getSiteDisplayName?: (host: string, title: string) => string;
  // Sites the search blacklist leaves out; pinned cards ignore it.
  shouldExcludeUrl?: (url: string) => boolean;
  ignoreBlacklist?: boolean;
  maxPinned?: number;
  maxHidden?: number;
  // A page a tracked card already stands for.
  belongsToTrackedWork?: (item: RecentSite) => boolean;
  // Open tabs that go ahead of history and top sites.
  shouldPrioritizeTabUrl?: (url: string) => boolean;
}

type RecentSiteSource = 'tabs' | 'history' | 'topSites';

interface RecentSiteSources extends RecentSiteOptions {
  limit?: number;
  // How many source candidates to consider; at least `limit`.
  candidateLimit?: number;
  // 'most' ranks history by visits; otherwise by the latest visit.
  mode?: string;
  pinned?: unknown;
  hidden?: unknown;
  // chrome.tabs, chrome.topSites and chrome.history results.
  tabs?: unknown;
  topSites?: unknown;
  historyItems?: unknown;
}

interface RecentSiteCollector {
  items: RecentSite[];
  isFull(): boolean;
  append(item: unknown, isPinned: boolean): boolean;
  appendNormalized(normalized: RecentSite | null, isPinned: boolean): boolean;
}

const DEFAULT_PINNED_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
const DEFAULT_HIDDEN_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
const DEFAULT_MAX_PINNED = 3;
const DEFAULT_MAX_HIDDEN = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeRecentCount(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  if (parsed === 0 || parsed === 4 || parsed === 8) {
    return parsed;
  }
  return 4;
}

function defaultNormalizeHost(hostname: string): string {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
}

function getNormalizeHost(options: RecentSiteOptions | null | undefined): (hostname: string) => string {
  return options && typeof options.normalizeHost === 'function'
    ? options.normalizeHost
    : defaultNormalizeHost;
}

function getCanonicalPageUrl(url: string, options: RecentSiteOptions | null | undefined): string {
  if (options && typeof options.getCanonicalPageUrlForFavicon === 'function') {
    return options.getCanonicalPageUrlForFavicon(url) || String(url || '');
  }
  return String(url || '');
}

function getHostFromUrl(url: string, options: RecentSiteOptions | null | undefined): string {
  const normalizeHost = getNormalizeHost(options);
  try {
    return normalizeHost(new URL(getCanonicalPageUrl(url, options)).hostname);
  } catch (_error) {
    return '';
  }
}

function sanitizeDisplayText(text: unknown, options: RecentSiteOptions): string {
  if (typeof options.sanitizeDisplayText === 'function') {
    return options.sanitizeDisplayText(text);
  }
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function getSiteDisplayName(host: string, title: string, options: RecentSiteOptions): string {
  if (typeof options.getSiteDisplayName === 'function') {
    return options.getSiteDisplayName(host, title);
  }
  return host || title || '';
}

function shouldExcludeUrl(url: string, options: RecentSiteOptions): boolean {
  return Boolean(typeof options.shouldExcludeUrl === 'function' && options.shouldExcludeUrl(url));
}

function getRecentSiteUrlKey(item: unknown): string {
  if (!isRecord(item) || !item.url) {
    return '';
  }
  return String(item.url).trim();
}

function getRecentSiteHostKey(item: unknown, options?: RecentSiteOptions | null): string {
  if (!isRecord(item)) {
    return '';
  }
  const normalizeHost = getNormalizeHost(options);
  const rawHost = item.host || getHostFromUrl(String(item.url || ''), options);
  return normalizeHost(String(rawHost || ''));
}

function normalizeRecentSiteItem(item: unknown, options?: RecentSiteOptions | null): RecentSite | null {
  const opts = options && typeof options === 'object' ? options : {};
  const ignoreBlacklist = opts.ignoreBlacklist === true;
  if (!isRecord(item) || !item.url) {
    return null;
  }
  const url = String(item.url).trim();
  if (!url || (!ignoreBlacklist && shouldExcludeUrl(url, opts))) {
    return null;
  }
  const host = getRecentSiteHostKey(item, opts);
  const title = sanitizeDisplayText(item.title || item.siteName || host || url, opts);
  const siteName = sanitizeDisplayText(
    item.siteName || getSiteDisplayName(host, title, opts) || host || title || url,
    opts
  );
  return {
    title,
    url,
    host,
    siteName,
    lastVisitTime: Number(item.lastVisitTime) || 0,
    visitCount: Number(item.visitCount) || 0,
    pinnedAt: Number(item.pinnedAt) || 0
  };
}

function isSameRecentSite(a: unknown, b: unknown, options?: RecentSiteOptions | null): boolean {
  const aUrlKey = getRecentSiteUrlKey(a);
  const bUrlKey = getRecentSiteUrlKey(b);
  if (aUrlKey && bUrlKey && aUrlKey === bUrlKey) {
    return true;
  }
  const aHostKey = getRecentSiteHostKey(a, options);
  const bHostKey = getRecentSiteHostKey(b, options);
  return Boolean(aHostKey && bHostKey && aHostKey === bHostKey);
}

// Progress tracking (Labs) lives on pinned cards only. A tracked card
// stands for one work rather than its whole site, and keeps a stable id
// that its change history is stored under.
function withProgressFields(nextItem: RecentSite | null, item: unknown): RecentSite | null {
  if (!nextItem || !isRecord(item) || item.progressTracking !== true) {
    return nextItem;
  }
  const progressId = String(item.progressId || '').trim();
  return {
    ...nextItem,
    progressTracking: true,
    ...(progressId ? { progressId } : {})
  };
}

function isProgressTracked(item: unknown): boolean {
  return isRecord(item) && item.progressTracking === true;
}

// Pinned cards are one per site, except tracked cards: they are one per
// work, so another page on the same site is a different card.
function isSamePinnedRecentSite(a: unknown, b: unknown, options?: RecentSiteOptions | null): boolean {
  if (isProgressTracked(a) || isProgressTracked(b)) {
    const aUrlKey = getRecentSiteUrlKey(a);
    return Boolean(aUrlKey && aUrlKey === getRecentSiteUrlKey(b));
  }
  return isSameRecentSite(a, b, options);
}

function normalizePinnedRecentSites(items: unknown, options?: RecentSiteOptions | null): RecentSite[] {
  const opts = options && typeof options === 'object' ? options : {};
  const maxPinned = Number.isFinite(Number(opts.maxPinned))
    ? Math.max(0, Number(opts.maxPinned))
    : DEFAULT_MAX_PINNED;
  if (!Array.isArray(items) || maxPinned <= 0) {
    return [];
  }
  const source: unknown[] = items;
  const normalized: RecentSite[] = [];
  for (const item of source) {
    const nextItem = withProgressFields(normalizeRecentSiteItem(item, {
      ...opts,
      ignoreBlacklist: true
    }), item);
    if (!nextItem) {
      continue;
    }
    const duplicated = normalized.some((existingItem) =>
      isSamePinnedRecentSite(existingItem, nextItem, opts)
    );
    if (duplicated) {
      continue;
    }
    normalized.push(nextItem);
    if (normalized.length >= maxPinned) {
      break;
    }
  }
  return normalized;
}

// A hidden entry, also as older versions stored it (the bare URL).
function normalizeHiddenRecentSiteEntry(item: unknown): HiddenRecentSite | null {
  if (!item) {
    return null;
  }
  const fields = isRecord(item) ? item : {};
  const url = typeof item === 'string'
    ? String(item).trim()
    : String(fields.url || '').trim();
  if (!url) {
    return null;
  }
  const lastVisitTime = typeof item === 'string'
    ? 0
    : Math.max(0, Number(fields.lastVisitTime) || 0);
  return {
    url,
    lastVisitTime,
    hiddenAt: Math.max(0, Number(fields.hiddenAt) || Date.now())
  };
}

function normalizeHiddenRecentSites(items: unknown, options?: RecentSiteOptions | null): HiddenRecentSite[] {
  const opts = options && typeof options === 'object' ? options : {};
  const maxHidden = Number.isFinite(Number(opts.maxHidden))
    ? Math.max(0, Number(opts.maxHidden))
    : DEFAULT_MAX_HIDDEN;
  if (!Array.isArray(items) || maxHidden <= 0) {
    return [];
  }
  const source: unknown[] = items;
  const normalized: HiddenRecentSite[] = [];
  for (const item of source) {
    const entry = normalizeHiddenRecentSiteEntry(item);
    if (!entry) {
      continue;
    }
    const duplicatedIndex = normalized.findIndex((existingItem) => existingItem.url === entry.url);
    if (duplicatedIndex >= 0) {
      normalized[duplicatedIndex] = entry.lastVisitTime >= normalized[duplicatedIndex].lastVisitTime
        ? entry
        : normalized[duplicatedIndex];
      continue;
    }
    normalized.push(entry);
    if (normalized.length >= maxHidden) {
      break;
    }
  }
  return normalized;
}

function isRecentSiteHidden(item: unknown, hiddenSites: readonly (HiddenRecentSite | null | undefined)[] | null | undefined): boolean {
  const key = getRecentSiteUrlKey(item);
  if (!key || !Array.isArray(hiddenSites)) {
    return false;
  }
  const entry = hiddenSites.find((candidate) => candidate && candidate.url === key);
  if (!entry) {
    return false;
  }
  const lastVisitTime = Math.max(0, Number(isRecord(item) ? item.lastVisitTime : 0) || 0);
  return lastVisitTime <= entry.lastVisitTime;
}

function normalizeSourceItem(item: unknown, source: RecentSiteSource, options: RecentSiteOptions): RecentSite | null {
  if (!isRecord(item)) {
    return null;
  }
  if (source === 'tabs') {
    if (item.incognito === true) {
      return null;
    }
    const url = item.url ? String(item.url) : '';
    if (!url) {
      return null;
    }
    const host = getHostFromUrl(url, options);
    return normalizeRecentSiteItem({
      title: item.title || host,
      url,
      host,
      lastVisitTime: Number(item.lastAccessed) || 0
    }, options);
  }
  const url = item.url ? String(item.url) : '';
  if (!url) {
    return null;
  }
  const host = getHostFromUrl(url, options);
  return normalizeRecentSiteItem({
    title: item.title || host,
    url,
    host,
    lastVisitTime: Number(item.lastVisitTime) || 0,
    visitCount: Number(item.visitCount) || 0
  }, options);
}

// Collects up to `limit` cards: the pinned ones first, then each further
// site once, skipping hidden sites and pages tracked cards stand for.
function createRecentSiteCollector(pinned: unknown, hidden: unknown, limit: number, options: RecentSiteOptions): RecentSiteCollector {
  const maxItems = Math.max(0, Number(limit) || 0);
  const items: RecentSite[] = [];
  const seenUrls = new Set<string>();
  const seenHosts = new Set<string>();
  const hiddenByUrl = new Map<string, HiddenRecentSite>();

  normalizeHiddenRecentSites(hidden, options).forEach((entry) => {
    hiddenByUrl.set(entry.url, entry);
  });

  function isFull(): boolean {
    return items.length >= maxItems;
  }

  function appendNormalized(normalized: RecentSite | null, isPinned: boolean): boolean {
    if (!normalized || isFull()) {
      return false;
    }
    const urlKey = getRecentSiteUrlKey(normalized);
    const hiddenEntry = hiddenByUrl.get(urlKey);
    if (hiddenEntry) {
      const lastVisitTime = Math.max(0, Number(normalized.lastVisitTime) || 0);
      if (lastVisitTime <= hiddenEntry.lastVisitTime) {
        return false;
      }
    }
    const hostKey = getRecentSiteHostKey(normalized, options);
    const claimsSite = !(isPinned && isProgressTracked(normalized));
    if ((urlKey && seenUrls.has(urlKey)) || (claimsSite && hostKey && seenHosts.has(hostKey))) {
      return false;
    }
    if (!isPinned && typeof options.belongsToTrackedWork === 'function' &&
        options.belongsToTrackedWork(normalized)) {
      return false;
    }
    if (urlKey) {
      seenUrls.add(urlKey);
    }
    if (hostKey && claimsSite) {
      seenHosts.add(hostKey);
    }
    normalized._xPinned = Boolean(isPinned);
    items.push(normalized);
    return true;
  }

  const normalizedPinned = normalizePinnedRecentSites(pinned, options);
  for (let index = 0; index < normalizedPinned.length && !isFull(); index += 1) {
    appendNormalized(normalizedPinned[index], true);
  }

  return {
    items,
    isFull,
    append(item: unknown, isPinned: boolean): boolean {
      const normalized = normalizeRecentSiteItem(item, {
        ...options,
        ignoreBlacklist: Boolean(isPinned)
      });
      return appendNormalized(normalized, isPinned);
    },
    appendNormalized
  };
}

function appendSourceItemsToCollector(
  collector: RecentSiteCollector,
  candidateState: { count: number },
  seenHosts: Set<string>,
  items: unknown,
  source: RecentSiteSource,
  limit: number,
  options: RecentSiteOptions
): void {
  const list: unknown[] = Array.isArray(items) ? items : [];
  for (const item of list) {
    if (candidateState.count >= limit || collector.isFull()) {
      break;
    }
    const normalized = normalizeSourceItem(item, source, options);
    if (!normalized || !normalized.host || seenHosts.has(normalized.host)) {
      continue;
    }
    seenHosts.add(normalized.host);
    candidateState.count += 1;
    collector.appendNormalized(normalized, false);
  }
}

// Ranks history sites by the summed visitCount of their URLs, most visited first.
function rankHistoryByVisits(items: unknown, options: RecentSiteOptions): unknown[] {
  const sites = new Map<string, { item: Record<string, unknown>; visits: number; total: number; index: number }>();
  const list: unknown[] = Array.isArray(items) ? items : [];
  list.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const url = item.url ? String(item.url) : '';
    const host = url ? getHostFromUrl(url, options) : '';
    if (!host) {
      return;
    }
    const visits = Math.max(0, Number(item.visitCount) || 0);
    const site = sites.get(host);
    if (!site) {
      sites.set(host, { item, visits, total: visits, index });
      return;
    }
    site.total += visits;
    if (visits > site.visits) {
      site.item = item;
      site.visits = visits;
    }
  });
  return Array.from(sites.values())
    .sort((a, b) => (b.total - a.total) || (a.index - b.index))
    .map((site) => site.item);
}

function getLastAccessed(item: unknown): number {
  return Number(isRecord(item) ? item.lastAccessed : 0) || 0;
}

function sortTabCandidates(items: readonly unknown[]): unknown[] {
  return items.slice().sort((a, b) => getLastAccessed(b) - getLastAccessed(a));
}

function shouldPrioritizeTabUrl(url: unknown, options: RecentSiteOptions): boolean {
  return Boolean(typeof options.shouldPrioritizeTabUrl === 'function' && options.shouldPrioritizeTabUrl(String(url || '')));
}

function mergeRecentSitesWithPinned(
  items: unknown,
  pinned: unknown,
  hidden: unknown,
  limit: unknown,
  options?: RecentSiteOptions | null
): RecentSite[] {
  const opts = options && typeof options === 'object' ? options : {};
  const maxItems = Math.max(0, Number(limit) || 0);
  if (maxItems <= 0) {
    return [];
  }
  const collector = createRecentSiteCollector(pinned, hidden, maxItems, opts);
  const candidates: unknown[] = Array.isArray(items) ? items : [];
  for (let index = 0; index < candidates.length && !collector.isFull(); index += 1) {
    collector.append(candidates[index], false);
  }
  return collector.items;
}

function mergeRecentSiteSources(input: RecentSiteSources | null | undefined): RecentSite[] {
  const options = input && typeof input === 'object' ? input : {};
  const limit = Math.max(0, Number(options.limit) || 0);
  if (limit <= 0) {
    return [];
  }
  const candidateLimit = Math.max(limit, Number(options.candidateLimit) || limit);
  const mode = options.mode === 'most' ? 'most' : 'latest';
  const collector = createRecentSiteCollector(
    options.pinned,
    options.hidden,
    limit,
    options
  );
  if (collector.isFull()) {
    return collector.items;
  }
  const candidateState = { count: 0 };
  const sourceSeenHosts = new Set<string>();
  const appendSource = (items: unknown, source: RecentSiteSource): void => {
    appendSourceItemsToCollector(
      collector,
      candidateState,
      sourceSeenHosts,
      items,
      source,
      candidateLimit,
      options
    );
  };
  const rawTabCandidates: unknown[] = Array.isArray(options.tabs) ? options.tabs : [];
  const priorityTabCandidates = sortTabCandidates(
    rawTabCandidates.filter((item) => shouldPrioritizeTabUrl(isRecord(item) ? item.url : '', options))
  );
  appendSource(priorityTabCandidates, 'tabs');
  if (mode === 'most') {
    appendSource(options.topSites, 'topSites');
    appendSource(rankHistoryByVisits(options.historyItems, options), 'history');
  } else {
    appendSource(options.historyItems, 'history');
    appendSource(options.topSites, 'topSites');
  }
  if (candidateState.count < candidateLimit && !collector.isFull()) {
    appendSource(sortTabCandidates(rawTabCandidates), 'tabs');
  }
  return collector.items;
}

export {
  DEFAULT_PINNED_KEY,
  DEFAULT_HIDDEN_KEY,
  DEFAULT_MAX_PINNED,
  DEFAULT_MAX_HIDDEN,
  normalizeRecentCount,
  normalizeRecentSiteItem,
  normalizePinnedRecentSites,
  normalizeHiddenRecentSiteEntry,
  normalizeHiddenRecentSites,
  getRecentSiteUrlKey,
  getRecentSiteHostKey,
  isSameRecentSite,
  isSamePinnedRecentSite,
  isRecentSiteHidden,
  mergeRecentSitesWithPinned,
  mergeRecentSiteSources
};
export type { HiddenRecentSite, RecentSite, RecentSiteOptions, RecentSiteSource, RecentSiteSources };
