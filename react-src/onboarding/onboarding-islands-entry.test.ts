import { afterEach, describe, expect, it, vi } from 'vitest';

type OnboardingRuntime = typeof globalThis & {
  LumnoOnboardingActions?: {
    implementation?: string;
  };
  LumnoOnboardingActionsReact?: {
    implementation?: string;
  };
  LumnoOnboardingBodyCopy?: {
    implementation?: string;
  };
  LumnoOnboardingBodyCopyReact?: {
    implementation?: string;
  };
  LumnoOnboardingCopyHeading?: {
    implementation?: string;
  };
  LumnoOnboardingCopyHeadingReact?: {
    implementation?: string;
  };
  LumnoOnboardingCursorLayer?: {
    implementation?: string;
  };
  LumnoOnboardingCursorLayerReact?: {
    implementation?: string;
  };
  LumnoOnboardingInteractions?: {
    implementation?: string;
  };
  LumnoOnboardingInteractionsReact?: {
    implementation?: string;
  };
  LumnoOnboardingPageStrip?: {
    implementation?: string;
  };
  LumnoOnboardingPageStripReact?: {
    implementation?: string;
  };
  LumnoOnboardingVisualSurface?: {
    implementation?: string;
  };
  LumnoOnboardingVisualSurfaceReact?: {
    implementation?: string;
  };
  LumnoOnboardingReactBootstrap?: {
    reactReady: boolean;
  };
  LumnoOnboardingReactIslands?: unknown;
};

const runtime = globalThis as OnboardingRuntime;

function clearRuntime(): void {
  delete runtime.LumnoOnboardingActions;
  delete runtime.LumnoOnboardingActionsReact;
  delete runtime.LumnoOnboardingBodyCopy;
  delete runtime.LumnoOnboardingBodyCopyReact;
  delete runtime.LumnoOnboardingCopyHeading;
  delete runtime.LumnoOnboardingCopyHeadingReact;
  delete runtime.LumnoOnboardingCursorLayer;
  delete runtime.LumnoOnboardingCursorLayerReact;
  delete runtime.LumnoOnboardingInteractions;
  delete runtime.LumnoOnboardingInteractionsReact;
  delete runtime.LumnoOnboardingPageStrip;
  delete runtime.LumnoOnboardingPageStripReact;
  delete runtime.LumnoOnboardingVisualSurface;
  delete runtime.LumnoOnboardingVisualSurfaceReact;
  delete runtime.LumnoOnboardingReactBootstrap;
  delete runtime.LumnoOnboardingReactIslands;
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
