// The panel's own theme: light or dark from the setting or the page,
// watching the page for theme changes, the font family, and the CSS
// variables the panel draws with.
import * as LumnoOverlayPageTheme from '../page-theme.js';

function createPanelTheme(deps) {
  const {
    parseCssColor,
    stopOverlayPageThemeObserver,
    applyOverlayTheme,
    SETTINGS,
    OVERLAY_FONT_FAMILY_CSS_VAR,
    FAVICON_THEME
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  const overlayPageTheme = LumnoOverlayPageTheme;

  function getHighlightColors(theme) {
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
  const overlayThemeTokens = {
    light: {
      bg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(255, 255, 255, 0.95) 100%)',
      modeMenuBg: '#FFFFFF',
      border: 'var(--x-lumno-search-shell-border-light, rgba(0, 0, 0, 0.14))',
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 1px 2px rgba(15, 23, 42, 0.06), 0 10px 24px -6px rgba(15, 23, 42, 0.12), 0 36px 84px -12px rgba(15, 23, 42, 0.22), 0 96px 220px -16px rgba(15, 23, 42, 0.3), 0 0 140px 8px rgba(15, 23, 42, 0.08)',
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
      shadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 1px 3px rgba(0, 0, 0, 0.32), 0 12px 26px -6px rgba(0, 0, 0, 0.4), 0 40px 92px -12px rgba(0, 0, 0, 0.55), 0 104px 236px -16px rgba(0, 0, 0, 0.66), 0 0 150px 10px rgba(0, 0, 0, 0.3)',
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
  function resolveOverlayTheme(mode, pageTheme) {
    const systemTheme = overlayState.overlayMediaQuery.matches ? 'dark' : 'light';
    return overlayPageTheme.resolveOverlayTheme({
      mode,
      pageTheme,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme
    });
  }

  function detectPageTheme() {
    return overlayPageTheme.detectPageTheme({
      document,
      window,
      parseThemeColorRgb: parseCssColor
    });
  }

  function shouldObserveOverlayPageTheme() {
    return overlayPageTheme.shouldObservePageTheme({
      mode: overlayState.overlayThemeMode,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme: overlayState.overlayMediaQuery.matches ? 'dark' : 'light'
    });
  }

  function syncOverlayPageThemeObservation() {
    return overlayPageTheme.syncPageThemeObservation({
      mode: overlayState.overlayThemeMode,
      pageThemeAdaptationEnabled: overlayState.overlayPageThemeAdaptationEnabled,
      systemTheme: overlayState.overlayMediaQuery.matches ? 'dark' : 'light',
      start: startOverlayPageThemeObserver,
      stop: stopOverlayPageThemeObserver
    });
  }

  function startOverlayPageThemeObserver() {
    if (!shouldObserveOverlayPageTheme()) {
      return;
    }
    if (!overlayState.overlayPageThemeObserver) {
      overlayState.overlayPageThemeObserver = overlayPageTheme.createPageThemeObserver(window, () => {
        if (!overlayState.overlay || !overlayState.overlay.isConnected || !shouldObserveOverlayPageTheme()) {
          return;
        }
        applyOverlayTheme(overlayState.overlayThemeMode);
      });
    }
    overlayState.overlayPageThemeObserver.start();
  }

  // The chosen families reach every text rule through the shared
  // --lumno-font-sans token, set inline on the panel. Clearing it falls back
  // to the bundled stack the shadow-root stylesheet defines on the panel.
  function applyOverlayFontFamily(target) {
    if (!target || !target.style) {
      return;
    }
    const cssValue = SETTINGS.getOverlayFontFamilyCssValue(overlayState.overlayFontFamily, overlayState.overlayFontFallback);
    if (cssValue) {
      target.style.setProperty(OVERLAY_FONT_FAMILY_CSS_VAR, cssValue);
    } else {
      target.style.removeProperty(OVERLAY_FONT_FAMILY_CSS_VAR);
    }
  }

  function applyOverlayThemeVariables(target, mode) {
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

  function isOverlayDarkMode() {
    return overlayState.overlay && overlayState.overlay.getAttribute('data-theme') === 'dark';
  }

  function getThemeForMode(theme) {
    return FAVICON_THEME.getThemeForMode(theme, {
      defaultTheme: overlayState.defaultTheme,
      isDarkMode: isOverlayDarkMode
    });
  }

  function getHoverColors(theme) {
    return FAVICON_THEME.getHoverColors(theme, {
      defaultTheme: overlayState.defaultTheme,
      isDarkMode: isOverlayDarkMode
    });
  }

  function getNeutralHoverActionColors() {
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
