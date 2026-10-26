// One sync round, its retries and the background schedule that runs it.
import { syncMeta } from '../../domain/settings/sync-state';
import { capture } from './capture';
import { CONTENTION_CODES, INITIAL_DECISIONS, SWEEP_INTERVAL_MS, THROTTLE_CODES } from './constants';
import { apply, mirrorReporting, prepareChrome, recoverPendingApply } from './local-apply';
import { errorCode, errorField, ignoreRejection, isRecord, isRecorded, unrefTimer } from './records';
import { publish, readRemote, releaseOwnStaleLock, verifiedClient } from './remote';
import { fail, report, saveConfig, session, setStatus } from './runtime';
import type { Captured, RemoteState, StoredConnection, SyncResult } from './types';
import type { Connection } from './connection';
import type { WebDavClient } from '../webdav-client/types';
import type { WebDavState } from '../../domain/webdav/types';
import { adoptRemote, mergeInitialWallpapers, mergeStates } from '../../domain/webdav/merge';
import { equal, sameContent } from '../../domain/webdav/state-base';
import { diagnostic as readDiagnostic, error } from '../webdav-client/errors';

// What this round publishes and applies: the merge of both sides against
// their shared baseline, or one side when the user chose it. A conflict or a
// missing choice ends the round with its result instead.
async function resolveSyncTarget(
  conn: Connection,
  decision: string | undefined,
  base: unknown,
  captured: Captured,
  remote: RemoteState | null
): Promise<{ target: WebDavState } | { result: SyncResult }> {
  if (decision === 'merge') {
    if (!remote) fail(conn, 'remote-missing');
    return { target: mergeInitialWallpapers(captured.state, remote.state) };
  }
  if (base && remote && (decision === 'local' || decision === 'remote')) {
    return { target: mergeStates(base, captured.state, remote.state, decision).state };
  }
  if (decision === 'local') return { target: captured.state };
  if (decision === 'remote') {
    if (!remote) fail(conn, 'remote-missing');
    return { target: adoptRemote(captured.state, remote.state) };
  }
  if (!remote) {
    if (base) fail(conn, 'remote-missing');
    return { target: captured.state };
  }
  if (!base) {
    await setStatus(conn, { state: 'choice', conflicts: [], error: null });
    return { result: { needsChoice: true } };
  }
  const merged = mergeStates(base, captured.state, remote.state);
  if (merged.conflicts.length) {
    await conn.ports.privateStore.put('conflict', { local: captured.state, remote: remote.state, keys: merged.conflicts });
    await setStatus(conn, { state: 'conflict', conflicts: merged.conflicts, error: null });
    return { result: { conflict: true } };
  }
  return { target: merged.state };
}

async function commitSyncTarget(
  conn: Connection,
  config: StoredConnection,
  target: WebDavState,
  captured: Captured,
  client: WebDavClient
): Promise<void> {
  if (!equal(target, captured.state)) {
    // The server now holds target: the captured state plus what only the
    // server changed. Until target is applied here, the captured state is
    // what both sides share. As the baseline it survives an apply that
    // fails below: published edits of this device are not reported again
    // as conflicts, and the server's changes are not taken for reverts.
    await conn.ports.privateStore.put('session', { config, base: captured.state });
    await apply(conn, target, captured, client, false, { config, base: target });
  } else {
    await conn.ports.privateStore.put('session', { config, base: target });
    if (captured.generation !== conn.edits.generation) fail(conn, 'local-changed');
  }
}

