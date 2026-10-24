import type { createRecentHistoryDialog } from './recent-history-dialog';

// The history dialog opens only from a linked card's context menu; keep it off
// the initial New Tab route.
export function createRecentHistoryDialogApi() {
  return Object.freeze({
    implementation: 'react' as const,
    async createRecentHistoryDialog(options: Parameters<typeof createRecentHistoryDialog>[0]) {
      const dialog = await import('./recent-history-dialog');
      return dialog.createRecentHistoryDialog(options);
    }
  });
}
