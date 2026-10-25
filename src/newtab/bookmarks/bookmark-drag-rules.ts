// The rules a bookmark drag follows, apart from the page: where a reordered
// card lands among its folder's bookmarks, which drops from other surfaces
// the bookmarks accept, and how the undo keys read on this platform.
import { getNavigatorPlatform } from '../../domain/shortcut-display';
import type { NavigatorLike } from '../../domain/shortcut-display';
import { isBookmarkFolderDropTarget } from '../cross-surface-drag';
import type { DragDropTarget, SurfaceDragState } from '../cross-surface-drag';
import { isFolderInsideBookmark } from './bookmark-move-history';
import type { BookmarkLocation } from './bookmark-move-history';
import type { BookmarkItem, BookmarkNode } from './bookmarks-store';

interface AnimationRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface UndoShortcutLabels {
  undo: string;
  redo: string;
}

// A finite box, or null; right and bottom follow from the size when missing.
function normalizeAnimationRect(rect: Partial<AnimationRect> | null | undefined): AnimationRect | null {
  if (!rect) {
    return null;
  }
  const left = Number(rect.left);
  const top = Number(rect.top);
  const width = Number(rect.width);
  const height = Number(rect.height);
  if (!Number.isFinite(left) || !Number.isFinite(top) ||
      !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  return {
    left,
    top,
    right: Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + width,
    bottom: Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + height,
    width,
    height
  };
}

// Where the bookmark the drag reordered goes among its folder's bookmarks,
// read from the order `items` now shows: the slot of the bookmark after it,
// or the one after the bookmark before it. The folder shown stands in for
// an item without a parent.
function getMoveDestination(
  items: readonly BookmarkItem[],
  bookmarkId: unknown,
  shownFolderId: string
): BookmarkLocation | null {
  const id = String(bookmarkId || '');
  const movedIndex = id ? items.findIndex((item) => String(item.id || '') === id) : -1;
  if (movedIndex < 0) {
    return null;
  }
  const parentId = String(items[movedIndex].parentId || shownFolderId || '');
  if (!parentId) {
    return null;
  }
  const isSibling = (item: BookmarkItem): boolean =>
    String(item.parentId || parentId) === parentId && Number.isFinite(Number(item.index));
  const afterItem = items.slice(movedIndex + 1).find(isSibling);
  const beforeItem = afterItem ? null : items.slice(0, movedIndex).reverse().find(isSibling);
  const destinationIndex = afterItem
    ? Number(afterItem.index)
    : (beforeItem ? Number(beforeItem.index) + 1 : 0);
  return {
    parentId,
    index: Math.max(0, Math.round(destinationIndex))
  };
}

// Whether a drag from another surface may drop on `target`: a bookmark
// folder that can change, never inside the dragged folder itself. A folder
// shortcut returns only to the folder its bookmark sits in.
function isExternalBookmarkDropAllowed(
  state: Pick<SurfaceDragState, 'bookmarkId' | 'shortcutId'> | null,
  target: DragDropTarget | null,
  nodeMap: ReadonlyMap<string, BookmarkNode>
): boolean {
  if (!target || target.kind === 'blocked' || target.surface === 'shortcuts' ||
      !isBookmarkFolderDropTarget(target.folderId, nodeMap)) {
    return false;
  }
  const destination = nodeMap.get(String(target.folderId));
  if (!destination || destination.unmodifiable) {
    return false;
  }
  if (target.kind === 'return') {
    const source = state ? nodeMap.get(String(state.bookmarkId || '')) : undefined;
    if (!state || !source || source.url || !state.shortcutId ||
        String(target.bookmarkId) !== String(source.id) ||
        String(target.folderId) !== String(source.parentId)) {
      return false;
    }
  }
  return !state || !state.bookmarkId || !isFolderInsideBookmark(nodeMap, state.bookmarkId, target.folderId);
}

function isMacPlatform(navigatorLike: NavigatorLike | null | undefined): boolean {
  return getNavigatorPlatform(navigatorLike) === 'mac';
}

// The undo and redo keys, as the toasts name them.
function getUndoShortcutLabels(navigatorLike: NavigatorLike | null | undefined): UndoShortcutLabels {
  return isMacPlatform(navigatorLike)
    ? { undo: '⌘Z', redo: '⇧⌘Z' }
    : { undo: 'Ctrl+Z', redo: 'Ctrl+Shift+Z' };
}

// On macOS a Control-click is a right-click. Starting a drag on it would
// make the context menu that follows ignore the press.
function isMacContextClick(event: Pick<MouseEvent, 'ctrlKey'>, navigatorLike: NavigatorLike | null | undefined): boolean {
  return event.ctrlKey && isMacPlatform(navigatorLike);
}

export {
  getMoveDestination,
  getUndoShortcutLabels,
  isExternalBookmarkDropAllowed,
  isMacContextClick,
  normalizeAnimationRect
};
export type { AnimationRect, UndoShortcutLabels };
