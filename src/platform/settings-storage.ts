// Reading and writing settings in the extension's storage: one-shot reads
// and writes with the sync quota's retry, the batched startup read and its
// prefetch, the area provider-scoped settings live in (local-primary mode),
// copying local settings into sync, writing back repaired values, and the
// copies pages keep in localStorage for their next load.
import {
  LOCAL_PRIMARY_STORAGE_KEY,
  NEWTAB_INPUT_AUTO_FOCUS_CACHE_KEY,
  NEWTAB_LOCALE_CACHE_KEY,
  NEWTAB_SHORTCUTS_V2_STORAGE_KEYS,
  normalizeLocale,
  normalizeMotionEffectsEnabled,
  normalizeNewtabInputAutoFocusEnabled
} from '../domain/settings';
import type {
  StorageAreaLike,
  StorageChangeEventLike,
  StorageChangeListener,
  StorageChanges,
  StorageItems,
  StorageKeys
} from '../domain/storage-port';

// The parts of the extension API these helpers use.
interface StorageChromeApi {
  runtime?: { lastError?: { message?: string } | null };
  storage?: {
    local?: StorageAreaLike;
    sync?: StorageAreaLike;
    onChanged?: StorageChangeEventLike;
  };
}

type AreaName = 'sync' | 'local' | '';

type StorageMethod = 'get' | 'set' | 'remove' | 'clear';

// Called with the operation's result, and with its error when it failed
// (Chrome also leaves the error in runtime.lastError meanwhile). A failed
// read has no result.
type FacadeCallback<R> = (result: R | undefined, error?: Error) => void;

// An area that answers like chrome.storage: with a callback, or a promise
// when there is none. With a callback the promise still settles, with no
// result when the operation failed.
interface StorageAreaFacade {
  get(keys?: StorageKeys | FacadeCallback<StorageItems>, callback?: FacadeCallback<StorageItems>): Promise<StorageItems | undefined>;
  set(items: StorageItems, callback?: FacadeCallback<void>): Promise<void>;
  remove(keys: string | string[], callback?: FacadeCallback<void>): Promise<void>;
  clear(callback?: FacadeCallback<void>): Promise<void>;
}

// The area provider-scoped settings live in, and which one that is.
interface ProviderStorageRuntime {
  area: StorageAreaFacade;
  readonly name: AreaName;
  ready: Promise<AreaName>;
  getActiveAreaName(): AreaName;
  isActiveAreaName(areaName: unknown): boolean;
  isModeKnown(): boolean;
}

interface RetryOptions {
  retryDelayMs?: number;
}

interface ProviderStorageOptions extends RetryOptions {
  modeRetryDelaysMs?: number[];
}

interface ReadBatchMetrics {
  keys: readonly string[] | null;
  keyCount: number | null;
  requestCount: number;
  underlyingReadCount: number;
}

interface StorageReadBatch {
  area: {
    clear(callback?: () => void): unknown;
    get(keys?: StorageKeys | ((items: StorageItems | undefined) => void), callback?: (items: StorageItems | undefined) => void): unknown;
    remove(keys: string | string[], callback?: () => void): unknown;
    set(items: StorageItems, callback?: () => void): unknown;
  };
  flush(): void;
  ready: Promise<ReadBatchMetrics>;
}

interface ReadPrefetch {
  keys: Set<string>;
  stale: boolean;
  result: Promise<StorageItems | null>;
  release: () => void;
}

// What window.matchMedia answers for the reduced-motion query.
interface MotionWindow {
  matchMedia?: (query: string) => { matches: boolean };
}

declare global {
  // One provider storage runtime per extension API object, kept on the page:
  // the background re-injects content bundles with fresh module instances,
  // which should still reuse the runtime (and its storage listener).
  var __lumnoProviderStorageRuntimes: WeakMap<object, ProviderStorageRuntime> | undefined;
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message || error);
  }
  return String(error || '');
}

// A storage answer: an object of values by key.
function isStorageItems(value: unknown): value is StorageItems {
  return Boolean(value) && typeof value === 'object';
}

function toError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(errorMessage(error) || fallbackMessage);
}

