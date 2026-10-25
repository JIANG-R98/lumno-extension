// Mode menu icons: provider icons with their theme, built-in line icons
// and glyphs.
import type { CursorTooltipController } from '../../ui/cursor-tooltip';
import type {
  AttachFaviconData,
  AttachProviderIcon,
  GetThemeForProvider,
  InputModeTheme,
  ModeMenuItem,
  ResolveProviderIconUrl,
  Rgb,
  SetStyle
} from './types';
import type { SiteSearchProvider } from '../../../domain/search/types';

// The controller state search-input-mode.ts shares with its modules.
interface ModeMenuIconsState {
  destroyed: boolean;
  modeMenuContent: HTMLElement;
}

interface ModeMenuIconsDeps {
  modeMenuCursorTooltipController: Pick<CursorTooltipController, 'hide'> | null;
  getThemeForMode: (theme: InputModeTheme) => InputModeTheme | null | undefined;
  defaultTheme: InputModeTheme;
  parseCssColor: (color: unknown) => Rgb | null;
  defaultAccentColor: Rgb;
  mixRgb: (source: Rgb, target: Rgb, targetWeight: number) => Rgb;
  isDarkMode: () => unknown;
  getAccessibleThemeFocusRingRgb: (accentRgb: Rgb, backgroundRgb: Rgb) => Rgb;
  setStyle: SetStyle;
  rgbToCss: (rgb: Rgb) => string;
  getBuiltInSurfaceColor: () => string;
  getModeMenuLineIconPaths: (iconName: string) => readonly string[] | null;
  createSvgElement: (tagName: string) => Element;
  doc: Document;
  getThemeForProvider: GetThemeForProvider | null;
  resolveProviderIconUrl: ResolveProviderIconUrl;
  removeProviderIconRuntimeFallbacks: (wrap: HTMLElement) => void;
  getProviderThemeHost: (provider: SiteSearchProvider) => string | null | undefined;
  attachProviderIcon: AttachProviderIcon | null;
  preferDirectProviderIcons: boolean;
  attachFaviconData: AttachFaviconData | null;
  inputModeState: ModeMenuIconsState;
}

