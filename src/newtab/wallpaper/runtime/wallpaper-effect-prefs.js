// Wallpaper effects: their prefs per mode, which controls each effect
// shows, their labels, applying and saving them, and the first effect shown
// at startup.
function createWallpaperEffectPrefs(deps) {
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

  // The runtime state object shared with wallpaper.js and the other modules.
  const wallpaperState = deps.wallpaperState;

  const WALLPAPER_TONE_REVEAL_WAIT_MAX_MS = 200;
  let initialWallpaperEffectReadyPromise = null;
  let hasStoredWallpaperEffectLoaded = false;

  function normalizeWallpaperEffectPrefs(value) {
    return normalizeSingleWallpaperEffectPrefs(value);
  }

  function getWallpaperEffectPrefsForMode(mode) {
    const normalizedMode = normalizeWallpaperMode(mode);
    return normalizeWallpaperEffectPrefs(
      wallpaperState.currentWallpaperEffectPrefsByMode &&
        wallpaperState.currentWallpaperEffectPrefsByMode[normalizedMode]
    );
  }

  function getWallpaperEffectEditMode() {
    return wallpaperState.currentWallpaperPrefs && wallpaperState.currentWallpaperPrefs.sameForModes === false
      ? getWallpaperEditMode()
      : getResolvedWallpaperMode();
  }

  function getWallpaperEffectPrefsForEditMode() {
    return getWallpaperEffectPrefsForMode(getWallpaperEffectEditMode());
  }

  function cloneWallpaperEffectStoragePrefs(value) {
    return normalizeWallpaperEffectStoragePrefs(value);
  }

  function setWallpaperEffectPrefsForModes(nextPrefsByMode) {
    wallpaperState.currentWallpaperEffectPrefsByMode = cloneWallpaperEffectStoragePrefs(nextPrefsByMode);
  }

  function getWallpaperEffectStorageValue() {
    return cloneWallpaperEffectStoragePrefs(wallpaperState.currentWallpaperEffectPrefsByMode);
  }

  function setSharedWallpaperEffectPrefs(value) {
    const shared = normalizeWallpaperEffectPrefs(value);
    setWallpaperEffectPrefsForModes({
      version: WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
      light: shared,
      dark: shared
    });
  }

  function synchronizeWallpaperEffectPrefsWithWallpaperModes(sourceMode) {
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

  function doesWallpaperEffectSupportSize(type) {
    return type === 'blocks' || type === 'halftone' || type === 'dither' || type === 'ascii';
  }

  function doesWallpaperEffectSupportSpacing(type) {
    return type === 'halftone' || type === 'dither' || type === 'ascii';
  }

  function doesWallpaperEffectSupportInkTone(type) {
    return type === 'halftone' || type === 'ascii';
  }

  function getWallpaperEffectInkToneForUi(prefs) {
    return WALLPAPER_EFFECTS.resolveAutoInkTone(prefs && prefs.inkTone, getWallpaperEffectEditMode());
  }

  function getWallpaperEffectInkToneLabel(tone) {
    const item = NEWTAB_WALLPAPER_EFFECT_INK_TONES.find((option) => option.tone === tone) ||
      NEWTAB_WALLPAPER_EFFECT_INK_TONES[0];
    return t(item.labelKey, item.fallback);
  }

  function getWallpaperEffectLabel(type) {
    const item = NEWTAB_WALLPAPER_EFFECT_TYPES.find((effect) => effect.type === type) ||
      NEWTAB_WALLPAPER_EFFECT_TYPES[0];
    return t(item.labelKey, item.fallback);
  }
  function applyWallpaperEffectForResolvedMode() {
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

  function applyWallpaperEffectPrefs(value) {
    setWallpaperEffectPrefsForModes(normalizeWallpaperEffectStoragePrefs(value));
    synchronizeWallpaperEffectPrefsWithWallpaperModes();
    applyWallpaperEffectForResolvedMode();
  }

  function getWallpaperEffectControlVisibility(prefs) {
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

  function getWallpaperEffectStrengthLabel(prefs) {
    if (prefs.type === 'blur') {
      return { labelKey: 'newtab_wallpaper_effect_blur_strength', fallback: 'Blur strength' };
    }
    if (prefs.type === 'crt') {
      return { labelKey: 'newtab_wallpaper_effect_crt_strength', fallback: 'Display intensity' };
    }
    return { labelKey: 'newtab_wallpaper_effect_strength', fallback: 'Sampling strength' };
  }

  function getWallpaperEffectSizeLabel(prefs) {
    if (prefs.type === 'blocks') {
      return { labelKey: 'newtab_wallpaper_effect_blocks_size', fallback: 'Block size' };
    }
    return { labelKey: 'newtab_wallpaper_effect_size', fallback: 'Size' };
  }

  function getWallpaperEffectSpacingLabel(prefs) {
    return { labelKey: 'newtab_wallpaper_effect_spacing', fallback: 'Spacing' };
  }

  function getWallpaperEffectTextureLabel() {
    return { labelKey: 'newtab_wallpaper_effect_texture', fallback: 'Texture' };
  }

  function persistWallpaperEffectPrefs(partial) {
    const editMode = getWallpaperEffectEditMode();
    const nextPrefs = normalizeWallpaperEffectPrefs(Object.assign(
      {},
      getWallpaperEffectPrefsForMode(editMode),
      partial || {}
    ));
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
    if (!storageArea) {
      return;
    }
    wallpaperState.saveWallpaperStyleSetting('effect', () => {
      storageArea.set({
        [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: getWallpaperEffectStorageValue()
      });
    });
  }

  function bootstrapInitialWallpaperEffect() {
    if (initialWallpaperEffectReadyPromise) {
      return initialWallpaperEffectReadyPromise;
    }
    if (!storageArea) {
      initialWallpaperEffectReadyPromise = Promise.resolve().then(() => {
        hasStoredWallpaperEffectLoaded = true;
        applyWallpaperEffectPrefs(NEWTAB_WALLPAPER_EFFECT_DEFAULTS);
        if (wallpaperState.hasStoredWallpaperStateLoaded) {
          writeWallpaperPreloadCache();
        }
      });
      return initialWallpaperEffectReadyPromise;
    }
    initialWallpaperEffectReadyPromise = new Promise((resolve) => {
      storageArea.get([NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY], (result) => {
        const raw = result ? result[NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY] : null;
        const prefs = normalizeWallpaperEffectStoragePrefs(raw);
        hasStoredWallpaperEffectLoaded = true;
        applyWallpaperEffectPrefs(prefs);
        if (wallpaperState.hasStoredWallpaperStateLoaded) {
          writeWallpaperPreloadCache();
        }
        const storedPrefs = getWallpaperEffectStorageValue();
        if (raw && JSON.stringify(raw) !== JSON.stringify(storedPrefs)) {
          storageArea.set({ [NEWTAB_WALLPAPER_EFFECT_STORAGE_KEY]: storedPrefs });
        }
        resolve();
      });
    });
    return initialWallpaperEffectReadyPromise;
  }

  function waitForInitialWallpaperEffectVisual() {
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
  function waitForInitialWallpaperTone() {
    return wallpaperState.initialWallpaperReadyPromise.then(() => new Promise((resolve) => {
      const timer = window.setTimeout(resolve, WALLPAPER_TONE_REVEAL_WAIT_MAX_MS);
      wallpaperState.wallpaperAdaptiveTone.whenSettled().then(() => {
        window.clearTimeout(timer);
        resolve();
      });
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

export { createWallpaperEffectPrefs };
