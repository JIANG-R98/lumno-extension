// The General tab's Features section: picture-in-picture, the tab switcher
// and its window option, link preview, pinned tab recovery, and the
// selection toolbar with its provider and grouping. One React view draws
// the rows; this keeps their values in step with storage.
import type * as Settings from '../domain/settings';
import type { Setting } from '../domain/settings/define';
import { createSectionSetting, type SectionSettingBinder, type SectionSettingStorage } from './options-section-setting';
import type { SectionView } from './options-section-view';
import type { GetMessage } from './options-types';
import type { SettingsLinkModel, SettingsRowModel, SettingsRowsHandlers, SettingsSectionModel } from './react/settings-rows-view';

interface GeneralFeaturesSectionDeps {
  // Draws the section; the General tab hands over its part of the tab's view.
  view(handlers: SettingsRowsHandlers): SectionView<SettingsSectionModel>;
  settingsStore: SectionSettingStorage;
  SETTINGS: Pick<typeof Settings,
    'autoPipEnabled' | 'tabSwitcherEnabled' |
    'tabSwitcherCurrentWindowOnly' | 'linkPreviewEnabled' |
    'pinnedTabRecoveryEnabled' | 'selectionQuickActionsEnabled' |
    'selectionQuickActionsProvider' | 'selectionQuickActionsGroupEnabled' |
    'tabSwitcherEnabled' | 'tabSwitcherCurrentWindowOnly' | 'linkPreviewEnabled' |
    'selectionQuickActionsEnabled' | 'selectionQuickActionsProvider' |
    'selectionQuickActionsGroupEnabled'>;
  getMessage: GetMessage;
  // The browser family the page runs in (data-browser-family).
  browserFamily: string;
  // A packaged file's URL, for the provider icons.
  getAssetUrl(path: string): string;
  getViewportTopInset(): number;
  // The shortcut that opens the tab switcher, as the info button names it.
  getTabSwitcherShortcut(): string;
}

// The AI sites the selection toolbar can open first, with their bundled tiles.
const SELECTION_PROVIDERS: ReadonlyArray<{ value: string; labelKey: string; fallback: string }> = [
  { value: 'gpt', labelKey: 'site_search_name_chatgpt', fallback: 'ChatGPT' },
  { value: 'gm', labelKey: 'site_search_name_gemini', fallback: 'Gemini' },
  { value: 'dbai', labelKey: 'site_search_name_doubao', fallback: 'Doubao' },
  { value: 'qw', labelKey: 'site_search_name_qianwen', fallback: 'Qwen' },
  { value: 'yb', labelKey: 'site_search_name_yuanbao', fallback: 'Yuanbao' },
  { value: 'mx', labelKey: 'site_search_name_minimax', fallback: 'MiniMax' },
  { value: 'ds', labelKey: 'site_search_name_deepseek', fallback: 'DeepSeek' },
  { value: 'kimi', labelKey: 'site_search_name_kimi', fallback: 'Kimi' },
  { value: 'cp', labelKey: 'site_search_name_copilot', fallback: 'Copilot' },
  { value: 'grok', labelKey: 'site_search_name_grok', fallback: 'Grok' },
  { value: 'qwen', labelKey: 'site_search_name_qwen_chat', fallback: 'Qwen Chat' },
  { value: 'ais', labelKey: 'site_search_name_ai_studio', fallback: 'Google AI Studio' }
];

// Picture-in-picture for web pages needs requestPictureInPicture, which Firefox lacks.
const AUTO_PIP_UNSUPPORTED_BROWSER = 'firefox';

