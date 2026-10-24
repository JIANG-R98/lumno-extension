import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBookmarkBreadcrumbApi,
  createBookmarkBreadcrumbController
} from './bookmark-breadcrumb';

let destroy: (() => void) | null = null;

afterEach(() => {
  act(() => destroy?.());
  destroy = null;
  document.body.innerHTML = '';
});

describe('New Tab bookmark breadcrumb', () => {
  it('renders navigation and current-folder drop contracts', () => {
    const host = document.createElement('div');
    const onNavigate = vi.fn();
    const controller = createBookmarkBreadcrumbController(host, {
      onNavigate
    });
    destroy = controller.destroy;

    act(() => controller.render({
      items: [
        { id: 'work', title: 'Work' },
        { id: 'docs', title: 'Docs' }
      ]
    }));

    expect(host.dataset.reactIsland).toBe('newtab-bookmark-breadcrumb');
    expect(host.style.display).toBe('inline-flex');
    expect(host.querySelectorAll('.x-nt-bookmarks-crumb-item')).toHaveLength(2);
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[1]?.disabled).toBe(true);
    expect(buttons[1]?.dataset.bookmarkDropFolderId).toBe('docs');

    act(() => buttons[0]?.click());
    expect(onNavigate).toHaveBeenCalledWith('work');

    act(() => controller.render({ items: [] }));
    expect(host.style.display).toBe('none');
    expect(createBookmarkBreadcrumbApi().implementation).toBe('react');
  });
});
