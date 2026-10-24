// Accent colors and the light and dark color themes built from them: the
// tint a result row, tag or button takes from its site's icon or brand.
import * as faviconUtils from '../../domain/favicon/favicon-utils';
import type { ThemeRgb } from '../../domain/favicon/favicon-utils';

type ThemeMode = 'light' | 'dark';

// The CSS colors of one theme, and where its accent came from.
interface ThemeVariant {
  accent: string;
  accentRgb: ThemeRgb;
  highlightBg: string;
  highlightBorder: string;
  markBg: string;
  markText: string;
  activeMarkBg: string;
  activeMarkText: string;
  tagBg: string;
  tagText: string;
  tagBorder: string;
  keyBg: string;
  keyText: string;
  keyBorder: string;
  buttonText: string;
  buttonBg: string;
  buttonBorder: string;
  placeholderText: string;
  _xIsDefault?: boolean;
  _xIsBrand?: boolean;
  _xIsUrl?: boolean;
  _xIsFallback?: boolean;
  // 'fallback', 'url', 'brand', or where a site's color came from.
  _xThemeSource?: string;
  _xThemeConfidence?: string;
  _xThemeNeutral?: boolean;
  // The dark variant, built once on first use.
  _xDark?: ThemeVariant;
}

// What getThemeForMode and getHoverColors read of a theme.
type ThemeLike = Partial<Pick<ThemeVariant, 'accent' | 'accentRgb' | '_xIsDefault' | '_xIsBrand' | '_xThemeSource' |
  '_xThemeConfidence' | '_xThemeNeutral' | '_xDark'>>;

interface ThemeModeOptions {
  defaultTheme?: ThemeVariant | null;
  isDarkMode?: boolean | (() => boolean);
}

interface HoverColors {
  bg: string;
  border: string;
  text: string;
}

const defaultAccentColor: ThemeRgb = [59, 130, 246];
const MIN_THEME_FOREGROUND_CONTRAST = 4.5;
const MIN_THEME_STRONG_BOUNDARY_CONTRAST = 3;
const MIN_THEME_SOFT_BOUNDARY_CONTRAST = 1.4;
const MIN_THEME_HIGHLIGHT_CONTRAST = 1.18;
const MIN_THEME_HOVER_CONTRAST = 1.12;
const LIGHT_THEME_SURFACE_MAX_SATURATION = 0.68;
const DARK_THEME_SURFACE_MAX_SATURATION = 0.6;
const brandAccentMap: Readonly<Record<string, ThemeRgb>> = {
  'github.com': [36, 41, 46],
  'docs.github.com': [36, 41, 46],
  'douban.com': [0, 181, 29],
  'zhihu.com': [23, 127, 255],
  'bilibili.com': [0, 174, 236],
  'dribbble.com': [234, 100, 217],
  'youtube.com': [255, 0, 0],
  'youtu.be': [255, 0, 0],
  'google.com': [66, 133, 244],
  'chatgpt.com': [16, 163, 127],
  'gemini.google.com': [66, 133, 244],
  'doubao.com': [79, 70, 229],
  'qianwen.com': [37, 99, 235],
  'yuanbao.tencent.com': [0, 82, 217],
  'chat.minimax.io': [24, 119, 242],
  'chat.deepseek.com': [74, 107, 255],
  'kimi.com': [77, 92, 255],
  'copilot.com': [34, 83, 206],
  'copilot.microsoft.com': [34, 83, 206],
  'grok.com': [17, 24, 39],
  'chat.qwen.ai': [99, 54, 231],
  'aistudio.google.com': [66, 133, 244],
  'bing.com': [0, 120, 215],
  'baidu.com': [41, 98, 255],
  'taobao.com': [255, 80, 0],
  'tmall.com': [226, 35, 26],
  'juejin.cn': [30, 128, 255],
  'reddit.com': [255, 69, 0],
  'wikipedia.org': [64, 64, 64],
  'zh.wikipedia.org': [64, 64, 64],
  'dodopayments.com': [190, 255, 0],
  'x.com': [17, 24, 39],
  'twitter.com': [29, 161, 242]
};

function copyRgb(rgb: readonly number[]): ThemeRgb {
  return [rgb[0], rgb[1], rgb[2]];
}

function isRgb(value: unknown): value is ThemeRgb {
  return Array.isArray(value) && value.length === 3;
}

