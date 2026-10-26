// The shapes of shortcuts: links, folders, groups, the stored state and its
// compact sync form.
import type { BookmarkRootType, FolderReference, FolderReferenceScope } from '../bookmark-folder-reference';

type ShortcutIconSource = 'service' | 'favicon-is' | 'cache' | 'custom' | 'builtin';

type ShortcutIconPlate = 'on' | 'off';

// A link to a page.
interface ShortcutLink {
  id: string;
  groupId?: string;
  // Never empty: falls back to the host, then the URL.
  title: string;
  url: string;
  host: string;
  // Where the icon comes from; absent picks automatically.
  iconSource?: ShortcutIconSource;
  // Plate behind the icon: absent follows the artwork (see-through icons get
  // one), 'on' or 'off' overrides it; a color replaces the picked tint.
  iconPlate?: ShortcutIconPlate;
  iconPlateColor?: string;
  // Copied from a bookmark that was kept where it was.
  fromBookmark?: true;
  type?: undefined;
}

interface ShortcutFolderBase {
  id: string;
  groupId?: string;
  type: 'folder';
  title: string;
}

// A bookmark folder named by its portable reference.
interface PortableShortcutFolder extends ShortcutFolderBase {
  folderRef: FolderReference;
  folderId?: undefined;
}

// A bookmark folder named by this device's bookmark ID, as older versions
// stored it.
interface LocalShortcutFolder extends ShortcutFolderBase {
  folderId: string;
  folderRef?: undefined;
}

type ShortcutFolder = PortableShortcutFolder | LocalShortcutFolder;

type ShortcutItem = ShortcutLink | ShortcutFolder;

// A folder entry as a page shows it: opened by this device's bookmark ID,
// keeping its portable reference when it has one.
interface VisibleShortcutFolder extends ShortcutFolderBase {
  folderId: string;
  folderRef?: FolderReference;
}

type VisibleShortcutItem = ShortcutLink | VisibleShortcutFolder;

// An item of a normalized state, which always names its group.
type GroupedShortcutItem = ShortcutItem & { groupId: string };

interface ShortcutGroup {
  id: string;
  title: string;
}

interface ShortcutState {
  groups: ShortcutGroup[];
  items: GroupedShortcutItem[];
  // When the state was first saved in this format.
  migratedAt?: number;
}

// Where a read state came from: the grouped copy, the flat list older
// versions wrote, nothing (the default shortcuts), or the local record that
// holds the whole state after a failed sync write.
type ShortcutStateSource = 'v2' | 'legacy' | 'none' | 'local';

interface ShortcutStateRead extends ShortcutState {
  source: ShortcutStateSource;
  // The revision of the synced copy that was read.
  rev: string;
  // The synced keys came from different saves.
  torn: boolean;
}

// The synced copy before its items are normalized.
interface ShortcutSyncRead {
  source: Exclude<ShortcutStateSource, 'local'>;
  rev: string;
  torn: boolean;
  migratedAt: number;
  groups: ShortcutGroup[];
  items: unknown[];
}

interface ShortcutSyncSummary {
  total: number;
  synced: number;
  localOnly: number;
  syncFailed: boolean;
}

// Bytes in browser sync: all of it, the grouped copy's, and the legacy
// copy's.
interface ShortcutSyncUsage {
  totalBytes: number;
  shortcutBytes: number;
  legacyBytes: number;
}

interface ShortcutSyncBudgetInput extends Partial<ShortcutSyncUsage> {
  quotaBytes?: number;
  reserveBytes?: number;
  ceilingBytes?: number;
}

interface ShortcutNormalizeOptions {
  // The clock, for new ids.
  now?: number;
  maxShortcuts?: number;
  maxGroups?: number;
  // The page's host identity; lowercase without www. when absent.
  normalizeHost?: (hostname: string) => string;
  // Cleans titles before whitespace is collapsed.
  sanitizeDisplayText?: (text: unknown) => string;
}

interface ShortcutStoragePlanOptions extends ShortcutNormalizeOptions {
  rev?: string;
  maxItemBytes?: number;
  maxTotalBytes?: number;
  // The legacy keys are still in browser sync.
  legacyKeysPresent?: boolean;
}

// The positional form of a folder reference in a synced entry.
type EncodedFolderRef = [BookmarkRootType, FolderReferenceScope, string[], string];

// One synced entry: id, group position, title, then the URL (links: an
// icon source, plate and plate color and the bookmark flag may follow) or a
// folder marker (0 with a reference, 1 with a local bookmark ID).
type ShortcutSyncEntry =
  | [string, number, string, 0, EncodedFolderRef]
  | [string, number, string, 1, string]
  | [string, number, string, string, ...Array<string | 1>];

interface ShortcutSyncChunk {
  r: string;
  s: ShortcutSyncEntry[];
}

// The first sync key, which also holds the version, how many keys are in
// use, when the state was migrated and the groups.
interface ShortcutSyncHead extends ShortcutSyncChunk {
  v: number;
  n: number;
  m: number;
  g: Array<[string, string]>;
}

// This device's record of the shortcuts browser sync could not take. When
// authoritative it holds the whole state instead.
interface ShortcutOverflowRecord {
  version: number;
  rev: string;
  authoritative: boolean;
  groups?: ShortcutGroup[];
  items: GroupedShortcutItem[];
  migratedAt?: number;
}

interface ShortcutStoragePlan {
  state: ShortcutState & { migratedAt: number };
  rev: string;
  // The values of the sync keys.
  payload: Record<string, ShortcutSyncChunk>;
  syncedItems: GroupedShortcutItem[];
  overflowItems: GroupedShortcutItem[];
  overflowRecord: ShortcutOverflowRecord;
  // Legacy keys whose retention has passed.
  removeKeys: string[];
  totalBytes: number;
  maxItemBytes: number;
  maxTotalBytes: number;
}

// A stored entry decoded to the shape normalizeShortcutItem takes.
type DecodedShortcutEntry = Record<string, unknown> & { id: string; title: string };

interface OverflowRead {
  authoritative: boolean;
  rev: string;
  groups: unknown[] | null;
  migratedAt: number;
  items: unknown[];
}

export type {
  DecodedShortcutEntry,
  EncodedFolderRef,
  GroupedShortcutItem,
  LocalShortcutFolder,
  OverflowRead,
  PortableShortcutFolder,
  ShortcutFolder,
  ShortcutFolderBase,
  ShortcutGroup,
  ShortcutIconPlate,
  ShortcutIconSource,
  ShortcutItem,
  ShortcutLink,
  ShortcutNormalizeOptions,
  ShortcutOverflowRecord,
  ShortcutState,
  ShortcutStateRead,
  ShortcutStateSource,
  ShortcutStoragePlan,
  ShortcutStoragePlanOptions,
  ShortcutSyncBudgetInput,
  ShortcutSyncChunk,
  ShortcutSyncEntry,
  ShortcutSyncHead,
  ShortcutSyncRead,
  ShortcutSyncSummary,
  ShortcutSyncUsage,
  VisibleShortcutFolder,
  VisibleShortcutItem
};
