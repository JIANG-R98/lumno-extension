// The shortcut that opens the search window, as the Shortcuts section's
// status chip names it. The browser owns the command; the page reads its
// current chord and falls back to the platform default when it has none.
import type { GetMessage } from './options-types';

// The parts of chrome this reads; commands is missing in some browsers.
interface SearchShortcutChromeApi {
  commands?: {
    getAll(callback: (commands: Array<{ name?: string; shortcut?: string }>) => void): void;
  };
  runtime: { lastError?: { message?: string } | null };
}

interface SearchShortcutStatusOptions {
  chromeApi: SearchShortcutChromeApi;
  isMacPlatform: boolean;
  formatShortcutForDisplay(shortcut: string): string;
  getMessage: GetMessage;
  // Receives the chip's text whenever it changes or is translated again.
  onChange(label: string): void;
}

function createSearchShortcutStatus(options: SearchShortcutStatusOptions) {
  const { chromeApi, isMacPlatform, formatShortcutForDisplay, getMessage, onChange } = options;
  // Null until the browser has answered.
  let shortcut: string | null = null;

  function getDefaultShortcut(): string {
    return isMacPlatform ? 'Command+Shift+K' : 'Ctrl+Shift+K';
  }

  function getLabel(): string {
    return shortcut
      ? (formatShortcutForDisplay(shortcut) || shortcut)
      : getMessage('settings_shortcuts_unset', '未设置');
  }

  function render(): void {
    onChange(getLabel());
  }

  function apply(next: string): void {
    shortcut = next;
    render();
  }

  function load(): void {
    const commands = chromeApi.commands;
    if (!commands || typeof commands.getAll !== 'function') {
      apply(getDefaultShortcut());
      return;
    }
    commands.getAll((items) => {
      if (chromeApi.runtime.lastError) {
        apply(getDefaultShortcut());
        return;
      }
      const command = (Array.isArray(items) ? items : []).find((item) => item && item.name === 'show-search');
      const current = command && typeof command.shortcut === 'string' ? command.shortcut.trim() : '';
      apply(current || getDefaultShortcut());
    });
  }

  return Object.freeze({ getLabel, load, render });
}

export { createSearchShortcutStatus };
export type { SearchShortcutChromeApi, SearchShortcutStatusOptions };
