// @ts-nocheck
// Opening, closing and positioning the bookmark cascade menu, and the
// top-level bookmarks local search matches against.
function createBookmarkCascadeActions(deps) {
  const {
    bookmarksRuntime,
    t
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function openBookmarkCascadeMenu(item, anchorElement, options) {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.open(item, anchorElement, {
        ...options,
        toggle: !options || options.dragMode !== true
      });
    }
  }

  // `{ animate: true }` folds the menu away rather than removing it at once.
  function closeBookmarkCascadeMenu(options) {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.close(options);
    }
  }

  function positionBookmarkCascadeLevels() {
    if (pageState.bookmarkCascadeRuntime) {
      pageState.bookmarkCascadeRuntime.positionLevels();
    }
  }

  function getTopBookmarks(limit, folderId) {
    const parsedLimit = Number.parseInt(limit, 10);
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

export { createBookmarkCascadeActions };
