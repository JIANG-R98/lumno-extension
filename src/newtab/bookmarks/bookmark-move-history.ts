// The undo and redo history of bookmark and shortcut changes: moves,
// deletes, transfers between bookmarks and shortcuts, stacking shortcuts
// into a folder, reordering and deleting shortcut groups.
import { isPortableFolder, isShortcutFolder } from '../../domain/shortcuts-store';
import type { ShortcutItem } from '../../domain/shortcuts-store';
import type { FolderItemIcon } from './folder-item-icons';
import type { BookmarkNode } from './bookmarks-store';

interface BookmarkLocation {
  parentId: string;
  index: number;
}

type LocationInput = { parentId?: unknown; index?: unknown } | null | undefined;

// A bookmark or folder as it was, enough to create it again.
interface SnapshotNode {
  title: string;
  url: string;
  children: readonly SnapshotNode[];
}

type SnapshotInput = { title?: unknown; url?: unknown; children?: readonly SnapshotInput[] | null } | null | undefined;

type BookmarkNodeMap = ReadonlyMap<string, BookmarkNode>;

interface MoveRecord {
  // Move records are made without a kind.
  kind?: 'move';
  bookmarkId: string;
  title: string;
  from: Readonly<BookmarkLocation>;
  to: Readonly<BookmarkLocation>;
}

interface DeleteRecord {
  kind: 'delete';
  bookmarkId: string;
  title: string;
  parentId: string;
  index: number;
  snapshot: SnapshotNode;
  // The id the bookmark has after undo created it again.
  runtime: { currentBookmarkId: string };
}

interface ShortcutDeleteRecord {
  kind: 'shortcut-delete';
  snapshot: ShortcutItem;
  index: number;
  iconDataUrl: string;
}

interface ShortcutAddRecord {
  kind: 'shortcut-add';
  snapshot: ShortcutItem;
  index: number;
  iconDataUrl: string;
}

interface TransferRecord {
  kind: 'transfer';
  bookmarkId: string;
  snapshot: SnapshotNode;
  from: Readonly<BookmarkLocation> | null;
  to: Readonly<BookmarkLocation> | null;
  beforeShortcut: ShortcutDeleteRecord | null;
  afterShortcut: ShortcutDeleteRecord | null;
  itemIcon: Readonly<FolderItemIcon> | null;
  // The bookmark's id and place once the transfer last created or moved it.
  runtime: { currentBookmarkId: string; location?: BookmarkLocation | null };
}

interface ShortcutStackRecord {
  kind: 'shortcut-stack';
  bookmarkId: string;
  snapshot: SnapshotNode;
  sources: readonly ShortcutDeleteRecord[];
  folderShortcut: Readonly<{ id: string; index: number; groupId: string }>;
  itemIcons: readonly (Readonly<FolderItemIcon> | null)[];
  runtime: { currentBookmarkId: string; location: BookmarkLocation | null; title: string };
}

interface ShortcutReorderRecord {
  kind: 'shortcut-reorder';
  fromOrder: readonly string[];
  toOrder: readonly string[];
  fromGroups?: readonly string[];
  toGroups?: readonly string[];
}

interface ShortcutGroupDeleteRecord {
  kind: 'shortcut-group-delete';
  group: Readonly<{ id: string; title: string }>;
  groupIndex: number;
  targetGroupId: string;
  movedIds: readonly string[];
  removed: readonly ShortcutDeleteRecord[];
}

type HistoryRecord =
  | MoveRecord
  | DeleteRecord
  | ShortcutDeleteRecord
  | ShortcutAddRecord
  | TransferRecord
  | ShortcutStackRecord
  | ShortcutReorderRecord
  | ShortcutGroupDeleteRecord;

