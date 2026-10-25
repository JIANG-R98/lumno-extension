// New Tab display preferences: normalizing, loading and applying the shortcut,
// auto-focus, simple mode and search result settings.
import type * as LumnoSettings from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import type { PageLayout } from './page-layout';
import type { WallpaperRuntime } from './wallpaper/wallpaper';

// Whether a change is only shown or also saved.
type PersistOptions = { persist?: boolean } | null | undefined;

interface PagePreferencesState {
  newtabInputAutoFocusEnabled: boolean;
  newtabShortcutsVisible: boolean;
  newtabShortcutAddVisible: boolean;
  newtabShortcutDockMagnificationEnabled: boolean;
  newtabShortcutColumns: number;
  newtabShortcutSize: number;
  newtabShortcutGap: number;
  numberShortcutInstantEnabled: boolean;
  simpleModeEnabled: boolean;
  macosCtrlSuggestionNavigationEnabled: boolean;
  currentBookmarkCount: number;
  wallpaperRuntime: Pick<WallpaperRuntime, 'updateInputAutoFocusUi' | 'updateShortcutsUi'> | null;
}

interface PagePreferencesDeps {
  applyNewtabShortcutsVisibility: PageLayout['applyNewtabShortcutsVisibility'];
  updateBookmarkSectionPosition: PageLayout['updateBookmarkSectionPosition'];
  applyNewtabShortcutColumns: PageLayout['applyNewtabShortcutColumns'];
  applyNewtabShortcutLayoutPreferences: PageLayout['applyNewtabShortcutLayoutPreferences'];
  getBookmarkGridColumnCount: PageLayout['getBookmarkGridColumnCount'];
  SETTINGS: Pick<typeof LumnoSettings,
    'inferNewtabShortcutColumnsFromWidth' | 'normalizeBookmarkColumns' | 'normalizeBookmarkCount' |
    'normalizeBookmarkFolderIconsVisible' | 'normalizeMacosCtrlSuggestionNavigationEnabled' |
    'normalizeNewtabAppearanceButtonVisible' | 'normalizeNewtabFeedbackButtonVisible' |
    'normalizeNewtabInputAutoFocusEnabled' | 'normalizeNewtabSearchWidth' |
    'normalizeNewtabShortcutAddVisible' | 'normalizeNewtabShortcutColumns' |
    'normalizeNewtabShortcutDockMagnificationEnabled' | 'normalizeNewtabShortcutGap' |
    'normalizeNewtabShortcutSize' | 'normalizeNewtabShortcutsVisible' | 'normalizeNewtabTimeFont' |
    'normalizeNewtabTimeFontWeight' | 'normalizeNewtabTimeSecondsVisible' |
    'normalizeNewtabTopContentMode' | 'normalizeNewtabWidthMode' |
    'normalizeNumberShortcutInstantEnabled' | 'normalizeOverlayTabPriorityMode' |
    'normalizeSearchResultPriority' | 'normalizeSimpleModeEnabled' |
    'normalizeTabRankScoreDebugMode'>;
  NEWTAB_SEARCH_WIDTH_CONFIG: NonNullable<Parameters<typeof LumnoSettings.normalizeNewtabSearchWidth>[1]>;
  NEWTAB_SHORTCUT_COLUMNS_MIN: number;
  NEWTAB_SHORTCUT_COLUMNS_MAX: number;
  NEWTAB_SHORTCUT_COLUMNS_DEFAULT: number;
  NEWTAB_SHORTCUT_SIZE_MIN: number;
  NEWTAB_SHORTCUT_SIZE_MAX: number;
  NEWTAB_SHORTCUT_SIZE_DEFAULT: number;
  NEWTAB_SHORTCUT_GAP_MIN: number;
  NEWTAB_SHORTCUT_GAP_MAX: number;
  NEWTAB_SHORTCUT_GAP_DEFAULT: number;
  NEWTAB_SHORTCUT_WIDTH_MIN: number;
  NEWTAB_SHORTCUT_WIDTH_MAX: number;
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY: string;
  NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: string;
  renderShortcuts(): void;
  NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY: string;
  applyNewtabShortcutDockMagnification(): void;
  scheduleWallpaperAdaptiveToneUpdate(): void;
  NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_SIZE_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_GAP_STORAGE_KEY: string;
  NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY: string;
  SIMPLE_MODE_ENABLED_STORAGE_KEY: string;
  MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY: string;
  pageState: PagePreferencesState;
}

