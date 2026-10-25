// The layout of New Tab in the Appearance tab: whether the search box takes
// focus, the shortcuts and their size, the bookmark rows, the recent site
// cards and the page buttons. One React view draws it; this keeps it in step
// with storage.
import type * as Settings from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import type { SectionView } from './options-section-view';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { GetMessage } from './options-types';
import type {
  AppearanceNewtabLayoutSectionHandlers,
  AppearanceNewtabLayoutSectionModel,
  RecentSitesRowModel
} from './react/appearance-newtab-layout-section';
import type { SettingsRowModel } from './react/settings-rows-view';

type RecentMode = 'latest' | 'most';

interface AppearanceNewtabLayoutSectionDeps {
  view(handlers: AppearanceNewtabLayoutSectionHandlers): SectionView<AppearanceNewtabLayoutSectionModel>;
  storageArea: Pick<StorageAreaLike, 'get' | 'set'> | null;
  SETTINGS: Pick<typeof Settings,
    'NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY' | 'NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY' |
    'NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY' | 'NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY' |
    'NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY' | 'NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY' | 'NEWTAB_SHORTCUT_SIZE_STORAGE_KEY' |
    'NEWTAB_SHORTCUT_GAP_STORAGE_KEY' | 'BOOKMARK_COUNT_STORAGE_KEY' | 'BOOKMARK_COLUMNS_STORAGE_KEY' |
    'BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY' | 'RECENT_COUNT_STORAGE_KEY' | 'RECENT_MODE_STORAGE_KEY' |
    'NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY' | 'NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY' |
    'NEWTAB_SHORTCUT_COLUMNS_MIN' | 'NEWTAB_SHORTCUT_COLUMNS_MAX' |
    'NEWTAB_SHORTCUT_SIZE_MIN' | 'NEWTAB_SHORTCUT_SIZE_MAX' | 'NEWTAB_SHORTCUT_SIZE_DEFAULT' |
    'NEWTAB_SHORTCUT_GAP_MIN' | 'NEWTAB_SHORTCUT_GAP_MAX' | 'NEWTAB_SHORTCUT_GAP_DEFAULT' |
    'normalizeNewtabInputAutoFocusEnabled' | 'normalizeNewtabShortcutsVisible' | 'normalizeNewtabShortcutAddVisible' |
    'normalizeNewtabShortcutDockMagnificationEnabled' | 'normalizeNewtabShortcutColumns' |
    'normalizeNewtabShortcutSize' | 'normalizeNewtabShortcutGap' | 'inferNewtabShortcutColumnsFromWidth' |
    'normalizeBookmarkCount' | 'normalizeBookmarkColumns' | 'normalizeBookmarkFolderIconsVisible' |
    'normalizeNewtabFeedbackButtonVisible' | 'normalizeNewtabAppearanceButtonVisible'>;
  getMessage: GetMessage;
  // Asks open New Tab pages to redraw a part of themselves.
  notifyNewtabSectionsRefresh(section: string): void;
}

// The recent site cards come in rows of four, up to two rows.
function normalizeRecentCount(value: unknown): number {
  const parsed = Number.parseInt(String(value), 10);
  return parsed === 0 || parsed === 4 || parsed === 8 ? parsed : 4;
}