interface ShortcutDeleteInput {
  snapshot?: ShortcutItem | null;
  index?: unknown;
  iconDataUrl?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeLocation(location: LocationInput): BookmarkLocation | null {
  if (!location || !location.parentId) {
    return null;
  }
  return {
    parentId: String(location.parentId),
    index: Math.max(0, Math.round(Number(location.index) || 0))
  };
}

function isFolderInsideBookmark(nodeMap: BookmarkNodeMap | null | undefined, bookmarkId: unknown, targetFolderId: unknown): boolean {
  if (!(nodeMap instanceof Map)) {
    return false;
  }
  const sourceId = String(bookmarkId || '');
  let cursorId = String(targetFolderId || '');
  let guard = 0;
  while (cursorId && guard < 128) {
    if (cursorId === sourceId) {
      return true;
    }
    const node = nodeMap.get(cursorId);
    cursorId = node && node.parentId ? String(node.parentId) : '';
    guard += 1;
  }
  return false;
}

function canMoveBookmarkToFolder(options: {
  bookmarkId?: unknown;
  sourceParentId?: unknown;
  targetFolderId?: unknown;
  nodeMap?: BookmarkNodeMap | null;
}): boolean {
  const config = options || {};
  const bookmarkId = String(config.bookmarkId || '');
  const sourceParentId = String(config.sourceParentId || '');
  const targetFolderId = String(config.targetFolderId || '');
  if (!bookmarkId || !sourceParentId || !targetFolderId) {
    return false;
  }
  if (bookmarkId === targetFolderId || sourceParentId === targetFolderId) {
    return false;
  }
  return !isFolderInsideBookmark(config.nodeMap, bookmarkId, targetFolderId);
}

interface MoveIndexInput {
  sourceParentId?: unknown;
  targetParentId?: unknown;
  sourceIndex?: unknown;
  targetIndex?: unknown;
}

function normalizeMoveDestinationIndex(options: MoveIndexInput): number {
  const config = options || {};
  const sourceParentId = String(config.sourceParentId || '');
  const targetParentId = String(config.targetParentId || '');
  const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
  let targetIndex = Math.max(0, Math.round(Number(config.targetIndex) || 0));
  if (sourceParentId && sourceParentId === targetParentId && sourceIndex < targetIndex) {
    targetIndex -= 1;
  }
  return targetIndex;
}

function getMoveApiDestinationIndex(options: MoveIndexInput): number {
  const config = options || {};
  const sourceParentId = String(config.sourceParentId || '');
  const targetParentId = String(config.targetParentId || '');
  const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
  let targetIndex = Math.max(0, Math.round(Number(config.targetIndex) || 0));
  if (sourceParentId && sourceParentId === targetParentId && sourceIndex < targetIndex) {
    targetIndex += 1;
  }
  return targetIndex;
}

function canMoveBookmarkToLocation(options: MoveIndexInput & {
  bookmarkId?: unknown;
  nodeMap?: BookmarkNodeMap | null;
}): boolean {
  const config = options || {};
  const bookmarkId = String(config.bookmarkId || '');
  const sourceParentId = String(config.sourceParentId || '');
  const targetParentId = String(config.targetParentId || '');
  const sourceIndex = Math.max(0, Math.round(Number(config.sourceIndex) || 0));
  if (!bookmarkId || !sourceParentId || !targetParentId ||
      bookmarkId === targetParentId ||
      isFolderInsideBookmark(config.nodeMap, bookmarkId, targetParentId)) {
    return false;
  }
  const destinationIndex = normalizeMoveDestinationIndex({
    sourceParentId,
    sourceIndex,
    targetParentId,
    targetIndex: config.targetIndex
  });
  return sourceParentId !== targetParentId || destinationIndex !== sourceIndex;
}

function createMoveRecord(options: {
  bookmarkId?: unknown;
  title?: unknown;
  from?: LocationInput;
  to?: LocationInput;
} | null | undefined): Readonly<MoveRecord> | null {
  const config = options || {};
  const bookmarkId = String(config.bookmarkId || '');
  const from = normalizeLocation(config.from);
  const to = normalizeLocation(config.to);
  if (!bookmarkId || !from || !to) {
    return null;
  }
  return Object.freeze({
    bookmarkId,
    title: String(config.title || ''),
    from: Object.freeze(from),
    to: Object.freeze(to)
  });
}

function cloneBookmarkSnapshot(node: SnapshotInput): SnapshotNode | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  const title = String(node.title || '');
  const url = node.url ? String(node.url) : '';
  const children: SnapshotNode[] = [];
  (Array.isArray(node.children) ? node.children : []).forEach((child) => {
    const cloned = cloneBookmarkSnapshot(child);
    if (cloned) children.push(cloned);
  });
  return Object.freeze({
    title,
    url,
    children: Object.freeze(children)
  });
}

