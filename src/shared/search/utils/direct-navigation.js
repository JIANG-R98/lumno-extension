(function(root) {
  'use strict';

  // Hosts and direct navigation: normalizing hosts and their aliases,
  // the per-site search config, and telling a typed address (with dev hosts,
  // numeric hosts and full-width dots) from a search.
  function createDirectNavigation(deps) {
    const SEARCH_COMMON_SECOND_LEVEL_DOMAIN_LABELS = new Set([
      'ac',
      'co',
      'com',
      'edu',
      'gov',
      'net',
      'org'
    ]);

    const SEARCH_PRIVATE_DOMAIN_SUFFIXES = new Set([
      'blogspot.com',
      'github.io',
      'netlify.app',
      'notion.site',
      'pages.dev',
      'vercel.app',
      'wordpress.com'
    ]);

    // data: and javascript: are deliberately absent: typed or pasted, they would
    // open attacker-chosen content or script as a top-level page, so the input
    // is searched for instead.
    const DIRECT_NAVIGATION_SINGLE_COLON_PROTOCOLS = new Set([
      'about:',
      'bitcoin:',
      'blob:',
      'ethereum:',
      'filesystem:',
      'geo:',
      'ipfs:',
      'ipns:',
      'magnet:',
      'mailto:',
      'sms:',
      'tel:',
      'urn:',
      'view-source:',
      'webcal:'
    ]);

    const SEARCH_SITE_CONFIG = {
      'lumno.kubai.design': {
        ignoreAllSearchParamsPaths: new Set(['/', '/release', '/onboarding'])
      },
      'analytics.google.com': {
        directNavigationUrl: 'https://analytics.google.com/analytics/web/',
        directNavigationTitle: 'Google Analytics | 首页'
      },
      'github.com': {
        repoAreaCategories: new Map([
          ['issues', 'repo-issues'],
          ['pulls', 'repo-pulls'],
          ['discussions', 'repo-discussions'],
          ['actions', 'repo-actions'],
          ['wiki', 'repo-wiki'],
          ['releases', 'repo-releases']
        ])
      },
      'x.com': {
        directNavigationUrl: 'https://x.com/',
        directNavigationTitle: 'X'
      }
    };

    function normalizeHost(hostname) {
      return String(hostname || '').toLowerCase().replace(/^www\./, '');
    }

    // Host identity for favicons, page themes and site-search providers, as the
    // background and New Tab compute it: my.feishu.cn is Feishu's account portal
    // and shares feishu.cn's identity. Search ranking, dedup and saved selection
    // stats keep the plain host, so their stored keys stay what they were.
    const HOST_ALIASES = Object.freeze({
      'my.feishu.cn': 'feishu.cn'
    });

    function normalizeHostIdentity(hostname) {
      const host = normalizeHost(hostname);
      return Object.prototype.hasOwnProperty.call(HOST_ALIASES, host) ? HOST_ALIASES[host] : host;
    }

    // Strips control, format, private-use and lone-surrogate code points so
    // page titles cannot inject invisible or broken characters into the UI.
    function sanitizeDisplayText(text) {
      const raw = String(text || '');
      const withoutSpecial = raw.replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\uFFF9-\uFFFD]|\p{Co}/gu, '');
      return withoutSpecial.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
    }

    function getSearchSuggestionFamilyKey(urlOrHost) {
      let host = normalizeHost(urlOrHost);
      try {
        host = normalizeHost(new URL(String(urlOrHost || '')).hostname);
      } catch (e) {
        // Keep host-like inputs as-is.
      }
      if (!host || host === 'localhost' || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) {
        return host;
      }
      const labels = host.split('.').filter(Boolean);
      if (labels.length <= 2) {
        return host;
      }
      const privateSuffix = Array.from(SEARCH_PRIVATE_DOMAIN_SUFFIXES).find((suffix) => (
        host.endsWith(`.${suffix}`)
      ));
      if (privateSuffix) {
        const suffixLabelCount = privateSuffix.split('.').length;
        return labels.slice(-(suffixLabelCount + 1)).join('.');
      }
      const topLevel = labels[labels.length - 1];
      const secondLevel = labels[labels.length - 2];
      if (
        topLevel.length === 2 &&
        SEARCH_COMMON_SECOND_LEVEL_DOMAIN_LABELS.has(secondLevel) &&
        labels.length >= 3
      ) {
        return labels.slice(-3).join('.');
      }
      return labels.slice(-2).join('.');
    }

    function getSearchSiteConfig(hostname) {
      const host = normalizeHost(hostname);
      return host ? (SEARCH_SITE_CONFIG[host] || null) : null;
    }

    function getSearchDirectNavigationUrl(hostname) {
      const host = normalizeHost(hostname);
      if (!host) {
        return '';
      }
      const siteConfig = getSearchSiteConfig(host);
      return siteConfig && siteConfig.directNavigationUrl
        ? siteConfig.directNavigationUrl
        : `https://${host}/`;
    }

    function getSearchDirectNavigationTitle(hostname, fallbackTitle) {
      const siteConfig = getSearchSiteConfig(hostname);
      const title = siteConfig && siteConfig.directNavigationTitle
        ? siteConfig.directNavigationTitle
        : fallbackTitle;
      return String(title || '').trim();
    }

    function isNumericDirectNavigationHost(hostname) {
      if (!hostname) {
        return false;
      }
      if (!/^(\d{1,3})(\.\d{1,3}){0,3}$/.test(hostname)) {
        return false;
      }
      const parts = hostname.split('.');
      if (parts.length < 1 || parts.length > 4) {
        return false;
      }
      if (parts.length === 1) {
        return parts[0] === '127';
      }
      return parts.every((part) => {
        const value = Number(part);
        return Number.isInteger(value) && value >= 0 && value <= 255;
      });
    }

    function extractDirectNavigationHost(rawInput) {
      const withoutScheme = String(rawInput || '').replace(/^https?:\/\//i, '');
      const authority = withoutScheme.split(/[/?#]/)[0] || '';
      if (!authority) {
        return '';
      }
      if (authority.startsWith('[')) {
        const endBracket = authority.indexOf(']');
        if (endBracket > 1) {
          return authority.slice(1, endBracket).toLowerCase();
        }
        return '';
      }
      if (authority.includes('::') && !authority.includes('.')) {
        return authority.toLowerCase();
      }
      return (authority.split(':')[0] || '').toLowerCase();
    }

    function isDevDirectNavigationHost(hostname) {
      if (!hostname) {
        return false;
      }
      if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        return true;
      }
      if (hostname === 'host.docker.internal') {
        return true;
      }
      if (
        hostname.endsWith('.local') ||
        hostname.endsWith('.test') ||
        hostname.endsWith('.localdev') ||
        hostname.endsWith('.internal')
      ) {
        return true;
      }
      return hostname === '::1' || hostname === '0:0:0:0:0:0:0:1';
    }

    function getDirectNavigationProtocol(input) {
      const value = String(input || '').trim();
      const match = value.match(/^([a-z][a-z0-9+.-]*):/i);
      if (!match) {
        return '';
      }
      const scheme = String(match[1] || '').toLowerCase();
      if (!scheme || scheme.includes('.')) {
        return '';
      }
      return `${scheme}:`;
    }

    function isExplicitDirectNavigationUrl(input) {
      const value = String(input || '').trim();
      if (!value || /\s/.test(value)) {
        return false;
      }
      const protocol = getDirectNavigationProtocol(value);
      if (!protocol || value.length <= protocol.length) {
        return false;
      }
      if (value.slice(protocol.length).startsWith('//')) {
        return true;
      }
      return DIRECT_NAVIGATION_SINGLE_COLON_PROTOCOLS.has(protocol);
    }

    // A CJK input method types "baidu。com" for "baidu.com". Read the full-width
    // stops in the host as dots, but only when that yields a plain ASCII domain,
    // so a sentence ending in "。" still searches.
    function normalizeFullWidthHostDots(input) {
      if (!/[。．｡]/.test(input)) {
        return input;
      }
      const match = input.match(/^([^/?#\s]+)([/?#].*)?$/);
      if (!match) {
        return input;
      }
      const authority = match[1].replace(/[。．｡]/g, '.');
      if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{1,5})?$/i.test(authority)) {
        return input;
      }
      return `${authority}${match[2] || ''}`;
    }

    function getDirectNavigationUrl(input) {
      const trimmed = String(input || '').trim();
      if (!trimmed) {
        return '';
      }
      if (isExplicitDirectNavigationUrl(trimmed)) {
        return trimmed;
      }
      const raw = normalizeFullWidthHostDots(trimmed);
      let normalizedInput = raw.match(/^(\d{1,3})([.\s]\d{1,3}){0,3}(?::\d{1,5})?(?:[/?#].*)?$/)
        ? raw.replace(/\s+/g, '.').replace(/\.{2,}/g, '.')
        : raw;
      const hostOnly = extractDirectNavigationHost(normalizedInput);
      const isDevHost = isDevDirectNavigationHost(hostOnly);
      const isNumericLike = isNumericDirectNavigationHost(hostOnly);
      const protocol = getDirectNavigationProtocol(normalizedInput);
      if (protocol && !isDevHost && !isNumericLike) {
        return '';
      }
      const looksLikeUrl = (normalizedInput.includes('.') && !normalizedInput.includes(' ')) ||
        isDevHost ||
        isNumericLike;
      if (!looksLikeUrl) {
        return '';
      }
      if (hostOnly.includes(':') && !/^https?:\/\//i.test(normalizedInput) && !normalizedInput.startsWith('[')) {
        normalizedInput = `[${normalizedInput}]`;
      }
      if (!normalizedInput.startsWith('http://') && !normalizedInput.startsWith('https://')) {
        return `https://${normalizedInput}`;
      }
      return normalizedInput;
    }

    // Input that names a page or a local resource rather than words to search:
    // any scheme URL (such as the prefilled current page), a host, an IP, or a
    // file path. It can carry intranet hosts, tokens or local paths, so it never
    // goes to a remote suggestion provider.
    function isUrlLikeSearchQuery(input) {
      const value = String(input || '').trim();
      if (!value) {
        return false;
      }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^(?:[a-z]:)?[\\/]/i.test(value)) {
        return true;
      }
      const protocol = getDirectNavigationProtocol(value);
      if (protocol && (DIRECT_NAVIGATION_SINGLE_COLON_PROTOCOLS.has(protocol) ||
          protocol === 'data:' || protocol === 'javascript:' || protocol === 'file:')) {
        return true;
      }
      return Boolean(getDirectNavigationUrl(value));
    }

    return {
      normalizeHost,
      normalizeHostIdentity,
      sanitizeDisplayText,
      getSearchSuggestionFamilyKey,
      getSearchSiteConfig,
      getSearchDirectNavigationUrl,
      getSearchDirectNavigationTitle,
      getDirectNavigationUrl,
      isUrlLikeSearchQuery
    };
  }

  const api = Object.freeze({ createDirectNavigation });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsDirectNavigation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