function createModeMenuIcons(deps: ModeMenuIconsDeps) {
  const {
    modeMenuCursorTooltipController,
    getThemeForMode,
    defaultTheme,
    parseCssColor,
    defaultAccentColor,
    mixRgb,
    isDarkMode,
    getAccessibleThemeFocusRingRgb,
    setStyle,
    rgbToCss,
    getBuiltInSurfaceColor,
    getModeMenuLineIconPaths,
    createSvgElement,
    doc,
    getThemeForProvider,
    resolveProviderIconUrl,
    removeProviderIconRuntimeFallbacks,
    getProviderThemeHost,
    attachProviderIcon,
    preferDirectProviderIcons,
    attachFaviconData
  } = deps;

  // The controller state object shared with search-input-mode.ts and the other modules.
  const inputModeState = deps.inputModeState;

  function clearModeMenuContents(): void {
    if (modeMenuCursorTooltipController) {
      modeMenuCursorTooltipController.hide();
    }
    while (inputModeState.modeMenuContent.firstChild) {
      inputModeState.modeMenuContent.removeChild(inputModeState.modeMenuContent.firstChild);
    }
  }

  function applyModeMenuIconTheme(
    wrap: HTMLElement,
    menuItem: HTMLElement | null | undefined,
    theme: InputModeTheme | null | undefined
  ): void {
    const resolvedTheme = theme ? getThemeForMode(theme) : defaultTheme;
    const resolvedAccentRgb = resolvedTheme && (
      resolvedTheme.accentRgb || parseCssColor(resolvedTheme.accent)
    ) || defaultAccentColor;
    const accentRgb = mixRgb(resolvedAccentRgb, resolvedAccentRgb, 0);
    const darkMode = Boolean(isDarkMode());
    const panelRgb = darkMode ? [20, 20, 20] : [255, 255, 255];
    const selectedBackgroundOpacity = darkMode ? 0.2 : 0.14;
    const selectedBackgroundRgb = mixRgb(
      accentRgb,
      panelRgb,
      1 - selectedBackgroundOpacity
    );
    const focusRingRgb = getAccessibleThemeFocusRingRgb(
      accentRgb,
      selectedBackgroundRgb
    );
    setStyle(
      wrap,
      '--x-lumno-search-mode-icon-color',
      rgbToCss(focusRingRgb)
    );
    if (menuItem) {
      setStyle(
        menuItem,
        '--x-lumno-search-mode-selected-bg',
        `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, ${selectedBackgroundOpacity})`
      );
      setStyle(
        menuItem,
        '--x-lumno-search-mode-item-focus-ring',
        rgbToCss(focusRingRgb)
      );
    }
  }

  function applyModeMenuBuiltInIconTheme(wrap: HTMLElement, menuItem: HTMLElement | null | undefined): void {
    const surfaceColor = getBuiltInSurfaceColor();
    const darkMode = Boolean(isDarkMode());
    const selectedBackground = `color-mix(in srgb, ${surfaceColor} ${darkMode ? 16 : 11}%, transparent)`;
    setStyle(
      wrap,
      '--x-lumno-search-mode-icon-color',
      surfaceColor
    );
    if (menuItem) {
      setStyle(
        menuItem,
        '--x-lumno-search-mode-selected-bg',
        selectedBackground
      );
      setStyle(
        menuItem,
        '--x-lumno-search-mode-item-focus-ring',
        surfaceColor
      );
    }
  }

  // Draws a built-in line icon into the svg; false when there is no such icon.
  function renderModeLineIconSvg(svg: Element | null | undefined, lineIconName: string, strokeWidth?: string): boolean {
    const lineIconPaths = getModeMenuLineIconPaths(lineIconName);
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

  function createModeMenuGlyph(item: ModeMenuItem): Element {
    const lineIconName = item.menuIconName ? String(item.menuIconName).trim() : '';
    const svg = createSvgElement('svg');
    if (renderModeLineIconSvg(svg, lineIconName, '1.65')) {
      svg.classList.add('x-lumno-search-input-mode__menu-line-icon');
      return svg;
    }
    const glyph = doc.createElement('i');
    glyph.className = `ri-icon ri-size-24 ${item.iconClass || (item.isAi ? 'ri-search-ai-line' : 'ri-search-line')}`;
    return glyph;
  }

  function setModeMenuGlyphHidden(glyph: Element, hidden: boolean): void {
    if (hidden) {
      glyph.setAttribute('hidden', '');
      return;
    }
    glyph.removeAttribute('hidden');
  }

  function createModeMenuIcon(item: ModeMenuItem, menuItem: HTMLElement | null | undefined): HTMLSpanElement {
    const lineIconName = item.menuIconName ? String(item.menuIconName).trim() : '';
    const isBuiltInLineIcon = Boolean(getModeMenuLineIconPaths(lineIconName));
    const wrap = doc.createElement('span');
    wrap.className = 'x-lumno-search-input-mode__menu-icon';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('data-icon-state', 'fallback');
    if (isBuiltInLineIcon) {
      wrap.setAttribute('data-icon-kind', 'builtin');
    }
    const faviconMask = doc.createElement('span');
    faviconMask.className = 'x-lumno-search-input-mode__menu-favicon-mask';
    const glyph = createModeMenuGlyph(item);
    faviconMask.appendChild(glyph);
    wrap.appendChild(faviconMask);
    if (isBuiltInLineIcon) {
      applyModeMenuBuiltInIconTheme(wrap, menuItem);
    } else {
      applyModeMenuIconTheme(wrap, menuItem, item.theme || defaultTheme);
    }
    if (item.provider && getThemeForProvider) {
      Promise.resolve(getThemeForProvider(item.provider)).then((theme: InputModeTheme | null | undefined) => {
        if (!inputModeState.destroyed && wrap.isConnected && theme) {
          applyModeMenuIconTheme(wrap, menuItem, theme);
        }
      }).catch(() => {});
    }
    const iconUrl = item.iconUrl ? String(resolveProviderIconUrl(item.provider, item.iconUrl) || '').trim() : '';
    if (iconUrl) {
      const image = doc.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      const showFallback = (): void => {
        wrap.setAttribute('data-icon-state', 'fallback');
        removeProviderIconRuntimeFallbacks(wrap);
        image.remove();
        setModeMenuGlyphHidden(glyph, false);
      };
      image.addEventListener('load', () => {
        wrap.setAttribute('data-icon-state', 'resolved');
        removeProviderIconRuntimeFallbacks(wrap);
        setModeMenuGlyphHidden(glyph, true);
      }, { once: true });
      faviconMask.appendChild(image);
      const provider = item.provider || null;
      const iconHost = provider ? String(getProviderThemeHost(provider) || '').trim() : '';
      let handledByProviderIconRuntime = false;
      if (attachProviderIcon && provider && !preferDirectProviderIcons) {
        try {
          handledByProviderIconRuntime = attachProviderIcon(image, {
            iconHost,
            iconUrl,
            onIconUnavailable: showFallback,
            prefixText: String(item.label || ''),
            provider
          }) === true;
        } catch (_error) {
          handledByProviderIconRuntime = false;
        }
      }
      if (!handledByProviderIconRuntime) {
        image.addEventListener('error', showFallback, { once: true });
        image.src = iconUrl;
        if (attachFaviconData && !iconUrl.startsWith('data:')) {
          attachFaviconData(image, iconUrl, iconHost);
        }
      }
    }
    return wrap;
  }

  return {
    clearModeMenuContents,
    renderModeLineIconSvg,
    createModeMenuIcon
  };
}

type ModeMenuIconsApi = ReturnType<typeof createModeMenuIcons>;

export { createModeMenuIcons };
export type { ModeMenuIconsApi, ModeMenuIconsDeps, ModeMenuIconsState };
