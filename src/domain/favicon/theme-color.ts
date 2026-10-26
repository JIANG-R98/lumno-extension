// The color a page or its icon stands for: declared theme colors, the
// placeholder globe's colors to ignore, and how confident the color is.
import { getHtmlAttributeValue, normalizeFaviconThemePreference } from './themed-candidates';
import type { ThemeCandidate, ThemeColorCandidate, ThemeColorConfidence, ThemeRgb } from './types';
import { normalizeFaviconHost } from './url-kinds';

function parseCssThemeColor(color: unknown): ThemeRgb | null {
  const value = String(color || '').trim().toLowerCase();
  if (!value || value === 'transparent') {
    return null;
  }
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return [r, g, b].every((channel) => Number.isFinite(channel)) ? [r, g, b] : null;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b].every((channel) => Number.isFinite(channel)) ? [r, g, b] : null;
    }
    return null;
  }
  const rgbMatch = value.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*(?:[0-9.]+|[0-9.]+%))?\s*\)$/);
  if (!rgbMatch) {
    return null;
  }
  const rgb: ThemeRgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return rgb.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)
    ? [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])]
    : null;
}

function isNeutralThemeColor(rgb: unknown): boolean {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return false;
  }
  const channels = rgb.map((channel) => Math.round(Number(channel)));
  if (!channels.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255)) {
    return false;
  }
  const max = Math.max(...channels);
  const min = Math.min(...channels);
  const range = max - min;
  const saturation = max === 0 ? 0 : range / max;
  return range <= 24 ||
    saturation <= 0.12 ||
    (min >= 235 && max >= 245) ||
    (max <= 36 && min <= 24);
}

// Average colours of the generic globe that Chrome and Google's favicon
// service return for sites without artwork (light and dark variants).
const PLACEHOLDER_FAVICON_COLORS = [
  [95, 99, 104],
  [154, 160, 166]
];
const PLACEHOLDER_FAVICON_COLOR_TOLERANCE = 10;

function isPlaceholderFaviconColor(rgb: unknown): boolean {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return false;
  }
  const channels = rgb.map((channel) => Math.round(Number(channel)));
  if (!channels.every((channel) => Number.isFinite(channel))) {
    return false;
  }
  return PLACEHOLDER_FAVICON_COLORS.some((placeholder) => placeholder.every((value, index) =>
    Math.abs(channels[index] - value) <= PLACEHOLDER_FAVICON_COLOR_TOLERANCE
  ));
}

function getThemeColorConfidence(rgb: unknown): ThemeColorConfidence {
  return isNeutralThemeColor(rgb) ? 'neutral' : 'color';
}

function buildThemeColorCandidate(accentRgb: unknown, source: string, baseScore: number, extraScore: number): ThemeColorCandidate | null {
  const rgb = parseCssThemeColor(Array.isArray(accentRgb) ? `rgb(${accentRgb.join(',')})` : accentRgb);
  if (!rgb) {
    return null;
  }
  const confidence = getThemeColorConfidence(rgb);
  const neutralPenalty = confidence === 'neutral' ? 56 : 0;
  return {
    accentRgb: rgb,
    source: source || 'meta',
    neutral: confidence === 'neutral',
    confidence,
    score: Number(baseScore || 0) + Number(extraScore || 0) - neutralPenalty
  };
}

function getThemeMediaScore(media: unknown, preferredTheme: unknown): number {
  const theme = normalizeFaviconThemePreference(preferredTheme);
  const value = String(media || '').toLowerCase();
  if (!value) {
    return 8;
  }
  const wantsDark = value.includes('prefers-color-scheme') && value.includes('dark');
  const wantsLight = value.includes('prefers-color-scheme') && value.includes('light');
  if (theme === 'dark') {
    return wantsDark ? 28 : (wantsLight ? -18 : 4);
  }
  if (theme === 'light') {
    return wantsLight ? 28 : (wantsDark ? -18 : 4);
  }
  return wantsDark || wantsLight ? 12 : 4;
}

function parseHtmlThemeColorCandidates(html: unknown, pageUrl: unknown, preferredTheme: unknown): ThemeCandidate[] {
  const list: ThemeCandidate[] = [];
  const metaMatches = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  metaMatches.forEach((tag) => {
    const name = getHtmlAttributeValue(tag, 'name').toLowerCase();
    if (name !== 'theme-color') {
      return;
    }
    const candidate = buildThemeColorCandidate(
      getHtmlAttributeValue(tag, 'content'),
      'meta',
      80,
      getThemeMediaScore(getHtmlAttributeValue(tag, 'media'), preferredTheme)
    );
    if (candidate) {
      list.push(candidate);
    }
  });
  const manifestMatches = String(html || '').match(/<link\b[^>]*>/gi) || [];
  manifestMatches.forEach((tag) => {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const hrefRaw = getHtmlAttributeValue(tag, 'href');
    if (rel.includes('mask-icon')) {
      const candidate = buildThemeColorCandidate(
        getHtmlAttributeValue(tag, 'color'),
        'mask-icon',
        96,
        0
      );
      if (candidate) {
        list.push(candidate);
      }
    }
    if (!rel.includes('manifest') || !hrefRaw) {
      return;
    }
    try {
      list.push({
        manifestUrl: new URL(hrefRaw, String(pageUrl)).href,
        source: 'manifest',
        score: 42
      });
    } catch (e) {
      // Ignore malformed manifest links.
    }
  });
  return list;
}

// A color to use, or a manifest to read one from.
function hasThemeColorSource(candidate: ThemeCandidate | null | undefined): boolean {
  if (!candidate) {
    return false;
  }
  return 'accentRgb' in candidate ? Boolean(candidate.accentRgb) : Boolean(candidate.manifestUrl);
}

function pickBestThemeColorCandidate(candidates: ReadonlyArray<ThemeCandidate | null | undefined> | null | undefined): ThemeCandidate | null {
  const sorted = (candidates || [])
    .filter((item): item is ThemeCandidate => Boolean(item) && hasThemeColorSource(item))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return sorted[0] || null;
}

function hostHasExplicitDarkFavicon(hostname: unknown): boolean {
  const host = normalizeFaviconHost(hostname);
  if (!host) {
    return false;
  }
  return host === 'github.com' || host.endsWith('.github.com');
}

export {
  PLACEHOLDER_FAVICON_COLORS,
  PLACEHOLDER_FAVICON_COLOR_TOLERANCE,
  buildThemeColorCandidate,
  getThemeColorConfidence,
  getThemeMediaScore,
  hasThemeColorSource,
  hostHasExplicitDarkFavicon,
  isNeutralThemeColor,
  isPlaceholderFaviconColor,
  parseCssThemeColor,
  parseHtmlThemeColorCandidates,
  pickBestThemeColorCandidate
};
