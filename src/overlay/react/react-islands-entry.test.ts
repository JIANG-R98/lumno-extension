import { afterEach, describe, expect, it, vi } from 'vitest';


const runtime = globalThis;

afterEach(() => {
  Reflect.deleteProperty(runtime, 'LumnoOverlayReactBootstrap');
  Reflect.deleteProperty(runtime, 'LumnoOverlayReactIslands');
  Reflect.deleteProperty(runtime, 'LumnoOverlayShell');
  Reflect.deleteProperty(runtime, 'LumnoSearchInputUI');
  Reflect.deleteProperty(runtime, 'LumnoFeatureHintView');
  Reflect.deleteProperty(runtime, 'LumnoOverlaySuggestionsView');
  Reflect.deleteProperty(runtime, '_x_extension_createSearchInput_2024_unique_');
  vi.resetModules();
});

describe('Overlay React islands entry', () => {
  it('upgrades the legacy shell and search-input globals synchronously', async () => {
    // A shell left by an older build of the overlay script.
    Reflect.set(runtime, 'LumnoOverlayShell', { createOverlayMount: vi.fn() });

    await import('./react-islands-entry');

    expect(runtime.LumnoOverlayReactBootstrap).toEqual({ reactReady: true });
    expect(runtime.LumnoSearchInputUI?.implementation).toBe('react');
    expect(runtime.LumnoFeatureHintView?.implementation).toBe('react');
    expect(runtime._x_extension_createSearchInput_2024_unique_).toBe(
      runtime.LumnoSearchInputUI?.createSearchInput
    );
    expect(runtime.LumnoOverlayShell?.implementation).toBe('react');
    expect(runtime.LumnoOverlayReactIslands).toEqual({
      searchInput: runtime.LumnoSearchInputUI,
      shell: runtime.LumnoOverlayShell,
      suggestions: runtime.LumnoOverlaySuggestionsView
    });
    expect(
      runtime.LumnoOverlaySuggestionsView?.implementation
    ).toBe('react');
  });

  it('reuses installed APIs when the injected bundle runs again', async () => {
    // A shell left by an older build of the overlay script.
    Reflect.set(runtime, 'LumnoOverlayShell', { createOverlayMount: vi.fn() });
    await import('./react-islands-entry');
    const firstIslands = runtime.LumnoOverlayReactIslands;
    const firstShell = runtime.LumnoOverlayShell;

    vi.resetModules();
    await import('./react-islands-entry');

    expect(runtime.LumnoOverlayReactIslands?.searchInput).toBe(
      firstIslands?.searchInput
    );
    expect(runtime.LumnoOverlayReactIslands?.suggestions).toBe(
      firstIslands?.suggestions
    );
    expect(runtime.LumnoOverlayShell).toBe(firstShell);
  });
});
