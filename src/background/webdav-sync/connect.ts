// Connecting to a server, pausing, and the connection's status.
import { capture } from './capture';
import { ACCOUNT_FIELDS, CONNECTION_FIELDS, INITIAL_DECISIONS, SYNC_REVISION } from './constants';
import { apply, mirrorChrome, mirrorReporting, prepareChrome } from './local-apply';
import { errorCode, errorField, isRecord } from './records';
import { publish, readRemote, releaseOwnStaleLock, verifiedClient } from './remote';
import { fail, saveConfig, session, setStatus, storage } from './runtime';
import { guardedSync, schedule } from './sync-round';
import type { Captured, ConnectionHint, ConnectionStatus, RemoteState, StoredConnection, SyncResult } from './types';
import type { Connection } from './connection';
import type { WebDavClient, WebDavConnection } from '../webdav-client/types';
import type { WebDavState } from '../../domain/webdav/types';
import { adoptRemote, mergeInitialWallpapers } from '../../domain/webdav/merge';
import { equal, sameContent } from '../../domain/webdav/state-base';
import { normalizeConfig } from '../webdav-client/config';
import { REVISION, diagnostic as readDiagnostic, error } from '../webdav-client/errors';
import * as LumnoSettings from '../../domain/settings';

function sameAccount(left: ConnectionHint, right: ConnectionHint): boolean {
  return ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
}

function sameCredentials(left: WebDavConnection, right: WebDavConnection): boolean {
  return CONNECTION_FIELDS.every((key) => left[key] === right[key]);
}

async function connection(conn: Connection, input: unknown): Promise<StoredConnection> {
  const { config: previous } = await session(conn);
  const fields = isRecord(input) ? input : {};
  const candidate: StoredConnection = normalizeConfig({ ...fields,
    password: fields.password || (previous && previous.password) || 'placeholder' });
  if (!fields.password && (!previous || candidate.endpoint !== previous.endpoint || candidate.username !== previous.username)) fail(conn, 'missing-credentials');
  if (previous && previous.clientRevision === REVISION && sameCredentials(candidate, previous)) {
    candidate.concurrency = previous.concurrency;
    candidate.lockStrategy = previous.lockStrategy;
    candidate.clientRevision = previous.clientRevision;
  }
  return candidate;
}


// The state a first join starts from: this device's, the server's, or this
// device's with the server's wallpapers merged in.
function joinTarget(conn: Connection, captured: Captured, remote: RemoteState | null, decision?: string): WebDavState {
  if (remote && decision === 'remote') return adoptRemote(captured.state, remote.state);
  if (remote && decision === 'merge') return mergeInitialWallpapers(captured.state, remote.state);
  return captured.state;
}

// Saves the joined state as the baseline, applying it here first when it
// differs from what this device holds.
async function settleJoinedState(
  conn: Connection,
  config: StoredConnection,
  target: WebDavState,
  captured: Captured,
  client: WebDavClient
): Promise<void> {
  if (conn.ports.managed && equal(target, captured.state) && conn.ports.runtime.isActiveAreaName('sync')) {
    if (captured.generation !== conn.edits.generation) fail(conn, 'local-changed');
    await conn.ports.privateStore.put('session', { config: { ...config, enabled: true }, base: target });
    await conn.ports.privateStore.put('recoveryBlocked', false);
  } else await apply(conn, target, captured, client, true, { config: { ...config, enabled: true }, base: target });
}

