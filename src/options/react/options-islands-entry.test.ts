import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactBootstrap');
  Reflect.deleteProperty(runtime, 'LumnoOptionsReactIslands');
  Reflect.deleteProperty(runtime, 'LumnoOptionsBlacklistTab');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsNavigation');
  Reflect.deleteProperty(runtime, 'LumnoOptionsSettingsControls');
  Reflect.deleteProperty(runtime, 'LumnoOptionsAccountTab');
  Reflect.deleteProperty(runtime, 'LumnoOptionsShortcutsTab');
  Reflect.deleteProperty(runtime, 'LumnoOptionsToast');
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
    expect(runtime.LumnoOptionsSettingsNavigation?.implementation).toBe('react');
    expect(runtime.LumnoOptionsSettingsControls?.implementation).toBe('react');
    expect(runtime.LumnoOptionsToast?.implementation).toBe('react');
    expect(runtime.LumnoOptionsReactIslands).toEqual({
      blacklistTab: runtime.LumnoOptionsBlacklistTab,
      settingsNavigation: runtime.LumnoOptionsSettingsNavigation,
      settingsControls: runtime.LumnoOptionsSettingsControls,
      accountTab: runtime.LumnoOptionsAccountTab,
      shortcutsTab: runtime.LumnoOptionsShortcutsTab,
      toast: runtime.LumnoOptionsToast
    });
  });
});
