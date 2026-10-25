import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

function clearRuntime(): void {
  Reflect.deleteProperty(runtime, 'LumnoOnboardingPage');
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
    expect(runtime.LumnoOnboardingPage?.implementation).toBe('react');
    expect(runtime.LumnoOnboardingReactIslands).toEqual({
      page: runtime.LumnoOnboardingPage
    });
  });
});
