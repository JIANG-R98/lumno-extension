// Connecting to a server, pausing, and the connection's status.
import type { WebDavState } from '../../domain/webdav-contract';
import { capture } from './capture';
import { ACCOUNT_FIELDS, CONNECTION_FIELDS, INITIAL_DECISIONS, SYNC_REVISION } from './constants';
import { apply, mirrorChrome, mirrorReporting, prepareChrome } from './local-apply';
import { errorCode, errorField, isRecord } from './records';
import { publish, readRemote, releaseOwnStaleLock, verifiedClient } from './remote';
import { fail, saveConfig, session, setStatus, storage } from './runtime';
import { guardedSync, schedule } from './sync-round';
import type { Captured, ConnectionContext, ConnectionHint, ConnectionStatus, RemoteState, StoredConnection, SyncResult } from './types';
import type { WebDavClient, WebDavConnection } from '../webdav-client/types';

function sameAccount(left: ConnectionHint, right: ConnectionHint): boolean {
  return ACCOUNT_FIELDS.every((key) => left[key] === right[key]);
}

function sameCredentials(left: WebDavConnection, right: WebDavConnection): boolean {
  return CONNECTION_FIELDS.every((key) => left[key] === right[key]);
}

async function connection(ctx: ConnectionContext, input: unknown): Promise<StoredConnection> {
  const { config: previous } = await session(ctx);
  const fields = isRecord(input) ? input : {};
  const candidate: StoredConnection = ctx.clientApi.normalizeConfig({ ...fields,
    password: fields.password || (previous && previous.password) || 'placeholder' });
  if (!fields.password && (!previous || candidate.endpoint !== previous.endpoint || candidate.username !== previous.username)) fail(ctx, 'missing-credentials');
  if (previous && previous.clientRevision === ctx.clientApi.REVISION && sameCredentials(candidate, previous)) {
    candidate.concurrency = previous.concurrency;
    candidate.lockStrategy = previous.lockStrategy;
    candidate.clientRevision = previous.clientRevision;
  }
  return candidate;
}


// The state a first join starts from: this device's, the server's, or this
// device's with the server's wallpapers merged in.
function joinTarget(ctx: ConnectionContext, captured: Captured, remote: RemoteState | null, decision?: string): WebDavState {
  if (remote && decision === 'remote') return ctx.contract.adoptRemote(captured.state, remote.state);
  if (remote && decision === 'merge') return ctx.contract.mergeInitialWallpapers(captured.state, remote.state);
  return captured.state;
}

// Saves the joined state as the baseline, applying it here first when it
// differs from what this device holds.
async function settleJoinedState(
  ctx: ConnectionContext,
  config: StoredConnection,
  target: WebDavState,
  captured: Captured,
  client: WebDavClient
): Promise<void> {
  if (ctx.opts.managed && ctx.contract.equal(target, captured.state) && ctx.runtime.isActiveAreaName('sync')) {
    if (captured.generation !== ctx.generation) fail(ctx, 'local-changed');
    await ctx.privateStore.put('session', { config: { ...config, enabled: true }, base: target });
    await ctx.privateStore.put('recoveryBlocked', false);
  } else await apply(ctx, target, captured, client, true, { config: { ...config, enabled: true }, base: target });
}

