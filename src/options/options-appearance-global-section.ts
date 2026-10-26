// The Appearance tab's global section: the color mode, motion effects and
// simple mode. One React view draws it; the theme section hands it the
// gallery's model, and this keeps the switches in step with storage.
import type * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import type { SectionView } from './options-section-view';
import { createSectionSetting, type SectionSettingBinder } from './options-section-setting';
import type { GetMessage } from './options-types';
import type { AppearanceGlobalSectionHandlers, AppearanceGlobalSectionModel } from './react/appearance-global-section';
import type { ThemeMode, ThemePickerRenderModel } from './react/theme-picker';

interface AppearanceGlobalSectionDeps {
  view(handlers: AppearanceGlobalSectionHandlers): SectionView<AppearanceGlobalSectionModel>;
  storageArea: { set(items: StorageItems): unknown } | null;
  SETTINGS: Pick<typeof Settings,
    'motionEffectsEnabled' | 'simpleModeEnabled' |
    'motionEffectsEnabled' | 'simpleModeEnabled'>;
  getMessage: GetMessage;
  // Plays the gallery's click effect and switches the page's color mode.
  onTheme(mode: ThemeMode, button: HTMLButtonElement): void;
}

function createAppearanceGlobalSection(deps: AppearanceGlobalSectionDeps) {
  const { view, storageArea, SETTINGS, getMessage, onTheme } = deps;

  const render = (): void => controller.render(getModel());
  const motionEffects = createSectionSetting({
    storageKey: SETTINGS.motionEffectsEnabled.key,
    normalize: SETTINGS.motionEffectsEnabled.parse,
    refreshSelects: true
  }, storageArea, () => render());
  const simpleMode = createSectionSetting({
    storageKey: SETTINGS.simpleModeEnabled.key,
    normalize: SETTINGS.simpleModeEnabled.parse,
    refreshSelects: true
  }, storageArea, () => render());
  const toggles = [motionEffects, simpleMode];
  // Empty until the theme section draws the gallery.
  let picker: ThemePickerRenderModel = { activeMode: 'system', options: [] };

  const controller = view({
    onTheme,
    rows: {
      onToggle(key, checked) {
        toggles.find((entry) => entry.storageKey === key)?.change(checked);
      },
      onSelect() {}
    }
  });

  function getModel(): AppearanceGlobalSectionModel {
    return {
      title: getMessage('settings_appearance_global_section_title', '全局'),
      theme: { title: getMessage('settings_theme_title', '深浅色模式'), picker },
      rows: [
        {
          type: 'toggle',
          key: motionEffects.storageKey,
          title: {
            text: getMessage('settings_motion_effects_title', '动态效果'),
            info: getMessage('settings_motion_effects_desc', '如遇卡顿，或倾向于更利落的唤起方式，可关闭')
          },
          toggle: { id: '_x_extension_motion_effects_toggle_2026_unique_', checked: motionEffects.get() }
        },
        {
          type: 'toggle',
          key: simpleMode.storageKey,
          title: { text: getMessage('settings_simple_mode_title', '简洁模式') },
          description: getMessage('settings_simple_mode_desc', '移除更多提示元素，使搜索框更简洁'),
          toggle: { id: '_x_extension_simple_mode_toggle_2026_unique_', checked: simpleMode.get() }
        }
      ]
    };
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    toggles.forEach((entry) => entry.bind(settingBinder));
  }

  render();

  return {
    render,
    bindSettings,
    destroy: () => controller.destroy(),
    // Where the theme section draws the color mode gallery.
    themePicker: {
      render(model: ThemePickerRenderModel) {
        picker = model;
        render();
      }
    }
  };
}

export { createAppearanceGlobalSection };
export type { AppearanceGlobalSectionDeps };
