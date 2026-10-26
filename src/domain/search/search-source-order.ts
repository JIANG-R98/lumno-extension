// One synced record holds every order the reader can set for search sources:
// the group blocks of the search scope panel, each Settings list, and the
// browser content source types. Nothing is stored until the reader moves
// something, and anything the record does not mention keeps its usual place.
import { searchSourceOrder } from '../settings/search';
const SCHEMA_VERSION = 1;

// The stored record, always complete once normalized.
interface SearchSourceOrder {
  version: number;
  // Group blocks of the search scope panel.
  groups: string[];
  // Keys of each Settings list, by list id.
  lists: Record<string, string[]>;
  // Browser content source types.
  local: string[];
}

type KeyNormalizer = (value: unknown) => string;

// What the search scope panel reports after a tile drag.
interface ScopeMenuMove {
  list?: string;
  listItems?: Array<{ orderKey?: string } | null>;
  movedItems?: Array<{ orderKey?: string } | null>;
}

interface RankScopeOptions<T> {
  getGroup?: (item: T) => unknown;
  getList?: (item: T) => unknown;
  getKey?: (item: T) => unknown;
}

type HistoryShortcut = 'undo' | 'redo' | '';

const GROUP_IDS: readonly string[] = Object.freeze(['aggregate', 'engine', 'site', 'ai', 'local']);
// The order the search scope panel has always used.
const DEFAULT_GROUP_ORDER = GROUP_IDS;
// One list per Settings list. Custom searches are ordered among themselves;
// in the panel they lead their group, as they always have.
const LIST_IDS: readonly string[] = Object.freeze(['custom', 'engine', 'site', 'ai', 'aggregate']);
const LOCAL_SOURCE_TYPES: readonly string[] = Object.freeze(['topSite', 'bookmark', 'history']);

const MAX_LIST_ENTRIES = 240;
const MAX_KEY_LENGTH = 64;
// Chrome Sync rejects an item above 8 KB, which fails the whole write.
const MAX_RECORD_BYTES = 7600;

