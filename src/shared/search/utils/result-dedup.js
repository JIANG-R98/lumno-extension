(function(root) {
  'use strict';

  // Deduplicating results: URL keys without tracking parameters, which of
  // two duplicates to keep, and merging item lists by URL.
  function createResultDedup(deps) {
    const {
      normalizeHost,
      getSearchSiteConfig,
      getSearchDirectNavigationTitle,
      getSearchDirectNavigationUrl
    } = deps;

    const SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES = new Set([
      'entry',
      'reason',
      'ref',
      'ref_src',
      'source',
      'from',
      'from_source',
      'feature',
      'feature_source',
      'campaign',
      'campaign_id',
      'campaign_source',
      'channel',
      'via',
      'trk',
      'track',
      'tracking',
      'tracking_id',
      'spm',
      'si'
    ]);

    function shouldIgnoreSearchDedupQueryParam(paramName) {
      const normalized = String(paramName || '').trim().toLowerCase();
      if (!normalized) {
        return false;
      }
      return normalized.startsWith('utm_') || SEARCH_DEDUP_IGNORED_QUERY_PARAM_NAMES.has(normalized);
    }

    function buildSearchDedupUrlKey(url) {
      if (!url || typeof url !== 'string') {
        return '';
      }
      try {
        const parsed = new URL(url);
        parsed.protocol = String(parsed.protocol || '').toLowerCase();
        parsed.hostname = normalizeHost(parsed.hostname);
        if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
          parsed.port = '';
        }
        parsed.hash = '';
        const normalizedPathname = parsed.pathname !== '/'
          ? (parsed.pathname.replace(/\/+$/, '') || '/')
          : '/';
        parsed.pathname = normalizedPathname;
        const normalizedHost = normalizeHost(parsed.hostname);
        const siteConfig = getSearchSiteConfig(normalizedHost);
        const ignoreAllSearchParamsPaths = siteConfig && siteConfig.ignoreAllSearchParamsPaths
          ? siteConfig.ignoreAllSearchParamsPaths
          : null;
        const shouldIgnoreAllSearchParams = Boolean(
          ignoreAllSearchParamsPaths && ignoreAllSearchParamsPaths.has(normalizedPathname)
        );
        const nextParams = new URLSearchParams();
        if (!shouldIgnoreAllSearchParams) {
          Array.from(parsed.searchParams.entries())
            .filter(([key]) => !shouldIgnoreSearchDedupQueryParam(key))
            .sort(([keyA, valueA], [keyB, valueB]) => {
              if (keyA === keyB) {
                return String(valueA).localeCompare(String(valueB));
              }
              return String(keyA).localeCompare(String(keyB));
            })
            .forEach(([key, value]) => {
              nextParams.append(key, value);
            });
        }
        parsed.search = nextParams.toString() ? `?${nextParams.toString()}` : '';
        return parsed.toString();
      } catch (e) {
        return String(url).trim().toLowerCase();
      }
    }

    function getStableDirectNavigationTitleForUrl(url, sourceType) {
      if (sourceType === 'bookmark') {
        return '';
      }
      try {
        const parsed = new URL(String(url || '').trim());
        const directTitle = getSearchDirectNavigationTitle(parsed.hostname);
        if (!directTitle) {
          return '';
        }
        return buildSearchDedupUrlKey(url) === buildSearchDedupUrlKey(getSearchDirectNavigationUrl(parsed.hostname))
          ? directTitle
          : '';
      } catch (e) {
        return '';
      }
    }

    function getSearchSuggestionDisplayTitle(item, sourceType) {
      return getStableDirectNavigationTitleForUrl(item && item.url, sourceType) ||
        (item && item.title) ||
        (item && item.url) ||
        '';
    }

    function shouldReplaceDedupedSearchItem(candidate, existing) {
      if (!existing) {
        return true;
      }
      const candidateVisit = Number(candidate && candidate.lastVisitTime) || 0;
      const existingVisit = Number(existing && existing.lastVisitTime) || 0;
      if (candidateVisit !== existingVisit) {
        return candidateVisit > existingVisit;
      }
      const candidateTyped = Number(candidate && candidate.typedCount) || 0;
      const existingTyped = Number(existing && existing.typedCount) || 0;
      if (candidateTyped !== existingTyped) {
        return candidateTyped > existingTyped;
      }
      const candidateVisitCount = Number(candidate && candidate.visitCount) || 0;
      const existingVisitCount = Number(existing && existing.visitCount) || 0;
      if (candidateVisitCount !== existingVisitCount) {
        return candidateVisitCount > existingVisitCount;
      }
      const candidateTitleLength = String(candidate && candidate.title || '').trim().length;
      const existingTitleLength = String(existing && existing.title || '').trim().length;
      return candidateTitleLength > existingTitleLength;
    }

    function normalizeSearchDedupTitle(title) {
      return String(title || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    }

    function buildSearchDedupEntryKey(item) {
      if (!item) {
        return '';
      }
      const urlKey = typeof item.url === 'string' && item.url
        ? buildSearchDedupUrlKey(item.url)
        : '';
      // One page is one result: the same URL seen as history, bookmark, top
      // site or open tab (often under different titles) must merge, not repeat.
      if (urlKey) {
        return `url:${urlKey}`;
      }
      const titleKey = normalizeSearchDedupTitle(item.title);
      if (titleKey) {
        return `title:${titleKey}`;
      }
      return `id:${item.id || ''}:${String(item.title || '').trim()}`;
    }

    function mergeItemsByUrl(itemGroups) {
      const merged = [];
      const mergedIndexByKey = new Map();
      (Array.isArray(itemGroups) ? itemGroups : []).forEach((items) => {
        (Array.isArray(items) ? items : []).forEach((item) => {
          if (!item) {
            return;
          }
          const urlKey = buildSearchDedupEntryKey(item);
          const existingIndex = mergedIndexByKey.get(urlKey);
          if (typeof existingIndex === 'number') {
            if (shouldReplaceDedupedSearchItem(item, merged[existingIndex])) {
              merged[existingIndex] = item;
            }
            return;
          }
          mergedIndexByKey.set(urlKey, merged.length);
          merged.push(item);
        });
      });
      return merged;
    }

    return {
      buildSearchDedupUrlKey,
      getSearchSuggestionDisplayTitle,
      buildSearchDedupEntryKey,
      mergeItemsByUrl
    };
  }

  const api = Object.freeze({ createResultDedup });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsResultDedup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
