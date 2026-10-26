import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as BlacklistUtils from '../domain/blacklist-utils';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createBlacklistModel } from './options-blacklist';
import { createBlacklistSection } from './options-blacklist-section';
import type { SettingSpec } from './options-setting-bindings';
import { createBlacklistTabApi } from './react/blacklist-tab';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const SEARCH_KEY = Settings.searchBlacklist.key;
const FAVICON_KEY = Settings.faviconRequestBlacklist.key;
const FETCH_KEY = Settings.faviconEnhancedFetchEnabled.key;
const FETCH_TOGGLE = '_x_extension_favicon_enhanced_fetch_toggle_2026_unique_';
const SEARCH_CLEAR = '_x_extension_blacklist_clear_2026_unique_';
const FAVICON_CLEAR = '_x_extension_favicon_blacklist_clear_2026_unique_';
const EDITOR = '_x_extension_favicon_blacklist_editor_2026_unique_';

// A setting binder that hands each bound setting a stored value on demand.
function createFakeBinder() {
  const applies = new Map<string, (raw: unknown) => void>();
  return {
    bindSetting<V>(spec: SettingSpec<V>): void {
      applies.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    },
    store(key: string, raw: unknown): void {
      const apply = applies.get(key);
      if (!apply) {
        throw new Error(`${key} is not bound`);
      }
      act(() => apply(raw));
    },
    keys: () => Array.from(applies.keys())
  };
}

function typeInto(input: HTMLInputElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const toasts: Array<[string, boolean]> = [];
  const refreshed: string[] = [];
  let language = 'zh';
  const section = createBlacklistSection({
    host,
    blacklistTabApi: createBlacklistTabApi(),
    storageArea: {
      get: (_keys, callback) => callback({}),
      set(items, callback) {
        writes.push(items);
        if (callback) {
          callback();
        }
      }
    },
    SETTINGS: Settings,
    blacklistModel: createBlacklistModel({ blacklistUtils: BlacklistUtils }),
    getMessage: (key, fallback) => (language === 'en' ? `en:${key}` : fallback),
    showToast: (message, isError) => toasts.push([message, Boolean(isError)]),
    notifyNewtabSectionsRefresh: (name) => refreshed.push(name),
    initTooltips: vi.fn()
  });
  const binder = createFakeBinder();
  section.bindSettings(binder);
  return {
    host,
    writes,
    toasts,
    refreshed,
    section,
    binder,
    setLanguage(next: string) {
      language = next;
    }
  };
}

// Clicks a clear-all button and confirms.
async function confirmClear(host: HTMLElement, id: string): Promise<void> {
  act(() => getTag(host, `#${id}`, 'button').click());
  const confirm = getTags(host, `#${id}_popconfirm button`, 'button');
  await act(async () => {
    confirm[confirm.length - 1]?.click();
    await Promise.resolve();
  });
  await settle();
}

afterEach(() => {
  document.body.textContent = '';
});

