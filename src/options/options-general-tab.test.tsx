import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeneralTab } from './options-general-tab';
import { createGeneralTabController, type GeneralTabController } from './react/general-tab';
import { getTags } from '../../tests/react/dom';

let controllers: GeneralTabController[] = [];

const handlers = { onToggle: vi.fn(), onSelect: vi.fn() };

function header(title: string) {
  return { rows: [{ type: 'header' as const, key: 'header', title }] };
}

afterEach(() => {
  act(() => controllers.forEach((controller) => controller.destroy()));
  controllers = [];
  document.body.textContent = '';
});

describe('Options General tab', () => {
  it('draws its sections in their order with a divider between each two, as they arrive', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createGeneralTabController(host);
    controllers.push(controller);
    const tab = createGeneralTab(controller);
    const titles = () => getTags(host, '._x_extension_section_title_2024_unique_', 'p').map((title) => title.textContent);

    const newtab = tab.newtab(handlers);
    act(() => newtab.render(header('New Tab')));
    act(() => tab.features(handlers).render(header('Features')));
    expect(titles()).toEqual(['Features', 'New Tab']);
    expect(host.dataset.reactIsland).toBe('options-general-tab');

    act(() => tab.search(handlers).render(header('Search')));
    expect(titles()).toEqual(['Features', 'Search', 'New Tab']);
    expect(getTags(host, '._x_extension_setting_divider_wrap_2024_unique_', 'div').length).toBe(2);

    act(() => newtab.destroy());
    expect(titles()).toEqual(['Features', 'Search']);
  });
});
