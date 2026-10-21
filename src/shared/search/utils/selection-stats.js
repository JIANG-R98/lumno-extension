(function(root) {
  'use strict';

  // The query context a ranking pass shares, and the per-query selection
  // stats that boost what was picked before.
  function createSelectionStats(deps) {
    const {
      normalizeSearchText,
      isSearchUnitQueryEligible,
      compactSearchQuery,
      splitSearchTerms,
      classifySearchIntent,
      getNow,
      SEARCH_SELECTION_POLICY,
      buildSearchDedupUrlKey
    } = deps;

    const SEARCH_SETTINGS_INTENT_TERMS = new Set([
      'setting',
      'settings',
      'option',
      'options',
      'config',
      'configure',
      'preference',
      'preferences',
      'prefs',
      '设置',
      '选项',
      '配置',
      '偏好',
      '管理'
    ]);

    const SEARCH_INFORMATIONAL_TERMS = new Set([
      'how',
      'what',
      'why',
      'when',
      'where',
      'tutorial',
      'tutorials',
      'guide',
      'guides',
      'learn',
      'docs',
      'doc',
      'help',
      'review',
      'reviews',
      'compare',
      'comparison',
      'price',
      'pricing',
      'news',
      '下载',
      '教程',
      '文档',
      '帮助',
      '对比',
      '价格',
      '评测',
      '为什么',
      '怎么',
      '如何'
    ]);

    function buildSearchQueryContext(query) {
      const lookupQuery = String(query || '');
      const queryLower = normalizeSearchText(lookupQuery).trim();
      // The query as title units spell it ("wxds", "gh ck", "微信 读书"); empty
      // when only plain text matching applies.
      const unitQuery = isSearchUnitQueryEligible(queryLower) ? compactSearchQuery(queryLower) : '';
      const coreQueryTerms = splitSearchTerms(queryLower);
      const queryTerms = splitSearchTerms(queryLower);
      if (queryLower && !queryTerms.includes(queryLower)) {
        queryTerms.unshift(queryLower);
      }
      return {
        lookupQuery,
        queryLower,
        unitQuery,
        coreQueryTerms,
        queryTerms,
        intentType: classifySearchIntent(lookupQuery, queryTerms),
        hasSettingsIntent: queryTerms.some((term) => SEARCH_SETTINGS_INTENT_TERMS.has(term)),
        hasInformationalIntent: queryTerms.some((term) => SEARCH_INFORMATIONAL_TERMS.has(term))
      };
    }

    function normalizeSearchSelectionQuery(query) {
      const value = String(query || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      return value.length > 120 ? value.slice(0, 120) : value;
    }

    function normalizeSearchSelectionType(type) {
      const value = String(type || '').trim();
      if (!value) {
        return 'history';
      }
      if (value === 'bookmark' || value === 'topSite' || value === 'history' || value === 'directUrl' || value === 'browserPage' || value === 'autocomplete') {
        return value;
      }
      return 'history';
    }

    function normalizeSearchSelectionEntry(urlKey, entry, now, retentionMs) {
      if (!urlKey || !entry || typeof entry !== 'object') {
        return null;
      }
      const lastSelectedAt = Number(entry.lastSelectedAt) || 0;
      if (!lastSelectedAt || now - lastSelectedAt > retentionMs) {
        return null;
      }
      const url = String(entry.url || '').trim();
      if (!url) {
        return null;
      }
      return {
        url,
        title: String(entry.title || '').trim().slice(0, 180),
        type: normalizeSearchSelectionType(entry.type),
        count: Math.max(1, Math.min(999, Math.floor(Number(entry.count) || 1))),
        lastSelectedAt
      };
    }

    function normalizeSearchSelectionStats(rawStats, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const now = getNow(settings);
      const retentionDays = Number(settings.retentionDays) > 0
        ? Number(settings.retentionDays)
        : SEARCH_SELECTION_POLICY.retentionDays;
      const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
      const maxQueries = Number(settings.maxQueries) > 0
        ? Math.floor(Number(settings.maxQueries))
        : SEARCH_SELECTION_POLICY.maxQueries;
      const maxEntriesPerQuery = Number(settings.maxEntriesPerQuery) > 0
        ? Math.floor(Number(settings.maxEntriesPerQuery))
        : SEARCH_SELECTION_POLICY.maxEntriesPerQuery;
      const sourceQueries = rawStats && typeof rawStats === 'object' && rawStats.queries && typeof rawStats.queries === 'object'
        ? rawStats.queries
        : {};
      const buckets = [];

      Object.entries(sourceQueries).forEach(([rawQueryKey, rawBucket]) => {
        const queryKey = normalizeSearchSelectionQuery(rawQueryKey);
        const bucket = rawBucket && typeof rawBucket === 'object' ? rawBucket : {};
        const sourceEntries = bucket.entries && typeof bucket.entries === 'object' ? bucket.entries : {};
        const entries = {};
        Object.entries(sourceEntries)
          .map(([urlKey, entry]) => [urlKey, normalizeSearchSelectionEntry(urlKey, entry, now, retentionMs)])
          .filter(([, entry]) => Boolean(entry))
          .sort((a, b) => {
            const lastDiff = b[1].lastSelectedAt - a[1].lastSelectedAt;
            if (lastDiff !== 0) {
              return lastDiff;
            }
            return b[1].count - a[1].count;
          })
          .slice(0, maxEntriesPerQuery)
          .forEach(([urlKey, entry]) => {
            entries[urlKey] = entry;
          });
        if (!queryKey || Object.keys(entries).length === 0) {
          return;
        }
        const updatedAt = Math.max(
          Number(bucket.updatedAt) || 0,
          ...Object.values(entries).map((entry) => Number(entry.lastSelectedAt) || 0)
        );
        buckets.push([queryKey, { updatedAt, entries }]);
      });

      buckets.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
      const queries = {};
      buckets.slice(0, maxQueries).forEach(([queryKey, bucket]) => {
        queries[queryKey] = bucket;
      });
      return {
        version: 1,
        updatedAt: buckets.length > 0 ? buckets[0][1].updatedAt : 0,
        queries
      };
    }

    function recordSearchSelectionInStats(rawStats, selection, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const now = getNow(settings);
      const queryKey = normalizeSearchSelectionQuery(selection && selection.query);
      const url = String(selection && selection.url || '').trim();
      if (!queryKey || !url) {
        return normalizeSearchSelectionStats(rawStats, settings);
      }
      const urlKey = buildSearchDedupUrlKey(url);
      if (!urlKey) {
        return normalizeSearchSelectionStats(rawStats, settings);
      }
      const stats = normalizeSearchSelectionStats(rawStats, settings);
      const bucket = stats.queries[queryKey] || { updatedAt: 0, entries: {} };
      const existing = bucket.entries[urlKey] || null;
      bucket.entries[urlKey] = {
        url,
        title: String(selection.title || (existing && existing.title) || '').trim().slice(0, 180),
        type: normalizeSearchSelectionType(selection.type || (existing && existing.type)),
        count: Math.max(1, Math.min(999, (Number(existing && existing.count) || 0) + 1)),
        lastSelectedAt: now
      };
      bucket.updatedAt = now;
      stats.queries[queryKey] = bucket;
      stats.updatedAt = now;
      return normalizeSearchSelectionStats(stats, settings);
    }

    return {
      buildSearchQueryContext,
      normalizeSearchSelectionQuery,
      normalizeSearchSelectionStats,
      recordSearchSelectionInStats
    };
  }

  const api = Object.freeze({ createSelectionStats });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsSelectionStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
