// A connection's storage calls, status record, keep-alive and job queue.
import type { StorageItems } from '../../domain/storage-port';
import { isRecord, readSession } from './records';
import type { Session, StatusUpdate, StorageCall, StorageMethod, StoredConnection } from './types';
import type { Connection } from './connection';
import * as SettingsStorage from '../../platform/settings-storage';
import { error } from '../webdav-client/errors';

function fail(conn: Connection, code: string): never { throw error(code); }

function report(conn: Connection, context: string, cause: unknown): void {
  try { conn.ports.logger.warn(`[Lumno] ${context}`, cause); } catch (_error) { /* Logging never fails a sync. */ }
}

// A write refused by the browser sync write quota is retried once, after
// the quota has had time to refill.
function runStorage(conn: Connection, area: chrome.storage.StorageArea | null | undefined, call: StorageCall, retried = false): Promise<StorageItems | undefined> {
  return new Promise((resolve, reject) => {
    if (!area) { resolve(call.method === 'get' ? {} : undefined); return; }
    let finished = false;
    const done = (result: StorageItems | undefined, failure?: unknown): void => {
      if (finished) return;
      finished = true;
      const lastError = failure || (conn.ports.chrome.runtime && conn.ports.chrome.runtime.lastError);
      if (!lastError) { resolve(result); return; }
      if (call.method !== 'get' && !retried && SettingsStorage.isStorageRateLimitError(lastError)) {
        setTimeout(() => runStorage(conn, area, call, true).then(resolve, reject), conn.timings.storageRetryDelayMs);
        return;
      }
      const message = isRecord(lastError) && lastError.message ? lastError.message : lastError;
      reject(Object.assign(error('local-storage-failed'), { reason: String(message) }));
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

function storage(conn: Connection, area: chrome.storage.StorageArea | null | undefined, method: 'get', keys: string[] | null): Promise<StorageItems>;

function storage(conn: Connection, area: chrome.storage.StorageArea | null | undefined, method: 'set', items: StorageItems): Promise<void>;

function storage(conn: Connection, area: chrome.storage.StorageArea | null | undefined, method: 'remove', keys: string[]): Promise<void>;

function storage(
  conn: Connection,
  area: chrome.storage.StorageArea | null | undefined,
  method: StorageMethod,
  value: string[] | StorageItems | null
): Promise<StorageItems | void> {
  if (method === 'get') {
    const keys = Array.isArray(value) ? value : null;
    return runStorage(conn, area, { method, keys }).then((result) => result || {});
  }
  if (method === 'set') {
    return runStorage(conn, area, { method, items: isRecord(value) && !Array.isArray(value) ? value : {} }).then(() => undefined);
  }
  return runStorage(conn, area, { method, keys: Array.isArray(value) ? value : [] }).then(() => undefined);
}

async function setStatus(conn: Connection, update: StatusUpdate): Promise<StorageItems> {
  const old = await storage(conn, conn.ports.localArea, 'get', [conn.ports.statusKey]);
  const previous = old[conn.ports.statusKey];
  // A planned retry time belongs to the state that announced it.
  const status = { ...(isRecord(previous) ? previous : {}), ...('state' in update ? { retryAt: null } : {}), ...update };
  await storage(conn, conn.ports.localArea, 'set', { [conn.ports.statusKey]: status });
  return status;
}

async function session(conn: Connection): Promise<Session> { return readSession(await conn.ports.privateStore.get('session')); }

async function saveConfig(conn: Connection, config: StoredConnection): Promise<void> { await conn.ports.privateStore.put('session', { ...await session(conn), config }); }

export {
  fail,
  report,
  runStorage,
  saveConfig,
  session,
  setStatus,
  storage
};
