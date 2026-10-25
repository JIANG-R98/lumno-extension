// Wallpaper effects: their prefs per mode, which controls each effect
// shows, their labels, applying and saving them, and the first effect shown
// at startup.
import type { StorageAreaLike } from '../../../domain/storage-port';
import type { Translate } from '../../newtab-types';
import type * as WallpaperEffects from '../wallpaper-effects';
import type { EffectType, WallpaperEffectPrefs, WallpaperEffectStoragePrefs } from '../wallpaper-effects';
import type { WallpaperSources } from './wallpaper-sources';
import type { WallpaperStorage } from './wallpaper-storage';
import type { WallpaperMode, WallpaperState } from './wallpaper-runtime-types';

// A message and its fallback text.
interface EffectLabel {
  labelKey: string;
  fallback: string;
}

interface WallpaperEffectPrefsDeps extends Pick<WallpaperSources, 'normalizeWallpaperMode'>,
  Pick<WallpaperStorage, 'getWallpaperEditMode' | 'getResolvedWallpaperMode' | 'writeWallpaperPreloadCache'> {
  normalizeSingleWallpaperEffectPrefs(value: unknown, inheritedVersion?: unknown): WallpaperEffectPrefs;
  normalizeWallpaperEffectStoragePrefs(value: unknown): WallpaperEffectStoragePrefs;
  WALLPAPER_EFFECT_MODE_STORAGE_VERSION: number;
  WALLPAPER_EFFECTS: Pick<typeof WallpaperEffects, 'resolveAutoInkTone' | 'resolvePrefsForMode'>;
  NEWTAB_WALLPAPER_EFFECT_INK_TONES: ReadonlyArray<EffectLabel & { tone: 'dark' | 'light' }>;
  t: Translate;
  NEWTAB_WALLPAPER_EFFECT_TYPES: ReadonlyArray<EffectLabel & { type: EffectType }>;
  // A copy of the shown wallpaper that fades out over the change, or null.
  createWallpaperTransitionLayer(): HTMLElement | null;
  releaseWallpaperTransitionLayer(layer: HTMLElement | null): void;
  document: Document;
  renderWallpaperPanelState(): void;
  NEWTAB_WALLPAPER_MODES: readonly WallpaperMode[];
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY: string;
  NEWTAB_WALLPAPER_EFFECT_DEFAULTS: WallpaperEffectPrefs;
  window: Window;
  wallpaperState: Pick<WallpaperState,
    'currentWallpaperEffectPrefsByMode' | 'currentWallpaperPrefs' | 'hasStoredWallpaperStateLoaded' |
    'currentAppliedWallpaperEffectPrefs' | 'wallpaperEffects' | 'saveWallpaperStyleSetting' |
    'initialWallpaperReadyPromise' | 'currentWallpaperId' | 'wallpaperAdaptiveTone'>;
}

