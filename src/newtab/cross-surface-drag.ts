// What dragging between the bookmarks, the shortcuts and the recent sites
// shares: insertion slots and gaps, and the shortcut lists a drop makes.
import { isShortcutFolder } from '../domain/shortcuts-store';
import type { ShortcutItem } from '../domain/shortcuts-store';
import type { BookmarkNode } from './bookmarks/bookmarks-store';

const BOOKMARK_TREE_ROOT_ID = '0';

// An item's box in the viewport, with its center.
interface LayoutRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

type MarkerPosition = 'before' | 'after';

interface InsertionSlot {
  // The position in the list the item goes to.
  index: number;
  // The item the marker sits by; -1 in an empty list.
  anchorIndex: number;
  markerPosition: MarkerPosition;
}

type InsertionGapSide = 'before' | 'after';

// A shortcut and where it was, to put it back.
interface ShortcutPlacement {
  snapshot: ShortcutItem;
  index: number;
}

// A line between two cards of the bookmark grid or bar, drawn on the grid.
interface GridInsertionTarget {
  kind: 'insertion';
  surface: 'grid';
  folderId: string;
  index: number;
  // The card the line sits by, or the grid when it is empty.
  element: HTMLElement;
  markerElement: HTMLElement;
  markerPosition: MarkerPosition;
  markerOffsetPx: number;
  markerTopPx: number;
  markerHeightPx: number;
  isPageStartBoundary?: boolean;
  // A drag from another page keeps the slot it leaves on this one.
  preservePageSlot?: boolean;
}

// A row of the open cascade menu, or the gap between two of its rows.
interface CascadeDropTarget {
  kind: 'insertion' | 'cascade';
  surface: 'cascade';
  folderId: string;
  title: string;
  index?: number;
  element: HTMLElement | null;
  markerElement: HTMLElement | null;
  markerPosition: MarkerPosition | '';
}

// A slot among the shortcuts for `record`; the tiles beside it lean apart.
interface ShortcutInsertionTarget {
  kind: 'insertion';
  surface: 'shortcuts';
  index: number;
  groupId: string;
  record: ShortcutItem | null;
  element: null;
  anchorElement: HTMLElement | null;
  markerElement: null;
  markerPosition: MarkerPosition;
}

// A folder to drop into: a folder card, a folder shortcut, or a step of
// the breadcrumb.
interface FolderDropTarget {
  kind: 'card' | 'shortcut-folder' | 'breadcrumb';
  surface?: 'folder';
  folderId: string;
  title: string;
  element: HTMLElement;
  markerElement?: null;
}

// A folder shortcut dropped back on the bookmark folder it shows, which
// only removes the shortcut.
interface ReturnDropTarget {
  kind: 'return';
  surface?: 'folder' | 'cascade';
  bookmarkId: string;
  folderId: string;
  title: string;
  element: HTMLElement | null;
  markerElement?: HTMLElement | null;
}

// The middle of another website tile, which the dragged website stacks
// onto to make a folder.
interface ShortcutStackTarget {
  kind: 'shortcut-stack';
  surface: 'shortcuts';
  shortcutId: string;
  element: HTMLElement;
  markerElement?: null;
}

// Over a surface that takes no drop here.
interface BlockedDropTarget {
  kind: 'blocked';
  surface: string;
  element?: undefined;
  markerElement?: undefined;
}

type DragDropTarget =
  | GridInsertionTarget
  | CascadeDropTarget
  | ShortcutInsertionTarget
  | FolderDropTarget
  | ReturnDropTarget
  | ShortcutStackTarget
  | BlockedDropTarget;

// A drop target that names a bookmark folder to drop into.
type BookmarkFolderDropTarget = Extract<DragDropTarget, { folderId: string }>;

function hasBookmarkFolder(target: DragDropTarget): target is BookmarkFolderDropTarget {
  return 'folderId' in target;
}

// What every drag over the bookmarks keeps, whichever surface it started on.
interface SurfaceDragState {
  isDragging: boolean;
  dropTarget: DragDropTarget | null;
  pendingPointerX: number;
  pendingPointerY: number;
  pageSwitchTimerId: number;
  pageSwitchDirection: number;
  pageSwitchButton: HTMLElement | null;
  folderSwitchTimerId: number;
  folderSwitchTargetId: string;
  folderSwitchElement: HTMLElement | null;
  // The folder a drag switched to, until the grid shows it.
  folderSwitchPendingId: string;
  // The bookmark being dragged, or the bookmark folder a dragged shortcut shows.
  bookmarkId?: string;
  shortcutId?: string;
  // The dragged bookmark card or shortcut tile.
  card?: HTMLElement | null;
  tile?: HTMLElement | null;
}

