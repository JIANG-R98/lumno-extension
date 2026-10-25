import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createGeneralShortcutsSection } from './options-general-shortcuts-section';
import type { SettingSpec } from './options-setting-bindings';
import { createSettingsControlsApi } from './react/settings-controls';
import { getElement, getTag, getTags } from '../../tests/react/dom';

function setUp(response: unknown = { ok: true }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const sent: unknown[] = [];
  const toasts: Array<[string, boolean]> = [];
  const section = createGeneralShortcutsSection({
    host,
    optionsSettingsControlsApi: createSettingsControlsApi(),
    storageArea: { set: (items) => writes.push(items) },
    SETTINGS: Settings,
    runtime: {
      lastError: null,
      sendMessage(message: unknown, callback?: (reply: unknown) => void) {
        sent.push(message);
        if (callback) {
          callback(response);
        }
      }
    },
    getMessage: (_key, fallback) => fallback,
    showToast: (message, isError) => toasts.push([message, Boolean(isError)])
  });
  const changes = new Map<string, (raw: unknown) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  const store = (key: string, raw: unknown) => act(() => changes.get(key)?.(raw));
  return { host, writes, sent, toasts, section, changes, store };
}

afterEach(() => {
  document.body.textContent = '';
});

describe('Options General shortcuts section', () => {
  it('binds the restricted page action and quick switching', () => {
    const { changes } = setUp();
    expect(Array.from(changes.keys()).sort()).toEqual([
      Settings.OVERLAY_TAB_PRIORITY_STORAGE_KEY,
      Settings.RESTRICTED_ACTION_STORAGE_KEY
    ].sort());
  });

  it('opens the browser\'s shortcuts page and reports a failure', () => {
    const ok = setUp();
    act(() => getTag(ok.host, '#_x_extension_open_shortcuts_page_2026_unique_', 'button').click());
    expect(ok.sent).toEqual([{ action: 'openExtensionShortcutsPage' }]);
    expect(ok.toasts).toEqual([]);
    document.body.textContent = '';
    const failed = setUp({ ok: false });
    act(() => getTag(failed.host, '#_x_extension_open_shortcuts_page_2026_unique_', 'button').click());
    expect(failed.toasts).toEqual([['操作失败，请重试。', true]]);
  });

  it('shows the search shortcut once it is known', () => {
    const { host, section } = setUp();
    const status = getElement(host, '#_x_extension_shortcuts_status_2024_unique_');
    expect(status.textContent).toBe('未设置');
    act(() => section.setStatus('⇧⌘K'));
    expect(status.textContent).toBe('⇧⌘K');
    const dia = getElement(host, '._x_extension_shortcuts_dia_badge_2026_unique_');
    expect(dia.dataset.browserOnly).toBe('chromium');
    expect(dia.dataset.tooltip).toContain('Dia');
  });

  it('saves the restricted page action together with the one-time setting step', () => {
    const { host, writes, store } = setUp();
    store(Settings.RESTRICTED_ACTION_STORAGE_KEY, 'lumno');
    const buttons = getTags(host, '#_x_extension_restricted_action_tabs_wrap_2024_unique_ button', 'button');
    expect(buttons.map((button) => button.dataset.active)).toEqual(['true', 'false']);
    act(() => buttons[1]?.click());
    expect(writes).toEqual([{
      [Settings.RESTRICTED_ACTION_STORAGE_KEY]: 'none',
      [Settings.RESTRICTED_ACTION_AUTO_BROWSER_SETTING_DONE_STORAGE_KEY]: true
    }]);
    expect(getTag(host, '#_x_extension_restricted_action_select_2024_unique_', 'select').value).toBe('none');
    expect(getElement(host, '#_x_extension_restricted_action_info_2026_unique_ ._x_extension_info_button_2026_unique_').dataset.tooltip)
      .toContain('受限页');
  });

  it('draws the shortcut list its module hands over', () => {
    const { host, section } = setUp();
    expect(getElement(host, '#_x_extension_shortcut_reference_list_2026_unique_').childElementCount).toBe(0);
    act(() => section.referenceList.render({
      groups: [{
        id: 'tabs',
        title: '标签页',
        titleKey: 'shortcut_reference_group_tabs',
        items: [{
          commandName: 'show-tab-switcher',
          editable: true,
          id: 'show-tab-switcher',
          shortcutEmpty: false,
          shortcutLabel: '⌥Q',
          title: '标签切换器',
          titleKey: 'shortcut_reference_show_tab_switcher'
        }]
      }]
    }));
    expect(getElement(host, '[data-shortcut-id="show-tab-switcher"]').textContent).toContain('⌥Q');
  });

  it('keeps quick switching on', () => {
    const { host, store } = setUp();
    const toggle = () => getTag(host, '#_x_extension_overlay_tab_quick_switch_2024_unique_', 'input');
    expect(toggle().checked).toBe(true);
    store(Settings.OVERLAY_TAB_PRIORITY_STORAGE_KEY, false);
    expect(toggle().checked).toBe(true);
  });
});
