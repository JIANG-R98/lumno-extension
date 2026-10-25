import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactBootstrap');
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactIslands');
  Reflect.deleteProperty(runtime, 'LumnoOptionsBlacklistTab');
  Reflect.deleteProperty(runtime, 'LumnoOptionsBlacklistTabReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsInfoButton');
  Reflect.deleteProperty(runtime, 'LumnoOptionsInfoButtonReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSegmentedControl');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSegmentedControlReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsNavigation');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsNavigationReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsControls');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsControlsReact');
  Reflect.deleteProperty(runtime, 'LumnoOptionsAccountTab');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutsTab');
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
  it('installs the views the page uses and marks the bootstrap ready', async () => {
    runtime.LumnoOptionsReactBootstrap = {
      reactReady: false
    };

    await import('./options-islands-entry');

    expect(runtime.LumnoOptionsReactBootstrap.reactReady).toBe(true);
    expect(runtime.LumnoOptionsAccountTab?.implementation).toBe('react');
    expect(runtime.LumnoOptionsShortcutsTab?.implementation).toBe('react');
    expect(runtime.LumnoOptionsBlacklistTab?.implementation).toBe('react');
    expect(runtime.LumnoOptionsBlacklistTabReact).toBe(
      runtime.LumnoOptionsBlacklistTab
    );
    expect(runtime.LumnoOptionsInfoButton?.implementation).toBe('react');
    expect(runtime.LumnoOptionsInfoButtonReact).toBe(
      runtime.LumnoOptionsInfoButton
    );
    expect(runtime.LumnoOptionsSegmentedControl?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSegmentedControlReact).toBe(
      runtime.LumnoOptionsSegmentedControl
    );
    expect(runtime.LumnoOptionsSettingsNavigation?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsNavigationReact).toBe(
      runtime.LumnoOptionsSettingsNavigation
    );
    expect(runtime.LumnoOptionsSettingsControls?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsControlsReact).toBe(
      runtime.LumnoOptionsSettingsControls
    );
    expect(runtime.LumnoOptionsToast?.implementation).toBe('react');
    expect(runtime.LumnoOptionsToastReact).toBe(runtime.LumnoOptionsToast);
    expect(runtime.LumnoOverlayTabSwitcherView?.implementation).toBe('react');
    expect(runtime.LumnoOverlayTabSwitcherViewReact).toBe(
      runtime.LumnoOverlayTabSwitcherView
    );
    expect(runtime.LumnoOptionsReactIslands).toEqual({
      blacklistTab: runtime.LumnoOptionsBlacklistTab,
      infoButton: runtime.LumnoOptionsInfoButton,
      segmentedControl: runtime.LumnoOptionsSegmentedControl,
      settingsNavigation: runtime.LumnoOptionsSettingsNavigation,
      settingsControls: runtime.LumnoOptionsSettingsControls,
      accountTab: runtime.LumnoOptionsAccountTab,
      shortcutsTab: runtime.LumnoOptionsShortcutsTab,
      toast: runtime.LumnoOptionsToast,
      tabSwitcher: runtime.LumnoOverlayTabSwitcherView
    });
  });
});
