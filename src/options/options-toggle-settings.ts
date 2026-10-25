// The Options switches that each store one value under one key. The page binds every entry the same way: read and normalize at
// startup, follow storage changes, persist the control's own changes, and
// write the normalized value back when the stored one was missing or
// invalid. Entries are bound in this order, which is also the order their
// startup reads resolve in.
//
import type * as Settings from '../domain/settings';

interface StoredSettingEntry {
  // The control's element id.
  inputId: string;
  key: string;
  // Refresh the custom selects after applying.
  refreshSelects?: boolean;
  // False when a section reads the key with related keys.
  load?: boolean;
  // See createSettingBinder.
  repairOnLoad?: boolean;
  repairOnChange?: boolean;
}

interface ToggleSettingEntry extends StoredSettingEntry {
  // The React toggle kind it renders as; none for a plain one.
  kind?: string;
  normalize(raw: unknown): boolean;
  normalizeInput?(raw: unknown): boolean;
  // A page function to run after applying a value (from hooks).
  afterApply?(value: boolean): void;
}

type ToggleSettingsEntry = ToggleSettingEntry;

// Page functions some switches run after a value is applied; tests may
// leave them out.
interface ToggleSettingHooks {
  newtabShortcutSubcontrols?(): void;
}

function getToggleSettings(settings: typeof Settings, hooks?: ToggleSettingHooks): readonly ToggleSettingsEntry[] {
  const S = settings;
  const page = hooks || {};
  const entries: ToggleSettingsEntry[] = [
    {
      inputId: '_x_extension_overlay_page_theme_adaptation_toggle_2026_unique_',
      key: S.OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
      normalize: S.normalizeOverlayPageThemeAdaptationEnabled
    },
    {
      inputId: '_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_',
      kind: 'overlay-open-tabs-default-visible',
      key: S.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeOverlayOpenTabsDefaultVisible
    },
    {
      inputId: '_x_extension_bookmark_folder_icons_visible_toggle_2026_unique_',
      kind: 'bookmark-folder-icons-visible',
      key: S.BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeBookmarkFolderIconsVisible
    },
    {
      // Quick switching is always on; the stored value is repaired to true
      // after a stray change, so the switch writes what it shows.
      inputId: '_x_extension_overlay_tab_quick_switch_2024_unique_',
      kind: 'overlay-tab-quick-switch',
      key: S.OVERLAY_TAB_PRIORITY_STORAGE_KEY,
      normalize: () => true,
      normalizeInput: Boolean,
      refreshSelects: true
    },
    {
      inputId: '_x_extension_newtab_time_seconds_toggle_2026_unique_',
      kind: 'newtab-time-seconds',
      key: S.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeNewtabTimeSecondsVisible
    },
    {
      inputId: '_x_extension_newtab_time_12_hour_toggle_2026_unique_',
      kind: 'newtab-time-12-hour',
      key: S.NEWTAB_TIME_12_HOUR_STORAGE_KEY,
      normalize: S.normalizeNewtabTime12Hour
    },
    {
      inputId: '_x_extension_newtab_input_auto_focus_toggle_2026_unique_',
      kind: 'newtab-input-auto-focus',
      key: S.NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
      normalize: S.normalizeNewtabInputAutoFocusEnabled
    },
    {
      inputId: '_x_extension_newtab_shortcuts_toggle_2026_unique_',
      kind: 'newtab-shortcuts',
      key: S.NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeNewtabShortcutsVisible,
      afterApply: page.newtabShortcutSubcontrols,
      load: false
    },
    {
      inputId: '_x_extension_newtab_shortcut_add_toggle_2026_unique_',
      kind: 'newtab-shortcut-add',
      key: S.NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeNewtabShortcutAddVisible,
      load: false
    },
    {
      inputId: '_x_extension_newtab_shortcut_dock_magnification_toggle_2026_unique_',
      kind: 'newtab-shortcut-dock-magnification',
      key: S.NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
      normalize: S.normalizeNewtabShortcutDockMagnificationEnabled,
      load: false
    },
    {
      inputId: '_x_extension_newtab_feedback_button_visible_toggle_2026_unique_',
      kind: 'newtab-feedback-button-visible',
      key: S.NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeNewtabFeedbackButtonVisible
    },
    {
      inputId: '_x_extension_newtab_appearance_button_visible_toggle_2026_unique_',
      kind: 'newtab-appearance-button-visible',
      key: S.NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
      normalize: S.normalizeNewtabAppearanceButtonVisible
    },
    {
      inputId: '_x_extension_update_notice_toggle_2026_unique_',
      kind: 'update-notice',
      key: S.UPDATE_NOTICE_ENABLED_STORAGE_KEY,
      normalize: S.normalizeUpdateNoticeEnabled,
      refreshSelects: true
    },
    {
      inputId: '_x_extension_motion_effects_toggle_2026_unique_',
      kind: 'motion-effects',
      key: S.MOTION_EFFECTS_ENABLED_STORAGE_KEY,
      normalize: S.normalizeMotionEffectsEnabled,
      refreshSelects: true
    },
    {
      inputId: '_x_extension_simple_mode_toggle_2026_unique_',
      kind: 'simple-mode',
      key: S.SIMPLE_MODE_ENABLED_STORAGE_KEY,
      normalize: S.normalizeSimpleModeEnabled,
      refreshSelects: true
    },
    {
      // Shown as stored; Options never rewrites this value.
      inputId: '_x_extension_progress_tracking_toggle_2026_unique_',
      key: S.PROGRESS_TRACKING_ENABLED_STORAGE_KEY,
      normalize: S.normalizeProgressTrackingEnabled,
      repairOnLoad: false,
      repairOnChange: false
    },
    {
      inputId: '_x_extension_search_fuzzy_pinyin_toggle_2026_unique_',
      key: S.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY,
      normalize: S.normalizeSearchFuzzyPinyinEnabled
    }
  ];
  return Object.freeze(entries.map((entry) => Object.freeze(entry)));
}

export { getToggleSettings };
export type { ToggleSettingEntry, ToggleSettingHooks, ToggleSettingsEntry };
