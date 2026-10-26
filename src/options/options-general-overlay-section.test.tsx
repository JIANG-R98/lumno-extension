import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import { createGeneralOverlaySection } from './options-general-overlay-section';
import { createSettingsSectionController } from './react/settings-rows-view';
import { getTag } from '../../tests/react/dom';
import { createOptionsTestSettings } from '../../tests/react/options-settings';

const sections: Array<{ destroy(): void }> = [];

const OPEN_KEY = Settings.overlayOpenInCurrentTab.key;
const OPEN_TABS_KEY = Settings.overlayOpenTabsDefaultVisible.key;

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = createOptionsTestSettings();
  const section = createGeneralOverlaySection({
    view: (handlers) => createSettingsSectionController(host, handlers),
    settingsStore: settings.store,
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback
  });
  sections.push(section);
  section.bindSettings(settings.binder);
  return { host, writes: settings.writes, settings };
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General webpage focus overlay section', () => {
  it('binds both overlay settings', () => {
    const { settings } = setUp();
    expect(settings.boundKeys().sort()).toEqual([OPEN_KEY, OPEN_TABS_KEY].sort());
  });

  it('asks whether results open in a new tab, on by default, and stores the reverse', async () => {
    const { host, writes, settings } = setUp();
    const toggle = () => getTag(host, '#_x_extension_overlay_open_in_new_tab_toggle_2026_unique_', 'input');
    expect(toggle().checked).toBe(true);
    act(() => toggle().click());
    await settings.settle();
    expect(writes).toContainEqual({ [OPEN_KEY]: true });
    await settings.change(Settings.overlayOpenInCurrentTab, true);
    expect(toggle().checked).toBe(false);
    await settings.change(Settings.overlayOpenInCurrentTab, false);
    expect(toggle().checked).toBe(true);
  });

  it('saves the open tabs switch', async () => {
    const { host, writes, settings } = setUp();
    act(() => getTag(host, '#_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_', 'input').click());
    await settings.settle();
    expect(writes).toEqual([{ [OPEN_TABS_KEY]: !Settings.overlayOpenTabsDefaultVisible.parse(undefined) }]);
  });
});
