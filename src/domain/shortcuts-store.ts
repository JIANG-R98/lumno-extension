// Shortcuts are stored as one state: ordered groups, and ordered items that
// each name their group. Browser sync holds a compact copy of that state in
// three keys under a fixed byte ceiling; whatever does not fit stays in this
// device's local overflow record, which WebDAV carries between devices.
import * as references from './bookmark-folder-reference';
import type { BookmarkRootType, FolderReference, FolderReferenceScope } from './bookmark-folder-reference';

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

const DEFAULT_MAX_SHORTCUTS = 200;
const DEFAULT_MAX_SHORTCUT_GROUPS = 20;
const SHORTCUT_GROUP_TITLE_MAX_LENGTH = 24;
const DEFAULT_SHORTCUT_GROUP_ID = 'g0';
const SHORTCUTS_STORAGE_VERSION = 2;
const SHORTCUTS_SYNC_KEYS: readonly string[] = Object.freeze([
  '_x_extension_newtab_shortcuts_v2_2026_unique_',
  '_x_extension_newtab_shortcuts_v2_chunk_2_2026_unique_',
  '_x_extension_newtab_shortcuts_v2_chunk_3_2026_unique_'
]);
// The flat list older versions wrote. It is read until the first save in
// the new format and then left untouched, because a device still running an
// older version reads it (and backs it up to WebDAV) as its whole list.
const LEGACY_SHORTCUTS_KEY = '_x_extension_newtab_shortcuts_2026_unique_';
const LEGACY_SHORTCUTS_CHUNK_KEYS: readonly string[] = Object.freeze([
  LEGACY_SHORTCUTS_KEY,
  '_x_extension_newtab_shortcuts_chunk_2_2026_unique_',
  '_x_extension_newtab_shortcuts_chunk_3_2026_unique_'
]);
const SHORTCUT_STORAGE_KEYS: readonly string[] = Object.freeze([...SHORTCUTS_SYNC_KEYS, ...LEGACY_SHORTCUTS_CHUNK_KEYS]);
const SHORTCUTS_LOCAL_OVERFLOW_KEY = '_x_extension_newtab_shortcuts_local_overflow_2026_unique_';
// Every older device has updated long before this, so the legacy copy can
// give its sync bytes back.
const LEGACY_SHORTCUTS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// chrome.storage.sync allows 8192 bytes per item; keep a margin under it.
const DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES = 7680;
// Shortcuts never take more than this from browser sync, legacy copy included.
const DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES =
  DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES * SHORTCUTS_SYNC_KEYS.length;
// Browser sync space shortcuts must leave to every other setting.
const DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES = 64 * 1024;
const DEFAULT_SYNC_QUOTA_BYTES = 100 * 1024;
const DEFAULT_SHORTCUTS: ReadonlyArray<Readonly<{ id: string; title: string; url: string }>> = Object.freeze([
  Object.freeze({
    id: 'shortcut-lumno-default',
    title: 'Lumno',
    url: 'https://lumno.kubai.design/'
  })
]);
const BROWSER_INTERNAL_PROTOCOLS: ReadonlySet<string> = new Set([
  'chrome:', 'edge:', 'brave:', 'vivaldi:', 'opera:'
]);
const ICON_SOURCES: ReadonlySet<string> = new Set<ShortcutIconSource>(['service', 'favicon-is', 'cache', 'custom', 'builtin']);
const ICON_PLATE_MODES: ReadonlySet<string> = new Set<ShortcutIconPlate>(['on', 'off']);
const ICON_PLATE_COLOR_PATTERN = /^#[\dA-F]{6}$/;
const ID_PATTERN = /^[\w-]{1,120}$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// Type guards rather than property checks narrow the item unions, so the
// narrowing also holds where strictNullChecks is off.
function isShortcutFolder<T extends ShortcutItem | VisibleShortcutItem>(item: T): item is Extract<T, { type: 'folder' }> {
  return item.type === 'folder';
}

// A link's page; '' for a folder, which has none of its own.
function getShortcutUrl(item: ShortcutItem | VisibleShortcutItem): string {
  return isShortcutFolder(item) ? '' : item.url;
}

function isPortableFolder(item: ShortcutFolder): item is PortableShortcutFolder {
  return Boolean(item.folderRef);
}

function isIconSource(value: unknown): value is ShortcutIconSource {
  return typeof value === 'string' && ICON_SOURCES.has(value);
}

