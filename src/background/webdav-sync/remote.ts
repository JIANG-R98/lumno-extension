// Reading and writing the server's state, its lock and its snapshots.
import type { WebDavState } from '../../domain/webdav-contract';
import { SNAPSHOT_SLOTS } from './constants';
import { uploadAssets } from './media';
import { isRecord } from './records';
import { fail, report } from './runtime';
import type { ConnectionContext, RemoteState, StoredConnection } from './types';
import type { StaleLockMarker, WebDavClient } from '../webdav-client/types';

async function readRemote(ctx: ConnectionContext, client: WebDavClient): Promise<RemoteState | null> {
  const remote = await client.readState();
  return remote && { state: ctx.contract.validateState(remote.state), etag: remote.etag };
}

// A write lock this device took but could not release would hold every
// device at remote-locked. It is retried once at once and otherwise
// remembered, so the next round releases it before anything else.
async function releaseOwnStaleLock(ctx: ConnectionContext, client: WebDavClient): Promise<void> {
  const marker = await ctx.privateStore.get('staleLock');
  if (!marker || typeof client.releaseStaleLock !== 'function') return;
  try { if (await client.releaseStaleLock(marker)) await ctx.privateStore.put('staleLock', null); }
  catch (cause) { report(ctx, 'Could not release a WebDAV write lock left by this device.', cause); }
}

async function rememberStaleLock(ctx: ConnectionContext, client: WebDavClient, marker: StaleLockMarker): Promise<void> {
  if (!marker.uncertain) {
    try { if (await client.releaseStaleLock(marker)) return; }
    catch (_cause) { /* Kept for the next round below. */ }
  }
  await ctx.privateStore.put('staleLock', marker);
}

async function writeState(ctx: ConnectionContext, client: WebDavClient, state: WebDavState, remote: RemoteState | null): Promise<{ state: unknown; etag: string }> {
  let written;
  try { written = await client.writeState(state, remote && remote.etag); }
  catch (cause) {
    if (ctx.clientApi.isWebDavError(cause) && cause.staleLock) await rememberStaleLock(ctx, client, cause.staleLock);
    throw cause;
  }
  if (written && written.staleLock) await rememberStaleLock(ctx, client, written.staleLock);
  return written;
}

async function publish(ctx: ConnectionContext, state: WebDavState, remote: RemoteState | null, client: WebDavClient, capturedGeneration: number): Promise<RemoteState> {
  if (capturedGeneration !== ctx.generation) fail(ctx, 'local-changed');
  await uploadAssets(ctx, state, client, remote && remote.state.assets);
  if (remote) await archiveSnapshot(ctx, remote.state, client);
  if (capturedGeneration !== ctx.generation) fail(ctx, 'local-changed');
  // The client already read the state back under the lock and compared it.
  const written = await writeState(ctx, client, state, remote);
  return { state: ctx.contract.validateState(written.state), etag: written.etag };
}

// Each device keeps its last SNAPSHOT_SLOTS copies of the server state it
// replaced, overwriting the oldest, so snapshots never pile up. Older
// clients' randomly named snapshots are left alone.
async function archiveSnapshot(ctx: ConnectionContext, remoteState: WebDavState, client: WebDavClient): Promise<void> {
  const saved = await ctx.privateStore.get('snapshotRing');
  const ring = isRecord(saved) && typeof saved.device === 'string' && /^[-\w]{1,80}$/.test(saved.device) &&
    typeof saved.next === 'number' && Number.isInteger(saved.next)
    ? { device: saved.device, next: saved.next } : { device: ctx.cryptoApi.randomUUID(), next: 0 };
  const slot = ((ring.next % SNAPSHOT_SLOTS) + SNAPSHOT_SLOTS) % SNAPSHOT_SLOTS;
  const archived = await client.request(`snapshots/${ring.device}-${slot}.json`, 'PUT', JSON.stringify(remoteState),
    { 'Content-Type': 'application/json' });
  if (![200, 201, 204].includes(archived.status)) fail(ctx, 'write-failed');
  await ctx.privateStore.put('snapshotRing', { device: ring.device, next: (slot + 1) % SNAPSHOT_SLOTS });
}

async function readConflict(ctx: ConnectionContext): Promise<{ local: WebDavState; remote: WebDavState; keys: string[] } | null> {
  const conflict = await ctx.privateStore.get('conflict');
  if (!isRecord(conflict)) return null;
  try {
    const keys: unknown[] = Array.isArray(conflict.keys) ? conflict.keys : [];
    return { local: ctx.contract.validateState(conflict.local), remote: ctx.contract.validateState(conflict.remote),
      keys: keys.filter((key): key is string => typeof key === 'string') };
  } catch (_cause) { return null; }
}

async function verifiedClient(ctx: ConnectionContext, config: StoredConnection): Promise<WebDavClient> {
  const client = ctx.clientApi.createClient(config, ctx.opts.clientOptions);
  if (config.clientRevision !== ctx.clientApi.REVISION) {
    const capabilities = ctx.probeCache.get(ctx.clientApi.REVISION, config) || await client.testConnection();
    config.concurrency = capabilities.concurrency;
    config.lockStrategy = capabilities.lockStrategy;
    config.clientRevision = ctx.clientApi.REVISION;
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