function createDeleteRecord(options: {
  bookmarkId?: unknown;
  parentId?: unknown;
  index?: unknown;
  title?: unknown;
  snapshot?: SnapshotInput;
} | null | undefined): Readonly<DeleteRecord> | null {
  const config = options || {};
  const bookmarkId = String(config.bookmarkId || '');
  const parentId = String(config.parentId || '');
  const index = Math.max(0, Math.round(Number(config.index) || 0));
  const snapshot = cloneBookmarkSnapshot(config.snapshot);
  if (!bookmarkId || !parentId || !snapshot) {
    return null;
  }
  return Object.freeze({
    kind: 'delete',
    bookmarkId,
    title: String(config.title || snapshot.title || ''),
    parentId,
    index,
    snapshot,
    runtime: {
      currentBookmarkId: ''
    }
  });
}

function normalizeHistoryRecord(record: HistoryRecord | null | undefined): HistoryRecord | null {
  if (!record) {
    return null;
  }
  if (record.kind === 'shortcut-reorder') {
    return createShortcutReorderRecord(record);
  }
  if (record.kind === 'transfer') {
    return createTransferRecord(record);
  }
  if (record.kind === 'shortcut-delete') {
    return createShortcutDeleteRecord(record);
  }
  if (record.kind === 'shortcut-add') {
    return createShortcutAddRecord(record);
  }
  if (record.kind === 'shortcut-group-delete') {
    return createShortcutGroupDeleteRecord(record);
  }
  if (record.kind === 'shortcut-stack') {
    return createShortcutStackRecord(record);
  }
  if (record.kind === 'delete') {
    return createDeleteRecord(record);
  }
  return createMoveRecord(record);
}

// A link with its URL, or a folder with its bookmark folder.
function hasShortcutTarget(item: ShortcutItem): boolean {
  return isShortcutFolder(item) ? Boolean(item.folderId || item.folderRef) : Boolean(item.url);
}

// A copy of the shortcut that later edits to the original cannot change.
function cloneShortcutSnapshot(item: ShortcutItem): ShortcutItem {
  if (isShortcutFolder(item) && isPortableFolder(item)) {
    return { ...item, folderRef: { ...item.folderRef, path: item.folderRef.path.slice() } };
  }
  return { ...item };
}

function createShortcutDeleteRecord(options: ShortcutDeleteInput | null | undefined): Readonly<ShortcutDeleteRecord> | null {
  const config = options || {};
  const snapshot = config.snapshot;
  if (!snapshot || !snapshot.id || !hasShortcutTarget(snapshot)) {
    return null;
  }
  return Object.freeze({
    kind: 'shortcut-delete',
    snapshot: Object.freeze(cloneShortcutSnapshot(snapshot)),
    index: Math.max(0, Math.round(Number(config.index) || 0)),
    iconDataUrl: String(config.iconDataUrl || '')
  });
}

// Adding a site as a shortcut, e.g. by dragging a recent-site card onto
// the shortcuts; undo removes it again.
function createShortcutAddRecord(options: ShortcutDeleteInput | null | undefined): Readonly<ShortcutAddRecord> | null {
  const record = createShortcutDeleteRecord(options);
  return record && Object.freeze({ ...record, kind: 'shortcut-add' });
}