function isIconPlate(value: unknown): value is ShortcutIconPlate {
  return typeof value === 'string' && ICON_PLATE_MODES.has(value);
}

function defaultNormalizeHost(hostname: string): string {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
}

function sanitizeDisplayText(text: unknown, options: ShortcutNormalizeOptions): string {
  const value = typeof options.sanitizeDisplayText === 'function'
    ? options.sanitizeDisplayText(text)
    : text;
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getNow(options: ShortcutNormalizeOptions): number {
  const raw = Number(options.now);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : Date.now();
}

function getMaxShortcuts(options: ShortcutNormalizeOptions): number {
  const raw = Number(options.maxShortcuts);
  return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : DEFAULT_MAX_SHORTCUTS;
}

function getMaxGroups(options: ShortcutNormalizeOptions): number {
  const raw = Number(options.maxGroups);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_MAX_SHORTCUT_GROUPS;
}

function getUtf8ByteLength(value: unknown): number {
  let byteLength = 0;
  for (const character of String(value || '')) {
    const codePoint = character.codePointAt(0) || 0;
    if (codePoint <= 0x7f) {
      byteLength += 1;
    } else if (codePoint <= 0x7ff) {
      byteLength += 2;
    } else if (codePoint <= 0xffff) {
      byteLength += 3;
    } else {
      byteLength += 4;
    }
  }
  return byteLength;
}

function getShortcutStorageItemByteSize(key: string, value: unknown): number {
  return getUtf8ByteLength(key) + getUtf8ByteLength(JSON.stringify(value));
}

function getShortcutStoragePayloadByteSize(payload: unknown): number {
  return Object.entries(isRecord(payload) ? payload : {})
    .reduce((total, [key, value]) => (
      total + getShortcutStorageItemByteSize(key, value)
    ), 0);
}

// A non-negative whole number of bytes, or the fallback.
function getBudget(value: unknown, fallback: number): number {
  const raw = Number(value);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

function stableHashCode(text: string): string {
  const value = String(text || '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function randomToken(length: number): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  let token = '';
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(length));
    bytes.forEach((byte) => { token += (byte % 36).toString(36); });
    return token;
  }
  while (token.length < length) {
    token += Math.floor(Math.random() * 36).toString(36);
  }
  return token;
}

function normalizeShortcutUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const candidate = SCHEME_PATTERN.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    const isBrowserInternal = BROWSER_INTERNAL_PROTOCOLS.has(parsed.protocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && !isBrowserInternal) {
      return '';
    }
    if (!parsed.hostname) {
      return '';
    }
    if (isBrowserInternal) {
      if (parsed.username || parsed.password || parsed.port) {
        return '';
      }
      parsed.hostname = parsed.hostname.toLowerCase();
      parsed.pathname = parsed.pathname || '/';
    }
    return parsed.toString();
  } catch (_error) {
    return '';
  }
}

// Short ids keep each synced entry small; older long ids stay valid.
function createShortcutId(url: string, options: ShortcutNormalizeOptions): string {
  return `s${getNow(options).toString(36)}${stableHashCode(url).slice(0, 4)}`;
}

function createShortcutGroupId(): string {
  return `g${Date.now().toString(36)}${randomToken(3)}`;
}

function normalizeId(value: unknown): string {
  const id = String(value || '').trim();
  return ID_PATTERN.test(id) ? id : '';
}

function normalizeGroupTitle(value: unknown, options: ShortcutNormalizeOptions): string {
  return Array.from(sanitizeDisplayText(value, options))
    .slice(0, SHORTCUT_GROUP_TITLE_MAX_LENGTH).join('');
}

function normalizeIconPlate(source: Record<string, unknown>): { iconPlate?: ShortcutIconPlate; iconPlateColor?: string } {
  const mode = isIconPlate(source.iconPlate) ? source.iconPlate : '';
  const color = typeof source.iconPlateColor === 'string' ? source.iconPlateColor.trim().toUpperCase() : '';
  return {
    ...(mode ? { iconPlate: mode } : {}),
    ...(mode !== 'off' && ICON_PLATE_COLOR_PATTERN.test(color) ? { iconPlateColor: color } : {})
  };
}

