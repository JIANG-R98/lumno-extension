import { createToastApi } from '../../shared/react/toast';
import { createSegmentedIndicatorApi } from '../../shared/react/segmented-indicator';
import { createAccountTabApi } from './account-tab';
import { createShortcutsTabApi } from './shortcuts-tab';
import { createBlacklistTabApi } from './blacklist-tab';
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
      settingsNavigation: ReturnType<typeof createSettingsNavigationApi>;
      settingsControls: ReturnType<typeof createSettingsControlsApi>;
      shortcutsTab: ReturnType<typeof createShortcutsTabApi>;
      toast: ReturnType<typeof createToastApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
}

const runtime = globalThis;

const bootstrapState = runtime.LumnoOptionsReactBootstrap;

if (!bootstrapState || !bootstrapState.reactReady) {
  const accountTabApi = createAccountTabApi();
  const blacklistTabApi = createBlacklistTabApi();
  const settingsNavigationApi = createSettingsNavigationApi();
  const settingsControlsApi = createSettingsControlsApi();
  const shortcutsTabApi = createShortcutsTabApi();
  const toastApi = createToastApi();
  const tooltipViewApi = createTooltipViewApi();
  const tabSwitcherApi =
    runtime.LumnoOverlayTabSwitcherView || createTabSwitcherViewApi();

  runtime.LumnoOptionsAccountTab = accountTabApi;
  runtime.LumnoOptionsBlacklistTab = blacklistTabApi;
  runtime.LumnoOptionsSettingsNavigation = settingsNavigationApi;
  runtime.LumnoOptionsSettingsControls = settingsControlsApi;
  runtime.LumnoOptionsShortcutsTab = shortcutsTabApi;
  runtime.LumnoOptionsToast = toastApi;
  runtime.LumnoTooltipView = tooltipViewApi;
  runtime.LumnoSegmentedIndicator = createSegmentedIndicatorApi();
  runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
  runtime.LumnoOptionsReactIslands = Object.freeze({
    accountTab: accountTabApi,
    blacklistTab: blacklistTabApi,
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
