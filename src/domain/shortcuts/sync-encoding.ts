// The compact form browser sync holds: entries encoded per group, split
// across the sync keys under one revision.
import { DEFAULT_SHORTCUTS, LEGACY_SHORTCUTS_CHUNK_KEYS, SCHEME_PATTERN, SHORTCUTS_STORAGE_VERSION, SHORTCUTS_SYNC_KEYS } from './constants';
import { createDefaultShortcutGroups, isPortableFolder, isRecord, isShortcutFolder, isUnknownArray, normalizeShortcutGroups } from './normalize';
import type { DecodedShortcutEntry, ShortcutGroup, ShortcutItem, ShortcutNormalizeOptions, ShortcutSyncEntry, ShortcutSyncRead } from './types';

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

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

// A link entry's optional fields: icon source, plate, plate color, bookmark mark.
function decodeLinkExtras(entry: readonly unknown[]): Partial<DecodedShortcutEntry> {
  const iconSource = nonEmptyText(entry[4]);
  const iconPlate = nonEmptyText(entry[5]);
  const iconPlateColor = nonEmptyText(entry[6]);
  return {
    ...(iconSource ? { iconSource } : {}),
    ...(iconPlate ? { iconPlate } : {}),
    ...(iconPlateColor ? { iconPlateColor } : {}),
    ...(entry[7] === 1 ? { fromBookmark: true } : {})
  };
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
    return { ...base, url: expandUrl(target), ...decodeLinkExtras(entry) };
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
// The chunked list a device wrote: its head and the chunks of the same revision.
function readSyncChunks(stored: Record<string, unknown>, head: Record<string, unknown> & { g: unknown[] }, opts: ShortcutNormalizeOptions): ShortcutSyncRead {
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

// The list as older versions stored it, without groups.
function readLegacyChunks(stored: Record<string, unknown>): ShortcutSyncRead {
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

function readShortcutSyncValues(values: unknown, options?: ShortcutNormalizeOptions | null): ShortcutSyncRead {
  const opts = options && typeof options === 'object' ? options : {};
  const stored = isRecord(values) ? values : {};
  const head = stored[SHORTCUTS_SYNC_KEYS[0]];
  if (isRecord(head) && head.v === SHORTCUTS_STORAGE_VERSION && isUnknownArray(head.g)) {
    return readSyncChunks(stored, { ...head, g: head.g }, opts);
  }
  if (LEGACY_SHORTCUTS_CHUNK_KEYS.some((key) => hasStoredValue(stored, key))) {
    return readLegacyChunks(stored);
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

export {
  compactUrl,
  decodeEntry,
  decodeLinkExtras,
  encodeEntry,
  expandUrl,
  hasStoredValue,
  nonEmptyText,
  readLegacyChunks,
  readShortcutSyncValues,
  readSyncChunks
};