// Moves a site between a bookmark and a shortcut. Without either shortcut
// it only creates (`to`) or removes (`from`) a website bookmark, as when a
// recent-site card is dropped onto the bookmarks.
function createTransferRecord(options: {
  bookmarkId?: unknown;
  snapshot?: SnapshotInput;
  from?: LocationInput;
  to?: LocationInput;
  beforeShortcut?: ShortcutDeleteInput | null;
  afterShortcut?: ShortcutDeleteInput | null;
  itemIcon?: FolderItemIcon | null;
  runtime?: { currentBookmarkId?: unknown } | null;
} | null | undefined): Readonly<TransferRecord> | null {
  const config = options || {};
  const from = normalizeLocation(config.from);
  const to = normalizeLocation(config.to);
  const snapshot = cloneBookmarkSnapshot(config.snapshot);
  const beforeShortcut = config.beforeShortcut && createShortcutDeleteRecord(config.beforeShortcut);
  const afterShortcut = config.afterShortcut && createShortcutDeleteRecord(config.afterShortcut);
  const bookmarkOnly = !beforeShortcut && !afterShortcut;
  if ((!from && !to) || !snapshot || (bookmarkOnly && (!snapshot.url || (from && to))) ||
      (!snapshot.url && (!from || !to || !config.bookmarkId))) {
    return null;
  }
  return Object.freeze({
    kind: 'transfer',
    bookmarkId: String(config.bookmarkId || ''),
    snapshot,
    from: from && Object.freeze(from),
    to: to && Object.freeze(to),
    beforeShortcut: beforeShortcut || null,
    afterShortcut: afterShortcut || null,
    // The icon the site shows as a bookmark inside a shortcut folder, put
    // back whenever the transfer creates that bookmark.
    itemIcon: config.itemIcon && isRecord(config.itemIcon) &&
      (config.itemIcon.iconSource || config.itemIcon.shortcut)
      ? Object.freeze({ ...config.itemIcon })
      : null,
    runtime: {
      currentBookmarkId: String(config.runtime && config.runtime.currentBookmarkId || config.bookmarkId || '')
    }
  });
}

// Stacking two website shortcuts creates a bookmark folder holding both
// sites. `runtime` follows the folder through undo and redo: its current id,
// and the location and name it had when last removed.
function createShortcutStackRecord(options: {
  bookmarkId?: unknown;
  snapshot?: SnapshotInput;
  sources?: readonly (ShortcutDeleteInput | null | undefined)[];
  folderShortcut?: { id?: unknown; index?: unknown; groupId?: unknown } | null;
  itemIcons?: readonly (FolderItemIcon | null | undefined)[];
  runtime?: { currentBookmarkId?: unknown; location?: LocationInput; title?: unknown } | null;
} | null | undefined): Readonly<ShortcutStackRecord> | null {
  const config = options || {};
  const snapshot = cloneBookmarkSnapshot(config.snapshot);
  const sources: ShortcutDeleteRecord[] = [];
  const sourceInputs = Array.isArray(config.sources) ? config.sources : [];
  sourceInputs.forEach((source) => {
    const record = source ? createShortcutDeleteRecord(source) : null;
    if (record && record.snapshot.type !== 'folder') sources.push(record);
  });
  const folderShortcut = config.folderShortcut || {};
  const folderShortcutId = String(folderShortcut.id || '');
  if (!snapshot || snapshot.url || !snapshot.children.length || snapshot.children.some((child) => !child.url) ||
      sourceInputs.length !== 2 || sources.length !== 2 || !folderShortcutId) {
    return null;
  }
  const runtime = config.runtime || {};
  return Object.freeze({
    kind: 'shortcut-stack',
    bookmarkId: String(config.bookmarkId || runtime.currentBookmarkId || ''),
    snapshot,
    sources: Object.freeze(sources),
    folderShortcut: Object.freeze({
      id: folderShortcutId,
      index: Math.max(0, Math.round(Number(folderShortcut.index) || 0)),
      groupId: String(folderShortcut.groupId || '')
    }),
    // The icon each stacked site keeps inside the folder, in child order.
    itemIcons: Object.freeze(snapshot.children.map((_child, index) => {
      const icon = Array.isArray(config.itemIcons) ? config.itemIcons[index] : null;
      return icon && isRecord(icon) ? Object.freeze({ ...icon }) : null;
    })),
    runtime: {
      currentBookmarkId: String(runtime.currentBookmarkId || config.bookmarkId || ''),
      location: normalizeLocation(runtime.location),
      title: String(runtime.title || snapshot.title)
    }
  });
}

