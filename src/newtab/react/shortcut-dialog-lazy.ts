import type { ShortcutDialogOptions } from './shortcut-dialog';
import { MODE_ADD, MODE_EDIT, clampEnterOffset, getEnterOffset, normalizeMode } from './shortcut-dialog-helpers';

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
