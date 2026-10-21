(function(root) {
  'use strict';

  // What a query is after: URL clusters, navigation versus information
  // intent, source adjustments, term coverage and category adjustments.
  function createQueryIntent(deps) {
    const {
      normalizeHost,
      getSearchSiteConfig,
      normalizeSearchText,
      splitSearchTitleTokens,
      getSearchTitleUnitMatch,
      SEARCH_WORD_CHARACTERS_PATTERN,
      SEARCH_HAN_PATTERN,
      splitSearchTerms
    } = deps;

    const SEARCH_PATH_INTENT_TERMS = new Set([
      'release',
      'releases',
      'issue',
      'issues',
      'pull',
      'pulls',
      'docs',
      'doc',
      'wiki',
      'guide',
      'guides',
      'pricing',
      'price',
      'download',
      'admin',
      'bookmark',
      'bookmarks',
      'chat',
      'message',
      'messages',
      'dm',
      'dms',
      'setting',
      'settings',
      'profile',
      'account',
      'notification',
      'notifications',
      '设置',
      '通知',
      '文档',
      '价格',
      '下载',
      '发布'
    ]);

    const SEARCH_UTILITY_SEGMENTS = new Set([
      'settings',
      'setting',
      'preferences',
      'preference',
      'prefs',
      'profile',
      'profiles',
      'account',
      'accounts',
      'notification',
      'notifications',
      'activity',
      'activities',
      'like',
      'likes',
      'admin',
      'dashboard',
      'manage',
      'management',
      'billing',
      'payment',
      'payments',
      'login',
      'signin',
      'sign-in',
      'auth',
      'oauth',
      'callback',
      'checkout',
      'cashier',
      'cart',
      'pay'
    ]);

    const SEARCH_ACTION_SEGMENTS = new Set([
      'new',
      'edit',
      'create',
      'update',
      'delete',
      'compose'
    ]);

    function looksLikeVersionSegment(segment) {
      const value = String(segment || '').trim().toLowerCase();
      if (!value) {
        return false;
      }
      return /^v?\d+(\.\d+){1,3}([.-][a-z0-9]+)?$/i.test(value);
    }

    function looksLikeOpaqueIdSegment(segment) {
      const value = String(segment || '').trim().toLowerCase();
      if (!value) {
        return false;
      }
      if (/^\d+$/.test(value)) {
        return true;
      }
      if (/^[0-9a-f]{8,}$/i.test(value)) {
        return true;
      }
      if (/^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(value)) {
        return true;
      }
      return false;
    }

    function normalizeClusterSegment(segment) {
      const value = String(segment || '').trim().toLowerCase();
      if (!value) {
        return '';
      }
      if (looksLikeVersionSegment(value)) {
        return ':version';
      }
      if (looksLikeOpaqueIdSegment(value)) {
        return ':id';
      }
      return value;
    }

    function getSearchSuggestionClusterInfo(url) {
      if (!url) {
        return {
          host: '',
          category: 'unknown',
          clusterKey: '',
          depth: 0,
          path: '/'
        };
      }
      try {
        const parsed = new URL(url);
        const host = normalizeHost(parsed.hostname);
        const path = parsed.pathname !== '/' ? (parsed.pathname.replace(/\/+$/, '') || '/') : '/';
        const rawSegments = path.split('/').filter(Boolean).map((item) => decodeURIComponent(item).toLowerCase());
        const segments = rawSegments.map(normalizeClusterSegment);
        const first = segments[0] || '';
        const second = segments[1] || '';
        const third = segments[2] || '';

        const siteConfig = getSearchSiteConfig(host);
        if (host === 'github.com' && segments.length >= 2) {
          const repoBase = `${host}/${segments[0]}/${segments[1]}`;
          if (segments.length === 2) {
            return { host, category: 'repo-root', clusterKey: repoBase, depth: segments.length, path };
          }
          const repoAreaCategories = siteConfig && siteConfig.repoAreaCategories
            ? siteConfig.repoAreaCategories
            : null;
          if (repoAreaCategories && repoAreaCategories.has(third)) {
            return { host, category: repoAreaCategories.get(third), clusterKey: `${repoBase}/${third}`, depth: segments.length, path };
          }
          if (third === 'tree' || third === 'blob') {
            const area = segments[4] || segments[3] || 'root';
            return { host, category: 'repo-code', clusterKey: `${repoBase}/code/${area}`, depth: segments.length, path };
          }
          return { host, category: 'repo-child', clusterKey: `${repoBase}/${third || 'root'}`, depth: segments.length, path };
        }

        if (segments.length === 0) {
          return { host, category: 'site-root', clusterKey: `${host}/`, depth: 0, path };
        }

        const utilitySegment = segments.slice(0, 3).find((segment) => (
          SEARCH_UTILITY_SEGMENTS.has(segment)
        ));
        if (utilitySegment) {
          return { host, category: 'utility', clusterKey: `${host}/utility/${utilitySegment}`, depth: segments.length, path };
        }

        if (SEARCH_ACTION_SEGMENTS.has(first)) {
          return { host, category: 'action', clusterKey: `${host}/action/${first}`, depth: segments.length, path };
        }

        if ((first === 'u' || first === 'user' || first === 'users' || first === 'profile' || first === 'profiles') && second) {
          return { host, category: 'user', clusterKey: `${host}/user/${second}`, depth: segments.length, path };
        }

        if (first === 'release' || first === 'releases' || first === 'onboarding' || first === 'changelog') {
          return { host, category: 'landing', clusterKey: `${host}/${first}`, depth: segments.length, path };
        }

        if (first === 'docs' || first === 'doc' || first === 'wiki' || first === 'help' || first === 'guide' || first === 'guides') {
          const docKey = second || 'root';
          return { host, category: 'docs', clusterKey: `${host}/${first}/${docKey}`, depth: segments.length, path };
        }

        if (segments.length === 1) {
          return { host, category: 'section', clusterKey: `${host}/${first}`, depth: segments.length, path };
        }

        return { host, category: 'content', clusterKey: `${host}/${first}/${second}`, depth: segments.length, path };
      } catch (e) {
        return {
          host: '',
          category: 'unknown',
          clusterKey: String(url).trim().toLowerCase(),
          depth: 0,
          path: '/'
        };
      }
    }

    function looksLikeNavigationQuery(query) {
      const value = String(query || '').trim().toLowerCase();
      if (!value) {
        return false;
      }
      if (value.includes('://')) {
        return true;
      }
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/#?].*)?$/i.test(value)) {
        return true;
      }
      return false;
    }

    function classifySearchIntent(query, queryTerms) {
      const raw = String(query || '').trim().toLowerCase();
      const terms = Array.isArray(queryTerms) ? queryTerms.filter(Boolean) : [];
      if (looksLikeNavigationQuery(raw)) {
        return 'navigation';
      }

      if (terms.some((term) => SEARCH_PATH_INTENT_TERMS.has(term))) {
        return 'path';
      }

      if (terms.some((term) => looksLikeVersionSegment(term)) || /v?\d+(\.\d+){1,3}/i.test(raw)) {
        return 'revisit';
      }

      if (terms.length >= 2) {
        if (terms.some((term) => /\d/.test(term))) {
          return 'revisit';
        }
        return 'object';
      }

      if (terms.length === 1) {
        return 'brand';
      }

      return 'object';
    }

    function getSearchSourceAdjustment(sourceType, intentType) {
      const source = String(sourceType || '');
      const intent = String(intentType || 'object');

      if (intent === 'navigation' || intent === 'brand') {
        if (source === 'bookmark') {
          return 24;
        }
        if (source === 'topSite') {
          return 20;
        }
        if (source === 'history') {
          return 4;
        }
      }

      if (intent === 'path' || intent === 'revisit') {
        if (source === 'history') {
          return 18;
        }
        if (source === 'bookmark') {
          return 10;
        }
        if (source === 'topSite') {
          return 8;
        }
      }

      if (intent === 'object') {
        if (source === 'bookmark') {
          return 18;
        }
        if (source === 'history') {
          return 12;
        }
        if (source === 'topSite') {
          return 10;
        }
      }

      return 0;
    }

    // A Han query spelled the way a site's address writes it: 知乎 is
    // zhihu.com, 京东 is jd.com. The background fills queryHostSpellings with
    // the query's pinyin and initials; only a whole address label counts.
    function matchesSearchHostSpelling(hostLabels, context) {
      const spellings = context && Array.isArray(context.queryHostSpellings) ? context.queryHostSpellings : [];
      return spellings.length > 0 && hostLabels.some((label) => spellings.includes(label));
    }

    // Title units (pinyin, initials, words across spaces) are walked only when
    // the plain text checks fail, since most queries match the text itself.
    function matchesSearchQueryText(item, context, options) {
      if (!item || !item.url) {
        return false;
      }
      const title = item.title ? String(item.title) : '';
      const titleLower = normalizeSearchText(title);
      const urlLower = item.url.toLowerCase();
      const titleTokens = splitSearchTitleTokens(title);
      let hostname = '';
      let hostLabels = [];
      try {
        hostname = normalizeHost(new URL(item.url).hostname);
        hostLabels = hostname.split('.').filter(Boolean);
      } catch (e) {
        hostname = '';
        hostLabels = [];
      }
      const matchesTerm = (term) => {
        if (!term) {
          return false;
        }
        if (
          titleLower === term ||
          titleLower.startsWith(term) ||
          titleTokens.includes(term) ||
          titleTokens.some((token) => token.startsWith(term))
        ) {
          return true;
        }
        if (
          hostname.startsWith(term) ||
          hostLabels.includes(term) ||
          hostLabels.some((label) => label.startsWith(term))
        ) {
          return true;
        }
        if (shouldAllowLooseTextContains(term) && (titleLower.includes(term) || urlLower.includes(term))) {
          return true;
        }
        return Boolean(getSearchTitleUnitMatch(title, term, options));
      };
      if (matchesTerm(context.queryLower) || matchesSearchHostSpelling(hostLabels, context)) {
        return true;
      }
      const coreTerms = Array.isArray(context.coreQueryTerms) && context.coreQueryTerms.length > 0
        ? context.coreQueryTerms
        : (Array.isArray(context.queryTerms) ? context.queryTerms : []);
      return coreTerms.length > 0 && coreTerms.every((term) => matchesTerm(term));
    }

    function isShortWordSearchTerm(term) {
      const value = String(term || '').trim();
      return Boolean(value) && Array.from(value).length <= 2 && SEARCH_WORD_CHARACTERS_PATTERN.test(value);
    }

    function shouldAllowLooseTextContains(term) {
      const value = String(term || '').trim().toLowerCase();
      if (!value) {
        return false;
      }
      if (SEARCH_HAN_PATTERN.test(value)) {
        return true;
      }
      return !isShortWordSearchTerm(value);
    }

    function getSearchTermCoverageStats(context, candidateParts) {
      const terms = Array.isArray(context && context.coreQueryTerms) && context.coreQueryTerms.length > 0
        ? context.coreQueryTerms
        : splitSearchTerms(context && context.queryLower ? context.queryLower : '');
      if (terms.length === 0) {
        return {
          total: 0,
          matchedCount: 0,
          missingCount: 0,
          allMatched: false
        };
      }
      const normalizedCandidate = candidateParts && typeof candidateParts === 'object'
        ? candidateParts
        : {};
      const titleLower = String(normalizedCandidate.titleLower || '');
      const hostname = String(normalizedCandidate.hostname || '');
      const urlLower = String(normalizedCandidate.urlLower || '');
      const titleTokens = Array.isArray(normalizedCandidate.titleTokens) ? normalizedCandidate.titleTokens : [];
      const hostLabels = Array.isArray(normalizedCandidate.hostLabels) ? normalizedCandidate.hostLabels : [];
      const pathTokens = Array.isArray(normalizedCandidate.pathTokens) ? normalizedCandidate.pathTokens : [];
      const matchesTitleUnits = typeof normalizedCandidate.matchesTitleUnits === 'function'
        ? normalizedCandidate.matchesTitleUnits
        : () => false;
      let matchedCount = 0;

      terms.forEach((term) => {
        if (!term) {
          return;
        }
        const matched = (
          titleTokens.includes(term) ||
          hostLabels.includes(term) ||
          pathTokens.includes(term) ||
          titleTokens.some((token) => token.startsWith(term)) ||
          hostLabels.some((label) => label.startsWith(term)) ||
          pathTokens.some((token) => token.startsWith(term)) ||
          (shouldAllowLooseTextContains(term) && (
            titleLower.includes(term) ||
            hostname.includes(term) ||
            urlLower.includes(term)
          )) ||
          matchesTitleUnits(term)
        );
        if (matched) {
          matchedCount += 1;
        }
      });

      return {
        total: terms.length,
        matchedCount,
        missingCount: Math.max(0, terms.length - matchedCount),
        allMatched: matchedCount === terms.length
      };
    }

    function getSearchSuggestionCategoryAdjustment(item, context, coverageStats) {
      if (!item || !item.url) {
        return 0;
      }
      const info = getSearchSuggestionClusterInfo(item.url);
      const querySet = new Set(Array.isArray(context && context.queryTerms) ? context.queryTerms : []);
      const hasSettingsIntent = Boolean(context && context.hasSettingsIntent);
      const hasActionIntent = querySet.has('new') || querySet.has('edit') || querySet.has('create') || querySet.has('settings') || querySet.has('设置');
      let adjustment = 0;

      if (info.category === 'site-root' || info.category === 'repo-root') {
        adjustment += 18;
      } else if (info.category === 'section') {
        adjustment += 8;
      } else if (info.category === 'landing' || info.category === 'docs') {
        adjustment += 10;
      }

      if (item.type === 'topSite' || item.isTopSite) {
        if (info.category === 'site-root' || info.category === 'repo-root') {
          adjustment += 20;
        } else if (info.category === 'section' || info.category === 'landing') {
          adjustment += 10;
        } else {
          adjustment += 4;
        }
      }

      if (info.depth >= 3 && info.category !== 'docs' && info.category !== 'repo-code') {
        adjustment -= Math.min(16, (info.depth - 2) * 4);
      }

      if (info.category === 'utility') {
        adjustment -= hasSettingsIntent ? 10 : 95;
      }

      if (info.category === 'action') {
        adjustment -= hasActionIntent ? 8 : 80;
      }

      if (info.category === 'repo-code') {
        adjustment -= 18;
      }

      if (info.category === 'repo-child' && info.depth >= 4) {
        adjustment -= 14;
      }

      if (coverageStats && coverageStats.total >= 2) {
        const isRepresentativePage =
          info.category === 'site-root' ||
          info.category === 'repo-root' ||
          info.category === 'section' ||
          info.category === 'landing';
        if (coverageStats.allMatched) {
          if (info.category === 'repo-root') {
            adjustment += 18;
          } else if (!isRepresentativePage) {
            adjustment += 12;
          }
        } else if (isRepresentativePage) {
          adjustment -= Math.min(36, coverageStats.missingCount * 18);
          if ((item.type === 'topSite' || item.isTopSite) && info.category !== 'repo-root') {
            adjustment -= 6;
          }
        }
      }

      return adjustment;
    }

    function getOwnExtensionUtilityPenalty(item, options) {
      const settings = options && typeof options === 'object' ? options : {};
      const isOwnExtensionUrl = typeof settings.isOwnExtensionUrl === 'function'
        ? settings.isOwnExtensionUrl
        : () => false;
      const hasSettingsIntent = Boolean(settings.hasSettingsIntent);
      if (!item || !item.url || !isOwnExtensionUrl(item.url) || hasSettingsIntent) {
        return 0;
      }
      try {
        const parsedUrl = new URL(item.url);
        const pathnameLower = String(parsedUrl.pathname || '').toLowerCase();
        if (pathnameLower.endsWith('/options.html') || pathnameLower.endsWith('options.html')) {
          return 110;
        }
      } catch (e) {
        return 0;
      }
      return 0;
    }

    return {
      getSearchSuggestionClusterInfo,
      classifySearchIntent,
      getSearchSourceAdjustment,
      matchesSearchHostSpelling,
      matchesSearchQueryText,
      isShortWordSearchTerm,
      shouldAllowLooseTextContains,
      getSearchTermCoverageStats,
      getSearchSuggestionCategoryAdjustment,
      getOwnExtensionUtilityPenalty
    };
  }

  const api = Object.freeze({ createQueryIntent });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsQueryIntent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