function toText(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

// Provider keys match case-insensitively everywhere else, so they are stored
// lowercased. Aggregate search ids are opaque and keep their case.
function normalizeProviderKey(value: unknown): string {
  return toText(value).slice(0, MAX_KEY_LENGTH).toLowerCase();
}

function normalizeAggregateId(value: unknown): string {
  return toText(value).slice(0, MAX_KEY_LENGTH);
}

function getKeyNormalizer(listId: string): KeyNormalizer {
  return listId === 'aggregate' ? normalizeAggregateId : normalizeProviderKey;
}

function normalizeKeyList(value: unknown, normalize: KeyNormalizer): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  (Array.isArray(value) ? value : []).forEach((item: unknown) => {
    const key = normalize(item);
    if (key && !seen.has(key) && result.length < MAX_LIST_ENTRIES) {
      seen.add(key);
      result.push(key);
    }
  });
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeGroups(value: unknown): string[] {
  const groups = normalizeKeyList(value, (item) => {
    const id = toText(item).toLowerCase();
    return GROUP_IDS.includes(id) ? id : '';
  });
  DEFAULT_GROUP_ORDER.forEach((id) => {
    if (!groups.includes(id)) {
      groups.push(id);
    }
  });
  return groups;
}

// Source types are camelCase ('topSite'), so they match without case and keep
// their canonical spelling.
function toLocalSourceType(value: unknown): string {
  const token = toText(value).toLowerCase();
  return LOCAL_SOURCE_TYPES.find((type) => type.toLowerCase() === token) || '';
}

function normalizeLocal(value: unknown): string[] {
  const local = normalizeKeyList(value, toLocalSourceType);
  LOCAL_SOURCE_TYPES.forEach((type) => {
    if (!local.includes(type)) {
      local.push(type);
    }
  });
  return local;
}

function getRecordBytes(record: SearchSourceOrder): number {
  try {
    return JSON.stringify(record).length + searchSourceOrder.key.length;
  } catch (error) {
    return Number.MAX_SAFE_INTEGER;
  }
}

// Always returns a complete record, so callers never branch on "no order".
// An over-budget record drops entries from the tail of its longest list.
function normalizeOrder(value: unknown): SearchSourceOrder {
  const source: Record<string, unknown> = isRecord(value) && !Array.isArray(value) &&
    Number(value.version) === SCHEMA_VERSION
    ? value
    : {};
  const sourceLists: Record<string, unknown> = isRecord(source.lists) ? source.lists : {};
  const lists: Record<string, string[]> = {};
  LIST_IDS.forEach((listId) => {
    lists[listId] = normalizeKeyList(sourceLists[listId], getKeyNormalizer(listId));
  });
  const record: SearchSourceOrder = {
    version: SCHEMA_VERSION,
    groups: normalizeGroups(source.groups),
    lists,
    local: normalizeLocal(source.local)
  };
  while (getRecordBytes(record) > MAX_RECORD_BYTES) {
    const longest = LIST_IDS.reduce((best, listId) => (
      record.lists[listId].length > record.lists[best].length ? listId : best
    ), LIST_IDS[0]);
    if (!record.lists[longest].length) {
      break;
    }
    record.lists[longest].pop();
  }
  return record;
}

// A record normalizeOrder produced carries its lists; anything else is
// normalized first.
function isNormalizedOrder(value: unknown): value is SearchSourceOrder {
  return isRecord(value) && isRecord(value.lists);
}

function getListKeys(order: unknown, listId: string): string[] {
  const record = isNormalizedOrder(order) ? order : normalizeOrder(order);
  const keys: unknown = record.lists[listId];
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : [];
}

// Items the record lists come first in its order; the rest keep their own
// order after them, so a source added later never displaces a chosen slot.
function sortByKeys<T>(
  items: readonly T[] | null | undefined,
  keys: readonly string[] | null | undefined,
  getKey: (item: T) => unknown,
  normalize: KeyNormalizer
): T[] {
  const list: readonly T[] = Array.isArray(items) ? items : [];
  const rank = new Map<string, number>();
  (Array.isArray(keys) ? keys : []).forEach((key: string, index: number) => {
    if (!rank.has(key)) {
      rank.set(key, index);
    }
  });
  return list
    .map((item, position) => {
      const key = normalize(getKey(item));
      return {
        item,
        position,
        rank: rank.get(key) ?? Number.MAX_SAFE_INTEGER
      };
    })
    .sort((left, right) => left.rank - right.rank || left.position - right.position)
    .map((entry) => entry.item);
}

function sortList<T extends { key?: unknown } | null>(
  items: readonly T[] | null | undefined,
  order: unknown,
  listId: string,
  getKey?: (item: T) => unknown
): T[] {
  return sortByKeys(
    items,
    getListKeys(order, listId),
    getKey || ((item: T) => item && item.key),
    getKeyNormalizer(listId)
  );
}

function sortLocalSourceTypes(sourceTypes: readonly string[] | null | undefined, order?: { local?: unknown } | null): string[] {
  const local: readonly string[] = order && Array.isArray(order.local)
    ? order.local.filter((type): type is string => typeof type === 'string')
    : LOCAL_SOURCE_TYPES;
  return sortByKeys(sourceTypes, local, (type: string) => type, toLocalSourceType);
}

function moveIndex<T>(items: readonly T[] | null | undefined, fromIndex: number, toIndex: number): T[] {
  const list: T[] = Array.isArray(items) ? items.slice() : [];
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return list;
  }
  const [moved] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, moved);
  return list;
}

// Writes a reordered subset back into a full key list: the slots the subset
// occupies stay where they are and take the subset's new order. A subset key
// the full list lacks is appended. Used when only part of a list is on
// screen, such as the custom searches of one panel group.
function applySubsetOrder(fullKeys: readonly string[] | null | undefined, subsetKeys: readonly string[] | null | undefined): string[] {
  const subset: string[] = Array.isArray(subsetKeys) ? subsetKeys.filter(Boolean) : [];
  const inSubset = new Set(subset);
  const full: string[] = (Array.isArray(fullKeys) ? fullKeys : []).filter(Boolean);
  let next = 0;
  const result = full.map((key) => (inSubset.has(key) ? subset[next++] : key));
  const placed = new Set(result);
  subset.forEach((key) => {
    if (!placed.has(key)) {
      result.push(key);
    }
  });
  return result;
}

