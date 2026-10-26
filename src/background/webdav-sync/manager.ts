// Every WebDAV connection of this browser, behind one request handler.
// Credentials, baselines and the binary cache stay in extension-origin
// IndexedDB.
import * as LumnoNewtabWallpaperLocalStore from '../../shared/wallpaper-local-store';
import * as LumnoSettings from '../../domain/settings';
import * as LumnoWebDavClient from '../webdav-client';
import type { WebDavRequest } from '../../domain/messages';
import type { WebDavConnection } from '../webdav-client';
import { SYNC_REVISION } from './constants';
import { configOf, connectionHints, failManager, keyFor, loadConnections, localStorage, notifyRegistry, publishHints, sameConnection, serialRegistry, statusKeyFor, syncStorage, worker } from './manager-registry';
import { createPrivateStore, createProbeCache } from './private-store';
import { isRecord, isRecorded } from './records';
import type { ConnectionController, ConnectionControllerOptions, ConnectionHint, ConnectionStatus, HandleResult, ManagerContext, ManagerStatus, SyncResult, SyncWallpaperStore, WebDavSyncManager } from './types';

// Two connections to the same account and directory would sync one remote
// with two independent baselines and treat each other's writes as changes.
async function assertUnique(ctx: ManagerContext, input: unknown, exceptId?: string): Promise<void> {
  let candidate: WebDavConnection;
  const fields = isRecord(input) ? input : {};
  try { candidate = ctx.clientApi.normalizeConfig({ ...fields, password: fields.password || 'placeholder' }); }
  catch (_error) { return; }
  for (const id of ctx.ids) {
    if (id === exceptId) continue;
    const { config } = await worker(ctx, id).status();
    if (config && sameConnection(config, candidate)) failManager(ctx, 'duplicate-connection');
  }
}

async function discard(ctx: ManagerContext, id: string): Promise<void> {
  await worker(ctx, id).stop();
  ctx.workers.delete(id);
  for (const key of ctx.recordKeys) {
    if (ctx.store.delete) await ctx.store.delete(keyFor(id, key)); else await ctx.store.put(keyFor(id, key), null);
  }
  await localStorage(ctx, 'remove', [statusKeyFor(ctx, id)]);
}

async function hasLocalHistory(ctx: ManagerContext, id: string): Promise<boolean> {
  for (const key of ['migrationBackup', 'pendingApply', 'recoveryBlocked']) if (await ctx.store.get(keyFor(id, key))) return true;
  return false;
}

async function managerStatus(ctx: ManagerContext): Promise<ManagerStatus> {
  await ctx.ready;
  const connections = (await Promise.all(ctx.ids.map(async (id) => ({ id, ...await worker(ctx, id).status() })))).filter((item) => item.config);
  return { ...(connections[0] || { state: 'browser', enabled: false, config: null }),
    clientRevision: ctx.clientApi.REVISION, syncRevision: SYNC_REVISION, connections, suggestions: await suggestions(ctx, connections) };
}

// Synced connections this device has neither added nor dismissed.
async function suggestions(ctx: ManagerContext, connections: ReadonlyArray<ConnectionStatus>): Promise<ConnectionHint[]> {
  const syncKey = ctx.settings.webdavConnections.key;
  const dismissedKey = ctx.settings.webdavDismissedConnections.key;
  let hints: ConnectionHint[] = [];
  let dismissed: ConnectionHint[] = [];
  try {
    hints = connectionHints(ctx, (await syncStorage(ctx, 'get', [syncKey]))[syncKey]);
    dismissed = connectionHints(ctx, (await localStorage(ctx, 'get', [dismissedKey]))[dismissedKey]);
  } catch (_error) { return []; }
  const known: ConnectionHint[] = [...connections.flatMap((item) => (item.config ? [item.config] : [])), ...dismissed];
  return hints.filter((hint) => !known.some((config) => sameConnection(config, hint)));
}

async function dismissSuggestion(ctx: ManagerContext, input: unknown): Promise<SyncResult> {
  const key = ctx.settings.webdavDismissedConnections.key;
  const [hint] = connectionHints(ctx, { version: 1, items: [input] });
  if (!hint) failManager(ctx, 'connection-missing');
  const current = connectionHints(ctx, (await localStorage(ctx, 'get', [key]))[key]);
  await localStorage(ctx, 'set', { [key]: { version: 1, items: connectionHints(ctx, { version: 1, items: [...current, hint] }) } });
  return { ok: true };
}

function startManager(ctx: ManagerContext): void {
  if (ctx.started) return;
  ctx.started = true;
  // Another device withdrawing a connection this one still uses puts it
  // back at once, so a new device never misses it in the meantime.
  ctx.chromeApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes[ctx.settings.webdavConnections.key]) return;
    ctx.ready.then(async () => publishHints(ctx, [], await Promise.all(ctx.ids.map((id) => configOf(ctx, id))))).catch(() => {});
  });
  ctx.ready.then(() => Promise.all(ctx.ids.map(async (id) => {
    const current = await worker(ctx, id).status();
    if (current.enabled) {
      await worker(ctx, id).handle({ operation: 'schedule' });
      await worker(ctx, id).handle({ operation: 'sync' });
    }
  }))).catch((cause: unknown) => {
    // A failed round is already on its card; only the rest is logged.
    if (!cause || !isRecorded(cause)) (ctx.opts.logger || globalThis.console).warn('[Lumno] Could not start WebDAV sync.', cause);
  });
}