async function connect(conn: Connection, input: unknown, decision?: string): Promise<SyncResult> {
  const config = await connection(conn, input);
  const client = await verifiedClient(conn, config);
  const { config: previous, base } = await session(conn);
  if (previous && sameCredentials(config, previous)) {
    // Persist only capabilities belonging to this exact saved connection.
    // Repeated toggles and worker restarts don't rerun destructive probes.
    await saveConfig(conn, { ...config, enabled: previous.enabled });
  }
  if (previous && sameAccount(config, previous)) await releaseOwnStaleLock(conn, client);
  const remote = await readRemote(conn, client);
  // Turning the same account back on resumes from the saved baseline.
  if (!decision && previous && base && sameAccount(config, previous)) {
    await saveConfig(conn, { ...config, enabled: true });
    await setStatus(conn, { enabled: true });
    schedule(conn);
    return guardedSync(conn);
  }
  if (remote && !INITIAL_DECISIONS.includes(decision)) {
    await setStatus(conn, { state: 'choice', conflicts: [], error: null });
    return { needsChoice: true };
  }
  const captured = await capture(conn, INITIAL_DECISIONS.includes(decision));
  await conn.ports.privateStore.put('migrationBackup', { captured, savedAt: Date.now() });
  await conn.ports.privateStore.put('migrationBackupMeta', { savedAt: Date.now() });
  const target = joinTarget(conn, captured, remote, decision);
  await prepareChrome(conn, target, captured);
  if (!remote || decision === 'local' || !sameContent(target, remote.state)) {
    await publish(conn, target, remote, client, captured.generation);
  }
  await settleJoinedState(conn, config, target, captured, client);
  await conn.ports.privateStore.put('conflict', null);
  // The server answered every request of a full join, so a later refusal
  // starts again from the shortest wait.
  await conn.ports.privateStore.put('throttle', null);
  await mirrorReporting(conn);
  await setStatus(conn, { state: 'ready', enabled: true, error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
  schedule(conn);
  return { ok: true };
}

// A failed enable keeps the connection paused but leaves its reason on the
// card, instead of a transient message that disappears on refresh.
async function connectReporting(conn: Connection, input: unknown, decision?: string): Promise<SyncResult> {
  try { return await connect(conn, input, decision); }
  catch (cause) {
    const code = errorCode(cause);
    const diagnostic = readDiagnostic(errorField(cause, 'diagnostic'));
    if (code !== 'local-changed') await setStatus(conn, { error: code || 'sync-failed', diagnostic }).catch(() => {});
    throw code ? Object.assign(error(code), { diagnostic }) : cause;
  }
}

async function pause(conn: Connection): Promise<SyncResult> {
  const { config } = await session(conn);
  if (config) await saveConfig(conn, { ...config, enabled: false });
  await conn.ports.privateStore.put('throttle', null);
  await setStatus(conn, { state: 'paused', enabled: false, error: null, diagnostic: null });
  if (conn.schedule.timer) { clearTimeout(conn.schedule.timer); conn.schedule.timer = null; }
  if (conn.ports.chrome.alarms && typeof conn.ports.chrome.alarms.clear === 'function') await conn.ports.chrome.alarms.clear(conn.ports.alarmName);
  return { ok: true };
}

async function useBrowserSync(conn: Connection): Promise<SyncResult> {
  await conn.ports.runtime.ready;
  if (!conn.ports.runtime.isActiveAreaName('local')) return pause(conn);
  const capturedGeneration = conn.edits.generation;
  const plan = await mirrorChrome(conn);
  if (!plan.complete) fail(conn, 'chrome-capacity');
  await pause(conn);
  if (capturedGeneration !== conn.edits.generation) fail(conn, 'local-changed');
  await storage(conn, conn.ports.localArea, 'set', { [LumnoSettings.localPrimary.key]: false });
  await setStatus(conn, { state: 'browser', chromeBackup: 'complete' });
  return { ok: true };
}

async function status(conn: Connection): Promise<ConnectionStatus> {
  await conn.ports.runtime.ready;
  const { config } = await session(conn);
  const values = await storage(conn, conn.ports.localArea, 'get', [conn.ports.statusKey]);
  const saved = values[conn.ports.statusKey];
  return { ...(isRecord(saved) ? saved : { state: 'browser' }),
    clientRevision: REVISION,
    syncRevision: SYNC_REVISION,
    localPrimary: conn.ports.runtime.isActiveAreaName('local'), enabled: Boolean(config && config.enabled),
    config: config ? { endpoint: config.endpoint, directory: config.directory, username: config.username,
      concurrency: config.concurrency || 'conditional', hasPassword: true } : null,
    hasMigrationBackup: Boolean(await conn.ports.privateStore.get('replacementBackupMeta') || await conn.ports.privateStore.get('migrationBackupMeta')),
    needsRecovery: Boolean(await conn.ports.privateStore.get('recoveryBlocked')) };
}

export {
  connect,
  connectReporting,
  connection,
  pause,
  sameAccount,
  sameCredentials,
  status,
  useBrowserSync
};