function normalizeShortcutItem(item: unknown, options?: ShortcutNormalizeOptions | null): ShortcutItem | null {
  const opts = options && typeof options === 'object' ? options : {};
  const source = isRecord(item) ? item : {};
  const groupId = normalizeId(source.groupId);
  const group = groupId ? { groupId } : {};
  const title = sanitizeDisplayText(source.title || source.name || '', opts);
  if (source.type === 'folder') {
    const folderRef = references.normalizeReference(source.folderRef);
    const folderId = String(source.folderId || '').trim();
    if (!folderRef && (!folderId || folderId === '0')) {
      return null;
    }
    const id = sanitizeDisplayText(source.id || '', opts);
    if (folderRef) {
      return id ? { id, ...group, type: 'folder', folderRef, title } : null;
    }
    return { id: id || `shortcut-folder-${folderId}`, ...group, type: 'folder', folderId, title };
  }
  const url = normalizeShortcutUrl(source.url);
  if (!url) {
    return null;
  }
  const normalizeHost = typeof opts.normalizeHost === 'function' ? opts.normalizeHost : defaultNormalizeHost;
  let host = '';
  try {
    host = normalizeHost(new URL(url).hostname);
  } catch (_error) {
    host = '';
  }
  const id = sanitizeDisplayText(source.id || '', opts) || createShortcutId(url, opts);
  return {
    id,
    ...group,
    title: title || host || url,
    url,
    host,
    ...(isIconSource(source.iconSource) ? { iconSource: source.iconSource } : {}),
    ...normalizeIconPlate(source),
    ...(source.fromBookmark === true ? { fromBookmark: true } : {})
  };
}

function createShortcutRecord(input: unknown, options?: ShortcutNormalizeOptions | null): ShortcutItem | null {
  const opts = options && typeof options === 'object' ? options : {};
  const source = isRecord(input) ? input : {};
  return normalizeShortcutItem({
    ...source,
    ...(source.type === 'folder' && references.normalizeReference(source.folderRef) && !source.id
      ? { id: references.createEntryId() } : {})
  }, opts);
}

// The same item with its group set, its fields in the order
// normalizeShortcutItem writes them.
function assignGroup(item: ShortcutItem, groupId: string): GroupedShortcutItem {
  if (!isShortcutFolder(item)) {
    const { id, groupId: _previous, ...rest } = item;
    return { id, groupId, ...rest };
  }
  if (isPortableFolder(item)) {
    const { id, groupId: _previous, ...rest } = item;
    return { id, groupId, ...rest };
  }
  const { id, groupId: _previous, ...rest } = item;
  return { id, groupId, ...rest };
}

