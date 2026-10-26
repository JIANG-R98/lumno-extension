// The area provider-scoped settings live in: browser sync, or this device's
// local storage when the user keeps them here (local-primary mode).
import { localPrimary } from '../domain/settings/sync-state';
import type {
  StorageAreaLike,
  StorageChangeEventLike,
  StorageChangeListener,
  StorageChanges,
  StorageItems,
  StorageKeys
} from '../domain/storage-port';

import type { AreaName, FacadeCallback, ProviderStorageOptions, ProviderStorageRuntime, StorageAreaFacade, StorageChromeApi, StorageMethod } from './settings-storage';
import { STORAGE_ACCESS_DENIED_PATTERN, errorMessage, getStorageRetryDelay, isStorageRateLimitError, rateLimitRetryingAreas, toError } from './settings-storage';

// One provider storage runtime (and storage listener) per extension API
// object in each script.
const providerStorageRuntimes = new WeakMap<object, ProviderStorageRuntime>();

// Reading the local-primary flag picks the area every setting comes from,
// so a failed read is retried instead of silently choosing browser sync.
const MODE_READ_RETRY_DELAYS_MS = [100, 400, 1600];

// Which area holds the settings: browser sync, or this device's local
// storage while the user keeps them here. Read once, then followed.
class StorageMode {
  activeAreaName: AreaName;
  // False only when the mode could not be read at all; the active area is
  // then the default, not a choice the user made.
  known = true;
  // A change seen before the first read answered wins over that read.
  private observedChange = false;
  private readonly chromeApi: StorageChromeApi | null | undefined;
  readonly syncArea: StorageAreaLike | null;
  readonly localArea: StorageAreaLike | null;
  private readonly retryDelays: readonly number[];

  constructor(chromeApi: StorageChromeApi | null | undefined, retryDelays: readonly number[]) {
    const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
    this.chromeApi = chromeApi;
    this.syncArea = storage && storage.sync ? storage.sync : null;
    this.localArea = storage && storage.local ? storage.local : this.syncArea;
    this.retryDelays = retryDelays;
    this.activeAreaName = this.syncArea ? 'sync' : (this.localArea ? 'local' : '');
  }

  activeArea(): StorageAreaLike | null {
    return this.activeAreaName === 'local' ? this.localArea : (this.syncArea || this.localArea);
  }

  // Reads which area holds the settings, retrying a read that fails before
  // giving up on the default.
  read(): Promise<AreaName> {
    return new Promise<AreaName>((resolve) => {
      const modeArea = this.localArea;
      if (!modeArea || typeof modeArea.get !== 'function') {
        resolve(this.activeAreaName);
        return;
      }
      this.readAttempt(modeArea, 0, resolve);
    });
  }

  // Follows the user switching where settings are kept.
  watch(onChanged: StorageChangeEventLike | null | undefined): void {
    if (!onChanged || typeof onChanged.addListener !== 'function') {
      return;
    }
    onChanged.addListener((changes: StorageChanges, areaName: string) => {
      if (areaName === 'local' && changes[localPrimary.key]) {
        this.observedChange = true;
        this.known = true;
        this.activeAreaName = changes[localPrimary.key].newValue === true ? 'local' : (this.syncArea ? 'sync' : 'local');
      }
    });
  }

  private readAttempt(modeArea: StorageAreaLike, attempt: number, resolve: (name: AreaName) => void): void {
    let settled = false;
    const finish = (result: StorageItems | null | undefined, error?: unknown): void => {
      if (settled) return;
      settled = true;
      const lastError = error || (this.chromeApi && this.chromeApi.runtime && this.chromeApi.runtime.lastError);
      if (lastError && !this.observedChange && this.retryAfterFailure(modeArea, attempt, lastError, resolve)) return;
      if (!lastError && !this.observedChange && result && result[localPrimary.key] === true) this.activeAreaName = 'local';
      resolve(this.activeAreaName);
    };
    try {
      const pending = modeArea.get([localPrimary.key], (result) => finish(result));
      if (pending && typeof pending.then === 'function') {
        pending.then((result) => finish(result)).catch((error: unknown) => finish(null, error || new Error('storage-read-failed')));
      }
    } catch (error) { finish(null, error); }
  }

