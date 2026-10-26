// The General tab's webpage focus overlay section: whether the search bar
// opened on a webpage opens results in a new or the current tab, and
// whether it lists every open tab before anything is typed. One React view
// draws the rows; this keeps their values in step with storage.
import type * as Settings from '../domain/settings';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface GeneralOverlaySectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  storageArea: SectionSettingStorage | null;
  SETTINGS: Pick<typeof Settings,
    'OVERLAY_OPEN_IN_CURRENT_TAB_STORAGE_KEY' | 'OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY' |
    'normalizeOverlayOpenInCurrentTab' | 'normalizeOverlayOpenTabsDefaultVisible'>;
  getMessage: GetMessage;
}

function createGeneralOverlaySection(deps: GeneralOverlaySectionDeps) {
  const { view, storageArea, SETTINGS, getMessage } = deps;

  const render = (): void => controller.render({ rows: getRows() });
  const openInCurrentTab = createSectionSetting({
    storageKey: SETTINGS.OVERLAY_OPEN_IN_CURRENT_TAB_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayOpenInCurrentTab
  }, storageArea, () => render());
  const openTabsDefault = createSectionSetting({
    storageKey: SETTINGS.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
    normalize: SETTINGS.normalizeOverlayOpenTabsDefaultVisible
  }, storageArea, () => render());

  const controller = view({
    onToggle(key, checked) {
      if (key === openTabsDefault.storageKey) {
        openTabsDefault.change(checked);
      }
    },
    onSelect(key, value) {
      if (key === openInCurrentTab.storageKey) {
        openInCurrentTab.change(value === 'currentTab');
      }
    }
  });

  function getRows(): SettingsRowModel[] {
    const openTitle = getMessage('settings_overlay_result_open_title', '结果打开方式');
    return [
      { type: 'header', key: 'header', title: getMessage('settings_webpage_focus_overlay_section_title', '网页聚焦搜索浮层') },
      {
        type: 'segmented',
        key: openInCurrentTab.storageKey,
        title: {
          text: openTitle,
          info: getMessage('settings_overlay_open_in_current_tab_desc', '按住 Option/Alt 可临时换成另一种')
        },
        groupId: '_x_extension_overlay_open_in_current_tab_tabs_wrap_2026_unique_',
        ariaLabel: openTitle,
        segmented: {
          activeValue: openInCurrentTab.get() ? 'currentTab' : 'newTab',
          dataAttribute: 'data-overlay-open-target',
          items: [
            {
              value: 'newTab',
              labelKey: 'settings_overlay_open_in_new_tab',
              label: getMessage('settings_overlay_open_in_new_tab', '在新标签页打开')
            },
            {
              value: 'currentTab',
              labelKey: 'settings_overlay_open_in_current_tab',
              label: getMessage('settings_overlay_open_in_current_tab', '在当前页打开')
            }
          ]
        }
      },
      {
        type: 'toggle',
        key: openTabsDefault.storageKey,
        title: { text: getMessage('settings_overlay_open_tabs_default_title', '默认展示所有已打开标签页') },
        toggle: {
          id: '_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_',
          checked: openTabsDefault.get()
        }
      }
    ];
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    openInCurrentTab.bind(settingBinder);
    openTabsDefault.bind(settingBinder);
  }

  render();

  return { render, bindSettings, destroy: () => controller.destroy() };
}

export { createGeneralOverlaySection };
export type { GeneralOverlaySectionDeps };