function normalizeShortcuts(items: unknown, options?: ShortcutNormalizeOptions | null): ShortcutItem[] {
  const opts = options && typeof options === 'object' ? options : {};
  const maxShortcuts = getMaxShortcuts(opts);
  if (!isUnknownArray(items) || maxShortcuts <= 0) {
    return [];
  }
  const normalized: ShortcutItem[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  for (let i = 0; i < items.length; i += 1) {
    const item = normalizeShortcutItem(items[i], opts);
    if (!item) {
      continue;
    }
    const identity = isShortcutFolder(item)
      ? (isPortableFolder(item) ? `folder-entry:${item.id}` : `folder:${item.folderId}`) : item.url;
    if (seenUrls.has(identity) || seenIds.has(item.id)) {
      continue;
    }
    seenUrls.add(identity);
    seenIds.add(item.id);
    normalized.push(item);
    if (normalized.length >= maxShortcuts) {
      break;
    }
  }
  return normalized;
}

function createDefaultShortcutGroups(): ShortcutGroup[] {
  return [{ id: DEFAULT_SHORTCUT_GROUP_ID, title: '' }];
}

function normalizeShortcutGroups(groups: unknown, options?: ShortcutNormalizeOptions | null): ShortcutGroup[] {
  const opts = options && typeof options === 'object' ? options : {};
  const maxGroups = getMaxGroups(opts);
  const normalized: ShortcutGroup[] = [];
  const seen = new Set<string>();
  for (const group of isUnknownArray(groups) ? groups : []) {
    const source = isRecord(group) ? group : {};
    const id = normalizeId(source.id);
    if (!id || seen.has(id) || normalized.length >= maxGroups) {
      continue;
    }
    seen.add(id);
    normalized.push({ id, title: normalizeGroupTitle(source.title, opts) });
  }
  return normalized.length ? normalized : createDefaultShortcutGroups();
}

// Items stay in their groups' order and keep their order inside a group.
// An item without a known group joins the group of the item before it, so a
// shortcut inserted into a flat list lands where it was dropped.
function normalizeShortcutState(state: unknown, options?: ShortcutNormalizeOptions | null): ShortcutState {
  const opts = options && typeof options === 'object' ? options : {};
  const source = isRecord(state) ? state : {};
  const groups = normalizeShortcutGroups(source.groups, opts);
  const groupIndex = new Map(groups.map((group, index) => [group.id, index]));
  let currentGroupId = groups[0].id;
  const items = normalizeShortcuts(source.items, opts).map((item) => {
    if (item.groupId && groupIndex.has(item.groupId)) {
      currentGroupId = item.groupId;
    }
    return assignGroup(item, currentGroupId);
  });
  const ordered = items
    .map((item, index) => ({ item, index, group: groupIndex.get(item.groupId) ?? groups.length }))
    .sort((left, right) => (left.group - right.group) || (left.index - right.index))
    .map((entry) => entry.item);
  const migratedAt = Number(source.migratedAt);
  return {
    groups,
    items: ordered,
    ...(Number.isFinite(migratedAt) && migratedAt > 0 ? { migratedAt: Math.floor(migratedAt) } : {})
  };
}

function isDefaultShortcutGroupLayout(groups: unknown): boolean {
  if (!isUnknownArray(groups) || groups.length !== 1) {
    return false;
  }
  const group = groups[0];
  return isRecord(group) && group.id === DEFAULT_SHORTCUT_GROUP_ID && !group.title;
}

function getDefaultShortcuts(options?: ShortcutNormalizeOptions | null): GroupedShortcutItem[] {
  return normalizeShortcutState({ items: DEFAULT_SHORTCUTS }, options).items;
}

function getDefaultShortcutState(options?: ShortcutNormalizeOptions | null): ShortcutState {
  return normalizeShortcutState({ items: DEFAULT_SHORTCUTS }, options);
}

// Synced entries are positional arrays. Links leave out the https scheme
// and a title that only repeats the host; folders carry a type marker in
// the url slot.
function compactUrl(url: string): string {
  if (url.startsWith('https://')) {
    const rest = url.slice(8);
    if (!SCHEME_PATTERN.test(rest)) {
      return rest;
    }
  }
  return url;
}

function expandUrl(value: string): string {
  const text = String(value || '');
  return SCHEME_PATTERN.test(text) ? text : `https://${text}`;
}

function encodeEntry(item: ShortcutItem, groupPosition: number): ShortcutSyncEntry {
  if (isShortcutFolder(item)) {
    if (isPortableFolder(item)) {
      const ref = item.folderRef;
      return [item.id, groupPosition, item.title, 0, [ref.root, ref.scope, ref.path, ref.fingerprint]];
    }
    return [item.id, groupPosition, item.title, 1, item.folderId];
  }
  // Older versions read only the first five fields.
  const extra: Array<string | 1> = [item.iconSource || '', item.iconPlate || '', item.iconPlateColor || '', item.fromBookmark ? 1 : ''];
  while (extra.length && !extra[extra.length - 1]) {
    extra.pop();
  }
  return [item.id, groupPosition, item.title === item.host ? '' : item.title, compactUrl(item.url), ...extra];
}

function decodeEntry(entry: unknown, groups: readonly ShortcutGroup[]): DecodedShortcutEntry | null {
  if (!isUnknownArray(entry) || typeof entry[0] !== 'string') {
    return null;
  }
  const position = entry[1];
  const group = typeof position === 'number' && Number.isInteger(position) ? groups[position] : undefined;
  const base = { id: entry[0], ...(group ? { groupId: group.id } : {}), title: String(entry[2] || '') };
  const target = entry[3];
  const detail = entry[4];
  if (typeof target === 'string') {
    return { ...base, url: expandUrl(target), ...(typeof detail === 'string' && detail ? { iconSource: detail } : {}),
      ...(typeof entry[5] === 'string' && entry[5] ? { iconPlate: entry[5] } : {}),
      ...(typeof entry[6] === 'string' && entry[6] ? { iconPlateColor: entry[6] } : {}),
      ...(entry[7] === 1 ? { fromBookmark: true } : {}) };
  }
  if (target === 0 && isUnknownArray(detail)) {
    const [refRoot, scope, path, fingerprint] = detail;
    return { ...base, type: 'folder', folderRef: { version: 1, root: refRoot, scope, path, fingerprint } };
  }
  if (target === 1) {
    return { ...base, type: 'folder', folderId: String(detail || '') };
  }
  return null;
}

function hasStoredValue(values: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, key) && typeof values[key] !== 'undefined';
}

