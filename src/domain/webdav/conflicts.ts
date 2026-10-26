// Describing a merge conflict for the Options page, and reading those
// descriptions back.
import * as settings from '../settings';
import type { WebDavOperation } from '../messages';
import * as ShortcutNormalize from '../shortcuts/normalize';
import type { GroupedShortcutItem, ShortcutStateRead } from '../shortcuts/types';
import { LOCAL_WALLPAPER_KEY, WALLPAPER_KEY, asRecord, equal, fieldMergeable, fieldNames, isObject } from './state-base';
import type { ConflictDescription, ListChangeSummary, NameSample, ValueSummary, WebDavState } from './types';

// A conflict summary is display data only: names are capped and values are
// reduced to their kind, so it never ships full shortcut lists or images.
const SUMMARY_NAMES = 6;

function names<T>(list: readonly T[], name: (item: T) => string): NameSample {
  return { names: list.slice(0, SUMMARY_NAMES).map(name), count: list.length };
}

function summarizeValue(value: unknown): ValueSummary {
  if (typeof value === 'undefined' || value === null) return { kind: 'unset' };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
  if (typeof value === 'string' && value.length <= 40) return { kind: 'text', value };
  if (Array.isArray(value)) return { kind: 'list', count: value.length };
  return { kind: 'changed' };
}

function describeList<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  name: (item: T) => string,
  changedItem: (item: T, previous: T) => boolean
): ListChangeSummary {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Set(after.map((item) => item.id));
  const kept = after.filter((item) => previous.has(item.id));
  return {
    total: after.length,
    added: names(after.filter((item) => !previous.has(item.id)), name),
    removed: names(before.filter((item) => !next.has(item.id)), name),
    changed: names(kept.filter((item) => {
      const prior = previous.get(item.id);
      return prior !== undefined && changedItem(item, prior);
    }), name),
    reordered: !equal(kept.map((item) => item.id), before.filter((item) => next.has(item.id)).map((item) => item.id))
  };
}

function getShortcutName(item: GroupedShortcutItem): string {
  return String(item.title || (ShortcutNormalize.isShortcutFolder(item) ? '' : item.url) || '').slice(0, 60);
}

function describeShortcuts(base: WebDavState, side: WebDavState): ListChangeSummary {
  return describeList(base.shortcuts, side.shortcuts, getShortcutName,
    (item, previous) => !equal(item, previous) || side.icons[item.id] !== base.icons[item.id]);
}

function describeWallpapers(base: WebDavState, side: WebDavState): ListChangeSummary {
  const summary = describeList(base.wallpapers, side.wallpapers, (item) => String(item.name || '').slice(0, 60),
    (item, previous) => item.image !== previous.image || item.name !== previous.name);
  summary.selectionChanged = !equal(side.data[LOCAL_WALLPAPER_KEY], base.data[LOCAL_WALLPAPER_KEY]) ||
    !equal(side.data[WALLPAPER_KEY], base.data[WALLPAPER_KEY]);
  return summary;
}

// A folder color entry also carries the folder's creation time; only the
// color means anything to the person choosing a side.
function fieldValue(key: string, value: unknown): unknown {
  return key === settings.bookmarkFolderColorRefs.key && isObject(value) ? value.color : value;
}

// A field-merged record lists only the fields both sides changed apart.
function describeFields(key: string, previous: unknown, left: unknown, right: unknown): ConflictDescription[] {
  const before = asRecord(previous);
  const mine = asRecord(left);
  const theirs = asRecord(right);
  return fieldNames(previous, left, right).filter((field) => {
    return !equal(mine[field], theirs[field]) && !equal(mine[field], before[field]) && !equal(theirs[field], before[field]);
  }).map((field): ConflictDescription => ({ key, field, domain: 'preference', local: summarizeValue(fieldValue(key, mine[field])),
    remote: summarizeValue(fieldValue(key, theirs[field])) }));
}

// The operations the options page may ask the worker for.
const WEBDAV_OPERATIONS: readonly WebDavOperation[] = Object.freeze([
  'status', 'add', 'test', 'save', 'remove', 'enable', 'connect', 'sync', 'pause', 'browser',
  'schedule', 'recover', 'conflictDetails', 'restoreBackup', 'dismissSuggestion'
]);

// A requested operation; null when it names none.
function readWebDavOperation(value: unknown): WebDavOperation | null {
  return WEBDAV_OPERATIONS.find((operation) => operation === value) || null;
}

// Conflict descriptions as the worker sent them, read as untrusted; an
// entry that is not one is left out.
function readConflictDescriptions(value: unknown): ConflictDescription[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: ConflictDescription[] = [];
  value.forEach((entry: unknown) => {
    const item = readConflictDescription(entry);
    if (item) {
      items.push(item);
    }
  });
  return items;
}

