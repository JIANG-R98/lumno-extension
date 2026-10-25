// The glass material: which surfaces the liquid style bends the wallpaper
// under, the stored glass style and theme, and the ink hint remembered for
// the next load.
import type * as Settings from '../../domain/settings';
import type { NewtabGlassTheme } from '../../domain/settings';
import type { StorageAreaLike } from '../../domain/storage-port';
import type { createLiquidSurfaces } from '../react/liquid-glass';
import * as LumnoNewtabWallpaperAdaptiveTone from '../wallpaper/wallpaper-adaptive-tone';
import type { ToneScheduleOptions } from '../wallpaper/wallpaper-adaptive-tone';

interface GlassSurfacesState {
  newtabGlassTheme: NewtabGlassTheme;
  // The theme a light or dark material holds the page in; '' to follow.
  glassThemeOverride: Exclude<NewtabGlassTheme, 'follow'> | '';
  initialThemeApplied: boolean;
}

interface GlassSurfacesDeps {
  // { resetInk: true } when a setting changed what the glass ink should be.
  scheduleWallpaperAdaptiveToneUpdate(options?: ToneScheduleOptions): void;
  SETTINGS: Pick<typeof Settings, 'normalizeNewtabGlassStyle' | 'normalizeNewtabGlassTheme' | 'getNewtabGlassThemeOverride'>;
  syncBookmarkTopbarSurfaceAppearance(options: { updateMenu: boolean }): void;
  updateWallpaperAppearanceSelectionUi(): void;
  applyScopedThemeMode(): void;
  storageArea: StorageAreaLike | null;
  NEWTAB_GLASS_STYLE_STORAGE_KEY: string;
  NEWTAB_GLASS_THEME_STORAGE_KEY: string;
  pageState: GlassSurfacesState;
}

