import type { BookmarkHeaderModel } from './bookmark-header';

const noop = () => {};

// A bookmark header at the root folder on its first page, with the actions in the section.
export function createBookmarkHeaderModel(overrides: Partial<BookmarkHeaderModel> = {}): BookmarkHeaderModel {
  return {
    heading: 'Bookmarks',
    rootFolderId: '1',
    crumbs: [],
    previous: { label: 'Previous page', enabled: false },
    next: { label: 'Next page', enabled: true },
    managerLabel: 'Open bookmark manager',
    modeMenu: {
      id: 'bookmark-mode',
      title: 'Display mode',
      value: 'folder',
      options: [{ value: 'folder', label: 'Folders' }, { value: 'top', label: 'Top bar' }],
      onChange: noop,
      onAction: noop
    },
    actionsInTopbar: false,
    onNavigate: noop,
    onPage: noop,
    onOpenManager: noop,
    showTooltip: noop,
    hideTooltip: noop,
    onMenuBeforeOpen: noop,
    getMenuViewportTopInset: () => 8,
    ...overrides
  };
}
