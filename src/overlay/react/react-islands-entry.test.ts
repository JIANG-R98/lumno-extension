import { afterEach, describe, expect, it, vi } from 'vitest';

type OverlayRuntime = typeof globalThis & {
  LumnoOverlayReactBootstrap?: { reactReady: boolean };
  LumnoOverlayReactIslands?: {
    searchInput?: { implementation?: string };
    shell?: { implementation?: string };
    suggestions?: { implementation?: string };
    tabSwitcher?: { implementation?: string };
  };
  LumnoOverlayShell?: {
    createOverlayMount?(): unknown;
    implementation?: string;
  };
  LumnoOverlayShellReact?: {
    implementation?: string;
  };
  LumnoSearchInputUI?: {
    createSearchInput?(): unknown;
    implementation?: string;
  };
  LumnoSearchInputUIReact?: {
    implementation?: string;
  };
  LumnoFeatureHintView?: {
    implementation?: string;
  };
  LumnoFeatureHintViewReact?: {
    implementation?: string;
  };
  LumnoOverlaySuggestionsView?: {
    implementation?: string;
  };
  LumnoOverlaySuggestionsViewReact?: {
    implementation?: string;
  };
  LumnoOverlayTabSwitcherView?: {
    implementation?: string;
  };
  LumnoOverlayTabSwitcherViewReact?: {
    implementation?: string;
  };
  _x_extension_createSearchInput_2024_unique_?: unknown;
};

const runtime = globalThis as OverlayRuntime;

afterEach(() => {
  delete runtime.LumnoOverlayReactBootstrap;
  delete runtime.LumnoOverlayReactIslands;
  delete runtime.LumnoOverlayShell;
  delete runtime.LumnoOverlayShellReact;
  delete runtime.LumnoSearchInputUI;
  delete runtime.LumnoSearchInputUIReact;
  delete runtime.LumnoFeatureHintView;
  delete runtime.LumnoFeatureHintViewReact;
  delete runtime.LumnoOverlaySuggestionsView;
  delete runtime.LumnoOverlaySuggestionsViewReact;
  delete runtime.LumnoOverlayTabSwitcherView;
  delete runtime.LumnoOverlayTabSwitcherViewReact;
  delete runtime._x_extension_createSearchInput_2024_unique_;
  vi.resetModules();
});

describe('Overlay React islands entry', () => {
  it('upgrades the legacy shell and search-input globals synchronously', async () => {
    runtime.LumnoOverlayShell = {
      createOverlayMount: vi.fn()
    };

    await import('./react-islands-entry');

    expect(runtime.LumnoOverlayReactBootstrap).toEqual({ reactReady: true });
    expect(runtime.LumnoSearchInputUI?.implementation).toBe('react');
    expect(runtime.LumnoSearchInputUIReact).toBe(runtime.LumnoSearchInputUI);
    expect(runtime.LumnoFeatureHintView?.implementation).toBe('react');
    expect(runtime.LumnoFeatureHintViewReact).toBe(
      runtime.LumnoFeatureHintView
    );
    expect(runtime._x_extension_createSearchInput_2024_unique_).toBe(
      runtime.LumnoSearchInputUI?.createSearchInput
    );
    expect(runtime.LumnoOverlayShell?.implementation).toBe('react');
    expect(runtime.LumnoOverlayShellReact).toBe(runtime.LumnoOverlayShell);
    expect(runtime.LumnoOverlayReactIslands).toEqual({
      searchInput: runtime.LumnoSearchInputUI,
      shell: runtime.LumnoOverlayShell,
      suggestions: runtime.LumnoOverlaySuggestionsView,
      tabSwitcher: runtime.LumnoOverlayTabSwitcherView
    });
    expect(
      runtime.LumnoOverlaySuggestionsView?.implementation
    ).toBe('react');
    expect(runtime.LumnoOverlaySuggestionsViewReact).toBe(
      runtime.LumnoOverlaySuggestionsView
    );
    expect(
      runtime.LumnoOverlayTabSwitcherView?.implementation
    ).toBe('react');
    expect(runtime.LumnoOverlayTabSwitcherViewReact).toBe(
      runtime.LumnoOverlayTabSwitcherView
    );
  });

  it('reuses installed APIs when the injected bundle runs again', async () => {
    runtime.LumnoOverlayShell = {
      createOverlayMount: vi.fn()
    };
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
    expect(runtime.LumnoOverlayReactIslands?.tabSwitcher).toBe(
      firstIslands?.tabSwitcher
    );
    expect(runtime.LumnoOverlayShell).toBe(firstShell);
  });
});