// Undo removes a stacked folder only while it still holds exactly the
// stacked sites, so it never deletes bookmarks added to the folder later.
function isShortcutStackFolderIntact(node: BookmarkNode | null | undefined, snapshot: SnapshotNode | null | undefined): boolean {
  const children = node && !node.url && Array.isArray(node.children) ? node.children : null;
  const expected = snapshot && Array.isArray(snapshot.children) ? snapshot.children : [];
  if (!children || children.length !== expected.length || children.some((child) => !child.url)) {
    return false;
  }
  const urls = (items: readonly { url?: string }[]): string[] => items.map((item) => String(item.url)).sort();
  const actual = urls(children);
  return urls(expected).every((url, index) => url === actual[index]);
}

// `fromGroups` and `toGroups` name each entry's group, in the same order as
// `fromOrder` and `toOrder`; a move into another group can keep the order.
function createShortcutReorderRecord(options: {
  fromOrder?: readonly unknown[];
  toOrder?: readonly unknown[];
  fromGroups?: readonly unknown[] | null;
  toGroups?: readonly unknown[] | null;
} | null | undefined): Readonly<ShortcutReorderRecord> | null {
  const config = options || {};
  const fromOrder = Array.isArray(config.fromOrder) ? config.fromOrder.map(String) : [];
  const toOrder = Array.isArray(config.toOrder) ? config.toOrder.map(String) : [];
  const fromIds = new Set(fromOrder);
  const readGroups = (groups: readonly unknown[] | null | undefined): string[] | null => (
    Array.isArray(groups) && groups.length === fromOrder.length
      ? groups.map((groupId) => String(groupId || '')) : null);
  const fromGroups = readGroups(config.fromGroups);
  const toGroups = readGroups(config.toGroups);
  const groupOf = (order: string[], groups: string[] | null): Map<string, string> => (
    new Map(groups ? order.map((id, index): [string, string] => [id, groups[index]]) : []));
  const fromGroupById = groupOf(fromOrder, fromGroups);
  const toGroupById = groupOf(toOrder, toGroups);
  const regrouped = Boolean(fromGroups && toGroups) &&
    fromOrder.some((id) => fromGroupById.get(id) !== toGroupById.get(id));
  if (fromOrder.length < 1 || (fromOrder.length < 2 && !regrouped) || fromOrder.length !== toOrder.length ||
      fromIds.size !== fromOrder.length || new Set(toOrder).size !== toOrder.length ||
      fromOrder.some((id) => !id) || toOrder.some((id) => !fromIds.has(id)) ||
      (fromOrder.every((id, index) => id === toOrder[index]) && !regrouped)) {
    return null;
  }
  return Object.freeze({
    kind: 'shortcut-reorder',
    fromOrder: Object.freeze(fromOrder),
    toOrder: Object.freeze(toOrder),
    ...(fromGroups && toGroups
      ? { fromGroups: Object.freeze(fromGroups), toGroups: Object.freeze(toGroups) }
      : {})
  });
}

// Deleting a shortcut group either moves its sites into another group
// (`movedIds`, `targetGroupId`) or removes them with the group (`removed`).
function createShortcutGroupDeleteRecord(options: {
  group?: { id?: unknown; title?: unknown } | null;
  groupIndex?: unknown;
  targetGroupId?: unknown;
  movedIds?: readonly unknown[];
  removed?: readonly (ShortcutDeleteInput | null | undefined)[];
} | null | undefined): Readonly<ShortcutGroupDeleteRecord> | null {
  const config = options || {};
  const group = config.group && typeof config.group === 'object' ? config.group : null;
  const groupId = String(group && group.id || '');
  if (!group || !groupId) {
    return null;
  }
  const removedInputs = Array.isArray(config.removed) ? config.removed : [];
  const removed: ShortcutDeleteRecord[] = [];
  removedInputs.forEach((entry) => {
    const record = entry ? createShortcutDeleteRecord(entry) : null;
    if (record) removed.push(record);
  });
  if (removed.length !== removedInputs.length) {
    return null;
  }
  return Object.freeze({
    kind: 'shortcut-group-delete',
    group: Object.freeze({ id: groupId, title: String(group.title || '') }),
    groupIndex: Math.max(0, Math.round(Number(config.groupIndex) || 0)),
    targetGroupId: String(config.targetGroupId || ''),
    movedIds: Object.freeze((Array.isArray(config.movedIds) ? config.movedIds : []).map(String).filter(Boolean)),
    removed: Object.freeze(removed)
  });
}

