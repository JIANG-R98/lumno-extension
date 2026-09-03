import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRecentHistoryDialog,
  type RecentHistoryDialogController
} from './recent-history-dialog';

let controller: RecentHistoryDialogController | null = null;

afterEach(() => {
  act(() => controller?.destroy());
  controller = null;
  document.body.innerHTML = '';
});

describe('recent change history dialog', () => {
  it('shows current and retained versions and restores any selected version', async () => {
    const restore = vi.fn().mockResolvedValue(true);
    act(() => {
      controller = createRecentHistoryDialog({
        documentObj: document,
        windowObj: window,
        t: (_key, fallback) => fallback,
        onRestore: restore
      });
      controller?.mount(document.body);
      controller?.open({
        item: {
          cardId: 'card-1',
          title: 'Episode C',
          url: 'https://series.example/c',
          updateHistory: [
            { title: 'Episode B', url: 'https://series.example/b', updatedAt: 200 },
            { title: 'Episode A', url: 'https://series.example/a', updatedAt: 100 }
          ]
        }
      });
    });

    expect(document.querySelector('.x-nt-recent-history-current')?.textContent).toContain('Episode C');
    expect(Array.from(document.querySelectorAll('.x-nt-recent-history-version')).map((node) => node.textContent))
      .toEqual(expect.arrayContaining([expect.stringContaining('Episode B'), expect.stringContaining('Episode A')]));

    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-history-index]');
    await act(async () => buttons[1].click());
    expect(restore).toHaveBeenCalledWith(
      expect.objectContaining({ cardId: 'card-1' }),
      expect.objectContaining({ title: 'Episode A', url: 'https://series.example/a' }),
      1
    );
  });
});
