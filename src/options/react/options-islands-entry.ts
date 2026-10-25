import { createToastApi } from '../../shared/react/toast';
import { createSegmentedIndicatorApi } from '../../shared/react/segmented-indicator';
import { createAggregateSearchListApi } from './aggregate-search-list';
import { createBlacklistTabApi } from './blacklist-tab';
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
import { createWebDavListApi } from './webdav-list';
import { createThemePickerApi } from './theme-picker';
import { createTranslationHelpApi } from './translation-help';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';
import { createTabSwitcherViewApi } from '../../shared/react/tab-switcher';

declare global {
  var LumnoOptionsReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOptionsReactIslands: {
      aggregateSearchList: ReturnType<typeof createAggregateSearchListApi>;
      blacklistTab: ReturnType<typeof createBlacklistTabApi>;
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
      webDavList: ReturnType<typeof createWebDavListApi>;
      themePicker: ReturnType<typeof createThemePickerApi>;
      translationHelp: ReturnType<typeof createTranslationHelpApi>;
      toast: ReturnType<typeof createToastApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
  var LumnoOptionsAggregateSearchListReact: ReturnType<typeof createAggregateSearchListApi> | undefined;
  var LumnoOptionsBlacklistTabReact: ReturnType<typeof createBlacklistTabApi> | undefined;
  var LumnoOptionsFeedbackSupportReact: ReturnType<typeof createFeedbackSupportApi> | undefined;
  var LumnoOptionsInfoButtonReact: ReturnType<typeof createInfoButtonApi> | undefined;
  var LumnoOptionsPopconfirmReact: ReturnType<typeof createPopconfirmApi> | undefined;
  var LumnoOptionsSegmentedControlReact: ReturnType<typeof createSegmentedControlApi> | undefined;
  var LumnoOptionsSelectControlReact: ReturnType<typeof createSelectControlApi> | undefined;
  var LumnoOptionsSettingsNavigationReact: ReturnType<typeof createSettingsNavigationApi> | undefined;
  var LumnoOptionsSettingsControlsReact: ReturnType<typeof createSettingsControlsApi> | undefined;
  var LumnoOptionsSettingsFormsReact: ReturnType<typeof createSettingsFormsApi> | undefined;
  var LumnoOptionsShortcutReferenceReact: ReturnType<typeof createShortcutReferenceApi> | undefined;
  var LumnoOptionsShortcutHotkeyReact: ReturnType<typeof createShortcutHotkeyApi> | undefined;
  var LumnoOptionsSiteSearchListReact: ReturnType<typeof createSiteSearchListApi> | undefined;
  var LumnoOptionsThemePickerReact: ReturnType<typeof createThemePickerApi> | undefined;
  var LumnoOptionsToastReact: ReturnType<typeof createToastApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOverlayTabSwitcherViewReact: ReturnType<typeof createTabSwitcherViewApi> | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOptionsReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const aggregateSearchListApi = createAggregateSearchListApi();
  const blacklistTabApi = createBlacklistTabApi();
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
  const webDavListApi = createWebDavListApi();
  const themePickerApi = createThemePickerApi();
  const translationHelpApi = createTranslationHelpApi();
  const toastApi = createToastApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoOptionsAggregateSearchListReact = aggregateSearchListApi;
  runtime.LumnoOptionsAggregateSearchList = aggregateSearchListApi;
  runtime.LumnoOptionsBlacklistTabReact = blacklistTabApi;
  runtime.LumnoOptionsBlacklistTab = blacklistTabApi;
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
  runtime.LumnoOptionsWebDavList = webDavListApi;
  runtime.LumnoOptionsThemePickerReact = themePickerApi;
  runtime.LumnoOptionsThemePicker = themePickerApi;
  runtime.LumnoOptionsTranslationHelp = translationHelpApi;
  runtime.LumnoOptionsToastReact = toastApi;
  runtime.LumnoOptionsToast = toastApi;
  runtime.LumnoTooltipViewReact = tooltipViewApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoSegmentedIndicator = createSegmentedIndicatorApi();
  runtime.LumnoOverlayTabSwitcherViewReact = tabSwitcherApi;
  runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
  runtime.LumnoOptionsReactIslands = Object.freeze({
    aggregateSearchList: aggregateSearchListApi,
    blacklistTab: blacklistTabApi,
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
    webDavList: webDavListApi,
    themePicker: themePickerApi,
    translationHelp: translationHelpApi,
    toast: toastApi,
    tabSwitcher: tabSwitcherApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
