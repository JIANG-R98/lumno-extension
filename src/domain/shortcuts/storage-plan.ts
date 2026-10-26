// Shortcuts are stored as one state: ordered groups, and ordered items that
// each name their group. Browser sync holds a compact copy of that state in
// three keys under a fixed byte ceiling; whatever does not fit stays in this
// device's local overflow record, which WebDAV carries between devices.
import { DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES, DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES, DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES, DEFAULT_SYNC_QUOTA_BYTES, LEGACY_SHORTCUTS_CHUNK_KEYS, LEGACY_SHORTCUTS_RETENTION_MS, SHORTCUTS_STORAGE_VERSION, SHORTCUTS_SYNC_KEYS } from './constants';
import { getBudget, getNow, getShortcutStorageItemByteSize, getShortcutStoragePayloadByteSize, getUtf8ByteLength, isRecord, isUnknownArray, normalizeShortcutState, normalizeShortcuts, randomToken } from './normalize';
import { encodeEntry, readShortcutSyncValues } from './sync-encoding';
import type { OverflowRead, ShortcutNormalizeOptions, ShortcutOverflowRecord, ShortcutState, ShortcutStateRead, ShortcutStoragePlan, ShortcutStoragePlanOptions, ShortcutSyncBudgetInput, ShortcutSyncChunk, ShortcutSyncHead, ShortcutSyncSummary, ShortcutSyncUsage } from './types';

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
  createAuthoritativeOverflowRecord,
  createShortcutStoragePlan,
  getShortcutSyncBudget,
  measureShortcutSyncUsage,
  normalizeOverflowRecord,
  readShortcutState,
  summarizeShortcutSync
};
