import type { ShortcutDialogOptions } from './shortcut-dialog';
import { MODE_ADD, MODE_EDIT, clampEnterOffset, getEnterOffset, normalizeMode } from './shortcut-dialog-helpers';
import { lazyInstance } from '../../shared/lazy-instance';

// The modal is needed only when editing; keep it off the initial New Tab route.
export function createShortcutDialogApi() {
  return Object.freeze({
    implementation: 'react',
    MODE_ADD,
    MODE_EDIT,
    clampEnterOffset,
    getEnterOffset,
    normalizeMode,
    async createShortcutDialog(options: ShortcutDialogOptions) {
      const dialog = await import('./shortcut-dialog');
      return dialog.createShortcutDialog(options);
    }
  });
}

// The one instance a page or injected script draws through, made on first use.
export const getShortcutDialogApi = lazyInstance(createShortcutDialogApi);
