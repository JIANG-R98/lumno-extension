import { createToastApi } from '../shared/toast';
import { createAggregateSearchListApi } from './aggregate-search-list';
import { createBlacklistListApi } from './blacklist-list';
import { createFeedbackSupportApi } from './feedback-support';
import { createInfoButtonApi } from './info-button';
import { createPopconfirmApi } from './popconfirm';
import { createSegmentedControlApi } from './segmented-control';
import { createSelectControlApi } from './select-control';
import { createSettingsNavigationApi } from './settings-navigation';
import { createSettingsControlsApi } from './settings-controls';
import { createSettingsFormsApi } from './settings-forms';
import { createShortcutReferenceApi } from './shortcut-reference';
import { createShortcutHotkeyApi } from './shortcut-hotkey';
import { createSiteSearchListApi } from './site-search-list';
import { createThemePickerApi } from './theme-picker';
import { createTooltipViewApi } from '../shared/tooltip-view';
import { createTabSwitcherViewApi } from '../overlay/tab-switcher';

const runtime = globalThis as typeof globalThis & {
  LumnoOptionsReactBootstrap?: {
    reactReady: boolean;
  };
  LumnoOptionsReactIslands?: {
    aggregateSearchList: ReturnType<typeof createAggregateSearchListApi>;
    blacklistList: ReturnType<typeof createBlacklistListApi>;
    feedbackSupport: ReturnType<typeof createFeedbackSupportApi>;
    infoButton: ReturnType<typeof createInfoButtonApi>;
    popconfirm: ReturnType<typeof createPopconfirmApi>;
    segmentedControl: ReturnType<typeof createSegmentedControlApi>;
    selectControl: ReturnType<typeof createSelectControlApi>;
    settingsNavigation: ReturnType<typeof createSettingsNavigationApi>;
    settingsControls: ReturnType<typeof createSettingsControlsApi>;
    settingsForms: ReturnType<typeof createSettingsFormsApi>;
    shortcutReference: ReturnType<typeof createShortcutReferenceApi>;
    shortcutHotkey: ReturnType<typeof createShortcutHotkeyApi>;
    siteSearchList: ReturnType<typeof createSiteSearchListApi>;
    themePicker: ReturnType<typeof createThemePickerApi>;
    toast: ReturnType<typeof createToastApi>;
    tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
  };
  LumnoOptionsAggregateSearchList?: ReturnType<typeof createAggregateSearchListApi>;
  LumnoOptionsAggregateSearchListReact?: ReturnType<typeof createAggregateSearchListApi>;
  LumnoOptionsBlacklistList?: ReturnType<typeof createBlacklistListApi>;
  LumnoOptionsBlacklistListReact?: ReturnType<typeof createBlacklistListApi>;
  LumnoOptionsFeedbackSupport?: ReturnType<typeof createFeedbackSupportApi>;
  LumnoOptionsFeedbackSupportReact?: ReturnType<typeof createFeedbackSupportApi>;
  LumnoOptionsInfoButton?: ReturnType<typeof createInfoButtonApi>;
  LumnoOptionsInfoButtonReact?: ReturnType<typeof createInfoButtonApi>;
  LumnoOptionsPopconfirm?: ReturnType<typeof createPopconfirmApi>;
  LumnoOptionsPopconfirmReact?: ReturnType<typeof createPopconfirmApi>;
  LumnoOptionsSegmentedControl?: ReturnType<typeof createSegmentedControlApi>;
  LumnoOptionsSegmentedControlReact?: ReturnType<typeof createSegmentedControlApi>;
  LumnoOptionsSelectControl?: ReturnType<typeof createSelectControlApi>;
  LumnoOptionsSelectControlReact?: ReturnType<typeof createSelectControlApi>;
  LumnoOptionsSettingsNavigation?: ReturnType<typeof createSettingsNavigationApi>;
  LumnoOptionsSettingsNavigationReact?: ReturnType<typeof createSettingsNavigationApi>;
  LumnoOptionsSettingsControls?: ReturnType<typeof createSettingsControlsApi>;
  LumnoOptionsSettingsControlsReact?: ReturnType<typeof createSettingsControlsApi>;
  LumnoOptionsSettingsForms?: ReturnType<typeof createSettingsFormsApi>;
  LumnoOptionsSettingsFormsReact?: ReturnType<typeof createSettingsFormsApi>;
  LumnoOptionsShortcutReference?: ReturnType<typeof createShortcutReferenceApi>;
  LumnoOptionsShortcutReferenceReact?: ReturnType<typeof createShortcutReferenceApi>;
  LumnoOptionsShortcutHotkey?: ReturnType<typeof createShortcutHotkeyApi>;
  LumnoOptionsShortcutHotkeyReact?: ReturnType<typeof createShortcutHotkeyApi>;
  LumnoOptionsSiteSearchList?: ReturnType<typeof createSiteSearchListApi>;
  LumnoOptionsSiteSearchListReact?: ReturnType<typeof createSiteSearchListApi>;
  LumnoOptionsThemePicker?: ReturnType<typeof createThemePickerApi>;
  LumnoOptionsThemePickerReact?: ReturnType<typeof createThemePickerApi>;
  LumnoOptionsToast?: ReturnType<typeof createToastApi>;
  LumnoOptionsToastReact?: ReturnType<typeof createToastApi>;
  LumnoTooltipView?: ReturnType<typeof createTooltipViewApi>;
  LumnoTooltipViewReact?: ReturnType<typeof createTooltipViewApi>;
  LumnoOverlayTabSwitcherView?: ReturnType<typeof createTabSwitcherViewApi>;
  LumnoOverlayTabSwitcherViewReact?: ReturnType<typeof createTabSwitcherViewApi>;
};