// Copies settings this device saved locally into sync where sync has none.
// Sync is read again just before writing so a value another device synced
// meanwhile is never overwritten. The grouped shortcut keys move as one
// save keyed off their head: all of them while sync lacks a head (replacing
// any stray chunk there), none once it has one. Nothing is ever removed.
function migrateLocalSettingsToSync(localArea: StorageAreaLike, syncArea: StorageAreaLike, keys: string[]): void {
  const [groupHeadKey] = NEWTAB_SHORTCUTS_V2_STORAGE_KEYS;
  const isGroupKey = (key: string) => NEWTAB_SHORTCUTS_V2_STORAGE_KEYS.includes(key);
  localArea.get(keys, (localItems) => {
    // A failed read has no items: nothing to copy then.
    const localResult = localItems || {};
    const hasLocal = keys.some((key) => typeof localResult[key] !== 'undefined');
    if (!hasLocal) {
      return;
    }
    syncArea.get(keys, (syncItems) => {
      if (!syncItems) {
        return;
      }
      const syncResult = syncItems;
      const groupMissing = typeof localResult[groupHeadKey] !== 'undefined'
        && typeof syncResult[groupHeadKey] === 'undefined';
      const missingSyncValues: StorageItems = {};
      keys.forEach((key) => {
        if (typeof localResult[key] === 'undefined') {
          return;
        }
        const missing = isGroupKey(key) ? groupMissing : typeof syncResult[key] === 'undefined';
        if (missing) {
          missingSyncValues[key] = localResult[key];
        }
      });
      const missingKeys = Object.keys(missingSyncValues);
      if (missingKeys.length === 0) {
        return;
      }
      syncArea.get(missingKeys, (latestSyncItems) => {
        if (!latestSyncItems) {
          return;
        }
        const latestSyncResult = latestSyncItems;
        const groupStillMissing = typeof latestSyncResult[groupHeadKey] === 'undefined';
        const stillMissingSyncValues: StorageItems = {};
        missingKeys.forEach((key) => {
          const missing = isGroupKey(key)
            ? groupStillMissing
            : typeof latestSyncResult[key] === 'undefined';
          if (missing) {
            stillMissingSyncValues[key] = missingSyncValues[key];
          }
        });
        if (Object.keys(stillMissingSyncValues).length > 0) {
          syncArea.set(stillMissingSyncValues);
        }
      });
    });
  });
}

// Writes back the normalized values a page settled on after reading
// `stored` from `area`. An invalid value is replaced at once. A missing one
// is only filled with its default when this device has no local copy: that
// copy is on its way in through migrateLocalSettingsToSync, and a default
// written first would make the migration keep the default instead.
function writeSettingRepairs(
  chromeApi: StorageChromeApi | null | undefined,
  area: StorageAreaLike | null | undefined,
  repairs: StorageItems | null | undefined,
  stored: StorageItems | null | undefined
): void {
  if (!area || typeof area.set !== 'function') {
    return;
  }
  const values: StorageItems = repairs || {};
  const keys = Object.keys(values);
  const isMissing = (key: string) => !stored || typeof stored[key] === 'undefined';
  const write = (list: string[]) => {
    if (list.length > 0) {
      area.set(Object.fromEntries(list.map((key) => [key, values[key]])));
    }
  };
  write(keys.filter((key) => !isMissing(key)));
  const missing = keys.filter(isMissing);
  const localArea = chromeApi && chromeApi.storage ? chromeApi.storage.local : null;
  if (missing.length === 0) {
    return;
  }
  if (!localArea || localArea === area || typeof localArea.get !== 'function') {
    write(missing);
    return;
  }
  try {
    localArea.get(missing, (localResult) => {
      const failed = Boolean(chromeApi && chromeApi.runtime && chromeApi.runtime.lastError) || !localResult;
      write(missing.filter((key) => failed || typeof localResult[key] === 'undefined'));
    });
  } catch (error) {
    write(missing);
  }
}

// newtab-focus-entry.ts reads this copy to route a new tab before storage answers.
function cacheNewtabInputAutoFocusEnabled(value: unknown): void {
  try {
    const localStorageObj = globalThis.localStorage;
    const next = normalizeNewtabInputAutoFocusEnabled(value) ? 'true' : 'false';
    if (localStorageObj && localStorageObj.getItem(NEWTAB_INPUT_AUTO_FOCUS_CACHE_KEY) !== next) {
      localStorageObj.setItem(NEWTAB_INPUT_AUTO_FOCUS_CACHE_KEY, next);
    }
  } catch (_error) {
    // The copy is only a fast path; the focus entry falls back to reading storage.
  }
}

