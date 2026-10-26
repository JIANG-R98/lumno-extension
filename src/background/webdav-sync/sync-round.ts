// One sync round, its retries and the background schedule that runs it.
import type { WebDavState } from '../../domain/webdav-contract';
import { syncMeta } from '../../domain/settings/sync-state';
import { capture } from './capture';
import { CONTENTION_CODES, INITIAL_DECISIONS, SWEEP_INTERVAL_MS, THROTTLE_CODES } from './constants';
import { apply, isOwnWrite, mirrorReporting, prepareChrome, recoverPendingApply } from './local-apply';
import { errorCode, errorField, ignoreRejection, isRecord, isRecorded, unrefTimer } from './records';
import { publish, readRemote, releaseOwnStaleLock, verifiedClient } from './remote';
import { exclusive, fail, holdKeepAlive, releaseKeepAlive, report, saveConfig, session, setStatus } from './runtime';
import type { Captured, ConnectionContext, RemoteState, StoredConnection, SyncResult } from './types';
import type { WebDavClient } from '../webdav-client/types';

// What this round publishes and applies: the merge of both sides against
// their shared baseline, or one side when the user chose it. A conflict or a
// missing choice ends the round with its result instead.
async function resolveSyncTarget(
  ctx: ConnectionContext,
  decision: string | undefined,
  base: unknown,
  captured: Captured,
  remote: RemoteState | null
): Promise<{ target: WebDavState } | { result: SyncResult }> {
  if (decision === 'merge') {
    if (!remote) fail(ctx, 'remote-missing');
    return { target: ctx.contract.mergeInitialWallpapers(captured.state, remote.state) };
  }
  if (base && remote && (decision === 'local' || decision === 'remote')) {
    return { target: ctx.contract.mergeStates(base, captured.state, remote.state, decision).state };
  }
  if (decision === 'local') return { target: captured.state };
  if (decision === 'remote') {
    if (!remote) fail(ctx, 'remote-missing');
    return { target: ctx.contract.adoptRemote(captured.state, remote.state) };
  }
  if (!remote) {
    if (base) fail(ctx, 'remote-missing');
    return { target: captured.state };
  }
  if (!base) {
    await setStatus(ctx, { state: 'choice', conflicts: [], error: null });
    return { result: { needsChoice: true } };
  }
  const merged = ctx.contract.mergeStates(base, captured.state, remote.state);
  if (merged.conflicts.length) {
    await ctx.privateStore.put('conflict', { local: captured.state, remote: remote.state, keys: merged.conflicts });
    await setStatus(ctx, { state: 'conflict', conflicts: merged.conflicts, error: null });
    return { result: { conflict: true } };
  }
  return { target: merged.state };
}

async function commitSyncTarget(
  ctx: ConnectionContext,
  config: StoredConnection,
  target: WebDavState,
  captured: Captured,
  client: WebDavClient
): Promise<void> {
  if (!ctx.contract.equal(target, captured.state)) {
    // The server now holds target: the captured state plus what only the
    // server changed. Until target is applied here, the captured state is
    // what both sides share. As the baseline it survives an apply that
    // fails below: published edits of this device are not reported again
    // as conflicts, and the server's changes are not taken for reverts.
    await ctx.privateStore.put('session', { config, base: captured.state });
    await apply(ctx, target, captured, client, false, { config, base: target });
  } else {
    await ctx.privateStore.put('session', { config, base: target });
    if (captured.generation !== ctx.generation) fail(ctx, 'local-changed');
  }
}

