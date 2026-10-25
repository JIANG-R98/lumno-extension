import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyPanel');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyPanelReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCursorLayer');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCursorLayerReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingVisualSurface');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingVisualSurfaceReact');
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
    expect(runtime.LumnoOnboardingVisualSurface?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingVisualSurfaceReact).toBe(
      runtime.LumnoOnboardingVisualSurface
    );
    expect(runtime.LumnoOnboardingCursorLayer?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingCursorLayerReact).toBe(
      runtime.LumnoOnboardingCursorLayer
    );
    expect(runtime.LumnoOnboardingReactIslands).toEqual({
      copyPanel: runtime.LumnoOnboardingCopyPanel,
      cursorLayer: runtime.LumnoOnboardingCursorLayer,
      visualSurface: runtime.LumnoOnboardingVisualSurface
    });
  });
});