function createGeneralFeaturesSection(deps: GeneralFeaturesSectionDeps) {
  const {
    view,
    settingsStore,
    SETTINGS,
    getMessage,
    browserFamily,
    getAssetUrl,
    getViewportTopInset,
    getTabSwitcherShortcut
  } = deps;
  const autoPipUnsupported = browserFamily === AUTO_PIP_UNSUPPORTED_BROWSER;

  const render = (): void => controller.render({ rows: getRows() });
  const setting = <V>(stored: Setting<V>) =>
    createSectionSetting({ setting: stored, refreshSelects: true }, settingsStore, () => render());
  const autoPip = setting(SETTINGS.autoPipEnabled);
  const tabSwitcher = setting(SETTINGS.tabSwitcherEnabled);
  const currentWindowOnly = setting(SETTINGS.tabSwitcherCurrentWindowOnly);
  const linkPreview = setting(SETTINGS.linkPreviewEnabled);
  const pinnedTabRecovery = setting(SETTINGS.pinnedTabRecoveryEnabled);
  const selectionQuickActions = setting(SETTINGS.selectionQuickActionsEnabled);
  const selectionProvider = setting(SETTINGS.selectionQuickActionsProvider);
  const selectionGroup = setting(SETTINGS.selectionQuickActionsGroupEnabled);
  const toggles = [autoPip, tabSwitcher, currentWindowOnly, linkPreview, pinnedTabRecovery, selectionQuickActions, selectionGroup];
  // Shown once the tab switcher's shortcut is known.
  let ctrlTabLink: SettingsLinkModel | null = null;

  const controller = view({
    onToggle(key, checked) {
      const target = toggles.find((entry) => entry.storageKey === key);
      if (!target || (target === autoPip && autoPipUnsupported)) {
        return;
      }
      target.change(checked);
    },
    onSelect(key, value) {
      if (key === selectionProvider.storageKey) {
        selectionProvider.change(SETTINGS.selectionQuickActionsProvider.parse(value));
      }
    },
    getViewportTopInset
  });

  function getRows(): SettingsRowModel[] {
    const selectionOff = !selectionQuickActions.get();
    return [
      { type: 'header', key: 'header', title: getMessage('settings_features_section_title', '功能') },
      {
        type: 'toggle',
        key: autoPip.storageKey,
        title: {
          text: getMessage('settings_auto_pip_title', '视频自动画中画'),
          info: getMessage('settings_auto_pip_desc', '在网页上播放视频时，若切换至其他标签页，则正在播放中的视频将以浮窗的形式播放')
        },
        unsupported: {
          browser: AUTO_PIP_UNSUPPORTED_BROWSER,
          reasonKey: 'settings_auto_pip_unsupported_tooltip',
          active: autoPipUnsupported
        },
        // Stays off without touching the synced value other browsers use.
        toggle: {
          id: '_x_extension_auto_pip_toggle_2024_unique_',
          checked: autoPipUnsupported ? false : autoPip.get(),
          disabled: autoPipUnsupported
        }
      },
      {
        type: 'toggle',
        key: tabSwitcher.storageKey,
        title: {
          text: getMessage('settings_tab_switcher_title', '标签切换器'),
          info: getMessage('settings_tab_switcher_desc', '快速切换最近标签页，默认 {shortcut}，可自定义')
            .replace('{shortcut}', getTabSwitcherShortcut())
        },
        toggle: { id: '_x_extension_tab_switcher_toggle_2026_unique_', checked: tabSwitcher.get() },
        link: ctrlTabLink
      },
      {
        type: 'reveal',
        key: 'tab-switcher-subrows',
        id: '_x_extension_tab_switcher_subrows_2026_unique_',
        expanded: tabSwitcher.get(),
        rows: [{
          type: 'toggle',
          key: currentWindowOnly.storageKey,
          subrow: true,
          title: {
            text: getMessage('settings_tab_switcher_current_window_only_title', '只显示当前窗口的标签页'),
            info: getMessage(
              'settings_tab_switcher_current_window_only_desc',
              '适用于把每个空间放在独立窗口的浏览器，避免列出其他空间的标签页'
            )
          },
          toggle: {
            id: '_x_extension_tab_switcher_current_window_only_toggle_2026_unique_',
            checked: currentWindowOnly.get(),
            ariaLabel: getMessage('settings_tab_switcher_current_window_only_title', '只显示当前窗口的标签页')
          }
        }]
      },
      {
        type: 'toggle',
        key: linkPreview.storageKey,
        title: {
          text: getMessage('settings_link_preview_title', '网页预览'),
          badge: 'Beta',
          info: getMessage('settings_link_preview_desc', '按住 Shift 点击链接，在页面上的小窗中预览，可随时关闭或移到新标签页')
        },
        toggle: { id: '_x_extension_link_preview_toggle_2026_unique_', checked: linkPreview.get() }
      },
      {
        type: 'toggle',
        key: pinnedTabRecovery.storageKey,
        title: {
          text: getMessage('settings_pinned_tab_recovery_title', '重启后恢复置顶标签页'),
          info: getMessage('settings_pinned_tab_recovery_desc', '记录可恢复的置顶网页标签页，在浏览器重启后自动补回')
        },
        toggle: { id: '_x_extension_pinned_tab_recovery_toggle_2026_unique_', checked: pinnedTabRecovery.get() }
      },
      {
        type: 'toggle',
        key: selectionQuickActions.storageKey,
        title: {
          text: getMessage('settings_selection_quick_actions_title', '划词快捷操作'),
          info: getMessage('settings_selection_quick_actions_desc', '选中文字后显示 AI 操作')
        },
        toggle: { id: '_x_extension_selection_quick_actions_toggle_2026_unique_', checked: selectionQuickActions.get() }
      },
      {
        type: 'reveal',
        key: 'selection-quick-actions-subrows',
        id: '_x_extension_selection_quick_actions_subrows_2026_unique_',
        expanded: !selectionOff,
        rows: [
          {
            type: 'select',
            key: selectionProvider.storageKey,
            rowId: '_x_extension_selection_quick_actions_provider_row_2026_unique_',
            subrow: true,
            className: '_x_extension_selection_provider_row_2026_unique_',
            disabled: selectionOff,
            title: {
              text: getMessage('settings_selection_quick_actions_provider_title', '优先 Provider'),
              id: '_x_extension_selection_quick_actions_provider_select_2026_unique__title'
            },
            select: {
              id: '_x_extension_selection_quick_actions_provider_select_2026_unique_',
              disabled: selectionOff,
              labelledBy: '_x_extension_selection_quick_actions_provider_select_2026_unique__title',
              value: selectionProvider.get(),
              items: SELECTION_PROVIDERS.map((item) => ({
                value: item.value,
                labelKey: item.labelKey,
                label: getMessage(item.labelKey, item.fallback),
                iconUrl: getAssetUrl(`assets/images/site-search/tile-${item.value}.png`)
              }))
            }
          },
          {
            type: 'toggle',
            key: selectionGroup.storageKey,
            rowId: '_x_extension_selection_quick_actions_group_row_2026_unique_',
            subrow: true,
            disabled: selectionOff,
            title: {
              text: getMessage('settings_selection_quick_actions_group_title', '在后台查询'),
              info: getMessage('settings_selection_quick_actions_group_desc', '所有 AI 网页皆归入「AI 查询」标签组')
            },
            toggle: {
              id: '_x_extension_selection_quick_actions_group_toggle_2026_unique_',
              checked: selectionGroup.get(),
              disabled: selectionOff
            }
          }
        ]
      }
    ];
  }

  function bindSettings(settingBinder: SectionSettingBinder): void {
    [...toggles, selectionProvider].forEach((entry) => entry.bind(settingBinder));
  }

  // The tab switcher's guide to Ctrl+Tab, which the browser's shortcuts
  // page cannot bind; Chromium only.
  function setCtrlTabLink(link: { href: string; label: string; bound: boolean }): void {
    ctrlTabLink = { ...link, id: '_x_extension_tab_switcher_ctrl_tab_link_2026_unique_', browserOnly: 'chromium' };
    render();
  }

  render();

  return { render, bindSettings, destroy: () => controller.destroy(), setCtrlTabLink };
}

export { createGeneralFeaturesSection };
export type { GeneralFeaturesSectionDeps };
