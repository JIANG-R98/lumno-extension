import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import type { Setting } from '../domain/settings/define';
import { createAppearanceNewtabLayoutSection } from './options-appearance-newtab-layout-section';
import { createAppearanceNewtabLayoutSectionController } from './react/appearance-newtab-layout-section';
import { getElement, getTag, getTags } from '../../tests/react/dom';
import { createOptionsTestSettings } from '../../tests/react/options-settings';

const sections: Array<{ destroy(): void }> = [];

function setUp(stored: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const settings = createOptionsTestSettings({ sync: stored });
  const notifyNewtabSectionsRefresh = vi.fn();
  const section = createAppearanceNewtabLayoutSection({
    view: (handlers) => createAppearanceNewtabLayoutSectionController(host, handlers),
    settingsStore: settings.store,
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback,
    notifyNewtabSectionsRefresh
  });
  sections.push(section);
  act(() => section.bindSettings(settings.binder));
  const store = (setting: Setting<unknown>, raw: unknown) => settings.change(setting, raw);
  return { host, writes: settings.writes, settings, store, notifyNewtabSectionsRefresh };
}

function slide(host: HTMLElement, id: string, value: number) {
  const slider = getTag(host, `#${id}`, 'input');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, String(value));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return slider;
}

const toggle = (host: HTMLElement, name: string) => getTag(host, `#_x_extension_${name}_toggle_2026_unique_`, 'input');

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options Appearance New Tab layout section', () => {
  it('binds every setting', () => {
    const { settings } = setUp();
    const shortcutKeys = [
      Settings.newtabShortcutsVisible.key,
      Settings.newtabShortcutAddVisible.key,
      Settings.newtabShortcutDockMagnificationEnabled.key,
      Settings.newtabShortcutColumns.key,
      Settings.newtabShortcutSize.key,
      Settings.newtabShortcutGap.key
    ];
    expect(settings.boundKeys().sort()).toEqual([
      ...shortcutKeys,
      Settings.newtabInputAutoFocusEnabled.key,
      Settings.bookmarkCount.key,
      Settings.bookmarkColumns.key,
      Settings.bookmarkFolderIconsVisible.key,
      Settings.recentCount.key,
      Settings.recentMode.key,
      Settings.newtabFeedbackButtonVisible.key,
      Settings.newtabAppearanceButtonVisible.key
    ].sort());
  });

  it('infers the shortcut columns from the older width without writing anything back', async () => {
    const width = Settings.NEWTAB_SHORTCUT_WIDTH_MAX;
    const { host, writes, settings } = setUp({ [Settings.newtabShortcutWidth.key]: width });
    const columns = Settings.inferNewtabShortcutColumnsFromWidth(width);
    await settings.settle();
    expect(getTag(host, '#_x_extension_newtab_shortcut_columns_slider_2026_unique_', 'input').value).toBe(String(columns));
    expect(writes).toEqual([]);
  });

  it('dims the shortcut options while shortcuts are off', async () => {
    const { host, writes, settings } = setUp({
      [Settings.newtabShortcutsVisible.key]: true,
      [Settings.newtabShortcutColumns.key]: 8
    });
    await settings.settle();
    expect(toggle(host, 'newtab_shortcut_add').disabled).toBe(false);
    act(() => toggle(host, 'newtab_shortcuts').click());
    await settings.settle();
    expect(writes.at(-1)).toEqual({ [Settings.newtabShortcutsVisible.key]: false });
    expect(toggle(host, 'newtab_shortcut_add').disabled).toBe(true);
    expect(getElement(host, '#_x_extension_newtab_shortcut_gap_setting_row_2026_unique_').dataset.disabled).toBe('true');
    expect(getTag(host, '#_x_extension_newtab_shortcut_size_slider_2026_unique_', 'input').disabled).toBe(true);
  });

  it('saves the bookmark rows in fours and folds the bookmark layout when there are none', async () => {
    const { host, writes, notifyNewtabSectionsRefresh, store, settings } = setUp();
    await store(Settings.bookmarkCount, 8);
    const subrows = getElement(host, '#_x_extension_bookmark_subrows_2026_unique_');
    expect(subrows.dataset.expanded).toBe('true');
    slide(host, '_x_extension_bookmark_rows_slider_2026_unique_', 0);
    await settings.settle();
    expect(writes.at(-1)).toEqual({ [Settings.bookmarkCount.key]: 0 });
    expect(notifyNewtabSectionsRefresh).toHaveBeenCalledWith('bookmarks');
    expect(subrows.dataset.expanded).toBe('false');
    // The bookmark options come before the site cards.
    const folderIcons = getElement(host, '#_x_extension_bookmark_folder_icons_visible_row_2026_unique_');
    expect(folderIcons.compareDocumentPosition(getElement(host, '#_x_extension_recent_count_control_2026_unique_')) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const info = getElement(host, '#_x_extension_bookmark_rows_setting_row_2026_unique_ ._x_extension_info_button_2026_unique_');
    expect(info.dataset.tooltip).toBe('该值为宽度充足时的最大数量，实际显示数量会根据可用空间自适应。');
  });

  it('offers the choice of recent sites only while there are cards', async () => {
    const { host, writes, notifyNewtabSectionsRefresh, store, settings } = setUp();
    await store(Settings.recentCount, 4);
    const modes = () => getTags(host, '#_x_extension_recent_mode_tabs_wrap_2024_unique_ button', 'button');
    // Anything but "most" shows "latest".
    await store(Settings.recentMode, 'bogus');
    expect(modes().map((button) => button.dataset.active)).toEqual(['true', 'false']);
    await store(Settings.recentMode, 'most');
    expect(modes().map((button) => button.dataset.active)).toEqual(['false', 'true']);
    act(() => modes()[0]?.click());
    await settings.settle();
    expect(writes.at(-1)).toEqual({ [Settings.recentMode.key]: 'latest' });
    expect(notifyNewtabSectionsRefresh).toHaveBeenCalledWith('recent');
    slide(host, '_x_extension_recent_count_slider_2026_unique_', 0);
    await settings.settle();
    expect(writes.at(-1)).toEqual({ [Settings.recentCount.key]: 0 });
    expect(host.querySelector('#_x_extension_recent_mode_tabs_wrap_2024_unique_')).toBeNull();
  });

  it('saves the page button switches', async () => {
    const { host, writes, settings } = setUp();
    act(() => toggle(host, 'newtab_feedback_button_visible').click());
    act(() => toggle(host, 'newtab_input_auto_focus').click());
    await settings.settle();
    expect(writes.slice(-2)).toEqual([
      { [Settings.newtabFeedbackButtonVisible.key]: !Settings.newtabFeedbackButtonVisible.parse(undefined) },
      { [Settings.newtabInputAutoFocusEnabled.key]: !Settings.newtabInputAutoFocusEnabled.parse(undefined) }
    ]);
  });
});
