import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createLabsSection } from './options-labs-section';
import type { SettingSpec } from './options-setting-bindings';
import { createSettingsControlsApi } from './react/settings-controls';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const PIP_TOGGLE = '_x_extension_document_pip_toggle_2026_unique_';
const INSTANT_TOGGLE = '_x_extension_number_shortcut_instant_toggle_2026_unique_';
const MAC_CTRL_TOGGLE = '_x_extension_macos_ctrl_suggestion_navigation_toggle_2026_unique_';

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

function setUp(browserFamily = 'chrome') {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  let language = 'zh';
  const section = createLabsSection({
    host,
    optionsSettingsControlsApi: createSettingsControlsApi(),
    storageArea: { set: (items) => writes.push(items) },
    SETTINGS: Settings,
    getMessage: (key, fallback) => (language === 'en' ? `en:${key}` : fallback),
    browserFamily
  });
  const binder = createFakeBinder();
  section.bindSettings(binder);
  return {
    host,
    writes,
    section,
    binder,
    setLanguage(next: string) {
      language = next;
    }
  };
}

afterEach(() => {
  document.body.textContent = '';
});

describe('Options Labs tab', () => {
  it('draws each experiment off, with dividers between the rows', () => {
    const { host } = setUp();
    const rows = getTags(host, '._x_extension_setting_row_2024_unique_', 'div');
    expect(rows).toHaveLength(3);
    expect(getTags(host, '._x_extension_setting_divider_wrap_2024_unique_', 'div')).toHaveLength(2);
    [PIP_TOGGLE, INSTANT_TOGGLE, MAC_CTRL_TOGGLE].forEach((id) => {
      expect(getTag(host, `#${id}`, 'input').checked).toBe(false);
    });
    expect(host.dataset.reactIsland).toBe('options-setting-rows');
  });

  it('binds every experiment and follows its stored value', () => {
    const { host, binder } = setUp();
    expect(binder.keys().sort()).toEqual([
      Settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY,
      Settings.MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY,
      Settings.NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY
    ].sort());
    binder.store(Settings.NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY, true);
    expect(getTag(host, `#${INSTANT_TOGGLE}`, 'input').checked).toBe(true);
    binder.store(Settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY, 'yes');
    expect(getTag(host, `#${PIP_TOGGLE}`, 'input').checked).toBe(false);
  });

  it('saves a switched experiment', () => {
    const { host, writes } = setUp();
    act(() => getTag(host, `#${MAC_CTRL_TOGGLE}`, 'input').click());
    expect(writes).toEqual([{ [Settings.MACOS_CTRL_SUGGESTION_NAVIGATION_ENABLED_STORAGE_KEY]: true }]);
    expect(getTag(host, `#${MAC_CTRL_TOGGLE}`, 'input').checked).toBe(true);
  });

  it('shows web clip off and disabled where the browser lacks it, keeping the synced value', () => {
    const { host, binder, writes } = setUp('firefox');
    binder.store(Settings.DOCUMENT_PIP_ENABLED_STORAGE_KEY, true);
    const row = getElement(host, '#_x_extension_document_pip_row_2026_unique_');
    const toggle = getTag(host, `#${PIP_TOGGLE}`, 'input');
    expect(row.dataset.browserUnsupported).toBe('firefox');
    expect(row.dataset.unsupported).toBe('true');
    expect(row.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
    expect(writes).toEqual([]);
  });

  it('marks web clip as unsupported only on that browser', () => {
    const { host } = setUp('chrome');
    const row = getElement(host, '#_x_extension_document_pip_row_2026_unique_');
    expect(row.dataset.browserUnsupported).toBe('firefox');
    expect(row.dataset.unsupported).toBeUndefined();
    expect(getTag(host, `#${PIP_TOGGLE}`, 'input').disabled).toBe(false);
  });

  it('redraws its text in a new language', () => {
    const { host, section, setLanguage } = setUp();
    setLanguage('en');
    act(() => section.render());
    expect(host.textContent).toContain('en:settings_document_pip_title');
    expect(getElement(host, '._x_extension_info_button_2026_unique_').dataset.tooltip)
      .toBe('en:settings_number_shortcut_instant_desc');
  });
});
