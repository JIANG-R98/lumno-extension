// The Labs tab: experiments that stay off until turned on, each a switch row
// drawn by one React view and kept in step with storage.
import type * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import type { SettingSpec } from './options-setting-bindings';
import type { GetMessage } from './options-types';
import type { createSettingsControlsApi } from './react/settings-controls';
import type { SettingToggleRowsModel } from './react/setting-rows';

type LabsSettingKey = 'documentPip' | 'numberShortcutInstant' | 'macosCtrlSuggestionNavigation';

interface LabsSectionDeps {
  host: HTMLElement | null;
  optionsSettingsControlsApi: Pick<ReturnType<typeof createSettingsControlsApi>, 'createSettingToggleRowsController'>;
  storageArea: { set(items: StorageItems): unknown } | null;
  SETTINGS: Pick<typeof Settings,
    'DOCUMENT_PIP_ENABLED_STORAGE_KEY' | 'NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY' |
    'MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY' |
    'normalizeNumberShortcutInstantEnabled' | 'normalizeMacosCtrlSuggestionNavigationEnabled'>;
  getMessage: GetMessage;
  // The browser family the page runs in (data-browser-family).
  browserFamily: string;
}

// Each row's setting: its storage key, how a stored value reads, and the
// browser family that cannot honor it.
interface LabsSetting {
  key: LabsSettingKey;
  storageKey: string;
  normalize(raw: unknown): boolean;
  unsupportedBrowser?: string;
}

// Web clip needs Document Picture-in-Picture, which Firefox does not ship.
const DOCUMENT_PIP_UNSUPPORTED_BROWSER = 'firefox';

function createLabsSection(deps: LabsSectionDeps) {
  const { host, optionsSettingsControlsApi, storageArea, SETTINGS, getMessage, browserFamily } = deps;
  const settings: readonly LabsSetting[] = [
    {
      key: 'documentPip',
      storageKey: SETTINGS.DOCUMENT_PIP_ENABLED_STORAGE_KEY,
      normalize: (raw) => raw === true,
      unsupportedBrowser: DOCUMENT_PIP_UNSUPPORTED_BROWSER
    },
    {
      key: 'numberShortcutInstant',
      storageKey: SETTINGS.NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY,
      normalize: SETTINGS.normalizeNumberShortcutInstantEnabled
    },
    {
      key: 'macosCtrlSuggestionNavigation',
      storageKey: SETTINGS.MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
      normalize: SETTINGS.normalizeMacosCtrlSuggestionNavigationEnabled
    }
  ];
  // Every experiment starts off until storage answers.
  const values: Record<LabsSettingKey, boolean> = {
    documentPip: false,
    numberShortcutInstant: false,
    macosCtrlSuggestionNavigation: false
  };
  const isUnsupported = (setting: LabsSetting): boolean =>
    Boolean(setting.unsupportedBrowser) && setting.unsupportedBrowser === browserFamily;

  const controller = optionsSettingsControlsApi.createSettingToggleRowsController(host, {
    kind: 'labs',
    onChange(key, checked) {
      const setting = settings.find((entry) => entry.key === key);
      if (!setting || isUnsupported(setting)) {
        return;
      }
      values[setting.key] = checked;
      if (storageArea) {
        storageArea.set({ [setting.storageKey]: checked });
      }
      render();
    }
  });

  // An unsupported experiment shows off and disabled without touching the
  // synced value other browsers use.
  function getToggle(setting: LabsSetting, id: string) {
    const unsupported = isUnsupported(setting);
    return { id, checked: unsupported ? false : values[setting.key], disabled: unsupported };
  }

  function getModel(): SettingToggleRowsModel {
    const [documentPip, numberShortcutInstant, macosCtrlSuggestionNavigation] = settings;
    const beta = 'Beta';
    return {
      rows: [
        {
          key: documentPip.key,
          id: '_x_extension_document_pip_row_2026_unique_',
          title: getMessage('settings_document_pip_title', '网页剪裁'),
          badge: beta,
          description: getMessage('settings_document_pip_desc', '把网页里的局部内容单独剪出来悬浮查看，可用于参考、对照'),
          toggle: getToggle(documentPip, '_x_extension_document_pip_toggle_2026_unique_'),
          unsupported: {
            browser: DOCUMENT_PIP_UNSUPPORTED_BROWSER,
            reasonKey: 'settings_document_pip_unsupported_tooltip',
            active: isUnsupported(documentPip)
          }
        },
        {
          key: numberShortcutInstant.key,
          title: getMessage('settings_number_shortcut_instant_title', '单按 Command 显示数字跳转'),
          badge: beta,
          info: getMessage(
            'settings_number_shortcut_instant_desc',
            '开启后，命令栏与搜索建议中单按 Command/Ctrl 即显示数字跳转标记；「在后台新开」不再占用 Command（鼠标中键仍可后台打开）'
          ),
          toggle: getToggle(numberShortcutInstant, '_x_extension_number_shortcut_instant_toggle_2026_unique_')
        },
        {
          key: macosCtrlSuggestionNavigation.key,
          title: getMessage('settings_macos_ctrl_suggestion_navigation_title', 'Mac 键盘导航'),
          badge: beta,
          info: getMessage(
            'settings_macos_ctrl_suggestion_navigation_tooltip',
            '在 macOS 的新标签页和命令栏中可用。感谢 @wanghanzhen 的贡献。'
          ),
          description: getMessage('settings_macos_ctrl_suggestion_navigation_desc', '用 Ctrl+N / Ctrl+P 选择下一项 / 上一项'),
          toggle: getToggle(macosCtrlSuggestionNavigation, '_x_extension_macos_ctrl_suggestion_navigation_toggle_2026_unique_')
        }
      ]
    };
  }

  function render(): void {
    controller.render(getModel());
  }

  // Reads each value and follows its changes; until then the rows show off.
  function bindSettings(settingBinder: { bindSetting<V>(spec: SettingSpec<V>): void }): void {
    settings.forEach((setting) => {
      settingBinder.bindSetting({
        key: setting.storageKey,
        normalize: setting.normalize,
        apply(value) {
          values[setting.key] = value;
          render();
        },
        refreshSelects: true
      });
    });
  }

  render();

  return { render, bindSettings };
}

export { createLabsSection };
export type { LabsSectionDeps };
