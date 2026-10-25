import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createShortcutsSection } from './options-shortcuts-section';
import type { SettingSpec } from './options-setting-bindings';
import { createShortcutsTabApi } from './react/shortcuts-tab';
import type { SiteSearchListRenderModel } from './react/site-search-list';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const AUTO_GROUP_KEY = Settings.AGGREGATE_SEARCH_AUTO_GROUP_ENABLED_STORAGE_KEY;
const AUTO_GROUP_TOGGLE = '_x_extension_aggregate_search_auto_group_toggle_2026_unique_';

const listModel: SiteSearchListRenderModel = {
  copy: {
    aliasLabel: '别名',
    aliasPlaceholder: '',
    cancelLabel: '取消',
    categoryLabel: '显示位置',
    confirmLabel: '确认',
    confirmMessage: '确认移除该项？',
    confirmMessageKey: 'confirm_remove_item',
    editLabel: '编辑',
    keyLabel: '触发词',
    keyPlaceholder: '',
    nameLabel: '显示名称',
    namePlaceholder: '',
    removeLabel: '移除',
    saveLabel: '保存修改',
    searchEngineCategoryLabel: '搜索引擎',
    siteCategoryLabel: '站内搜索',
    templateHelp: '',
    templateLabel: '搜索模板'
  },
  items: [{
    aliasesText: '',
    badgeText: '自定义',
    category: 'site',
    duplicateLabel: '',
    duplicateTemplate: '',
    duplicateTooltip: '',
    iconUrl: '',
    id: 'custom:ex',
    isBuiltin: false,
    key: 'ex',
    meta: 'ex · https://example.com/?q={query}',
    name: 'Example',
    normalizedTemplate: 'https://example.com/?q={query}',
    secondaryBadgeText: '站内搜索',
    template: 'https://example.com/?q={query}',
    templateEditable: true
  }],
  placeholder: ''
};

function createListOptions() {
  return { onLocateDuplicate: vi.fn(), onRemove: vi.fn(), onSave: vi.fn().mockResolvedValue({ ok: true }) };
}

function setUp(stored: StorageItems = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  let groups = ['local', 'aggregate', 'engine', 'site', 'ai'];
  const attachedLists: string[] = [];
  const orderController = {
    getOrder: () => ({ version: 1, groups, lists: {}, local: [] }),
    getGroupLabel: (group: string) => `label:${group}`,
    moveGroup: vi.fn((fromIndex: number, toIndex: number) => {
      const next = groups.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      groups = next;
      return Promise.resolve();
    }),
    attachGroupDrag: vi.fn(() => () => {}),
    attachListDrag: vi.fn((_host: HTMLElement | null, listId: string) => {
      attachedLists.push(listId);
      return () => {};
    })
  };
  const handlers = {
    custom: createListOptions(),
    sites: createListOptions(),
    ai: createListOptions(),
    engines: createListOptions(),
    aggregate: { onRemove: vi.fn(), onSave: vi.fn().mockResolvedValue({ ok: true }) },
    onAddSiteSearch: vi.fn().mockResolvedValue({ ok: true }),
    onClearCustom: vi.fn(),
    onClearAggregates: vi.fn(),
    onResetBuiltin: vi.fn()
  };
  const section = createShortcutsSection({
    host,
    shortcutsTabApi: createShortcutsTabApi(),
    getMessage: (_key, fallback) => fallback,
    orderController,
    storageArea: {
      get: (keys, callback) => callback(Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))),
      set: (items) => writes.push(items)
    },
    SETTINGS: Settings,
    deriveLegacyAutoGroupEnabled: (value) => Array.isArray(value) && value.length > 0,
    refreshCustomSelects: vi.fn(),
    initTooltips: vi.fn(),
    handlers
  });
  const changes = new Map<string, (raw: unknown) => void>();
  const binder = {
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  };
  return { host, writes, section, binder, changes, handlers, orderController, attachedLists };
}

async function confirm(host: HTMLElement, id: string): Promise<void> {
  act(() => getTag(host, `#${id}`, 'button').click());
  const buttons = getTags(host, `#${id}_popconfirm button`, 'button');
  await act(async () => {
    buttons[buttons.length - 1]?.click();
    await Promise.resolve();
  });
}

