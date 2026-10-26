// The list of connections, their per-connection storage and the hints that
// tell other devices about them.
import type { StorageItems } from '../../domain/storage-port';
import { createConnectionController } from './connection-controller';
import { ACCOUNT_FIELDS, ALARM_NAME, MAX_HINTS, MAX_HINT_BYTES } from './constants';
import { isRecord, readSession } from './records';
import type { ConnectionController, ConnectionHint, ManagerContext, PrivateStore, StorageMethod } from './types';
import type { WebDavConnection } from '../webdav-client/types';

function failManager(ctx: ManagerContext, code: string): never { throw ctx.clientApi.error(code); }

function keyFor(id: string, key: string): string {
  return id === 'default' || key.startsWith('asset:') ? key : `connection:${id}:${key}`;
}

function statusKeyFor(ctx: ManagerContext, id: string): string {
  return id === 'default' ? ctx.settings.webdavStatus.key : ctx.settings.webdavConnectionStatus.keyFor(id);
}

function serialRegistry<T>(ctx: ManagerContext, fn: () => Promise<T>): Promise<T> {
  const job = ctx.registryChain.then(fn);
  ctx.registryChain = job.catch(() => {});
  return job;
}

function serialHints<T>(ctx: ManagerContext, fn: () => Promise<T>): Promise<T> {
  const job = ctx.hintChain.then(fn);
  ctx.hintChain = job.catch(() => {});
  return job;
}

function withLocalWrite<T>(ctx: ManagerContext, fn: () => T | Promise<T>): Promise<T> {
  const job = ctx.localChain.then(fn);
  ctx.localChain = job.catch(() => {});
  return job;
}

function localStorage(ctx: ManagerContext, method: 'get', keys: string[]): Promise<StorageItems>;

function localStorage(ctx: ManagerContext, method: 'set', items: StorageItems): Promise<void>;

function localStorage(ctx: ManagerContext, method: 'remove', keys: string[]): Promise<void>;

function localStorage(ctx: ManagerContext, method: StorageMethod, value: string[] | StorageItems): Promise<StorageItems | void> {
  const area = ctx.chromeApi.storage.local;
  return new Promise((resolve, reject) => {
    const done = (result?: StorageItems): void => {
      if (ctx.chromeApi.runtime.lastError) reject(new Error('local-storage-failed')); else resolve(result);
    };
    if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
    else if (method === 'set') area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
    else area.remove(Array.isArray(value) ? value : [], () => done());
  });
}

async function notifyRegistry(ctx: ManagerContext): Promise<void> {
  await localStorage(ctx, 'set', { [ctx.settings.webdavConnectionStatus.keyFor('connections')]: ctx.cryptoApi.randomUUID() });
}

// Every device publishes the address, directory and username of its
// connections through browser sync, so a new device only asks for the app
// password. The password itself never leaves the device that holds it.
function sameConnection(left: ConnectionHint, right: ConnectionHint): boolean {
  return ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
}

function connectionHints(ctx: ManagerContext, value: unknown): ConnectionHint[] {
  const hints: ConnectionHint[] = [];
  const items: unknown[] = isRecord(value) && value.version === 1 && Array.isArray(value.items) ? value.items : [];
  for (const item of items) {
    let config: WebDavConnection;
    try { config = ctx.clientApi.normalizeConfig({ ...(isRecord(item) ? item : {}), password: 'placeholder' }); } catch (_error) { continue; }
    const hint = { endpoint: config.endpoint, directory: config.directory, username: config.username };
    if (JSON.stringify(hint).length <= MAX_HINT_BYTES && !hints.some((existing) => sameConnection(existing, hint))) hints.push(hint);
  }
  return hints.slice(-MAX_HINTS);
}

function syncStorage(ctx: ManagerContext, method: 'get', keys: string[]): Promise<StorageItems>;

function syncStorage(ctx: ManagerContext, method: 'set', items: StorageItems): Promise<StorageItems>;

function syncStorage(ctx: ManagerContext, method: 'get' | 'set', value: string[] | StorageItems): Promise<StorageItems> {
  return new Promise((resolve, reject) => {
    const area: chrome.storage.SyncStorageArea | undefined = ctx.chromeApi.storage.sync;
    if (!area) { resolve({}); return; }
    const done = (result?: StorageItems): void => {
      if (ctx.chromeApi.runtime.lastError) reject(new Error('sync-storage-failed')); else resolve(result || {});
    };
    if (method === 'get') area.get(Array.isArray(value) ? value : [], (result) => done(result));
    else area.set(isRecord(value) && !Array.isArray(value) ? value : {}, () => done());
  });
}

