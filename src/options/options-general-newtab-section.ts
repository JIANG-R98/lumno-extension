// The General tab's New Tab section: progress tracking for pinned series
// and which New Tab surfaces open their links in a new tab. One React view
// draws the rows; this keeps their values in step with storage.
import type * as Settings from '../domain/settings';
import type { NewtabOpenInNewTabSurface } from '../domain/settings';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface GeneralNewtabSectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  storageArea: SectionSettingStorage | null;
  SETTINGS: Pick<typeof Settings,
    'PROGRESS_TRACKING_ENABLED_STORAGE_KEY' | 'NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY' |
    'normalizeProgressTrackingEnabled' | 'normalizeNewtabOpenInNewTab'>;
  getMessage: GetMessage;
}

// Each surface's checkbox, in the order the group shows them.
const OPEN_IN_NEW_TAB_SURFACES: ReadonlyArray<{ surface: NewtabOpenInNewTabSurface; id: string; labelKey: string }> = [
  { surface: 'search', id: '_x_extension_newtab_open_in_new_tab_search_2026_unique_', labelKey: 'settings_newtab_open_in_new_tab_search' },
  { surface: 'shortcuts', id: '_x_extension_newtab_open_in_new_tab_shortcuts_2026_unique_', labelKey: 'settings_newtab_open_in_new_tab_shortcuts' },
  { surface: 'bookmarks', id: '_x_extension_newtab_open_in_new_tab_bookmarks_2026_unique_', labelKey: 'settings_newtab_open_in_new_tab_bookmarks' },
  { surface: 'recentSites', id: '_x_extension_newtab_open_in_new_tab_recent_sites_2026_unique_', labelKey: 'settings_newtab_open_in_new_tab_recent_sites' }
];

function createGeneralNewtabSection(deps: GeneralNewtabSectionDeps) {
  const { view, storageArea, SETTINGS, getMessage } = deps;

  const render = (): void => controller.render({ rows: getRows() });
  // Both are shown as stored; Options never rewrites them on its own.
  const progressTracking = createSectionSetting({
    storageKey: SETTINGS.PROGRESS_TRACKING_ENABLED_STORAGE_KEY,
    normalize: SETTINGS.normalizeProgressTrackingEnabled,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, () => render());
  const openInNewTab = createSectionSetting({
    storageKey: SETTINGS.NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    normalize: SETTINGS.normalizeNewtabOpenInNewTab,
    repairOnLoad: false,
    repairOnChange: false
  }, storageArea, () => render());

  const controller = view({
    onToggle(key, checked) {
      if (key === progressTracking.storageKey) {
        progressTracking.change(checked);
      }
    },
    onCheck(key, values) {
      if (key !== openInNewTab.storageKey) {
        return;
      }
      const next = Object.fromEntries(OPEN_IN_NEW_TAB_SURFACES.map(({ surface }) => [surface, values.includes(surface)]));
      openInNewTab.change(SETTINGS.normalizeNewtabOpenInNewTab(next));
    },
    onSelect() {}
  });

  function getSurfaceTitle(surface: NewtabOpenInNewTabSurface): string {
    switch (surface) {
      case 'search':
        return getMessage('settings_newtab_open_in_new_tab_search', '搜索结果');
      case 'shortcuts':
        return getMessage('settings_newtab_open_in_new_tab_shortcuts', '快捷方式');
      case 'bookmarks':
        return getMessage('settings_newtab_open_in_new_tab_bookmarks', '书签');
      default:
        return getMessage('settings_newtab_open_in_new_tab_recent_sites', '站点卡片');
    }
  }

  function getRows(): SettingsRowModel[] {
    const surfaces = openInNewTab.get();
    return [
      { type: 'header', key: 'header', title: getMessage('settings_general_newtab_section_title', '新标签页设置') },
      {
        type: 'toggle',
        key: progressTracking.storageKey,
        title: {
          text: getMessage('settings_progress_tracking_title', '置顶剧集、小说时自动更新进度'),
          badge: 'Beta'
        },
        toggle: { id: '_x_extension_progress_tracking_toggle_2026_unique_', checked: progressTracking.get() }
      },
      {
        type: 'checkbox-group',
        key: openInNewTab.storageKey,
        title: {
          text: getMessage('settings_newtab_open_in_new_tab_title', '点击后在新标签页打开'),
          info: getMessage('settings_newtab_open_in_new_tab_desc', '未勾选的在当前页打开，Cmd/Ctrl 或中键点击总在后台打开')
        },
        groupId: '_x_extension_newtab_open_in_new_tab_2026_unique_',
        ariaLabel: getMessage('settings_newtab_open_in_new_tab_title', '点击后在新标签页打开'),
        checkboxes: {
          items: OPEN_IN_NEW_TAB_SURFACES.map(({ surface, id, labelKey }) => ({
            checked: surfaces[surface],
            id,
            label: getSurfaceTitle(surface),
            labelKey,
            value: surface
          }))
        }
      }
    ];
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    progressTracking.bind(settingBinder);
    openInNewTab.bind(settingBinder);
  }

  render();

  return { render, bindSettings, destroy: () => controller.destroy() };
}

export { createGeneralNewtabSection };
export type { GeneralNewtabSectionDeps };
