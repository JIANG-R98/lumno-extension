// The panel's own theme: light or dark from the setting or the page,
// watching the page for theme changes, the font family, and the CSS
// variables the panel draws with.
import type * as Settings from '../../domain/settings';
import type { ThemeMode } from '../../domain/settings';
import type * as FaviconTheme from '../../shared/favicon/favicon-theme';
import type { HoverColors, ThemeLike, ThemeVariant } from '../../shared/favicon/favicon-theme';
import * as LumnoOverlayPageTheme from '../page-theme';
import type { PageTheme } from '../page-theme';

type PageThemeObserver = ReturnType<typeof LumnoOverlayPageTheme.createPageThemeObserver>;

interface PanelThemeState {
  overlay: HTMLElement | null;
  overlayMediaQuery: MediaQueryList;
  overlayThemeMode: ThemeMode;
  overlayPageThemeAdaptationEnabled: boolean;
  overlayPageThemeObserver: PageThemeObserver | null;
  overlayFontFamily: string;
  overlayFontFallback: string;
  defaultTheme: ThemeVariant;
}

interface PanelThemeDeps {
  // Reads a CSS color as an [r, g, b] triple.
  parseCssColor(color: string): number[] | null;
  stopOverlayPageThemeObserver(): void;
  applyOverlayTheme(mode: ThemeMode): void;
  SETTINGS: Pick<typeof Settings, 'getOverlayFontFamilyCssValue'>;
  OVERLAY_FONT_FAMILY_CSS_VAR: string;
  FAVICON_THEME: Pick<typeof FaviconTheme, 'getThemeForMode' | 'getHoverColors'>;
  overlayState: PanelThemeState;
}

// The panel's colors in one theme.
interface OverlayThemeTokens {
  bg: string;
  // A stronger background for a dark panel over a light page.
  lightPageBg?: string;
  modeMenuBg: string;
  border: string;
  shadow: string;
  text: string;
  subtext: string;
  link: string;
  placeholder: string;
  hoverBg: string;
  neutralMarkBg: string;
  neutralMarkText: string;
  tagBg: string;
  tagText: string;
  bookmarkTagBg: string;
  bookmarkTagText: string;
  underline: string;
  dividerOpacity: string;
  dividerInset: string;
  blur: string;
  saturate: string;
}

