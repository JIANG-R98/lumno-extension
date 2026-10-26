import { describe, expect, it } from 'vitest';
import {
  readOverlayCommand,
  readPageShortcutToastCommand,
  readPipPickerCommand,
  readStartCommand,
  readTabSwitcherCommand
} from './injected-commands';

describe('injected commands', () => {
  it('reads a toggle with its untrusted tabs and context', () => {
    expect(readOverlayCommand({ type: 'toggle', tabs: [1], context: { x: 1 }, extra: true }))
      .toEqual({ type: 'toggle', tabs: [1], context: { x: 1 } });
    expect(readTabSwitcherCommand({ type: 'toggle', context: 'raw' })).toEqual({ type: 'toggle', context: 'raw' });
    expect(readOverlayCommand({ type: 'open' })).toBeNull();
    expect(readTabSwitcherCommand(null)).toBeNull();
  });

  it('reads the page clip commands', () => {
    expect(readPipPickerCommand({ type: 'toggle' })).toEqual({ type: 'toggle' });
    expect(readPipPickerCommand({ type: 'conflict-toast' })).toEqual({ type: 'conflict-toast' });
    expect(readPipPickerCommand({ type: 'restore' })).toBeNull();
  });

  it('reads a toast and drops what it cannot show', () => {
    expect(readPageShortcutToastCommand({ type: 'show', message: 'Added', error: 1, duration: 'long', themeMode: 3 }))
      .toEqual({ type: 'show', message: 'Added', error: false, duration: undefined, themeMode: 'system' });
    expect(readPageShortcutToastCommand({ type: 'show', message: 'Full', error: true, duration: 5200, themeMode: 'dark' }))
      .toEqual({ type: 'show', message: 'Full', error: true, duration: 5200, themeMode: 'dark' });
    expect(readPageShortcutToastCommand({ type: 'show', message: '' })).toBeNull();
  });

  it('reads a start', () => {
    expect(readStartCommand({ type: 'start' })).toEqual({ type: 'start' });
    expect(readStartCommand({ type: 'stop' })).toBeNull();
  });
});
