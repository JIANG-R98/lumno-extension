import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPageNoticeApi, renderPageNotice } from './page-notice';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('New Tab React page notice', () => {
  it('renders, opens details, and dismisses through the adapter contract', () => {
    const openExtensionDetailsPage = vi.fn();
    const onClose = vi.fn();
    let controller = null as ReturnType<typeof renderPageNotice>;
    act(() => {
      controller = renderPageNotice({
        document,
        messages: {
          getRiSvg: (icon: string) => `<i data-icon="${icon}"></i>`,
          t: (_key: string, fallback: string) => fallback
        },
        onClose,
        openExtensionDetailsPage,
        params: new URLSearchParams('notice=file-access'),
        windowObj: window
      });
    });
    if (!controller) {
      throw new Error('Expected page notice controller');
    }
    const noticeController = controller;
    expect(createPageNoticeApi().implementation).toBe('react');
    expect(noticeController.element.dataset.reactIsland).toBe(
      'newtab-page-notice'
    );
    act(() => {
      noticeController.element
        .querySelector<HTMLButtonElement>('.x-nt-page-notice-primary')
        ?.click();
    });
    expect(openExtensionDetailsPage).toHaveBeenCalledTimes(1);
    act(() => {
      noticeController.element
        .querySelector<HTMLButtonElement>('.x-nt-page-notice-close')
        ?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(noticeController.element.isConnected).toBe(false);
  });

  it('does not render without the file access query', () => {
    expect(
      renderPageNotice({
        document,
        params: new URLSearchParams()
      })
    ).toBeNull();
  });
});
