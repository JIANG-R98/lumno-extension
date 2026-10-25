// Mode menu icons: which icon a tile shows (a built-in line icon, a site
// icon or a glyph) and its colors from the mode's theme, with provider
// themes resolved once per opening; and the line icon of the mode tag.
import { getModeLineIconPaths } from './line-icons';
import type { ModeMenuTileColors, ModeMenuTileIcon } from '../../react/search/mode-menu';
import type {
  GetThemeForProvider,
  InputModeTheme,
  ModeMenuItem,
  ResolveProviderIconUrl,
  Rgb
} from './types';
import type { SiteSearchProvider } from '../../../domain/search/types';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuIconsState {
  destroyed: boolean;
}

interface ModeMenuIconsDeps {
  getThemeForMode: (theme: InputModeTheme) => InputModeTheme | null | undefined;
  defaultTheme: InputModeTheme;
  parseCssColor: (color: unknown) => Rgb | null;
  defaultAccentColor: Rgb;
  mixRgb: (source: Rgb, target: Rgb, targetWeight: number) => Rgb;
  isDarkMode: () => unknown;
  getAccessibleThemeFocusRingRgb: (accentRgb: Rgb, backgroundRgb: Rgb) => Rgb;
  rgbToCss: (rgb: Rgb) => string;
  getBuiltInSurfaceColor: () => string;
  createSvgElement: (tagName: string) => Element;
  getThemeForProvider: GetThemeForProvider | null;
  resolveProviderIconUrl: ResolveProviderIconUrl;
  getProviderThemeHost: (provider: SiteSearchProvider) => string | null | undefined;
  // Draws the menu again once a provider theme arrives.
  onProviderThemesChange: () => void;
  inputModeState: ModeMenuIconsState;
}

function getLineIconName(item: ModeMenuItem): string {
  const name = item.menuIconName ? String(item.menuIconName).trim() : '';
  return getModeLineIconPaths(name) ? name : '';
}

function createModeMenuIcons(deps: ModeMenuIconsDeps) {
  const {
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    isDarkMode,
    getAccessibleThemeFocusRingRgb,
    rgbToCss,
    getBuiltInSurfaceColor,
    createSvgElement,
    getThemeForProvider,
    resolveProviderIconUrl,
    getProviderThemeHost,
    onProviderThemesChange
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  // Provider themes by item id, and the ids still being resolved. Cleared
  // when the menu opens, so each opening asks again.
  let providerThemes = new Map<string, InputModeTheme>();
  let pendingThemes = new Set<string>();

  function clearModeMenuProviderThemes(): void {
    providerThemes = new Map();
    pendingThemes = new Set();
  }

  // Asks the surface for the themes of the providers not asked about yet.
  function requestModeMenuProviderThemes(items: readonly ModeMenuItem[]): void {
    if (!getThemeForProvider) {
      return;
    }
    const resolveTheme = getThemeForProvider;
    const themes = providerThemes;
    const pending = pendingThemes;
    items.forEach((item) => {
      const provider = item.provider;
      if (!provider || themes.has(item.id) || pending.has(item.id)) {
        return;
      }
      pending.add(item.id);
      Promise.resolve(resolveTheme(provider)).then((theme: InputModeTheme | null | undefined) => {
        pending.delete(item.id);
        if (inputModeState.destroyed || themes !== providerThemes || !theme) {
          return;
        }
        themes.set(item.id, theme);
        onProviderThemesChange();
      }).catch(() => {
        pending.delete(item.id);
      });
    });
  }

  function getThemedColors(theme: InputModeTheme | null | undefined): ModeMenuTileColors {
    const resolvedTheme = theme ? getThemeForMode(theme) : defaultTheme;
    const resolvedAccentRgb = resolvedTheme && (
      resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent)
    ) || defaultAccentColor;
    // Rounded and with every channel present.
    const accentRgb = mixRgb(resolvedAccentRgb, resolvedAccentRgb, 0);
    const darkMode = Boolean(isDarkMode());
    const panelRgb = darkMode ? [20, 20, 20] : [255, 255, 255];
    const selectedBackgroundOpacity = darkMode ? 0.2 : 0.14;
    const selectedBackgroundRgb = mixRgb(accentRgb, panelRgb, 1 - selectedBackgroundOpacity);
    const focusRing = rgbToCss(getAccessibleThemeFocusRingRgb(accentRgb, selectedBackgroundRgb));
    return {
      icon: focusRing,
      selectedBackground: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${selectedBackgroundOpacity})`,
      focusRing
    };
  }

  // Built-in sources take the surface's text color.
  function getBuiltInColors(): ModeMenuTileColors {
    const surfaceColor = getBuiltInSurfaceColor();
    const darkMode = Boolean(isDarkMode());
    return {
      icon: surfaceColor,
      selectedBackground: `color-mix(in srgb, ${surfaceColor} ${darkMode ? 16 : 11}%, transparent)`,
      focusRing: surfaceColor
    };
  }

  function getModeMenuTileColors(item: ModeMenuItem): ModeMenuTileColors {
    if (getLineIconName(item)) {
      return getBuiltInColors();
    }
    return getThemedColors(providerThemes.get(item.id) || item.theme || defaultTheme);
  }

  function getModeMenuTileIcon(item: ModeMenuItem): ModeMenuTileIcon {
    const provider = item.provider || null;
    return {
      lineIcon: getLineIconName(item),
      glyphClass: item.iconClass || (item.isAi ? 'ri-search-ai-line' : 'ri-search-line'),
      iconUrl: item.iconUrl ? String(resolveProviderIconUrl(item.provider, item.iconUrl) || '').trim() : '',
      iconHost: provider ? String(getProviderThemeHost(provider) || '').trim() : ''
    };
  }

  // Draws a built-in line icon into the svg; false when there is no such icon.
  function renderModeLineIconSvg(svg: Element | null | undefined, lineIconName: string, strokeWidth?: string): boolean {
    const lineIconPaths = getModeLineIconPaths(lineIconName);
    if (!svg || !lineIconPaths) {
      return false;
    }
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    svg.setAttribute('data-icon-name', lineIconName);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('stroke-width', strokeWidth || '1.65');
    svg.setAttribute('viewBox', '0 0 24 24');
    lineIconPaths.forEach((pathData) => {
      const path = createSvgElement('path');
      path.setAttribute('d', pathData);
      svg.appendChild(path);
    });
    return true;
  }

  return {
    clearModeMenuProviderThemes,
    requestModeMenuProviderThemes,
    getModeMenuTileColors,
    getModeMenuTileIcon,
    renderModeLineIconSvg
  };
}

type ModeMenuIconsApi = ReturnType<typeof createModeMenuIcons>;

export { createModeMenuIcons };
export type { ModeMenuIconsApi, ModeMenuIconsDeps, ModeMenuIconsState };
