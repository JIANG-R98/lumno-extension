// Binds every setting control to its storage key: the one-time loads and
// the setting binder entries for each section, including the daily quote.
import * as CUSTOM_QUOTES from '../domain/custom-quotes';
import type { SearchSourceType } from '../domain/search/types';
import type * as Settings from '../domain/settings';
import type {
  NewtabGlassStyle,
  NewtabTopContentMode,
  NewtabWidthMode,
  OverlayEnterAnimation,
  OverlaySizeMode,
  SearchResultPriority
} from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import { isHtmlTag } from '../shared/dom-guards';
import type { BatchedStorageArea } from '../platform/settings-storage';
import * as LumnoOptionsDailyQuote from './options-daily-quote';
import type { LayoutMutation } from './options-panel-motion';
import type { SelectControlRecord } from './options-select-controls';
import type { createSettingBinder, StorageChangeRegistry } from './options-setting-bindings';
import type { ToggleSettingsEntry } from './options-toggle-settings';
import type { GetMessage } from './options-types';
import type { SegmentedControlController } from './react/segmented-control';
import type { createSettingsControlsApi, ToggleControlController } from './react/settings-controls';

type SettingBinder = ReturnType<typeof createSettingBinder>;

interface SettingBindsState {
  storageArea: BatchedStorageArea | null;
  dailyQuoteSettings: ReturnType<typeof LumnoOptionsDailyQuote.createDailyQuoteSettings>;
  currentOverlayFontFamily: string;
  currentOverlayFontFallback: string;
  currentOverlayFontLabels: Record<string, string>;
  currentNewtabGlassStyle: NewtabGlassStyle;
  currentNewtabTimeFont: string;
  currentNewtabTimeFontWeight: number;
}