function createBookmarkMoveHistory(options?: { maxEntries?: number }) {
  const config = options || {};
  const maxEntries = Math.max(1, Math.round(Number(config.maxEntries) || 30));
  const undoStack: HistoryRecord[] = [];
  const redoStack: HistoryRecord[] = [];
  // Bookmark ids the history recorded, mapped to the ids the bookmarks
  // have since undo or redo created them again.
  const bookmarkIds = new Map<string, string>();

  // The id the bookmark has now.
  function resolveBookmarkId(bookmarkId: unknown): string {
    let id = String(bookmarkId || '');
    const seen = new Set();
    let next = bookmarkIds.get(id);
    while (next !== undefined && !seen.has(id)) {
      seen.add(id);
      id = next;
      next = bookmarkIds.get(id);
    }
    return id;
  }

  function remapBookmarkId(previousId: unknown, nextId: unknown): void {
    const resolvedId = resolveBookmarkId(previousId);
    const id = String(nextId || '');
    if (resolvedId && id && resolvedId !== id) {
      for (const key of bookmarkIds.keys()) {
        if (resolveBookmarkId(key) === resolvedId) bookmarkIds.set(key, id);
      }
      bookmarkIds.set(String(previousId), id);
    }
  }

  function push(record: HistoryRecord | null | undefined): boolean {
    const normalized = normalizeHistoryRecord(record);
    if (!normalized) {
      return false;
    }
    undoStack.push(normalized);
    if (undoStack.length > maxEntries) {
      undoStack.splice(0, undoStack.length - maxEntries);
    }
    redoStack.length = 0;
    // Retain mappings only for the bounded history, rather than accumulating
    // an id for every bookmark recreated by repeated undo/redo cycles.
    const retainedIds = new Set(undoStack.map((item) => ('bookmarkId' in item ? item.bookmarkId : '')).filter(Boolean));
    const retainedMappings = [...bookmarkIds.keys()]
      .filter((id) => retainedIds.has(id))
      .map((id): [string, string] => [id, resolveBookmarkId(id)]);
    bookmarkIds.clear();
    retainedMappings.forEach(([id, currentId]) => bookmarkIds.set(id, currentId));
    return true;
  }

  function peekUndo(): HistoryRecord | null {
    return undoStack[undoStack.length - 1] || null;
  }

  function peekRedo(): HistoryRecord | null {
    return redoStack[redoStack.length - 1] || null;
  }

  function commitUndo(): HistoryRecord | null {
    const record = undoStack.pop() || null;
    if (record) {
      redoStack.push(record);
    }
    return record;
  }

  function commitRedo(): HistoryRecord | null {
    const record = redoStack.pop() || null;
    if (record) {
      undoStack.push(record);
    }
    return record;
  }

  function clear(): void {
    undoStack.length = 0;
    redoStack.length = 0;
    bookmarkIds.clear();
  }

  return Object.freeze({
    push,
    peekUndo,
    peekRedo,
    commitUndo,
    commitRedo,
    resolveBookmarkId,
    remapBookmarkId,
    clear,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0
  });
}

export {
  canMoveBookmarkToLocation,
  canMoveBookmarkToFolder,
  cloneBookmarkSnapshot,
  createDeleteRecord,
  createShortcutDeleteRecord,
  createShortcutAddRecord,
  createShortcutStackRecord,
  createTransferRecord,
  createShortcutReorderRecord,
  createShortcutGroupDeleteRecord,
  createBookmarkMoveHistory,
  createMoveRecord,
  getMoveApiDestinationIndex,
  isFolderInsideBookmark,
  isShortcutStackFolderIntact,
  normalizeMoveDestinationIndex,
  normalizeLocation
};
type BookmarkMoveHistory = ReturnType<typeof createBookmarkMoveHistory>;

export type {
  BookmarkLocation,
  BookmarkMoveHistory,
  DeleteRecord,
  HistoryRecord,
  MoveRecord,
  ShortcutAddRecord,
  ShortcutDeleteRecord,
  ShortcutGroupDeleteRecord,
  ShortcutReorderRecord,
  ShortcutStackRecord,
  SnapshotNode,
  TransferRecord
};