// newtab-storage-prefetch.ts fetches this locale's messages before newtab.js asks for them.
function cacheNewtabLocale(locale: unknown): void {
  try {
    const localStorageObj = globalThis.localStorage;
    const next = normalizeLocale(locale);
    if (localStorageObj && localStorageObj.getItem(NEWTAB_LOCALE_CACHE_KEY) !== next) {
      localStorageObj.setItem(NEWTAB_LOCALE_CACHE_KEY, next);
    }
  } catch (_error) {
    // The copy is only a fast path; newtab.js fetches the messages itself without it.
  }
}

function shouldSkipEntryMotion(windowRef: MotionWindow | null | undefined, motionEffectsEnabled: unknown): boolean {
  if (!normalizeMotionEffectsEnabled(motionEffectsEnabled)) {
    return true;
  }
  return Boolean(
    windowRef &&
    typeof windowRef.matchMedia === 'function' &&
    windowRef.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function readStorageValue(
  storageArea: StorageAreaLike | null | undefined,
  chromeApi: StorageChromeApi | null | undefined,
  key: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!storageArea || typeof storageArea.get !== 'function') {
      resolve(undefined);
      return;
    }
    let settled = false;
    const finish = (error: unknown, result?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      if (!isStorageItems(result)) {
        reject(new Error('storage-read-failed'));
        return;
      }
      resolve(result[key]);
    };
    const callback = (result: StorageItems | undefined) => {
      const runtimeError = chromeApi && chromeApi.runtime
        ? chromeApi.runtime.lastError
        : null;
      finish(
        runtimeError
          ? new Error(String(runtimeError.message || 'storage-read-failed'))
          : null,
        result
      );
    };
    try {
      const maybePromise = storageArea.get([key], callback);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((result) => finish(null, result)).catch((error: unknown) => finish(error));
      }
    } catch (error) {
      finish(error);
    }
  });
}

// chrome.storage.sync refuses a burst of writes (dragging a slider, several
// pages saving at once) with an error naming the exhausted quota. Its
// buckets refill about one write every two seconds, so a single later
// attempt goes through unless the burst keeps going.
const STORAGE_RATE_LIMIT_RETRY_MS = 2500;
const STORAGE_RATE_LIMIT_PATTERN = /MAX_(?:SUSTAINED_)?WRITE_OPERATIONS_PER_(?:MINUTE|HOUR)/;
// Chrome's answer to a content script reading an area restricted to trusted
// contexts. It holds for the life of the context, so retrying cannot help.
const STORAGE_ACCESS_DENIED_PATTERN = /Access to storage is not allowed from this context/i;
function isStorageRateLimitError(error: unknown): boolean {
  return STORAGE_RATE_LIMIT_PATTERN.test(errorMessage(error));
}
function getStorageRetryDelay(options?: RetryOptions | null): number {
  const delay = options && Number(options.retryDelayMs);
  return typeof delay === 'number' && Number.isFinite(delay) && delay >= 0 ? delay : STORAGE_RATE_LIMIT_RETRY_MS;
}
// Provider areas retry refused bursts themselves; wrapping one must not
// retry the same write twice.
const rateLimitRetryingAreas = new WeakSet<object>();

function writeStorageValues(
  storageArea: StorageAreaLike | StorageAreaFacade | null | undefined,
  chromeApi: StorageChromeApi | null | undefined,
  values: unknown,
  options?: RetryOptions | null
): Promise<StorageItems> {
  const payload: StorageItems = isStorageItems(values) && !Array.isArray(values)
    ? { ...values }
    : {};
  const retryDelayMs = getStorageRetryDelay(options);
  return new Promise((resolve, reject) => {
    if (!storageArea || typeof storageArea.set !== 'function') {
      resolve(payload);
      return;
    }
    const area = storageArea;
    let retries = rateLimitRetryingAreas.has(area) ? 0 : 1;
    const attempt = () => {
      let settled = false;
      const finish = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        if (error && retries > 0 && isStorageRateLimitError(error)) {
          retries -= 1;
          setTimeout(attempt, retryDelayMs);
          return;
        }
        if (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        resolve(payload);
      };
      const callback = () => {
        const runtimeError = chromeApi && chromeApi.runtime
          ? chromeApi.runtime.lastError
          : null;
        finish(runtimeError
          ? new Error(String(runtimeError.message || 'storage-write-failed'))
          : null);
      };
      try {
        const maybePromise = area.set(payload, callback);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(() => {
            Promise.resolve().then(() => finish(null));
          }).catch(finish);
        }
      } catch (error) {
        finish(error);
      }
    };
    attempt();
  });
}

