// The list of connections and their per-connection storage, and the hints
// that tell other devices about them.
import type { StorageItems } from '../../domain/storage-port';
import { createConnectionController } from './connection-controller';
import { ACCOUNT_FIELDS, ALARM_NAME, MAX_HINTS, MAX_HINT_BYTES } from './constants';
import { isRecord, readSession } from './records';
import type { ConnectionController, ConnectionControllerOptions, ConnectionHint, PrivateStore, ProbeCache, StorageMethod, SyncWallpaperStore } from './types';
import type { WebDavConnection } from '../webdav-client/types';
import { normalizeConfig } from '../webdav-client/config';
import { error } from '../webdav-client/errors';
import * as LumnoSettings from '../../domain/settings';

// What the manager works with.
interface ManagerPorts {
  chrome: typeof chrome;
  crypto: Crypto;
  store: PrivateStore;
  wallpaperStore: SyncWallpaperStore;
  probeCache: ProbeCache;
  // The options every connection starts from.
  options: ConnectionControllerOptions;
}

// The per-connection records removed with the connection.
const RECORD_KEYS = ['session', 'pendingApply', 'recoveryBlocked', 'conflict', 'replacementBackup', 'replacementBackupMeta',
  'migrationBackup', 'migrationBackupMeta', 'staleLock', 'snapshotRing', 'throttle', 'sweptAt'];

// Runs its jobs one at a time, in order; a failed job does not stop the next.
class SerialQueue {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const job = this.chain.then(fn);
    this.chain = job.catch(() => {});
    return job;
  }
}

function failManager(code: string): never { throw error(code); }

function keyFor(id: string, key: string): string {
  return id === 'default' || key.startsWith('asset:') ? key : `connection:${id}:${key}`;
}

function statusKeyFor(id: string): string {
  return id === 'default' ? LumnoSettings.webdavStatus.key : LumnoSettings.webdavConnectionStatus.keyFor(id);
}

function localStorage(chromeApi: typeof chrome, method: 'get', keys: string[]): Promise<StorageItems>;

function localStorage(chromeApi: typeof chrome, method: 'set', items: StorageItems): Promise<void>;

function localStorage(chromeApi: typeof chrome, method: 'remove', keys: string[]): Promise<void>;

function localStorage(chromeApi: typeof chrome, method: StorageMethod, value: string[] | StorageItems): Promise<StorageItems | void> {
  const area = chromeApi.storage.local;
  return new Promise((resolve, reject) => {
    const done = (result?: StorageItems): void => {
      if (chromeApi.runtime.lastError) reject(new Error('local-storage-failed')); else resolve(result);
    };
    if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
    else if (method === 'set') area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
    else area.remove(Array.isArray(value) ? value : [], () => done());
  });
}

function syncStorage(chromeApi: typeof chrome, method: 'get', keys: string[]): Promise<StorageItems>;

function syncStorage(chromeApi: typeof chrome, method: 'set', items: StorageItems): Promise<StorageItems>;

function syncStorage(chromeApi: typeof chrome, method: 'get' | 'set', value: string[] | StorageItems): Promise<StorageItems> {
  return new Promise((resolve, reject) => {
    const area: chrome.storage.SyncStorageArea | undefined = chromeApi.storage.sync;
    if (!area) { resolve({}); return; }
    const done = (result?: StorageItems): void => {
      if (chromeApi.runtime.lastError) reject(new Error('sync-storage-failed')); else resolve(result || {});
    };
    if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
    else area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
  });
}

// Tells the open settings pages that the list of connections changed.
async function notifyRegistry(ports: ManagerPorts): Promise<void> {
  await localStorage(ports.chrome, 'set', { [LumnoSettings.webdavConnectionStatus.keyFor('connections')]: ports.crypto.randomUUID() });
}

// Every device publishes the address, directory and username of its
// connections through browser sync, so a new device only asks for the app
// password. The password itself never leaves the device that holds it.
function sameConnection(left: ConnectionHint, right: ConnectionHint): boolean {
  return ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
}

function connectionHints(value: unknown): ConnectionHint[] {
  const hints: ConnectionHint[] = [];
  const items: unknown[] = isRecord(value) && value.version === 1 && Array.isArray(value.items) ? value.items : [];
  for (const item of items) {
    let config: WebDavConnection;
    try { config = normalizeConfig({ ...(isRecord(item) ? item : {}), password: 'placeholder' }); } catch (_error) { continue; }
    const hint = { endpoint: config.endpoint, directory: config.directory, username: config.username };
    if (JSON.stringify(hint).length <= MAX_HINT_BYTES && !hints.some((existing) => sameConnection(existing, hint))) hints.push(hint);
  }
  return hints.slice(-MAX_HINTS);
}

