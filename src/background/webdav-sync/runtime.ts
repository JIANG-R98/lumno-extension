// A connection's storage calls, status record, keep-alive and job queue.
import * as LumnoSettingsStorage from '../../platform/settings-storage';
import type { StorageItems } from '../../domain/storage-port';
import { ignoreRejection, isRecord, readSession } from './records';
import type { ConnectionContext, Session, StatusUpdate, StorageCall, StorageMethod, StoredConnection } from './types';

function fail(ctx: ConnectionContext, code: string): never { throw ctx.clientApi.error(code); }

function report(ctx: ConnectionContext, context: string, cause: unknown): void {
  try { ctx.logger.warn(`[Lumno] ${context}`, cause); } catch (_error) { /* Logging never fails a sync. */ }
}

// A write refused by the browser sync write quota is retried once, after
// the quota has had time to refill.
function runStorage(ctx: ConnectionContext, area: chrome.storage.StorageArea | null | undefined, call: StorageCall, retried = false): Promise<StorageItems | undefined> {
  return new Promise((resolve, reject) => {
    if (!area) { resolve(call.method === 'get' ? {} : undefined); return; }
    let finished = false;
    const done = (result: StorageItems | undefined, failure?: unknown): void => {
      if (finished) return;
      finished = true;
      const lastError = failure || (ctx.chromeApi.runtime && ctx.chromeApi.runtime.lastError);
      if (!lastError) { resolve(result); return; }
      if (call.method !== 'get' && !retried && LumnoSettingsStorage.isStorageRateLimitError(lastError)) {
        setTimeout(() => runStorage(ctx, area, call, true).then(resolve, reject), ctx.storageRetryDelayMs);
        return;
      }
      const message = isRecord(lastError) && lastError.message ? lastError.message : lastError;
      reject(Object.assign(ctx.clientApi.error('local-storage-failed'), { reason: String(message) }));
    };
    try {
      // Firefox answers with a promise as well as the callback.
      let pending: unknown;
      if (call.method === 'get') pending = area.get(call.keys, (result) => done(result));
      else if (call.method === 'set') pending = area.set(call.items, () => done(undefined));
      else pending = area.remove(call.keys, () => done(undefined));
      if (pending instanceof Promise) {
        pending.then((result: unknown) => done(isRecord(result) ? result : undefined))
          .catch((error: unknown) => done(undefined, error || new Error('storage-failed')));
      }
    } catch (error) { reject(error); }
  });
}

function storage(ctx: ConnectionContext, area: chrome.storage.StorageArea | null | undefined, method: 'get', keys: string[] | null): Promise<StorageItems>;

function storage(ctx: ConnectionContext, area: chrome.storage.StorageArea | null | undefined, method: 'set', items: StorageItems): Promise<void>;

function storage(ctx: ConnectionContext, area: chrome.storage.StorageArea | null | undefined, method: 'remove', keys: string[]): Promise<void>;

function storage(ctx: ConnectionContext, 
  area: chrome.storage.StorageArea | null | undefined,
  method: StorageMethod,
  value: string[] | StorageItems | null
): Promise<StorageItems | void> {
  if (method === 'get') {
    const keys = Array.isArray(value) ? value : null;
    return runStorage(ctx, area, { method, keys }).then((result) => result || {});
  }
  if (method === 'set') {
    return runStorage(ctx, area, { method, items: isRecord(value) && !Array.isArray(value) ? value : {} }).then(() => undefined);
  }
  return runStorage(ctx, area, { method, keys: Array.isArray(value) ? value : [] }).then(() => undefined);
}

async function setStatus(ctx: ConnectionContext, update: StatusUpdate): Promise<StorageItems> {
  const old = await storage(ctx, ctx.localPrefsArea, 'get', [ctx.statusKey]);
  const previous = old[ctx.statusKey];
  // A planned retry time belongs to the state that announced it.
  const status = { ...(isRecord(previous) ? previous : {}), ...('state' in update ? { retryAt: null } : {}), ...update };
  await storage(ctx, ctx.localPrefsArea, 'set', { [ctx.statusKey]: status });
  return status;
}

// Firefox unloads an idle event page even while its requests are pending
// (verified: a 60 s fetch never resolves), which strands the shared write
// lock mid-sync until someone deletes it by hand. An extension API call
// resets the idle timer in Firefox and Chrome, so tick one while jobs run.
function holdKeepAlive(ctx: ConnectionContext): void {
  ctx.activeJobs += 1;
  if (ctx.keepAliveTimer || !ctx.chromeApi.runtime || typeof ctx.chromeApi.runtime.getPlatformInfo !== 'function') return;
  ctx.keepAliveTimer = setInterval(() => {
    try {
      ignoreRejection(ctx.chromeApi.runtime.getPlatformInfo());
    } catch (_cause) {
      // A failed tick only loses this keep-alive beat.
    }
  }, ctx.keepAliveIntervalMs);
}

function releaseKeepAlive(ctx: ConnectionContext): void {
  ctx.activeJobs = Math.max(0, ctx.activeJobs - 1);
  if (!ctx.activeJobs && ctx.keepAliveTimer) {
    clearInterval(ctx.keepAliveTimer);
    ctx.keepAliveTimer = null;
  }
}

function exclusive<T>(ctx: ConnectionContext, fn: () => Promise<T>): Promise<T> {
  holdKeepAlive(ctx);
  const job = ctx.chain.then(fn);
  ctx.chain = job.catch(() => {});
  const release = (): void => releaseKeepAlive(ctx);
  job.then(release, release);
  return job;
}

async function session(ctx: ConnectionContext): Promise<Session> { return readSession(await ctx.privateStore.get('session')); }

async function saveConfig(ctx: ConnectionContext, config: StoredConnection): Promise<void> { await ctx.privateStore.put('session', { ...await session(ctx), config }); }

export {
  exclusive,
  fail,
  holdKeepAlive,
  releaseKeepAlive,
  report,
  runStorage,
  saveConfig,
  session,
  setStatus,
  storage
};