const chips = (host: HTMLElement) => getTags(host, '#_x_extension_search_source_group_order_2026_unique_ [data-group]', 'div')
  .map((chip) => chip.dataset.group);

afterEach(() => {
  document.body.textContent = '';
});

describe('Options Shortcuts tab', () => {
  it('draws the groups in their order, with the list hosts the page and its tests read', () => {
    const { host, orderController, attachedLists } = setUp();
    expect(host.dataset.reactIsland).toBe('options-shortcuts-tab');
    expect(chips(host)).toEqual(['local', 'aggregate', 'engine', 'site', 'ai']);
    [
      '_x_extension_site_search_custom_list_2024_unique_',
      '_x_extension_aggregate_search_group_2026_unique_',
      '_x_extension_aggregate_search_list_2026_unique_',
      '_x_extension_site_search_builtin_list_2024_unique_',
      '_x_extension_site_search_ai_group_2026_unique_',
      '_x_extension_search_engine_builtin_list_2026_unique_'
    ].forEach((id) => expect(getElement(host, `#${id}`)).toBeTruthy());
    expect(orderController.attachGroupDrag).toHaveBeenCalledTimes(1);
    expect(attachedLists).toEqual(['custom', 'aggregate', 'site', 'ai', 'engine']);
  });

  it('moves a group chip with Alt and the arrow keys and keeps it focused', () => {
    const { host, section, orderController } = setUp();
    const chip = getElement(host, '[data-group="engine"]');
    chip.focus();
    act(() => {
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
    });
    expect(orderController.moveGroup).toHaveBeenCalledWith(2, 1);
    act(() => section.render());
    expect(chips(host)).toEqual(['local', 'engine', 'aggregate', 'site', 'ai']);
    expect(document.activeElement).toBe(getElement(host, '[data-group="engine"]'));
  });

  it('shows each list once its section draws it, and only then allows clearing', async () => {
    const { host, section, handlers } = setUp();
    const clear = () => getTag(host, '#_x_extension_custom_clear_2024_unique_', 'button');
    expect(clear().disabled).toBe(true);
    act(() => section.customList.render(listModel));
    expect(getElement(host, '#_x_extension_site_search_custom_list_2024_unique_ [data-provider-id="custom:ex"]')).toBeTruthy();
    expect(clear().disabled).toBe(false);
    await confirm(host, '_x_extension_custom_clear_2024_unique_');
    expect(handlers.onClearCustom).toHaveBeenCalledTimes(1);
  });

  it('asks before resetting the built-in list', async () => {
    const { host, handlers } = setUp();
    const reset = getTag(host, '#_x_extension_builtin_reset_2024_unique_', 'button');
    expect(reset.disabled).toBe(false);
    expect(reset.dataset.tooltip).toBe('重置为初始列表');
    await confirm(host, '_x_extension_builtin_reset_2024_unique_');
    expect(handlers.onResetBuiltin).toHaveBeenCalledTimes(1);
  });

  it('derives the auto-group switch from older aggregate searches and saves it once', () => {
    const { host, section, binder, writes } = setUp({ [Settings.AGGREGATE_SEARCH_STORAGE_KEY]: [] });
    expect(getTag(host, `#${AUTO_GROUP_TOGGLE}`, 'input').checked).toBe(true);
    act(() => section.bindSettings(binder));
    expect(getTag(host, `#${AUTO_GROUP_TOGGLE}`, 'input').checked).toBe(false);
    expect(writes).toEqual([{ [AUTO_GROUP_KEY]: false }]);
  });

  it('keeps a stored auto-group choice and follows changes to it', () => {
    const { host, section, binder, changes, writes } = setUp({ [AUTO_GROUP_KEY]: true });
    act(() => section.bindSettings(binder));
    expect(writes).toEqual([]);
    act(() => changes.get(AUTO_GROUP_KEY)?.(false));
    expect(getTag(host, `#${AUTO_GROUP_TOGGLE}`, 'input').checked).toBe(false);
    act(() => getTag(host, `#${AUTO_GROUP_TOGGLE}`, 'input').click());
    expect(writes).toEqual([{ [AUTO_GROUP_KEY]: true }]);
    expect(getTag(host, `#${AUTO_GROUP_TOGGLE}`, 'input').getAttribute('aria-label')).toBe('聚合搜索自动创建标签页组');
  });
});
