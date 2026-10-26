// The General tab's Shortcuts section: the way to the browser's shortcuts
// page, the search shortcut's status, what the shortcut does on restricted
// pages, the list of shortcuts, and quick tab switching. One React view
// draws it; this keeps its values in step with storage.
import type * as Settings from '../domain/settings';
import * as LumnoMessaging from '../platform/messaging';
import type { MessageRuntime } from '../platform/messaging';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { GeneralShortcutsSectionHandlers, GeneralShortcutsSectionModel } from './react/general-shortcuts-section';
import type { ShortcutReferenceRenderModel } from './react/shortcut-reference';

interface GeneralShortcutsSectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: GeneralShortcutsSectionHandlers): SectionView<GeneralShortcutsSectionModel>;
  settingsStore: SectionSettingStorage;
  SETTINGS: Pick<typeof Settings,
    'restrictedAction' | 'restrictedActionAutoBrowserSettingDone' |
    'overlayTabPriority'>;
  runtime: MessageRuntime & { lastError?: { message?: string } | null };
  getMessage: GetMessage;
  showToast(message: string, isError?: boolean): void;
}

function createGeneralShortcutsSection(deps: GeneralShortcutsSectionDeps) {
  const { view, settingsStore, SETTINGS, runtime, getMessage, showToast } = deps;

  const render = (): void => controller.render(getModel());
  const restrictedAction = createSectionSetting({ setting: SETTINGS.restrictedAction, refreshSelects: true }, null, () => render());
  // Quick tab switching stays on: the switch always shows on and saves on.
  const quickSwitch = createSectionSetting({ setting: SETTINGS.overlayTabPriority, refreshSelects: true }, settingsStore, () => render());
  let status = '';
  let reference: ShortcutReferenceRenderModel | null = null;

  const showError = (): void => showToast(getMessage('toast_error', '操作失败，请重试。'), true);

  const controller = view({
    onOpenShortcutsPage() {
      LumnoMessaging.sendBackgroundMessage(runtime, { action: 'openExtensionShortcutsPage' }, (response) => {
        if (runtime.lastError || !response || response.ok === false) {
          showError();
        }
      });
    },
    // Choosing an action also marks the one-time browser setting step done.
    onRestrictedAction(value) {
      const next = SETTINGS.restrictedAction.parse(value);
      restrictedAction.show(next);
      void settingsStore.setMany([
        [SETTINGS.restrictedAction, next],
        [SETTINGS.restrictedActionAutoBrowserSettingDone, true]
      ]).catch(() => {});
    },
    onQuickSwitch() {
      quickSwitch.change(true);
    }
  });

  function getModel(): GeneralShortcutsSectionModel {
    return {
      title: getMessage('settings_shortcuts_section_title', '快捷键设置'),
      description: {
        prefix: getMessage('settings_shortcuts_browser_desc_prefix', '需在 '),
        extensions: getMessage('settings_shortcuts_browser_desc_path_extensions', '「扩展程序」'),
        shortcuts: getMessage('settings_shortcuts_browser_desc_path_shortcuts', '「键盘快捷键」'),
        suffix: getMessage('settings_shortcuts_browser_desc_suffix', ' 修改快捷键')
      },
      openLabel: getMessage('settings_shortcuts_action', '前往快捷键设置'),
      search: {
        title: getMessage('settings_shortcuts_title', '唤起聚焦搜索窗口'),
        diaTag: getMessage('settings_shortcuts_dia_tag', '在 Dia 中使用'),
        diaTooltip: getMessage(
          'settings_shortcuts_dia_tooltip',
          'Dia 不允许扩展替换新标签页，所以 Lumno 的新标签页在 Dia 中暂不可用，聚焦搜索可以正常使用。\n\n想用 ⌘T 唤起聚焦搜索：Dia 自带快捷键的优先级更高，请先在 Dia 的 Settings → Shortcuts 中，把「New Tab」的 ⌘T 改成其他按键，再点击下方右侧按钮，将「Open command bar」设为 ⌘T。\n\n若快捷键在 Dia 中没有反应，请将其作用范围从 In Dia 改成 Global。'
        ),
        status: status || getMessage('settings_shortcuts_unset', '未设置')
      },
      restricted: {
        title: getMessage('settings_restricted_title', '在受限页行为'),
        info: getMessage(
          'settings_restricted_tooltip',
          '受限页（如 chrome://、扩展商店、部分 file:// 页面）无法开启聚焦搜索；按下快捷键将按此处规则处理。'
        ),
        segmented: {
          activeValue: restrictedAction.get(),
          dataAttribute: 'data-restricted-action',
          items: [
            {
              value: 'default',
              labelKey: 'restricted_action_default',
              label: getMessage('restricted_action_default', '前往 Lumno 新标签页')
            },
            {
              value: 'none',
              labelKey: 'restricted_action_none',
              label: getMessage('restricted_action_none', '遵循浏览器设置')
            }
          ],
          select: { id: '_x_extension_restricted_action_select_2024_unique_' }
        }
      },
      referenceLabel: getMessage('shortcut_reference_title', '快捷键列表'),
      reference,
      quickSwitch: {
        title: getMessage('settings_overlay_tab_priority_title', '快速切换已开启标签页'),
        toggle: { id: '_x_extension_overlay_tab_quick_switch_2024_unique_', checked: true }
      }
    };
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    restrictedAction.bind(settingBinder);
    quickSwitch.bind(settingBinder);
  }

  // The search shortcut's status chip text.
  function setStatus(label: string): void {
    status = label;
    render();
  }

  render();

  return {
    render,
    bindSettings,
    setStatus,
    destroy: () => controller.destroy(),
    // Where the shortcut list module draws its rows.
    referenceList: {
      render(model: ShortcutReferenceRenderModel) {
        reference = model;
        render();
      }
    }
  };
}

export { createGeneralShortcutsSection };
export type { GeneralShortcutsSectionDeps };
