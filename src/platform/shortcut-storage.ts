// Loading and saving the shortcut state in the extension's storage: one
// area, or browser sync with the local overflow record beside it.
import type { StorageItems } from '../domain/storage-port';
import type { StorageChromeApi } from './settings-storage';
import { newtabShortcutsLocalOverflow } from '../domain/settings/newtab-shortcuts';
import { SHORTCUT_STORAGE_KEYS } from '../domain/shortcuts/constants';
import { createAuthoritativeOverflowRecord, createShortcutStoragePlan, readShortcutState } from '../domain/shortcuts/storage-plan';
import type { GroupedShortcutItem, ShortcutNormalizeOptions, ShortcutStateRead, ShortcutStoragePlan, ShortcutStoragePlanOptions } from '../domain/shortcuts/types';

// An area that answers like chrome.storage: through the callback, or
// through the promise it returns. A missing method reads as empty or
// writes nothing.
interface ShortcutStorageArea {
  get?(keys: string[], callback: (items: unknown) => void): unknown;
  set?(items: StorageItems, callback: () => void): unknown;
  remove?(keys: string[], callback: () => void): unknown;
}

type StorageLastError = { message?: string } | null | undefined;

interface ShortcutWriteOptions {
  // Where a callback-style area reports its error; chrome.runtime.lastError
  // when absent.
  getLastError?: () => StorageLastError;
}

interface ShortcutSaveOptions extends ShortcutStoragePlanOptions, ShortcutWriteOptions {
  // Save a state that does not fit the byte budgets with its tail cut off
  // instead of refusing it.
  allowOverflow?: boolean;
}

interface ShortcutItemsSaveOptions extends ShortcutSaveOptions {
  // Groups to save instead of the stored ones.
  groups?: unknown;
}

interface ShortcutPersistOptions extends ShortcutStoragePlanOptions, ShortcutWriteOptions {
  // Where the entries that do not fit go; without it every entry is written
  // to the given area.
  overflowArea?: ShortcutStorageArea | null;
}

interface ShortcutPersistResult {
  state: ShortcutStoragePlan['state'];
  plan: ShortcutStoragePlan;
  // Entries only this device keeps.
  localOnlyIds: string[];
  syncLimited: boolean;
  // Why browser sync refused the state, which then went to the local record.
  syncError?: unknown;
}

type ShortcutStorageErrorCode = 'SHORTCUT_STORAGE_WRITE_FAILED' | 'SHORTCUT_SYNC_QUOTA_EXCEEDED';

class ShortcutStorageError extends Error {
  code: ShortcutStorageErrorCode;

  constructor(message: string, code: ShortcutStorageErrorCode) {
    super(message);
    this.code = code;
  }
}

// Refused because the state does not fit the sync byte budgets.
class ShortcutQuotaError extends ShortcutStorageError {
  plan: ShortcutStoragePlan;

  constructor(plan: ShortcutStoragePlan) {
    super('Shortcut sync quota exceeded', 'SHORTCUT_SYNC_QUOTA_EXCEEDED');
    this.plan = plan;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && 'then' in value && typeof value.then === 'function';
}

function storageGet(storage: ShortcutStorageArea | null | undefined, keys: readonly string[]): Promise<StorageItems> {
  return new Promise((resolve) => {
    const get = storage && storage.get;
    if (!storage || typeof get !== 'function') {
      resolve({});
      return;
    }
    let settled = false;
    const finish = (result: unknown): void => {
      if (settled) return;
      settled = true;
      resolve(isRecord(result) ? result : {});
    };
    try {
      const maybePromise = get.call(storage, keys.slice(), finish);
      if (isThenable(maybePromise)) {
        maybePromise.then(finish, () => finish({}));
      }
    } catch (_error) {
      finish({});
    }
  });
}

function getStorageLastError(options: ShortcutWriteOptions | null | undefined): StorageLastError {
  if (options && typeof options.getLastError === 'function') {
    return options.getLastError() || null;
  }
  const chromeApi: StorageChromeApi | undefined = typeof globalThis !== 'undefined' ? globalThis.chrome : undefined;
  return chromeApi && chromeApi.runtime && chromeApi.runtime.lastError
    ? chromeApi.runtime.lastError
    : null;
}

function createStorageError(error: unknown, fallbackMessage?: string): ShortcutStorageError {
  const message = isRecord(error) && error.message
    ? String(error.message)
    : String(fallbackMessage || 'Shortcut storage write failed');
  return new ShortcutStorageError(message, 'SHORTCUT_STORAGE_WRITE_FAILED');
}

// Runs one write and settles once it finished, with the error the area
// reported.
function runWrite(
  options: ShortcutWriteOptions | null | undefined,
  start: (done: () => void) => unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(createStorageError(error));
        return;
      }
      resolve();
    };
    try {
      const maybePromise = start(() => {
        finish(getStorageLastError(options));
      });
      if (isThenable(maybePromise)) {
        maybePromise.then(() => finish(null), finish);
      }
    } catch (error) {
      finish(error);
    }
  });
}