// A conflict over the shortcut or wallpaper list.
function readListConflict(key: 'shortcuts' | 'wallpapers', value: { local: unknown; remote: unknown }): ConflictDescription | null {
  const local = readListChangeSummary(value.local);
  const remote = readListChangeSummary(value.remote);
  if (!local || !remote) {
    return null;
  }
  return key === 'shortcuts'
    ? { key: 'shortcuts', domain: 'shortcuts', local, remote }
    : { key: 'wallpapers', domain: 'wallpapers', local, remote };
}

function readPreferenceConflict(key: string, value: object & { local: unknown; remote: unknown }): ConflictDescription | null {
  const local = readValueSummary(value.local);
  const remote = readValueSummary(value.remote);
  if (!local || !remote) {
    return null;
  }
  const field = 'field' in value && typeof value.field === 'string' ? value.field : undefined;
  return field === undefined
    ? { key, domain: 'preference', local, remote }
    : { key, field, domain: 'preference', local, remote };
}

function readConflictDescription(value: unknown): ConflictDescription | null {
  if (!value || typeof value !== 'object' || !('key' in value) || !('domain' in value) ||
      !('local' in value) || !('remote' in value) || typeof value.key !== 'string') {
    return null;
  }
  const { key, domain } = value;
  if ((domain === 'shortcuts' || domain === 'wallpapers') && key === domain) {
    return readListConflict(domain, value);
  }
  return domain === 'preference' ? readPreferenceConflict(key, value) : null;
}

function readNameSample(value: unknown): NameSample | null {
  if (!value || typeof value !== 'object' || !('names' in value) || !('count' in value) ||
      !Array.isArray(value.names) || typeof value.count !== 'number') {
    return null;
  }
  return {
    names: value.names.filter((name: unknown): name is string => typeof name === 'string'),
    count: value.count
  };
}

function readListChangeSummary(value: unknown): ListChangeSummary | null {
  if (!value || typeof value !== 'object' || !('total' in value) || typeof value.total !== 'number' ||
      !('added' in value) || !('removed' in value) || !('changed' in value)) {
    return null;
  }
  const added = readNameSample(value.added);
  const removed = readNameSample(value.removed);
  const changed = readNameSample(value.changed);
  if (!added || !removed || !changed) {
    return null;
  }
  const summary: ListChangeSummary = {
    total: value.total,
    added,
    removed,
    changed,
    reordered: 'reordered' in value && value.reordered === true
  };
  if ('selectionChanged' in value && typeof value.selectionChanged === 'boolean') {
    summary.selectionChanged = value.selectionChanged;
  }
  return summary;
}

// A summary that carries the value itself: a switch, a number or text.
function readScalarSummary(kind: unknown, inner: unknown): ValueSummary | null {
  if (kind === 'boolean' && typeof inner === 'boolean') {
    return { kind, value: inner };
  }
  if (kind === 'number' && typeof inner === 'number') {
    return { kind, value: inner };
  }
  if (kind === 'text' && typeof inner === 'string') {
    return { kind, value: inner };
  }
  return null;
}

function readValueSummary(value: unknown): ValueSummary | null {
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    return null;
  }
  const kind = value.kind;
  if (kind === 'unset' || kind === 'changed') {
    return { kind };
  }
  if (kind === 'list') {
    return 'count' in value && typeof value.count === 'number' ? { kind, count: value.count } : null;
  }
  return readScalarSummary(kind, 'value' in value ? value.value : undefined);
}

function describeConflict(base: WebDavState, local: WebDavState, remote: WebDavState, keys: readonly string[]): ConflictDescription[] {
  return [...new Set(keys)].flatMap((key): ConflictDescription | ConflictDescription[] => {
    if (key === 'shortcuts') return { key, domain: 'shortcuts', local: describeShortcuts(base, local), remote: describeShortcuts(base, remote) };
    if (key === 'wallpapers') return { key, domain: 'wallpapers', local: describeWallpapers(base, local), remote: describeWallpapers(base, remote) };
    if (fieldMergeable(key, base.data[key], local.data[key], remote.data[key])) {
      return describeFields(key, base.data[key], local.data[key], remote.data[key]);
    }
    return { key, domain: 'preference', local: summarizeValue(local.data[key]), remote: summarizeValue(remote.data[key]) };
  });
}

function sameShortcutState(
  left: Pick<ShortcutStateRead, 'groups' | 'items'>,
  right: Pick<ShortcutStateRead, 'groups' | 'items'>
): boolean {
  return equal({ groups: left.groups, items: left.items }, { groups: right.groups, items: right.items });
}

export {
  SUMMARY_NAMES,
  WEBDAV_OPERATIONS,
  describeConflict,
  describeFields,
  describeList,
  describeShortcuts,
  describeWallpapers,
  fieldValue,
  getShortcutName,
  names,
  readConflictDescription,
  readConflictDescriptions,
  readListChangeSummary,
  readListConflict,
  readNameSample,
  readPreferenceConflict,
  readScalarSummary,
  readValueSummary,
  readWebDavOperation,
  sameShortcutState,
  summarizeValue
};