async function syncInternal(conn: Connection, decision?: string): Promise<SyncResult> {
  const { config, base } = await session(conn);
  if (!config || !config.enabled) return { paused: true };
  await setStatus(conn, { state: 'syncing', error: null });
  const client = await verifiedClient(conn, config);
  await saveConfig(conn, config);
  await releaseOwnStaleLock(conn, client);
  const captured = await capture(conn, INITIAL_DECISIONS.includes(decision));
  const remote = await readRemote(conn, client);
  if (INITIAL_DECISIONS.includes(decision)) {
    await conn.ports.privateStore.put('replacementBackup', { captured, savedAt: Date.now() });
    await conn.ports.privateStore.put('replacementBackupMeta', { savedAt: Date.now() });
  }
  const resolved = await resolveSyncTarget(conn, decision, base, captured, remote);
  if ('result' in resolved) return resolved.result;
  const { target } = resolved;
  await prepareChrome(conn, target, captured);
  if (!remote || !sameContent(target, remote.state)) await publish(conn, target, remote, client, captured.generation);
  await commitSyncTarget(conn, config, target, captured, client);
  if (decision) await conn.ports.privateStore.put('recoveryBlocked', false);
  await conn.ports.privateStore.put('conflict', null);
  await mirrorReporting(conn);
  await setStatus(conn, { state: 'ready', error: null, diagnostic: null, conflicts: [], lastSyncAt: Date.now() });
  await sweepDaily(conn, client);
  return { ok: true };
}

// Folders of abandoned lock attempts pile up on the server otherwise; a
// daily sweep costs one listing. It never fails the sync that ran it.
async function sweepDaily(conn: Connection, client: WebDavClient): Promise<void> {
  if (typeof client.sweepAbandoned !== 'function' || conn.timings.clock() - (Number(await conn.ports.privateStore.get('sweptAt')) || 0) < SWEEP_INTERVAL_MS) return;
  await conn.ports.privateStore.put('sweptAt', conn.timings.clock());
  try { await client.sweepAbandoned(); }
  catch (cause) { report(conn, 'Could not remove abandoned WebDAV lock folders.', cause); }
}

async function guardedSync(conn: Connection, decision?: string): Promise<SyncResult> {
  try {
    await recoverPendingApply(conn);
    const result = await syncInternal(conn, decision);
    conn.schedule.contention = 0;
    if (await conn.ports.privateStore.get('throttle')) await conn.ports.privateStore.put('throttle', null);
    return result;
  } catch (cause) {
    const code = errorCode(cause);
    if (!decision && THROTTLE_CODES.includes(code) && !conn.schedule.stopped) return throttled(conn, cause);
    // A first-join choice is retried by the user, who is still on the page.
    if (!decision && CONTENTION_CODES.includes(code) && conn.schedule.contention < conn.timings.contentionDelays.length && !conn.schedule.stopped) {
      const delay = conn.timings.contentionDelays[conn.schedule.contention] * (0.75 + Math.random() * 0.5);
      conn.schedule.contention += 1;
      await setStatus(conn, { state: 'pending', error: null, diagnostic: null });
      queueSync(conn, delay, { keepAlive: true });
      return { pending: true };
    }
    conn.schedule.contention = 0;
    const diagnostic = readDiagnostic(errorField(cause, 'diagnostic'));
    await setStatus(conn, { state: code === 'local-changed' ? 'pending' : code === 'remote-missing' ? 'choice' : 'error',
      error: code || 'sync-failed', diagnostic });
    // Callers without a page to report to know the card already shows it.
    throw Object.assign(error(code || 'sync-failed'), { diagnostic, recorded: true });
  }
}

async function throttled(conn: Connection, cause: unknown): Promise<SyncResult> {
  conn.schedule.contention = 0;
  const previous = await conn.ports.privateStore.get('throttle');
  const attempt = isRecord(previous) && typeof previous.attempt === 'number' && Number.isInteger(previous.attempt)
    ? Math.min(previous.attempt + 1, conn.timings.throttleDelays.length - 1) : 0;
  const delay = Math.max(conn.timings.throttleDelays[attempt] * (0.9 + Math.random() * 0.2), Number(errorField(cause, 'retryAfterMs')) || 0);
  const retryAt = conn.timings.clock() + delay;
  await conn.ports.privateStore.put('throttle', { until: retryAt, attempt });
  await setStatus(conn, { state: 'pending', error: errorCode(cause), diagnostic: null, retryAt });
  // The alarm also resumes after the wait if this worker is unloaded first.
  queueSync(conn, delay);
  return { pending: true, retryAt };
}

