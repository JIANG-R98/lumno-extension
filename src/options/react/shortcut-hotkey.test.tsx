import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShortcutHotkeyApi,
  createShortcutHotkeyController
} from './shortcut-hotkey';

let destroy: (() => void) | null = null;

afterEach(() => {
  act(() => destroy?.());
  destroy = null;
  document.body.innerHTML = '';
});

describe('Options shortcut hotkey', () => {
  it('renders key tokens and the empty placeholder contract', () => {
    const host = document.createElement('div');
    const onContentReady = vi.fn();
    const controller = createShortcutHotkeyController(host, {
      onContentReady
    });
    destroy = controller.destroy;

    act(() => controller.render({
      animate: true,
      placeholder: 'Press keys',
      tokens: ['⌘', 'SHIFT', 'K']
    }));

    expect(host.dataset.reactIsland).toBe('options-shortcut-hotkey');
    expect(host.dataset.empty).toBe('false');
    expect(host.dataset.placeholder).toBe('Press keys');
    expect(host.children).toHaveLength(3);
    expect(host.children[1]?.textContent).toBe('SHIFT');
    expect(host.children[1]?.classList.contains(
      '_x_extension_shortcuts_hotkey_token_pop_2024_unique_'
    )).toBe(true);
    expect(onContentReady).toHaveBeenCalledTimes(1);

    act(() => controller.render({ placeholder: 'None', tokens: [] }));
    expect(host.dataset.empty).toBe('true');
    expect(host.dataset.placeholder).toBe('None');
    expect(host.children).toHaveLength(0);
    expect(createShortcutHotkeyApi().implementation).toBe('react');
  });
});