function createPagePreferences(deps: PagePreferencesDeps) {
  const {
    SETTINGS,
    NEWTAB_SEARCH_WIDTH_CONFIG,
    NEWTAB_SHORTCUT_COLUMNS_MIN,
    NEWTAB_SHORTCUT_COLUMNS_MAX,
    NEWTAB_SHORTCUT_COLUMNS_DEFAULT,
    NEWTAB_SHORTCUT_SIZE_MIN,
    NEWTAB_SHORTCUT_SIZE_MAX,
    NEWTAB_SHORTCUT_SIZE_DEFAULT,
    NEWTAB_SHORTCUT_GAP_MIN,
    NEWTAB_SHORTCUT_GAP_MAX,
    NEWTAB_SHORTCUT_GAP_DEFAULT,
    NEWTAB_SHORTCUT_WIDTH_MIN,
    NEWTAB_SHORTCUT_WIDTH_MAX,
    storageArea,
    NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    applyNewtabShortcutsVisibility,
    updateBookmarkSectionPosition,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    renderShortcuts,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    applyNewtabShortcutDockMagnification,
    scheduleWallpaperAdaptiveToneUpdate,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    applyNewtabShortcutColumns,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    applyNewtabShortcutLayoutPreferences,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
    SIMPLE_MODE_ENABLED_STORAGE_KEY,
    MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
    getBookmarkGridColumnCount
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function normalizeNewtabWidthMode(value: unknown) {
    return SETTINGS.normalizeNewtabWidthMode(value);
  }

  function normalizeNewtabSearchWidth(
    value: unknown,
    options?: Parameters<typeof LumnoSettings.normalizeNewtabSearchWidth>[1]
  ): ReturnType<typeof LumnoSettings.normalizeNewtabSearchWidth> {
    return SETTINGS.normalizeNewtabSearchWidth(value, { ...NEWTAB_SEARCH_WIDTH_CONFIG, ...options });
  }

  function normalizeNewtabTopContentMode(value: unknown) {
    return SETTINGS.normalizeNewtabTopContentMode(value);
  }

  function normalizeNewtabTimeSecondsVisible(value: unknown) {
    return SETTINGS.normalizeNewtabTimeSecondsVisible(value);
  }

  function normalizeNewtabTimeFontWeight(value: unknown) {
    return SETTINGS.normalizeNewtabTimeFontWeight(value);
  }

  function normalizeNewtabTimeFont(value: unknown) {
    return SETTINGS.normalizeNewtabTimeFont(value);
  }

  function normalizeNewtabShortcutsVisible(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutsVisible(value);
  }

  function normalizeNewtabShortcutAddVisible(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutAddVisible(value);
  }

  function normalizeNewtabShortcutDockMagnificationEnabled(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutDockMagnificationEnabled(value);
  }

  function normalizeNewtabShortcutColumns(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutColumns(value, {
      min: NEWTAB_SHORTCUT_COLUMNS_MIN,
      max: NEWTAB_SHORTCUT_COLUMNS_MAX,
      fallback: NEWTAB_SHORTCUT_COLUMNS_DEFAULT
    });
  }

  function normalizeNewtabShortcutSize(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutSize(value, {
      min: NEWTAB_SHORTCUT_SIZE_MIN,
      max: NEWTAB_SHORTCUT_SIZE_MAX,
      fallback: NEWTAB_SHORTCUT_SIZE_DEFAULT
    });
  }

  function normalizeNewtabShortcutGap(value: unknown) {
    return SETTINGS.normalizeNewtabShortcutGap(value, {
      min: NEWTAB_SHORTCUT_GAP_MIN,
      max: NEWTAB_SHORTCUT_GAP_MAX,
      fallback: NEWTAB_SHORTCUT_GAP_DEFAULT
    });
  }

  function inferNewtabShortcutColumnsFromWidth(value: unknown) {
    return SETTINGS.inferNewtabShortcutColumnsFromWidth(value, {
      widthMin: NEWTAB_SHORTCUT_WIDTH_MIN,
      widthMax: NEWTAB_SHORTCUT_WIDTH_MAX,
      columnsMin: NEWTAB_SHORTCUT_COLUMNS_MIN,
      columnsMax: NEWTAB_SHORTCUT_COLUMNS_MAX
    });
  }

  function normalizeNewtabInputAutoFocusEnabled(value: unknown) {
    return SETTINGS.normalizeNewtabInputAutoFocusEnabled(value);
  }

  function cacheNewtabInputAutoFocusEnabled(value: unknown): void {
    LumnoSettingsStorage.cacheNewtabInputAutoFocusEnabled(value);
  }

  function normalizeNewtabFeedbackButtonVisible(value: unknown) {
    return SETTINGS.normalizeNewtabFeedbackButtonVisible(value);
  }

  function normalizeNewtabAppearanceButtonVisible(value: unknown) {
    return SETTINGS.normalizeNewtabAppearanceButtonVisible(value);
  }

  function updateNewtabInputAutoFocusUi(): void {
    if (pageState.wallpaperRuntime) {
      pageState.wallpaperRuntime.updateInputAutoFocusUi();
    }
  }

  function setNewtabInputAutoFocusEnabled(enabled: unknown): boolean {
    const nextValue = normalizeNewtabInputAutoFocusEnabled(enabled);
    pageState.newtabInputAutoFocusEnabled = nextValue;
    cacheNewtabInputAutoFocusEnabled(nextValue);
    updateNewtabInputAutoFocusUi();
    if (storageArea) {
      void storageArea.set({ [NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function updateNewtabShortcutPreferencesUi(): void {
    if (pageState.wallpaperRuntime) {
      pageState.wallpaperRuntime.updateShortcutsUi();
    }
  }

  function setNewtabShortcutsVisible(enabled: unknown, options?: PersistOptions): boolean {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutsVisible(enabled);
    pageState.newtabShortcutsVisible = nextValue;
    applyNewtabShortcutsVisibility();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({ preserveSearchEntryLayout: true });
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutAddVisible(enabled: unknown, options?: PersistOptions): boolean {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutAddVisible(enabled);
    pageState.newtabShortcutAddVisible = nextValue;
    renderShortcuts();
    updateNewtabShortcutPreferencesUi();
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutDockMagnificationEnabled(enabled: unknown, options?: PersistOptions): boolean {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutDockMagnificationEnabled(enabled);
    pageState.newtabShortcutDockMagnificationEnabled = nextValue;
    applyNewtabShortcutDockMagnification();
    updateNewtabShortcutPreferencesUi();
    scheduleWallpaperAdaptiveToneUpdate();
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutColumns(value: unknown, options?: PersistOptions): number {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutColumns(value);
    pageState.newtabShortcutColumns = nextValue;
    applyNewtabShortcutColumns();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutSize(value: unknown, options?: PersistOptions): number {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutSize(value);
    pageState.newtabShortcutSize = nextValue;
    applyNewtabShortcutLayoutPreferences();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function setNewtabShortcutGap(value: unknown, options?: PersistOptions): number {
    const config = options || {};
    const nextValue = normalizeNewtabShortcutGap(value);
    pageState.newtabShortcutGap = nextValue;
    applyNewtabShortcutLayoutPreferences();
    updateNewtabShortcutPreferencesUi();
    updateBookmarkSectionPosition({
      preserveSearchEntryLayout: true,
      stabilizeDockDensity: true
    });
    if (config.persist && storageArea) {
      void storageArea.set({ [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: nextValue });
    }
    return nextValue;
  }

  function loadNewtabInputAutoFocusEnabled(): Promise<boolean> {
    const area = storageArea;
    if (!area) {
      pageState.newtabInputAutoFocusEnabled = false;
      return Promise.resolve(pageState.newtabInputAutoFocusEnabled);
    }
    return new Promise((resolve) => {
      void area.get([NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY];
        pageState.newtabInputAutoFocusEnabled = normalizeNewtabInputAutoFocusEnabled(rawValue);
        cacheNewtabInputAutoFocusEnabled(pageState.newtabInputAutoFocusEnabled);
        updateNewtabInputAutoFocusUi();
        resolve(pageState.newtabInputAutoFocusEnabled);
      });
    });
  }

  const initialNewtabInputAutoFocusReadyTask = loadNewtabInputAutoFocusEnabled();

  function loadNumberShortcutInstantEnabled(): Promise<boolean> {
    const area = storageArea;
    if (!area) {
      pageState.numberShortcutInstantEnabled = false;
      return Promise.resolve(pageState.numberShortcutInstantEnabled);
    }
    return new Promise((resolve) => {
      void area.get([NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY];
        pageState.numberShortcutInstantEnabled = normalizeNumberShortcutInstantEnabled(rawValue);
        resolve(pageState.numberShortcutInstantEnabled);
      });
    });
  }

  void loadNumberShortcutInstantEnabled();

  function normalizeSimpleModeEnabled(value: unknown) {
    return SETTINGS.normalizeSimpleModeEnabled(value);
  }

  function loadSimpleModeEnabled(): Promise<boolean> {
    const area = storageArea;
    if (!area) {
      pageState.simpleModeEnabled = false;
      return Promise.resolve(pageState.simpleModeEnabled);
    }
    return new Promise((resolve) => {
      void area.get([SIMPLE_MODE_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[SIMPLE_MODE_ENABLED_STORAGE_KEY];
        pageState.simpleModeEnabled = normalizeSimpleModeEnabled(rawValue);
        resolve(pageState.simpleModeEnabled);
      });
    });
  }

  void loadSimpleModeEnabled();

  function normalizeMacosCtrlSuggestionNavigationEnabled(value: unknown) {
    return SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled(value);
  }

  function loadMacosCtrlSuggestionNavigationEnabled(): Promise<boolean> {
    const area = storageArea;
    if (!area) {
      pageState.macosCtrlSuggestionNavigationEnabled = false;
      return Promise.resolve(pageState.macosCtrlSuggestionNavigationEnabled);
    }
    return new Promise((resolve) => {
      void area.get([MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY], (result) => {
        const rawValue = result && result[MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY];
        pageState.macosCtrlSuggestionNavigationEnabled =
          normalizeMacosCtrlSuggestionNavigationEnabled(rawValue);
        resolve(pageState.macosCtrlSuggestionNavigationEnabled);
      });
    });
  }

  void loadMacosCtrlSuggestionNavigationEnabled();

  function normalizeNumberShortcutInstantEnabled(value: unknown) {
    return SETTINGS.normalizeNumberShortcutInstantEnabled(value);
  }

  function normalizeBookmarkFolderIconsVisible(value: unknown) {
    return SETTINGS.normalizeBookmarkFolderIconsVisible(value);
  }

  function normalizeZenModeEnabled(value: unknown) {
    return value === true;
  }

  function normalizeSearchResultPriority(value: unknown) {
    return SETTINGS.normalizeSearchResultPriority(value);
  }

  function normalizeOverlayTabPriorityMode(value: unknown) {
    return SETTINGS.normalizeOverlayTabPriorityMode(value);
  }

  function normalizeBookmarkCount(value: unknown) {
    return SETTINGS.normalizeBookmarkCount(value);
  }

  function getBookmarkLimit(): number {
    const normalized = normalizeBookmarkCount(pageState.currentBookmarkCount);
    if (normalized <= 0) {
      return 8;
    }
    const rows = Math.max(1, Math.round(normalized / 4));
    // Use the actual rendered column count so "show N rows" remains accurate on responsive layouts.
    const columns = Math.max(1, getBookmarkGridColumnCount());
    return rows * columns;
  }

  function normalizeBookmarkColumns(value: unknown) {
    return SETTINGS.normalizeBookmarkColumns(value);
  }

  function normalizeTabRankScoreDebugMode(value: unknown) {
    return SETTINGS.normalizeTabRankScoreDebugMode(value);
  }

  return {
    normalizeNewtabWidthMode,
    normalizeNewtabSearchWidth,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeSecondsVisible,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabTimeFont,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    inferNewtabShortcutColumnsFromWidth,
    normalizeNewtabInputAutoFocusEnabled,
    normalizeNewtabFeedbackButtonVisible,
    normalizeNewtabAppearanceButtonVisible,
    updateNewtabInputAutoFocusUi,
    setNewtabInputAutoFocusEnabled,
    updateNewtabShortcutPreferencesUi,
    setNewtabShortcutsVisible,
    setNewtabShortcutAddVisible,
    setNewtabShortcutDockMagnificationEnabled,
    setNewtabShortcutColumns,
    setNewtabShortcutSize,
    setNewtabShortcutGap,
    initialNewtabInputAutoFocusReadyTask,
    normalizeSimpleModeEnabled,
    normalizeMacosCtrlSuggestionNavigationEnabled,
    normalizeNumberShortcutInstantEnabled,
    normalizeBookmarkFolderIconsVisible,
    normalizeZenModeEnabled,
    normalizeSearchResultPriority,
    normalizeOverlayTabPriorityMode,
    normalizeBookmarkCount,
    getBookmarkLimit,
    normalizeBookmarkColumns,
    normalizeTabRankScoreDebugMode
  };
}

type PagePreferences = ReturnType<typeof createPagePreferences>;

export { createPagePreferences };
export type { PagePreferences, PagePreferencesDeps, PagePreferencesState };
