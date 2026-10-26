// Requests from the Options page to one connection.
import type { WebDavRequest } from '../../domain/messages';
import type { WebDavState } from '../../domain/webdav-contract';
import { capture } from './capture';
import { connection, connectReporting, pause, sameAccount, sameCredentials, status, useBrowserSync } from './connect';
import { apply, mirrorReporting, recoverPendingApply } from './local-apply';
import { isRecord } from './records';
import { readConflict } from './remote';
import { fail, session, setStatus } from './runtime';
import { guardedSync, schedule } from './sync-round';
import type { ConnectionContext, HandleResult, SyncResult } from './types';
import type { ConnectionCapabilities } from '../webdav-client/types';

async function saveConnection(ctx: ConnectionContext, request: WebDavRequest): Promise<HandleResult> {
  const config = await connection(ctx, request.config);
  const previous = await session(ctx);
  const previousConfig = previous.config;
  // Saving an unchanged form must not interrupt a running connection.
  if (previousConfig && sameCredentials(previousConfig, config)) {
    return { ok: true, unchanged: true };
  }
  const wasEnabled = Boolean(previousConfig && previousConfig.enabled);
  const sameServer = Boolean(previousConfig && sameAccount(previousConfig, config));
  await ctx.privateStore.put('session', { config: { ...config, enabled: false }, base: sameServer ? previous.base : null });
  // A lock left on the old server is not this connection's any more.
  if (!sameServer) await ctx.privateStore.put('staleLock', null);
  await pause(ctx);
  await setStatus(ctx, { conflicts: [], ...(!sameServer ? { lastSyncAt: null } : {}) });
  if (wasEnabled && request.resume === true) return { ...await connectReporting(ctx, (await session(ctx)).config), resumed: true };
  return { ok: true };
}

async function testConnection(ctx: ConnectionContext, request: WebDavRequest): Promise<ConnectionCapabilities> {
  const config = await connection(ctx, request.config);
  const capabilities = await ctx.clientApi.createClient(config, ctx.opts.clientOptions).testConnection();
  ctx.probeCache.set(ctx.clientApi.REVISION, config, { concurrency: capabilities.concurrency, lockStrategy: capabilities.lockStrategy });
  return capabilities;
}

async function enableConnection(ctx: ConnectionContext, request: WebDavRequest): Promise<SyncResult> {
  const { config } = await session(ctx);
  if (!config) fail(ctx, 'missing-credentials');
  return connectReporting(ctx, config, request.decision);
}

async function conflictDetails(ctx: ConnectionContext): Promise<HandleResult> {
  const conflict = await readConflict(ctx);
  const { base } = await session(ctx);
  if (!conflict || !base) return { items: [] };
  let validBase: WebDavState;
  try { validBase = ctx.contract.validateState(base); } catch (_cause) { return { items: [] }; }
  return { items: ctx.contract.describeConflict(validBase, conflict.local, conflict.remote, conflict.keys) };
}

async function restoreBackup(ctx: ConnectionContext): Promise<HandleResult> {
  const backup = await ctx.privateStore.get('replacementBackup') || await ctx.privateStore.get('migrationBackup');
  if (!isRecord(backup)) fail(ctx, 'backup-missing');
  const backupState = ctx.contract.validateState(isRecord(backup.captured) ? backup.captured.state : undefined);
  const captured = await capture(ctx, true);
  const { config, base } = await session(ctx);
  await apply(ctx, backupState, captured, config ? ctx.clientApi.createClient(config, ctx.opts.clientOptions) : null, true,
    { config: config ? { ...config, enabled: false } : null, base });
  await mirrorReporting(ctx);
  await setStatus(ctx, { state: 'paused', enabled: false, error: null });
  return { ok: true };
}

async function handle(ctx: ConnectionContext, request: WebDavRequest): Promise<HandleResult> {
  await ctx.runtime.ready;
  await recoverPendingApply(ctx);
  switch (request.operation) {
    case 'recover': return { ok: true };
    case 'schedule': schedule(ctx); return { ok: true };
    case 'status': return status(ctx);
    case 'save': return saveConnection(ctx, request);
    case 'test': return testConnection(ctx, request);
    case 'enable': return enableConnection(ctx, request);
    case 'connect': return connectReporting(ctx, request.config, request.decision);
    case 'conflictDetails': return conflictDetails(ctx);
    case 'sync': return guardedSync(ctx, request.decision);
    case 'pause': return pause(ctx);
    case 'browser': return useBrowserSync(ctx);
    case 'restoreBackup': return restoreBackup(ctx);
    default: fail(ctx, 'unknown-operation');
  }
}

export { handle };