  // Tries again after a failed read; true when it will. Still unreadable
  // after the last try: keeps the default but says so, so callers that
  // would copy settings elsewhere can refuse instead of guessing.
  private retryAfterFailure(modeArea: StorageAreaLike, attempt: number, lastError: unknown, resolve: (name: AreaName) => void): boolean {
    const accessDenied = STORAGE_ACCESS_DENIED_PATTERN.test(errorMessage(lastError));
    if (!accessDenied && attempt < this.retryDelays.length) {
      setTimeout(() => this.readAttempt(modeArea, attempt + 1, resolve), this.retryDelays[attempt]);
      return true;
    }
    this.known = false;
    try { console.warn('[Lumno] Could not read the settings storage mode.', lastError); } catch (_error) { /* ignore */ }
    return false;
  }
}

// The order of writes: the latest write of each key, so a refused write
// that a newer one has replaced is not retried over it.
class WriteOrder {
  private sequence = 0;
  private readonly latest = new Map<string, number>();

  next(keys: readonly string[] | null): number {
    const sequence = ++this.sequence;
    (keys || []).forEach((key) => this.latest.set(key, sequence));
    return sequence;
  }

  isSuperseded(keys: readonly string[], sequence: number): boolean {
    return keys.length > 0 && keys.every((key) => (this.latest.get(key) || 0) > sequence);
  }
}

// One extension context's storage: the area its settings live in, and the
// writes in flight.
interface ProviderStorage {
  readonly chromeApi: StorageChromeApi | null | undefined;
  readonly mode: StorageMode;
  readonly writes: WriteOrder;
  readonly retryDelayMs: number;
}

interface StorageInvocation<R> {
  method: StorageMethod;
  // The keys a write changes; null for a read.
  writtenKeys: string[] | null;
  // What an area without this method answers: no items for a read.
  emptyResult: R | undefined;
  operation: (area: StorageAreaLike, done: (result?: R) => void) => PromiseLike<R | undefined> | void;
  callback: FacadeCallback<R> | null;
}

// Runs the operation on the area, retrying once a write the sync quota
// refused, unless a newer write has replaced every value it carried.
function runOnArea<R>(
  provider: ProviderStorage,
  target: StorageAreaLike,
  call: StorageInvocation<R>,
  sequence: number,
  settle: { complete(result: R | undefined, error: Error | null): void; reject(error: unknown): void }
): void {
  const isWrite = call.writtenKeys !== null;
  const keys = call.writtenKeys || [];
  let retried = false;
  const attempt = () => {
    let settled = false;
    const finish = (result: R | undefined, failure?: unknown) => {
      if (settled) return;
      settled = true;
      const lastError = failure || (provider.chromeApi && provider.chromeApi.runtime && provider.chromeApi.runtime.lastError);
      if (lastError && isWrite && !retried && isStorageRateLimitError(lastError)) {
        retried = true;
        if (provider.writes.isSuperseded(keys, sequence)) {
          // A newer write carries every value; report this one once the
          // refusal has left runtime.lastError.
          Promise.resolve().then(() => settle.complete(undefined, null));
          return;
        }
        setTimeout(attempt, provider.retryDelayMs);
        return;
      }
      settle.complete(result, lastError ? toError(lastError, 'Storage operation failed') : null);
    };
    try {
      const maybePromise = call.operation(target, (result) => finish(result));
      if (maybePromise && typeof maybePromise.then === 'function') {
        Promise.resolve(maybePromise).then((result) => finish(result))
          .catch((error: unknown) => finish(undefined, error || new Error('Storage operation failed')));
      }
    } catch (error) {
      if (!settled) {
        settled = true;
        settle.reject(error);
      }
    }
  };
  attempt();
}

