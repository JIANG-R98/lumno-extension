// Binds every setting control to its storage key: the one-time loads and
// the setting binder entries for each section.
import type { StorageAreaLike } from '../domain/storage-port';
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { createSettingBinder } from './options-setting-bindings';
import type { ToggleSettingsEntry } from './options-toggle-settings';

type SettingBinder = ReturnType<typeof createSettingBinder>;

interface SettingBindsState {
  storageArea: BatchedStorageArea | null;
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
  settingBinder: SettingBinder;
  RECENT_COUNT_STORAGE_KEY: string;
  normalizeRecentCount(value: unknown): number;
  renderRecentCountControl(value: unknown): void;
  updateRecentModeTabsVisibility(countValue: unknown): void;
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
  TOGGLE_SETTINGS: readonly ToggleSettingsEntry[];
  toggleSettingControls: ReadonlyMap<ToggleSettingsEntry, HTMLInputElement | null>;
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
    settingBinder,
    RECENT_COUNT_STORAGE_KEY,
    normalizeRecentCount,
    renderRecentCountControl,
    updateRecentModeTabsVisibility,
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
    TOGGLE_SETTINGS,
    toggleSettingControls
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
  TOGGLE_SETTINGS.forEach((entry) => {
    settingBinder.bindToggle({ ...entry, input: toggleSettingControls.get(entry) || null });
  });
}

export { createSettingBinds };
export type { SettingBindsDeps, SettingBindsState };
