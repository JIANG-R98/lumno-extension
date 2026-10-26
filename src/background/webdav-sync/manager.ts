// Every WebDAV connection of this browser, behind one request handler.
// Credentials, baselines and the binary cache stay in extension-origin
// IndexedDB.
import * as LumnoNewtabWallpaperLocalStore from '../../shared/wallpaper-local-store';
import * as LumnoSettings from '../../domain/settings';
import type { WebDavRequest } from '../../domain/messages';
import { SYNC_REVISION } from './constants';
import {
  ConnectionRegistry,
  SerialQueue,
  connectionHints,
  failManager,
  localStorage,
  notifyRegistry,
  publishHints,
  sameConnection,
  syncStorage,
  keyFor
} from './manager-registry';
import type { ManagerPorts } from './manager-registry';
import { createPrivateStore, createProbeCache } from './private-store';
import { isRecord, isRecorded } from './records';
import type { ConnectionControllerOptions, ConnectionHint, ConnectionStatus, HandleResult, ManagerStatus, SyncResult, WebDavSyncManager } from './types';
import type { WebDavConnection } from '../webdav-client/types';
import { normalizeConfig } from '../webdav-client/config';
import { REVISION } from '../webdav-client/errors';

interface Manager {
  readonly ports: ManagerPorts;
  readonly registry: ConnectionRegistry;
  // Adding and removing connections, one at a time.
  readonly registryQueue: SerialQueue;
  readonly hintQueue: SerialQueue;
  // Settles once the saved connections are loaded and recovered.
  ready: Promise<void>;
  started: boolean;
}

// Two connections to the same account and directory would sync one remote
// with two independent baselines and treat each other's writes as changes.
async function assertUnique(manager: Manager, input: unknown, exceptId?: string): Promise<void> {
  let candidate: WebDavConnection;
  const fields = isRecord(input) ? input : {};
  try { candidate = normalizeConfig({ ...fields, password: fields.password || 'placeholder' }); }
  catch (_error) { return; }
  for (const id of manager.registry.ids) {
    if (id === exceptId) continue;
    const { config } = await manager.registry.worker(id).status();
    if (config && sameConnection(config, candidate)) failManager('duplicate-connection');
  }
}

async function managerStatus(manager: Manager): Promise<ManagerStatus> {
  await manager.ready;
  const connections = (await Promise.all(manager.registry.ids.map(async (id) => ({ id, ...await manager.registry.worker(id).status() })))).filter((item) => item.config);
  return { ...(connections[0] || { state: 'browser', enabled: false, config: null }),
    clientRevision: REVISION, syncRevision: SYNC_REVISION, connections, suggestions: await suggestions(manager, connections) };
}

// Synced connections this device has neither added nor dismissed.
async function suggestions(manager: Manager, connections: ReadonlyArray<ConnectionStatus>): Promise<ConnectionHint[]> {
  const syncKey = LumnoSettings.webdavConnections.key;
  const dismissedKey = LumnoSettings.webdavDismissedConnections.key;
  let hints: ConnectionHint[] = [];
  let dismissed: ConnectionHint[] = [];
  try {
    hints = connectionHints((await syncStorage(manager.ports.chrome, 'get', [syncKey]))[syncKey]);
    dismissed = connectionHints((await localStorage(manager.ports.chrome, 'get', [dismissedKey]))[dismissedKey]);
  } catch (_error) { return []; }
  const known: ConnectionHint[] = [...connections.flatMap((item) => (item.config ? [item.config] : [])), ...dismissed];
  return hints.filter((hint) => !known.some((config) => sameConnection(config, hint)));
}

async function dismissSuggestion(manager: Manager, input: unknown): Promise<SyncResult> {
  const key = LumnoSettings.webdavDismissedConnections.key;
  const [hint] = connectionHints({ version: 1, items: [input] });
  if (!hint) failManager('connection-missing');
  const current = connectionHints((await localStorage(manager.ports.chrome, 'get', [key]))[key]);
  await localStorage(manager.ports.chrome, 'set', { [key]: { version: 1, items: connectionHints({ version: 1, items: [...current, hint] }) } });
  return { ok: true };
}

function startManager(manager: Manager): void {
  if (manager.started) return;
  manager.started = true;
  // Another device withdrawing a connection this one still uses puts it
  // back at once, so a new device never misses it in the meantime.
  manager.ports.chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes[LumnoSettings.webdavConnections.key]) return;
    manager.ready.then(async () => publishHints(manager.ports, manager.hintQueue, [], await Promise.all(manager.registry.ids.map((id) => manager.registry.configOf(id))))).catch(() => {});
  });
  manager.ready.then(() => Promise.all(manager.registry.ids.map(async (id) => {
    const current = await manager.registry.worker(id).status();
    if (current.enabled) {
      await manager.registry.worker(id).handle({ operation: 'schedule' });
      await manager.registry.worker(id).handle({ operation: 'sync' });
    }
  }))).catch((cause: unknown) => {
    // A failed round is already on its card; only the rest is logged.
    if (!cause || !isRecorded(cause)) (manager.ports.options.logger || globalThis.console).warn('[Lumno] Could not start WebDAV sync.', cause);
  });
}