// Hints are a convenience: failing to publish one never fails the
// connection change that triggered it.
function publishHints(ctx: ManagerContext, removed: ReadonlyArray<ConnectionHint | null>, added: ReadonlyArray<ConnectionHint | null>): Promise<void> {
  return serialHints(ctx, async () => {
    const key = ctx.settings.webdavConnections.key;
    const current = connectionHints(ctx, (await syncStorage(ctx, 'get', [key]))[key]);
    const next = connectionHints(ctx, { version: 1, items: [
      ...current.filter((item) => !removed.some((config) => config && sameConnection(config, item))),
      ...added.filter(Boolean)] });
    if (JSON.stringify(next) !== JSON.stringify(current)) await syncStorage(ctx, 'set', { [key]: { version: 1, items: next } });
  }).catch(() => {});
}

async function configOf(ctx: ManagerContext, id: string): Promise<ConnectionHint | null> {
  const { config } = await worker(ctx, id).status();
  return config ? { endpoint: config.endpoint, directory: config.directory, username: config.username } : null;
}

function worker(ctx: ManagerContext, id: string): Readonly<ConnectionController> {
  const known = ctx.workers.get(id);
  if (known) return known;
  const scopedStore: PrivateStore = { get: (key) => ctx.store.get(keyFor(id, key)), put: (key, value) => ctx.store.put(keyFor(id, key), value) };
  const controller = createConnectionController({ ...ctx.opts, chrome: ctx.chromeApi, settings: ctx.settings, privateStore: scopedStore,
    wallpaperStore: ctx.wallpaperStore, probeCache: ctx.probeCache, statusKey: statusKeyFor(ctx, id), alarmName: id === 'default' ? ALARM_NAME : `${ALARM_NAME}:${id}`,
    managed: true, withLocalWrite: (fn) => withLocalWrite(ctx, fn),
    // An unrecovered local write of any connection may have left a
    // partial state, so no connection uploads until its journal is
    // recovered (at start-up, before any sync). A connection that then
    // waits for its backup to be restored pauses only itself: the others
    // keep syncing the device's current settings instead of stopping
    // until someone restores.
    hasPendingApply: async () => {
      if (await ctx.store.get(keyFor(id, 'recoveryBlocked'))) return true;
      for (const connectionId of ctx.workers.keys()) if (await ctx.store.get(keyFor(connectionId, 'pendingApply'))) return true;
      return false;
    } });
  ctx.workers.set(id, controller);
  controller.start();
  return controller;
}

async function loadConnections(ctx: ManagerContext): Promise<void> {
  const saved = await ctx.store.get('connections');
  if (Array.isArray(saved)) {
    const savedIds: unknown[] = saved;
    ctx.ids = [...new Set(savedIds.filter((id): id is string => typeof id === 'string' && /^(default|[\w-]{1,80})$/.test(id)))];
  } else {
    // Keep the existing credential, baseline and backups together in place.
    if (readSession(await ctx.store.get('session')).config) ctx.ids = ['default'];
    await ctx.store.put('connections', ctx.ids);
  }
  ctx.ids.forEach((id) => worker(ctx, id));
  // Recover every interrupted local application before any server can upload.
  for (const id of ctx.ids) {
    await worker(ctx, id).handle({ operation: 'recover' });
    const current = await worker(ctx, id).status();
    if (!current.enabled && current.error === 'interrupted-apply' && current.hasMigrationBackup) await ctx.store.put(keyFor(id, 'recoveryBlocked'), true);
  }
  // Connections added before hints existed reach other devices too.
  await publishHints(ctx, [], await Promise.all(ctx.ids.map((id) => configOf(ctx, id))));
}

export {
  configOf,
  connectionHints,
  failManager,
  keyFor,
  loadConnections,
  localStorage,
  notifyRegistry,
  publishHints,
  sameConnection,
  serialHints,
  serialRegistry,
  statusKeyFor,
  syncStorage,
  withLocalWrite,
  worker
};