async function syncInternal(ctx: ConnectionContext, decision?: string): Promise<SyncResult> {
  const { config, base } = await session(ctx);
  if (!config || !config.enabled) return { paused: true };
  await setStatus(ctx, { state: 'syncing', error: null });
  const client = await verifiedClient(ctx, config);
  await saveConfig(ctx, config);
  await releaseOwnStaleLock(ctx, client);
  const captured = await capture(ctx, INITIAL_DECISIONS.includes(decision));
  const remote = await readRemote(ctx, client);
  if (INITIAL_DECISIONS.includes(decision)) {
    await ctx.privateStore.put('replacementBackup', { captured, savedAt: Date.now() });
    await ctx.privateStore.put('replacementBackupMeta', { savedAt: Date.now() });
  }
  const resolved = await resolveSyncTarget(ctx, decision, base, captured, remote);
  if ('result' in resolved) return resolved.result;
  const { target } = resolved;
  await prepareChrome(ctx, target, captured);
  if (!remote || !ctx.contract.sameContent(target, remote.state)) await publish(ctx, target, remote, client, captured.generation);
  await commitSyncTarget(ctx, config, target, captured, client);
  if (decision) await ctx.privateStore.put('recoveryBlocked', false);
  await ctx.privateStore.put('conflict', null);
  await mirrorReporting(ctx);
  await setStatus(ctx, { state: 'ready', error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
  await sweepDaily(ctx, client);
  return { ok: true };
}

// Folders of abandoned lock attempts pile up on the server otherwise; a
// daily sweep costs one listing. It never fails the sync that ran it.
async function sweepDaily(ctx: ConnectionContext, client: WebDavClient): Promise<void> {
  if (typeof client.sweepAbandoned !== 'function' || ctx.clock() - (Number(await ctx.privateStore.get('sweptAt')) || 0) < SWEEP_INTERVAL_MS) return;
  await ctx.privateStore.put('sweptAt', ctx.clock());
  try { await client.sweepAbandoned(); }
  catch (cause) { report(ctx, 'Could not remove abandoned WebDAV lock folders.', cause); }
}

async function guardedSync(ctx: ConnectionContext, decision?: string): Promise<SyncResult> {
  try {
    await recoverPendingApply(ctx);
    const result = await syncInternal(ctx, decision);
    ctx.contention = 0;
    if (await ctx.privateStore.get('throttle')) await ctx.privateStore.put('throttle', null);
    return result;
  } catch (cause) {
    const code = errorCode(cause);
    if (!decision && THROTTLE_CODES.includes(code) && !ctx.stopped) return throttled(ctx, cause);
    // A first-join choice is retried by the user, who is still on the page.
    if (!decision && CONTENTION_CODES.includes(code) && ctx.contention < ctx.contentionDelays.length && !ctx.stopped) {
      const delay = ctx.contentionDelays[ctx.contention] * (0.75 + Math.random() * 0.5);
      ctx.contention += 1;
      await setStatus(ctx, { state: 'pending', error: null, diagnostic: null });
      queueSync(ctx, delay, { keepAlive: true });
      return { pending: true };
    }
    ctx.contention = 0;
    const diagnostic = ctx.clientApi.diagnostic(errorField(cause, 'diagnostic'));
    await setStatus(ctx, { state: code === 'local-changed' ? 'pending' : code === 'remote-missing' ? 'choice' : 'error',
      error: code || 'sync-failed', diagnostic });
    // Callers without a page to report to know the card already shows it.
    throw Object.assign(ctx.clientApi.error(code || 'sync-failed'), { diagnostic, recorded: true });
  }
}

async function throttled(ctx: ConnectionContext, cause: unknown): Promise<SyncResult> {
  ctx.contention = 0;
  const previous = await ctx.privateStore.get('throttle');
  const attempt = isRecord(previous) && typeof previous.attempt === 'number' && Number.isInteger(previous.attempt)
    ? Math.min(previous.attempt + 1, ctx.throttleDelays.length - 1) : 0;
  const delay = Math.max(ctx.throttleDelays[attempt] * (0.9 + Math.random() * 0.2), Number(errorField(cause, 'retryAfterMs')) || 0);
  const retryAt = ctx.clock() + delay;
  await ctx.privateStore.put('throttle', { until: retryAt, attempt });
  await setStatus(ctx, { state: 'pending', error: errorCode(cause), diagnostic: null, retryAt });
  // The alarm also resumes after the wait if this worker is unloaded first.
  queueSync(ctx, delay);
  return { pending: true, retryAt };
}

// Rounds nobody asked for skip the server while it is refusing requests.
// A saved end further away than any wait means the device clock went back;
// trusting it would suppress background sync for that long.
async function throttledUntil(ctx: ConnectionContext): Promise<number | null> {
  const saved = await ctx.privateStore.get('throttle');
  const until = isRecord(saved) ? Number(saved.until) : NaN;
  return until > ctx.clock() && until - ctx.clock() <= ctx.THROTTLE_MAX_MS ? until : null;
}


function schedule(ctx: ConnectionContext): void {
  if (!ctx.chromeApi.alarms || typeof ctx.chromeApi.alarms.create !== 'function') return;
  // Persistent recurring checks also recover an interrupted task even if
  // its last onChanged event never reached the short debounce timer.
  if (ctx.stopped) return;
  ignoreRejection(ctx.chromeApi.alarms.create(ctx.alarmName, { delayInMinutes: 1, periodInMinutes: 5 }));
}

function onStorageChanged(ctx: ConnectionContext, changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
    if (ctx.stopped) return;
    const changed = ctx.watchedKeys.filter((key) => changes[key]);
    // This controller's own apply: nothing new to capture or upload.
    if (changed.length && !changes[syncMeta.key] &&
        changed.filter((key) => !isOwnWrite(ctx, areaName, key, changes[key])).length === 0) return;
    if ((areaName === 'local' || (areaName === 'sync' && !ctx.runtime.isActiveAreaName('local'))) &&
        changed.length) ctx.generation += 1;
    if (!((areaName === 'sync' && !ctx.runtime.isActiveAreaName('local')) || areaName === 'local') ||
        !(ctx.watchedKeys.some((key) => changes[key]) || (areaName === 'sync' && changes[syncMeta.key]))) return;
    queueSync(ctx, 1500);
}

function queueSync(ctx: ConnectionContext, delay: number, queueOptions?: { keepAlive?: boolean }): void {
  if (ctx.timer) {
    clearTimeout(ctx.timer);
    if (ctx.timerKeepsAlive) releaseKeepAlive(ctx);
  }
  // A contention retry waits up to ~30 s, longer than Firefox keeps an
  // idle event page; without this the retry would be lost until the alarm.
  ctx.timerKeepsAlive = Boolean(queueOptions && queueOptions.keepAlive);
  if (ctx.timerKeepsAlive) holdKeepAlive(ctx);
  ctx.timer = setTimeout(() => {
    ctx.timer = null;
    void backgroundRound(ctx, false);
    // exclusive() took its own hold above, so the page stays alive throughout.
    if (ctx.timerKeepsAlive) {
      ctx.timerKeepsAlive = false;
      releaseKeepAlive(ctx);
    }
  }, delay);
  unrefTimer(ctx.timer);
}

// Timer, alarm and start-up rounds have no page waiting for them. The
// round records its own outcome on the card; anything it could not record
// is logged instead of disappearing.
function backgroundRound(ctx: ConnectionContext, recover: boolean): Promise<void> {
  return exclusive(ctx, async () => {
    if (ctx.stopped) return;
    let recovered = true;
    if (recover) {
      try { await recoverPendingApply(ctx); }
      catch (cause) { recovered = false; report(ctx, 'Could not recover an interrupted WebDAV apply.', cause); }
    }
    // A partially applied state must not reach browser sync either.
    if (recovered) await mirrorReporting(ctx);
    if (await throttledUntil(ctx)) return;
    await guardedSync(ctx);
  }).catch((cause: unknown) => { if (!cause || !isRecorded(cause)) report(ctx, 'WebDAV sync failed.', cause); });
}

export {
  backgroundRound,
  guardedSync,
  onStorageChanged,
  queueSync,
  schedule,
  sweepDaily,
  syncInternal,
  throttled,
  throttledUntil
};
