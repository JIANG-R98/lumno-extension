// Reading shortcuts, groups and the shortcut state from any stored shape.
import * as references from '../bookmark-folder-reference';
import { BROWSER_INTERNAL_PROTOCOLS, DEFAULT_MAX_SHORTCUTS, DEFAULT_MAX_SHORTCUT_GROUPS, DEFAULT_SHORTCUTS, DEFAULT_SHORTCUT_GROUP_ID, ICON_PLATE_COLOR_PATTERN, ICON_PLATE_MODES, ICON_SOURCES, ID_PATTERN, SCHEME_PATTERN, SHORTCUT_GROUP_TITLE_MAX_LENGTH } from './constants';
import type { GroupedShortcutItem, PortableShortcutFolder, ShortcutFolder, ShortcutGroup, ShortcutIconPlate, ShortcutIconSource, ShortcutItem, ShortcutNormalizeOptions, ShortcutState, VisibleShortcutItem } from './types';

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

// A folder shortcut: a bookmark folder by reference, or by its id.
function normalizeFolderShortcut(
  source: Record<string, unknown>,
  group: { groupId?: string },
  title: string,
  opts: ShortcutNormalizeOptions
): ShortcutItem | null {
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

function readShortcutHost(url: string, opts: ShortcutNormalizeOptions): string {
  const normalizeHost = typeof opts.normalizeHost === 'function' ? opts.normalizeHost : defaultNormalizeHost;
  try {
    return normalizeHost(new URL(url).hostname);
  } catch (_error) {
    return '';
  }
}

function normalizeShortcutItem(item: unknown, options?: ShortcutNormalizeOptions | null): ShortcutItem | null {
  const opts = options && typeof options === 'object' ? options : {};
  const source = isRecord(item) ? item : {};
  const groupId = normalizeId(source.groupId);
  const group = groupId ? { groupId } : {};
  const title = sanitizeDisplayText(source.title || source.name || '', opts);
  if (source.type === 'folder') {
    return normalizeFolderShortcut(source, group, title, opts);
  }
  const url = normalizeShortcutUrl(source.url);
  if (!url) {
    return null;
  }
  const host = readShortcutHost(url, opts);
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

export {
  assignGroup,
  createDefaultShortcutGroups,
  createShortcutGroupId,
  createShortcutId,
  createShortcutRecord,
  defaultNormalizeHost,
  getBudget,
  getDefaultShortcutState,
  getDefaultShortcuts,
  getMaxGroups,
  getMaxShortcuts,
  getNow,
  getShortcutStorageItemByteSize,
  getShortcutStoragePayloadByteSize,
  getShortcutUrl,
  getUtf8ByteLength,
  isDefaultShortcutGroupLayout,
  isIconPlate,
  isIconSource,
  isPortableFolder,
  isRecord,
  isShortcutFolder,
  isUnknownArray,
  normalizeFolderShortcut,
  normalizeGroupTitle,
  normalizeIconPlate,
  normalizeId,
  normalizeShortcutGroups,
  normalizeShortcutItem,
  normalizeShortcutState,
  normalizeShortcutUrl,
  normalizeShortcuts,
  randomToken,
  readShortcutHost,
  sanitizeDisplayText,
  stableHashCode
};
