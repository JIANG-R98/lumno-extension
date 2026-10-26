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

// One extension context's storage: the area its settings live in (sync, or
// local when the user keeps them on this device) and the writes in flight.
interface ProviderContext {
  chromeApi: StorageChromeApi | null | undefined;
  syncArea: StorageAreaLike | null;
  localArea: StorageAreaLike | null;
  retryDelayMs: number;
  modeRetryDelays: readonly number[];
  activeAreaName: AreaName;
  observedModeChange: boolean;
  modeKnown: boolean;
  // The latest write of each key, so a refused write that a newer one has
  // replaced is not retried over it.
  writeSequence: number;
  latestWrites: Map<string, number>;
}

// Reads which area holds the settings, retrying a read that fails before
// giving up on the default.
function readStorageMode(ctx: ProviderContext): Promise<AreaName> {
  return new Promise<AreaName>((resolve) => {
    const modeArea = ctx.localArea;
    if (!modeArea || typeof modeArea.get !== 'function') {
      resolve(ctx.activeAreaName);
      return;
    }
    const readMode = (attempt: number) => {
      let settled = false;
      const finish = (result: StorageItems | null | undefined, error?: unknown) => {
        if (settled) return;
        settled = true;
        const lastError = error || (ctx.chromeApi && ctx.chromeApi.runtime && ctx.chromeApi.runtime.lastError);
        if (lastError && !ctx.observedModeChange) {
          const accessDenied = STORAGE_ACCESS_DENIED_PATTERN.test(errorMessage(lastError));
          if (!accessDenied && attempt < ctx.modeRetryDelays.length) {
            setTimeout(() => readMode(attempt + 1), ctx.modeRetryDelays[attempt]);
            return;
          }
          // Still unreadable: keep the default, but say so, so callers that
          // would copy settings elsewhere can refuse instead of guessing.
          ctx.modeKnown = false;
          try { console.warn('[Lumno] Could not read the settings storage mode.', lastError); } catch (_error) { /* ignore */ }
        }
        if (!lastError && !ctx.observedModeChange && result && result[localPrimary.key] === true) ctx.activeAreaName = 'local';
        resolve(ctx.activeAreaName);
      };
      try {
        const pending = modeArea.get([localPrimary.key], (result) => finish(result));
        if (pending && typeof pending.then === 'function') {
          pending.then((result) => finish(result)).catch((error: unknown) => finish(null, error || new Error('storage-read-failed')));
        }
      } catch (error) { finish(null, error); }
    };
    readMode(0);
  });
}

// Follows the user switching where settings are kept.
function watchStorageMode(ctx: ProviderContext, onChanged: StorageChangeEventLike | null | undefined): void {
  if (!onChanged || typeof onChanged.addListener !== 'function') {
    return;
  }
  onChanged.addListener((changes: StorageChanges, areaName: string) => {
    if (areaName === 'local' && changes[localPrimary.key]) {
      ctx.observedModeChange = true;
      ctx.modeKnown = true;
      ctx.activeAreaName = changes[localPrimary.key].newValue === true
        ? 'local' : (ctx.syncArea ? 'sync' : 'local');
    }
  });
}