// Hints are a convenience: failing to publish one never fails the
// connection change that triggered it.
function publishHints(
  ports: ManagerPorts,
  queue: SerialQueue,
  removed: ReadonlyArray<ConnectionHint | null>,
  added: ReadonlyArray<ConnectionHint | null>
): Promise<void> {
  return queue.run(async () => {
    const key = LumnoSettings.webdavConnections.key;
    const current = connectionHints((await syncStorage(ports.chrome, 'get', [key]))[key]);
    const next = connectionHints({ version: 1, items: [
      ...current.filter((item) => !removed.some((config) => config && sameConnection(config, item))),
      ...added.filter(Boolean)] });
    if (JSON.stringify(next) !== JSON.stringify(current)) await syncStorage(ports.chrome, 'set', { [key]: { version: 1, items: next } });
  }).catch(() => {});
}

// The connections of this browser, each run by its own controller.
class ConnectionRegistry {
  ids: string[] = [];
  private readonly workers = new Map<string, Readonly<ConnectionController>>();
  private readonly ports: ManagerPorts;
  // Serializes local writes across the connections.
  private readonly localWrites = new SerialQueue();

  constructor(ports: ManagerPorts) {
    this.ports = ports;
  }

  // The connection's controller, made and started on first use.
  worker(id: string): Readonly<ConnectionController> {
    const known = this.workers.get(id);
    if (known) return known;
    const { store } = this.ports;
    const scopedStore: PrivateStore = { get: (key) => store.get(keyFor(id, key)), put: (key, value) => store.put(keyFor(id, key), value) };
    const controller = createConnectionController({ ...this.ports.options, chrome: this.ports.chrome, privateStore: scopedStore,
      wallpaperStore: this.ports.wallpaperStore, probeCache: this.ports.probeCache, statusKey: statusKeyFor(id),
      alarmName: id === 'default' ? ALARM_NAME : `${ALARM_NAME}:${id}`,
      managed: true, withLocalWrite: (fn) => this.localWrites.run(fn),
      hasPendingApply: () => this.hasPendingApply(id) });
    this.workers.set(id, controller);
    controller.start();
    return controller;
  }

  async configOf(id: string): Promise<ConnectionHint | null> {
    const { config } = await this.worker(id).status();
    return config ? { endpoint: config.endpoint, directory: config.directory, username: config.username } : null;
  }

  async hasLocalHistory(id: string): Promise<boolean> {
    for (const key of ['migrationBackup', 'pendingApply', 'recoveryBlocked']) if (await this.ports.store.get(keyFor(id, key))) return true;
    return false;
  }

  // Stops the connection and removes its records and status.
  async discard(id: string): Promise<void> {
    const { store } = this.ports;
    await this.worker(id).stop();
    this.workers.delete(id);
    for (const key of RECORD_KEYS) {
      if (store.delete) await store.delete(keyFor(id, key)); else await store.put(keyFor(id, key), null);
    }
    await localStorage(this.ports.chrome, 'remove', [statusKeyFor(id)]);
  }

  async saveIds(ids: string[]): Promise<void> {
    await this.ports.store.put('connections', ids);
    this.ids = ids;
  }

  // Reads the saved connections and recovers every interrupted local
  // application before any server can upload.
  async load(): Promise<void> {
    const { store } = this.ports;
    const saved = await store.get('connections');
    if (Array.isArray(saved)) {
      const savedIds: unknown[] = saved;
      this.ids = [...new Set(savedIds.filter((id): id is string => typeof id === 'string' && /^(default|[\w-]{1,80})$/.test(id)))];
    } else {
      // Keep the existing credential, baseline and backups together in place.
      if (readSession(await store.get('session')).config) this.ids = ['default'];
      await store.put('connections', this.ids);
    }
    this.ids.forEach((id) => this.worker(id));
    for (const id of this.ids) {
      await this.worker(id).handle({ operation: 'recover' });
      const current = await this.worker(id).status();
      if (!current.enabled && current.error === 'interrupted-apply' && current.hasMigrationBackup) await store.put(keyFor(id, 'recoveryBlocked'), true);
    }
  }

  // An unrecovered local write of any connection may have left a partial
  // state, so no connection uploads until its journal is recovered (at
  // start-up, before any sync). A connection that then waits for its backup
  // to be restored pauses only itself: the others keep syncing the device's
  // current settings instead of stopping until someone restores.
  private async hasPendingApply(id: string): Promise<boolean> {
    const { store } = this.ports;
    if (await store.get(keyFor(id, 'recoveryBlocked'))) return true;
    for (const connectionId of this.workers.keys()) if (await store.get(keyFor(connectionId, 'pendingApply'))) return true;
    return false;
  }
}

export type { ManagerPorts };
export {
  ConnectionRegistry,
  SerialQueue,
  connectionHints,
  failManager,
  keyFor,
  localStorage,
  notifyRegistry,
  publishHints,
  sameConnection,
  syncStorage
};
