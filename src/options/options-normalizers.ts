// Normalizing stored values for the controls: counts, columns, width and
// size modes, clock and shortcut settings, result priority, limit and
// source types.
import type { SearchSourceType } from '../domain/search/types';
import type * as Settings from '../domain/settings';
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { LayoutMutation } from './options-panel-motion';

interface NormalizersState {
  storageArea: BatchedStorageArea | null;
}

interface NormalizersDeps {
  SETTINGS: Pick<typeof Settings,
    'normalizeBookmarkCount' | 'normalizeBookmarkColumns' | 'normalizeNewtabWidthMode' |
    'normalizeOverlaySizeMode' | 'normalizeOverlayEnterAnimation' | 'normalizeNewtabTopContentMode' |
    'normalizeNewtabTimeFontWeight' | 'normalizeNewtabShortcutsVisible' | 'normalizeNewtabShortcutAddVisible' |
    'normalizeNewtabShortcutDockMagnificationEnabled' | 'normalizeNewtabShortcutColumns' |
    'normalizeNewtabShortcutSize' | 'normalizeNewtabShortcutGap' | 'inferNewtabShortcutColumnsFromWidth' |
    'normalizeSearchResultPriority' |
    'normalizeSearchResultDisplayLimit' | 'normalizeSearchResultSourceType' | 'normalizeSearchResultSourceTypes'>;
  bookmarkColumnsSettingRow: HTMLElement | null;
  bookmarkFolderIconsVisibleRow: HTMLElement | null;
  animateOptionsPanelHeight(mutateLayout: LayoutMutation): boolean;
  setConditionalSettingsElementVisibility(element: HTMLElement | null, visible: boolean): boolean;
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
  // The source type checkboxes, one per data-search-result-source-type.
  searchResultSourceTypeInputs: HTMLInputElement[];
  renderSearchResultSourceTypeControl(types: SearchSourceType[]): void;
  SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY: string;
  optionsState: NormalizersState;
}

function createNormalizers(deps: NormalizersDeps) {
  const {
    SETTINGS,
    bookmarkColumnsSettingRow,
    animateOptionsPanelHeight,
    setConditionalSettingsElementVisibility,
    bookmarkFolderIconsVisibleRow,
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
    searchResultSourceTypeInputs,
    renderSearchResultSourceTypeControl,
    SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  function normalizeBookmarkCount(value: unknown) {
    return SETTINGS.normalizeBookmarkCount(value);
  }

  function normalizeRecentCount(value: unknown): number {
    const parsed = Number.parseInt(String(value), 10);
    if (parsed === 0 || parsed === 4 || parsed === 8) {
      return parsed;
    }
    return 4;
  }

  function normalizeBookmarkColumns(value: unknown) {
    return SETTINGS.normalizeBookmarkColumns(value);
  }

  function normalizeNewtabWidthMode(value: unknown) {
    return SETTINGS.normalizeNewtabWidthMode(value);
  }

  function normalizeOverlaySizeMode(value: unknown) {
    return SETTINGS.normalizeOverlaySizeMode(value);
  }

  function normalizeOverlayEnterAnimation(value: unknown) {
    return SETTINGS.normalizeOverlayEnterAnimation(value);
  }

  function updateBookmarkColumnsSettingVisibility(countValue: unknown): void {
    if (!bookmarkColumnsSettingRow) {
      return;
    }
    const parsed = Number.parseInt(String(countValue), 10);
    const shouldHide = Number.isFinite(parsed) ? parsed <= 0 : false;
    animateOptionsPanelHeight(() => {
      const columnsChanged = setConditionalSettingsElementVisibility(bookmarkColumnsSettingRow, !shouldHide);
      const folderIconsChanged = setConditionalSettingsElementVisibility(bookmarkFolderIconsVisibleRow, !shouldHide);
      return columnsChanged || folderIconsChanged;
    });
  }

  function normalizeNewtabTopContentMode(value: unknown) {
    return SETTINGS.normalizeNewtabTopContentMode(value);
  }

  function normalizeNewtabTimeFontWeight(value: unknown) {
    return SETTINGS.normalizeNewtabTimeFontWeight(value);
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

  function normalizeSearchResultPriority(value: unknown) {
    return SETTINGS.normalizeSearchResultPriority(value);
  }

  function normalizeSearchResultDisplayLimit(value: unknown) {
    return SETTINGS.normalizeSearchResultDisplayLimit(value);
  }

  function normalizeSearchResultSourceTypes(value: unknown) {
    return SETTINGS.normalizeSearchResultSourceTypes(value);
  }

  // The checked source types, in the order of their checkboxes.
  function collectCheckedSearchResultSourceTypes(): SearchSourceType[] {
    const checked: SearchSourceType[] = [];
    searchResultSourceTypeInputs.forEach((input) => {
      const type = input.checked
        ? SETTINGS.normalizeSearchResultSourceType(input.getAttribute('data-search-result-source-type'))
        : '';
      if (type) {
        checked.push(type);
      }
    });
    return checked;
  }

  function setSearchResultSourceTypeState(value: unknown): void {
    const normalized = normalizeSearchResultSourceTypes(value);
    const selected = new Set<string>(normalized);
    searchResultSourceTypeInputs.forEach((input) => {
      const type = input.getAttribute('data-search-result-source-type');
      input.checked = type !== null && selected.has(type);
    });
    renderSearchResultSourceTypeControl(normalized);
  }

  function persistSearchResultSourceTypes(value: unknown): void {
    const normalized = normalizeSearchResultSourceTypes(value);
    setSearchResultSourceTypeState(normalized);
    if (!optionsState.storageArea) {
      return;
    }
    optionsState.storageArea.set({ [SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY]: normalized });
  }

  return {
    normalizeBookmarkCount,
    normalizeRecentCount,
    normalizeBookmarkColumns,
    normalizeNewtabWidthMode,
    normalizeOverlaySizeMode,
    normalizeOverlayEnterAnimation,
    updateBookmarkColumnsSettingVisibility,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    inferNewtabShortcutColumnsFromWidth,
    normalizeSearchResultPriority,
    normalizeSearchResultDisplayLimit,
    normalizeSearchResultSourceTypes,
    collectCheckedSearchResultSourceTypes,
    setSearchResultSourceTypeState,
    persistSearchResultSourceTypes
  };
}

export { createNormalizers };
export type { NormalizersDeps, NormalizersState };