function writeStorageValue<T>(
  storageArea: StorageAreaLike | StorageAreaFacade | null | undefined,
  chromeApi: StorageChromeApi | null | undefined,
  key: string,
  value: T
): Promise<T> {
  return writeStorageValues(storageArea, chromeApi, { [key]: value })
    .then(() => value);
}

const storageReadPrefetches = new WeakMap<object, ReadPrefetch>();

// Starts a read before the page's scripts have loaded. The batch created later for the same area
// takes the result when it covers every requested key and none of them changed in the meantime.
function prefetchStorageRead(
  area: StorageAreaLike | StorageAreaFacade | null | undefined,
  keys: unknown,
  chromeApi: StorageChromeApi | null | undefined
): boolean {
  const onChanged = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
  if (!area || typeof area.get !== 'function' || !Array.isArray(keys) || !keys.length ||
      !onChanged || typeof onChanged.addListener !== 'function') {
    return false;
  }
  const keySet = new Set(keys.map(String));
  const markStale: StorageChangeListener = (changes) => {
    if (Object.keys(changes || {}).some((key) => keySet.has(key))) prefetch.stale = true;
  };
  onChanged.addListener(markStale);
  const prefetch: ReadPrefetch = {
    keys: keySet,
    stale: false,
    release: () => {
      if (typeof onChanged.removeListener === 'function') onChanged.removeListener(markStale);
    },
    result: new Promise<StorageItems | null>((resolve) => {
      let settled = false;
      const finish = (value: unknown) => {
        if (settled) return;
        settled = true;
        resolve(isStorageItems(value) ? value : null);
      };
      try {
        const maybePromise = area.get(Array.from(keySet), finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish, () => finish(null));
        }
      } catch (_error) {
        finish(null);
      }
    })
  };
  storageReadPrefetches.set(area, prefetch);
  return true;
}

interface ReadRequest {
  callback: ((items: StorageItems | undefined) => void) | null;
  keys: StorageKeys | undefined;
  resolve: ((items: StorageItems) => void) | null;
}

