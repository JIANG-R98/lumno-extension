import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactBootstrap');
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactIslands');
  Reflect.deleteProperty(runtime, 'LumnoOptionsAggregateSearchList');
  Reflect.deleteProperty(runtime, 'LumnoOptionsAggregateSearchListReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsBlacklistList');
  Reflect.deleteProperty(runtime, 'LumnoOptionsBlacklistListReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsFeedbackSupport');
  Reflect.deleteProperty(runtime, 'LumnoOptionsFeedbackSupportReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsTranslationHelp');
  Reflect.deleteProperty(runtime, 'LumnoOptionsInfoButton');
  Reflect.deleteProperty(runtime, 'LumnoOptionsInfoButtonReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsPopconfirm');
  Reflect.deleteProperty(runtime, 'LumnoOptionsPopconfirmReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSegmentedControl');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSegmentedControlReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSelectControl');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSelectControlReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsNavigation');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsNavigationReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsControls');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsControlsReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsForms');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsFormsReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutReference');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutReferenceReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutHotkey');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutHotkeyReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSiteSearchList');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSiteSearchListReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsWebDavList');
  Reflect.deleteProperty(runtime, 'LumnoOptionsThemePicker');
  Reflect.deleteProperty(runtime, 'LumnoOptionsThemePickerReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsToast');
  Reflect.deleteProperty(runtime, 'LumnoOptionsToastReact');
  Reflect.deleteProperty(runtime, 'LumnoOverlayTabSwitcherView');
  Reflect.deleteProperty(runtime, 'LumnoOverlayTabSwitcherViewReact');
}

afterEach(() => {
  clearRuntime();
  vi.resetModules();
});

describe('Options React islands entry', () => {
  it('installs the Popconfirm and Toast APIs and marks the bootstrap ready', async () => {
    runtime.LumnoOptionsReactBootstrap = {
      reactReady: false
    };

    await import('./options-islands-entry');

    expect(runtime.LumnoOptionsReactBootstrap.reactReady).toBe(true);
    expect(runtime.LumnoOptionsAggregateSearchList?.implementation).toBe('react');
    expect(runtime.LumnoOptionsAggregateSearchListReact).toBe(
      runtime.LumnoOptionsAggregateSearchList
    );
    expect(runtime.LumnoOptionsBlacklistList?.implementation).toBe('react');
    expect(runtime.LumnoOptionsBlacklistListReact).toBe(
      runtime.LumnoOptionsBlacklistList
    );
    expect(runtime.LumnoOptionsFeedbackSupport?.implementation).toBe('react');
    expect(runtime.LumnoOptionsFeedbackSupportReact).toBe(
      runtime.LumnoOptionsFeedbackSupport
    );
    expect(runtime.LumnoOptionsInfoButton?.implementation).toBe('react');
    expect(runtime.LumnoOptionsInfoButtonReact).toBe(
      runtime.LumnoOptionsInfoButton
    );
    expect(runtime.LumnoOptionsPopconfirm?.implementation).toBe('react');
    expect(runtime.LumnoOptionsPopconfirmReact).toBe(
      runtime.LumnoOptionsPopconfirm
    );
    expect(runtime.LumnoOptionsSegmentedControl?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSegmentedControlReact).toBe(
      runtime.LumnoOptionsSegmentedControl
    );
    expect(runtime.LumnoOptionsSelectControl?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSelectControlReact).toBe(
      runtime.LumnoOptionsSelectControl
    );
    expect(runtime.LumnoOptionsSettingsNavigation?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsNavigationReact).toBe(
      runtime.LumnoOptionsSettingsNavigation
    );
    expect(runtime.LumnoOptionsSettingsControls?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsControlsReact).toBe(
      runtime.LumnoOptionsSettingsControls
    );
    expect(runtime.LumnoOptionsSettingsForms?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsFormsReact).toBe(
      runtime.LumnoOptionsSettingsForms
    );
    expect(runtime.LumnoOptionsShortcutReference?.implementation).toBe('react');
    expect(runtime.LumnoOptionsShortcutReferenceReact).toBe(
      runtime.LumnoOptionsShortcutReference
    );
    expect(runtime.LumnoOptionsShortcutHotkey?.implementation).toBe('react');
    expect(runtime.LumnoOptionsShortcutHotkeyReact).toBe(
      runtime.LumnoOptionsShortcutHotkey
    );
    expect(runtime.LumnoOptionsSiteSearchList?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSiteSearchListReact).toBe(
      runtime.LumnoOptionsSiteSearchList
    );
    expect(runtime.LumnoOptionsThemePicker?.implementation).toBe('react');
    expect(runtime.LumnoOptionsThemePickerReact).toBe(
      runtime.LumnoOptionsThemePicker
    );
    expect(runtime.LumnoOptionsTranslationHelp?.implementation).toBe('react');
    expect(runtime.LumnoOptionsToast?.implementation).toBe('react');
    expect(runtime.LumnoOptionsToastReact).toBe(runtime.LumnoOptionsToast);
    expect(runtime.LumnoOverlayTabSwitcherView?.implementation).toBe('react');
    expect(runtime.LumnoOverlayTabSwitcherViewReact).toBe(
      runtime.LumnoOverlayTabSwitcherView
    );
    expect(runtime.LumnoOptionsReactIslands).toEqual({
      aggregateSearchList: runtime.LumnoOptionsAggregateSearchList,
      blacklistList: runtime.LumnoOptionsBlacklistList,
      feedbackSupport: runtime.LumnoOptionsFeedbackSupport,
      infoButton: runtime.LumnoOptionsInfoButton,
      popconfirm: runtime.LumnoOptionsPopconfirm,
      segmentedControl: runtime.LumnoOptionsSegmentedControl,
      selectControl: runtime.LumnoOptionsSelectControl,
      settingsNavigation: runtime.LumnoOptionsSettingsNavigation,
      settingsControls: runtime.LumnoOptionsSettingsControls,
      settingsForms: runtime.LumnoOptionsSettingsForms,
      shortcutReference: runtime.LumnoOptionsShortcutReference,
      shortcutHotkey: runtime.LumnoOptionsShortcutHotkey,
      siteSearchList: runtime.LumnoOptionsSiteSearchList,
      webDavList: runtime.LumnoOptionsWebDavList,
      themePicker: runtime.LumnoOptionsThemePicker,
      translationHelp: runtime.LumnoOptionsTranslationHelp,
      toast: runtime.LumnoOptionsToast,
      tabSwitcher: runtime.LumnoOverlayTabSwitcherView
    });
  });
});