// Runs an operation on the active area once the mode is known. A callback
// receives the storage error as its second argument (Chrome also leaves it
// in runtime.lastError while the callback runs); without a callback the
// returned promise rejects.
function invoke<R>(provider: ProviderStorage, modeReady: Promise<AreaName>, call: StorageInvocation<R>): Promise<R | undefined> {
  const isWrite = call.writtenKeys !== null;
  const sequence = provider.writes.next(call.writtenKeys);
  const { callback } = call;
  return modeReady.then(() => new Promise<R | undefined>((resolve, reject) => {
    const area = provider.mode.activeArea();
    if (!area || typeof area[call.method] !== 'function') {
      if (callback) callback(call.emptyResult);
      resolve(call.emptyResult);
      return;
    }
    runOnArea(provider, area, call, sequence, {
      complete(result, error) {
        if (callback) callback(result, error || undefined);
        if (error && callback && isWrite) {
          try { console.warn('[Lumno] Could not save settings.', error); } catch (_error) { /* ignore */ }
        }
        if (error && !callback) reject(error);
        else resolve(result);
      },
      reject
    });
  }));
}

// Like chrome.storage: the callback comes last; get() with only a callback
// reads every key.
function createAreaFacade(provider: ProviderStorage, modeReady: Promise<AreaName>): StorageAreaFacade {
  return Object.freeze({
    get(keysOrCallback?: StorageKeys | FacadeCallback<StorageItems>, maybeCallback?: FacadeCallback<StorageItems>) {
      const callback = typeof keysOrCallback === 'function' ? keysOrCallback : maybeCallback;
      const keys = typeof keysOrCallback === 'function' || keysOrCallback === undefined ? null : keysOrCallback;
      return invoke<StorageItems>(provider, modeReady, {
        method: 'get', writtenKeys: null, emptyResult: {}, operation: (target, done) => target.get(keys, done), callback: callback || null
      });
    },
    set(items: StorageItems, callback?: FacadeCallback<void>) {
      const keys = Object.keys(items && typeof items === 'object' ? items : {});
      return invoke<void>(provider, modeReady, {
        method: 'set', writtenKeys: keys, emptyResult: undefined, operation: (target, done) => target.set(items, () => done()), callback: callback || null
      }).then(() => undefined);
    },
    remove(keys: string | string[], callback?: FacadeCallback<void>) {
      const removed = (Array.isArray(keys) ? keys : [keys]).map(String);
      return invoke<void>(provider, modeReady, {
        method: 'remove',
        writtenKeys: removed,
        emptyResult: undefined,
        operation: (target, done) => (target.remove ? target.remove(keys, () => done()) : undefined),
        callback: callback || null
      }).then(() => undefined);
    },
    clear(callback?: FacadeCallback<void>) {
      return invoke<void>(provider, modeReady, {
        method: 'clear',
        writtenKeys: [],
        emptyResult: undefined,
        operation: (target, done) => (target.clear ? target.clear(() => done()) : undefined),
        callback: callback || null
      }).then(() => undefined);
    }
  });
}

function createProviderStorageRuntime(
  chromeApi: StorageChromeApi | null | undefined,
  options?: ProviderStorageOptions | null
): ProviderStorageRuntime {
  const known = chromeApi ? providerStorageRuntimes.get(chromeApi) : undefined;
  if (known) {
    return known;
  }
  const modeRetryDelays = options && Array.isArray(options.modeRetryDelaysMs) ? options.modeRetryDelaysMs : MODE_READ_RETRY_DELAYS_MS;
  const provider: ProviderStorage = {
    chromeApi,
    mode: new StorageMode(chromeApi, modeRetryDelays),
    writes: new WriteOrder(),
    retryDelayMs: getStorageRetryDelay(options)
  };
  const { mode } = provider;
  const modeReady = mode.read();
  mode.watch(chromeApi && chromeApi.storage ? chromeApi.storage.onChanged : null);
  const area = createAreaFacade(provider, modeReady);
  rateLimitRetryingAreas.add(area);

  const runtime: ProviderStorageRuntime = Object.freeze({
    area,
    get name() { return mode.activeAreaName; },
    ready: modeReady,
    getActiveAreaName() { return mode.activeAreaName; },
    isActiveAreaName(areaName: unknown) { return String(areaName || '') === mode.activeAreaName; },
    isModeKnown() { return mode.known; }
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
  MODE_READ_RETRY_DELAYS_MS,
  addStorageChangeListener,
  createProviderStorageRuntime,
  getProviderStorage
};