function createWallpaperEffectPrefs(deps: WallpaperEffectPrefsDeps) {
  const {
    normalizeSingleWallpaperEffectPrefs,
    normalizeWallpaperMode,
    getWallpaperEditMode,
    getResolvedWallpaperMode,
    normalizeWallpaperEffectStoragePrefs,
    WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
    WALLPAPER_EFFECTS,
    NEWTAB_WALLPAPER_EFFECT_INK_TONES,
    t,
    NEWTAB_WALLPAPER_EFFECT_TYPES,
    createWallpaperTransitionLayer,
    document,
    releaseWallpaperTransitionLayer,
    renderWallpaperPanelState,
    NEWTAB_WALLPAPER_MODES,
    writeWallpaperPreloadCache,
    storageArea,
    NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY,
    NEWTAB_WALLPAPER_EFFECT_DEFAULTS,
    window
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  const WALLPAPER_TONE_REVEAL_WAIT_MAX_MS = 200;
  let initialWallpaperEffectReadyPromise: Promise<void> | null = null;
  let hasStoredWallpaperEffectLoaded = false;

  function normalizeWallpaperEffectPrefs(value: unknown): WallpaperEffectPrefs {
    return normalizeSingleWallpaperEffectPrefs(value);
  }

  function getWallpaperEffectPrefsForMode(mode: unknown): WallpaperEffectPrefs {
    const normalizedMode = normalizeWallpaperMode(mode);
    return normalizeWallpaperEffectPrefs(
      wallpaperState.currentWallpaperEffectPrefsByMode &&
        wallpaperState.currentWallpaperEffectPrefsByMode[normalizedMode]
    );
  }

  function getWallpaperEffectEditMode(): WallpaperMode {
    return wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes === false
      ? getWallpaperEditMode()
      : getResolvedWallpaperMode();
  }

  function getWallpaperEffectPrefsForEditMode(): WallpaperEffectPrefs {
    return getWallpaperEffectPrefsForMode(getWallpaperEffectEditMode());
  }

  function cloneWallpaperEffectStoragePrefs(value: unknown): WallpaperEffectStoragePrefs {
    return normalizeWallpaperEffectStoragePrefs(value);
  }

  function setWallpaperEffectPrefsForModes(nextPrefsByMode: unknown): void {
    wallpaperState.currentWallpaperEffectPrefsByMode = cloneWallpaperEffectStoragePrefs(nextPrefsByMode);
  }

  function getWallpaperEffectStorageValue(): WallpaperEffectStoragePrefs {
    return cloneWallpaperEffectStoragePrefs(wallpaperState.currentWallpaperEffectPrefsByMode);
  }

  function setSharedWallpaperEffectPrefs(value: unknown): void {
    const shared = normalizeWallpaperEffectPrefs(value);
    setWallpaperEffectPrefsForModes({
      version: WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
      light: shared,
      dark: shared
    });
  }

  function synchronizeWallpaperEffectPrefsWithWallpaperModes(sourceMode?: WallpaperMode | null): boolean {
    if (!hasStoredWallpaperEffectLoaded ||
        !wallpaperState.hasStoredWallpaperStateLoaded ||
        !wallpaperState.currentWallpaperPrefs ||
        wallpaperState.currentWallpaperPrefs.sameForModes === false) {
      return false;
    }
    const mode = normalizeWallpaperMode(sourceMode || getResolvedWallpaperMode());
    const before = JSON.stringify(getWallpaperEffectStorageValue());
    setSharedWallpaperEffectPrefs(getWallpaperEffectPrefsForMode(mode));
    return before !== JSON.stringify(getWallpaperEffectStorageValue());
  }

  function doesWallpaperEffectSupportSize(type: EffectType): boolean {
    return type === 'blocks' || type === 'halftone' || type === 'dither' || type === 'ascii';
  }

  function doesWallpaperEffectSupportSpacing(type: EffectType): boolean {
    return type === 'halftone' || type === 'dither' || type === 'ascii';
  }

  function doesWallpaperEffectSupportInkTone(type: EffectType): boolean {
    return type === 'halftone' || type === 'ascii';
  }

  function getWallpaperEffectInkToneForUi(prefs: Pick<WallpaperEffectPrefs, 'inkTone'> | null | undefined): 'dark' | 'light' {
    return WALLPAPER_EFFECTS.resolveAutoInkTone(prefs && prefs.inkTone, getWallpaperEffectEditMode());
  }

  function getWallpaperEffectInkToneLabel(tone: unknown): string {
    const item = NEWTAB_WALLPAPER_EFFECT_INK_TONES.find((option) => option.tone === tone) ||
      NEWTAB_WALLPAPER_EFFECT_INK_TONES[0];
    return t(item.labelKey, item.fallback);
  }

  function getWallpaperEffectLabel(type: unknown): string {
    const item = NEWTAB_WALLPAPER_EFFECT_TYPES.find((effect) => effect.type === type) ||
      NEWTAB_WALLPAPER_EFFECT_TYPES[0];
    return t(item.labelKey, item.fallback);
  }
  function applyWallpaperEffectForResolvedMode(): void {
    const previousType = wallpaperState.currentAppliedWallpaperEffectPrefs.type;
    const nextPrefs = getWallpaperEffectPrefsForMode(getResolvedWallpaperMode());
    const transitionLayer = previousType !== nextPrefs.type
      ? createWallpaperTransitionLayer()
      : null;
    if (transitionLayer) {
      transitionLayer.setAttribute('data-wallpaper-filter-transition', 'true');
    }
    wallpaperState.currentAppliedWallpaperEffectPrefs = nextPrefs;
    if (document.body) {
      document.body.setAttribute('data-wallpaper-effect', wallpaperState.currentAppliedWallpaperEffectPrefs.type);
    }
    const effectRenderReady = wallpaperState.wallpaperEffects
      ? wallpaperState.wallpaperEffects.apply(WALLPAPER_EFFECTS.resolvePrefsForMode(
        wallpaperState.currentAppliedWallpaperEffectPrefs,
        getResolvedWallpaperMode()
      ))
      : null;
    if (transitionLayer && effectRenderReady && typeof effectRenderReady.then === 'function') {
      Promise.resolve(effectRenderReady).then(
        () => releaseWallpaperTransitionLayer(transitionLayer),
        () => releaseWallpaperTransitionLayer(transitionLayer)
      );
    } else {
      releaseWallpaperTransitionLayer(transitionLayer);
    }
    renderWallpaperPanelState();
  }

  function applyWallpaperEffectPrefs(value: unknown): void {
    setWallpaperEffectPrefsForModes(normalizeWallpaperEffectStoragePrefs(value));
    synchronizeWallpaperEffectPrefsWithWallpaperModes();
    applyWallpaperEffectForResolvedMode();
  }

  function getWallpaperEffectControlVisibility(prefs: WallpaperEffectPrefs) {
    return {
      inkTone: doesWallpaperEffectSupportInkTone(prefs.type),
      strength: prefs.type !== 'none' && prefs.type !== 'blocks',
      size: doesWallpaperEffectSupportSize(prefs.type),
      spacing: doesWallpaperEffectSupportSpacing(prefs.type),
      texture: prefs.type === 'blur',
      crtBloom: prefs.type === 'crt',
      crtRgbOffset: prefs.type === 'crt',
      crtCurvature: prefs.type === 'crt'
    };
  }

  function getWallpaperEffectStrengthLabel(prefs: WallpaperEffectPrefs): EffectLabel {
    if (prefs.type === 'blur') {
      return { labelKey: 'newtab_wallpaper_effect_blur_strength', fallback: 'Blur strength' };
    }
    if (prefs.type === 'crt') {
      return { labelKey: 'newtab_wallpaper_effect_crt_strength', fallback: 'Display intensity' };
    }
    return { labelKey: 'newtab_wallpaper_effect_strength', fallback: 'Sampling strength' };
  }

  function getWallpaperEffectSizeLabel(prefs: WallpaperEffectPrefs): EffectLabel {
    if (prefs.type === 'blocks') {
      return { labelKey: 'newtab_wallpaper_effect_blocks_size', fallback: 'Block size' };
    }
    return { labelKey: 'newtab_wallpaper_effect_size', fallback: 'Size' };
  }

  function getWallpaperEffectSpacingLabel(_prefs: WallpaperEffectPrefs): EffectLabel {
    return { labelKey: 'newtab_wallpaper_effect_spacing', fallback: 'Spacing' };
  }

  function getWallpaperEffectTextureLabel(): EffectLabel {
    return { labelKey: 'newtab_wallpaper_effect_texture', fallback: 'Texture' };
  }

  // Saves a change to the edited mode's effect; each value is normalized like a stored one.
  function persistWallpaperEffectPrefs(partial: Partial<Record<keyof WallpaperEffectPrefs, unknown>> | null | undefined): void {
    const editMode = getWallpaperEffectEditMode();
    const nextPrefs = normalizeWallpaperEffectPrefs({
      ...getWallpaperEffectPrefsForMode(editMode),
      ...partial
    });
    const nextPrefsByMode = getWallpaperEffectStorageValue();
    const targetModes = wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes === false
      ? [editMode]
      : NEWTAB_WALLPAPER_MODES;
    targetModes.forEach((mode) => {
      nextPrefsByMode[mode] = nextPrefs;
    });
    setWallpaperEffectPrefsForModes(nextPrefsByMode);
    applyWallpaperEffectForResolvedMode();
    if (wallpaperState.hasStoredWallpaperStateLoaded) {
      writeWallpaperPreloadCache();
    }
    // Narrowed here, for the save below.
    const area = storageArea;
    if (!area) {
      return;
    }
    wallpaperState.saveWallpaperStyleSetting('effect', () => {
      void area.set({
        [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
      });
    });
  }

  function bootstrapInitialWallpaperEffect(): Promise<void> {
    if (initialWallpaperEffectReadyPromise) {
      return initialWallpaperEffectReadyPromise;
    }
    const area = storageArea;
    if (!area) {
      initialWallpaperEffectReadyPromise = Promise.resolve().then(() => {
        hasStoredWallpaperEffectLoaded = true;
        applyWallpaperEffectPrefs(NEWTAB_WALLPAPER_EFFECT_DEFAULTS);
        if (wallpaperState.hasStoredWallpaperStateLoaded) {
          writeWallpaperPreloadCache();
        }
      });
      return initialWallpaperEffectReadyPromise;
    }
    initialWallpaperEffectReadyPromise = new Promise<void>((resolve) => {
      void area.get([NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY], (result) => {
        const raw = result ? result[NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY] : null;
        const prefs = normalizeWallpaperEffectStoragePrefs(raw);
        hasStoredWallpaperEffectLoaded = true;
        applyWallpaperEffectPrefs(prefs);
        if (wallpaperState.hasStoredWallpaperStateLoaded) {
          writeWallpaperPreloadCache();
        }
        const storedPrefs = getWallpaperEffectStorageValue();
        if (raw && JSON.stringify(raw) !== JSON.stringify(storedPrefs)) {
          void area.set({ [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: storedPrefs });
        }
        resolve();
      });
    });
    return initialWallpaperEffectReadyPromise;
  }

  function waitForInitialWallpaperEffectVisual(): Promise<void> {
    const effectPreferencesReady = initialWallpaperEffectReadyPromise ||
      bootstrapInitialWallpaperEffect();
    return Promise.all([
      wallpaperState.initialWallpaperReadyPromise,
      effectPreferencesReady
    ]).then(() => {
      if (!wallpaperState.wallpaperEffects ||
          !wallpaperState.currentWallpaperId ||
          wallpaperState.currentAppliedWallpaperEffectPrefs.type === 'none') {
        return;
      }
      return wallpaperState.wallpaperEffects.refresh({ immediate: true });
    });
  }

  // The page's content shows once the wallpaper's tones are on its controls, so nothing enters in
  // the theme's default colors and changes a moment later. A slow image never holds it for long.
  function waitForInitialWallpaperTone(): Promise<void> {
    return wallpaperState.initialWallpaperReadyPromise.then(() => new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, WALLPAPER_TONE_REVEAL_WAIT_MAX_MS);
      const adaptiveTone = wallpaperState.wallpaperAdaptiveTone;
      if (adaptiveTone) {
        void adaptiveTone.whenSettled().then(() => {
          window.clearTimeout(timer);
          resolve();
        });
      }
    }));
  }

  return {
    getWallpaperEffectPrefsForMode,
    getWallpaperEffectPrefsForEditMode,
    getWallpaperEffectStorageValue,
    setSharedWallpaperEffectPrefs,
    synchronizeWallpaperEffectPrefsWithWallpaperModes,
    getWallpaperEffectInkToneForUi,
    getWallpaperEffectInkToneLabel,
    getWallpaperEffectLabel,
    applyWallpaperEffectForResolvedMode,
    applyWallpaperEffectPrefs,
    getWallpaperEffectControlVisibility,
    getWallpaperEffectStrengthLabel,
    getWallpaperEffectSizeLabel,
    getWallpaperEffectSpacingLabel,
    getWallpaperEffectTextureLabel,
    persistWallpaperEffectPrefs,
    bootstrapInitialWallpaperEffect,
    waitForInitialWallpaperEffectVisual,
    waitForInitialWallpaperTone
  };
}

type WallpaperEffectPrefsRuntime = ReturnType<typeof createWallpaperEffectPrefs>;

export { createWallpaperEffectPrefs };
export type { WallpaperEffectPrefsDeps, WallpaperEffectPrefsRuntime };