describe('Options Blacklist tab', () => {
  it('draws both rule lists empty, with enhanced fetching on', () => {
    const { host, binder } = setUp();
    expect(host.dataset.reactIsland).toBe('options-blacklist-tab');
    expect(binder.keys().sort()).toEqual([FAVICON_KEY, FETCH_KEY, SEARCH_KEY].sort());
    [
      '_x_extension_blacklist_list_2026_unique_',
      '_x_extension_blacklist_form_2026_unique_',
      '_x_extension_favicon_blacklist_list_2026_unique_',
      '_x_extension_favicon_blacklist_form_2026_unique_'
    ].forEach((id) => expect(getElement(host, `#${id}`)).toBeTruthy());
    expect(getTag(host, `#${SEARCH_CLEAR}`, 'button').disabled).toBe(true);
    expect(getTag(host, `#${FAVICON_CLEAR}`, 'button').disabled).toBe(true);
    expect(getTag(host, `#${FETCH_TOGGLE}`, 'input').checked).toBe(true);
    expect(getElement(host, `#${EDITOR}`).getAttribute('aria-disabled')).toBe('false');
  });

  it('shows stored rules without writing them back', () => {
    const { host, binder, writes } = setUp();
    binder.store(SEARCH_KEY, [{ pattern: 'a.com', matchModes: ['suffix'] }]);
    binder.store(FAVICON_KEY, [{ pattern: 'b.com/x', matchModes: ['exact'] }]);
    expect(getTags(host, '#_x_extension_blacklist_list_2026_unique_ [data-rule-key]', 'div')).toHaveLength(1);
    expect(host.textContent).toContain('a.com');
    expect(host.textContent).toContain('http(s)://b.com/x');
    expect(getTag(host, `#${SEARCH_CLEAR}`, 'button').disabled).toBe(false);
    expect(getTag(host, `#${SEARCH_CLEAR}`, 'button').dataset.tooltip).toBe('清空隐藏规则');
    expect(writes).toEqual([]);
  });

  it('adds a search rule, asks New Tab pages to redraw and says so', async () => {
    const { host, writes, toasts, refreshed } = setUp();
    const form = getElement(host, '#_x_extension_blacklist_form_2026_unique_');
    act(() => getTag(form, '._x_extension_shortcut_form_trigger_2024_unique_ button', 'button').click());
    typeInto(getTag(form, 'input:not([type="checkbox"])', 'input'), 'example.com');
    await act(async () => {
      getTag(form, '[data-form-primary="true"]', 'button').click();
      await Promise.resolve();
    });
    await settle();
    expect(writes).toEqual([{ [SEARCH_KEY]: [{ pattern: 'example.com', matchModes: ['suffix'] }] }]);
    expect(refreshed).toEqual(['recent']);
    expect(toasts).toEqual([['已保存', false]]);
    expect(form.dataset.expanded).toBe('false');
    expect(host.textContent).toContain('example.com');
  });

  it('keeps the form open with the reason a rule is refused', async () => {
    const { host, writes } = setUp();
    const form = getElement(host, '#_x_extension_blacklist_form_2026_unique_');
    act(() => getTag(form, '._x_extension_shortcut_form_trigger_2024_unique_ button', 'button').click());
    await act(async () => {
      getTag(form, '[data-form-primary="true"]', 'button').click();
      await Promise.resolve();
    });
    expect(form.dataset.expanded).toBe('true');
    expect(getElement(form, '._x_extension_shortcut_error_2024_unique_').textContent).toBe('请输入网站域名。');
    expect(writes).toEqual([]);
  });

  it('removes a rule after confirmation', async () => {
    const { host, binder, writes, toasts } = setUp();
    binder.store(SEARCH_KEY, [{ pattern: 'a.com', matchModes: ['suffix'] }, { pattern: 'b.com', matchModes: ['suffix'] }]);
    const row = getElement(host, '[data-rule-key]');
    act(() => getTag(row, '._x_extension_shortcut_remove_2024_unique_', 'button').click());
    const confirm = getTags(row, '._x_extension_popconfirm_actions_2024_unique_ button', 'button');
    await act(async () => {
      confirm[confirm.length - 1]?.click();
      await Promise.resolve();
    });
    await settle();
    expect(writes).toEqual([{ [SEARCH_KEY]: [{ pattern: 'b.com', matchModes: ['suffix'] }] }]);
    expect(toasts).toEqual([['已从黑名单移除', false]]);
  });

  it('clears a list and closes its form', async () => {
    const { host, binder, writes, toasts, refreshed } = setUp();
    binder.store(SEARCH_KEY, [{ pattern: 'a.com', matchModes: ['suffix'] }]);
    const form = getElement(host, '#_x_extension_blacklist_form_2026_unique_');
    act(() => getTag(form, '._x_extension_shortcut_form_trigger_2024_unique_ button', 'button').click());
    expect(form.dataset.expanded).toBe('true');
    await confirmClear(host, SEARCH_CLEAR);
    expect(writes).toEqual([{ [SEARCH_KEY]: [] }]);
    expect(refreshed).toEqual(['recent']);
    expect(toasts).toEqual([['已清空', false]]);
    expect(form.dataset.expanded).toBe('false');
    expect(getTag(host, `#${SEARCH_CLEAR}`, 'button').disabled).toBe(true);
  });

  it('adds a favicon rule in front of the others', async () => {
    const { host, binder, writes } = setUp();
    binder.store(FAVICON_KEY, [{ pattern: 'b.com', matchModes: ['suffix'] }]);
    const form = getElement(host, '#_x_extension_favicon_blacklist_form_2026_unique_');
    act(() => getTag(form, '._x_extension_shortcut_form_trigger_2024_unique_ button', 'button').click());
    typeInto(getTag(form, 'input:not([type="checkbox"])', 'input'), 'c.com');
    await act(async () => {
      getTag(form, '[data-form-primary="true"]', 'button').click();
      await Promise.resolve();
    });
    await settle();
    expect(writes).toEqual([{
      [FAVICON_KEY]: [{ pattern: 'c.com', matchModes: ['suffix'] }, { pattern: 'b.com', matchModes: ['suffix'] }]
    }]);
  });

  it('locks the favicon rules while enhanced fetching is off', () => {
    const { host, binder, writes } = setUp();
    const form = getElement(host, '#_x_extension_favicon_blacklist_form_2026_unique_');
    act(() => getTag(form, '._x_extension_shortcut_form_trigger_2024_unique_ button', 'button').click());
    act(() => getTag(host, `#${FETCH_TOGGLE}`, 'input').click());
    expect(writes).toEqual([{ [FETCH_KEY]: false }]);
    const editor = getElement(host, `#${EDITOR}`);
    expect(editor.getAttribute('aria-disabled')).toBe('true');
    expect(editor.hasAttribute('inert')).toBe(true);
    expect(form.dataset.expanded).toBe('false');

    binder.store(FETCH_KEY, true);
    expect(editor.getAttribute('aria-disabled')).toBe('false');
    expect(getTag(host, `#${FETCH_TOGGLE}`, 'input').checked).toBe(true);
  });

  it('redraws its text in a new language', () => {
    const { host, section, setLanguage } = setUp();
    setLanguage('en');
    act(() => section.render());
    expect(host.textContent).toContain('en:blacklist_group_custom');
    expect(getTag(host, `#${FAVICON_CLEAR}`, 'button').getAttribute('aria-label')).toBe('en:favicon_blacklist_clear');
  });
});