function withList(order: unknown, listId: string, keys: string[]): SearchSourceOrder {
  const record = normalizeOrder(order);
  record.lists[listId] = keys;
  return normalizeOrder(record);
}

function withGroups(order: unknown, groups: string[]): SearchSourceOrder {
  const record = normalizeOrder(order);
  record.groups = groups;
  return normalizeOrder(record);
}

function withLocal(order: unknown, local: string[]): SearchSourceOrder {
  const record = normalizeOrder(order);
  record.local = local;
  return normalizeOrder(record);
}

// Records a move made on a surface that shows only part of a list (a panel
// group, a Settings list without its disabled built-ins). `knownKeys` is
// every key of the list the surface knows, in its current order;
// `movedKeys` is the reordered part. Keys the record holds but the surface
// cannot see keep their slots.
function applyMove(order: unknown, listId: string, knownKeys: unknown, movedKeys: unknown): SearchSourceOrder {
  const record = normalizeOrder(order);
  const normalize = listId === 'local' ? toLocalSourceType : getKeyNormalizer(listId);
  const stored = listId === 'local' ? record.local : (record.lists[listId] || []);
  const known = normalizeKeyList(knownKeys, normalize);
  const full = stored.concat(known.filter((key) => !stored.includes(key)));
  const next = applySubsetOrder(full, normalizeKeyList(movedKeys, normalize));
  return listId === 'local' ? withLocal(record, next) : withList(record, listId, next);
}

// The record after a tile drag in the search scope panel. The payload is
// what the panel reports: the list, every item of that list it shows (in
// order, after the move) and the moved group of items.
function applyScopeMenuMove(order: unknown, payload?: ScopeMenuMove | null): SearchSourceOrder {
  const move: ScopeMenuMove = payload && typeof payload === 'object' ? payload : {};
  const listId = toText(move.list);
  if (listId !== 'local' && !LIST_IDS.includes(listId)) {
    return normalizeOrder(order);
  }
  const keyOf = (item: { orderKey?: string } | null) => item && item.orderKey;
  return applyMove(
    order,
    listId,
    (Array.isArray(move.listItems) ? move.listItems : []).map(keyOf),
    (Array.isArray(move.movedItems) ? move.movedItems : []).map(keyOf)
  );
}

// Moves one group block up (-1) or down (+1) among the blocks the panel
// shows; blocks it does not show (no aggregate searches yet) keep their slot.
function applyGroupMove(order: unknown, renderedGroups: unknown, group: unknown, delta: number): SearchSourceOrder {
  const record = normalizeOrder(order);
  const shown = normalizeKeyList(renderedGroups, (item) => {
    const id = toText(item).toLowerCase();
    return GROUP_IDS.includes(id) ? id : '';
  });
  const fromIndex = shown.indexOf(toText(group).toLowerCase());
  const toIndex = fromIndex + (Number(delta) < 0 ? -1 : 1);
  if (fromIndex < 0 || toIndex < 0 || toIndex >= shown.length) {
    return record;
  }
  return withGroups(record, applySubsetOrder(record.groups, moveIndex(shown, fromIndex, toIndex)));
}

function isSameOrder(left: unknown, right: unknown): boolean {
  return JSON.stringify(normalizeOrder(left)) === JSON.stringify(normalizeOrder(right));
}

// Undo and redo for the moves one page makes. Each step keeps the record
// before and after the move. A step only applies while storage still holds
// the record it expects; if another page changed the order meanwhile, the
// history no longer describes what is stored and is dropped.
interface HistoryStep {
  before: SearchSourceOrder;
  after: SearchSourceOrder;
}

function createHistory(options?: { limit?: number } | null) {
  const limit = Math.max(1, Number(options && options.limit) || 50);
  const done: HistoryStep[] = [];
  const undone: HistoryStep[] = [];
  function clear() {
    done.length = 0;
    undone.length = 0;
  }
  function step(from: HistoryStep[], to: HistoryStep[], expected: 'before' | 'after', current: unknown): SearchSourceOrder | null {
    const entry = from[from.length - 1];
    if (!entry) {
      return null;
    }
    if (current !== undefined && !isSameOrder(current, entry[expected])) {
      clear();
      return null;
    }
    from.pop();
    to.push(entry);
    return expected === 'after' ? entry.before : entry.after;
  }
  return Object.freeze({
    record(before: unknown, after: unknown) {
      if (isSameOrder(before, after)) {
        return;
      }
      done.push({ before: normalizeOrder(before), after: normalizeOrder(after) });
      if (done.length > limit) {
        done.shift();
      }
      undone.length = 0;
    },
    canUndo: () => done.length > 0,
    canRedo: () => undone.length > 0,
    // `current` is the stored record; leave it out to skip the check.
    undo: (current?: unknown) => step(done, undone, 'after', current),
    redo: (current?: unknown) => step(undone, done, 'before', current),
    clear
  });
}

