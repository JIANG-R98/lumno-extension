import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyPanel');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyPanelReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingVisualPanel');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingVisualPanelReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingReactBootstrap');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingReactIslands');
}

afterEach(() => {
  clearRuntime();
  vi.resetModules();
});

describe('Onboarding React islands entry', () => {
  it('installs the views the page uses and marks the bootstrap ready', async () => {
    runtime.LumnoOnboardingReactBootstrap = {
      reactReady: false
    };

    await import('./onboarding-islands-entry');

    expect(runtime.LumnoOnboardingReactBootstrap.reactReady).toBe(true);
    expect(runtime.LumnoOnboardingCopyPanel?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingCopyPanelReact).toBe(
      runtime.LumnoOnboardingCopyPanel
    );
    expect(runtime.LumnoOnboardingVisualPanel?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingVisualPanelReact).toBe(
      runtime.LumnoOnboardingVisualPanel
    );
    expect(runtime.LumnoOnboardingReactIslands).toEqual({
      copyPanel: runtime.LumnoOnboardingCopyPanel,
      visualPanel: runtime.LumnoOnboardingVisualPanel
    });
  });
});
