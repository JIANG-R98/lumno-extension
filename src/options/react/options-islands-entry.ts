import { createToastApi } from '../../shared/react/toast';
import { createSegmentedIndicatorApi } from '../../shared/react/segmented-indicator';
import { createAccountTabApi } from './account-tab';
import { createShortcutsTabApi } from './shortcuts-tab';
import { createBlacklistTabApi } from './blacklist-tab';
import { createInfoButtonApi } from './info-button';
import { createSegmentedControlApi } from './segmented-control';
import { createSettingsNavigationApi } from './settings-navigation';
import { createSettingsControlsApi } from './settings-controls';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';
import { createTabSwitcherViewApi } from '../../shared/react/tab-switcher';

declare global {
  var LumnoOptionsReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOptionsReactIslands: {
      accountTab: ReturnType<typeof createAccountTabApi>;
      blacklistTab: ReturnType<typeof createBlacklistTabApi>;
      infoButton: ReturnType<typeof createInfoButtonApi>;
      segmentedControl: ReturnType<typeof createSegmentedControlApi>;
      settingsNavigation: ReturnType<typeof createSettingsNavigationApi>;
      settingsControls: ReturnType<typeof createSettingsControlsApi>;
      shortcutsTab: ReturnType<typeof createShortcutsTabApi>;
      toast: ReturnType<typeof createToastApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
  var LumnoOptionsBlacklistTabReact: ReturnType<typeof createBlacklistTabApi> | undefined;
  var LumnoOptionsInfoButtonReact: ReturnType<typeof createInfoButtonApi> | undefined;
  var LumnoOptionsSegmentedControlReact: ReturnType<typeof createSegmentedControlApi> | undefined;
  var LumnoOptionsSettingsNavigationReact: ReturnType<typeof createSettingsNavigationApi> | undefined;
  var LumnoOptionsSettingsControlsReact: ReturnType<typeof createSettingsControlsApi> | undefined;
  var LumnoOptionsToastReact: ReturnType<typeof createToastApi> | undefined;
  var LumnoTooltipViewReact: ReturnType<typeof createTooltipViewApi> | undefined;
  var LumnoOverlayTabSwitcherViewReact: ReturnType<typeof createTabSwitcherViewApi> | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOptionsReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const accountTabApi = createAccountTabApi();
  const blacklistTabApi = createBlacklistTabApi();
  const infoButtonApi = createInfoButtonApi();
  const segmentedControlApi = createSegmentedControlApi();
  const settingsNavigationApi = createSettingsNavigationApi();
  const settingsControlsApi = createSettingsControlsApi();
  const shortcutsTabApi = createShortcutsTabApi();
  const toastApi = createToastApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoOptionsAccountTab = accountTabApi;
  runtime.LumnoOptionsBlacklistTabReact = blacklistTabApi;
  runtime.LumnoOptionsBlacklistTab = blacklistTabApi;
  runtime.LumnoOptionsInfoButtonReact = infoButtonApi;
  runtime.LumnoOptionsInfoButton = infoButtonApi;
  runtime.LumnoOptionsSegmentedControlReact = segmentedControlApi;
  runtime.LumnoOptionsSegmentedControl = segmentedControlApi;
  runtime.LumnoOptionsSettingsNavigationReact = settingsNavigationApi;
  runtime.LumnoOptionsSettingsNavigation = settingsNavigationApi;
  runtime.LumnoOptionsSettingsControlsReact = settingsControlsApi;
  runtime.LumnoOptionsSettingsControls = settingsControlsApi;
  runtime.LumnoOptionsShortcutsTab = shortcutsTabApi;
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
    infoButton: infoButtonApi,
    segmentedControl: segmentedControlApi,
    settingsNavigation: settingsNavigationApi,
    settingsControls: settingsControlsApi,
    shortcutsTab: shortcutsTabApi,
    toast: toastApi,
    tabSwitcher: tabSwitcherApi
  });

  if (bootstrapState) {
    bootstrapState.reactReady = true;
  }
}
