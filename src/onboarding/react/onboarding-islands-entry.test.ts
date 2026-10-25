import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOnboardingActions');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingActionsReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingBodyCopy');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingBodyCopyReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyHeading');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCopyHeadingReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCursorLayer');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingCursorLayerReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingInteractions');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingInteractionsReact');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingPageStrip');
  Reflect.deleteProperty(runtime, 'LumnoOnboardingPageStripReact');
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
  it('installs the page-strip API and marks the bootstrap ready', async () => {
    runtime.LumnoOnboardingReactBootstrap = {
      reactReady: false
    };

    await import('./onboarding-islands-entry');

    expect(runtime.LumnoOnboardingReactBootstrap.reactReady).toBe(true);
    expect(runtime.LumnoOnboardingPageStrip?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingPageStripReact).toBe(
      runtime.LumnoOnboardingPageStrip
    );
    expect(runtime.LumnoOnboardingVisualSurface?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingVisualSurfaceReact).toBe(
      runtime.LumnoOnboardingVisualSurface
    );
    expect(runtime.LumnoOnboardingActions?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingActionsReact).toBe(
      runtime.LumnoOnboardingActions
    );
    expect(runtime.LumnoOnboardingBodyCopy?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingBodyCopyReact).toBe(
      runtime.LumnoOnboardingBodyCopy
    );
    expect(runtime.LumnoOnboardingCopyHeading?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingCopyHeadingReact).toBe(
      runtime.LumnoOnboardingCopyHeading
    );
    expect(runtime.LumnoOnboardingCursorLayer?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingCursorLayerReact).toBe(
      runtime.LumnoOnboardingCursorLayer
    );
    expect(runtime.LumnoOnboardingInteractions?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingInteractionsReact).toBe(
      runtime.LumnoOnboardingInteractions
    );
    expect(runtime.LumnoOnboardingReactIslands).toEqual({
      actions: runtime.LumnoOnboardingActions,
      bodyCopy: runtime.LumnoOnboardingBodyCopy,
      copyHeading: runtime.LumnoOnboardingCopyHeading,
      cursorLayer: runtime.LumnoOnboardingCursorLayer,
      interactions: runtime.LumnoOnboardingInteractions,
      pageStrip: runtime.LumnoOnboardingPageStrip,
      visualSurface: runtime.LumnoOnboardingVisualSurface
    });
  });
});
