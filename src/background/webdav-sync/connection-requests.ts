// Requests from the Options page to one connection.
import type { WebDavRequest } from '../../domain/messages';
import { capture } from './capture';
import { connection, connectReporting, pause, sameAccount, sameCredentials, status, useBrowserSync } from './connect';
import { apply, mirrorReporting, recoverPendingApply } from './local-apply';
import { isRecord } from './records';
import { readConflict } from './remote';
import { fail, session, setStatus } from './runtime';
import { guardedSync, schedule } from './sync-round';
import type { HandleResult, SyncResult } from './types';
import type { Connection } from './connection';
import type { ConnectionCapabilities } from '../webdav-client/types';
import type { WebDavState } from '../../domain/webdav/types';
import { describeConflict } from '../../domain/webdav/conflicts';
import { validateState } from '../../domain/webdav/validation';
import { createClient } from '../webdav-client/client';
import { REVISION } from '../webdav-client/errors';

async function saveConnection(conn: Connection, request: WebDavRequest): Promise<HandleResult> {
  const config = await connection(conn, request.config);
  const previous = await session(conn);
  const previousConfig = previous.config;
  // Saving an unchanged form must not interrupt a running connection.
  if (previousConfig && sameCredentials(previousConfig, config)) {
    return { ok: true, unchanged: true };
  }
  const wasEnabled = Boolean(previousConfig && previousConfig.enabled);
  const sameServer = Boolean(previousConfig && sameAccount(previousConfig, config));
  await conn.ports.privateStore.put('session', { config: { ...config, enabled: false }, base: sameServer ? previous.base : null });
  // A lock left on the old server is not this connection's any more.
  if (!sameServer) await conn.ports.privateStore.put('staleLock', null);
  await pause(conn);
  await setStatus(conn, { conflicts: [], ...(!sameServer ? { lastSyncAt: null } : {}) });
  if (wasEnabled && request.resume === true) return { ...await connectReporting(conn, (await session(conn)).config), resumed: true };
  return { ok: true };
}

async function testConnection(conn: Connection, request: WebDavRequest): Promise<ConnectionCapabilities> {
  const config = await connection(conn, request.config);
  const capabilities = await createClient(config, conn.ports.clientOptions).testConnection();
  conn.ports.probeCache.set(REVISION, config, { concurrency: capabilities.concurrency, lockStrategy: capabilities.lockStrategy });
  return capabilities;
}

async function enableConnection(conn: Connection, request: WebDavRequest): Promise<SyncResult> {
  const { config } = await session(conn);
  if (!config) fail(conn, 'missing-credentials');
  return connectReporting(conn, config, request.decision);
}

async function conflictDetails(conn: Connection): Promise<HandleResult> {
  const conflict = await readConflict(conn);
  const { base } = await session(conn);
  if (!conflict || !base) return { items: [] };
  let validBase: WebDavState;
  try { validBase = validateState(base); } catch (_cause) { return { items: [] }; }
  return { items: describeConflict(validBase, conflict.local, conflict.remote, conflict.keys) };
}

async function restoreBackup(conn: Connection): Promise<HandleResult> {
  const backup = await conn.ports.privateStore.get('replacementBackup') || await conn.ports.privateStore.get('migrationBackup');
  if (!isRecord(backup)) fail(conn, 'backup-missing');
  const backupState = validateState(isRecord(backup.captured) ? backup.captured.state : undefined);
  const captured = await capture(conn, true);
  const { config, base } = await session(conn);
  await apply(conn, backupState, captured, config ? createClient(config, conn.ports.clientOptions) : null, true,
    { config: config ? { ...config, enabled: false } : null, base });
  await mirrorReporting(conn);
  await setStatus(conn, { state: 'paused', enabled: false, error: null });
  return { ok: true };
}

async function handle(conn: Connection, request: WebDavRequest): Promise<HandleResult> {
  await conn.ports.runtime.ready;
  await recoverPendingApply(conn);
  switch (request.operation) {
    case 'recover': return { ok: true };
    case 'schedule': schedule(conn); return { ok: true };
    case 'status': return status(conn);
    case 'save': return saveConnection(conn, request);
    case 'test': return testConnection(conn, request);
    case 'enable': return enableConnection(conn, request);
    case 'connect': return connectReporting(conn, request.config, request.decision);
    case 'conflictDetails': return conflictDetails(conn);
    case 'sync': return guardedSync(conn, request.decision);
    case 'pause': return pause(conn);
    case 'browser': return useBrowserSync(conn);
    case 'restoreBackup': return restoreBackup(conn);
    default: fail(conn, 'unknown-operation');
  }
}

export { handle };
