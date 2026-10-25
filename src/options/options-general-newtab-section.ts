// The General tab's New Tab section: progress tracking for pinned series
// and which New Tab surfaces open their links in a new tab. One React view
// draws the rows; this keeps their values in step with storage.
import type * as Settings from '../domain/settings';
import type { NewtabOpenInNewTab, NewtabOpenInNewTabSurface } from '../domain/settings';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { GetMessage } from './options-types';
import type { createSettingsControlsApi } from './react/settings-controls';
import type { SettingsRowModel } from './react/settings-rows-view';

interface GeneralNewtabSectionDeps {
  host: HTMLElement | null;
  optionsSettingsControlsApi: Pick<ReturnType<typeof createSettingsControlsApi>, 'createSettingsSectionController'>;
  storageArea: SectionSettingStorage | null;
  SETTINGS: Pick<typeof Settings,
    'PROGRESS_TRACKING_ENABLED_STORAGE_KEY' | 'NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY' |
    'normalizeProgressTrackingEnabled' | 'normalizeNewtabOpenInNewTab'>;
  getMessage: GetMessage;
}

// Each surface's switch, in the order the rows show them.
const OPEN_IN_NEW_TAB_SURFACES: ReadonlyArray<{ surface: NewtabOpenInNewTabSurface; id: string }> = [
  { surface: 'search', id: '_x_extension_newtab_open_in_new_tab_search_toggle_2026_unique_' },
  { surface: 'shortcuts', id: '_x_extension_newtab_open_in_new_tab_shortcuts_toggle_2026_unique_' },
  { surface: 'bookmarks', id: '_x_extension_newtab_open_in_new_tab_bookmarks_toggle_2026_unique_' },
  { surface: 'recentSites', id: '_x_extension_newtab_open_in_new_tab_recent_sites_toggle_2026_unique_' }
];

function createGeneralNewtabSection(deps: GeneralNewtabSectionDeps) {
  const { host, optionsSettingsControlsApi, storageArea, SETTINGS, getMessage } = deps;

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

  const controller = optionsSettingsControlsApi.createSettingsSectionController(host, {
    onToggle(key, checked) {
      if (key === progressTracking.storageKey) {
        progressTracking.change(checked);
        return;
      }
      const target = OPEN_IN_NEW_TAB_SURFACES.find((entry) => entry.id === key);
      if (target) {
        const next: NewtabOpenInNewTab = { ...openInNewTab.get(), [target.surface]: checked };
        openInNewTab.change(SETTINGS.normalizeNewtabOpenInNewTab(next));
      }
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
        type: 'label',
        key: 'open-in-new-tab',
        group: true,
        title: { text: getMessage('settings_newtab_open_in_new_tab_title', '在新标签页打开') }
      },
      ...OPEN_IN_NEW_TAB_SURFACES.map(({ surface, id }): SettingsRowModel => {
        const title = getSurfaceTitle(surface);
        return {
          type: 'toggle',
          key: id,
          subrow: true,
          title: { text: title },
          toggle: { id, checked: surfaces[surface], ariaLabel: title }
        };
      })
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