function getActiveArea(ctx: ProviderContext): StorageAreaLike | null {
  return ctx.activeAreaName === 'local' ? ctx.localArea : (ctx.syncArea || ctx.localArea);
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
  ctx: ProviderContext,
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
      const lastError = failure || (ctx.chromeApi && ctx.chromeApi.runtime && ctx.chromeApi.runtime.lastError);
      if (lastError && isWrite && !retried && isStorageRateLimitError(lastError)) {
        retried = true;
        if (keys.length && keys.every((key) => (ctx.latestWrites.get(key) || 0) > sequence)) {
          // A newer write carries every value; report this one once the
          // refusal has left runtime.lastError.
          Promise.resolve().then(() => settle.complete(undefined, null));
          return;
        }
        setTimeout(attempt, ctx.retryDelayMs);
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
function invoke<R>(ctx: ProviderContext, modeReady: Promise<AreaName>, call: StorageInvocation<R>): Promise<R | undefined> {
  const isWrite = call.writtenKeys !== null;
  const sequence = ++ctx.writeSequence;
  (call.writtenKeys || []).forEach((key) => ctx.latestWrites.set(key, sequence));
  const { callback } = call;
  return modeReady.then(() => new Promise<R | undefined>((resolve, reject) => {
    const area = getActiveArea(ctx);
    if (!area || typeof area[call.method] !== 'function') {
      if (callback) callback(call.emptyResult);
      resolve(call.emptyResult);
      return;
    }
    runOnArea(ctx, area, call, sequence, {
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
function createAreaFacade(ctx: ProviderContext, modeReady: Promise<AreaName>): StorageAreaFacade {
  return Object.freeze({
    get(keysOrCallback?: StorageKeys | FacadeCallback<StorageItems>, maybeCallback?: FacadeCallback<StorageItems>) {
      const callback = typeof keysOrCallback === 'function' ? keysOrCallback : maybeCallback;
      const keys = typeof keysOrCallback === 'function' || keysOrCallback === undefined ? null : keysOrCallback;
      return invoke<StorageItems>(ctx, modeReady, {
        method: 'get', writtenKeys: null, emptyResult: {}, operation: (target, done) => target.get(keys, done), callback: callback || null
      });
    },
    set(items: StorageItems, callback?: FacadeCallback<void>) {
      const keys = Object.keys(items && typeof items === 'object' ? items : {});
      return invoke<void>(ctx, modeReady, {
        method: 'set', writtenKeys: keys, emptyResult: undefined, operation: (target, done) => target.set(items, () => done()), callback: callback || null
      }).then(() => undefined);
    },
    remove(keys: string | string[], callback?: FacadeCallback<void>) {
      const removed = (Array.isArray(keys) ? keys : [keys]).map(String);
      return invoke<void>(ctx, modeReady, {
        method: 'remove',
        writtenKeys: removed,
        emptyResult: undefined,
        operation: (target, done) => (target.remove ? target.remove(keys, () => done()) : undefined),
        callback: callback || null
      }).then(() => undefined);
    },
    clear(callback?: FacadeCallback<void>) {
      return invoke<void>(ctx, modeReady, {
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
  const storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
  const syncArea = storage && storage.sync ? storage.sync : null;
  const localArea = storage && storage.local ? storage.local : syncArea;
  const ctx: ProviderContext = {
    chromeApi,
    syncArea,
    localArea,
    retryDelayMs: getStorageRetryDelay(options),
    modeRetryDelays: options && Array.isArray(options.modeRetryDelaysMs) ? options.modeRetryDelaysMs : MODE_READ_RETRY_DELAYS_MS,
    activeAreaName: syncArea ? 'sync' : (localArea ? 'local' : ''),
    observedModeChange: false,
    modeKnown: true,
    writeSequence: 0,
    latestWrites: new Map()
  };
  const modeReady = readStorageMode(ctx);
  watchStorageMode(ctx, storage && storage.onChanged);
  const area = createAreaFacade(ctx, modeReady);
  rateLimitRetryingAreas.add(area);

  const runtime: ProviderStorageRuntime = Object.freeze({
    area,
    get name() { return ctx.activeAreaName; },
    ready: modeReady,
    getActiveAreaName() { return ctx.activeAreaName; },
    isActiveAreaName(areaName: unknown) { return String(areaName || '') === ctx.activeAreaName; },
    // False only when the mode could not be read at all; the active area is
    // then the default, not a choice the user made.
    isModeKnown() { return ctx.modeKnown; }
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
  createAreaFacade,
  createProviderStorageRuntime,
  getActiveArea,
  getProviderStorage,
  invoke,
  providerStorageRuntimes,
  readStorageMode,
  runOnArea,
  watchStorageMode
};
export type {
  ProviderContext,
  StorageInvocation
};