// Ctrl or Cmd with Z undoes; adding Shift, or Ctrl+Y, redoes. Alt is left
// alone so other shortcuts keep working.
function getHistoryShortcut(
  event: { altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; key?: string } | null | undefined
): HistoryShortcut {
  if (!event || event.altKey || !(event.metaKey || event.ctrlKey)) {
    return '';
  }
  const key = String(event.key || '').toLowerCase();
  if (key === 'z') {
    return event.shiftKey ? 'redo' : 'undo';
  }
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return 'redo';
  }
  return '';
}

// Orders the search scope panel: group blocks in the chosen order, then
// pinned and custom entries ahead of built-in ones (as they always were),
// then the chosen position inside each list, then the surface's own order.
// `getList` returns 'custom', a list id, 'local', or 'pinned' for an entry
// that leads its block and is not reorderable.
interface ScopeItem {
  groupKey?: unknown;
  orderList?: unknown;
  orderKey?: unknown;
}

function rankScopeItems<T extends ScopeItem | null>(
  items: readonly T[] | null | undefined,
  order: unknown,
  options?: RankScopeOptions<T> | null
): T[] {
  const list: readonly T[] = Array.isArray(items) ? items : [];
  const settings: RankScopeOptions<T> = options && typeof options === 'object' ? options : {};
  const record = normalizeOrder(order);
  const groupRank = new Map(record.groups.map((group, index) => [group, index]));
  const getGroup = settings.getGroup || ((item: T) => item && item.groupKey);
  const getList = settings.getList || ((item: T) => item && item.orderList);
  const getKey = settings.getKey || ((item: T) => item && item.orderKey);
  const keyRanks: Record<string, Map<string, number>> = {};
  const getKeyRank = (listId: string, key: unknown): number => {
    if (!keyRanks[listId]) {
      const keys = listId === 'local' ? record.local : (record.lists[listId] || []);
      keyRanks[listId] = new Map(keys.map((entry, index) => [entry, index]));
    }
    const normalized = listId === 'local'
      ? toLocalSourceType(key)
      : getKeyNormalizer(listId)(key);
    const ranks = keyRanks[listId];
    return ranks.get(normalized) ?? Number.MAX_SAFE_INTEGER;
  };
  return list
    .map((item, position) => {
      const group = toText(getGroup(item)).toLowerCase();
      const listId = toText(getList(item));
      return {
        item,
        position,
        groupRank: groupRank.get(group) ?? Number.MAX_SAFE_INTEGER,
        tier: listId === 'pinned' || listId === 'custom' ? 0 : 1,
        keyRank: listId && listId !== 'pinned' ? getKeyRank(listId, getKey(item)) : -1
      };
    })
    .sort((left, right) => (
      left.groupRank - right.groupRank ||
      left.tier - right.tier ||
      left.keyRank - right.keyRank ||
      left.position - right.position
    ))
    .map((entry) => entry.item);
}

export {
  SCHEMA_VERSION,
  GROUP_IDS,
  DEFAULT_GROUP_ORDER,
  LIST_IDS,
  LOCAL_SOURCE_TYPES,
  MAX_LIST_ENTRIES,
  MAX_RECORD_BYTES,
  applyGroupMove,
  applyMove,
  applyScopeMenuMove,
  applySubsetOrder,
  createHistory,
  getHistoryShortcut,
  getListKeys,
  isSameOrder,
  moveIndex,
  normalizeOrder,
  rankScopeItems,
  sortByKeys,
  sortList,
  sortLocalSourceTypes,
  toLocalSourceType,
  withGroups,
  withList,
  withLocal
};
export type { ScopeMenuMove, SearchSourceOrder };
