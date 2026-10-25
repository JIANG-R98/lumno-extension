import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createAppearanceOverlaySection } from './options-appearance-overlay-section';
import type { SettingSpec } from './options-setting-bindings';
import { createAppearanceOverlaySectionController } from './react/appearance-overlay-section';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const sections: Array<{ destroy(): void }> = [];
const FONT = '_x_extension_overlay_font_select_2026_unique_';
const FALLBACK = '_x_extension_overlay_font_fallback_select_2026_unique_';
const ADAPTATION_ROW = '_x_extension_overlay_page_theme_adaptation_row_2026_unique_';
const FONTS = [
  { fontId: 'PingFangSC', displayName: '苹方-简' },
  { fontId: 'Inter', displayName: 'Inter' },
  { fontId: 'Inter', displayName: 'Inter Duplicate' }
];

async function setUp({ fonts = FONTS, browserFamily = 'chromium' } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const removed: string[] = [];
  const localWrites: StorageItems[] = [];
  const section = createAppearanceOverlaySection({
    view: (handlers) => createAppearanceOverlaySectionController(host, handlers),
    storageArea: { set: (items) => writes.push(items), remove: (key) => removed.push(key) },
    localStorageArea: { set: (items) => localWrites.push(items) },
    SETTINGS: Settings,
    getMessage: (key, fallback) => (key === 'settings_overlay_font_missing' ? '{font} is missing' : fallback),
    formatTemplate: (text, params) => text.replace('{font}', String(params.font)),
    browserFamily,
    listInstalledFonts: () => Promise.resolve(fonts),
    getViewportTopInset: () => 0
  });
  sections.push(section);
  const changes = new Map<string, (raw: unknown) => void>();
  const localChanges = new Map<string, (raw: unknown) => void>();
  const binder = (into: Map<string, (raw: unknown) => void>) => ({
    bindSetting<V>(spec: SettingSpec<V>): void {
      into.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  section.bindSettings(binder(changes), binder(localChanges));
  // The installed fonts arrive after the first draw.
  await act(async () => {});
  const store = (key: string, raw: unknown) => act(() => (changes.get(key) || localChanges.get(key))?.(raw));
  return { host, writes, removed, localWrites, section, changes, localChanges, store };
}

function slide(host: HTMLElement, value: number) {
  const slider = getTag(host, '#_x_extension_overlay_width_slider_2026_unique_', 'input');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, String(value));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return slider;
}

function openMenu(selectId: string) {
  act(() => getElement(document, `[aria-controls="${selectId}_control_listbox"]`).click());
  return getTags(document, `#${selectId}_control_menu [role="option"]`, 'div');
}

function pick(selectId: string, value: string) {
  openMenu(selectId);
  const option = getElement(document, `#${selectId}_control_menu [role="option"][data-value="${value}"]`);
  act(() => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    option.click();
  });
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options Appearance webpage overlay section', () => {
  it('binds its synced settings and this device\'s fonts', async () => {
    const { changes, localChanges } = await setUp();
    expect(Array.from(changes.keys()).sort()).toEqual([
      Settings.OVERLAY_ENTER_ANIMATION_STORAGE_KEY,
      Settings.OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY,
      Settings.OVERLAY_SIZE_MODE_STORAGE_KEY,
      Settings.OVERLAY_WIDTH_STORAGE_KEY
    ].sort());
    expect(Array.from(localChanges.keys()).sort()).toEqual([
      Settings.OVERLAY_FONT_FALLBACK_STORAGE_KEY,
      Settings.OVERLAY_FONT_FAMILY_STORAGE_KEY,
      Settings.OVERLAY_FONT_LABELS_STORAGE_KEY
    ].sort());
  });

  it('saves the size, and the width follows it until set apart', async () => {
    const { host, writes, removed, store } = await setUp();
    const slider = getTag(host, '#_x_extension_overlay_width_slider_2026_unique_', 'input');
    const standard = Settings.getOverlaySizePreset('standard').width;
    const large = Settings.getOverlaySizePreset('large').width;
    expect(slider.value).toBe(String(standard));
    act(() => getElement(host, '[data-overlay-size="large"]').click());
    expect(writes).toEqual([{ [Settings.OVERLAY_SIZE_MODE_STORAGE_KEY]: 'large' }]);
    expect(slider.value).toBe(String(large));

    slide(host, 900);
    expect(writes.at(-1)).toEqual({ [Settings.OVERLAY_WIDTH_STORAGE_KEY]: 900 });
    slide(host, large);
    expect(removed).toEqual([Settings.OVERLAY_WIDTH_STORAGE_KEY]);

    store(Settings.OVERLAY_WIDTH_STORAGE_KEY, 700);
    store(Settings.OVERLAY_SIZE_MODE_STORAGE_KEY, 'compact');
    expect(slider.value).toBe('700');
  });

  it('saves the opening animation', async () => {
    const { host, writes } = await setUp();
    const pressed = () => getTags(host, '[data-overlay-enter-animation]', 'button').map((button) => button.getAttribute('aria-checked'));
    expect(pressed()).toEqual(['true', 'false']);
    act(() => getElement(host, '[data-overlay-enter-animation="fade"]').click());
    expect(writes).toEqual([{ [Settings.OVERLAY_ENTER_ANIMATION_STORAGE_KEY]: 'fade' }]);
    expect(pressed()).toEqual(['false', 'true']);
  });

  it('lists the default, then each installed font once by name, and keeps a choice on this device', async () => {
    const { host, localWrites } = await setUp();
    expect(openMenu(FONT).map((option) => [option.dataset.value, option.textContent])).toEqual([
      ['', '默认'],
      ['Inter', 'Inter'],
      ['PingFangSC', '苹方-简']
    ]);
    expect(getElement(host, `[data-select="${FONT}"]`).dataset.selectSearchable).toBe('true');
    pick(FONT, 'PingFangSC');
    pick(FALLBACK, 'Inter');
    expect(localWrites).toEqual([
      { [Settings.OVERLAY_FONT_FAMILY_STORAGE_KEY]: 'PingFangSC', [Settings.OVERLAY_FONT_LABELS_STORAGE_KEY]: { PingFangSC: '苹方-简' } },
      {
        [Settings.OVERLAY_FONT_FALLBACK_STORAGE_KEY]: 'Inter',
        [Settings.OVERLAY_FONT_LABELS_STORAGE_KEY]: { PingFangSC: '苹方-简', Inter: 'Inter' }
      }
    ]);
  });

  it('names a chosen font this device lacks and clears it in one click', async () => {
    const { host, localWrites, store } = await setUp();
    store(Settings.OVERLAY_FONT_LABELS_STORAGE_KEY, { 'Missing Sans': 'Missing Sans Display' });
    store(Settings.OVERLAY_FONT_FAMILY_STORAGE_KEY, 'Missing Sans');
    const notice = getElement(host, '#_x_extension_overlay_font_missing_2026_unique_');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain('Missing Sans Display is missing');
    expect(openMenu(FONT).at(-1)?.textContent).toBe('Missing Sans Display');
    expect(getElement(host, '#_x_extension_overlay_font_fallback_missing_2026_unique_').hidden).toBe(true);
    act(() => getTag(notice, '._x_extension_overlay_font_reset_2026_unique_', 'button').click());
    expect(localWrites.at(-1)).toEqual({ [Settings.OVERLAY_FONT_FAMILY_STORAGE_KEY]: '', [Settings.OVERLAY_FONT_LABELS_STORAGE_KEY]: {} });
    expect(notice.hidden).toBe(true);
  });

  it('flags nothing as missing when the font list could not be read', async () => {
    const { host, store } = await setUp({ fonts: [] });
    store(Settings.OVERLAY_FONT_FAMILY_STORAGE_KEY, 'Inter');
    expect(getElement(host, '#_x_extension_overlay_font_missing_2026_unique_').hidden).toBe(true);
    expect(openMenu(FONT).map((option) => option.dataset.value)).toEqual(['', 'Inter']);
  });

  it('keeps the font rows visible but inert on Firefox', async () => {
    const { host } = await setUp({ fonts: [], browserFamily: 'firefox' });
    ['_x_extension_overlay_font_row_2026_unique_', '_x_extension_overlay_font_fallback_row_2026_unique_'].forEach((id) => {
      const row = getElement(host, `#${id}`);
      expect([row.dataset.browserUnsupported, row.dataset.unsupported]).toEqual(['firefox', 'true']);
      expect(row.dataset.unsupportedReasonKey).toBe('settings_overlay_font_unsupported_tooltip');
    });
    expect(getElement(host, `[data-select="${FONT}"]`).dataset.disabled).toBe('true');
  });

  it('shows page theme adaptation only while the color mode follows the system', async () => {
    const { host, writes, section } = await setUp();
    const row = getElement(host, `#${ADAPTATION_ROW}`);
    expect(row.hidden).toBe(false);
    let changed = false;
    act(() => { changed = section.showThemeMode('dark'); });
    expect([changed, row.hidden, row.getAttribute('aria-hidden')]).toEqual([true, true, 'true']);
    act(() => { changed = section.showThemeMode('light'); });
    expect([changed, row.hidden]).toEqual([false, true]);
    act(() => { changed = section.showThemeMode('system'); });
    expect([changed, row.hidden]).toEqual([true, false]);
    act(() => getTag(host, '#_x_extension_overlay_page_theme_adaptation_toggle_2026_unique_', 'input').click());
    expect(writes).toEqual([{ [Settings.OVERLAY_PAGE_THEME_ADAPTATION_ENABLED_STORAGE_KEY]: false }]);
  });

  it('redraws once the installed fonts arrive', async () => {
    let resolveFonts: (fonts: chrome.fontSettings.FontName[]) => void = () => {};
    const render = vi.fn();
    const section = createAppearanceOverlaySection({
      view: () => ({ render, destroy: vi.fn() }),
      storageArea: null,
      localStorageArea: null,
      SETTINGS: Settings,
      getMessage: (_key, fallback) => fallback,
      formatTemplate: (text) => text,
      browserFamily: 'chromium',
      listInstalledFonts: () => new Promise((resolve) => { resolveFonts = resolve; }),
      getViewportTopInset: () => 0
    });
    const drawn = render.mock.calls.length;
    resolveFonts(FONTS);
    await act(async () => {});
    expect(render.mock.calls.length).toBe(drawn + 1);
    section.destroy();
  });
});
