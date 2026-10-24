// @ts-nocheck
// Settings the appearance panel edits besides the wallpaper: top content
// and the clock, search width and the shortcut grid sliders.
function createPanelSettings(deps) {
  const {
    normalizeNewtabTopContentMode,
    setTopContentMode,
    renderWallpaperPanelState,
    storageArea,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalizeNewtabTimeFontWeight,
    setTimeFontWeight,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    SETTINGS,
    setTimeFontSize,
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    setTimeOpacity,
    NEWTAB_TIME_OPACITY_STORAGE_KEY,
    setTimeInk,
    NEWTAB_TIME_INK_STORAGE_KEY,
    setTimeFont,
    NEWTAB_TIME_FONT_STORAGE_KEY,
    normalizeNewtabTimeSecondsVisible,
    setTimeSecondsVisible,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
    setTime12Hour,
    NEWTAB_TIME_12_HOUR_STORAGE_KEY,
    getWallpaperPanelRefs,
    searchWidthConfig,
    setSearchWidth,
    shortcutColumnsConfig,
    setShortcutColumns,
    shortcutSizeConfig,
    shortcutGapConfig,
    setShortcutSize,
    setShortcutGap
  } = deps;

  // The runtime state object shared with wallpaper.ts and the other modules.
  const wallpaperState = deps.wallpaperState;

  function finalizeInitialWallpaper() {
    if (wallpaperState.initialWallpaperApplied) {
      return;
    }
    wallpaperState.initialWallpaperApplied = true;
    // The first sample has taken the preload's decoded image if it showed the same wallpaper.
    const wallpaperPreload = globalThis.LumnoNewtabWallpaperPreload;
    if (wallpaperPreload && wallpaperPreload.decodedImage) {
      wallpaperPreload.decodedImage = null;
    }
    if (typeof wallpaperState.resolveInitialWallpaperReady === 'function') {
      wallpaperState.resolveInitialWallpaperReady();
    }
  }

  function applyTopContentMode(value) {
    wallpaperState.currentTopContentMode = normalizeNewtabTopContentMode(value);
    setTopContentMode(wallpaperState.currentTopContentMode);
    renderWallpaperPanelState();
  }

  function persistTopContentMode(value) {
    const nextValue = normalizeNewtabTopContentMode(value);
    applyTopContentMode(nextValue);
    if (!storageArea || !NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY) {
      return;
    }
    storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
  }

  function applyTimeFontWeight(value) {
    wallpaperState.currentTimeFontWeight = normalizeNewtabTimeFontWeight(value);
    setTimeFontWeight(wallpaperState.currentTimeFontWeight);
    renderWallpaperPanelState();
  }

  function persistTimeFontWeight(value) {
    const nextValue = normalizeNewtabTimeFontWeight(value);
    applyTimeFontWeight(nextValue);
    if (!storageArea || !NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY) {
      return;
    }
    storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextValue });
  }

  // The clock follows the slider at once; the value is saved once it settles.
  function persistTimeFontSizeFromSlider(value, change) {
    const size = SETTINGS.normalizeNewtabTimeFontSize(value);
    setTimeFontSize(size);
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('timeFontSize', () => {
      if (storageArea && NEWTAB_TIME_FONT_SIZE_STORAGE_KEY) {
        storageArea.set({ [NEWTAB_TIME_FONT_SIZE_STORAGE_KEY]: size });
      }
    }, change);
  }

  function persistTimeOpacityFromSlider(value, change) {
    const opacity = SETTINGS.normalizeNewtabTimeOpacity(value);
    setTimeOpacity(opacity);
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('timeOpacity', () => {
      if (storageArea && NEWTAB_TIME_OPACITY_STORAGE_KEY) {
        storageArea.set({ [NEWTAB_TIME_OPACITY_STORAGE_KEY]: opacity });
      }
    }, change);
  }

  function persistTimeInk(value) {
    const ink = SETTINGS.normalizeNewtabTimeInk(value);
    // Redraws the panel when the ink changes.
    setTimeInk(ink);
    if (storageArea && NEWTAB_TIME_INK_STORAGE_KEY) {
      storageArea.set({ [NEWTAB_TIME_INK_STORAGE_KEY]: ink });
    }
  }

  function applyTimeFont(value) {
    wallpaperState.currentTimeFont = SETTINGS.normalizeNewtabTimeFont(value);
    setTimeFont(wallpaperState.currentTimeFont);
    renderWallpaperPanelState();
  }

  // Each face opens at the weight it reads best at, so switching faces
  // also moves the weight to the new face's default.
  function persistTimeFont(value) {
    const nextValue = SETTINGS.normalizeNewtabTimeFont(value);
    const nextWeight = SETTINGS.getNewtabTimeFont(nextValue).defaultWeight;
    wallpaperState.currentTimeFontWeight = nextWeight;
    setTimeFontWeight(nextWeight);
    applyTimeFont(nextValue);
    if (!storageArea || !NEWTAB_TIME_FONT_STORAGE_KEY) {
      return;
    }
    storageArea.set({
      [NEWTAB_TIME_FONT_STORAGE_KEY]: nextValue,
      [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextWeight
    });
  }

  function applyTimeSecondsVisible(value) {
    wallpaperState.currentTimeSecondsVisible = normalizeNewtabTimeSecondsVisible(value);
    setTimeSecondsVisible(wallpaperState.currentTimeSecondsVisible);
    renderWallpaperPanelState();
  }

  function persistTimeSecondsVisible(value) {
    const nextValue = normalizeNewtabTimeSecondsVisible(value);
    applyTimeSecondsVisible(nextValue);
    if (!storageArea || !NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY) {
      return;
    }
    storageArea.set({ [NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: nextValue });
  }

  function persistTime12Hour(value) {
    const nextValue = SETTINGS.normalizeNewtabTime12Hour(value);
    setTime12Hour(nextValue);
    renderWallpaperPanelState();
    if (storageArea && NEWTAB_TIME_12_HOUR_STORAGE_KEY) {
      storageArea.set({ [NEWTAB_TIME_12_HOUR_STORAGE_KEY]: nextValue });
    }
  }

  function getWallpaperAppearanceOptionButtons() {
    const options = getWallpaperPanelRefs().appearanceOptions;
    return options ? Array.from(options.querySelectorAll('.x-nt-appearance-option')) : [];
  }
  function getWallpaperAppearanceOptionMotionElement(button) {
    if (!button || typeof button.querySelector !== 'function') {
      return button;
    }
    return button.querySelector('.x-nt-appearance-option-content') || button;
  }

  function getSearchWidthMin() {
    return Number.isFinite(Number(searchWidthConfig.min)) ? Number(searchWidthConfig.min) : 640;
  }

  function getSearchWidthMax() {
    const min = getSearchWidthMin();
    const max = Number.isFinite(Number(searchWidthConfig.max)) ? Number(searchWidthConfig.max) : 1040;
    return Math.max(min + 1, max);
  }

  function normalizeSearchWidthValue(value) {
    const min = getSearchWidthMin();
    const max = getSearchWidthMax();
    const fallback = Number.isFinite(Number(searchWidthConfig.fallback))
      ? Number(searchWidthConfig.fallback)
      : 920;
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return Math.min(max, Math.max(min, Math.round(fallback)));
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function getSearchWidthSnapPoints() {
    const points = Array.isArray(searchWidthConfig.snapPoints)
      ? searchWidthConfig.snapPoints
      : [640, 720, 920, 1040];
    return points.map(normalizeSearchWidthValue)
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
  }

  function getSearchWidthPercent(value) {
    const min = getSearchWidthMin();
    const max = getSearchWidthMax();
    return ((normalizeSearchWidthValue(value) - min) / (max - min)) * 100;
  }

  function snapSearchWidthValue(value, threshold) {
    const width = normalizeSearchWidthValue(value);
    const snapThreshold = Number.isFinite(Number(threshold))
      ? Number(threshold)
      : Number(searchWidthConfig.snapThreshold || 14);
    const matched = getSearchWidthSnapPoints().find((point) => Math.abs(point - width) <= snapThreshold);
    return Number.isFinite(matched) ? matched : width;
  }

  function formatSearchWidthValue(value) {
    return `${normalizeSearchWidthValue(value)} px`;
  }

  function persistSearchWidthFromSlider(value, options) {
    const final = Boolean(options && options.final);
    const threshold = final
      ? Number(searchWidthConfig.snapThreshold || 14) * 1.35
      : Number(searchWidthConfig.snapThreshold || 14);
    const width = snapSearchWidthValue(value, threshold);
    setSearchWidth(width, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('searchWidth', () => setSearchWidth(width, { persist: true }), { final });
  }
  function getShortcutColumnsMin() {
    return Number.isFinite(Number(shortcutColumnsConfig.min))
      ? Number(shortcutColumnsConfig.min)
      : 4;
  }

  function getShortcutColumnsMax() {
    const min = getShortcutColumnsMin();
    const max = Number.isFinite(Number(shortcutColumnsConfig.max))
      ? Number(shortcutColumnsConfig.max)
      : 16;
    return Math.max(min, max);
  }

  function normalizeShortcutColumnsValue(value) {
    const min = getShortcutColumnsMin();
    const max = getShortcutColumnsMax();
    const fallback = Number.isFinite(Number(shortcutColumnsConfig.fallback))
      ? Number(shortcutColumnsConfig.fallback)
      : 10;
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return Math.min(max, Math.max(min, Math.round(fallback)));
    }
    return Math.min(max, Math.max(min, Math.round(number)));
  }

  function getShortcutColumnsTickValues() {
    return [4, 8, 12, 16].map(normalizeShortcutColumnsValue)
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
  }

  function getShortcutColumnsPercent(value) {
    const min = getShortcutColumnsMin();
    const max = getShortcutColumnsMax();
    if (max <= min) {
      return 0;
    }
    return ((normalizeShortcutColumnsValue(value) - min) / (max - min)) * 100;
  }

  function persistShortcutColumnsFromSlider(value, options) {
    const columns = normalizeShortcutColumnsValue(value);
    setShortcutColumns(columns, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('shortcutColumns', () => setShortcutColumns(columns, { persist: true }), options);
  }
  function getShortcutLayoutMin(config, fallback) {
    return Number.isFinite(Number(config && config.min))
      ? Number(config.min)
      : fallback;
  }

  function getShortcutLayoutMax(config, fallbackMin, fallbackMax) {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const max = Number.isFinite(Number(config && config.max))
      ? Number(config.max)
      : fallbackMax;
    return Math.max(min, max);
  }

  function getShortcutLayoutDefault(config, fallbackMin, fallbackMax, fallbackValue) {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const max = getShortcutLayoutMax(config, fallbackMin, fallbackMax);
    const value = Number.isFinite(Number(config && config.fallback))
      ? Number(config.fallback)
      : fallbackValue;
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function normalizeShortcutLayoutValue(
    value,
    config,
    fallbackMin,
    fallbackMax,
    fallbackValue
  ) {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const max = getShortcutLayoutMax(config, fallbackMin, fallbackMax);
    const fallback = getShortcutLayoutDefault(
      config,
      fallbackMin,
      fallbackMax,
      fallbackValue
    );
    const number = Number(value);
    return Math.min(
      max,
      Math.max(min, Number.isFinite(number) ? Math.round(number) : fallback)
    );
  }

  function getShortcutLayoutPercent(
    value,
    config,
    fallbackMin,
    fallbackMax,
    fallbackValue
  ) {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const max = getShortcutLayoutMax(config, fallbackMin, fallbackMax);
    if (max <= min) {
      return 0;
    }
    const normalized = normalizeShortcutLayoutValue(
      value,
      config,
      fallbackMin,
      fallbackMax,
      fallbackValue
    );
    return ((normalized - min) / (max - min)) * 100;
  }

  function normalizeShortcutSizeValue(value) {
    return normalizeShortcutLayoutValue(value, shortcutSizeConfig, 48, 112, 64);
  }

  function normalizeShortcutGapValue(value) {
    return normalizeShortcutLayoutValue(value, shortcutGapConfig, 0, 24, 4);
  }

  function persistShortcutSizeFromSlider(value, options) {
    const size = normalizeShortcutSizeValue(value);
    setShortcutSize(size, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('shortcutSize', () => setShortcutSize(size, { persist: true }), options);
  }
  function persistShortcutGapFromSlider(value, options) {
    const gap = normalizeShortcutGapValue(value);
    setShortcutGap(gap, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('shortcutGap', () => setShortcutGap(gap, { persist: true }), options);
  }

  return {
    finalizeInitialWallpaper,
    applyTopContentMode,
    persistTopContentMode,
    applyTimeFontWeight,
    persistTimeFontWeight,
    persistTimeFontSizeFromSlider,
    persistTimeOpacityFromSlider,
    persistTimeInk,
    applyTimeFont,
    persistTimeFont,
    applyTimeSecondsVisible,
    persistTimeSecondsVisible,
    persistTime12Hour,
    getWallpaperAppearanceOptionButtons,
    getWallpaperAppearanceOptionMotionElement,
    getSearchWidthMin,
    getSearchWidthMax,
    normalizeSearchWidthValue,
    getSearchWidthSnapPoints,
    getSearchWidthPercent,
    formatSearchWidthValue,
    persistSearchWidthFromSlider,
    getShortcutColumnsMin,
    getShortcutColumnsMax,
    normalizeShortcutColumnsValue,
    getShortcutColumnsTickValues,
    getShortcutColumnsPercent,
    persistShortcutColumnsFromSlider,
    getShortcutLayoutMin,
    getShortcutLayoutMax,
    getShortcutLayoutDefault,
    getShortcutLayoutPercent,
    normalizeShortcutSizeValue,
    normalizeShortcutGapValue,
    persistShortcutSizeFromSlider,
    persistShortcutGapFromSlider
  };
}

export { createPanelSettings };
