import { act } from 'react';
import optionsSource from '../../src/options/options.js?raw';
import optionsHtml from '../../src/options/options.html?raw';
import settingsSource from '../../src/shared/settings.js?raw';
import messagesSource from '../../_locales/zh_CN/messages.json?raw';
import enMessagesSource from '../../_locales/en/messages.json?raw';
import jaMessagesSource from '../../_locales/ja/messages.json?raw';
import zhTwMessagesSource from '../../_locales/zh_TW/messages.json?raw';
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

  it.each([
    ['zh_CN', messagesSource],
    ['zh_TW', zhTwMessagesSource],
    ['en', enMessagesSource],
    ['ja', jaMessagesSource]
  ])('uses content sizing for %s tab-position options while saving and restoring selections', (_locale, source) => {
    const messages = JSON.parse(source);
    const settings = new Function('module', settingsSource + '\nreturn globalThis.LumnoSettings;')(undefined);
    const selectId = '_x_extension_search_result_tab_position_select_2026_unique_';
    const parsed = new DOMParser().parseFromString(optionsHtml, 'text/html');
    const template = parsed.getElementById(selectId)?.closest('._x_extension_custom_select_2024_unique_');
    expect(template).toBeTruthy();
    const host = document.importNode(template!, true) as HTMLElement;
    document.body.appendChild(host);
    const select = host.querySelector<HTMLSelectElement>('select')!;
    const setStorage = vi.fn();
    const mount = new Function(
      'optionsSelectControlApi', 'chrome', 'getMessage', 'languageSelect', 'tabsRow',
      'selectionQuickActionsProviderSelect', 'searchResultTabPositionSelect', 'SETTINGS', 'storageArea',
      optionsSource.slice(
        optionsSource.indexOf('  const SEARCH_RESULT_TAB_POSITION_STORAGE_KEY ='),
        optionsSource.indexOf('  const SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY =')
      ) + optionsSource.slice(
        optionsSource.indexOf('  const optionsSelectControlRecords = new Map();'),
        optionsSource.indexOf('  const newtabTimeFontWeightController =')
      ) + '\nfunction refreshCustomSelects() { renderOptionsSelectControl(searchResultTabPositionSelect); }\n' +
      optionsSource.slice(
        optionsSource.indexOf('  if (searchResultTabPositionSelect) {'),
        optionsSource.indexOf('  if (searchResultPriorityTabButtons.length > 0) {')
      ) + '\nreturn { renderOptionsSelectControl };'
    );
    let adapter: { renderOptionsSelectControl(select: HTMLSelectElement): void };
    act(() => {
      adapter = mount({
        createSelectControlController: (node: HTMLElement, options: Parameters<typeof createSelectControlController>[1]) => {
          const controller = createSelectControlController(node, options);
          controllers.push(controller);
          return controller;
        }
      }, {}, (key: string, fallback: string) => messages[key]?.message || fallback,
      null, null, null, select, settings, { set: setStorage });
    });
    expect(host.dataset.selectKind).toBe('search-result-tab-position');
    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe(messages.search_result_tab_position_end.message);
    expect(host.querySelectorAll('[role="option"]')).toHaveLength(3);

    act(() => host.querySelector<HTMLButtonElement>('button')?.click());
    const menu = host.querySelector<HTMLElement>('[role="listbox"]')!;
    // The auto-width wrapper must not pin longer localized options to the trigger width.
    expect(menu.dataset.menuSurfaceWidth).toBe('content');
    expect(menu.style.getPropertyValue('--x-extension-menu-surface-min-width')).toBe('100%');
    // React owns the labels: no data-i18n hooks for the classic i18n pass to overwrite.
    expect(menu.querySelector('[data-i18n]')).toBeNull();
    expect(Array.from(
      menu.querySelectorAll('._x_extension_select_option_label_2026_unique_'),
      (option) => option.textContent
    ))
      .toEqual([
        messages.search_result_tab_position_end.message,
        messages.search_result_tab_position_after_current.message,
        messages.search_result_tab_position_before_current.message
      ]);
    act(() => host.querySelector<HTMLElement>('[data-value="beforeCurrent"]')?.click());
    expect(setStorage).toHaveBeenCalledWith({ [settings.SEARCH_RESULT_TAB_POSITION_STORAGE_KEY]: 'beforeCurrent' });
    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe(messages.search_result_tab_position_before_current.message);

    // The adapter receives persisted/synced selections through the original select.
    act(() => {
      select.value = 'afterCurrent';
      adapter!.renderOptionsSelectControl(select);
    });
    expect(host.querySelector('._x_extension_select_label_2024_unique_')?.textContent)
      .toBe(messages.search_result_tab_position_after_current.message);
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
