import { afterEach, describe, expect, it, vi } from 'vitest';

type OptionsRuntime = typeof globalThis & {
  LumnoOptionsReactBootstrap?: {
    reactReady: boolean;
  };
  LumnoOptionsReactIslands?: unknown;
  LumnoOptionsAggregateSearchList?: {
    implementation?: string;
  };
  LumnoOptionsAggregateSearchListReact?: {
    implementation?: string;
  };
  LumnoOptionsBlacklistList?: {
    implementation?: string;
  };
  LumnoOptionsBlacklistListReact?: {
    implementation?: string;
  };
  LumnoOptionsFeedbackSupport?: {
    implementation?: string;
  };
  LumnoOptionsFeedbackSupportReact?: {
    implementation?: string;
  };
  LumnoOptionsInfoButton?: {
    implementation?: string;
  };
  LumnoOptionsInfoButtonReact?: {
    implementation?: string;
  };
  LumnoOptionsPopconfirm?: {
    implementation?: string;
  };
  LumnoOptionsPopconfirmReact?: {
    implementation?: string;
  };
  LumnoOptionsSegmentedControl?: {
    implementation?: string;
  };
  LumnoOptionsSegmentedControlReact?: {
    implementation?: string;
  };
  LumnoOptionsSelectControl?: {
    implementation?: string;
  };
  LumnoOptionsSelectControlReact?: {
    implementation?: string;
  };
  LumnoOptionsSettingsNavigation?: {
    implementation?: string;
  };
  LumnoOptionsSettingsNavigationReact?: {
    implementation?: string;
  };
  LumnoOptionsSettingsControls?: {
    implementation?: string;
  };
  LumnoOptionsSettingsControlsReact?: {
    implementation?: string;
  };
  LumnoOptionsSettingsForms?: {
    implementation?: string;
  };
  LumnoOptionsSettingsFormsReact?: {
    implementation?: string;
  };
  LumnoOptionsShortcutReference?: {
    implementation?: string;
  };
  LumnoOptionsShortcutReferenceReact?: {
    implementation?: string;
  };
  LumnoOptionsShortcutHotkey?: {
    implementation?: string;
  };
  LumnoOptionsShortcutHotkeyReact?: {
    implementation?: string;
  };
  LumnoOptionsSiteSearchList?: {
    implementation?: string;
  };
  LumnoOptionsSiteSearchListReact?: {
    implementation?: string;
  };
  LumnoOptionsThemePicker?: {
    implementation?: string;
  };
  LumnoOptionsThemePickerReact?: {
    implementation?: string;
  };
  LumnoOptionsToast?: {
    implementation?: string;
  };
  LumnoOptionsToastReact?: {
    implementation?: string;
  };
  LumnoOverlayTabSwitcherView?: {
    implementation?: string;
  };
  LumnoOverlayTabSwitcherViewReact?: {
    implementation?: string;
  };
};

const runtime = globalThis as OptionsRuntime;

function clearRuntime(): void {
  delete runtime.LumnoOptionsReactBootstrap;
  delete runtime.LumnoOptionsReactIslands;
  delete runtime.LumnoOptionsAggregateSearchList;
  delete runtime.LumnoOptionsAggregateSearchListReact;
  delete runtime.LumnoOptionsBlacklistList;
  delete runtime.LumnoOptionsBlacklistListReact;
  delete runtime.LumnoOptionsFeedbackSupport;
  delete runtime.LumnoOptionsFeedbackSupportReact;
  delete runtime.LumnoOptionsInfoButton;
  delete runtime.LumnoOptionsInfoButtonReact;
  delete runtime.LumnoOptionsPopconfirm;
  delete runtime.LumnoOptionsPopconfirmReact;
  delete runtime.LumnoOptionsSegmentedControl;
  delete runtime.LumnoOptionsSegmentedControlReact;
  delete runtime.LumnoOptionsSelectControl;
  delete runtime.LumnoOptionsSelectControlReact;
  delete runtime.LumnoOptionsSettingsNavigation;
  delete runtime.LumnoOptionsSettingsNavigationReact;
  delete runtime.LumnoOptionsSettingsControls;
  delete runtime.LumnoOptionsSettingsControlsReact;
  delete runtime.LumnoOptionsSettingsForms;
  delete runtime.LumnoOptionsSettingsFormsReact;
  delete runtime.LumnoOptionsShortcutReference;
  delete runtime.LumnoOptionsShortcutReferenceReact;
  delete runtime.LumnoOptionsShortcutHotkey;
  delete runtime.LumnoOptionsShortcutHotkeyReact;
  delete runtime.LumnoOptionsSiteSearchList;
  delete runtime.LumnoOptionsSiteSearchListReact;
  delete runtime.LumnoOptionsThemePicker;
  delete runtime.LumnoOptionsThemePickerReact;
  delete runtime.LumnoOptionsToast;
  delete runtime.LumnoOptionsToastReact;
  delete runtime.LumnoOverlayTabSwitcherView;
  delete runtime.LumnoOverlayTabSwitcherViewReact;
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
      themePicker: runtime.LumnoOptionsThemePicker,
      toast: runtime.LumnoOptionsToast,
      tabSwitcher: runtime.LumnoOverlayTabSwitcherView
    });
  });

  it('installs React APIs when bootstrap is waiting', async () => {
    runtime.LumnoOptionsReactBootstrap = {
      reactReady: false
    };

    await import('./options-islands-entry');

    expect(runtime.LumnoOptionsReactBootstrap.reactReady).toBe(true);
    expect(runtime.LumnoOptionsBlacklistList?.implementation).toBe('react');
    expect(runtime.LumnoOptionsReactIslands).toBeDefined();
  });
});
