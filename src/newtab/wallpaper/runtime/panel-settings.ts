// Settings the appearance panel edits besides the wallpaper: top content
// and the clock, search width and the shortcut grid sliders.
import type * as LumnoSettings from '../../../domain/settings';
import type { NewtabTimeInk, NewtabTopContentMode } from '../../../domain/settings';
import type { StorageAreaLike } from '../../../domain/storage-port';
import { queryHtmlElement, queryHtmlElements } from '../../../shared/dom-lookup';
import type { WallpaperState } from './wallpaper-runtime-types';

// A slider's range and its value when none is saved.
interface SliderConfig {
  min?: number;
  max?: number;
  fallback?: number;
}

interface SearchWidthConfig extends SliderConfig {
  // The widths the slider settles on near them, and how near (px).
  snapPoints?: readonly number[];
  snapThreshold?: number;
}

// Whether a layout change is only shown or also saved.
type PersistOptions = { persist: boolean };

// A slider change; a final one saves at once.
type SliderSaveOptions = { final?: boolean } | null | undefined;

interface PanelSettingsDeps {
  normalizeNewtabTopContentMode(value: unknown): NewtabTopContentMode;
  setTopContentMode(mode: NewtabTopContentMode): void;
  renderWallpaperPanelState(): void;
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: string;
  normalizeNewtabTimeFontWeight(value: unknown): number;
  setTimeFontWeight(weight: number): void;
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY: string;
  SETTINGS: Pick<typeof LumnoSettings,
    'normalizeNewtabTimeFontSize' | 'normalizeNewtabTimeOpacity' | 'normalizeNewtabTimeInk' |
    'normalizeNewtabTimeFont' | 'getNewtabTimeFont' | 'normalizeNewtabTime12Hour'>;
  setTimeFontSize(size: number): void;
  NEWTAB_TIME_FONT_SIZE_STORAGE_KEY: string;
  setTimeOpacity(opacity: number): void;
  NEWTAB_TIME_OPACITY_STORAGE_KEY: string;
  setTimeInk(ink: NewtabTimeInk): void;
  NEWTAB_TIME_INK_STORAGE_KEY: string;
  setTimeFont(font: string): void;
  NEWTAB_TIME_FONT_STORAGE_KEY: string;
  normalizeNewtabTimeSecondsVisible(value: unknown): boolean;
  setTimeSecondsVisible(visible: boolean): void;
  NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY: string;
  setTime12Hour(enabled: boolean): void;
  NEWTAB_TIME_12_HOUR_STORAGE_KEY: string;
  // The appearance panel's elements by data-wallpaper-ref name.
  getWallpaperPanelRefs(): Readonly<Partial<Record<string, HTMLElement>>>;
  searchWidthConfig: SearchWidthConfig;
  setSearchWidth(width: number, options: PersistOptions): void;
  shortcutColumnsConfig: SliderConfig;
  setShortcutColumns(columns: number, options: PersistOptions): void;
  shortcutSizeConfig: SliderConfig;
  shortcutGapConfig: SliderConfig;
  setShortcutSize(size: number, options: PersistOptions): void;
  setShortcutGap(gap: number, options: PersistOptions): void;
  wallpaperState: Pick<WallpaperState,
    'initialWallpaperApplied' | 'resolveInitialWallpaperReady' | 'currentTopContentMode' |
    'currentTimeFontWeight' | 'saveSliderSetting' | 'currentTimeFont' | 'currentTimeSecondsVisible'>;
}

