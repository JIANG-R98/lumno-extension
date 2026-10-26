// Icons a site offers for a light or dark theme: known themed icons, root
// icon files and those a page's HTML declares, scored by how well they fit.
import { LUMNO_EXTENSION_ICON_PATH, getRuntimeFaviconUrl } from './candidate-urls';
import { isBlockedLocalFaviconUrl } from './host-policy';
import type { FaviconTheme, FaviconUrlOptions, ScoredFaviconUrl, ThemeFaviconUrlOptions } from './types';
import { isChromeMonogramFaviconUrl, isFaviconProxyUrl, normalizeFaviconHost } from './url-kinds';

function normalizeFaviconThemePreference(theme: unknown): FaviconTheme | '' {
  const value = String(theme || '').trim().toLowerCase();
  return value === 'dark' || value === 'light' ? value : '';
}

function hasThemeTokenInUrl(url: unknown, token: unknown): boolean {
  const mode = normalizeFaviconThemePreference(token);
  if (!mode) {
    return false;
  }
  const lower = String(url || '').toLowerCase();
  return new RegExp(`(^|[._/-])${mode}([._/-]|$)`).test(lower);
}

function shouldSkipThemeUpgradeCandidate(candidateUrl: unknown, preferredTheme: unknown, currentUrl: unknown): boolean {
  const mode = normalizeFaviconThemePreference(preferredTheme);
  if (!mode) {
    return false;
  }
  const opposite = mode === 'dark' ? 'light' : 'dark';
  if (hasThemeTokenInUrl(candidateUrl, opposite)) {
    return true;
  }
  const currentHasPreferredToken = hasThemeTokenInUrl(currentUrl, mode);
  const candidateHasPreferredToken = hasThemeTokenInUrl(candidateUrl, mode);
  if (currentHasPreferredToken && !candidateHasPreferredToken) {
    return true;
  }
  return false;
}