// Nearest-row insertion slot for a wrapping grid. `layoutItems` are
// [{ rect }] in DOM order; the returned index is a position in that list.
function getRowInsertionSlot(
  layoutItems: readonly { rect: LayoutRect }[] | null | undefined,
  pointerX: number,
  pointerY: number
): InsertionSlot {
  const items = layoutItems || [];
  if (!items.length || !Number.isFinite(pointerX) || !Number.isFinite(pointerY)) {
    return { index: 0, anchorIndex: -1, markerPosition: 'before' };
  }
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  items.forEach((item, itemIndex) => {
    const rect = item.rect;
    const verticalDistance = pointerY < rect.top
      ? rect.top - pointerY
      : pointerY > rect.bottom
        ? pointerY - rect.bottom
        : 0;
    if (verticalDistance < nearestDistance) {
      nearestDistance = verticalDistance;
      nearestIndex = itemIndex;
    }
  });
  const nearestRect = items[nearestIndex].rect;
  const rowIndexes = items
    .map((item, itemIndex) => itemIndex)
    .filter((itemIndex) => {
      const rect = items[itemIndex].rect;
      return Math.abs(rect.centerY - nearestRect.centerY) <=
        Math.max(8, Math.min(rect.height, nearestRect.height) / 2);
    })
    .sort((first, second) => items[first].rect.left - items[second].rect.left);
  const anchorIndex = rowIndexes.find((itemIndex) => pointerX < items[itemIndex].rect.centerX);
  if (anchorIndex !== undefined) {
    return { index: anchorIndex, anchorIndex, markerPosition: 'before' };
  }
  const lastRowIndex = rowIndexes[rowIndexes.length - 1];
  return { index: lastRowIndex + 1, anchorIndex: lastRowIndex, markerPosition: 'after' };
}

// The two items on either side of an insertion point, in DOM order.
// `isSameLine(item, anchor)` drops a neighbour that wrapped to another row.
function getInsertionGapNeighbors<T>(
  items: readonly T[] | null | undefined,
  anchor: T | null,
  markerPosition: string,
  isSameLine?: (item: T, anchor: T) => boolean
): { before: T | null; after: T | null } {
  const list = items || [];
  const index = anchor ? list.indexOf(anchor) : -1;
  if (index < 0 || anchor === null) {
    return { before: null, after: null };
  }
  const isAfter = markerPosition === 'after';
  const before: T | null = isAfter ? anchor : list[index - 1] || null;
  const after: T | null = isAfter ? list[index + 1] || null : anchor;
  const keep = (item: T | null): item is T => item !== null && Boolean(item) &&
    (item === anchor || typeof isSameLine !== 'function' || isSameLine(item, anchor));
  return {
    before: keep(before) ? before : null,
    after: keep(after) ? after : null
  };
}

const INSERTION_GAP_ATTRIBUTE = 'data-drag-gap';
const INSERTION_GAP_REST_MS = 240;
// The leaning pair each owner set last.
const insertionGapsByOwner = new WeakMap<object, Map<Element, InsertionGapSide>>();
// The timer that ends a released neighbour's slide back.
const insertionGapRestTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function releaseInsertionGapElement(element: Element): void {
  const side = element.getAttribute(INSERTION_GAP_ATTRIBUTE);
  if (!side || side === 'rest') {
    return;
  }
  // Keep the transition rule while the neighbour slides back.
  element.setAttribute(INSERTION_GAP_ATTRIBUTE, 'rest');
  insertionGapRestTimers.set(element, setTimeout(() => {
    insertionGapRestTimers.delete(element);
    if (element.getAttribute(INSERTION_GAP_ATTRIBUTE) === 'rest') {
      element.removeAttribute(INSERTION_GAP_ATTRIBUTE);
    }
  }, INSERTION_GAP_REST_MS));
}

// Leans the neighbours of an insertion point apart. `owner` remembers the
// leaning pair so the next call releases whichever is no longer adjacent.
function setInsertionGap(owner: object | null | undefined, before: Element | null, after: Element | null): void {
  if (!owner) {
    return;
  }
  const next = new Map<Element, InsertionGapSide>();
  if (before) next.set(before, 'before');
  if (after && after !== before) next.set(after, 'after');
  const previous = insertionGapsByOwner.get(owner) || new Map<Element, InsertionGapSide>();
  previous.forEach((_side, element) => {
    if (!next.has(element)) releaseInsertionGapElement(element);
  });
  next.forEach((side, element) => {
    const restTimer = insertionGapRestTimers.get(element);
    if (restTimer !== undefined) {
      clearTimeout(restTimer);
      insertionGapRestTimers.delete(element);
    }
    if (element.getAttribute(INSERTION_GAP_ATTRIBUTE) !== side) {
      element.setAttribute(INSERTION_GAP_ATTRIBUTE, side);
    }
  });
  insertionGapsByOwner.set(owner, next);
}