function mixColor(color: readonly number[], target: readonly number[], amount: number): ThemeRgb {
  return [
    Math.round(color[0] + (target[0] - color[0]) * amount),
    Math.round(color[1] + (target[1] - color[1]) * amount),
    Math.round(color[2] + (target[2] - color[2]) * amount)
  ];
}

function stableHashCode(text: unknown): number {
  const input = String(text || '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function rgbToCss(rgb: readonly number[]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function rgbToCssAlpha(rgb: readonly number[], alpha: number): string {
  const nextAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${nextAlpha})`;
}

function rgbToCssParts(rgb: readonly number[]): string {
  return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
}

function parseCssColor(color: unknown): ThemeRgb | null {
  if (!color || typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [r, g, b];
      }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [r, g, b];
      }
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*(?:[0-9.]+|[0-9.]+%))?\s*\)$/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if ([r, g, b].every((value) => Number.isFinite(value))) {
      return [r, g, b];
    }
  }
  return null;
}

function getLuminance(rgb: readonly number[]): number {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(firstRgb: readonly number[], secondRgb: readonly number[]): number {
  const firstLuminance = getLuminance(firstRgb);
  const secondLuminance = getLuminance(secondRgb);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function getSaturationCappedColor(color: unknown, maximumSaturation: number): ThemeRgb {
  const source: ThemeRgb = isRgb(color) ? color : defaultAccentColor;
  const [red, green, blue] = source.map((channel) => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) {
    return copyRgb(source);
  }
  const saturation = delta / (1 - Math.abs((2 * lightness) - 1));
  const nextSaturation = Math.min(
    saturation,
    Math.max(0, Math.min(1, Number(maximumSaturation) || 0))
  );
  if (nextSaturation === saturation) {
    return copyRgb(source);
  }
  let hueSegment = 0;
  if (max === red) {
    hueSegment = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hueSegment = ((blue - red) / delta) + 2;
  } else {
    hueSegment = ((red - green) / delta) + 4;
  }
  const hue = ((hueSegment * 60) + 360) % 360;
  const chroma = (1 - Math.abs((2 * lightness) - 1)) * nextSaturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  let rgb: ThemeRgb = [0, 0, 0];
  if (hue < 60) {
    rgb = [chroma, secondary, 0];
  } else if (hue < 120) {
    rgb = [secondary, chroma, 0];
  } else if (hue < 180) {
    rgb = [0, chroma, secondary];
  } else if (hue < 240) {
    rgb = [0, secondary, chroma];
  } else if (hue < 300) {
    rgb = [secondary, 0, chroma];
  } else {
    rgb = [chroma, 0, secondary];
  }
  const offset = lightness - (chroma / 2);
  return copyRgb(rgb.map((channel) => Math.round((channel + offset) * 255)));
}

function getAccessibleThemeColor(color: unknown, background: unknown, minimumContrast?: number): ThemeRgb {
  const source: ThemeRgb = isRgb(color) ? color : defaultAccentColor;
  const surface: ThemeRgb = isRgb(background) ? background : [255, 255, 255];
  const requiredContrast = typeof minimumContrast === 'number' && Number.isFinite(minimumContrast)
    ? Math.max(1, minimumContrast)
    : MIN_THEME_FOREGROUND_CONTRAST;
  if (getContrastRatio(source, surface) >= requiredContrast) {
    return copyRgb(source);
  }
  const darkTarget: ThemeRgb = [17, 24, 39];
  const lightTarget: ThemeRgb = [248, 250, 252];
  const target = getContrastRatio(darkTarget, surface) >=
    getContrastRatio(lightTarget, surface)
    ? darkTarget
    : lightTarget;
  let lowerWeight = 0;
  let upperWeight = 1;
  let accessibleColor = copyRgb(target);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const weight = (lowerWeight + upperWeight) / 2;
    const candidate = mixColor(source, target, weight);
    if (getContrastRatio(candidate, surface) >= requiredContrast) {
      accessibleColor = candidate;
      upperWeight = weight;
    } else {
      lowerWeight = weight;
    }
  }
  return accessibleColor;
}

function getTintedSurfaceColor(accent: ThemeRgb, base: ThemeRgb, baseWeight: number, minimumContrast: number): ThemeRgb {
  const preferredColor = mixColor(accent, base, baseWeight);
  if (getContrastRatio(preferredColor, base) >= minimumContrast) {
    return preferredColor;
  }
  const contrastColor = getAccessibleThemeColor(accent, base, minimumContrast);
  let lowerWeight = 0;
  let upperWeight = baseWeight;
  let tintedColor = copyRgb(contrastColor);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const weight = (lowerWeight + upperWeight) / 2;
    const candidate = mixColor(contrastColor, base, weight);
    if (getContrastRatio(candidate, base) >= minimumContrast) {
      tintedColor = candidate;
      lowerWeight = weight;
    } else {
      upperWeight = weight;
    }
  }
  return tintedColor;
}

function getSoftThemeBorderColor(accent: ThemeRgb, background: ThemeRgb): ThemeRgb {
  return getTintedSurfaceColor(
    accent,
    background,
    1,
    MIN_THEME_SOFT_BOUNDARY_CONTRAST
  );
}

function getReadableTextColor(bgRgb: unknown): string {
  if (!isRgb(bgRgb)) {
    return '#111827';
  }
  const darkText: ThemeRgb = [17, 24, 39];
  const lightText: ThemeRgb = [248, 250, 252];
  const contrastWithDark = getContrastRatio(darkText, bgRgb);
  const contrastWithLight = getContrastRatio(lightText, bgRgb);
  return contrastWithDark >= contrastWithLight ? '#111827' : '#F8FAFC';
}

function normalizeAccentColor(rgb: unknown): ThemeRgb {
  if (!isRgb(rgb)) {
    return copyRgb(defaultAccentColor);
  }
  const max = Math.max(...rgb);
  const min = Math.min(...rgb);
  if (min >= 235 && max >= 245) {
    return copyRgb(defaultAccentColor);
  }
  const luminance = getLuminance(rgb);
  if (luminance < 0.12) {
    return mixColor(rgb, [255, 255, 255], 0.55);
  }
  if (luminance > 0.9) {
    return mixColor(rgb, [0, 0, 0], 0.2);
  }
  return rgb;
}

function buildThemeVariant(accent: ThemeRgb, mode: ThemeMode): ThemeVariant {
  const isDark = mode === 'dark';
  const base: ThemeRgb = isDark ? [48, 48, 48] : [255, 255, 255];
  const surfaceAccent = getSaturationCappedColor(
    accent,
    isDark ? DARK_THEME_SURFACE_MAX_SATURATION : LIGHT_THEME_SURFACE_MAX_SATURATION
  );
  const highlightBg = getTintedSurfaceColor(
    surfaceAccent,
    base,
    isDark ? 0.82 : 0.86,
    MIN_THEME_HIGHLIGHT_CONTRAST
  );
  const markBg = mixColor(surfaceAccent, base, isDark ? 0.74 : 0.78);
  const activeMarkBg = getTintedSurfaceColor(
    surfaceAccent,
    highlightBg,
    1,
    MIN_THEME_SOFT_BOUNDARY_CONTRAST
  );
  const tagBg = mixColor(surfaceAccent, base, isDark ? 0.76 : 0.74);
  const keyBg = mixColor(surfaceAccent, base, isDark ? 0.88 : 0.9);
  const buttonBg = mixColor(surfaceAccent, base, isDark ? 0.8 : 0.94);
  const highlightBorder = getAccessibleThemeColor(
    surfaceAccent,
    base,
    MIN_THEME_STRONG_BOUNDARY_CONTRAST
  );
  const tagBorder = getSoftThemeBorderColor(surfaceAccent, tagBg);
  const keyBorder = getSoftThemeBorderColor(surfaceAccent, keyBg);
  const buttonBorder = getSoftThemeBorderColor(surfaceAccent, buttonBg);
  const accentColor = getAccessibleThemeColor(
    accent,
    highlightBg,
    MIN_THEME_FOREGROUND_CONTRAST
  );
  const buttonText = getAccessibleThemeColor(
    accent,
    buttonBg,
    MIN_THEME_FOREGROUND_CONTRAST
  );
  const placeholderText = getAccessibleThemeColor(
    accent,
    base,
    MIN_THEME_FOREGROUND_CONTRAST
  );
  return {
    accent: rgbToCss(accentColor),
    accentRgb: accent,
    highlightBg: rgbToCss(highlightBg),
    highlightBorder: rgbToCss(highlightBorder),
    markBg: rgbToCss(markBg),
    markText: getReadableTextColor(markBg),
    activeMarkBg: rgbToCss(activeMarkBg),
    activeMarkText: getReadableTextColor(activeMarkBg),
    tagBg: rgbToCss(tagBg),
    tagText: getReadableTextColor(tagBg),
    tagBorder: rgbToCss(tagBorder),
    keyBg: rgbToCss(keyBg),
    keyText: getReadableTextColor(keyBg),
    keyBorder: rgbToCss(keyBorder),
    buttonText: rgbToCss(buttonText),
    buttonBg: rgbToCss(buttonBg),
    buttonBorder: rgbToCss(buttonBorder),
    placeholderText: rgbToCss(placeholderText)
  };
}

function buildTheme(rgb: unknown): ThemeVariant {
  const accent = normalizeAccentColor(rgb);
  return buildThemeVariant(accent, 'light');
}

function createDefaultTheme(): ThemeVariant {
  const theme = buildTheme(defaultAccentColor);
  theme._xIsDefault = true;
  theme._xIsBrand = false;
  theme._xThemeSource = 'fallback';
  return theme;
}

function createUrlHighlightTheme(): ThemeVariant {
  const theme = buildTheme(defaultAccentColor);
  theme._xIsBrand = true;
  theme._xIsUrl = true;
  theme._xThemeSource = 'url';
  return theme;
}

function normalizeHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  const lower = String(hostname).toLowerCase();
  const stripped = lower.replace(/^www\./i, '');
  if (stripped === 'my.feishu.cn') {
    return 'feishu.cn';
  }
  return stripped;
}

function normalizeFaviconHost(hostname: unknown): string {
  return faviconUtils.normalizeFaviconHost(hostname);
}

function getBrandAccentForHost(hostname: unknown): ThemeRgb | null {
  const host = String(hostname || '').toLowerCase();
  if (!host) {
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(brandAccentMap, host)) {
    return brandAccentMap[host];
  }
  const entry = Object.keys(brandAccentMap).find((key) => host === key || host.endsWith(`.${key}`));
  return entry ? brandAccentMap[entry] : null;
}

function getBrandAccentForUrl(url: unknown): ThemeRgb | null {
  if (!url) {
    return null;
  }
  try {
    const hostname = normalizeHost(new URL(String(url)).hostname);
    return getBrandAccentForHost(hostname);
  } catch (_error) {
    return null;
  }
}

function buildFallbackThemeForHost(_hostname?: unknown): ThemeVariant {
  const theme = createDefaultTheme();
  theme._xIsFallback = true;
  return theme;
}

function getThemeFingerprint(theme: ThemeLike | null | undefined): string {
  const source = theme && theme._xThemeSource
    ? String(theme._xThemeSource)
    : (theme && theme._xIsDefault ? 'fallback' : (theme && theme._xIsBrand ? 'brand' : 'unknown'));
  const confidence = theme && theme._xThemeConfidence ? String(theme._xThemeConfidence) : '';
  const neutral = theme && theme._xThemeNeutral ? 'neutral' : 'color';
  const rgb = theme ? (theme.accentRgb || parseCssColor(theme.accent)) : null;
  const accent = isRgb(rgb) ? rgb : defaultAccentColor;
  return `${source}:${confidence || neutral}:${accent.join(',')}`;
}

function hasThemeTokenInUrl(url: unknown, token: string): boolean {
  return faviconUtils.hasThemeTokenInUrl(url, token);
}

function shouldSkipThemeUpgradeCandidate(candidateUrl: unknown, preferredTheme: unknown, currentUrl: unknown): boolean {
  return faviconUtils.shouldSkipThemeUpgradeCandidate(candidateUrl, preferredTheme, currentUrl);
}

function getKnownThemedFaviconCandidates(hostname: unknown, preferredTheme: unknown): ReturnType<typeof faviconUtils.getKnownThemedFaviconCandidateUrls> {
  return faviconUtils.getKnownThemedFaviconCandidateUrls(hostname, preferredTheme, {
    getRuntimeUrl: (path) => {
      const chromeApi = typeof chrome !== 'undefined' ? chrome : null;
      return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function'
        ? chromeApi.runtime.getURL(path)
        : '';
    }
  });
}

function hostHasExplicitDarkFavicon(hostname: unknown): boolean {
  return faviconUtils.hostHasExplicitDarkFavicon(hostname);
}

function isFaviconProxyUrl(url: unknown): boolean {
  return faviconUtils.isFaviconProxyUrl(url);
}

function extractAverageColor(image: CanvasImageSource): ThemeRgb | null {
  const size = 16;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.createElement !== 'function') {
    return null;
  }
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  try {
    context.drawImage(image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 32) {
        continue;
      }
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const brightness = (red + green + blue) / 3;
      if (brightness > 245) {
        continue;
      }
      r += red;
      g += green;
      b += blue;
      count += 1;
    }
    if (!count) {
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 32) {
          continue;
        }
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count += 1;
      }
    }
    if (!count) {
      return null;
    }
    return [
      Math.round(r / count),
      Math.round(g / count),
      Math.round(b / count)
    ];
  } catch (_error) {
    return null;
  }
}

function resolveDarkModeOption(options: ThemeModeOptions | null | undefined): boolean {
  if (options && typeof options.isDarkMode === 'function') {
    return Boolean(options.isDarkMode());
  }
  return Boolean(options && options.isDarkMode);
}

function getThemeForMode(theme: ThemeLike | null | undefined, options?: ThemeModeOptions | null): ThemeLike {
  const fallbackTheme = options && options.defaultTheme ? options.defaultTheme : createDefaultTheme();
  const sourceTheme: ThemeLike = theme || fallbackTheme;
  if (!resolveDarkModeOption(options)) {
    return sourceTheme;
  }
  if (sourceTheme._xDark) {
    return sourceTheme._xDark;
  }
  const accentRgb = sourceTheme.accentRgb || parseCssColor(sourceTheme.accent) || defaultAccentColor;
  const darkTheme = buildThemeVariant(accentRgb, 'dark');
  darkTheme._xIsDefault = Boolean(sourceTheme._xIsDefault);
  darkTheme._xIsBrand = Boolean(sourceTheme._xIsBrand);
  sourceTheme._xDark = darkTheme;
  return darkTheme;
}

function getHoverColors(theme: ThemeLike | null | undefined, options?: ThemeModeOptions | null): HoverColors {
  const resolvedTheme = getThemeForMode(theme, options);
  const accentRgb = resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent) || defaultAccentColor;
  const isDark = resolveDarkModeOption(options);
  const base: ThemeRgb = isDark ? [48, 48, 48] : [255, 255, 255];
  const surfaceAccent = getSaturationCappedColor(
    accentRgb,
    isDark ? DARK_THEME_SURFACE_MAX_SATURATION : LIGHT_THEME_SURFACE_MAX_SATURATION
  );
  const hoverBg = getTintedSurfaceColor(
    surfaceAccent,
    base,
    isDark ? 0.6 : 0.9,
    MIN_THEME_HOVER_CONTRAST
  );
  return {
    bg: rgbToCss(hoverBg),
    border: rgbToCss(getSoftThemeBorderColor(surfaceAccent, hoverBg)),
    text: rgbToCss(getAccessibleThemeColor(
      accentRgb,
      hoverBg,
      MIN_THEME_FOREGROUND_CONTRAST
    ))
  };
}

export type { HoverColors, ThemeLike, ThemeModeOptions, ThemeVariant };
export {
  defaultAccentColor,
  mixColor,
  stableHashCode,
  rgbToCss,
  rgbToCssAlpha,
  rgbToCssParts,
  parseCssColor,
  getLuminance,
  getContrastRatio,
  getSaturationCappedColor,
  getAccessibleThemeColor,
  getTintedSurfaceColor,
  getSoftThemeBorderColor,
  getReadableTextColor,
  normalizeAccentColor,
  buildThemeVariant,
  buildTheme,
  createDefaultTheme,
  createUrlHighlightTheme,
  normalizeHost,
  normalizeFaviconHost,
  getBrandAccentForHost,
  getBrandAccentForUrl,
  buildFallbackThemeForHost,
  getThemeFingerprint,
  hasThemeTokenInUrl,
  shouldSkipThemeUpgradeCandidate,
  getKnownThemedFaviconCandidates,
  hostHasExplicitDarkFavicon,
  isFaviconProxyUrl,
  extractAverageColor,
  getThemeForMode,
  getHoverColors
};
