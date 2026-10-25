// Normalizing stored values for the controls: counts, columns, width and
// size modes, and clock and shortcut settings.
import type * as Settings from '../domain/settings';
import type { LayoutMutation } from './options-panel-motion';

interface NormalizersDeps {
  SETTINGS: Pick<typeof Settings,
    'normalizeBookmarkCount' | 'normalizeBookmarkColumns' | 'normalizeNewtabWidthMode' |
    'normalizeNewtabTopContentMode' |
    'normalizeNewtabTimeFontWeight' | 'normalizeNewtabShortcutsVisible' | 'normalizeNewtabShortcutAddVisible' |
    'normalizeNewtabShortcutDockMagnificationEnabled' | 'normalizeNewtabShortcutColumns' |
    'normalizeNewtabShortcutSize' | 'normalizeNewtabShortcutGap' | 'inferNewtabShortcutColumnsFromWidth'>;
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
    NEWTAB_SHORTCUT_WIDTH_MAX
  } = deps;

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

  return {
    normalizeBookmarkCount,
    normalizeRecentCount,
    normalizeBookmarkColumns,
    normalizeNewtabWidthMode,
    updateBookmarkColumnsSettingVisibility,
    normalizeNewtabTopContentMode,
    normalizeNewtabTimeFontWeight,
    normalizeNewtabShortcutsVisible,
    normalizeNewtabShortcutAddVisible,
    normalizeNewtabShortcutDockMagnificationEnabled,
    normalizeNewtabShortcutColumns,
    normalizeNewtabShortcutSize,
    normalizeNewtabShortcutGap,
    inferNewtabShortcutColumnsFromWidth
  };
}

export { createNormalizers };
export type { NormalizersDeps };