interface SettingBindsDeps {
  LANGUAGE_STORAGE_KEY: string;
  normalizeLanguageMode(mode: unknown): string;
  localStorageArea: StorageAreaLike | null;
  applyLanguageMode(mode: string, options?: { persist?: boolean }): unknown;
  getActivePrimaryAreaName(): string;
  NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_SIZE_STORAGE_KEY: string;
  NEWTAB_SHORTCUT_GAP_STORAGE_KEY: string;
  normalizeNewtabShortcutsVisible(value: unknown): boolean;
  normalizeNewtabShortcutAddVisible(value: unknown): boolean;
  normalizeNewtabShortcutDockMagnificationEnabled(value: unknown): boolean;
  inferNewtabShortcutColumnsFromWidth(value: unknown): number;
  normalizeNewtabShortcutColumns(value: unknown): number;
  normalizeNewtabShortcutSize(value: unknown): number;
  normalizeNewtabShortcutGap(value: unknown): number;
  setOptionsToggleState(input: HTMLInputElement | null, checked: boolean, disabled?: boolean): void;
  newtabShortcutsToggle: HTMLInputElement | null;
  newtabShortcutAddToggle: HTMLInputElement | null;
  newtabShortcutDockMagnificationToggle: HTMLInputElement | null;
  renderNewtabShortcutColumnsControl(value: unknown, disabled?: boolean): void;
  renderNewtabShortcutSizeControl(value: unknown, disabled?: boolean): void;
  renderNewtabShortcutGapControl(value: unknown, disabled?: boolean): void;
  syncNewtabShortcutSubcontrolAvailability(): void;
  AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY: string;
  AGGREGATE_SEARCH_STORAGE_KEY: string;
  deriveLegacyAggregateSearchAutoGroupEnabled(value: unknown): boolean;
  normalizeAggregateSearchAutoGroupEnabled(value: unknown): boolean;
  aggregateSearchAutoGroupToggle: HTMLInputElement | null;
  refreshCustomSelects(): void;
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY: string;
  normalizeSearchResultSourceTypes(value: unknown): SearchSourceType[];
  setSearchResultSourceTypeState(value: unknown): void;
  storageChanges: Pick<StorageChangeRegistry, 'on'>;
  settingBinder: SettingBinder;
  RECENT_COUNT_STORAGE_KEY: string;
  normalizeRecentCount(value: unknown): number;
  renderRecentCountControl(value: unknown): void;
  updateRecentModeTabsVisibility(countValue: unknown): void;
  NEWTAB_WIDTH_MODE_STORAGE_KEY: string;
  normalizeNewtabWidthMode(value: unknown): NewtabWidthMode;
  newtabWidthSelect: HTMLSelectElement | null;
  setNewtabWidthTabState(mode: unknown): void;
  OVERLAY_SIZE_MODE_STORAGE_KEY: string;
  normalizeOverlaySizeMode(value: unknown): OverlaySizeMode;
  setOverlaySizeTabState(mode: unknown): void;
  OVERLAY_ENTER_ANIMATION_STORAGE_KEY: string;
  normalizeOverlayEnterAnimation(value: unknown): OverlayEnterAnimation;
  setOverlayEnterAnimationTabState(mode: unknown): void;
  localSettingBinder: SettingBinder;
  OVERLAY_FONT_FAMILY_STORAGE_KEY: string;
  SETTINGS: typeof Settings;
  overlayFontSelect: HTMLSelectElement | null;
  OVERLAY_FONT_LABELS_STORAGE_KEY: string;
  overlayFontFallbackSelect: HTMLSelectElement | null;
  OVERLAY_FONT_FALLBACK_STORAGE_KEY: string;
  SEARCH_RESULT_PRIORITY_STORAGE_KEY: string;
  normalizeSearchResultPriority(value: unknown): SearchResultPriority;
  searchResultPrioritySelect: HTMLSelectElement | null;
  setSearchResultPriorityTabState(priority: unknown): void;
  newtabGlassStyleSelect: HTMLSelectElement | null;
  syncNewtabGlassThemeVisibility(): void;
  setNewtabGlassThemeTabState(theme: unknown): void;
  getMessage: GetMessage;
  showToast(message: string, isError?: boolean): void;
  createOptionsSegmentedControlController(
    host: HTMLElement | null,
    kind: string,
    onSelect: (value: string) => void
  ): SegmentedControlController;
  optionsSettingsControlsApi: Pick<ReturnType<typeof createSettingsControlsApi>, 'createRangeSliderControlController'>;
  registerOptionsToggleControl(input: HTMLInputElement | null, kind: string): ToggleControlController | null;
  setConditionalSettingsElementVisibility(element: HTMLElement | null, visible: boolean): boolean;
  animateOptionsPanelHeight(mutateLayout: LayoutMutation): boolean;
  SEARCH_RESULT_TAB_POSITION_STORAGE_KEY: string;
  searchResultTabPositionSelect: HTMLSelectElement | null;
  SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY: string;
  normalizeSearchResultDisplayLimit(value: unknown): number;
  renderSearchResultDisplayLimitControl(value: unknown): void;
  RECENT_MODE_STORAGE_KEY: string;
  recentModeSelect: HTMLSelectElement | null;
  setRecentModeTabState(mode: unknown): void;
  BOOKMARK_COUNT_STORAGE_KEY: string;
  normalizeBookmarkCount(value: unknown): number;
  renderBookmarkRowsControl(value: unknown): void;
  updateBookmarkColumnsSettingVisibility(countValue: unknown): void;
  BOOKMARK_COLUMNS_STORAGE_KEY: string;
  normalizeBookmarkColumns(value: unknown): number;
  renderBookmarkColumnsControl(value: unknown): void;
  NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: string;
  normalizeNewtabTopContentMode(value: unknown): NewtabTopContentMode;
  setNewtabTopContentTabState(mode: unknown): void;
  newtabTimeFontSelect: HTMLSelectElement | null;
  renderNewtabTimeFontWeightControl(value: unknown): void;
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY: string;
  normalizeNewtabTimeFontWeight(value: unknown): number;
  renderNewtabTimeFontSizeControl(value: unknown): void;
  renderNewtabTimeOpacityControl(value: unknown): void;
  setNewtabTimeInkTabState(ink: unknown): void;
  NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY: string;
  setNewtabOpenInNewTabState(value: unknown): void;
  TOGGLE_SETTINGS: readonly ToggleSettingsEntry[];
  toggleSettingControls: ReadonlyMap<ToggleSettingsEntry, HTMLInputElement | HTMLSelectElement | null>;
  RESTRICTED_ACTION_STORAGE_KEY: string;
  restrictedActionSelect: HTMLSelectElement | null;
  setRestrictedActionTabState(action: unknown): void;
  ensureOverlayFontOption(select: HTMLSelectElement | null, family: string): void;
  refreshOptionsSelectItems(select: HTMLSelectElement): void;
  renderOverlayFontMissingNotices(): void;
  registerOptionsSelectControl(select: HTMLSelectElement | null, kind: string): SelectControlRecord | null;
  renderOptionsSelectControl(select: HTMLSelectElement): void;
  setOptionsSelectState(select: HTMLSelectElement | null, value: unknown): void;
  optionsState: SettingBindsState;
}

