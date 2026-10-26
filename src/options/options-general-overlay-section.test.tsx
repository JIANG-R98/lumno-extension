import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createGeneralOverlaySection } from './options-general-overlay-section';
import type { SettingSpec } from './options-setting-bindings';
import { createSettingsSectionController } from './react/settings-rows-view';
import { getTag, getTags } from '../../tests/react/dom';

const sections: Array<{ destroy(): void }> = [];

const OPEN_KEY = Settings.OVERLAY_OPEN_IN_CURRENT_TAB_STORAGE_KEY;
const OPEN_TABS_KEY = Settings.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY;

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const section = createGeneralOverlaySection({
    view: (handlers) => createSettingsSectionController(host, handlers),
    storageArea: { set: (items) => writes.push(items) },
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback
  });
  sections.push(section);
  const changes = new Map<string, (raw: unknown) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  const store = (key: string, raw: unknown) => act(() => changes.get(key)?.(raw));
  return { host, writes, changes, store };
}

const openButtons = (host: HTMLElement) =>
  getTags(host, '#_x_extension_overlay_open_in_current_tab_tabs_wrap_2026_unique_ button', 'button');

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General webpage focus overlay section', () => {
  it('binds both overlay settings', () => {
    const { changes } = setUp();
    expect(Array.from(changes.keys()).sort()).toEqual([OPEN_KEY, OPEN_TABS_KEY].sort());
  });

  it('opens results in a new tab by default and switches to the current tab', () => {
    const { host, writes, store } = setUp();
    expect(openButtons(host).map((button) => button.dataset.active)).toEqual(['true', 'false']);
    act(() => openButtons(host)[1]?.click());
    expect(writes).toContainEqual({ [OPEN_KEY]: true });
    store(OPEN_KEY, false);
    expect(openButtons(host).map((button) => button.dataset.active)).toEqual(['true', 'false']);
    store(OPEN_KEY, true);
    expect(openButtons(host).map((button) => button.dataset.active)).toEqual(['false', 'true']);
  });

  it('saves the open tabs switch', () => {
    const { host, writes } = setUp();
    act(() => getTag(host, '#_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_', 'input').click());
    expect(writes).toEqual([{ [OPEN_TABS_KEY]: !Settings.normalizeOverlayOpenTabsDefaultVisible(undefined) }]);
  });
});
