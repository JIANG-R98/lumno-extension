(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabRecentSitesStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const DEFAULT_PINNED_KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';
  const DEFAULT_HIDDEN_KEY = '_x_extension_newtab_hidden_recent_sites_2026_unique_';
  const DEFAULT_MAX_PINNED = 3;
  const DEFAULT_MAX_HIDDEN = 60;
  const DEFAULT_MAX_UPDATE_HISTORY = 10;

  function normalizePinnedRecentCardId(value) {
    const cardId = String(value || '').trim();
    return /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(cardId) ? cardId : '';
  }

  function hashPinnedRecentCardSeed(value) {
    const text = String(value || '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function createLegacyPinnedRecentCardId(item) {
    const source = item && typeof item === 'object' ? item : {};
    return `pinned-${hashPinnedRecentCardSeed([
      Number(source.pinnedAt) || 0,
      String(source.url || '')
    ].join('\n'))}`;
  }

  function normalizeRecentCount(value) {
    const parsed = Number.parseInt(value, 10);
    if (parsed === 0 || parsed === 4 || parsed === 8) {
      return parsed;
    }
    return 4;
  }

  function defaultNormalizeHost(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
  }

  function getNormalizeHost(options) {
    return options && typeof options.normalizeHost === 'function'
      ? options.normalizeHost
      : defaultNormalizeHost;
  }

  function getCanonicalPageUrl(url, options) {
    if (options && typeof options.getCanonicalPageUrlForFavicon === 'function') {
      return options.getCanonicalPageUrlForFavicon(url) || String(url || '');
    }
    return String(url || '');
  }

  function getHostFromUrl(url, options) {
    const normalizeHost = getNormalizeHost(options);
    try {
      return normalizeHost(new URL(getCanonicalPageUrl(url, options)).hostname);
    } catch (error) {
      return '';
    }
  }

  function sanitizeDisplayText(text, options) {
    if (options && typeof options.sanitizeDisplayText === 'function') {
      return options.sanitizeDisplayText(text);
    }
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getSiteDisplayName(host, title, options) {
    if (options && typeof options.getSiteDisplayName === 'function') {
      return options.getSiteDisplayName(host, title);
    }
    return host || title || '';
  }

  function shouldExcludeUrl(url, options) {
    return Boolean(
      options &&
      typeof options.shouldExcludeUrl === 'function' &&
      options.shouldExcludeUrl(url)
    );
  }

  function getRecentSiteUrlKey(item) {
    if (!item || !item.url) {
      return '';
    }
    return String(item.url).trim();
  }

  function getRecentSiteHostKey(item, options) {
    if (!item) {
      return '';
    }
    const normalizeHost = getNormalizeHost(options);
    const rawHost = item.host || getHostFromUrl(item.url || '', options);
    return normalizeHost(rawHost || '');
  }

  function normalizeRecentUpdateHistory(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxHistory = Number.isFinite(Number(opts.maxUpdateHistory))
      ? Math.max(0, Number(opts.maxUpdateHistory))
      : DEFAULT_MAX_UPDATE_HISTORY;
    if (!Array.isArray(items) || maxHistory <= 0) return [];
    const normalized = [];
    for (let index = 0; index < items.length && normalized.length < maxHistory; index += 1) {
      const item = items[index];
      if (!item || !item.url) continue;
      const url = String(item.url).trim();
      const host = getRecentSiteHostKey(item, opts);
      if (!url || !host) continue;
      normalized.push({
        title: sanitizeDisplayText(item.title || item.siteName || host || url, opts),
        url,
        host,
        siteName: sanitizeDisplayText(
          item.siteName || getSiteDisplayName(host, item.title || '', opts) || host,
          opts
        ),
        lastVisitTime: Math.max(0, Number(item.lastVisitTime) || 0),
        visitCount: Math.max(0, Number(item.visitCount) || 0),
        updatedAt: Math.max(0, Number(item.updatedAt) || 0)
      });
    }
    return normalized;
  }

  function normalizeRecentSiteItem(item, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const ignoreBlacklist = opts.ignoreBlacklist === true;
    if (!item || !item.url) {
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
      cardId: normalizePinnedRecentCardId(item.cardId),
      title,
      url,
      host,
      siteName,
      lastVisitTime: Number(item.lastVisitTime) || 0,
      visitCount: Number(item.visitCount) || 0,
      pinnedAt: Number(item.pinnedAt) || 0,
      trackingEnabled: item.trackingEnabled === true,
      updatePending: item.updatePending === true,
      updateHistory: normalizeRecentUpdateHistory(item.updateHistory, opts)
    };
  }

  function isSameRecentSite(a, b, options) {
    const aUrlKey = getRecentSiteUrlKey(a);
    const bUrlKey = getRecentSiteUrlKey(b);
    if (aUrlKey && bUrlKey && aUrlKey === bUrlKey) {
      return true;
    }
    const aHostKey = getRecentSiteHostKey(a, options);
    const bHostKey = getRecentSiteHostKey(b, options);
    return Boolean(aHostKey && bHostKey && aHostKey === bHostKey);
  }

  function normalizePinnedRecentSites(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxPinned = Number.isFinite(Number(opts.maxPinned))
      ? Math.max(0, Number(opts.maxPinned))
      : DEFAULT_MAX_PINNED;
    if (!Array.isArray(items) || maxPinned <= 0) {
      return [];
    }
    const normalized = [];
    const usedCardIds = new Set();
    for (let i = 0; i < items.length; i += 1) {
      const nextItem = normalizeRecentSiteItem(items[i], {
        ...opts,
        ignoreBlacklist: true
      });
      if (!nextItem) {
        continue;
      }
      const nextUrlKey = getRecentSiteUrlKey(nextItem);
      const duplicated = normalized.some((existingItem) =>
        getRecentSiteUrlKey(existingItem) === nextUrlKey
      );
      if (duplicated) {
        continue;
      }
      const cardIdBase = nextItem.cardId || createLegacyPinnedRecentCardId(nextItem);
      let cardId = cardIdBase;
      let collisionIndex = 2;
      while (usedCardIds.has(cardId)) {
        cardId = `${cardIdBase}-${collisionIndex}`;
        collisionIndex += 1;
      }
      nextItem.cardId = cardId;
      usedCardIds.add(cardId);
      normalized.push(nextItem);
      if (normalized.length >= maxPinned) {
        break;
      }
    }
    return normalized;
  }

  function undoPinnedRecentSiteUpdate(items, currentUrl, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const normalizedItems = normalizePinnedRecentSites(items, opts);
    const url = String(currentUrl || '').trim();
    const cardId = normalizePinnedRecentCardId(opts.cardId);
    const index = cardId
      ? normalizedItems.findIndex((item) => item.cardId === cardId)
      : normalizedItems.findIndex((item) => getRecentSiteUrlKey(item) === url);
    if (index < 0) return { changed: false, reason: 'not-pinned', items: normalizedItems };
    const currentItem = normalizedItems[index];
    const history = Array.isArray(currentItem.updateHistory) ? currentItem.updateHistory : [];
    const previous = history[0];
    if (!previous) return { changed: false, reason: 'no-history', items: normalizedItems };
    const restored = normalizeRecentSiteItem(previous, { ...opts, ignoreBlacklist: true });
    if (!restored) return { changed: false, reason: 'invalid-history', items: normalizedItems };
    const conflictingIndex = normalizedItems.findIndex((item, itemIndex) =>
      itemIndex !== index && getRecentSiteUrlKey(item) === getRecentSiteUrlKey(restored)
    );
    if (conflictingIndex >= 0) {
      return { changed: false, reason: 'url-conflict', items: normalizedItems };
    }
    const nextItems = normalizedItems.slice();
    nextItems[index] = {
      ...currentItem,
      title: restored.title,
      url: restored.url,
      host: restored.host,
      siteName: restored.siteName,
      lastVisitTime: restored.lastVisitTime,
      visitCount: restored.visitCount,
      updateHistory: history.slice(1),
      updatePending: true
    };
    return {
      changed: true,
      reason: 'undone',
      index,
      items: normalizePinnedRecentSites(nextItems, opts)
    };
  }

  function normalizeHiddenRecentSiteEntry(item) {
    if (!item) {
      return null;
    }
    const url = typeof item === 'string'
      ? String(item).trim()
      : String(item.url || '').trim();
    if (!url) {
      return null;
    }
    const lastVisitTime = typeof item === 'string'
      ? 0
      : Math.max(0, Number(item.lastVisitTime) || 0);
    return {
      url,
      lastVisitTime,
      hiddenAt: Math.max(0, Number(item.hiddenAt) || Date.now())
    };
  }

  function normalizeHiddenRecentSites(items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxHidden = Number.isFinite(Number(opts.maxHidden))
      ? Math.max(0, Number(opts.maxHidden))
      : DEFAULT_MAX_HIDDEN;
    if (!Array.isArray(items) || maxHidden <= 0) {
      return [];
    }
    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const entry = normalizeHiddenRecentSiteEntry(items[i]);
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

  function isRecentSiteHidden(item, hiddenSites) {
    const key = getRecentSiteUrlKey(item);
    if (!key || !Array.isArray(hiddenSites)) {
      return false;
    }
    const entry = hiddenSites.find((candidate) => candidate && candidate.url === key);
    if (!entry) {
      return false;
    }
    const lastVisitTime = Math.max(0, Number(item && item.lastVisitTime) || 0);
    return lastVisitTime <= entry.lastVisitTime;
  }

  function storageGet(storage, key) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.get !== 'function') {
        resolve({});
        return;
      }
      storage.get([key], (result) => {
        resolve(result || {});
      });
    });
  }

  function storageSet(storage, value) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.set !== 'function') {
        resolve();
        return;
      }
      storage.set(value, () => resolve());
    });
  }

  function loadPinnedRecentSites(storage, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_PINNED_KEY;
    return storageGet(storage, key).then((result) => {
      const rawItems = Array.isArray(result && result[key]) ? result[key] : [];
      const normalized = normalizePinnedRecentSites(rawItems, opts);
      const needsCardIdMigration = normalized.some((item) => {
        const rawItem = rawItems.find((candidate) =>
          getRecentSiteUrlKey(candidate) === getRecentSiteUrlKey(item)
        );
        return !rawItem || normalizePinnedRecentCardId(rawItem.cardId) !== item.cardId;
      });
      if (!needsCardIdMigration) return normalized;
      return storageSet(storage, { [key]: normalized }).then(() => normalized);
    });
  }

  function savePinnedRecentSites(storage, items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_PINNED_KEY;
    const normalized = normalizePinnedRecentSites(items, opts);
    return storageSet(storage, { [key]: normalized }).then(() => normalized);
  }

  function loadHiddenRecentSites(storage, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_HIDDEN_KEY;
    return storageGet(storage, key).then((result) =>
      normalizeHiddenRecentSites(result && result[key], opts)
    );
  }

  function saveHiddenRecentSites(storage, items, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const key = opts.key || DEFAULT_HIDDEN_KEY;
    const normalized = normalizeHiddenRecentSites(items, opts);
    return storageSet(storage, { [key]: normalized }).then(() => normalized);
  }

  function normalizeSourceItem(item, source, options) {
    if (!item) {
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

  function createRecentSiteCollector(pinned, hidden, limit, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxItems = Math.max(0, Number(limit) || 0);
    const items = [];
    const seenUrls = new Set();
    const seenHosts = new Set();
    const hiddenByUrl = new Map();

    normalizeHiddenRecentSites(hidden, opts).forEach((entry) => {
      hiddenByUrl.set(entry.url, entry);
    });

    function isFull() {
      return items.length >= maxItems;
    }

    function appendNormalized(normalized, isPinned) {
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
      const hostKey = getRecentSiteHostKey(normalized, opts);
      if (
        (urlKey && seenUrls.has(urlKey)) ||
        (!isPinned && hostKey && seenHosts.has(hostKey))
      ) {
        return false;
      }
      if (urlKey) {
        seenUrls.add(urlKey);
      }
      if (hostKey) {
        seenHosts.add(hostKey);
      }
      normalized._xPinned = Boolean(isPinned);
      items.push(normalized);
      return true;
    }

    const normalizedPinned = normalizePinnedRecentSites(pinned, opts);
    for (let index = 0; index < normalizedPinned.length && !isFull(); index += 1) {
      appendNormalized(normalizedPinned[index], true);
    }

    return {
      items,
      isFull,
      append(item, isPinned) {
        const normalized = normalizeRecentSiteItem(item, {
          ...opts,
          ignoreBlacklist: Boolean(isPinned)
        });
        return appendNormalized(normalized, isPinned);
      },
      appendNormalized
    };
  }

  function appendSourceItemsToCollector(
    collector,
    candidateState,
    seenHosts,
    items,
    source,
    limit,
    options
  ) {
    const list = Array.isArray(items) ? items : [];
    for (let index = 0; index < list.length; index += 1) {
      if (candidateState.count >= limit || collector.isFull()) {
        break;
      }
      const normalized = normalizeSourceItem(list[index], source, options);
      if (!normalized || !normalized.host || seenHosts.has(normalized.host)) {
        continue;
      }
      seenHosts.add(normalized.host);
      candidateState.count += 1;
      collector.appendNormalized(normalized, false);
    }
  }

  function sortTabCandidates(items) {
    return (Array.isArray(items) ? items : [])
      .slice()
      .sort((a, b) => (Number(b && b.lastAccessed) || 0) - (Number(a && a.lastAccessed) || 0));
  }

  function shouldPrioritizeTabUrl(url, options) {
    return Boolean(
      options &&
      typeof options.shouldPrioritizeTabUrl === 'function' &&
      options.shouldPrioritizeTabUrl(url)
    );
  }

  function mergeRecentSitesWithPinned(items, pinned, hidden, limit, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const maxItems = Math.max(0, Number(limit) || 0);
    if (maxItems <= 0) {
      return [];
    }
    const collector = createRecentSiteCollector(pinned, hidden, maxItems, opts);
    const candidates = Array.isArray(items) ? items : [];
    for (let index = 0; index < candidates.length && !collector.isFull(); index += 1) {
      collector.append(candidates[index], false);
    }
    return collector.items;
  }

  function mergeRecentSiteSources(input) {
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
    const sourceSeenHosts = new Set();
    const appendSource = (items, source) => {
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
    const rawTabCandidates = Array.isArray(options.tabs) ? options.tabs : [];
    const priorityTabCandidates = sortTabCandidates(
      rawTabCandidates.filter((item) => shouldPrioritizeTabUrl(item && item.url, options))
    );
    appendSource(priorityTabCandidates, 'tabs');
    if (mode === 'most') {
      appendSource(options.topSites, 'topSites');
      if (candidateState.count === 0) {
        appendSource(options.historyItems, 'history');
        appendSource(options.topSites, 'topSites');
      }
    } else {
      appendSource(options.historyItems, 'history');
      appendSource(options.topSites, 'topSites');
    }
    if (candidateState.count < candidateLimit && !collector.isFull()) {
      appendSource(sortTabCandidates(rawTabCandidates), 'tabs');
    }
    return collector.items;
  }

  return Object.freeze({
    DEFAULT_PINNED_KEY,
    DEFAULT_HIDDEN_KEY,
    DEFAULT_MAX_PINNED,
    DEFAULT_MAX_HIDDEN,
    DEFAULT_MAX_UPDATE_HISTORY,
    normalizePinnedRecentCardId,
    createLegacyPinnedRecentCardId,
    normalizeRecentCount,
    normalizeRecentSiteItem,
    normalizeRecentUpdateHistory,
    normalizePinnedRecentSites,
    undoPinnedRecentSiteUpdate,
    normalizeHiddenRecentSiteEntry,
    normalizeHiddenRecentSites,
    loadPinnedRecentSites,
    savePinnedRecentSites,
    loadHiddenRecentSites,
    saveHiddenRecentSites,
    getRecentSiteUrlKey,
    getRecentSiteHostKey,
    isSameRecentSite,
    isRecentSiteHidden,
    mergeRecentSitesWithPinned,
    mergeRecentSiteSources
  });
});
