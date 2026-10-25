// Portable references to bookmark folders: a shortcut folder synced to
// another device names its bookmark folder by root, path and contents
// instead of by the browser's local bookmark ID.

// The bookmark roots a reference can start from.
type BookmarkRootType = 'bookmarks-bar' | 'other' | 'mobile' | 'managed';

// Whether the folder lives in the browser account (synced), on this device
// only, or the browser does not say.
type FolderReferenceScope = 'account' | 'local' | 'unknown';

interface FolderReference {
  version: 1;
  root: BookmarkRootType;
  scope: FolderReferenceScope;
  // Folder titles from below the root down to the folder.
  path: string[];
  // hashText of the folder's direct children.
  fingerprint: string;
}

// A node of chrome.bookmarks.getTree().
interface BookmarkNode {
  id: string;
  parentId?: string;
  title?: string;
  url?: string;
  children?: BookmarkNode[];
  folderType?: string;
  syncing?: boolean;
}

type BookmarkNodeMap = Map<string, BookmarkNode>;

// Which local bookmark folder a shortcut entry is bound to on this device.
interface FolderBinding {
  folderId: string;
}

type FolderBindings = Record<string, FolderBinding>;

// What the reference helpers read from a shortcut entry.
interface FolderShortcutLike {
  id: string;
  type?: string;
  title?: string;
  // The local bookmark ID, on this device only.
  folderId?: string;
  folderRef?: unknown;
}

// A folder entry with its local ID replaced by a portable reference.
type PortableFolderShortcut<T extends FolderShortcutLike> = Omit<T, 'folderId'> & {
  folderRef: FolderReference;
  title: string;
};

const BINDINGS_KEY = '_x_extension_shortcut_folder_bindings_2026_unique_';
const ROOT_TYPES: ReadonlySet<string> = new Set<BookmarkRootType>(['bookmarks-bar', 'other', 'mobile', 'managed']);
const SCOPES: ReadonlySet<string> = new Set<FolderReferenceScope>(['account', 'local', 'unknown']);
// Chrome numbers its roots; Firefox uses fixed 12-character GUIDs. Mapping
// both onto one root type keeps bookmark data portable between the browsers.
const TREE_ROOT_IDS: ReadonlySet<string> = new Set(['0', 'root________']);
const ROOT_TYPES_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '1': 'bookmarks-bar', '2': 'other', '3': 'mobile',
  'toolbar_____': 'bookmarks-bar', 'unfiled_____': 'other', 'mobile______': 'mobile', 'menu________': 'menu'
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isRootType(value: unknown): value is BookmarkRootType {
  return typeof value === 'string' && ROOT_TYPES.has(value);
}

function isScope(value: unknown): value is FolderReferenceScope {
  return typeof value === 'string' && SCOPES.has(value);
}

function isTreeRootId(id: string | number | undefined): boolean {
  return TREE_ROOT_IDS.has(String(id));
}

function getTreeRoot(nodeMap: ReadonlyMap<string, BookmarkNode>): BookmarkNode | undefined {
  return nodeMap.get('0') || nodeMap.get('root________');
}

function getBookmarkRootType(node: BookmarkNode | null | undefined): string {
  return (node && (node.folderType || ROOT_TYPES_BY_ID[String(node.id)])) || '';
}

// Firefox's bookmarks menu has no Chrome counterpart. References sync through
// WebDAV, and older clients reject a whole state that holds a root type they
// do not know, so it is stored as "other".
function getRootType(node: BookmarkNode): string {
  const type = getBookmarkRootType(node);
  return type === 'menu' ? 'other' : type;
}

function normalizeReference(value: unknown): FolderReference | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const { root, scope, path, fingerprint: hash } = value;
  if (!isRootType(root) || !isScope(scope) || !Array.isArray(path) || path.length > 64) return null;
  const parts: string[] = [];
  for (const part of path) {
    if (typeof part !== 'string' || part.length > 1024) return null;
    parts.push(part);
  }
  if (typeof hash !== 'string' || !/^[a-f0-9]{16}$/.test(hash)) return null;
  return { version: 1, root, scope, path: parts, fingerprint: hash };
}

