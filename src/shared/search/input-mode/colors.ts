// The colors a search mode draws with: the mode tag beside the input and
// the tiles of the mode menu, from the mode's theme, or the surface's text
// color for the built-in scopes (bookmarks, history and the like).
import type { ModeMenuTileColors } from '../../react/search/mode-menu';
import { getModeLineIconPaths } from './line-icons';
import { getAccessibleThemeFocusRingRgb, getAccessibleThemeTextRgb, mixRgb } from './theme-colors';
import type { ControllerOptions } from './mode-options';
import type { InputModeTheme, Rgb } from './types';

type ModeColorOptions = Pick<ControllerOptions,
  'surface' | 'getThemeForMode' | 'defaultTheme' | 'parseCssColor' | 'defaultAccentColor' | 'isDarkMode' | 'rgbToCss'>;

// The mode tag's colors.
interface ModeTagVisual {
  accentColor: string;
  background: string;
  border: string;
  shadow: string;
  color: string;
  caretColor: string;
}

function getBuiltInSurfaceColor(surface: ModeColorOptions['surface']): string {
  return surface === 'overlay'
    ? 'var(--x-ov-text, #111827)'
    : 'var(--x-nt-text, #111827)';
}

// A built-in scope names one of the line icons.
function isBuiltInScope(menuIconName: string | undefined): boolean {
  return Boolean(getModeLineIconPaths(menuIconName ? String(menuIconName).trim() : ''));
}

function resolveTheme(options: ModeColorOptions, theme: InputModeTheme | null | undefined): InputModeTheme | null | undefined {
  return theme ? options.getThemeForMode(theme) : options.defaultTheme;
}

function resolveAccentRgb(options: ModeColorOptions, resolvedTheme: InputModeTheme | null | undefined): Rgb {
  return (resolvedTheme && (resolvedTheme.accentRgb || options.parseCssColor(resolvedTheme.accent))) ||
    options.defaultAccentColor;
}

function getModeTagVisual(
  options: ModeColorOptions,
  theme: InputModeTheme | null | undefined,
  menuIconName: string | undefined
): ModeTagVisual {
  const isDark = Boolean(options.isDarkMode());
  if (isBuiltInScope(menuIconName)) {
    const surfaceColor = getBuiltInSurfaceColor(options.surface);
    return {
      accentColor: surfaceColor,
      background: `color-mix(in srgb, ${surfaceColor} ${isDark ? 14 : 9}%, transparent)`,
      border: 'none',
      shadow: 'none',
      color: surfaceColor,
      caretColor: surfaceColor
    };
  }
  const resolvedTheme = resolveTheme(options, theme);
  const accentRgb = resolveAccentRgb(options, resolvedTheme);
  const backgroundOpacity = isDark ? 0.14 : 0.075;
  const backgroundRgb = mixRgb(accentRgb, isDark ? [17, 24, 39] : [255, 255, 255], 1 - backgroundOpacity);
  const themeTextColor = options.rgbToCss(getAccessibleThemeTextRgb(accentRgb, backgroundRgb));
  return {
    accentColor: themeTextColor,
    background: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${backgroundOpacity})`,
    border: 'none',
    shadow: 'none',
    color: themeTextColor,
    caretColor: resolvedTheme && resolvedTheme.placeholderText
      ? resolvedTheme.placeholderText
      : options.rgbToCss(accentRgb)
  };
}

// Built-in scopes take the surface's text color; the others their theme's
// accent, kept readable as a focus ring on the selected tile.
function getModeMenuTileColors(
  options: ModeColorOptions,
  theme: InputModeTheme | null | undefined,
  menuIconName: string | undefined
): ModeMenuTileColors {
  const darkMode = Boolean(options.isDarkMode());
  if (isBuiltInScope(menuIconName)) {
    const surfaceColor = getBuiltInSurfaceColor(options.surface);
    return {
      icon: surfaceColor,
      selectedBackground: `color-mix(in srgb, ${surfaceColor} ${darkMode ? 16 : 11}%, transparent)`,
      focusRing: surfaceColor
    };
  }
  const resolvedAccentRgb = resolveAccentRgb(options, resolveTheme(options, theme));
  // Rounded and with every channel present.
  const accentRgb = mixRgb(resolvedAccentRgb, resolvedAccentRgb, 0);
  const selectedBackgroundOpacity = darkMode ? 0.2 : 0.14;
  const selectedBackgroundRgb = mixRgb(accentRgb, darkMode ? [20, 20, 20] : [255, 255, 255], 1 - selectedBackgroundOpacity);
  const focusRing = options.rgbToCss(getAccessibleThemeFocusRingRgb(accentRgb, selectedBackgroundRgb));
  return {
    icon: focusRing,
    selectedBackground: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${selectedBackgroundOpacity})`,
    focusRing
  };
}

export type { ModeColorOptions, ModeTagVisual };
export { getModeMenuTileColors, getModeTagVisual, isBuiltInScope };