// Rounds nobody asked for skip the server while it is refusing requests.
// A saved end further away than any wait means the device clock went back;
// trusting it would suppress background sync for that long.
async function throttledUntil(conn: Connection): Promise<number | null> {
  const saved = await conn.ports.privateStore.get('throttle');
  const until = isRecord(saved) ? Number(saved.until) : NaN;
  return until > conn.timings.clock() && until - conn.timings.clock() <= conn.timings.throttleMaxMs ? until : null;
}


function schedule(conn: Connection): void {
  if (!conn.ports.chrome.alarms || typeof conn.ports.chrome.alarms.create !== 'function') return;
  // Persistent recurring checks also recover an interrupted task even if
  // its last onChanged event never reached the short debounce timer.
  if (conn.schedule.stopped) return;
  ignoreRejection(conn.ports.chrome.alarms.create(conn.ports.alarmName, { delayInMinutes: 1, periodInMinutes: 5 }));
}

function onStorageChanged(conn: Connection, changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
    if (conn.schedule.stopped) return;
    const changed = conn.ports.watchedKeys.filter((key) => changes[key]);
    // This controller's own apply: nothing new to capture or upload.
    if (changed.length && !changes[syncMeta.key] &&
        changed.filter((key) => !conn.ownWrites.take(areaName, key, changes[key])).length === 0) return;
    if ((areaName === 'local' || (areaName === 'sync' && !conn.ports.runtime.isActiveAreaName('local'))) &&
        changed.length) conn.edits.generation += 1;
    if (!((areaName === 'sync' && !conn.ports.runtime.isActiveAreaName('local')) || areaName === 'local') ||
        !(conn.ports.watchedKeys.some((key) => changes[key]) || (areaName === 'sync' && changes[syncMeta.key]))) return;
    queueSync(conn, 1500);
}

function queueSync(conn: Connection, delay: number, queueOptions?: { keepAlive?: boolean }): void {
  if (conn.schedule.timer) {
    clearTimeout(conn.schedule.timer);
    if (conn.schedule.timerKeepsAlive) conn.jobs.releaseKeepAlive();
  }
  // A contention retry waits up to ~30 s, longer than Firefox keeps an
  // idle event page; without this the retry would be lost until the alarm.
  conn.schedule.timerKeepsAlive = Boolean(queueOptions && queueOptions.keepAlive);
  if (conn.schedule.timerKeepsAlive) conn.jobs.holdKeepAlive();
  conn.schedule.timer = setTimeout(() => {
    conn.schedule.timer = null;
    void backgroundRound(conn, false);
    // exclusive() took its own hold above, so the page stays alive throughout.
    if (conn.schedule.timerKeepsAlive) {
      conn.schedule.timerKeepsAlive = false;
      conn.jobs.releaseKeepAlive();
    }
  }, delay);
  unrefTimer(conn.schedule.timer);
}

// Timer, alarm and start-up rounds have no page waiting for them. The
// round records its own outcome on the card; anything it could not record
// is logged instead of disappearing.
function backgroundRound(conn: Connection, recover: boolean): Promise<void> {
  return conn.jobs.run(async () => {
    if (conn.schedule.stopped) return;
    let recovered = true;
    if (recover) {
      try { await recoverPendingApply(conn); }
      catch (cause) { recovered = false; report(conn, 'Could not recover an interrupted WebDAV apply.', cause); }
    }
    // A partially applied state must not reach browser sync either.
    if (recovered) await mirrorReporting(conn);
    if (await throttledUntil(conn)) return;
    await guardedSync(conn);
  }).catch((cause: unknown) => { if (!cause || !isRecorded(cause)) report(conn, 'WebDAV sync failed.', cause); });
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