function isBookmarkFolderDropTarget(folderId: unknown, nodeMap: ReadonlyMap<string, BookmarkNode> | null | undefined): boolean {
  const id = String(folderId || '');
  const node = id && nodeMap ? nodeMap.get(id) : null;
  return Boolean(node && !node.url && id !== BOOKMARK_TREE_ROOT_ID);
}

// Inserts `record` at `index`, or moves the shortcut that already has its
// URL there instead of duplicating it. Returns null when the list is full.
function planBookmarkToShortcut(options: {
  shortcuts?: readonly (ShortcutItem | null | undefined)[];
  record?: ShortcutItem | null;
  // The local bookmark folder of a folder shortcut.
  getFolderId?: (item: ShortcutItem) => string;
  index: number;
  maxShortcuts: number;
  groupId?: string;
}): { shortcuts: ShortcutItem[]; shortcutId: string } | null {
  const config = options;
  const shortcuts: ShortcutItem[] = [];
  (config.shortcuts || []).forEach((item) => {
    if (item) shortcuts.push(item);
  });
  const record = config.record;
  const folderId = (item: ShortcutItem): string => {
    if (typeof config.getFolderId === 'function') return config.getFolderId(item);
    return isShortcutFolder(item) ? String(item.folderId || '') : '';
  };
  const index = Number(config.index);
  const hasTarget = record && (isShortcutFolder(record) ? Boolean(record.folderId || record.folderRef) : Boolean(record.url));
  if (!record || !hasTarget || !Number.isFinite(index)) {
    return null;
  }
  const existingIndex = shortcuts.findIndex((item) => isShortcutFolder(record)
    ? isShortcutFolder(item) && (item.id === record.id || (folderId(record) && folderId(item) === folderId(record)))
    : !isShortcutFolder(item) && item.url === record.url);
  if (existingIndex < 0 && shortcuts.length >= Number(config.maxShortcuts)) {
    return null;
  }
  const nextShortcuts = shortcuts.slice();
  const found = existingIndex < 0
    ? record
    : nextShortcuts.splice(existingIndex, 1)[0];
  // The shortcut joins the group of the tile it was dropped beside.
  const groupId = String(config.groupId || '');
  const shortcut: ShortcutItem = groupId && found.groupId !== groupId ? { ...found, groupId } : found;
  const insertionIndex = existingIndex >= 0 && index > existingIndex ? index - 1 : index;
  nextShortcuts.splice(Math.max(0, Math.min(nextShortcuts.length, insertionIndex)), 0, shortcut);
  return {
    shortcuts: nextShortcuts,
    shortcutId: String(shortcut.id || '')
  };
}

// Removes the shortcut a site left (`source`) and adds the one it became
// (`destination`); null when the shortcuts no longer match or are full.
function planTransferShortcuts(options: {
  shortcuts?: readonly ShortcutItem[];
  source?: { snapshot: ShortcutItem } | null;
  destination?: ShortcutPlacement | null;
  maxShortcuts: number;
}): ShortcutItem[] | null {
  const config = options;
  const next = config.shortcuts ? config.shortcuts.slice() : [];
  const source = config.source && config.source.snapshot;
  const destinationPlacement = config.destination || null;
  const destination = destinationPlacement && destinationPlacement.snapshot;
  if (source) {
    const index = next.findIndex((item) => item.id === source.id);
    const current = index >= 0 ? next[index] : null;
    if (!current || isShortcutFolder(current) !== isShortcutFolder(source) ||
        (!isShortcutFolder(source) && !isShortcutFolder(current) &&
          (current.url !== source.url || current.title !== source.title))) {
      return null;
    }
    next.splice(index, 1);
  }
  if (destinationPlacement && destination) {
    const duplicate = next.some((item) => item.id === destination.id ||
      (!isShortcutFolder(destination) && !isShortcutFolder(item) && item.url === destination.url) ||
      (isShortcutFolder(destination) && !destination.folderRef &&
        isShortcutFolder(item) && !item.folderRef && item.folderId === destination.folderId));
    if (duplicate || next.length >= Number(config.maxShortcuts)) {
      return null;
    }
    next.splice(Math.min(destinationPlacement.index, next.length), 0, destination);
  }
  return next;
}