const bootstrapState = runtime.LumnoOptionsReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const aggregateSearchListApi = createAggregateSearchListApi();
  const blacklistListApi = createBlacklistListApi();
  const feedbackSupportApi = createFeedbackSupportApi();
  const infoButtonApi = createInfoButtonApi();
  const popconfirmApi = createPopconfirmApi();
  const segmentedControlApi = createSegmentedControlApi();
  const selectControlApi = createSelectControlApi();
  const settingsNavigationApi = createSettingsNavigationApi();
  const settingsControlsApi = createSettingsControlsApi();
  const settingsFormsApi = createSettingsFormsApi();
  const shortcutReferenceApi = createShortcutReferenceApi();
  const shortcutHotkeyApi = createShortcutHotkeyApi();
  const siteSearchListApi = createSiteSearchListApi();
  const themePickerApi = createThemePickerApi();
  const toastApi = createToastApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoOptionsAggregateSearchListReact = aggregateSearchListApi;
  runtime.LumnoOptionsAggregateSearchList = aggregateSearchListApi;
  runtime.LumnoOptionsBlacklistListReact = blacklistListApi;
  runtime.LumnoOptionsBlacklistList = blacklistListApi;
  runtime.LumnoOptionsFeedbackSupportReact = feedbackSupportApi;
  runtime.LumnoOptionsFeedbackSupport = feedbackSupportApi;
  runtime.LumnoOptionsInfoButtonReact = infoButtonApi;
  runtime.LumnoOptionsInfoButton = infoButtonApi;
  runtime.LumnoOptionsPopconfirmReact = popconfirmApi;
  runtime.LumnoOptionsPopconfirm = popconfirmApi;
  runtime.LumnoOptionsSegmentedControlReact = segmentedControlApi;
  runtime.LumnoOptionsSegmentedControl = segmentedControlApi;
  runtime.LumnoOptionsSelectControlReact = selectControlApi;
  runtime.LumnoOptionsSelectControl = selectControlApi;
  runtime.LumnoOptionsSettingsNavigationReact = settingsNavigationApi;
  runtime.LumnoOptionsSettingsNavigation = settingsNavigationApi;
  runtime.LumnoOptionsSettingsControlsReact = settingsControlsApi;
  runtime.LumnoOptionsSettingsControls = settingsControlsApi;
  runtime.LumnoOptionsSettingsFormsReact = settingsFormsApi;
  runtime.LumnoOptionsSettingsForms = settingsFormsApi;
  runtime.LumnoOptionsShortcutReferenceReact = shortcutReferenceApi;
  runtime.LumnoOptionsShortcutReference = shortcutReferenceApi;
  runtime.LumnoOptionsShortcutHotkeyReact = shortcutHotkeyApi;
  runtime.LumnoOptionsShortcutHotkey = shortcutHotkeyApi;
  runtime.LumnoOptionsSiteSearchListReact = siteSearchListApi;
  runtime.LumnoOptionsSiteSearchList = siteSearchListApi;
  runtime.LumnoOptionsThemePickerReact = themePickerApi;
  runtime.LumnoOptionsThemePicker = themePickerApi;
  runtime.LumnoOptionsToastReact = toastApi;
  runtime.LumnoOptionsToast = toastApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoOverlayTabSwitcherViewReact = tabSwitcherApi;
  runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
  runtime.LumnoOptionsReactIslands = Object.freeze({
    aggregateSearchList: aggregateSearchListApi,
    blacklistList: blacklistListApi,
    feedbackSupport: feedbackSupportApi,
    infoButton: infoButtonApi,
    popconfirm: popconfirmApi,
    segmentedControl: segmentedControlApi,
    selectControl: selectControlApi,
    settingsNavigation: settingsNavigationApi,
    settingsControls: settingsControlsApi,
    settingsForms: settingsFormsApi,
    shortcutReference: shortcutReferenceApi,
    shortcutHotkey: shortcutHotkeyApi,
    siteSearchList: siteSearchListApi,
    themePicker: themePickerApi,
    toast: toastApi,
    tabSwitcher: tabSwitcherApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
