import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createGeneralSearchSection } from './options-general-search-section';
import type { SettingSpec } from './options-setting-bindings';
import { createSettingsSectionController } from './react/settings-rows-view';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const sections: Array<{ destroy(): void }> = [];

const SOURCE_TYPES_KEY = Settings.SEARCH_RESULT_SOURCE_TYPES_STORAGE_KEY;
const RESET = '_x_extension_search_result_source_types_reset_2026_unique_';

function setUp(stored: StorageItems = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  let local = ['topSite', 'bookmark', 'history'];
  const orderController = {
    sortLocalSourceTypes: (types: readonly string[]) => local.filter((type) => types.includes(type)),
    moveLocal: vi.fn((rendered: readonly string[], fromIndex: number, toIndex: number) => {
      const next = rendered.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      local = next;
      return Promise.resolve();
    }),
    resetLocal: vi.fn(() => {
      local = ['topSite', 'bookmark', 'history'];
      return Promise.resolve();
    }),
    isLocalDefault: () => local.join() === 'topSite,bookmark,history',
    attachLocalDrag: vi.fn(() => () => {})
  };
  const hideTooltip = vi.fn();
  const section = createGeneralSearchSection({
    view: (handlers) => createSettingsSectionController(host, handlers),
    storageArea: {
      get: (keys, callback) => callback(Object.fromEntries(keys.filter((key) => key in stored).map((key) => [key, stored[key]]))),
      set: (items) => writes.push(items)
    },
    SETTINGS: Settings,
    orderController,
    getMessage: (_key, fallback) => fallback,
    getViewportTopInset: () => 0,
    hideTooltip
  });
  sections.push(section);
  const changes = new Map<string, (raw: unknown) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  const store = (key: string, raw: unknown) => act(() => changes.get(key)?.(raw));
  return { host, writes, section, changes, store, orderController, hideTooltip };
}

const sourceValues = (host: HTMLElement) => getTags(host, '#_x_extension_search_result_source_types_2026_unique_ label', 'label')
  .map((label) => label.dataset.value);

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options General search results section', () => {
  it('binds every setting of the section and attaches the type drag', () => {
    const { changes, orderController } = setUp();
    expect(Array.from(changes.keys()).sort()).toEqual([
      Settings.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY,
      Settings.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY,
      Settings.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY,
      Settings.SEARCH_RESULT_PRIORITY_STORAGE_KEY,
      SOURCE_TYPES_KEY,
      Settings.SEARCH_RESULT_TAB_POSITION_STORAGE_KEY
    ].sort());
    expect(orderController.attachLocalDrag).toHaveBeenCalledTimes(1);
  });

  it('writes stored types back only when they were missing or not normalized', () => {
    expect(setUp().writes).toEqual([{ [SOURCE_TYPES_KEY]: ['topSite', 'bookmark', 'history'] }]);
    expect(setUp({ [SOURCE_TYPES_KEY]: ['topSite', 'bookmark', 'history'] }).writes).toEqual([]);
  });

  it('keeps at least one type checked and saves the choice', () => {
    const { host, writes } = setUp({ [SOURCE_TYPES_KEY]: ['history'] });
    const history = getTag(host, '#_x_extension_search_result_source_history_2026_unique_', 'input');
    expect(history.checked).toBe(true);
    act(() => history.click());
    expect(history.checked).toBe(true);
    expect(writes).toEqual([]);
    act(() => getTag(host, '#_x_extension_search_result_source_bookmark_2026_unique_', 'input').click());
    expect(writes).toEqual([{ [SOURCE_TYPES_KEY]: ['bookmark', 'history'] }]);
  });

  it('moves a type with Alt and the arrow keys and offers a reset until the defaults return', () => {
    const { host, writes, section, orderController, hideTooltip } = setUp({ [SOURCE_TYPES_KEY]: ['topSite', 'bookmark', 'history'] });
    expect(getTag(host, `#${RESET}`, 'button').hidden).toBe(true);
    const bookmark = getTag(host, '#_x_extension_search_result_source_bookmark_2026_unique_', 'input');
    act(() => {
      bookmark.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
    });
    expect(orderController.moveLocal).toHaveBeenCalledWith(['topSite', 'bookmark', 'history'], 1, 0);
    act(() => section.render());
    expect(sourceValues(host)).toEqual(['bookmark', 'topSite', 'history']);
    const reset = getTag(host, `#${RESET}`, 'button');
    expect(reset.hidden).toBe(false);
    expect(reset.dataset.tooltip).toBe('恢复默认');
    act(() => reset.click());
    expect(orderController.resetLocal).toHaveBeenCalledTimes(1);
    expect(hideTooltip).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([{ [SOURCE_TYPES_KEY]: ['topSite', 'bookmark', 'history'] }]);
    expect(sourceValues(host)).toEqual(['topSite', 'bookmark', 'history']);
    expect(reset.hidden).toBe(true);
    expect(document.activeElement).toBe(getTag(host, '#_x_extension_search_result_source_top_site_2026_unique_', 'input'));
  });

  it('switches the first result priority and keeps the hidden select in step', () => {
    const { host, writes, store } = setUp();
    const buttons = getTags(host, '#_x_extension_search_result_priority_tabs_wrap_2026_unique_ button', 'button');
    expect(buttons.map((button) => button.dataset.active)).toEqual(['true', 'false']);
    act(() => buttons[1]?.click());
    expect(writes).toContainEqual({ [Settings.SEARCH_RESULT_PRIORITY_STORAGE_KEY]: 'search' });
    expect(getTag(host, '#_x_extension_search_result_priority_select_2026_unique_', 'select').value).toBe('search');
    store(Settings.SEARCH_RESULT_PRIORITY_STORAGE_KEY, 'autocomplete');
    expect(getTags(host, '#_x_extension_search_result_priority_tabs_wrap_2026_unique_ button', 'button')
      .map((button) => button.dataset.active)).toEqual(['true', 'false']);
  });

  it('saves the display limit from its slider', () => {
    const { host, writes, store } = setUp();
    store(Settings.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY, 7);
    const slider = getTag(host, '#_x_extension_search_result_display_limit_slider_2026_unique_', 'input');
    expect(slider.value).toBe('7');
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '9');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(writes).toContainEqual({ [Settings.SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY]: 9 });
    expect(getElement(host, '#_x_extension_search_result_display_limit_setting_row_2026_unique_')).toBeTruthy();
  });

  it('saves the overlay and pinyin switches', () => {
    const { host, writes } = setUp({ [SOURCE_TYPES_KEY]: ['topSite', 'bookmark', 'history'] });
    act(() => getTag(host, '#_x_extension_overlay_open_tabs_default_visible_toggle_2026_unique_', 'input').click());
    act(() => getTag(host, '#_x_extension_search_fuzzy_pinyin_toggle_2026_unique_', 'input').click());
    expect(writes).toEqual([
      { [Settings.OVERLAY_OPEN_TABS_DEFAULT_VISIBLE_STORAGE_KEY]: !Settings.normalizeOverlayOpenTabsDefaultVisible(undefined) },
      { [Settings.SEARCH_FUZZY_PINYIN_ENABLED_STORAGE_KEY]: !Settings.normalizeSearchFuzzyPinyinEnabled(undefined) }
    ]);
  });
});