function createPanelTheme(deps: PanelThemeDeps) {
  const {
    parseCssColor,
    stopOverlayPageThemeObserver,
    applyOverlayTheme,
    SETTINGS,
    OVERLAY_FONT_FAMILY_CSS_VAR,
    FAVICON_THEME
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  const overlayPageTheme = LumnoOverlayPageTheme;

  function getHighlightColors(theme: Partial<ThemeVariant> | null): { bg?: string; border?: string } {
    const resolvedTheme = getThemeForMode(theme);
    if (!resolvedTheme || !resolvedTheme._xIsBrand) {
      return {
        bg: 'var(--x-ov-hover-bg, #F3F4F6)',
        border: 'transparent'
      };
    }
    return {
      bg: resolvedTheme.highlightBg,
      border: resolvedTheme.highlightBorder
    };
  }
  const overlayThemeTokens: Record<PageTheme, OverlayThemeTokens> = {
    light: {
      bg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(255, 255, 255, 0.95) 100%)',
      modeMenuBg: '#FFFFFF',
      border: 'var(--x-lumno-search-shell-border-light, rgba(0, 0, 0, 0.14))',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 2px 5px -2px rgba(15, 23, 42, 0.11), 0 16px 42px -12px rgba(15, 23, 42, 0.17), 0 48px 112px -30px rgba(15, 23, 42, 0.19)',
      text: '#111827',
      subtext: '#6B7280',
      link: '#2563EB',
      placeholder: '#9CA3AF',
      hoverBg: 'rgba(200, 208, 218, 0.45)',
      neutralMarkBg: '#E5E7EB',
      neutralMarkText: '#111827',
      tagBg: '#F3F4F6',
      tagText: '#667085',
      bookmarkTagBg: '#F3F4F6',
      bookmarkTagText: '#667085',
      underline: '#E5E7EB',
      dividerOpacity: '0.5',
      dividerInset: '24px',
      blur: '14px',
      saturate: '175%'
    },
    dark: {
      bg: 'rgba(20, 20, 20, 0.62)',
      lightPageBg: 'rgba(20, 20, 20, 0.82)',
      modeMenuBg: '#141414',
      border: 'var(--x-lumno-search-shell-border-dark, rgba(255, 255, 255, 0.16))',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.28), 0 18px 48px -14px rgba(0, 0, 0, 0.42), 0 52px 124px -34px rgba(0, 0, 0, 0.52)',
      text: '#E5E7EB',
      subtext: '#9CA3AF',
      link: '#D1D5DB',
      placeholder: '#9CA3AF',
      hoverBg: 'rgba(255, 255, 255, 0.08)',
      neutralMarkBg: 'rgba(148, 163, 184, 0.28)',
      neutralMarkText: '#F8FAFC',
      tagBg: 'rgba(255, 255, 255, 0.12)',
      tagText: '#E5E7EB',
      bookmarkTagBg: 'rgba(255, 255, 255, 0.12)',
      bookmarkTagText: '#E5E7EB',
      underline: 'rgba(255, 255, 255, 0.18)',
      dividerOpacity: '0.35',
      dividerInset: '24px',
      blur: '28px',
      saturate: '145%'
    }
  };
  function resolveOverlayTheme(mode: string, pageTheme: string | null): PageTheme {
    const systemTheme = overlayState.overlayMediaQuery.matches ? 'dark' : 'light';
    return overlayPageTheme.resolveOverlayTheme({
      mode,
      pageTheme,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme
    });
  }

  function detectPageTheme(): PageTheme | null {
    return overlayPageTheme.detectPageTheme({
      document,
      window,
      parseThemeColorRgb: parseCssColor
    });
  }

  function shouldObserveOverlayPageTheme(): boolean {
    return overlayPageTheme.shouldObservePageTheme({
      mode: overlayState.overlayThemeMode,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme: overlayState.overlayMediaQuery.matches ? 'dark' : 'light'
    });
  }

  function syncOverlayPageThemeObservation(): boolean {
    return overlayPageTheme.syncPageThemeObservation({
      mode: overlayState.overlayThemeMode,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme: overlayState.overlayMediaQuery.matches ? 'dark' : 'light',
      start: startOverlayPageThemeObserver,
      stop: stopOverlayPageThemeObserver
    });
  }

  function startOverlayPageThemeObserver(): void {
    if (!shouldObserveOverlayPageTheme()) {
      return;
    }
    const observer = overlayState.overlayPageThemeObserver ||
      overlayPageTheme.createPageThemeObserver(window, () => {
        if (!overlayState.overlay || !overlayState.overlay.isConnected || !shouldObserveOverlayPageTheme()) {
          return;
        }
        applyOverlayTheme(overlayState.overlayThemeMode);
      });
    overlayState.overlayPageThemeObserver = observer;
    observer.start();
  }

  // The chosen families reach every text rule through the shared
  // --lumno-font-sans token, set inline on the panel. Clearing it falls back
  // to the bundled stack the shadow-root stylesheet defines on the panel.
  function applyOverlayFontFamily(target: HTMLElement | null): void {
    if (!target) {
      return;
    }
    const cssValue = SETTINGS.getOverlayFontFamilyCssValue(overlayState.overlayFontFamily, overlayState.overlayFontFallback);
    if (cssValue) {
      target.style.setProperty(OVERLAY_FONT_FAMILY_CSS_VAR, cssValue);
    } else {
      target.style.removeProperty(OVERLAY_FONT_FAMILY_CSS_VAR);
    }
  }

  function applyOverlayThemeVariables(target: HTMLElement | null, mode: string): void {
    if (!target) {
      return;
    }
    const pageTheme = detectPageTheme();
    const resolved = resolveOverlayTheme(mode, pageTheme);
    const tokens = overlayThemeTokens[resolved] || overlayThemeTokens.light;
    const shouldStrengthenDarkBackground = overlayPageTheme.shouldStrengthenDarkOverlayBackground({
      resolvedTheme: resolved,
      pageTheme
    });
    target.setAttribute('data-theme', resolved);
    target.style.setProperty(
      '--x-ov-bg',
      shouldStrengthenDarkBackground && tokens.lightPageBg ? tokens.lightPageBg : tokens.bg
    );
    target.style.setProperty('--x-ov-mode-menu-bg', tokens.modeMenuBg);
    target.style.setProperty('--x-ov-border', tokens.border);
    target.style.setProperty('--x-ov-shadow', tokens.shadow);
    target.style.setProperty('--x-ov-text', tokens.text);
    target.style.setProperty('--x-ov-subtext', tokens.subtext);
    target.style.setProperty('--x-ov-link', tokens.link);
    target.style.setProperty('--x-ov-placeholder', tokens.placeholder);
    target.style.setProperty('--x-ov-hover-bg', tokens.hoverBg);
    target.style.setProperty('--x-ov-neutral-mark-bg', tokens.neutralMarkBg);
    target.style.setProperty('--x-ov-neutral-mark-text', tokens.neutralMarkText);
    target.style.setProperty('--x-ov-tag-bg', tokens.tagBg);
    target.style.setProperty('--x-ov-tag-text', tokens.tagText);
    target.style.setProperty('--x-ov-bookmark-tag-bg', tokens.bookmarkTagBg);
    target.style.setProperty('--x-ov-bookmark-tag-text', tokens.bookmarkTagText);
    target.style.setProperty('--x-ov-blur', tokens.blur);
    target.style.setProperty('--x-ov-saturate', tokens.saturate);
    target.style.setProperty('--x-ext-input-text', tokens.text);
    target.style.setProperty('--x-ext-input-caret', tokens.link);
    target.style.setProperty('--x-ext-input-icon', tokens.subtext);
    target.style.setProperty('--x-ext-input-icon-hover-bg', tokens.hoverBg);
    target.style.setProperty('--x-ext-input-icon-hover', tokens.text);
    target.style.setProperty('--x-ext-input-underline', tokens.underline);
    target.style.setProperty('--x-ext-input-divider-inset', tokens.dividerInset);
    target.style.setProperty('--x-ext-input-divider-opacity', tokens.dividerOpacity);
    applyOverlayFontFamily(target);
  }

  function isOverlayDarkMode(): boolean {
    const overlay = overlayState.overlay;
    return Boolean(overlay && overlay.getAttribute('data-theme') === 'dark');
  }

  // The theme as given in light mode, or its dark variant.
  function getThemeForMode<T extends ThemeLike>(theme: T | null): T | ThemeVariant {
    return FAVICON_THEME.getThemeForMode(theme, {
      defaultTheme: overlayState.defaultTheme,
      isDarkMode: isOverlayDarkMode
    });
  }

  function getHoverColors(theme: ThemeLike | null): HoverColors {
    return FAVICON_THEME.getHoverColors(theme, {
      defaultTheme: overlayState.defaultTheme,
      isDarkMode: isOverlayDarkMode
    });
  }

  function getNeutralHoverActionColors(): { bg: string; border: string; text: string } {
    return isOverlayDarkMode()
      ? {
        bg: 'rgba(255, 255, 255, 0.10)',
        border: 'rgba(255, 255, 255, 0.18)',
        text: '#E5E7EB'
      }
      : {
        bg: 'rgba(200, 208, 218, 0.45)',
        border: 'rgba(148, 163, 184, 0.28)',
        text: '#4B5563'
      };
  }

  return {
    getHighlightColors,
    detectPageTheme,
    syncOverlayPageThemeObservation,
    applyOverlayFontFamily,
    applyOverlayThemeVariables,
    isOverlayDarkMode,
    getThemeForMode,
    getHoverColors,
    getNeutralHoverActionColors
  };
}

export { createPanelTheme };
export type { PanelThemeDeps, PanelThemeState };