// Two 32-bit FNV-style lanes, hex encoded. Stored hashes depend on it.
function hashText(text: string): string {
  let first = 2166136261;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  return [first, second].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

function fingerprint(node: BookmarkNode): string {
  return hashText(JSON.stringify((node.children || []).map((child) =>
    JSON.stringify([child.url ? 'url' : 'folder', String(child.title || ''), String(child.url || '')])).sort()));
}

function buildNodeMap(nodes: readonly BookmarkNode[] | null | undefined): BookmarkNodeMap {
  const map: BookmarkNodeMap = new Map();
  function visit(node: BookmarkNode | null | undefined): void {
    if (!node || !node.id) return;
    map.set(String(node.id), node);
    (node.children || []).forEach(visit);
  }
  (nodes || []).forEach(visit);
  return map;
}

function describe(folderId: string | number | null | undefined, nodeMap: ReadonlyMap<string, BookmarkNode>): FolderReference | null {
  let node = nodeMap.get(String(folderId || ''));
  if (!node || node.url || isTreeRootId(node.id)) return null;
  const target = node;
  const path: string[] = [];
  const visited = new Set<string>();
  while (node && !isTreeRootId(node.parentId)) {
    if (visited.has(node.id) || path.length >= 64) return null;
    visited.add(node.id);
    path.unshift(String(node.title || ''));
    node = nodeMap.get(String(node.parentId));
  }
  if (!node) return null;
  return normalizeReference({ version: 1, root: getRootType(node),
    scope: typeof node.syncing === 'boolean' ? (node.syncing ? 'account' : 'local') : 'unknown',
    path, fingerprint: fingerprint(target) });
}

function resolveReference(reference: unknown, nodeMap: ReadonlyMap<string, BookmarkNode>): BookmarkNode | null {
  const ref = normalizeReference(reference);
  // A local-only directory is usable through its originating device's binding.
  if (!ref || ref.scope === 'local') return null;
  const rootNode = getTreeRoot(nodeMap);
  const rootNodes = rootNode && Array.isArray(rootNode.children) ? rootNode.children : [...nodeMap.values()];
  const roots = rootNodes.filter((node) => isTreeRootId(node.parentId) &&
    getRootType(node) === ref.root &&
    (ref.scope === 'unknown' || typeof node.syncing !== 'boolean' || node.syncing === true));
  let candidates = roots;
  for (const part of ref.path) {
    candidates = candidates.flatMap((node) => (node.children || []).filter((child) => !child.url && child.title === part));
  }
  candidates = candidates.filter((node) => fingerprint(node) === ref.fingerprint);
  return candidates.length === 1 ? candidates[0] : null;
}

function createEntryId(): string {
  return `shortcut-folder-${globalThis.crypto.randomUUID()}`;
}

// Keeps the newest 512 well-formed bindings.
function normalizeBindings(value: unknown): FolderBindings {
  const kept: Array<[string, FolderBinding]> = [];
  for (const [id, binding] of Object.entries(isRecord(value) ? value : {}).slice(-512)) {
    if (!id || id.length > 180 || !isRecord(binding)) continue;
    const folderId = binding.folderId;
    if (typeof folderId !== 'string' || !folderId || isTreeRootId(folderId) || folderId.length > 128) continue;
    kept.push([id, { folderId }]);
  }
  return Object.fromEntries(kept);
}

export {
  BINDINGS_KEY,
  normalizeReference,
  normalizeBindings,
  describe,
  resolveReference,
  isTreeRootId,
  getTreeRoot,
  getBookmarkRootType,
  hashText,
  buildNodeMap,
  createEntryId
};
export type {
  BookmarkNode,
  BookmarkNodeMap,
  BookmarkRootType,
  FolderBinding,
  FolderBindings,
  FolderReference,
  FolderReferenceScope,
  FolderShortcutLike,
  PortableFolderShortcut
};