function createPanelSettings(deps: PanelSettingsDeps) {
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

  function finalizeInitialWallpaper(): void {
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

  function applyTopContentMode(value: unknown): void {
    wallpaperState.currentTopContentMode = normalizeNewtabTopContentMode(value);
    setTopContentMode(wallpaperState.currentTopContentMode);
    renderWallpaperPanelState();
  }

  function persistTopContentMode(value: unknown): void {
    const nextValue = normalizeNewtabTopContentMode(value);
    applyTopContentMode(nextValue);
    if (!storageArea || !NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY) {
      return;
    }
    void storageArea.set({ [NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: nextValue });
  }

  function applyTimeFontWeight(value: unknown): void {
    wallpaperState.currentTimeFontWeight = normalizeNewtabTimeFontWeight(value);
    setTimeFontWeight(wallpaperState.currentTimeFontWeight);
    renderWallpaperPanelState();
  }

  function persistTimeFontWeight(value: unknown): void {
    const nextValue = normalizeNewtabTimeFontWeight(value);
    applyTimeFontWeight(nextValue);
    if (!storageArea || !NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY) {
      return;
    }
    void storageArea.set({ [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextValue });
  }

  // The clock follows the slider at once; the value is saved once it settles.
  function persistTimeFontSizeFromSlider(value: unknown, change?: SliderSaveOptions): void {
    const size = SETTINGS.normalizeNewtabTimeFontSize(value);
    setTimeFontSize(size);
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('timeFontSize', () => {
      if (storageArea && NEWTAB_TIME_FONT_SIZE_STORAGE_KEY) {
        void storageArea.set({ [NEWTAB_TIME_FONT_SIZE_STORAGE_KEY]: size });
      }
    }, change);
  }

  function persistTimeOpacityFromSlider(value: unknown, change?: SliderSaveOptions): void {
    const opacity = SETTINGS.normalizeNewtabTimeOpacity(value);
    setTimeOpacity(opacity);
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('timeOpacity', () => {
      if (storageArea && NEWTAB_TIME_OPACITY_STORAGE_KEY) {
        void storageArea.set({ [NEWTAB_TIME_OPACITY_STORAGE_KEY]: opacity });
      }
    }, change);
  }

  function persistTimeInk(value: unknown): void {
    const ink = SETTINGS.normalizeNewtabTimeInk(value);
    // Redraws the panel when the ink changes.
    setTimeInk(ink);
    if (storageArea && NEWTAB_TIME_INK_STORAGE_KEY) {
      void storageArea.set({ [NEWTAB_TIME_INK_STORAGE_KEY]: ink });
    }
  }

  function applyTimeFont(value: unknown): void {
    wallpaperState.currentTimeFont = SETTINGS.normalizeNewtabTimeFont(value);
    setTimeFont(wallpaperState.currentTimeFont);
    renderWallpaperPanelState();
  }

  // Each face opens at the weight it reads best at, so switching faces
  // also moves the weight to the new face's default.
  function persistTimeFont(value: unknown): void {
    const nextValue = SETTINGS.normalizeNewtabTimeFont(value);
    const nextWeight = SETTINGS.getNewtabTimeFont(nextValue).defaultWeight;
    wallpaperState.currentTimeFontWeight = nextWeight;
    setTimeFontWeight(nextWeight);
    applyTimeFont(nextValue);
    if (!storageArea || !NEWTAB_TIME_FONT_STORAGE_KEY) {
      return;
    }
    void storageArea.set({
      [NEWTAB_TIME_FONT_STORAGE_KEY]: nextValue,
      [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: nextWeight
    });
  }

  function applyTimeSecondsVisible(value: unknown): void {
    wallpaperState.currentTimeSecondsVisible = normalizeNewtabTimeSecondsVisible(value);
    setTimeSecondsVisible(wallpaperState.currentTimeSecondsVisible);
    renderWallpaperPanelState();
  }

  function persistTimeSecondsVisible(value: unknown): void {
    const nextValue = normalizeNewtabTimeSecondsVisible(value);
    applyTimeSecondsVisible(nextValue);
    if (!storageArea || !NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY) {
      return;
    }
    void storageArea.set({ [NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: nextValue });
  }

  function persistTime12Hour(value: unknown): void {
    const nextValue = SETTINGS.normalizeNewtabTime12Hour(value);
    setTime12Hour(nextValue);
    renderWallpaperPanelState();
    if (storageArea && NEWTAB_TIME_12_HOUR_STORAGE_KEY) {
      void storageArea.set({ [NEWTAB_TIME_12_HOUR_STORAGE_KEY]: nextValue });
    }
  }

  function getWallpaperAppearanceOptionButtons(): HTMLElement[] {
    const options = getWallpaperPanelRefs().appearanceOptions;
    return options ? queryHtmlElements(options, '.x-nt-appearance-option') : [];
  }
  // The part of an appearance option that moves; the option itself when it has none.
  function getWallpaperAppearanceOptionMotionElement(button: HTMLElement): HTMLElement {
    return queryHtmlElement(button, '.x-nt-appearance-option-content') || button;
  }

  function getSearchWidthMin(): number {
    return Number.isFinite(Number(searchWidthConfig.min)) ? Number(searchWidthConfig.min) : 640;
  }

  function getSearchWidthMax(): number {
    const min = getSearchWidthMin();
    const max = Number.isFinite(Number(searchWidthConfig.max)) ? Number(searchWidthConfig.max) : 1040;
    return Math.max(min + 1, max);
  }

  function normalizeSearchWidthValue(value: unknown): number {
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

  function getSearchWidthSnapPoints(): number[] {
    const points = searchWidthConfig.snapPoints || [640, 720, 920, 1040];
    return points.map(normalizeSearchWidthValue)
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
  }

  function getSearchWidthPercent(value: unknown): number {
    const min = getSearchWidthMin();
    const max = getSearchWidthMax();
    return ((normalizeSearchWidthValue(value) - min) / (max - min)) * 100;
  }

  function snapSearchWidthValue(value: unknown, threshold: number): number {
    const width = normalizeSearchWidthValue(value);
    const snapThreshold = Number.isFinite(Number(threshold))
      ? Number(threshold)
      : Number(searchWidthConfig.snapThreshold || 14);
    const matched = getSearchWidthSnapPoints().find((point) => Math.abs(point - width) <= snapThreshold);
    return matched !== undefined ? matched : width;
  }

  function formatSearchWidthValue(value: unknown): string {
    return `${normalizeSearchWidthValue(value)} px`;
  }

  function persistSearchWidthFromSlider(value: unknown, options?: SliderSaveOptions): void {
    const final = Boolean(options && options.final);
    const threshold = final
      ? Number(searchWidthConfig.snapThreshold || 14) * 1.35
      : Number(searchWidthConfig.snapThreshold || 14);
    const width = snapSearchWidthValue(value, threshold);
    setSearchWidth(width, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('searchWidth', () => setSearchWidth(width, { persist: true }), { final });
  }
  function getShortcutColumnsMin(): number {
    return Number.isFinite(Number(shortcutColumnsConfig.min))
      ? Number(shortcutColumnsConfig.min)
      : 4;
  }

  function getShortcutColumnsMax(): number {
    const min = getShortcutColumnsMin();
    const max = Number.isFinite(Number(shortcutColumnsConfig.max))
      ? Number(shortcutColumnsConfig.max)
      : 16;
    return Math.max(min, max);
  }

  function normalizeShortcutColumnsValue(value: unknown): number {
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

  function getShortcutColumnsTickValues(): number[] {
    return [4, 8, 12, 16].map(normalizeShortcutColumnsValue)
      .filter((value, index, array) => array.indexOf(value) === index)
      .sort((a, b) => a - b);
  }

  function getShortcutColumnsPercent(value: unknown): number {
    const min = getShortcutColumnsMin();
    const max = getShortcutColumnsMax();
    if (max <= min) {
      return 0;
    }
    return ((normalizeShortcutColumnsValue(value) - min) / (max - min)) * 100;
  }

  function persistShortcutColumnsFromSlider(value: unknown, options?: SliderSaveOptions): void {
    const columns = normalizeShortcutColumnsValue(value);
    setShortcutColumns(columns, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('shortcutColumns', () => setShortcutColumns(columns, { persist: true }), options);
  }
  function getShortcutLayoutMin(config: SliderConfig | null | undefined, fallback: number): number {
    const min = Number(config && config.min);
    return Number.isFinite(min) ? min : fallback;
  }

  function getShortcutLayoutMax(config: SliderConfig | null | undefined, fallbackMin: number, fallbackMax: number): number {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const configuredMax = Number(config && config.max);
    const max = Number.isFinite(configuredMax) ? configuredMax : fallbackMax;
    return Math.max(min, max);
  }

  function getShortcutLayoutDefault(
    config: SliderConfig | null | undefined,
    fallbackMin: number,
    fallbackMax: number,
    fallbackValue: number
  ): number {
    const min = getShortcutLayoutMin(config, fallbackMin);
    const max = getShortcutLayoutMax(config, fallbackMin, fallbackMax);
    const configuredValue = Number(config && config.fallback);
    const value = Number.isFinite(configuredValue) ? configuredValue : fallbackValue;
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function normalizeShortcutLayoutValue(
    value: unknown,
    config: SliderConfig | null | undefined,
    fallbackMin: number,
    fallbackMax: number,
    fallbackValue: number
  ): number {
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
    value: unknown,
    config: SliderConfig | null | undefined,
    fallbackMin: number,
    fallbackMax: number,
    fallbackValue: number
  ): number {
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

  function normalizeShortcutSizeValue(value: unknown): number {
    return normalizeShortcutLayoutValue(value, shortcutSizeConfig, 48, 112, 64);
  }

  function normalizeShortcutGapValue(value: unknown): number {
    return normalizeShortcutLayoutValue(value, shortcutGapConfig, 0, 24, 4);
  }

  function persistShortcutSizeFromSlider(value: unknown, options?: SliderSaveOptions): void {
    const size = normalizeShortcutSizeValue(value);
    setShortcutSize(size, { persist: false });
    renderWallpaperPanelState();
    wallpaperState.saveSliderSetting('shortcutSize', () => setShortcutSize(size, { persist: true }), options);
  }
  function persistShortcutGapFromSlider(value: unknown, options?: SliderSaveOptions): void {
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

type PanelSettings = ReturnType<typeof createPanelSettings>;

export { createPanelSettings };
export type { PanelSettings, PanelSettingsDeps, SearchWidthConfig, SliderConfig };