async function connect(ctx: ConnectionContext, input: unknown, decision?: string): Promise<SyncResult> {
  const config = await connection(ctx, input);
  const client = await verifiedClient(ctx, config);
  const { config: previous, base } = await session(ctx);
  if (previous && sameCredentials(config, previous)) {
    // Persist only capabilities belonging to this exact saved connection.
    // Repeated toggles and worker restarts don't rerun destructive probes.
    await saveConfig(ctx, { ...config, enabled: previous.enabled });
  }
  if (previous && sameAccount(config, previous)) await releaseOwnStaleLock(ctx, client);
  const remote = await readRemote(ctx, client);
  // Turning the same account back on resumes from the saved baseline.
  if (!decision && previous && base && sameAccount(config, previous)) {
    await saveConfig(ctx, { ...config, enabled: true });
    await setStatus(ctx, { enabled: true });
    schedule(ctx);
    return guardedSync(ctx);
  }
  if (remote && !INITIAL_DECISIONS.includes(decision)) {
    await setStatus(ctx, { state: 'choice', conflicts: [], error: null });
    return { needsChoice: true };
  }
  const captured = await capture(ctx, INITIAL_DECISIONS.includes(decision));
  await ctx.privateStore.put('migrationBackup', { captured, savedAt: Date.now() });
  await ctx.privateStore.put('migrationBackupMeta', { savedAt: Date.now() });
  const target = joinTarget(ctx, captured, remote, decision);
  await prepareChrome(ctx, target, captured);
  if (!remote || decision === 'local' || !ctx.contract.sameContent(target, remote.state)) {
    await publish(ctx, target, remote, client, captured.generation);
  }
  await settleJoinedState(ctx, config, target, captured, client);
  await ctx.privateStore.put('conflict', null);
  // The server answered every request of a full join, so a later refusal
  // starts again from the shortest wait.
  await ctx.privateStore.put('throttle', null);
  await mirrorReporting(ctx);
  await setStatus(ctx, { state: 'ready', enabled: true, error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
  schedule(ctx);
  return { ok: true };
}

// A failed enable keeps the connection paused but leaves its reason on the
// card, instead of a transient message that disappears on refresh.
async function connectReporting(ctx: ConnectionContext, input: unknown, decision?: string): Promise<SyncResult> {
  try { return await connect(ctx, input, decision); }
  catch (cause) {
    const code = errorCode(cause);
    const diagnostic = ctx.clientApi.diagnostic(errorField(cause, 'diagnostic'));
    if (code !== 'local-changed') await setStatus(ctx, { error: code || 'sync-failed', diagnostic }).catch(() => {});
    throw code ? Object.assign(ctx.clientApi.error(code), { diagnostic }) : cause;
  }
}

async function pause(ctx: ConnectionContext): Promise<SyncResult> {
  const { config } = await session(ctx);
  if (config) await saveConfig(ctx, { ...config, enabled: false });
  await ctx.privateStore.put('throttle', null);
  await setStatus(ctx, { state: 'paused', enabled: false, error: null, diagnostic: null });
  if (ctx.timer) { clearTimeout(ctx.timer); ctx.timer = null; }
  if (ctx.chromeApi.alarms && typeof ctx.chromeApi.alarms.clear === 'function') await ctx.chromeApi.alarms.clear(ctx.alarmName);
  return { ok: true };
}

async function useBrowserSync(ctx: ConnectionContext): Promise<SyncResult> {
  await ctx.runtime.ready;
  if (!ctx.runtime.isActiveAreaName('local')) return pause(ctx);
  const capturedGeneration = ctx.generation;
  const plan = await mirrorChrome(ctx);
  if (!plan.complete) fail(ctx, 'chrome-capacity');
  await pause(ctx);
  if (capturedGeneration !== ctx.generation) fail(ctx, 'local-changed');
  await storage(ctx, ctx.localPrefsArea, 'set', { [ctx.settings.localPrimary.key]: false });
  await setStatus(ctx, { state: 'browser', chromeBackup: 'complete' });
  return { ok: true };
}

async function status(ctx: ConnectionContext): Promise<ConnectionStatus> {
  await ctx.runtime.ready;
  const { config } = await session(ctx);
  const values = await storage(ctx, ctx.localPrefsArea, 'get', [ctx.statusKey]);
  const saved = values[ctx.statusKey];
  return { ...(isRecord(saved) ? saved : { state: 'browser' }),
    clientRevision: ctx.clientApi.REVISION,
    syncRevision: SYNC_REVISION,
    localPrimary: ctx.runtime.isActiveAreaName('local'), enabled: Boolean(config && config.enabled),
    config: config ? { endpoint: config.endpoint, directory: config.directory, username: config.username,
      concurrency: config.concurrency || 'conditional', hasPassword: true } : null,
    hasMigrationBackup: Boolean(await ctx.privateStore.get('replacementBackupMeta') || await ctx.privateStore.get('migrationBackupMeta')),
    needsRecovery: Boolean(await ctx.privateStore.get('recoveryBlocked')) };
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