// Reads the synced copy. Browser sync can deliver the three keys of one
// save separately; a chunk from another save marks the read as torn, and
// its entries are still kept so a save made from it loses nothing.
function readShortcutSyncValues(values: unknown, options?: ShortcutNormalizeOptions | null): ShortcutSyncRead {
  const opts = options && typeof options === 'object' ? options : {};
  const stored = isRecord(values) ? values : {};
  const head = stored[SHORTCUTS_SYNC_KEYS[0]];
  if (isRecord(head) && head.v === SHORTCUTS_STORAGE_VERSION && isUnknownArray(head.g)) {
    const groups = normalizeShortcutGroups(head.g.map((group) => (
      isUnknownArray(group) ? { id: group[0], title: group[1] } : null
    )), opts);
    const count = Math.min(SHORTCUTS_SYNC_KEYS.length, Math.max(1, Math.floor(Number(head.n) || 1)));
    const entries: unknown[] = isUnknownArray(head.s) ? head.s.slice() : [];
    let torn = false;
    for (let index = 1; index < count; index += 1) {
      const chunk = stored[SHORTCUTS_SYNC_KEYS[index]];
      if (!isRecord(chunk) || chunk.r !== head.r) {
        torn = true;
      }
      if (isRecord(chunk) && isUnknownArray(chunk.s)) {
        entries.push(...chunk.s);
      }
    }
    return {
      source: 'v2',
      rev: String(head.r || ''),
      torn,
      migratedAt: Number(head.m) || 0,
      groups,
      items: entries.flatMap((entry) => {
        const decoded = decodeEntry(entry, groups);
        return decoded ? [decoded] : [];
      })
    };
  }
  if (LEGACY_SHORTCUTS_CHUNK_KEYS.some((key) => hasStoredValue(stored, key))) {
    const items: unknown[] = [];
    for (const key of LEGACY_SHORTCUTS_CHUNK_KEYS) {
      const chunk = stored[key];
      if (isUnknownArray(chunk)) {
        items.push(...chunk.map((item) => {
          if (!isRecord(item)) return item;
          const { groupId: _ignored, ...rest } = item;
          return rest;
        }));
      }
    }
    return { source: 'legacy', rev: '', torn: false, migratedAt: 0, groups: createDefaultShortcutGroups(), items };
  }
  return {
    source: 'none',
    rev: '',
    torn: false,
    migratedAt: 0,
    groups: createDefaultShortcutGroups(),
    items: DEFAULT_SHORTCUTS.slice()
  };
}

function normalizeOverflowRecord(value: unknown): OverflowRead {
  if (isUnknownArray(value)) {
    return { authoritative: false, rev: '', groups: null, migratedAt: 0, items: value };
  }
  const source = isRecord(value) ? value : {};
  return {
    authoritative: source.authoritative === true,
    rev: String(source.rev || ''),
    groups: isUnknownArray(source.groups) ? source.groups : null,
    migratedAt: Number(source.migratedAt) || 0,
    items: isUnknownArray(source.items) ? source.items : []
  };
}

// Rebuilds the whole state from the synced copy and this device's overflow
// record. Overflow entries are the tail of the list, so each one goes back
// to the end of its group; an entry the synced copy already has keeps the
// synced position.
function readShortcutState(
  values: unknown,
  overflowValue?: unknown,
  options?: ShortcutNormalizeOptions | null
): ShortcutStateRead {
  const opts = options && typeof options === 'object' ? options : {};
  const synced = readShortcutSyncValues(values, opts);
  const overflow = normalizeOverflowRecord(overflowValue);
  const meta = { source: synced.source, rev: synced.rev, torn: synced.torn };
  if (overflow.authoritative) {
    return {
      ...normalizeShortcutState({
        groups: overflow.groups || synced.groups,
        items: overflow.items,
        migratedAt: overflow.migratedAt || synced.migratedAt
      }, opts),
      ...meta,
      source: 'local'
    };
  }
  return {
    ...normalizeShortcutState({
      groups: synced.groups,
      items: [...synced.items, ...overflow.items],
      migratedAt: synced.migratedAt
    }, opts),
    ...meta
  };
}

