// Reading and writing the server's state, its lock and its snapshots.
import { SNAPSHOT_SLOTS } from './constants';
import { uploadAssets } from './media';
import { isRecord } from './records';
import { fail, report } from './runtime';
import type { RemoteState, StoredConnection } from './types';
import type { Connection } from './connection';
import type { StaleLockMarker, WebDavClient } from '../webdav-client/types';
import type { WebDavState } from '../../domain/webdav/types';
import { validateState } from '../../domain/webdav/validation';
import { createClient } from '../webdav-client/client';
import { REVISION, isWebDavError } from '../webdav-client/errors';

async function readRemote(conn: Connection, client: WebDavClient): Promise<RemoteState | null> {
  const remote = await client.readState();
  return remote && { state: validateState(remote.state), etag: remote.etag };
}

// A write lock this device took but could not release would hold every
// device at remote-locked. It is retried once at once and otherwise
// remembered, so the next round releases it before anything else.
async function releaseOwnStaleLock(conn: Connection, client: WebDavClient): Promise<void> {
  const marker = await conn.ports.privateStore.get('staleLock');
  if (!marker || typeof client.releaseStaleLock !== 'function') return;
  try { if (await client.releaseStaleLock(marker)) await conn.ports.privateStore.put('staleLock', null); }
  catch (cause) { report(conn, 'Could not release a WebDAV write lock left by this device.', cause); }
}

async function rememberStaleLock(conn: Connection, client: WebDavClient, marker: StaleLockMarker): Promise<void> {
  if (!marker.uncertain) {
    try { if (await client.releaseStaleLock(marker)) return; }
    catch (_cause) { /* Kept for the next round below. */ }
  }
  await conn.ports.privateStore.put('staleLock', marker);
}

async function writeState(conn: Connection, client: WebDavClient, state: WebDavState, remote: RemoteState | null): Promise<{ state: unknown; etag: string }> {
  let written;
  try { written = await client.writeState(state, remote && remote.etag); }
  catch (cause) {
    if (isWebDavError(cause) && cause.staleLock) await rememberStaleLock(conn, client, cause.staleLock);
    throw cause;
  }
  if (written && written.staleLock) await rememberStaleLock(conn, client, written.staleLock);
  return written;
}

async function publish(conn: Connection, state: WebDavState, remote: RemoteState | null, client: WebDavClient, capturedGeneration: number): Promise<RemoteState> {
  if (capturedGeneration !== conn.edits.generation) fail(conn, 'local-changed');
  await uploadAssets(conn, state, client, remote && remote.state.assets);
  if (remote) await archiveSnapshot(conn, remote.state, client);
  if (capturedGeneration !== conn.edits.generation) fail(conn, 'local-changed');
  // The client already read the state back under the lock and compared it.
  const written = await writeState(conn, client, state, remote);
  return { state: validateState(written.state), etag: written.etag };
}

// Each device keeps its last SNAPSHOT_SLOTS copies of the server state it
// replaced, overwriting the oldest, so snapshots never pile up. Older
// clients' randomly named snapshots are left alone.
async function archiveSnapshot(conn: Connection, remoteState: WebDavState, client: WebDavClient): Promise<void> {
  const saved = await conn.ports.privateStore.get('snapshotRing');
  const ring = isRecord(saved) && typeof saved.device === 'string' && /^[-\w]{1,80}$/.test(saved.device) &&
    typeof saved.next === 'number' && Number.isInteger(saved.next)
    ? { device: saved.device, next: saved.next } : { device: conn.ports.crypto.randomUUID(), next: 0 };
  const slot = ((ring.next % SNAPSHOT_SLOTS) + SNAPSHOT_SLOTS) % SNAPSHOT_SLOTS;
  const archived = await client.request(`snapshots/${ring.device}-${slot}.json`, 'PUT', JSON.stringify(remoteState),
    { 'Content-Type': 'application/json' });
  if (![200, 201, 204].includes(archived.status)) fail(conn, 'write-failed');
  await conn.ports.privateStore.put('snapshotRing', { device: ring.device, next: (slot + 1) % SNAPSHOT_SLOTS });
}

async function readConflict(conn: Connection): Promise<{ local: WebDavState; remote: WebDavState; keys: string[] } | null> {
  const conflict = await conn.ports.privateStore.get('conflict');
  if (!isRecord(conflict)) return null;
  try {
    const keys: unknown[] = Array.isArray(conflict.keys) ? conflict.keys : [];
    return { local: validateState(conflict.local), remote: validateState(conflict.remote),
      keys: keys.filter((key): key is string => typeof key === 'string') };
  } catch (_cause) { return null; }
}

async function verifiedClient(conn: Connection, config: StoredConnection): Promise<WebDavClient> {
  const client = createClient(config, conn.ports.clientOptions);
  if (config.clientRevision !== REVISION) {
    const capabilities = conn.ports.probeCache.get(REVISION, config) || await client.testConnection();
    config.concurrency = capabilities.concurrency;
    config.lockStrategy = capabilities.lockStrategy;
    config.clientRevision = REVISION;
  }
  return client;
}

export {
  archiveSnapshot,
  publish,
  readConflict,
  readRemote,
  releaseOwnStaleLock,
  rememberStaleLock,
  verifiedClient,
  writeState
};