// Gathers the reads a page makes while it starts into one storage read.
function createStorageReadBatch(area: StorageAreaLike | null | undefined): StorageReadBatch | null {
  if (!area || typeof area.get !== 'function') {
    return null;
  }
  const source = area;
  let acceptingReads = true;
  let flushScheduled = false;
  let includesAllKeys = false;
  let requests: ReadRequest[] = [];
  const requestedKeys = new Set<string>();
  let resolveReady: (metrics: ReadBatchMetrics) => void = () => {};
  const ready = new Promise<ReadBatchMetrics>((resolve) => {
    resolveReady = resolve;
  });

  function collectRequestKeys(keys: StorageKeys | undefined) {
    if (keys === null || typeof keys === 'undefined') {
      includesAllKeys = true;
      return;
    }
    if (typeof keys === 'string') {
      requestedKeys.add(keys);
      return;
    }
    if (Array.isArray(keys)) {
      keys.forEach((key) => requestedKeys.add(String(key)));
      return;
    }
    if (typeof keys === 'object') {
      Object.keys(keys).forEach((key) => requestedKeys.add(key));
    }
  }

  function selectRequestResult(values: StorageItems, keys: StorageKeys | undefined): StorageItems {
    if (keys === null || typeof keys === 'undefined') {
      return values;
    }
    if (typeof keys === 'object' && !Array.isArray(keys)) {
      const result: StorageItems = { ...keys };
      Object.keys(keys).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          result[key] = values[key];
        }
      });
      return result;
    }
    const list = Array.isArray(keys) ? keys : [keys];
    const result: StorageItems = {};
    list.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        result[key] = values[key];
      }
    });
    return result;
  }

  function flush() {
    if (!acceptingReads) {
      return;
    }
    acceptingReads = false;
    flushScheduled = false;
    const pending = requests;
    requests = [];
    const keys = includesAllKeys ? null : Array.from(requestedKeys);
    let settled = false;
    const finish = (rawResult: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      const result: StorageItems = isStorageItems(rawResult) ? rawResult : {};
      const callbackErrors: unknown[] = [];
      pending.forEach((request) => {
        const selected = selectRequestResult(result, request.keys);
        try {
          if (request.callback) {
            request.callback(selected);
          } else if (request.resolve) {
            request.resolve(selected);
          }
        } catch (error) {
          callbackErrors.push(error);
        }
      });
      resolveReady(Object.freeze({
        keys: keys === null ? null : Object.freeze(keys.slice()),
        keyCount: keys === null ? null : keys.length,
        requestCount: pending.length,
        underlyingReadCount: 1
      }));
      callbackErrors.forEach((error) => {
        Promise.resolve().then(() => {
          throw error;
        });
      });
    };
    const readArea = () => {
      try {
        const maybePromise = source.get(keys, finish);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(finish).catch(() => finish({}));
        }
      } catch (error) {
        finish({});
      }
    };
    const prefetch = storageReadPrefetches.get(source);
    storageReadPrefetches.delete(source);
    if (!prefetch) {
      readArea();
      return;
    }
    if (keys === null || !keys.every((key) => prefetch.keys.has(key))) {
      prefetch.release();
      readArea();
      return;
    }
    prefetch.result.then((value) => {
      prefetch.release();
      if (value && !prefetch.stale) finish(value);
      else readArea();
    });
  }

  // Like chrome.storage get: (keys, callback), (callback), or (keys) for a promise.
  function get(
    keysOrCallback?: StorageKeys | ((items: StorageItems | undefined) => void),
    maybeCallback?: (items: StorageItems | undefined) => void
  ): unknown {
    let keys: StorageKeys | undefined;
    let callback = maybeCallback;
    if (typeof keysOrCallback === 'function' && typeof callback === 'undefined') {
      callback = keysOrCallback;
      keys = null;
    } else if (typeof keysOrCallback !== 'function') {
      keys = keysOrCallback;
    }
    if (!acceptingReads) {
      return source.get(keys === undefined ? null : keys, callback);
    }
    let resolveRequest: ((items: StorageItems) => void) | null = null;
    const promise = typeof callback === 'function'
      ? undefined
      : new Promise<StorageItems>((resolve) => {
          resolveRequest = resolve;
        });
    requests.push({
      callback: typeof callback === 'function' ? callback : null,
      keys,
      resolve: resolveRequest
    });
    collectRequestKeys(keys);
    if (!flushScheduled) {
      flushScheduled = true;
      Promise.resolve().then(flush);
    }
    return promise;
  }

  return Object.freeze({
    area: Object.freeze({
      clear(callback?: () => void) {
        return typeof source.clear === 'function' ? source.clear(callback) : undefined;
      },
      get,
      remove(keys: string | string[], callback?: () => void) {
        return typeof source.remove === 'function' ? source.remove(keys, callback) : undefined;
      },
      set(items: StorageItems, callback?: () => void) {
        return source.set(items, callback);
      }
    }),
    flush,
    ready
  });
}

const providerStorageRuntimes: WeakMap<object, ProviderStorageRuntime> = globalThis.__lumnoProviderStorageRuntimes ||
  (globalThis.__lumnoProviderStorageRuntimes = new WeakMap());

// Reading the local-primary flag picks the area every setting comes from,
// so a failed read is retried instead of silently choosing browser sync.
const MODE_READ_RETRY_DELAYS_MS = [100, 400, 1600];