// Stacking drops the website `sources` and puts the folder entry where the
// stack target was. Undo removes the entry and restores each source at its
// recorded index. Returns null when the shortcuts no longer match.
function planShortcutStack(options: {
  shortcuts?: readonly (ShortcutItem | null | undefined)[];
  sources?: readonly ShortcutPlacement[];
  folder?: { snapshot: ShortcutItem; index?: number; groupId?: string } | null;
  undo?: boolean;
  maxShortcuts: number;
}): ShortcutItem[] | null {
  const config = options;
  const shortcuts: ShortcutItem[] = [];
  (config.shortcuts || []).forEach((item) => {
    if (item) shortcuts.push(item);
  });
  const sources = config.sources || [];
  const folderPlacement = config.folder || null;
  const folder = folderPlacement && folderPlacement.snapshot;
  if (sources.length < 2 || !folderPlacement || !folder || !folder.id) {
    return null;
  }
  const folderIndex = shortcuts.findIndex((item) => item.id === folder.id);
  if (config.undo) {
    if (folderIndex < 0 || !isShortcutFolder(shortcuts[folderIndex])) {
      return null;
    }
    const next = shortcuts.slice();
    next.splice(folderIndex, 1);
    const conflict = sources.some(({ snapshot }) => next.some((item) => item.id === snapshot.id ||
      (!isShortcutFolder(item) && !isShortcutFolder(snapshot) && item.url === snapshot.url)));
    if (conflict || next.length + sources.length > Number(config.maxShortcuts)) {
      return null;
    }
    sources.slice().sort((first, second) => first.index - second.index).forEach((entry) => {
      next.splice(Math.min(entry.index, next.length), 0, entry.snapshot);
    });
    return next;
  }
  const ids = new Set(sources.map(({ snapshot }) => snapshot.id));
  const available = sources.every(({ snapshot }) => shortcuts.some((item) => item.id === snapshot.id &&
    !isShortcutFolder(item) && !isShortcutFolder(snapshot) && item.url === snapshot.url));
  if (folderIndex >= 0 || ids.size !== sources.length || !available) {
    return null;
  }
  const next = shortcuts.filter((item) => !ids.has(item.id));
  // The folder takes the group of the site it was stacked onto.
  const groupId = String(folderPlacement.groupId || '');
  next.splice(Math.max(0, Math.min(Number(folderPlacement.index) || 0, next.length)), 0,
    groupId ? { ...folder, groupId } : folder);
  return next;
}

// Puts the recorded entries back in `order`, each into its group in
// `groups`; null when `sourceOrder` no longer matches.
function planShortcutReorder(options: {
  shortcuts?: readonly ShortcutItem[];
  order?: readonly string[];
  sourceOrder?: readonly string[] | null;
  // An entry with no recorded group keeps its current one.
  groups?: readonly (string | undefined)[] | null;
}): ShortcutItem[] | null {
  const config = options;
  const shortcuts = config.shortcuts || [];
  const order = config.order || [];
  const ids = new Set(order);
  const byId = new Map(shortcuts.map((item): [string, ShortcutItem] => [item.id, item]));
  if (!order.length || ids.size !== order.length || order.some((id) => !byId.has(id))) {
    return null;
  }
  const currentOrder = shortcuts.filter((item) => ids.has(item.id)).map((item) => item.id);
  const sourceOrder = config.sourceOrder;
  if (sourceOrder && (sourceOrder.length !== currentOrder.length ||
      currentOrder.some((id, index) => id !== sourceOrder[index]))) {
    return null;
  }
  // A recorded group for each entry in `order` moves it back into that group.
  const groups = config.groups && config.groups.length === order.length ? config.groups : null;
  let index = 0;
  // Reorder the recorded entries in their current slots, preserving newer
  // shortcuts and the latest titles, icons and folder bindings.
  return shortcuts.map((item) => {
    if (!ids.has(item.id)) return item;
    const groupId = groups ? String(groups[index] || '') : '';
    const entry = byId.get(order[index++]) || item;
    return groupId && entry.groupId !== groupId ? { ...entry, groupId } : entry;
  });
}

// Drag reorders slide tiles and cards with inline transitions; with
// reduced motion asked for, they move straight to where they land.
function prefersReducedMotion(windowObj?: { matchMedia?(query: string): { matches: boolean } } | null): boolean {
  const win = windowObj || (typeof window !== 'undefined' ? window : null);
  return Boolean(win && typeof win.matchMedia === 'function' &&
    win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export {
  prefersReducedMotion,
  getInsertionGapNeighbors,
  getRowInsertionSlot,
  hasBookmarkFolder,
  isBookmarkFolderDropTarget,
  setInsertionGap,
  planBookmarkToShortcut,
  planTransferShortcuts,
  planShortcutStack,
  planShortcutReorder
};
export type {
  BlockedDropTarget,
  BookmarkFolderDropTarget,
  CascadeDropTarget,
  DragDropTarget,
  FolderDropTarget,
  GridInsertionTarget,
  InsertionSlot,
  LayoutRect,
  MarkerPosition,
  ReturnDropTarget,
  ShortcutInsertionTarget,
  ShortcutPlacement,
  ShortcutStackTarget,
  SurfaceDragState
};