function createAppearanceNewtabLayoutSection(deps: AppearanceNewtabLayoutSectionDeps) {
  const { view, storageArea, SETTINGS, getMessage, notifyNewtabSectionsRefresh } = deps;

  const render = (): void => controller.render({ rows: getRows(), recent: getRecentRow() });
  const onChange = (): void => render();
  const autoFocus = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabInputAutoFocusEnabled
  }, storageArea, onChange);
  // The shortcut settings are read together (see loadShortcutSettings).
  const shortcutsVisible = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabShortcutsVisible,
    load: false
  }, storageArea, onChange);
  const shortcutAdd = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUT_ADD_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabShortcutAddVisible,
    load: false
  }, storageArea, onChange);
  const shortcutDock = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUT_DOCK_MAGNIFICATION_ENABLED_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabShortcutDockMagnificationEnabled,
    load: false
  }, storageArea, onChange);
  const shortcutColumns = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY,
    normalize: (value) => SETTINGS.normalizeNewtabShortcutColumns(value),
    load: false
  }, storageArea, onChange);
  const shortcutSize = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUT_SIZE_STORAGE_KEY,
    normalize: (value) => SETTINGS.normalizeNewtabShortcutSize(value),
    load: false
  }, storageArea, onChange);
  const shortcutGap = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_SHORTCUT_GAP_STORAGE_KEY,
    normalize: (value) => SETTINGS.normalizeNewtabShortcutGap(value),
    load: false
  }, storageArea, onChange);
  const bookmarkCount = createSectionSetting({
    storageKey: SETTINGS.BOOKMARK_COUNT_STORAGE_KEY,
    normalize: SETTINGS.normalizeBookmarkCount,
    repairOnChange: false
  }, storageArea, onChange);
  const bookmarkColumns = createSectionSetting({
    storageKey: SETTINGS.BOOKMARK_COLUMNS_STORAGE_KEY,
    normalize: SETTINGS.normalizeBookmarkColumns,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, onChange);
  const folderIcons = createSectionSetting({
    storageKey: SETTINGS.BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeBookmarkFolderIconsVisible
  }, storageArea, onChange);
  const recentCount = createSectionSetting({
    storageKey: SETTINGS.RECENT_COUNT_STORAGE_KEY,
    normalize: normalizeRecentCount,
    repairOnChange: false,
    refreshSelects: true
  }, storageArea, onChange);
  const feedbackButton = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabFeedbackButtonVisible
  }, storageArea, onChange);
  const appearanceButton = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabAppearanceButtonVisible
  }, storageArea, onChange);
  const toggles = [autoFocus, shortcutsVisible, shortcutAdd, shortcutDock, folderIcons, feedbackButton, appearanceButton];
  let recentMode: RecentMode = 'most';

  function changeRecentMode(value: string): void {
    recentMode = value === 'most' ? 'most' : 'latest';
    render();
    if (storageArea) {
      storageArea.set({ [SETTINGS.RECENT_MODE_STORAGE_KEY]: recentMode });
    }
    notifyNewtabSectionsRefresh('recent');
  }

  const controller = view({
    rows: {
      onToggle(key, checked) {
        toggles.find((entry) => entry.storageKey === key)?.change(checked);
      },
      onSelect() {},
      onSlide(key, value) {
        switch (key) {
          case shortcutColumns.storageKey:
            shortcutColumns.change(SETTINGS.normalizeNewtabShortcutColumns(value));
            break;
          case shortcutSize.storageKey:
            shortcutSize.change(SETTINGS.normalizeNewtabShortcutSize(value));
            break;
          case shortcutGap.storageKey:
            shortcutGap.change(SETTINGS.normalizeNewtabShortcutGap(value));
            break;
          case bookmarkCount.storageKey:
            // The slider counts rows of four bookmarks.
            bookmarkCount.change(SETTINGS.normalizeBookmarkCount(value * 4));
            notifyNewtabSectionsRefresh('bookmarks');
            break;
          case bookmarkColumns.storageKey:
            bookmarkColumns.change(SETTINGS.normalizeBookmarkColumns(value));
            notifyNewtabSectionsRefresh('bookmarks');
            break;
        }
      }
    },
    onRecentCount(value) {
      recentCount.change(normalizeRecentCount(Math.round(value) * 4));
      notifyNewtabSectionsRefresh('recent');
    },
    onRecentMode: changeRecentMode
  });

  function getShortcutRows(): SettingsRowModel[] {
    // The shortcut options stay in place, dimmed, while shortcuts are off.
    const disabled = !shortcutsVisible.get();
    const sizeMin = SETTINGS.NEWTAB_SHORTCUT_SIZE_MIN;
    const sizeMax = SETTINGS.NEWTAB_SHORTCUT_SIZE_MAX;
    const sizeDefault = SETTINGS.NEWTAB_SHORTCUT_SIZE_DEFAULT;
    const shortcutsTitle = getMessage('settings_newtab_shortcuts_title', '快捷方式');
    const addTitle = getMessage('settings_newtab_shortcut_add_title', '展示「+」');
    const dockTitle = getMessage('settings_newtab_shortcut_dock_magnification_title', '仿 macOS Dock 程序坞缩放效果');
    return [
      {
        type: 'toggle',
        key: shortcutsVisible.storageKey,
        title: { text: shortcutsTitle },
        toggle: {
          id: '_x_extension_newtab_shortcuts_toggle_2026_unique_',
          checked: shortcutsVisible.get(),
          ariaLabel: shortcutsTitle,
          ariaLabelKey: 'settings_newtab_shortcuts_title'
        }
      },
      {
        type: 'toggle',
        key: shortcutAdd.storageKey,
        rowId: '_x_extension_newtab_shortcut_add_row_2026_unique_',
        subrow: true,
        disabled,
        title: { text: addTitle },
        toggle: {
          id: '_x_extension_newtab_shortcut_add_toggle_2026_unique_',
          checked: shortcutAdd.get(),
          disabled,
          ariaLabel: addTitle,
          ariaLabelKey: 'settings_newtab_shortcut_add_title'
        }
      },
      {
        type: 'toggle',
        key: shortcutDock.storageKey,
        rowId: '_x_extension_newtab_shortcut_dock_magnification_row_2026_unique_',
        subrow: true,
        disabled,
        title: { text: dockTitle },
        toggle: {
          id: '_x_extension_newtab_shortcut_dock_magnification_toggle_2026_unique_',
          checked: shortcutDock.get(),
          disabled,
          ariaLabel: dockTitle,
          ariaLabelKey: 'settings_newtab_shortcut_dock_magnification_title'
        }
      },
      {
        type: 'slider',
        key: shortcutColumns.storageKey,
        rowId: '_x_extension_newtab_shortcut_columns_setting_row_2026_unique_',
        subrow: true,
        disabled,
        title: { text: getMessage('settings_newtab_shortcut_columns_title', '快捷方式每行数量') },
        hostId: '_x_extension_newtab_shortcut_columns_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('settings_newtab_shortcut_columns_title', 'Shortcuts per row'),
          disabled,
          id: '_x_extension_newtab_shortcut_columns_slider_2026_unique_',
          min: SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MIN,
          max: SETTINGS.NEWTAB_SHORTCUT_COLUMNS_MAX,
          step: 1,
          ticks: [
            { align: 'start', label: '4', percent: 0 },
            { label: '8', percent: 100 / 3 },
            { label: '12', percent: 200 / 3 },
            { align: 'end', label: '16', percent: 100 }
          ],
          value: shortcutColumns.get()
        }
      },
      {
        type: 'slider',
        key: shortcutSize.storageKey,
        rowId: '_x_extension_newtab_shortcut_size_setting_row_2026_unique_',
        subrow: true,
        disabled,
        title: { text: getMessage('settings_newtab_shortcut_size_title', '快捷方式大小') },
        hostId: '_x_extension_newtab_shortcut_size_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('settings_newtab_shortcut_size_title', 'Shortcut size'),
          defaultValue: sizeDefault,
          disabled,
          id: '_x_extension_newtab_shortcut_size_slider_2026_unique_',
          min: sizeMin,
          max: sizeMax,
          resetAriaLabel: getMessage('settings_newtab_shortcut_size_reset', 'Reset shortcut size'),
          resetButtonId: '_x_extension_newtab_shortcut_size_reset_2026_unique_',
          step: 1,
          ticks: [
            { align: 'start', label: String(sizeMin), percent: 0 },
            { label: String(sizeDefault), percent: ((sizeDefault - sizeMin) / (sizeMax - sizeMin)) * 100 },
            { align: 'end', label: String(sizeMax), percent: 100 }
          ],
          value: shortcutSize.get(),
          valueSuffix: ' px'
        }
      },
      {
        type: 'slider',
        key: shortcutGap.storageKey,
        rowId: '_x_extension_newtab_shortcut_gap_setting_row_2026_unique_',
        subrow: true,
        disabled,
        title: { text: getMessage('settings_newtab_shortcut_gap_title', '快捷方式间距') },
        hostId: '_x_extension_newtab_shortcut_gap_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('settings_newtab_shortcut_gap_title', 'Shortcut spacing'),
          defaultValue: SETTINGS.NEWTAB_SHORTCUT_GAP_DEFAULT,
          disabled,
          id: '_x_extension_newtab_shortcut_gap_slider_2026_unique_',
          min: SETTINGS.NEWTAB_SHORTCUT_GAP_MIN,
          max: SETTINGS.NEWTAB_SHORTCUT_GAP_MAX,
          resetAriaLabel: getMessage('settings_newtab_shortcut_gap_reset', 'Reset shortcut spacing'),
          resetButtonId: '_x_extension_newtab_shortcut_gap_reset_2026_unique_',
          step: 1,
          ticks: [
            { align: 'start', label: '0', percent: 0 },
            { label: '8', percent: 100 / 3 },
            { label: '16', percent: 200 / 3 },
            { align: 'end', label: '24', percent: 100 }
          ],
          value: shortcutGap.get(),
          valueSuffix: ' px'
        }
      }
    ];
  }

  function getBookmarkRows(): SettingsRowModel[] {
    const adaptiveCount = getMessage(
      'settings_bookmark_adaptive_count_tooltip',
      '该值为宽度充足时的最大数量，实际显示数量会根据可用空间自适应。'
    );
    const folderIconsTitle = getMessage('settings_bookmark_folder_icons_visible_title', '展示书签文件夹内图标');
    return [
      {
        type: 'slider',
        key: bookmarkCount.storageKey,
        rowId: '_x_extension_bookmark_rows_setting_row_2026_unique_',
        compact: false,
        title: { text: getMessage('settings_bookmarks_title', '书签行数'), info: adaptiveCount },
        hostId: '_x_extension_bookmark_rows_control_2026_unique_',
        slider: {
          ariaLabel: getMessage('settings_bookmarks_title', 'Bookmark rows'),
          id: '_x_extension_bookmark_rows_slider_2026_unique_',
          min: 0,
          max: 8,
          step: 1,
          ticks: [
            { align: 'start', label: '0' },
            { label: '4' },
            { align: 'end', label: '8' }
          ],
          value: bookmarkCount.get() / 4
        }
      },
      {
        // How the bookmarks lay out only matters while there are some.
        type: 'reveal',
        key: 'bookmark-subrows',
        id: '_x_extension_bookmark_subrows_2026_unique_',
        expanded: bookmarkCount.get() > 0,
        rows: [
          {
            type: 'slider',
            key: bookmarkColumns.storageKey,
            rowId: '_x_extension_bookmark_columns_setting_row_2026_unique_',
            compact: false,
            subrow: true,
            title: { text: getMessage('settings_bookmark_columns_title', '书签每行数量'), info: adaptiveCount },
            hostId: '_x_extension_bookmark_columns_control_2026_unique_',
            slider: {
              ariaLabel: getMessage('settings_bookmark_columns_title', 'Bookmarks per row'),
              id: '_x_extension_bookmark_columns_slider_2026_unique_',
              min: 4,
              max: 8,
              step: 1,
              ticks: [
                { align: 'start', label: '4' },
                { label: '6' },
                { align: 'end', label: '8' }
              ],
              value: bookmarkColumns.get()
            }
          },
          {
            type: 'toggle',
            key: folderIcons.storageKey,
            rowId: '_x_extension_bookmark_folder_icons_visible_row_2026_unique_',
            subrow: true,
            title: { text: folderIconsTitle },
            toggle: {
              id: '_x_extension_bookmark_folder_icons_visible_toggle_2026_unique_',
              checked: folderIcons.get(),
              ariaLabel: folderIconsTitle,
              ariaLabelKey: 'settings_bookmark_folder_icons_visible_title'
            }
          }
        ]
      }
    ];
  }

  function getRecentRow(): RecentSitesRowModel {
    const count = recentCount.get();
    return {
      title: getMessage('settings_recent_sites_title', '站点卡片'),
      count: {
        ariaLabel: getMessage('settings_recent_sites_title', 'Recent site cards'),
        id: '_x_extension_recent_count_slider_2026_unique_',
        min: 0,
        max: 2,
        step: 1,
        ticks: [
          { align: 'start', label: '0' },
          { label: '1' },
          { align: 'end', label: '2' }
        ],
        value: count / 4
      },
      mode: count > 0
        ? {
          activeValue: recentMode,
          dataAttribute: 'data-recent-mode',
          items: [
            { value: 'latest', labelKey: 'recent_mode_latest', label: getMessage('recent_mode_latest', '最近访问') },
            { value: 'most', labelKey: 'recent_mode_most', label: getMessage('recent_mode_most', '最常访问') }
          ],
          select: { id: '_x_extension_recent_mode_select_2024_unique_' }
        }
        : null
    };
  }

  function getRows(): SettingsRowModel[] {
    const autoFocusTitle = getMessage('newtab_input_auto_focus_title', '输入框自动聚焦');
    const feedbackTitle = getMessage('settings_newtab_feedback_button_visible_title', '展示反馈按钮');
    const appearanceTitle = getMessage('settings_newtab_appearance_button_visible_title', '展示外观按钮');
    return [
      {
        type: 'toggle',
        key: autoFocus.storageKey,
        title: { text: autoFocusTitle },
        toggle: {
          id: '_x_extension_newtab_input_auto_focus_toggle_2026_unique_',
          checked: autoFocus.get(),
          ariaLabel: autoFocusTitle,
          ariaLabelKey: 'newtab_input_auto_focus_title'
        }
      },
      ...getShortcutRows(),
      ...getBookmarkRows(),
      { type: 'slot', key: 'recent' },
      { type: 'label', key: 'page-buttons', group: true, title: { text: getMessage('settings_newtab_page_buttons_title', '页面按钮') } },
      {
        type: 'toggle',
        key: feedbackButton.storageKey,
        subrow: true,
        title: { text: feedbackTitle },
        toggle: {
          id: '_x_extension_newtab_feedback_button_visible_toggle_2026_unique_',
          checked: feedbackButton.get(),
          ariaLabel: feedbackTitle,
          ariaLabelKey: 'settings_newtab_feedback_button_visible_title'
        }
      },
      {
        type: 'toggle',
        key: appearanceButton.storageKey,
        subrow: true,
        title: { text: appearanceTitle },
        toggle: {
          id: '_x_extension_newtab_appearance_button_visible_toggle_2026_unique_',
          checked: appearanceButton.get(),
          ariaLabel: appearanceTitle,
          ariaLabelKey: 'settings_newtab_appearance_button_visible_title'
        }
      }
    ];
  }

  // The shortcut switches and sliders are read together because the column
  // count falls back to one inferred from the older width setting. Values
  // that were missing or not normalized are written back.
  function loadShortcutSettings(): void {
    if (!storageArea) {
      return;
    }
    const entries = [shortcutsVisible, shortcutAdd, shortcutDock, shortcutColumns, shortcutSize, shortcutGap];
    void storageArea.get([...entries.map((entry) => entry.storageKey), SETTINGS.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY], (items) => {
      const result = items || {};
      const rawColumns = result[shortcutColumns.storageKey];
      const visible = SETTINGS.normalizeNewtabShortcutsVisible(result[shortcutsVisible.storageKey]);
      const add = SETTINGS.normalizeNewtabShortcutAddVisible(result[shortcutAdd.storageKey]);
      const dock = SETTINGS.normalizeNewtabShortcutDockMagnificationEnabled(result[shortcutDock.storageKey]);
      const columns = rawColumns === undefined
        ? SETTINGS.inferNewtabShortcutColumnsFromWidth(result[SETTINGS.NEWTAB_SHORTCUT_WIDTH_STORAGE_KEY])
        : SETTINGS.normalizeNewtabShortcutColumns(rawColumns);
      const size = SETTINGS.normalizeNewtabShortcutSize(result[shortcutSize.storageKey]);
      const gap = SETTINGS.normalizeNewtabShortcutGap(result[shortcutGap.storageKey]);
      shortcutsVisible.show(visible);
      shortcutAdd.show(add);
      shortcutDock.show(dock);
      shortcutColumns.show(columns);
      shortcutSize.show(size);
      shortcutGap.show(gap);
      const values: Record<string, unknown> = {
        [shortcutsVisible.storageKey]: visible,
        [shortcutAdd.storageKey]: add,
        [shortcutDock.storageKey]: dock,
        [shortcutColumns.storageKey]: columns,
        [shortcutSize.storageKey]: size,
        [shortcutGap.storageKey]: gap
      };
      const repairs = Object.fromEntries(Object.entries(values).filter(([key, value]) => result[key] !== value));
      if (Object.keys(repairs).length > 0) {
        void storageArea.set(repairs);
      }
    });
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    autoFocus.bind(settingBinder);
    [shortcutsVisible, shortcutAdd, shortcutDock].forEach((entry) => entry.bind(settingBinder));
    [shortcutColumns, shortcutSize, shortcutGap].forEach((entry) => entry.bind(settingBinder));
    [bookmarkCount, bookmarkColumns, folderIcons, recentCount].forEach((entry) => entry.bind(settingBinder));
    settingBinder.bindSetting({
      key: SETTINGS.RECENT_MODE_STORAGE_KEY,
      // A missing or unknown mode starts as "most visited"; a later change to
      // anything but "most" shows "latest", as the switch only offers the two.
      normalize: (value): RecentMode => (value === 'latest' || value === 'most' ? value : 'most'),
      normalizeChange: (value): RecentMode => (value === 'most' ? 'most' : 'latest'),
      apply(mode) {
        recentMode = mode;
        render();
      },
      repairOnChange: false,
      refreshSelects: true
    });
    [feedbackButton, appearanceButton].forEach((entry) => entry.bind(settingBinder));
    loadShortcutSettings();
  }

  render();

  return {
    render,
    bindSettings,
    destroy: () => controller.destroy()
  };
}

export { createAppearanceNewtabLayoutSection };
export type { AppearanceNewtabLayoutSectionDeps };