function getKnownThemedFaviconCandidateScores(hostname: unknown, preferredTheme: unknown, options?: FaviconUrlOptions | null): ScoredFaviconUrl[] {
  const host = normalizeFaviconHost(hostname);
  const mode = normalizeFaviconThemePreference(preferredTheme);
  if (!host) {
    return [];
  }
  if (host === 'lumno.kubai.design') {
    return [
      {
        url: getRuntimeFaviconUrl(LUMNO_EXTENSION_ICON_PATH, options) || 'https://lumno.kubai.design/favicon.png',
        score: 58
      }
    ];
  }
  if (host === 'github.com' || host.endsWith('.github.com')) {
    if (mode === 'dark') {
      return [
        { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 60 },
        { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 42 },
        { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
      ];
    }
    if (mode === 'light') {
      return [
        { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 60 },
        { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 40 },
        { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
      ];
    }
    return [
      { url: 'https://github.githubassets.com/favicons/favicon.svg', score: 52 },
      { url: 'https://github.githubassets.com/favicons/favicon-dark.svg', score: 52 },
      { url: 'https://github.githubassets.com/favicons/favicon.png', score: 36 }
    ];
  }
  return [];
}

function getKnownThemedFaviconCandidateUrls(hostname: unknown, preferredTheme: unknown, options?: FaviconUrlOptions | null): string[] {
  const mode = normalizeFaviconThemePreference(preferredTheme);
  const scoreMode = mode === 'dark' ? 'dark' : 'light';
  return getKnownThemedFaviconCandidateScores(hostname, scoreMode, options)
    .map((item) => item.url)
    .filter(Boolean);
}

function getRootFaviconCandidateScores(hostname: unknown, preferredTheme: unknown): ScoredFaviconUrl[] {
  const host = normalizeFaviconHost(hostname);
  const mode = normalizeFaviconThemePreference(preferredTheme);
  if (!host) {
    return [];
  }
  const themed = mode === 'dark'
    ? [
      { url: `https://${host}/favicon-dark.svg`, score: 34 },
      { url: `https://${host}/favicon.svg`, score: 28 },
      { url: `https://${host}/favicon-light.svg`, score: 16 }
    ]
    : mode === 'light'
      ? [
        { url: `https://${host}/favicon-light.svg`, score: 32 },
        { url: `https://${host}/favicon.svg`, score: 29 },
        { url: `https://${host}/favicon-dark.svg`, score: 15 }
      ]
      : [
        { url: `https://${host}/favicon.svg`, score: 28 },
        { url: `https://${host}/favicon-dark.svg`, score: 20 },
        { url: `https://${host}/favicon-light.svg`, score: 20 }
      ];
  return [
    ...themed,
    { url: `https://${host}/favicon.ico`, score: 24 },
    { url: `https://${host}/apple-touch-icon.png`, score: 16 }
  ];
}

function getRootFaviconCandidateUrls(hostname: unknown, preferredTheme: unknown): string[] {
  const host = normalizeFaviconHost(hostname);
  const mode = normalizeFaviconThemePreference(preferredTheme);
  if (!host) {
    return [];
  }
  const siteSvgFavicon = `https://${host}/favicon.svg`;
  const siteDarkSvgFavicon = `https://${host}/favicon-dark.svg`;
  const siteLightSvgFavicon = `https://${host}/favicon-light.svg`;
  const sitePngFavicon = `https://${host}/favicon.png`;
  const site32PngFavicon = `https://${host}/favicon-32x32.png`;
  const site16PngFavicon = `https://${host}/favicon-16x16.png`;
  const siteIcoFavicon = `https://${host}/favicon.ico`;
  const siteAppleTouchIcon = `https://${host}/apple-touch-icon.png`;
  const siteAppleTouchIconPrecomposed = `https://${host}/apple-touch-icon-precomposed.png`;
  const siteIconPng = `https://${host}/icon.png`;
  const candidates = mode === 'dark'
    ? [
      siteDarkSvgFavicon,
      siteSvgFavicon,
      sitePngFavicon,
      siteIcoFavicon,
      site32PngFavicon,
      site16PngFavicon,
      siteAppleTouchIcon,
      siteAppleTouchIconPrecomposed,
      siteIconPng,
      siteLightSvgFavicon
    ]
    : [
      siteLightSvgFavicon,
      siteSvgFavicon,
      sitePngFavicon,
      siteIcoFavicon,
      site32PngFavicon,
      site16PngFavicon,
      siteAppleTouchIcon,
      siteAppleTouchIconPrecomposed,
      siteIconPng,
      siteDarkSvgFavicon
    ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return true;
  });
}

function getThemeHintScore(url: unknown, mediaValue: unknown, preferredTheme: unknown): number {
  const normalizedTheme = normalizeFaviconThemePreference(preferredTheme);
  if (!normalizedTheme) {
    return 0;
  }
  let score = 0;
  const lowerMedia = String(mediaValue || '').toLowerCase();
  if (lowerMedia.includes('prefers-color-scheme')) {
    const hasDark = /prefers-color-scheme\s*:\s*dark/.test(lowerMedia);
    const hasLight = /prefers-color-scheme\s*:\s*light/.test(lowerMedia);
    if ((normalizedTheme === 'dark' && hasDark) || (normalizedTheme === 'light' && hasLight)) {
      score += 34;
    }
    if ((normalizedTheme === 'dark' && hasLight) || (normalizedTheme === 'light' && hasDark)) {
      score -= 20;
    }
  }
  const hasDarkToken = hasThemeTokenInUrl(url, 'dark');
  const hasLightToken = hasThemeTokenInUrl(url, 'light');
  if (normalizedTheme === 'dark') {
    if (hasDarkToken) {
      score += 16;
    }
    if (hasLightToken) {
      score -= 8;
    }
  } else if (normalizedTheme === 'light') {
    if (hasLightToken) {
      score += 16;
    }
    if (hasDarkToken) {
      score -= 8;
    }
  }
  return score;
}

function getHtmlAttributeValue(tag: unknown, name: string): string {
  if (!tag || !name) {
    return '';
  }
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag).match(pattern);
  return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
}

