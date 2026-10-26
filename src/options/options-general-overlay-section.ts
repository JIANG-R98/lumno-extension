// The General tab's webpage focus overlay section: whether the search bar
// opened on a webpage opens results in a new tab, asked as the New Tab
// section asks it, and whether it lists every open tab before anything is
// typed. One React view draws the rows; this keeps their values in step
// with storage.
import type * as Settings from '../domain/settings';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface GeneralOverlaySectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  settingsStore: SectionSettingStorage;
  SETTINGS: Pick<typeof Settings, 'overlayOpenInCurrentTab' | 'overlayOpenTabsDefaultVisible'>;
  getMessage: GetMessage;
}

function createGeneralOverlaySection(deps: GeneralOverlaySectionDeps) {
  const { view, settingsStore, SETTINGS, getMessage } = deps;

  const render = (): void => controller.render({ rows: getRows() });
  // Both are shown as stored; Options never rewrites them on its own.
  const openInCurrentTab = createSectionSetting({ setting: SETTINGS.overlayOpenInCurrentTab }, settingsStore, () => render());
  const openTabsDefault = createSectionSetting({ setting: SETTINGS.overlayOpenTabsDefaultVisible }, settingsStore, () => render());

  // The switch says "open in a new tab", the reverse of what is stored.
  const controller = view({
    onToggle(key, checked) {
      if (key === openInCurrentTab.storageKey) {
        openInCurrentTab.change(!checked);
      } else if (key === openTabsDefault.storageKey) {
        openTabsDefault.change(checked);
      }
    },
    onSelect() {}
  });

  function getRows(): SettingsRowModel[] {
    return [
      { type: 'header', key: 'header', title: getMessage('settings_webpage_focus_overlay_section_title', '网页聚焦搜索浮层') },
      {
        type: 'toggle',
        key: openInCurrentTab.storageKey,
        title: {
          text: getMessage('settings_newtab_open_in_new_tab_title', '点击后在新标签页打开'),
          info: getMessage('settings_overlay_open_in_current_tab_desc', '关闭后在当前页打开（固定标签页除外），按住 Option/Alt 可临时换成另一种')
        },
        toggle: {
          id: '_x_extension_overlay_open_in_new_tab_toggle_2026_unique_',
          checked: !openInCurrentTab.get()
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