function createSettingBinds(deps: SettingBindsDeps): void {
  const {
    LANGUAGE_STORAGE_KEY,
    normalizeLanguageMode,
    localStorageArea,
    applyLanguageMode,
    getActivePrimaryAreaName,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    inferNewtabShortcutColumnsFromWidth,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    setOptionsToggleState,
    newtabShortcutsToggle,
    newtabShortcutAddToggle,
    newtabShortcutDockMagnificationToggle,
    renderNewtabShortcutColumnsControl,
    renderNewtabShortcutSizeControl,
    renderNewtabShortcutGapControl,
    syncNewtabShortcutSubcontrolAvailability,
    AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
    AGGREGATE_SEARCH_STORAGE_KEY,
    deriveLegacyAggregateSearchAutoGroupEnabled,
    normalizeAggregateSearchAutoGroupEnabled,
    aggregateSearchAutoGroupToggle,
    refreshCustomSelects,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY,
    normalizeSearchResultSourceTypes,
    setSearchResultSourceTypeState,
    storageChanges,
    settingBinder,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    renderRecentCountControl,
    updateRecentModeTabsVisibility,
    NEWTAB_WIDTH_MODE_STORAGE_KEY,
    normalizeNewtabWidthMode,
    newtabWidthSelect,
    setNewtabWidthTabState,
    OVERLAY_SIZE_MODE_STORAGE_KEY,
    normalizeOverlaySizeMode,
    setOverlaySizeTabState,
    OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    normalizeOverlayEnterAnimation,
    setOverlayEnterAnimationTabState,
    localSettingBinder,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    SETTINGS,
    overlayFontSelect,
    OVERLAY_FONT_LABELS_STORAGE_KEY,
    overlayFontFallbackSelect,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalizeSearchResultPriority,
    searchResultPrioritySelect,
    setSearchResultPriorityTabState,
    newtabGlassStyleSelect,
    syncNewtabGlassThemeVisibility,
    setNewtabGlassThemeTabState,
    getMessage,
    showToast,
    createOptionsSegmentedControlController,
    optionsSettingsControlsApi,
    registerOptionsToggleControl,
    setConditionalSettingsElementVisibility,
    animateOptionsPanelHeight,
    SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    searchResultTabPositionSelect,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalizeSearchResultDisplayLimit,
    renderSearchResultDisplayLimitControl,
    RECENT_MODE_STORAGE_KEY,
    recentModeSelect,
    setRecentModeTabState,
    BOOKMARK_COUNT_STORAGE_KEY,
    normalizeBookmarkCount,
    renderBookmarkRowsControl,
    updateBookmarkColumnsSettingVisibility,
    BOOKMARK_COLUMNS_STORAGE_KEY,
    normalizeBookmarkColumns,
    renderBookmarkColumnsControl,
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalizeNewtabTopContentMode,
    setNewtabTopContentTabState,
    newtabTimeFontSelect,
    renderNewtabTimeFontWeightControl,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    normalizeNewtabTimeFontWeight,
    renderNewtabTimeFontSizeControl,
    renderNewtabTimeOpacityControl,
    setNewtabTimeInkTabState,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    setNewtabOpenInNewTabState,
    TOGGLE_SETTINGS,
    toggleSettingControls,
    RESTRICTED_ACTION_STORAGE_KEY,
    restrictedActionSelect,
    setRestrictedActionTabState,
    ensureOverlayFontOption,
    refreshOptionsSelectItems,
    renderOverlayFontMissingNotices,
    registerOptionsSelectControl,
    renderOptionsSelectControl,
    setOptionsSelectState
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  // Keeps a copy of the language in chrome.storage.local and moves a value
  // found only there into the primary area. With nothing stored yet the page
  // shows the system language without writing it, so a choice another page is
  // still saving is not overwritten; the language change handler applies that
  // choice once it lands.
  function loadLanguageSetting(): void {
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.get([LANGUAGE_STORAGE_KEY], (result) => {
      if (result && Object.prototype.hasOwnProperty.call(result, LANGUAGE_STORAGE_KEY)) {
        const storedRaw = result[LANGUAGE_STORAGE_KEY];
        const stored = normalizeLanguageMode(storedRaw);
        if (storedRaw !== stored) {
          storageArea.set({ [LANGUAGE_STORAGE_KEY]: stored });
        }
        if (localStorageArea) {
          localStorageArea.set({ [LANGUAGE_STORAGE_KEY]: stored });
        }
        applyLanguageMode(stored);
        return;
      }
      if (getActivePrimaryAreaName() !== 'sync' || !localStorageArea) {
        applyLanguageMode('system');
        return;
      }
      localStorageArea.get([LANGUAGE_STORAGE_KEY], (localResult) => {
        if (!localResult || !Object.prototype.hasOwnProperty.call(localResult, LANGUAGE_STORAGE_KEY)) {
          applyLanguageMode('system');
          return;
        }
        const localMode = normalizeLanguageMode(localResult[LANGUAGE_STORAGE_KEY]);
        localStorageArea.set({ [LANGUAGE_STORAGE_KEY]: localMode });
        storageArea.set({ [LANGUAGE_STORAGE_KEY]: localMode });
        applyLanguageMode(localMode);
      });
    });
  }

  // The New Tab shortcut switches and sliders are read together because the
  // column count falls back to one inferred from the older width setting.
  function loadNewtabShortcutSettings(): void {
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.get([
      NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
      NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
      NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
      NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY,
      NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
      NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
      NEWTAB_SHORTCUT_GAP_STORAGE_KEY
    ], (items) => {
      const result = items || {};
      const rawColumns = result[NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY];
      const visible = normalizeNewtabShortcutsVisible(result[NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]);
      const addVisible = normalizeNewtabShortcutAddVisible(result[NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]);
      const dockMagnification = normalizeNewtabShortcutDockMagnificationEnabled(
        result[NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]
      );
      const columns = rawColumns === undefined
        ? inferNewtabShortcutColumnsFromWidth(result[NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY])
        : normalizeNewtabShortcutColumns(rawColumns);
      const size = normalizeNewtabShortcutSize(result[NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]);
      const gap = normalizeNewtabShortcutGap(result[NEWTAB_SHORTCUT_GAP_STORAGE_KEY]);
      const values: Record<string, unknown> = {
        [NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY]: visible,
        [NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY]: addVisible,
        [NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY]: dockMagnification,
        [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY]: columns,
        [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY]: size,
        [NEWTAB_SHORTCUT_GAP_STORAGE_KEY]: gap
      };
      setOptionsToggleState(newtabShortcutsToggle, visible);
      setOptionsToggleState(newtabShortcutAddToggle, addVisible);
      setOptionsToggleState(newtabShortcutDockMagnificationToggle, dockMagnification);
      renderNewtabShortcutColumnsControl(columns);
      renderNewtabShortcutSizeControl(size);
      renderNewtabShortcutGapControl(gap);
      syncNewtabShortcutSubcontrolAvailability();
      const repairs: Record<string, unknown> = {};
      Object.keys(values).forEach((key) => {
        if (result[key] !== values[key]) {
          repairs[key] = values[key];
        }
      });
      if (Object.keys(repairs).length > 0) {
        storageArea.set(repairs);
      }
    });
  }

  // Older installs have aggregate searches but no auto-group choice; it is
  // derived from those searches the first time.
  function loadAggregateSearchAutoGroupSetting(): void {
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.get([
      AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY,
      AGGREGATE_SEARCH_STORAGE_KEY
    ], (items) => {
      const result = items || {};
      const rawValue = result[AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY];
      const stored = typeof rawValue === 'undefined'
        ? deriveLegacyAggregateSearchAutoGroupEnabled(result[AGGREGATE_SEARCH_STORAGE_KEY])
        : normalizeAggregateSearchAutoGroupEnabled(rawValue);
      setOptionsToggleState(aggregateSearchAutoGroupToggle, stored);
      if (rawValue !== stored) {
        storageArea.set({ [AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY]: stored });
      }
      refreshCustomSelects();
    });
  }

  function loadSearchResultSourceTypes(): void {
    const storageArea = optionsState.storageArea;
    if (!storageArea) {
      return;
    }
    storageArea.get([SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY], (items) => {
      const stored = items ? items[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY] : undefined;
      const sourceTypes = normalizeSearchResultSourceTypes(stored);
      setSearchResultSourceTypeState(sourceTypes);
      if (!Array.isArray(stored) || JSON.stringify(stored) !== JSON.stringify(sourceTypes)) {
        storageArea.set({ [SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]: sourceTypes });
      }
    });
  }
  storageChanges.on(SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY, (changes) => {
    setSearchResultSourceTypeState(changes[SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY].newValue);
  });

  loadLanguageSetting();
  settingBinder.bindSetting({
    key: RECENT_COUNT_STORAGE_KEY,
    normalize: normalizeRecentCount,
    apply(count) {
      renderRecentCountControl(count);
      updateRecentModeTabsVisibility(count);
    },
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: NEWTAB_WIDTH_MODE_STORAGE_KEY,
    normalize: normalizeNewtabWidthMode,
    apply(mode) {
      if (newtabWidthSelect) {
        newtabWidthSelect.value = mode;
      }
      setNewtabWidthTabState(mode);
    },
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: OVERLAY_SIZE_MODE_STORAGE_KEY,
    normalize: normalizeOverlaySizeMode,
    apply: setOverlaySizeTabState,
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
    normalize: normalizeOverlayEnterAnimation,
    apply: setOverlayEnterAnimationTabState,
    repairOnChange: false
  });
  localSettingBinder.bindSetting({
    key: OVERLAY_FONT_FAMILY_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayFontFamily,
    apply(family) {
      optionsState.currentOverlayFontFamily = family;
      if (!overlayFontSelect) {
        return;
      }
      ensureOverlayFontOption(overlayFontSelect, family);
      overlayFontSelect.value = family;
      refreshOptionsSelectItems(overlayFontSelect);
      renderOverlayFontMissingNotices();
    },
    repairOnChange: false,
    refreshSelects: true
  });
  localSettingBinder.bindSetting({
    key: OVERLAY_FONT_LABELS_STORAGE_KEY,
    // Families may load after the names, so nothing is pruned on read.
    normalize: (value) => SETTINGS.normalizeOverlayFontLabels(value),
    apply(labels) {
      optionsState.currentOverlayFontLabels = labels;
      const fontSelects: Array<[HTMLSelectElement | null, string]> = [
        [overlayFontSelect, optionsState.currentOverlayFontFamily],
        [overlayFontFallbackSelect, optionsState.currentOverlayFontFallback]
      ];
      fontSelects
        .forEach(([select, family]) => {
          if (select && family) {
            ensureOverlayFontOption(select, family);
            refreshOptionsSelectItems(select);
          }
        });
      renderOverlayFontMissingNotices();
    },
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  });
  localSettingBinder.bindSetting({
    key: OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayFontFamily,
    apply(family) {
      optionsState.currentOverlayFontFallback = family;
      if (!overlayFontFallbackSelect) {
        return;
      }
      ensureOverlayFontOption(overlayFontFallbackSelect, family);
      overlayFontFallbackSelect.value = family;
      refreshOptionsSelectItems(overlayFontFallbackSelect);
      renderOverlayFontMissingNotices();
    },
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: SEARCH_RESULT_PRIORITY_STORAGE_KEY,
    normalize: normalizeSearchResultPriority,
    apply(priority) {
      if (searchResultPrioritySelect) {
        searchResultPrioritySelect.value = priority;
      }
      setSearchResultPriorityTabState(priority);
    },
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_GLASS_STYLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabGlassStyle,
    apply(style) {
      if (newtabGlassStyleSelect) {
        newtabGlassStyleSelect.value = style;
      }
      optionsState.currentNewtabGlassStyle = style;
      syncNewtabGlassThemeVisibility();
    },
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_GLASS_THEME_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabGlassTheme,
    apply: setNewtabGlassThemeTabState,
    repairOnLoad: false,
    repairOnChange: false
  });
  // The daily quote mirrors the quote section of New Tab's appearance panel.
  optionsState.dailyQuoteSettings = LumnoOptionsDailyQuote.createDailyQuoteSettings({
    settings: SETTINGS,
    customQuotes: CUSTOM_QUOTES,
    getMessage,
    showToast: (message, isError) => showToast(message, isError),
    syncArea: optionsState.storageArea,
    localArea: localStorageArea,
    createSegmented: createOptionsSegmentedControlController,
    createRangeSlider: (host, controllerOptions) =>
      optionsSettingsControlsApi.createRangeSliderControlController(host, controllerOptions),
    registerToggle: registerOptionsToggleControl,
    setToggleState: setOptionsToggleState,
    registerSelect: (select: HTMLSelectElement, kind: string) => {
      const record = registerOptionsSelectControl(select, kind);
      if (record) {
        renderOptionsSelectControl(select);
      }
      return record;
    },
    setSelectState: setOptionsSelectState,
    setRowVisible: setConditionalSettingsElementVisibility,
    animateHeight: animateOptionsPanelHeight
  });
  const dailyQuoteSettings = optionsState.dailyQuoteSettings;
  if (dailyQuoteSettings) {
    settingBinder.bindSetting({
      key: SETTINGS.NEWTAB_QUOTE_PREFS_STORAGE_KEY,
      normalize: SETTINGS.normalizeNewtabQuotePrefs,
      apply: dailyQuoteSettings.applyPrefs,
      repairOnLoad: false,
      repairOnChange: false,
      refreshSelects: true
    });
    storageChanges.on(CUSTOM_QUOTES.KEY, (changes) => {
      dailyQuoteSettings.applyLibrary(changes[CUSTOM_QUOTES.KEY].newValue);
    }, { area: 'local' });
    dailyQuoteSettings.load();
  }
  settingBinder.bindSetting({
    key: SEARCH_RESULT_TAB_POSITION_STORAGE_KEY,
    normalize: SETTINGS.normalizeSearchResultTabPosition,
    apply(position) {
      if (searchResultTabPositionSelect) {
        searchResultTabPositionSelect.value = position;
      }
    },
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  });
  loadSearchResultSourceTypes();
  settingBinder.bindSetting({
    key: SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
    normalize: normalizeSearchResultDisplayLimit,
    apply: renderSearchResultDisplayLimitControl
  });
  settingBinder.bindSetting({
    key: RECENT_MODE_STORAGE_KEY,
    // A missing or unknown mode starts as "most visited"; a later change to
    // anything but "most" shows "latest", as the switch only offers the two.
    normalize: (value): 'latest' | 'most' => (value === 'latest' || value === 'most' ? value : 'most'),
    normalizeChange: (value): 'latest' | 'most' => (value === 'most' ? 'most' : 'latest'),
    apply(mode) {
      if (recentModeSelect) {
        recentModeSelect.value = mode;
      }
      setRecentModeTabState(mode);
    },
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: BOOKMARK_COUNT_STORAGE_KEY,
    normalize: normalizeBookmarkCount,
    apply(count) {
      renderBookmarkRowsControl(count);
      updateBookmarkColumnsSettingVisibility(count);
    },
    repairOnChange: false
  });
  settingBinder.bindSetting({
    key: BOOKMARK_COLUMNS_STORAGE_KEY,
    normalize: normalizeBookmarkColumns,
    apply: renderBookmarkColumnsControl,
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY,
    normalize: normalizeNewtabTopContentMode,
    apply: setNewtabTopContentTabState,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_TIME_FONT_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabTimeFont,
    apply(font) {
      optionsState.currentNewtabTimeFont = font;
      if (newtabTimeFontSelect) {
        newtabTimeFontSelect.value = font;
      }
      renderNewtabTimeFontWeightControl(optionsState.currentNewtabTimeFontWeight);
    },
    repairOnLoad: false,
    repairOnChange: false,
    refreshSelects: true
  });
  settingBinder.bindSetting({
    key: NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    normalize: normalizeNewtabTimeFontWeight,
    apply: renderNewtabTimeFontWeightControl
  });
  // Unset stays unset, so opening Options does not write the defaults.
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_TIME_FONT_SIZE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabTimeFontSize,
    apply: renderNewtabTimeFontSizeControl,
    repairOnLoad: false,
    repairOnChange: false
  });
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_TIME_OPACITY_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabTimeOpacity,
    apply: renderNewtabTimeOpacityControl,
    repairOnLoad: false,
    repairOnChange: false
  });
  settingBinder.bindSetting({
    key: SETTINGS.NEWTAB_TIME_INK_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabTimeInk,
    apply: setNewtabTimeInkTabState,
    repairOnLoad: false,
    repairOnChange: false
  });
  const shortcutSliders: Array<[string, (value: unknown) => number, (value: unknown, disabled?: boolean) => void]> = [
    [NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY, normalizeNewtabShortcutColumns, renderNewtabShortcutColumnsControl],
    [NEWTAB_SHORTCUT_SIZE_STORAGE_KEY, normalizeNewtabShortcutSize, renderNewtabShortcutSizeControl],
    [NEWTAB_SHORTCUT_GAP_STORAGE_KEY, normalizeNewtabShortcutGap, renderNewtabShortcutGapControl]
  ];
  shortcutSliders.forEach(([key, normalize, render]) => {
    settingBinder.bindSetting({
      key,
      normalize,
      apply(value) {
        render(value, Boolean(newtabShortcutsToggle && !newtabShortcutsToggle.checked));
      },
      load: false
    });
  });
  loadNewtabShortcutSettings();
  settingBinder.bindSetting({
    key: NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabOpenInNewTab,
    apply: setNewtabOpenInNewTabState,
    repairOnLoad: false,
    repairOnChange: false
  });
  TOGGLE_SETTINGS.forEach((entry) => {
    const control = toggleSettingControls.get(entry) || null;
    if (entry.control === 'select') {
      settingBinder.bindSelect({ ...entry, input: isHtmlTag(control, 'select') ? control : null });
    } else {
      settingBinder.bindToggle({ ...entry, input: isHtmlTag(control, 'input') ? control : null });
    }
  });
  loadAggregateSearchAutoGroupSetting();
  settingBinder.bindSetting({
    key: RESTRICTED_ACTION_STORAGE_KEY,
    // "lumno" is the old name of the default action.
    normalize: (value): 'none' | 'default' => (value === 'none' ? 'none' : 'default'),
    apply(action) {
      if (restrictedActionSelect) {
        restrictedActionSelect.value = action;
      }
      setRestrictedActionTabState(action);
    },
    refreshSelects: true
  });
}

export { createSettingBinds };
export type { SettingBindsDeps, SettingBindsState };