function parseHtmlIconCandidateScores(html: unknown, pageUrl: unknown, preferredTheme: unknown): ScoredFaviconUrl[] {
  if (!html || !pageUrl) {
    return [];
  }
  const normalizedTheme = normalizeFaviconThemePreference(preferredTheme);
  const base = String(pageUrl);
  const list: ScoredFaviconUrl[] = [];
  const linkMatches = String(html).match(/<link\b[^>]*>/gi) || [];
  linkMatches.forEach((tag) => {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const hrefRaw = getHtmlAttributeValue(tag, 'href');
    if (!rel.includes('icon') || !hrefRaw) {
      return;
    }
    let href = '';
    try {
      href = new URL(hrefRaw, base).href;
    } catch (e) {
      return;
    }
    const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
    const sizes = getHtmlAttributeValue(tag, 'sizes').toLowerCase();
    const media = getHtmlAttributeValue(tag, 'media').toLowerCase();
    let score = 10;
    if (/\bicon\b/.test(rel)) {
      score += 20;
    }
    if (rel.includes('shortcut')) {
      score += 6;
    }
    if (rel.includes('apple-touch-icon')) {
      score += 8;
    }
    if (type.includes('svg') || href.toLowerCase().endsWith('.svg')) {
      score += 14;
    }
    if (href.toLowerCase().includes('favicon')) {
      score += 6;
    }
    score += getThemeHintScore(href, media, normalizedTheme);
    const sizeNumbers = sizes.match(/\d+/g);
    if (sizeNumbers && sizeNumbers.length > 0) {
      const size = Math.max(...sizeNumbers.map((n) => Number(n) || 0));
      score += Math.min(20, Math.floor(size / 8));
    }
    list.push({ url: href, score: score });
    if (normalizedTheme === 'dark' && /\/favicon\.svg(?:[?#].*)?$/i.test(href)) {
      list.push({
        url: href.replace(/\/favicon\.svg([?#].*)?$/i, '/favicon-dark.svg$1'),
        score: score + 14
      });
    }
    if (normalizedTheme === 'light' && /\/favicon-dark\.svg(?:[?#].*)?$/i.test(href)) {
      list.push({
        url: href.replace(/\/favicon-dark\.svg([?#].*)?$/i, '/favicon.svg$1'),
        score: score + 14
      });
    }
    const baseHrefRaw = getHtmlAttributeValue(tag, 'data-base-href');
    if (baseHrefRaw) {
      let baseHref = '';
      try {
        baseHref = new URL(baseHrefRaw, base).href;
      } catch (e) {
        baseHref = '';
      }
      if (baseHref) {
        if (normalizedTheme === 'dark') {
          list.push({ url: `${baseHref}-dark.svg`, score: score + 20 });
          list.push({ url: `${baseHref}.svg`, score: score + 8 });
        } else if (normalizedTheme === 'light') {
          list.push({ url: `${baseHref}.svg`, score: score + 20 });
          list.push({ url: `${baseHref}-light.svg`, score: score + 12 });
        } else {
          list.push({ url: `${baseHref}.svg`, score: score + 12 });
          list.push({ url: `${baseHref}-dark.svg`, score: score + 12 });
        }
      }
    }
  });
  return list;
}

// Concrete icon URLs first, then service URLs; blocked and repeated ones dropped.
function getThemeFaviconCandidateUrls(urls: unknown, options?: ThemeFaviconUrlOptions | null): string[] {
  const includeProxy = !options || options.includeProxy !== false;
  const includeChrome = Boolean(options && options.includeChrome);
  const concrete: string[] = [];
  const proxy: string[] = [];
  const seen = new Set<string>();
  const items: unknown[] = Array.isArray(urls) ? urls : [];
  items.forEach((item) => {
    const value = String(item || '').trim();
    if (!value || seen.has(value) || isBlockedLocalFaviconUrl(value)) {
      return;
    }
    if (isChromeMonogramFaviconUrl(value)) {
      if (includeChrome) {
        seen.add(value);
        concrete.push(value);
      }
      return;
    }
    seen.add(value);
    if (isFaviconProxyUrl(value)) {
      if (includeProxy) {
        proxy.push(value);
      }
      return;
    }
    concrete.push(value);
  });
  return concrete.concat(proxy);
}

export {
  getHtmlAttributeValue,
  getKnownThemedFaviconCandidateScores,
  getKnownThemedFaviconCandidateUrls,
  getRootFaviconCandidateScores,
  getRootFaviconCandidateUrls,
  getThemeFaviconCandidateUrls,
  getThemeHintScore,
  hasThemeTokenInUrl,
  normalizeFaviconThemePreference,
  parseHtmlIconCandidateScores,
  shouldSkipThemeUpgradeCandidate
};
