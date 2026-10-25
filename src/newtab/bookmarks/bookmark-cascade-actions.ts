// Opening, closing and positioning the bookmark cascade menu, and the
// top-level bookmarks local search matches against.
import type { Translate } from '../newtab-types';
import type { BookmarkCascadeRuntime } from './bookmark-cascade-menu';
import type { BookmarkItem, BookmarkPathEntry } from './bookmarks-store';
import type { BookmarksRuntime } from './bookmarks-runtime';

interface BookmarkCascadeActionsState {
  // Made with the bookmark section.
  bookmarkCascadeRuntime: BookmarkCascadeRuntime | null;
  bookmarkCurrentFolderId: string;
  bookmarkRootFolderId: string;
  bookmarkFolderPath: BookmarkPathEntry[];
}

interface BookmarkCascadeActionsDeps {
  bookmarksRuntime: BookmarksRuntime;
  t: Translate;
  pageState: BookmarkCascadeActionsState;
}

type CascadeOpenArgs = Parameters<BookmarkCascadeRuntime['open']>;
type CascadeCloseOptions = Parameters<BookmarkCascadeRuntime['close']>[0];

function createBookmarkCascadeActions(deps: BookmarkCascadeActionsDeps) {
  const {
    bookmarksRuntime,
    t
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function openBookmarkCascadeMenu(item: CascadeOpenArgs[0], anchorElement: CascadeOpenArgs[1], options?: CascadeOpenArgs[2]): void {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.open(item, anchorElement, {
        ...options,
        toggle: !options || options.dragMode !== true
      });
    }
  }

  // `{ animate: true }` folds the menu away rather than removing it at once.
  function closeBookmarkCascadeMenu(options?: CascadeCloseOptions): void {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.close(options);
    }
  }

  function positionBookmarkCascadeLevels(): void {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.positionLevels();
    }
  }

  function getTopBookmarks(limit: number, folderId?: string): Promise<BookmarkItem[]> {
    const parsedLimit = Math.floor(limit);
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;
    return bookmarksRuntime.readFolder(
      folderId || pageState.bookmarkCurrentFolderId || pageState.bookmarkRootFolderId,
      {
        limit: safeLimit,
        rootTitle: t('bookmarks_heading', '书签')
      }
    ).then((result) => {
      pageState.bookmarkRootFolderId = String(result.rootFolderId || '1');
      pageState.bookmarkCurrentFolderId = String(result.folderId || pageState.bookmarkRootFolderId);
      pageState.bookmarkFolderPath = Array.isArray(result.path)
        ? result.path
        : [{ id: pageState.bookmarkRootFolderId, title: t('bookmarks_heading', '书签') }];
      return Array.isArray(result.items) ? result.items : [];
    });
  }

  return {
    openBookmarkCascadeMenu,
    closeBookmarkCascadeMenu,
    positionBookmarkCascadeLevels,
    getTopBookmarks
  };
}

type BookmarkCascadeActions = ReturnType<typeof createBookmarkCascadeActions>;

export { createBookmarkCascadeActions };
export type { BookmarkCascadeActions, BookmarkCascadeActionsDeps, BookmarkCascadeActionsState };