function storageSet(
  storage: ShortcutStorageArea | null | undefined,
  items: StorageItems,
  options?: ShortcutWriteOptions | null
): Promise<void> {
  const set = storage && storage.set;
  if (!storage || typeof set !== 'function') {
    return Promise.resolve();
  }
  return runWrite(options, (done) => set.call(storage, items, done));
}

function storageRemove(
  storage: ShortcutStorageArea | null | undefined,
  keys: string[],
  options?: ShortcutWriteOptions | null
): Promise<void> {
  const remove = storage && storage.remove;
  if (!storage || typeof remove !== 'function') {
    return Promise.resolve();
  }
  return runWrite(options, (done) => remove.call(storage, keys, done));
}

function loadShortcutState(
  storage: ShortcutStorageArea | null | undefined,
  options?: ShortcutNormalizeOptions | null
): Promise<ShortcutStateRead> {
  return storageGet(storage, SHORTCUT_STORAGE_KEYS).then((values) => readShortcutState(values, null, options));
}

function loadShortcuts(
  storage: ShortcutStorageArea | null | undefined,
  options?: ShortcutNormalizeOptions | null
): Promise<GroupedShortcutItem[]> {
  return loadShortcutState(storage, options).then((state) => state.items);
}

function saveShortcutStoragePlan(
  storage: ShortcutStorageArea | null | undefined,
  plan: ShortcutStoragePlan,
  options?: ShortcutWriteOptions | null
): Promise<ShortcutStoragePlan> {
  return storageSet(storage, plan.payload, options).then(() => plan);
}

// Writes a whole state to one storage area. Without allowOverflow a state
// that does not fit the byte budgets is refused instead of cut short.
function saveShortcutState(
  storage: ShortcutStorageArea | null | undefined,
  state: unknown,
  options?: ShortcutSaveOptions | null
): Promise<ShortcutStoragePlan['state']> {
  const opts = options && typeof options === 'object' ? options : {};
  const plan = createShortcutStoragePlan(state, opts);
  if (plan.overflowItems.length > 0 && opts.allowOverflow !== true) {
    return Promise.reject(new ShortcutQuotaError(plan));
  }
  return saveShortcutStoragePlan(storage, plan, opts).then(() => plan.state);
}

// Saves items while keeping the stored groups.
function saveShortcuts(
  storage: ShortcutStorageArea | null | undefined,
  items: unknown,
  options?: ShortcutItemsSaveOptions | null
): Promise<GroupedShortcutItem[]> {
  const opts = options && typeof options === 'object' ? options : {};
  return loadShortcutState(storage, opts).then((current) => saveShortcutState(storage, {
    groups: opts.groups || current.groups,
    items,
    migratedAt: current.migratedAt
  }, opts)).then((state) => state.items);
}

function getIds(items: readonly GroupedShortcutItem[]): string[] {
  return items.map((item) => String(item.id || ''));
}

// Saves a state to browser sync with the rest in the local overflow record.
// When the sync write fails, the overflow record becomes the authoritative
// copy of the whole state on this device. Without an overflow area every
// item is written to the given area.
function persistShortcutState(
  storage: ShortcutStorageArea | null | undefined,
  state: unknown,
  options?: ShortcutPersistOptions | null
): Promise<ShortcutPersistResult> {
  const opts = options && typeof options === 'object' ? options : {};
  const overflowArea = opts.overflowArea || null;
  const unlimited = { maxItemBytes: Number.MAX_SAFE_INTEGER, maxTotalBytes: Number.MAX_SAFE_INTEGER };
  const plan = createShortcutStoragePlan(state, overflowArea ? opts : { ...opts, ...unlimited });
  if (!overflowArea) {
    return saveShortcutStoragePlan(storage, plan, opts).then(() => ({
      state: plan.state, plan, localOnlyIds: [], syncLimited: false
    }));
  }
  return storageSet(overflowArea, { [newtabShortcutsLocalOverflow.key]: plan.overflowRecord }, opts)
    .then(() => saveShortcutStoragePlan(storage, plan, opts))
    .then(() => (plan.removeKeys.length
      ? storageRemove(storage, plan.removeKeys, opts).catch(() => {})
      : null))
    .then((): ShortcutPersistResult => ({
      state: plan.state,
      plan,
      localOnlyIds: getIds(plan.overflowItems),
      syncLimited: plan.overflowItems.length > 0
    }))
    .catch((syncError: unknown) => storageSet(overflowArea, {
      [newtabShortcutsLocalOverflow.key]: createAuthoritativeOverflowRecord(plan.state)
    }, opts).then((): ShortcutPersistResult => ({
      state: plan.state,
      plan,
      localOnlyIds: getIds(plan.state.items),
      syncError,
      syncLimited: true
    })));
}

export {
  ShortcutQuotaError,
  ShortcutStorageError,
  loadShortcutState,
  loadShortcuts,
  persistShortcutState,
  saveShortcutState,
  saveShortcuts
};
export type {
  ShortcutItemsSaveOptions,
  ShortcutPersistOptions,
  ShortcutPersistResult,
  ShortcutSaveOptions,
  ShortcutStorageArea,
  ShortcutStorageErrorCode,
  ShortcutWriteOptions
};
