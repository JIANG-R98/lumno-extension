import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Settings from '../domain/settings';
import type { StorageItems } from '../domain/storage-port';
import { createAppearanceGlobalSection } from './options-appearance-global-section';
import type { SettingSpec } from './options-setting-bindings';
import { createAppearanceGlobalSectionController } from './react/appearance-global-section';
import { getElement, getTag, getTags } from '../../tests/react/dom';

const sections: Array<{ destroy(): void }> = [];
const MOTION = '_x_extension_motion_effects_toggle_2026_unique_';
const SIMPLE = '_x_extension_simple_mode_toggle_2026_unique_';

function setUp() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const writes: StorageItems[] = [];
  const onTheme = vi.fn();
  const section = createAppearanceGlobalSection({
    view: (handlers) => createAppearanceGlobalSectionController(host, handlers),
    storageArea: { set: (items) => writes.push(items) },
    SETTINGS: Settings,
    getMessage: (_key, fallback) => fallback,
    onTheme
  });
  sections.push(section);
  const changes = new Map<string, (raw: unknown) => void>();
  section.bindSettings({
    bindSetting<V>(spec: SettingSpec<V>): void {
      changes.set(spec.key, (raw) => spec.apply(spec.normalize(raw), raw));
    }
  });
  return { host, writes, onTheme, section, changes };
}

afterEach(() => {
  act(() => sections.splice(0).forEach((section) => section.destroy()));
  document.body.textContent = '';
});

describe('Options Appearance global section', () => {
  it('lists the theme, then motion effects, then simple mode', () => {
    const { host } = setUp();
    const themeRow = getElement(host, '#_x_extension_theme_mode_row_2026_unique_');
    const motion = getTag(host, `#${MOTION}`, 'input');
    const simple = getTag(host, `#${SIMPLE}`, 'input');
    expect(themeRow.compareDocumentPosition(motion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(motion.compareDocumentPosition(simple) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps its copy and defaults: motion on with its guidance, simple mode off with its description', () => {
    const { host, changes } = setUp();
    expect(Array.from(changes.keys()).sort()).toEqual([
      Settings.motionEffectsEnabled.key,
      Settings.simpleModeEnabled.key
    ].sort());
    expect(getTag(host, `#${MOTION}`, 'input').checked).toBe(true);
    expect(getTag(host, `#${SIMPLE}`, 'input').checked).toBe(false);
    const motionRow = getTag(host, `#${MOTION}`, 'input').closest('._x_extension_setting_row_2024_unique_');
    const info = motionRow ? getElement(motionRow, '._x_extension_info_button_2026_unique_') : null;
    expect(info?.dataset.tooltip).toBe('如遇卡顿，或倾向于更利落的唤起方式，可关闭');
    const simpleRow = getTag(host, `#${SIMPLE}`, 'input').closest('._x_extension_setting_row_2024_unique_');
    expect(simpleRow ? getElement(simpleRow, '._x_extension_setting_desc_2024_unique_').textContent : '')
      .toBe('移除更多提示元素，使搜索框更简洁');
  });

  it('saves a switched setting', () => {
    const { host, writes } = setUp();
    act(() => getTag(host, `#${SIMPLE}`, 'input').click());
    expect(writes).toEqual([{ [Settings.simpleModeEnabled.key]: true }]);
  });

  it('draws the gallery the theme section hands over and reports a choice with its button', () => {
    const { host, section, onTheme } = setUp();
    act(() => section.themePicker.render({
      activeMode: 'dark',
      options: [
        { mode: 'system', label: '跟随系统设置', labelKey: 'settings_theme_system', previewSrc: 'system.svg' },
        { mode: 'dark', label: '深色', labelKey: 'settings_theme_dark', previewSrc: 'dark.svg' }
      ]
    }));
    const buttons = getTags(host, '._x_extension_theme_gallery_2026_unique_ button', 'button');
    expect(buttons.map((button) => button.dataset.active)).toEqual(['false', 'true']);
    act(() => buttons[0]?.click());
    expect(onTheme).toHaveBeenCalledWith('system', buttons[0]);
  });
});