async function handleManagerRequest(manager: Manager, request: WebDavRequest): Promise<HandleResult | ManagerStatus | (HandleResult & { id: string })> {
  await manager.ready;
  if (request.operation === 'status') return managerStatus(manager);
  if (request.operation === 'dismissSuggestion') return dismissSuggestion(manager, request.config);
  if (request.operation === 'add' || (request.operation === 'test' && !request.id)) {
    return manager.registryQueue.run(async () => {
      if (request.operation === 'add') await assertUnique(manager, request.config);
      const id = manager.ports.crypto.randomUUID();
      const controller = manager.registry.worker(id);
      let retained = false;
      const retain = async (): Promise<void> => {
        await manager.registry.saveIds([...manager.registry.ids, id]);
        retained = true;
        await notifyRegistry(manager.ports);
      };
      try {
        let result = await controller.handle({ ...request, operation: request.operation === 'add' ? 'save' : 'test' });
        if (request.operation === 'add' && request.enable === true) {
          // The card appears only once the server is verified, so a typo
          // stays in the form instead of becoming a broken connection.
          try { result = await controller.handle({ operation: 'enable' }); }
          catch (cause) {
            if (await manager.registry.hasLocalHistory(id)) await retain();
            throw cause;
          }
        }
        if (request.operation === 'add') {
          await retain();
          await publishHints(manager.ports, manager.hintQueue, [], [await manager.registry.configOf(id)]);
        }
        return { ...result, id };
      } finally {
        if (!retained) await manager.registry.discard(id);
      }
    });
  }
  const id = request.id || (manager.registry.ids.length === 1 ? manager.registry.ids[0] : null);
  if (!id || !manager.registry.ids.includes(id)) failManager('connection-missing');
  if (request.operation === 'save') {
    await assertUnique(manager, request.config, id);
    const before = await manager.registry.configOf(id);
    const result = await manager.registry.worker(id).handle(request);
    await publishHints(manager.ports, manager.hintQueue, [before], [await manager.registry.configOf(id)]);
    return result;
  }
  if (request.operation === 'remove') {
    return manager.registryQueue.run(async () => {
      if (!manager.registry.ids.includes(id)) failManager('connection-missing');
      await manager.registry.worker(id).handle({ operation: 'recover' });
      if (await manager.ports.store.get(keyFor(id, 'recoveryBlocked'))) failManager('interrupted-apply');
      const removed = await manager.registry.configOf(id);
      await manager.registry.worker(id).stop();
      // Remove the index first: a restart cannot revive this connection.
      await manager.registry.saveIds(manager.registry.ids.filter((value) => value !== id));
      await manager.registry.discard(id);
      await notifyRegistry(manager.ports);
      await publishHints(manager.ports, manager.hintQueue, [removed], []);
      return { ok: true };
    });
  }
  return manager.registry.worker(id).handle(request);
}

// Loads the saved connections, then lets connections added before hints
// existed reach other devices too.
async function loadConnections(manager: Manager): Promise<void> {
  await manager.registry.load();
  await publishHints(manager.ports, manager.hintQueue, [], await Promise.all(manager.registry.ids.map((id) => manager.registry.configOf(id))));
}

function createController(options?: ConnectionControllerOptions | null): Readonly<WebDavSyncManager> {
  const opts = options || {};
  const ports: ManagerPorts = {
    chrome: opts.chrome || chrome,
    crypto: opts.crypto || globalThis.crypto,
    store: opts.privateStore || createPrivateStore(globalThis.indexedDB),
    wallpaperStore: opts.wallpaperStore ||
      LumnoNewtabWallpaperLocalStore.createWallpaperLocalStore({ windowObj: globalThis, onChange() {} }),
    probeCache: opts.probeCache || createProbeCache(),
    options: opts
  };
  const manager: Manager = {
    ports,
    registry: new ConnectionRegistry(ports),
    registryQueue: new SerialQueue(),
    hintQueue: new SerialQueue(),
    ready: Promise.resolve(),
    started: false
  };
  manager.ready = loadConnections(manager);
  return Object.freeze({
    start: () => startManager(manager),
    status: () => managerStatus(manager),
    handle: (request: WebDavRequest) => handleManagerRequest(manager, request)
  });
}

export { createController };