// How many shortcuts browser sync carries and how many only this device
// keeps. After a failed sync write the local record holds them all.
function summarizeShortcutSync(
  values: unknown,
  overflowValue?: unknown,
  options?: ShortcutNormalizeOptions | null
): ShortcutSyncSummary {
  const state = readShortcutState(values, overflowValue, options);
  const total = state.items.length;
  if (normalizeOverflowRecord(overflowValue).authoritative) {
    return { total, synced: 0, localOnly: total, syncFailed: true };
  }
  const synced = readShortcutSyncValues(values, options);
  // Nothing saved yet: every device starts from the same default shortcuts.
  if (synced.source === 'none' && !normalizeOverflowRecord(overflowValue).items.length) {
    return { total, synced: total, localOnly: 0, syncFailed: false };
  }
  const syncedIds = new Set(normalizeShortcuts(synced.items, options).map((item) => item.id));
  const syncedCount = state.items.filter((item) => syncedIds.has(item.id)).length;
  return { total, synced: syncedCount, localOnly: total - syncedCount, syncFailed: false };
}

// Sync bytes available to the new copy: the shortcut ceiling, never past
// the space reserved for other settings, minus what the legacy copy holds.
function getShortcutSyncBudget(usage?: ShortcutSyncBudgetInput | null): number {
  const source = usage && typeof usage === 'object' ? usage : {};
  const quotaBytes = getBudget(source.quotaBytes, DEFAULT_SYNC_QUOTA_BYTES);
  const reserveBytes = getBudget(source.reserveBytes, DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES);
  const ceilingBytes = getBudget(source.ceilingBytes, DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES);
  const totalBytes = getBudget(source.totalBytes, 0);
  const shortcutBytes = getBudget(source.shortcutBytes, 0);
  const legacyBytes = getBudget(source.legacyBytes, 0);
  const otherBytes = Math.max(0, totalBytes - shortcutBytes - legacyBytes);
  const protectedBytes = Math.max(0, quotaBytes - reserveBytes - otherBytes);
  return Math.max(0, Math.min(ceilingBytes, protectedBytes) - legacyBytes);
}

function measureShortcutSyncUsage(values: unknown): ShortcutSyncUsage {
  const usage: ShortcutSyncUsage = { totalBytes: 0, shortcutBytes: 0, legacyBytes: 0 };
  for (const [key, value] of Object.entries(isRecord(values) ? values : {})) {
    if (typeof value === 'undefined') continue;
    const bytes = getShortcutStorageItemByteSize(key, value);
    usage.totalBytes += bytes;
    if (SHORTCUTS_SYNC_KEYS.includes(key)) usage.shortcutBytes += bytes;
    if (LEGACY_SHORTCUTS_CHUNK_KEYS.includes(key)) usage.legacyBytes += bytes;
  }
  return usage;
}

