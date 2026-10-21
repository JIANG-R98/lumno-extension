import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSelectControlApi,
  createSelectControlController,
  type SelectControlController
} from './select-control';

let controllers: SelectControlController[] = [];

const items = [
  { iconUrl: '/system.png', label: '跟随系统', labelKey: 'language_system', value: 'system' },
  { iconUrl: '/zh-cn.png', label: '简体中文', labelKey: 'language_zh_cn', value: 'zh-CN' }
];

afterEach(() => {
  act(() => controllers.forEach((controller) => controller.destroy()));
  controllers = [];
  document.body.textContent = '';
});

describe('Options select control React island', () => {
  it('renders selected labels and legacy classes', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSelectControlController(host, {
      kind: 'language',
      onSelect: vi.fn()
    });
    controllers.push(controller);

    act(() => controller.render({ id: 'language', items, value: 'system' }));

    expect(createSelectControlApi().implementation).toBe('react');
    expect(host.dataset.reactIsland).toBe('options-select-control');
    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe('跟随系统');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(host.querySelector<HTMLImageElement>('._x_extension_select_value_icon_2026_unique_')?.src)
      .toContain('/system.png');
    expect(host.querySelectorAll('._x_extension_select_option_icon_2026_unique_'))
      .toHaveLength(2);
  });

  it('disables the trigger when the adapter marks the control unavailable', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSelectControlController(host, {
      kind: 'provider',
      onSelect: vi.fn()
    });
    controllers.push(controller);

    act(() => controller.render({ disabled: true, id: 'provider', items, value: 'system' }));

    expect(host.dataset.disabled).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
  });

  it('opens the menu and reports a selected value', () => {
    const host = document.createElement('div');
    const onSelect = vi.fn();
    document.body.appendChild(host);
    const controller = createSelectControlController(host, {
      kind: 'language',
      onSelect
    });
    controllers.push(controller);
    act(() => controller.render({ id: 'language', items, value: 'system' }));

    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });
    expect(host.dataset.open).toBe('true');
    const options = host.querySelectorAll<HTMLElement>('[role="option"]');
    act(() => options[1]?.click());

    expect(onSelect).toHaveBeenCalledWith('zh-CN');
    expect(host.dataset.open).toBe('false');
    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe('简体中文');
  });

  it('filters a searchable menu and previews each option in its own family', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSelectControlController(host, {
      kind: 'overlay-font',
      onSelect: vi.fn(),
      searchable: true
    });
    controllers.push(controller);
    act(() => controller.render({
      emptyLabel: 'No matching fonts',
      id: 'overlay-font',
      items: [
        { label: 'Default', labelKey: '', value: '' },
        { fontFamily: 'Zapfino', label: 'Zapfino', labelKey: '', value: 'Zapfino' },
        { fontFamily: 'PingFang SC', label: 'PingFang SC', labelKey: '', value: 'PingFang SC' }
      ],
      searchPlaceholder: 'Search fonts',
      value: ''
    }));

    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });
    const search = host.querySelector<HTMLInputElement>('input[type="text"]');
    expect(search?.placeholder).toBe('Search fonts');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(3);
    // The field is a combobox that owns a listbox holding only the options.
    const listbox = host.querySelector<HTMLElement>('[role="listbox"]');
    expect(search?.getAttribute('role')).toBe('combobox');
    expect(search?.getAttribute('aria-expanded')).toBe('true');
    expect(search?.getAttribute('aria-controls')).toBe(listbox?.id);
    expect(listbox?.contains(search)).toBe(false);
    expect(listbox?.querySelectorAll('[role="option"]')).toHaveLength(3);

    const typeFilter = (text: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      act(() => {
        setter?.call(search, text);
        search?.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    typeFilter('ping');
    const visible = host.querySelectorAll<HTMLElement>('[role="option"]');
    expect(visible).toHaveLength(1);
    expect(visible[0]?.querySelector('._x_extension_select_option_label_2026_unique_')?.textContent)
      .toBe('PingFang SC');
    // The name stays in the interface font; a quoted sample shows the face.
    const preview = visible[0]?.querySelector<HTMLElement>('._x_extension_select_option_preview_2026_unique_');
    expect(preview?.getAttribute('aria-hidden')).toBe('true');
    expect(preview?.style.fontFamily).toContain('"PingFang SC"');
    expect(search?.getAttribute('aria-activedescendant')).toBe(visible[0]?.id);

    typeFilter('zzz');
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(host.querySelector('._x_extension_select_empty_2026_unique_')?.textContent)
      .toBe('No matching fonts');
  });

  it('chooses a filtered option from the keyboard', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onSelect = vi.fn();
    const controller = createSelectControlController(host, {
      kind: 'overlay-font',
      onSelect,
      searchable: true
    });
    controllers.push(controller);
    act(() => controller.render({
      id: 'overlay-font-keys',
      items: [
        { label: 'Default', labelKey: '', value: '' },
        { label: 'Zapfino', labelKey: '', value: 'Zapfino' },
        { label: 'PingFang SC', labelKey: '', value: 'PingFang SC' },
        { label: 'PingFang TC', labelKey: '', value: 'PingFang TC' }
      ],
      value: 'Zapfino'
    }));

    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });
    const search = host.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(document.activeElement).toBe(search);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'ping');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const press = (key: string) => act(() => {
      search.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    });
    press('ArrowDown');
    press('Enter');
    expect(onSelect).toHaveBeenCalledWith('PingFang TC');

    // A reopened menu starts from the whole list again.
    act(() => {
      host.querySelector<HTMLButtonElement>('button')?.click();
    });
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(4);
  });

  it('accepts adapter-driven selection and copy updates', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSelectControlController(host, {
      kind: 'language',
      onSelect: vi.fn()
    });
    controllers.push(controller);
    act(() => controller.render({ id: 'language', items, value: 'system' }));
    act(() => controller.render({
      id: 'language',
      items: items.map((item) => ({
        ...item,
        label: item.value === 'system' ? 'System' : 'Simplified Chinese'
      })),
      value: 'zh-CN'
    }));

    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe('Simplified Chinese');
  });

  it('chooses an option with the keyboard and returns focus to the trigger', () => {
    const host = document.createElement('div');
    const onSelect = vi.fn();
    document.body.appendChild(host);
    const controller = createSelectControlController(host, { kind: 'language', onSelect });
    controllers.push(controller);
    act(() => controller.render({ id: 'language', items, value: 'system' }));

    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    trigger.focus();
    const press = (key: string) => act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    });
    press('ArrowDown');
    expect(host.dataset.open).toBe('true');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('language_control_option_0');
    press('ArrowDown');
    expect(trigger.getAttribute('aria-activedescendant')).toBe('language_control_option_1');
    press('Enter');

    expect(onSelect).toHaveBeenCalledWith('zh-CN');
    expect(host.dataset.open).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape without reporting a change', () => {
    const host = document.createElement('div');
    const onSelect = vi.fn();
    document.body.appendChild(host);
    const controller = createSelectControlController(host, { kind: 'language', onSelect });
    controllers.push(controller);
    act(() => controller.render({ id: 'language', items, value: 'system' }));

    act(() => host.querySelector<HTMLButtonElement>('button')?.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(host.dataset.open).toBe('false');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('names the trigger with the setting title and the current value', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const controller = createSelectControlController(host, { kind: 'language', onSelect: vi.fn() });
    controllers.push(controller);
    act(() => controller.render({
      id: 'language',
      items,
      labelledBy: 'language_title',
      value: 'zh-CN'
    }));

    const trigger = host.querySelector<HTMLButtonElement>('button')!;
    expect(trigger.getAttribute('aria-labelledby')).toBe('language_title language_control_value');
    expect(trigger.hasAttribute('aria-label')).toBe(false);
    expect(document.getElementById('language_control_value')?.textContent).toBe('简体中文');
  });
});
