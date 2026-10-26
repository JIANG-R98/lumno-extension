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

type ThemePreference = ReturnType<typeof normalizeFaviconThemePreference>;

// A media query that names the preferred scheme raises the icon; one that
// names the other scheme lowers it.
function getMediaThemeScore(mediaValue: unknown, theme: ThemePreference): number {
  const lowerMedia = String(mediaValue || '').toLowerCase();
  if (!lowerMedia.includes('prefers-color-scheme')) {
    return 0;
  }
  const hasDark = /prefers-color-scheme\s*:\s*dark/.test(lowerMedia);
  const hasLight = /prefers-color-scheme\s*:\s*light/.test(lowerMedia);
  const matches = theme === 'dark' ? hasDark : hasLight;
  const opposes = theme === 'dark' ? hasLight : hasDark;
  return (matches ? 34 : 0) - (opposes ? 20 : 0);
}

// The same for "dark" and "light" in the icon's URL.
function getUrlThemeScore(url: unknown, theme: ThemePreference): number {
  const matches = hasThemeTokenInUrl(url, theme === 'dark' ? 'dark' : 'light');
  const opposes = hasThemeTokenInUrl(url, theme === 'dark' ? 'light' : 'dark');
  return (matches ? 16 : 0) - (opposes ? 8 : 0);
}

function getThemeHintScore(url: unknown, mediaValue: unknown, preferredTheme: unknown): number {
  const normalizedTheme = normalizeFaviconThemePreference(preferredTheme);
  if (normalizedTheme !== 'dark' && normalizedTheme !== 'light') {
    return 0;
  }
  return getMediaThemeScore(mediaValue, normalizedTheme) + getUrlThemeScore(url, normalizedTheme);
}

function getHtmlAttributeValue(tag: unknown, name: string): string {
  if (!tag || !name) {
    return '';
  }
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag).match(pattern);
  return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
}

// How well a <link rel="icon"> fits: icon rels, SVG, a favicon name, the
// theme it is for and its declared size.
function scoreIconLink(tag: string, rel: string, href: string, theme: ThemePreference): number {
  const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
  const sizes = getHtmlAttributeValue(tag, 'sizes').toLowerCase();
  const media = getHtmlAttributeValue(tag, 'media').toLowerCase();
  const lowerHref = href.toLowerCase();
  let score = 10;
  score += /\bicon\b/.test(rel) ? 20 : 0;
  score += rel.includes('shortcut') ? 6 : 0;
  score += rel.includes('apple-touch-icon') ? 8 : 0;
  score += type.includes('svg') || lowerHref.endsWith('.svg') ? 14 : 0;
  score += lowerHref.includes('favicon') ? 6 : 0;
  score += getThemeHintScore(href, media, theme);
  const sizeNumbers = sizes.match(/\d+/g);
  if (sizeNumbers && sizeNumbers.length > 0) {
    const size = Math.max(...sizeNumbers.map((n) => Number(n) || 0));
    score += Math.min(20, Math.floor(size / 8));
  }
  return score;
}

// The other scheme's sibling of a favicon.svg / favicon-dark.svg pair.
function themedSvgVariants(href: string, score: number, theme: ThemePreference): ScoredFaviconUrl[] {
  if (theme === 'dark' && /\/favicon\.svg(?:[?#].*)?$/i.test(href)) {
    return [{ url: href.replace(/\/favicon\.svg([?#].*)?$/i, '/favicon-dark.svg$1'), score: score + 14 }];
  }
  if (theme === 'light' && /\/favicon-dark\.svg(?:[?#].*)?$/i.test(href)) {
    return [{ url: href.replace(/\/favicon-dark\.svg([?#].*)?$/i, '/favicon.svg$1'), score: score + 14 }];
  }
  return [];
}

// Icons named from a data-base-href, one per scheme.
function baseHrefVariants(tag: string, base: string, score: number, theme: ThemePreference): ScoredFaviconUrl[] {
  const baseHrefRaw = getHtmlAttributeValue(tag, 'data-base-href');
  if (!baseHrefRaw) {
    return [];
  }
  let baseHref = '';
  try {
    baseHref = new URL(baseHrefRaw, base).href;
  } catch (e) {
    return [];
  }
  if (!baseHref) {
    return [];
  }
  if (theme === 'dark') {
    return [{ url: `${baseHref}-dark.svg`, score: score + 20 }, { url: `${baseHref}.svg`, score: score + 8 }];
  }
  if (theme === 'light') {
    return [{ url: `${baseHref}.svg`, score: score + 20 }, { url: `${baseHref}-light.svg`, score: score + 12 }];
  }
  return [{ url: `${baseHref}.svg`, score: score + 12 }, { url: `${baseHref}-dark.svg`, score: score + 12 }];
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
    const score = scoreIconLink(tag, rel, href, normalizedTheme);
    list.push({ url: href, score: score });
    list.push(...themedSvgVariants(href, score, normalizedTheme));
    list.push(...baseHrefVariants(tag, base, score, normalizedTheme));
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