function createProviderStorageRuntime(
  chromeApi: StorageChromeApi | null | undefined,
  options?: ProviderStorageOptions | null
): ProviderStorageRuntime {
  const known = chromeApi ? providerStorageRuntimes.get(chromeApi) : undefined;
  if (known) {
    return known;
  }
  const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
  const syncArea = storage && storage.sync ? storage.sync : null;
  const localArea = storage && storage.local ? storage.local : syncArea;
  const retryDelayMs = getStorageRetryDelay(options);
  const modeRetryDelays = options && Array.isArray(options.modeRetryDelaysMs)
    ? options.modeRetryDelaysMs : MODE_READ_RETRY_DELAYS_MS;
  let activeAreaName: AreaName = syncArea ? 'sync' : (localArea ? 'local' : '');
  let observedModeChange = false;
  let modeKnown = true;
  const modeReady = new Promise<AreaName>((resolve) => {
    if (!localArea || typeof localArea.get !== 'function') {
      resolve(activeAreaName);
      return;
    }
    const modeArea = localArea;
    const readMode = (attempt: number) => {
      let settled = false;
      const finish = (result: StorageItems | null | undefined, error?: unknown) => {
        if (settled) return;
        settled = true;
        const lastError = error || (chromeApi && chromeApi.runtime && chromeApi.runtime.lastError);
        if (lastError && !observedModeChange) {
          const accessDenied = STORAGE_ACCESS_DENIED_PATTERN.test(errorMessage(lastError));
          if (!accessDenied && attempt < modeRetryDelays.length) {
            setTimeout(() => readMode(attempt + 1), modeRetryDelays[attempt]);
            return;
          }
          // Still unreadable: keep the default, but say so, so callers that
          // would copy settings elsewhere can refuse instead of guessing.
          modeKnown = false;
          try { console.warn('[Lumno] Could not read the settings storage mode.', lastError); } catch (_error) { /* ignore */ }
        }
        if (!lastError && !observedModeChange && result && result[LOCAL_PRIMARY_STORAGE_KEY] === true) activeAreaName = 'local';
        resolve(activeAreaName);
      };
      try {
        const pending = modeArea.get([LOCAL_PRIMARY_STORAGE_KEY], (result) => finish(result));
        if (pending && typeof pending.then === 'function') {
          pending.then((result) => finish(result)).catch((error: unknown) => finish(null, error || new Error('storage-read-failed')));
        }
      } catch (error) { finish(null, error); }
    };
    readMode(0);
  });
  const onChanged = storage && storage.onChanged;
  if (onChanged && typeof onChanged.addListener === 'function') {
    onChanged.addListener((changes: StorageChanges, areaName: string) => {
      if (areaName === 'local' && changes[LOCAL_PRIMARY_STORAGE_KEY]) {
        observedModeChange = true;
        modeKnown = true;
        activeAreaName = changes[LOCAL_PRIMARY_STORAGE_KEY].newValue === true
          ? 'local' : (syncArea ? 'sync' : 'local');
      }
    });
  }

  function getActiveArea(): StorageAreaLike | null {
    return activeAreaName === 'local' ? localArea : (syncArea || localArea);
  }

  // The latest write of each key, so a refused write that a newer one has
  // replaced is not retried over it.
  let writeSequence = 0;
  const latestWrites = new Map<string, number>();

  // Runs operation on the active area once the mode is known. A callback
  // receives the storage error as its second argument (Chrome also leaves it
  // in runtime.lastError while the callback runs); without a callback the
  // returned promise rejects. A write refused for exceeding the sync write
  // quota is retried once after the quota refills.
  function invoke<R>(
    method: StorageMethod,
    writtenKeys: string[] | null,
    // What an area without this method answers: no items for a read.
    emptyResult: R | undefined,
    operation: (area: StorageAreaLike, done: (result?: R) => void) => PromiseLike<R | undefined> | void,
    callback: FacadeCallback<R> | null
  ): Promise<R | undefined> {
    const isWrite = writtenKeys !== null;
    const keys = writtenKeys || [];
    const sequence = ++writeSequence;
    keys.forEach((key) => latestWrites.set(key, sequence));
    return modeReady.then(() => new Promise<R | undefined>((resolve, reject) => {
      const area = getActiveArea();
      if (!area || typeof area[method] !== 'function') {
        if (callback) callback(emptyResult);
        resolve(emptyResult);
        return;
      }
      const target = area;
      let retried = false;
      const complete = (result: R | undefined, error: Error | null) => {
        if (callback) callback(result, error || undefined);
        if (error && callback && isWrite) {
          try { console.warn('[Lumno] Could not save settings.', error); } catch (_error) { /* ignore */ }
        }
        if (error && !callback) reject(error);
        else resolve(result);
      };
      const attempt = () => {
        let settled = false;
        const finish = (result: R | undefined, failure?: unknown) => {
          if (settled) return;
          settled = true;
          const lastError = failure || (chromeApi && chromeApi.runtime && chromeApi.runtime.lastError);
          if (lastError && isWrite && !retried && isStorageRateLimitError(lastError)) {
            retried = true;
            if (keys.length && keys.every((key) => (latestWrites.get(key) || 0) > sequence)) {
              // A newer write carries every value; report this one once the
              // refusal has left runtime.lastError.
              Promise.resolve().then(() => complete(undefined, null));
              return;
            }
            setTimeout(attempt, retryDelayMs);
            return;
          }
          complete(result, lastError ? toError(lastError, 'Storage operation failed') : null);
        };
        try {
          const maybePromise = operation(target, (result) => finish(result));
          if (maybePromise && typeof maybePromise.then === 'function') {
            Promise.resolve(maybePromise).then((result) => finish(result))
              .catch((error: unknown) => finish(undefined, error || new Error('Storage operation failed')));
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      };
      attempt();
    }));
  }

  // Like chrome.storage: the callback comes last; get() with only a callback
  // reads every key.
  const area: StorageAreaFacade = Object.freeze({
    get(keysOrCallback?: StorageKeys | FacadeCallback<StorageItems>, maybeCallback?: FacadeCallback<StorageItems>) {
      const callback = typeof keysOrCallback === 'function' ? keysOrCallback : maybeCallback;
      const keys = typeof keysOrCallback === 'function' || keysOrCallback === undefined ? null : keysOrCallback;
      return invoke<StorageItems>('get', null, {}, (target, done) => target.get(keys, done), callback || null);
    },
    set(items: StorageItems, callback?: FacadeCallback<void>) {
      const keys = Object.keys(items && typeof items === 'object' ? items : {});
      return invoke<void>('set', keys, undefined, (target, done) => target.set(items, () => done()), callback || null)
        .then(() => undefined);
    },
    remove(keys: string | string[], callback?: FacadeCallback<void>) {
      const removed = (Array.isArray(keys) ? keys : [keys]).map(String);
      return invoke<void>('remove', removed, undefined, (target, done) => (
        target.remove ? target.remove(keys, () => done()) : undefined
      ), callback || null).then(() => undefined);
    },
    clear(callback?: FacadeCallback<void>) {
      return invoke<void>('clear', [], undefined, (target, done) => (
        target.clear ? target.clear(() => done()) : undefined
      ), callback || null).then(() => undefined);
    }
  });
  rateLimitRetryingAreas.add(area);

  const runtime: ProviderStorageRuntime = Object.freeze({
    area,
    get name() { return activeAreaName; },
    ready: modeReady,
    getActiveAreaName() { return activeAreaName; },
    isActiveAreaName(areaName: unknown) { return String(areaName || '') === activeAreaName; },
    // False only when the mode could not be read at all; the active area is
    // then the default, not a choice the user made.
    isModeKnown() { return modeKnown; }
  });
  if (chromeApi) providerStorageRuntimes.set(chromeApi, runtime);
  return runtime;
}

// The area provider-scoped settings live in, plus the runtime that tracks
// it. The runtime always exists (it falls back to local storage when sync
// is missing), so callers need no sync/local fallback chain of their own.
// areaName is the name at the time of the call; ask the runtime for the
// current one once local-primary mode may have been read.
function getProviderStorage(chromeApi: StorageChromeApi | null | undefined) {
  const runtime = createProviderStorageRuntime(chromeApi);
  return Object.freeze({
    runtime,
    area: runtime.area,
    areaName: runtime.name
  });
}

function addStorageChangeListener(
  chromeApi: StorageChromeApi | null | undefined,
  listener: StorageChangeListener | null | undefined
): boolean {
  const onChanged = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
  if (!onChanged || typeof onChanged.addListener !== 'function' ||
      typeof listener !== 'function') {
    return false;
  }
  onChanged.addListener(listener);
  return true;
}

export {
  addStorageChangeListener,
  cacheNewtabInputAutoFocusEnabled,
  cacheNewtabLocale,
  createProviderStorageRuntime,
  createStorageReadBatch,
  getProviderStorage,
  isStorageRateLimitError,
  migrateLocalSettingsToSync,
  prefetchStorageRead,
  readStorageValue,
  shouldSkipEntryMotion,
  writeSettingRepairs,
  writeStorageValue,
  writeStorageValues
};
export type {
  ProviderStorageRuntime,
  ReadBatchMetrics,
  StorageAreaFacade,
  StorageChromeApi,
  StorageReadBatch
};
