import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createPageStructure,
  createPageStructureApi,
  type PageStructureRuntime
} from './page-structure';

let runtime: PageStructureRuntime | null = null;

afterEach(() => {
  if (runtime) {
    act(() => runtime?.destroy());
  }
  runtime = null;
  document.body.innerHTML = '';
});

describe('New Tab React page structure', () => {
  it('creates stable hosts and refs for the page adapters', () => {
    act(() => {
      runtime = createPageStructure({
        documentObj: document,
        getRiSvg: (icon) => `<i data-icon="${icon}"></i>`
      });
    });
    if (!runtime) {
      throw new Error('Expected page structure runtime');
    }

    expect(createPageStructureApi().implementation).toBe('react');
    expect(runtime.shortcut.section.dataset.reactIsland).toBe(
      'newtab-shortcut-section'
    );
    expect(runtime.shortcut.grid.className).toBe('x-nt-shortcuts-grid');
    expect(runtime.bookmark.heading.parentElement).toBe(
      runtime.bookmark.titleWrap
    );
    expect(runtime.bookmark.grid.parentElement).toBe(runtime.bookmark.section);
    expect(runtime.bookmark.previousButton.querySelector('i')?.dataset.icon).toBe(
      'ri-arrow-left-s-line'
    );
    expect(runtime.recent.grid.parentElement).toBe(runtime.recent.section);
    expect(runtime.suggestions.container.dataset.visible).toBe('false');
    expect(runtime.searchLayer.dataset.reactIsland).toBe('newtab-search-layer');
  });
});
