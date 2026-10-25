import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppearanceTab } from './options-appearance-tab';
import { createAppearanceTabController, type AppearanceTabController } from './react/appearance-tab';
import { getTags } from '../../tests/react/dom';

let controllers: AppearanceTabController[] = [];

const rows = { onToggle: vi.fn(), onSelect: vi.fn() };

function header(title: string) {
  return { rows: [{ type: 'header' as const, key: 'header', title }] };
}

afterEach(() => {
  act(() => controllers.forEach((controller) => controller.destroy()));
  controllers = [];
  document.body.textContent = '';
});

describe('Options Appearance tab', () => {
  it('draws its sections in order, with the New Tab parts as one section', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createAppearanceTabController(host);
    controllers.push(controller);
    const tab = createAppearanceTab(controller);
    const titles = () => getTags(host, '._x_extension_section_title_2024_unique_', 'p').map((title) => title.textContent);
    const dividers = () => getTags(host, '._x_extension_setting_divider_wrap_2024_unique_', 'div').length;

    act(() => tab.newtabLook(rows).render(header('New Tab')));
    act(() => tab.dailyQuote({ rows, onImport: vi.fn(), onShuffle: vi.fn() }).render({
      rows: [{ type: 'header', key: 'quote', title: 'Quote' }],
      library: {
        title: 'Collection', hint: '', count: null, canShuffle: false, busy: false, importing: false,
        importLabel: 'Import', shuffleLabel: 'Shuffle', error: ''
      }
    }));
    expect(host.dataset.reactIsland).toBe('options-appearance-tab');
    expect(titles()).toEqual(['New Tab', 'Quote']);
    expect(dividers()).toBe(0);

    const overlay = tab.overlay({ rows, onFont: vi.fn(), onFontReset: vi.fn() });
    act(() => overlay.render({ ...header('Overlay'), fonts: [] }));
    expect(titles()).toEqual(['Overlay', 'New Tab', 'Quote']);
    expect(dividers()).toBe(1);

    act(() => overlay.destroy());
    expect(titles()).toEqual(['New Tab', 'Quote']);
    expect(dividers()).toBe(0);
  });
});
