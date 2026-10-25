import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createGeneralNewtabSection } from './options-general-newtab-section';
import type { SettingSpec } from './options-setting-bindings';
import { createSettingsSectionController } from './react/settings-rows-view';
import { getTag, getTags } from '../../tests/react/dom';

const sections: Array<{ destroy(): void }> = [];

const OPEN_KEY = Settings.NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY;

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const section = createGeneralNewtabSection({
    view: (handlers) => createSettingsSectionController(host, handlers),
    storageArea: { set: (items) => writes.push(items) },
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback
  });
  sections.push(section);
  const specs = new Map<string, SettingSpec<unknown>>();
  const changes = new Map<string, (raw: unknown) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      specs.set(spec.key, { key: spec.key, normalize: spec.normalize, apply: () => {}, repairOnLoad: spec.repairOnLoad, repairOnChange: spec.repairOnChange });
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  const store = (key: string, raw: unknown) => act(() => changes.get(key)?.(raw));
  return { host, writes, specs, store };
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General New Tab section', () => {
  it('shows both settings as stored and never rewrites them on its own', () => {
    const { specs } = setUp();
    expect(Array.from(specs.keys()).sort()).toEqual([OPEN_KEY, Settings.PROGRESS_TRACKING_ENABLED_STORAGE_KEY].sort());
    specs.forEach((spec) => {
      expect([spec.repairOnLoad, spec.repairOnChange]).toEqual([false, false]);
    });
  });

  it('turns progress tracking on by default', () => {
    const { host } = setUp();
    expect(getTag(host, '#_x_extension_progress_tracking_toggle_2026_unique_', 'input').checked).toBe(true);
  });

  it('saves every surface together when one of them changes', () => {
    const { host, writes, store } = setUp();
    store(OPEN_KEY, { search: true });
    const toggles = getTags(host, '._x_extension_setting_subrow_2026_unique_ input', 'input');
    expect(toggles.map((input) => input.checked)).toEqual([true, false, false, false]);
    expect(toggles.map((input) => input.getAttribute('aria-label'))).toEqual(['搜索结果', '快捷方式', '书签', '站点卡片']);
    act(() => getTag(host, '#_x_extension_newtab_open_in_new_tab_bookmarks_toggle_2026_unique_', 'input').click());
    expect(writes).toEqual([{ [OPEN_KEY]: { search: true, shortcuts: false, bookmarks: true, recentSites: false } }]);
  });
});
