import type { HiddenRecentSite, RecentSite, RecentSiteCollector, RecentSiteOptions, RecentSiteSource, RecentSiteSources } from './recent-sites-store';
import { getHostFromUrl, getRecentSiteHostKey, getRecentSiteUrlKey, isProgressTracked, isRecord, normalizeHiddenRecentSites, normalizePinnedRecentSites, normalizeRecentSiteItem } from './recent-sites-store';
// Merging open tabs, history and top sites into the New Tab's recent sites,
// one card per site, after the pinned cards.

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

  // A site the person hid stays hidden until it is visited again.
  function isStillHidden(urlKey: string, normalized: RecentSite): boolean {
    const hiddenEntry = hiddenByUrl.get(urlKey);
    return Boolean(hiddenEntry) && Math.max(0, Number(normalized.lastVisitTime) || 0) <= (hiddenEntry ? hiddenEntry.lastVisitTime : 0);
  }

  function belongsToTrackedWork(normalized: RecentSite): boolean {
    return typeof options.belongsToTrackedWork === 'function' && Boolean(options.belongsToTrackedWork(normalized));
  }

  function appendNormalized(normalized: RecentSite | null, isPinned: boolean): boolean {
    if (!normalized || isFull()) {
      return false;
    }
    const urlKey = getRecentSiteUrlKey(normalized);
    if (isStillHidden(urlKey, normalized)) {
      return false;
    }
    const hostKey = getRecentSiteHostKey(normalized, options);
    const claimsSite = !(isPinned && isProgressTracked(normalized));
    if ((urlKey && seenUrls.has(urlKey)) || (claimsSite && hostKey && seenHosts.has(hostKey))) {
      return false;
    }
    if (!isPinned && belongsToTrackedWork(normalized)) {
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
  appendSourceItemsToCollector,
  createRecentSiteCollector,
  getLastAccessed,
  mergeRecentSiteSources,
  mergeRecentSitesWithPinned,
  normalizeSourceItem,
  rankHistoryByVisits,
  shouldPrioritizeTabUrl,
  sortTabCandidates
};