// Packs the state into the three sync keys in display order. Group titles
// always go first; entries fill each key up to its byte budget, and the
// first entry that does not fit starts the local overflow.
function createShortcutStoragePlan(state: unknown, options?: ShortcutStoragePlanOptions | null): ShortcutStoragePlan {
  const opts = options && typeof options === 'object' ? options : {};
  const normalized = normalizeShortcutState(state, opts);
  const now = getNow(opts);
  const rev = String(opts.rev || `${now.toString(36)}${randomToken(4)}`);
  const migratedAt = normalized.migratedAt || now;
  const maxItemBytes = Math.max(1, getBudget(opts.maxItemBytes, DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES));
  const requestedMaxTotalBytes = getBudget(opts.maxTotalBytes, DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES);
  const groupPositions = new Map(normalized.groups.map((group, index) => [group.id, index]));
  const head: ShortcutSyncHead = { v: SHORTCUTS_STORAGE_VERSION, r: rev, n: 1, m: migratedAt,
    g: normalized.groups.map((group): [string, string] => [group.id, group.title]), s: [] };
  const chunks: ShortcutSyncChunk[] = [head, ...SHORTCUTS_SYNC_KEYS.slice(1).map(() => ({ r: rev, s: [] }))];
  const chunkBytes = chunks.map((chunk, index) => getShortcutStorageItemByteSize(SHORTCUTS_SYNC_KEYS[index], chunk));
  const emptyBytes = chunkBytes.reduce((sum, bytes) => sum + bytes, 0);
  const maxTotalBytes = Math.max(emptyBytes, requestedMaxTotalBytes);
  let totalBytes = emptyBytes;
  let chunkIndex = 0;
  let overflowStartIndex = normalized.items.length;

  for (let itemIndex = 0; itemIndex < normalized.items.length; itemIndex += 1) {
    const item = normalized.items[itemIndex];
    const entry = encodeEntry(item, groupPositions.get(item.groupId) ?? 0);
    const entryBytes = getUtf8ByteLength(JSON.stringify(entry));
    let stored = false;
    while (chunkIndex < chunks.length) {
      const added = entryBytes + (chunks[chunkIndex].s.length ? 1 : 0);
      if (chunkBytes[chunkIndex] + added <= maxItemBytes && totalBytes + added <= maxTotalBytes) {
        chunks[chunkIndex].s.push(entry);
        chunkBytes[chunkIndex] += added;
        totalBytes += added;
        stored = true;
        break;
      }
      chunkIndex += 1;
    }
    if (!stored) {
      overflowStartIndex = itemIndex;
      break;
    }
  }

  let usedChunks = 1;
  chunks.forEach((chunk, index) => {
    if (chunk.s.length) usedChunks = index + 1;
  });
  head.n = usedChunks;
  const payload: Record<string, ShortcutSyncChunk> = {};
  SHORTCUTS_SYNC_KEYS.forEach((key, index) => {
    payload[key] = chunks[index];
  });
  const syncedItems = normalized.items.slice(0, overflowStartIndex);
  const overflowItems = normalized.items.slice(overflowStartIndex);
  const legacyExpired = opts.legacyKeysPresent === true && Boolean(normalized.migratedAt) &&
    now - migratedAt >= LEGACY_SHORTCUTS_RETENTION_MS;
  return {
    state: { ...normalized, migratedAt },
    rev,
    payload,
    syncedItems,
    overflowItems,
    overflowRecord: { version: SHORTCUTS_STORAGE_VERSION, rev, authoritative: false, items: overflowItems },
    removeKeys: legacyExpired ? LEGACY_SHORTCUTS_CHUNK_KEYS.slice() : [],
    totalBytes: getShortcutStoragePayloadByteSize(payload),
    maxItemBytes,
    maxTotalBytes
  };
}

// The local record that holds the whole state after a failed sync write.
function createAuthoritativeOverflowRecord(state: ShortcutState): ShortcutOverflowRecord {
  return {
    version: SHORTCUTS_STORAGE_VERSION,
    rev: '',
    authoritative: true,
    groups: state.groups,
    items: state.items,
    ...(state.migratedAt ? { migratedAt: state.migratedAt } : {})
  };
}

export {
  DEFAULT_MAX_SHORTCUTS,
  DEFAULT_MAX_SHORTCUT_GROUPS,
  SHORTCUT_GROUP_TITLE_MAX_LENGTH,
  DEFAULT_SHORTCUT_GROUP_ID,
  SHORTCUTS_STORAGE_VERSION,
  SHORTCUTS_SYNC_KEYS,
  LEGACY_SHORTCUTS_KEY,
  LEGACY_SHORTCUTS_CHUNK_KEYS,
  SHORTCUT_STORAGE_KEYS,
  SHORTCUTS_LOCAL_OVERFLOW_KEY,
  LEGACY_SHORTCUTS_RETENTION_MS,
  DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES,
  DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES,
  DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES,
  DEFAULT_SHORTCUTS,
  getUtf8ByteLength,
  getShortcutStorageItemByteSize,
  getShortcutStoragePayloadByteSize,
  normalizeShortcutUrl,
  normalizeShortcutItem,
  createShortcutRecord,
  createShortcutGroupId,
  normalizeShortcuts,
  normalizeShortcutGroups,
  normalizeShortcutState,
  isDefaultShortcutGroupLayout,
  getDefaultShortcuts,
  getDefaultShortcutState,
  readShortcutSyncValues,
  readShortcutState,
  summarizeShortcutSync,
  getShortcutSyncBudget,
  measureShortcutSyncUsage,
  createShortcutStoragePlan,
  createAuthoritativeOverflowRecord,
  isShortcutFolder,
  isPortableFolder,
  getShortcutUrl
};
export type {
  GroupedShortcutItem,
  LocalShortcutFolder,
  PortableShortcutFolder,
  ShortcutFolder,
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
