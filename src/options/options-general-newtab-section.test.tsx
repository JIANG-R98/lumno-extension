import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import type { Setting } from '../domain/settings/define';
import { createGeneralNewtabSection } from './options-general-newtab-section';
import { createSettingsSectionController } from './react/settings-rows-view';
import { getTag, getTags } from '../../tests/react/dom';
import { createOptionsTestSettings } from '../../tests/react/options-settings';

const sections: Array<{ destroy(): void }> = [];

const OPEN_KEY = Settings.newtabOpenInNewTab.key;

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = createOptionsTestSettings();
  const section = createGeneralNewtabSection({
    view: (handlers) => createSettingsSectionController(host, handlers),
    settingsStore: settings.store,
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback
  });
  sections.push(section);
  section.bindSettings(settings.binder);
  const store = (setting: Setting<unknown>, raw: unknown) => settings.change(setting, raw);
  return { host, writes: settings.writes, store, settings };
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General New Tab section', () => {
  it('shows both settings as stored and never rewrites them on its own', async () => {
    const { settings } = setUp();
    expect(settings.boundKeys().sort()).toEqual([OPEN_KEY, Settings.progressTrackingEnabled.key].sort());
    await settings.settle();
    expect(settings.writes).toEqual([]);
  });

  it('turns progress tracking on by default', () => {
    const { host } = setUp();
    expect(getTag(host, '#_x_extension_progress_tracking_toggle_2026_unique_', 'input').checked).toBe(true);
  });

  it('saves every surface together when one of them changes', async () => {
    const { host, writes, store, settings } = setUp();
    await store(Settings.newtabOpenInNewTab, { search: true });
    const toggles = getTags(host, '._x_extension_setting_subrow_2026_unique_ input', 'input');
    expect(toggles.map((input) => input.checked)).toEqual([true, false, false, false]);
    expect(toggles.map((input) => input.getAttribute('aria-label'))).toEqual(['搜索结果', '快捷方式', '书签', '站点卡片']);
    act(() => getTag(host, '#_x_extension_newtab_open_in_new_tab_bookmarks_toggle_2026_unique_', 'input').click());
    await settings.settle();
    expect(writes).toEqual([{ [OPEN_KEY]: { search: true, shortcuts: false, bookmarks: true, recentSites: false } }]);
  });
});
