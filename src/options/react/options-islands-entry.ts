import { createToastApi } from '../../shared/react/toast';
import { createSegmentedIndicatorApi } from '../../shared/react/segmented-indicator';
import { createAccountTabApi } from './account-tab';
import { createShortcutsTabApi } from './shortcuts-tab';
import { createBlacklistTabApi } from './blacklist-tab';
import { createFeedbackSupportApi } from './feedback-support';
import { createInfoButtonApi } from './info-button';
import { createSegmentedControlApi } from './segmented-control';
import { createSelectControlApi } from './select-control';
import { createSettingsNavigationApi } from './settings-navigation';
import { createSettingsControlsApi } from './settings-controls';
import { createThemePickerApi } from './theme-picker';
import { createTranslationHelpApi } from './translation-help';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';
import { createTabSwitcherViewApi } from '../../shared/react/tab-switcher';

declare global {
  var LumnoOptionsReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOptionsReactIslands: {
      accountTab: ReturnType<typeof createAccountTabApi>;
      blacklistTab: ReturnType<typeof createBlacklistTabApi>;
      feedbackSupport: ReturnType<typeof createFeedbackSupportApi>;
      infoButton: ReturnType<typeof createInfoButtonApi>;
      segmentedControl: ReturnType<typeof createSegmentedControlApi>;
      selectControl: ReturnType<typeof createSelectControlApi>;
      settingsNavigation: ReturnType<typeof createSettingsNavigationApi>;
      settingsControls: ReturnType<typeof createSettingsControlsApi>;
      shortcutsTab: ReturnType<typeof createShortcutsTabApi>;
      themePicker: ReturnType<typeof createThemePickerApi>;
      translationHelp: ReturnType<typeof createTranslationHelpApi>;
      toast: ReturnType<typeof createToastApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
  var LumnoOptionsBlacklistTabReact: ReturnType<typeof createBlacklistTabApi> | undefined;
  var LumnoOptionsFeedbackSupportReact: ReturnType<typeof createFeedbackSupportApi> | undefined;
  var LumnoOptionsInfoButtonReact: ReturnType<typeof createInfoButtonApi> | undefined;
  var LumnoOptionsSegmentedControlReact: ReturnType<typeof createSegmentedControlApi> | undefined;
  var LumnoOptionsSelectControlReact: ReturnType<typeof createSelectControlApi> | undefined;
  var LumnoOptionsSettingsNavigationReact: ReturnType<typeof createSettingsNavigationApi> | undefined;
  var LumnoOptionsSettingsControlsReact: ReturnType<typeof createSettingsControlsApi> | undefined;
  var LumnoOptionsThemePickerReact: ReturnType<typeof createThemePickerApi> | undefined;
  var LumnoOptionsToastReact: ReturnType<typeof createToastApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOverlayTabSwitcherViewReact: ReturnType<typeof createTabSwitcherViewApi> | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOptionsReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const accountTabApi = createAccountTabApi();
  const blacklistTabApi = createBlacklistTabApi();
  const feedbackSupportApi = createFeedbackSupportApi();
  const infoButtonApi = createInfoButtonApi();
  const segmentedControlApi = createSegmentedControlApi();
  const selectControlApi = createSelectControlApi();
  const settingsNavigationApi = createSettingsNavigationApi();
  const settingsControlsApi = createSettingsControlsApi();
  const shortcutsTabApi = createShortcutsTabApi();
  const themePickerApi = createThemePickerApi();
  const translationHelpApi = createTranslationHelpApi();
  const toastApi = createToastApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoOptionsAccountTab = accountTabApi;
  runtime.LumnoOptionsBlacklistTabReact = blacklistTabApi;
  runtime.LumnoOptionsBlacklistTab = blacklistTabApi;
  runtime.LumnoOptionsFeedbackSupportReact = feedbackSupportApi;
  runtime.LumnoOptionsFeedbackSupport = feedbackSupportApi;
  runtime.LumnoOptionsInfoButtonReact = infoButtonApi;
  runtime.LumnoOptionsInfoButton = infoButtonApi;
  runtime.LumnoOptionsSegmentedControlReact = segmentedControlApi;
  runtime.LumnoOptionsSegmentedControl = segmentedControlApi;
  runtime.LumnoOptionsSelectControlReact = selectControlApi;
  runtime.LumnoOptionsSelectControl = selectControlApi;
  runtime.LumnoOptionsSettingsNavigationReact = settingsNavigationApi;
  runtime.LumnoOptionsSettingsNavigation = settingsNavigationApi;
  runtime.LumnoOptionsSettingsControlsReact = settingsControlsApi;
  runtime.LumnoOptionsSettingsControls = settingsControlsApi;
  runtime.LumnoOptionsShortcutsTab = shortcutsTabApi;
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
    accountTab: accountTabApi,
    blacklistTab: blacklistTabApi,
    feedbackSupport: feedbackSupportApi,
    infoButton: infoButtonApi,
    segmentedControl: segmentedControlApi,
    selectControl: selectControlApi,
    settingsNavigation: settingsNavigationApi,
    settingsControls: settingsControlsApi,
    shortcutsTab: shortcutsTabApi,
    themePicker: themePickerApi,
    translationHelp: translationHelpApi,
    toast: toastApi,
    tabSwitcher: tabSwitcherApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