async function handleManagerRequest(ctx: ManagerContext, request: WebDavRequest): Promise<HandleResult | ManagerStatus | (HandleResult & { id: string })> {
  await ctx.ready;
  if (request.operation === 'status') return managerStatus(ctx);
  if (request.operation === 'dismissSuggestion') return dismissSuggestion(ctx, request.config);
  if (request.operation === 'add' || (request.operation === 'test' && !request.id)) {
    return serialRegistry(ctx, async () => {
      if (request.operation === 'add') await assertUnique(ctx, request.config);
      const id = ctx.cryptoApi.randomUUID();
      const controller = worker(ctx, id);
      let retained = false;
      const retain = async (): Promise<void> => {
        const nextIds = [...ctx.ids, id];
        await ctx.store.put('connections', nextIds);
        ctx.ids = nextIds;
        retained = true;
        await notifyRegistry(ctx);
      };
      try {
        let result = await controller.handle({ ...request, operation: request.operation === 'add' ? 'save' : 'test' });
        if (request.operation === 'add' && request.enable === true) {
          // The card appears only once the server is verified, so a typo
          // stays in the form instead of becoming a broken connection.
          try { result = await controller.handle({ operation: 'enable' }); }
          catch (cause) {
            if (await hasLocalHistory(ctx, id)) await retain();
            throw cause;
          }
        }
        if (request.operation === 'add') {
          await retain();
          await publishHints(ctx, [], [await configOf(ctx, id)]);
        }
        return { ...result, id };
      } finally {
        if (!retained) await discard(ctx, id);
      }
    });
  }
  const id = request.id || (ctx.ids.length === 1 ? ctx.ids[0] : null);
  if (!id || !ctx.ids.includes(id)) failManager(ctx, 'connection-missing');
  if (request.operation === 'save') {
    await assertUnique(ctx, request.config, id);
    const before = await configOf(ctx, id);
    const result = await worker(ctx, id).handle(request);
    await publishHints(ctx, [before], [await configOf(ctx, id)]);
    return result;
  }
  if (request.operation === 'remove') {
    return serialRegistry(ctx, async () => {
      if (!ctx.ids.includes(id)) failManager(ctx, 'connection-missing');
      await worker(ctx, id).handle({ operation: 'recover' });
      if (await ctx.store.get(keyFor(id, 'recoveryBlocked'))) failManager(ctx, 'interrupted-apply');
      const removed = await configOf(ctx, id);
      await worker(ctx, id).stop();
      const nextIds = ctx.ids.filter((value) => value !== id);
      // Remove the index first: a restart cannot revive this connection.
      await ctx.store.put('connections', nextIds);
      ctx.ids = nextIds;
      await discard(ctx, id);
      await notifyRegistry(ctx);
      await publishHints(ctx, [removed], []);
      return { ok: true };
    });
  }
  return worker(ctx, id).handle(request);
}

function createController(options?: ConnectionControllerOptions | null): Readonly<WebDavSyncManager> {
  const opts = options || {};
  const chromeApi = opts.chrome || chrome;
  const settings = opts.settings || LumnoSettings;
  const cryptoApi = opts.crypto || globalThis.crypto;
  const store = opts.privateStore || createPrivateStore(globalThis.indexedDB);
  const wallpaperStore: SyncWallpaperStore = opts.wallpaperStore ||
    LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({ windowObj: globalThis, onChange() {} });
  const workers = new Map<string, Readonly<ConnectionController>>();
  const probeCache = opts.probeCache || createProbeCache();
  const recordKeys = ['session', 'pendingApply', 'recoveryBlocked', 'conflict', 'replacementBackup', 'replacementBackupMeta', 'migrationBackup', 'migrationBackupMeta',
    'staleLock', 'snapshotRing', 'throttle', 'sweptAt'];
  const clientApi = opts.client || LumnoWebDavClient;
  // Settles once the saved connections are loaded and recovered.
  const ctx: ManagerContext = {
    opts,
    chromeApi,
    settings,
    cryptoApi,
    store,
    wallpaperStore,
    workers,
    probeCache,
    recordKeys,
    ids: [],
    registryChain: Promise.resolve(),
    hintChain: Promise.resolve(),
    localChain: Promise.resolve(),
    started: false,
    clientApi,
    ready: Promise.resolve()
  };
  ctx.ready = loadConnections(ctx);
  return Object.freeze({
    start: () => startManager(ctx),
    status: () => managerStatus(ctx),
    handle: (request: WebDavRequest) => handleManagerRequest(ctx, request)
  });
}

export {
  assertUnique,
  createController,
  discard,
  dismissSuggestion,
  handleManagerRequest,
  hasLocalHistory,
  managerStatus,
  startManager,
  suggestions
};