function createGlassSurfaces(deps: GlassSurfacesDeps) {
  const {
    scheduleWallpaperAdaptiveToneUpdate,
    SETTINGS,
    syncBookmarkTopbarSurfaceAppearance,
    updateWallpaperAppearanceSelectionUi,
    applyScopedThemeMode,
    storageArea,
    NEWTAB_GLASS_STYLE_STORAGE_KEY,
    NEWTAB_GLASS_THEME_STORAGE_KEY
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  // Surfaces whose rim bends the wallpaper under the liquid style; the search bar, the results
  // plate it grows into and the site search panel that opens under it, and the dock's cards.
  // Chrome 155 sometimes draws a lens on a layer of its own (will-change: transform) as its
  // displacement map instead of the bent backdrop when another layer appears, such as a tooltip:
  // menus and the Appearance panel, which need their layers, go without the bend, and the cards drop
  // their will-change under liquid glass (glass-style.css). Only the search bar, its results and the
  // site search panel fringe into colors along the rim: a card's wide rim turns even a slight split,
  // softened by the blur ahead of the lens, into an orange and blue haze in its corners. A surface
  // can set its rim in --x-nt-glass-rim and scale its bend in --x-nt-glass-refraction-strength (the
  // search bar, its results plate and the site search panel share both, in glass-style.css).
  const NEWTAB_LIQUID_SEARCH_SELECTOR = [
    '#_x_extension_newtab_root_2024_unique_',
    '#_x_extension_newtab_suggestions_surface_2026_unique_',
    '.x-lumno-search-input-mode__menu[data-surface="newtab"]'
  ].join(',');
  const NEWTAB_LIQUID_SURFACE_SELECTOR = [
    NEWTAB_LIQUID_SEARCH_SELECTOR,
    '.x-nt-recent-card-visual',
    '.x-nt-bookmark-card:not(.x-nt-bookmarks-topbar .x-nt-bookmark-card):not(.x-nt-bookmark-card-drag-preview)'
  ].join(',');
  let newtabLiquidSurfaces: ReturnType<typeof createLiquidSurfaces> | null = null;

  function syncNewtabLiquidSurfaces(enabled: boolean): void {
    if (!enabled) {
      if (newtabLiquidSurfaces) {
        newtabLiquidSurfaces.destroy();
        newtabLiquidSurfaces = null;
      }
      return;
    }
    const api = globalThis.LumnoNewtabLiquidSurfaces;
    if (newtabLiquidSurfaces || !api) {
      return;
    }
    newtabLiquidSurfaces = api.create({
      documentObj: document,
      windowObj: window,
      selector: NEWTAB_LIQUID_SURFACE_SELECTOR,
      dispersionSelector: NEWTAB_LIQUID_SEARCH_SELECTOR,
      property: '--x-nt-glass-refraction',
      rimProperty: '--x-nt-glass-rim',
      strengthProperty: '--x-nt-glass-refraction-strength'
    });
  }

  // Floating surfaces sample the wallpaper where they open, so resample as they open and close.
  let newtabGlassOpenObserver: MutationObserver | null = null;
  function syncNewtabGlassOpenObserver(enabled: boolean): void {
    if (!enabled) {
      if (newtabGlassOpenObserver) {
        newtabGlassOpenObserver.disconnect();
        newtabGlassOpenObserver = null;
      }
      return;
    }
    if (newtabGlassOpenObserver || typeof MutationObserver !== 'function') {
      return;
    }
    newtabGlassOpenObserver = new MutationObserver(() => scheduleWallpaperAdaptiveToneUpdate());
    newtabGlassOpenObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-open', 'data-menu-open', 'data-show', 'data-nt-suggestions-open', 'data-wallpaper-panel-open']
    });
  }

  // Plates open in the ink the last page's wallpaper sample settled on (light text over a dark
  // wallpaper), so they do not start white and flip once this page's sample lands.
  function applyRememberedGlassInkHint(): void {
    if (document.body.hasAttribute('data-glass-ink-hint')) {
      return;
    }
    try {
      const hint = window.localStorage.getItem(LumnoNewtabWallpaperAdaptiveTone.GLASS_INK_HINT_STORAGE_KEY);
      if (hint === 'light' || hint === 'dark') {
        document.body.setAttribute('data-glass-ink-hint', hint);
      }
    } catch {
      // Without the hint the plates start in the theme's ink and the sample flips them.
    }
  }

  function applyNewtabGlassStyle(value: unknown): void {
    const style = SETTINGS.normalizeNewtabGlassStyle(value);
    if (style === 'none') {
      document.body.removeAttribute('data-glass-style');
    } else {
      document.body.setAttribute('data-glass-style', style);
      applyRememberedGlassInkHint();
    }
    syncNewtabGlassThemeOverride();
    syncNewtabLiquidSurfaces(style === 'liquid');
    syncNewtabGlassOpenObserver(style !== 'none');
    // The bookmarks bar's "match style" background follows the page's material.
    syncBookmarkTopbarSurfaceAppearance({ updateMenu: false });
    updateWallpaperAppearanceSelectionUi();
    scheduleWallpaperAdaptiveToneUpdate({ resetInk: true });
  }

  // A material set to light or dark holds the page's theme there (appearance-modes.ts reads
  // pageState.glassThemeOverride) and marks the body, so the wallpaper sampler keeps light glass
  // light instead of turning it dark over a dark wallpaper.
  function syncNewtabGlassThemeOverride(): void {
    const override = SETTINGS.getNewtabGlassThemeOverride(
      document.body.getAttribute('data-glass-style'),
      pageState.newtabGlassTheme
    );
    if (override) {
      document.body.setAttribute('data-glass-theme', override);
      if (override === 'light') {
        document.body.setAttribute('data-glass-ink-hint', 'dark');
      }
    } else {
      document.body.removeAttribute('data-glass-theme');
    }
    if (override === pageState.glassThemeOverride) {
      return;
    }
    pageState.glassThemeOverride = override;
    // Until the stored theme lands, the theme bootstrap applies the override itself.
    if (pageState.initialThemeApplied) {
      applyScopedThemeMode();
    }
  }

  function applyNewtabGlassTheme(value: unknown): void {
    pageState.newtabGlassTheme = SETTINGS.normalizeNewtabGlassTheme(value);
    syncNewtabGlassThemeOverride();
    updateWallpaperAppearanceSelectionUi();
    scheduleWallpaperAdaptiveToneUpdate({ resetInk: true });
  }

  function loadNewtabGlassStyle(): Promise<void> {
    if (!storageArea) {
      applyNewtabGlassStyle('none');
      return Promise.resolve();
    }
    // Narrowed here, for the storage callback below.
    const area = storageArea;
    return new Promise((resolve) => {
      void area.get([NEWTAB_GLASS_STYLE_STORAGE_KEY, NEWTAB_GLASS_THEME_STORAGE_KEY], (result) => {
        pageState.newtabGlassTheme = SETTINGS.normalizeNewtabGlassTheme(result && result[NEWTAB_GLASS_THEME_STORAGE_KEY]);
        applyNewtabGlassStyle(result && result[NEWTAB_GLASS_STYLE_STORAGE_KEY]);
        resolve();
      });
    });
  }

  return {
    applyNewtabGlassStyle,
    applyNewtabGlassTheme,
    loadNewtabGlassStyle
  };
}

type GlassSurfaces = ReturnType<typeof createGlassSurfaces>;

export { createGlassSurfaces };
export type { GlassSurfaces, GlassSurfacesDeps, GlassSurfacesState };
