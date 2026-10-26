// Accent colors and the light and dark color themes built from them: the
// tint a result row, tag or button takes from its site's icon or brand.
import { copyRgb, getContrastRatio, getLuminance, getReadableTextColor, isRgb, mixColor, parseCssColor, rgbToCss } from '../../domain/color';
import type { ThemeRgb } from '../../domain/favicon/types';

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
  // Taken from a shortcut's own uploaded icon (New Tab).
  _xIsCustomShortcutIcon?: boolean;
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

function resolveDarkModeOption(options: ThemeModeOptions | null | undefined): boolean {
  if (options && typeof options.isDarkMode === 'function') {
    return Boolean(options.isDarkMode());
  }
  return Boolean(options && options.isDarkMode);
}

// The theme as given in light mode, or its dark variant, built once.
function getThemeForMode<T extends ThemeLike>(theme: T | null | undefined, options?: ThemeModeOptions | null): T | ThemeVariant {
  const fallbackTheme = options && options.defaultTheme ? options.defaultTheme : createDefaultTheme();
  const sourceTheme: T | ThemeVariant = theme || fallbackTheme;
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
  getSaturationCappedColor,
  getAccessibleThemeColor,
  getTintedSurfaceColor,
  getSoftThemeBorderColor,
  normalizeAccentColor,
  buildThemeVariant,
  buildTheme,
  createDefaultTheme,
  createUrlHighlightTheme,
  buildFallbackThemeForHost,
  getThemeFingerprint,
  getThemeForMode,
  getHoverColors
};
