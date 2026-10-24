import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createShortcutReferenceApi,
  createShortcutReferenceController,
  type ShortcutReferenceController,
  type ShortcutReferenceRenderModel
} from './shortcut-reference';

let controllers: ShortcutReferenceController[] = [];

const model: ShortcutReferenceRenderModel = {
  groups: [
    {
      id: 'search',
      title: '聚焦搜索',
      titleKey: 'shortcut_reference_group_search',
      items: [
        {
          commandName: '',
          editable: false,
          id: 'search-confirm',
          shortcutEmpty: false,
          shortcutLabel: 'Enter',
          title: '执行当前候选项',
          titleKey: 'shortcut_reference_search_confirm'
        },
        {
          commandName: 'show-search-prefill',
          editable: true,
          id: 'show-search-prefill',
          shortcutEmpty: true,
          shortcutLabel: '未设置',
          title: '填入当前网页链接',
          titleKey: 'shortcut_reference_show_search_prefill'
        }
      ]
    }
  ]
};

function createFixture() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const controller = createShortcutReferenceController(host);
  controllers.push(controller);
  return { controller, host };
}

afterEach(() => {
  act(() => {
    controllers.forEach((controller) => controller.destroy());
  });
  controllers = [];
  document.body.textContent = '';
});

describe('Options shortcut reference React island', () => {
  it('renders existing group, row, localization, and metadata contracts', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));

    expect(createShortcutReferenceApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('options-shortcut-reference');
    expect(
      host.querySelector('[data-shortcut-group="search"]')?.textContent
    ).toBe('聚焦搜索');
    expect(host.querySelectorAll('[data-shortcut-id]')).toHaveLength(2);
    expect(
      host.querySelector('[data-shortcut-group="search"]')?.classList
        .contains('_x_extension_setting_group_row_2026_unique_')
    ).toBe(true);
    expect(
      host.querySelectorAll('._x_extension_setting_subrow_2026_unique_')
    ).toHaveLength(2);
    expect(
      host.querySelector('[data-shortcut-id="show-search-prefill"]')
        ?.getAttribute('data-shortcut-editable')
    ).toBe('true');
  });

  it('marks unset shortcuts without changing the visible fallback label', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));

    const emptyField = host.querySelector(
      '[data-shortcut-id="show-search-prefill"] ._x_extension_shortcut_reference_key_field_2026_unique_'
    );
    expect(emptyField?.getAttribute('data-empty')).toBe('true');
    expect(emptyField?.textContent).toBe('未设置');
  });

  it('updates localized content without replacing the host', () => {
    const { controller, host } = createFixture();
    act(() => controller.render(model));
    const nextModel: ShortcutReferenceRenderModel = {
      groups: [
        {
          ...model.groups[0],
          title: 'Command Bar',
          items: model.groups[0].items.map((item) => ({
            ...item,
            title: item.id === 'search-confirm' ? 'Run selected result' : item.title
          }))
        }
      ]
    };
    act(() => controller.render(nextModel));

    expect(host.isConnected).toBe(true);
    expect(host.querySelector('[data-shortcut-group="search"]')?.textContent)
      .toBe('Command Bar');
    expect(host.querySelector('[data-shortcut-id="search-confirm"] p')?.textContent)
      .toBe('Run selected result');
  });

  it('renders nested groups without their own group row', () => {
    const { controller, host } = createFixture();
    act(() => controller.render({
      groups: [{ ...model.groups[0], nested: true }]
    }));

    expect(host.querySelector('[data-shortcut-group="search"]')).toBeNull();
    expect(
      host.querySelectorAll('._x_extension_setting_subrow_2026_unique_')
    ).toHaveLength(2);
  });

  it('unmounts cleanly', () => {
    const { controller, host } = createFixture();
    act(() => {
      controller.render(model);
      controller.destroy();
    });

    expect(host.childElementCount).toBe(0);
  });
});
