// The write lock every device honours around the state file, its stale
// lock recovery, and writing the state under it.
import { MOVE_REFUSALS, REFUSED_STATUSES, STALE_LOCK_MS, creationFailed, error, errorStatus, isRecord, isWebDavError, unsupported, withStaleLock } from './errors';
import { ownerMatches, request, requestUrl } from './http';
import { readState } from './state';
import type { CollectionLock, DavClientContext, DavResponse, ModifiedTimes, StaleLockMarker, StateSnapshot, StateWrite, WebDavError } from './types';

async function writeState(ctx: DavClientContext, state: unknown, etag: string | null | undefined): Promise<StateWrite> {
  // Both acquisition strategies use the same mutex. A capability change
  // must never bypass a lock left by an uncertain write.
  return writeWithCollectionLock(ctx, state, etag);
}

function text(result: DavResponse): string {
  return new TextDecoder().decode(result.bytes);
}

// Releases the shared lock only while it still names this owner.
async function releaseOwned(ctx: DavClientContext, owner: string): Promise<void> {
  const current = await requestUrl(ctx, ctx.lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
  if (current.status === 404) return;
  if (current.status !== 200 || text(current) !== owner) throw error('lock-release-failed');
  const released = await requestUrl(ctx, ctx.lockUrl, 'DELETE', undefined, {}, 65536);
  if (released.status !== 204) throw error('lock-release-failed');
}

// A lock this client could not release, so the next run releases it first.
function staleMarker(owner: string, uncertain: boolean): StaleLockMarker {
  return { owner, at: Date.now(), uncertain: Boolean(uncertain) };
}

// Breaks a MOVE lock whose owner file is older than STALE_LOCK_MS by the
// server's own clock. It is moved aside rather than deleted, so of several
// devices breaking it at once only one succeeds, and a fresh lock taken in
// between is recognised by its owner and put back.
async function breakStaleLock(ctx: DavClientContext): Promise<boolean> {
  const current = await requestUrl(ctx, ctx.lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
  // A collection-create lock has no owner file; its age is never guessed.
  if (current.status !== 200) return false;
  const now = Date.parse(current.date || '');
  if (!Number.isFinite(now)) return false;
  // Nutstore sends no Last-Modified with GET; the WebDAV property has it.
  let modified = Date.parse(current.lastModified || '');
  if (!Number.isFinite(modified)) {
    const own = (await modifiedTimes(ctx, ctx.lockUrl + 'owner.txt', '0')).times;
    modified = own.get(ctx.lockUrl + 'owner.txt') ?? (own.size === 1 ? [...own.values()][0] : NaN);
  }
  if (!Number.isFinite(modified) || now - modified < STALE_LOCK_MS) return false;
  const staleOwner = text(current);
  const aside = `${ctx.prefix}lock-stale-${globalThis.crypto.randomUUID()}/`;
  const moved = await requestUrl(ctx, ctx.lockUrl, 'MOVE', undefined, { Destination: aside, Overwrite: 'F' }, 65536);
  if (moved.status !== 201) return false;
  if (await ownerMatches(ctx, aside, staleOwner)) {
    await requestUrl(ctx, aside, 'DELETE', undefined, {}, 65536).catch(() => {});
    await sweepAbandoned(ctx).catch(() => {});
    return true;
  }
  await requestUrl(ctx, aside, 'MOVE', undefined, { Destination: ctx.lockUrl, Overwrite: 'F' }, 65536).catch(() => {});
  return false;
}

// Server modification times by absolute URL, from a PROPFIND of one path
// (depth 0) or of a folder and its children (depth 1), plus the server's
// own time. A server without PROPFIND, or without the property, yields no
// time and so no stale lock. Folder URLs keep the trailing slash some
// servers (Nutstore) leave out.
async function modifiedTimes(ctx: DavClientContext, url: string, depth: '0' | '1'): Promise<ModifiedTimes> {
  const times = new Map<string, number>();
  const result = await requestUrl(ctx, url, 'PROPFIND',
    '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/></d:prop></d:propfind>',
    { Depth: depth, 'Content-Type': 'application/xml; charset=utf-8' }, 1024 * 1024);
  const now = Date.parse(result.date || '');
  if (result.status !== 207) return { times, now };
  for (const [, body] of text(result).matchAll(/<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi)) {
    const href = /<(?:[\w-]+:)?href\b[^>]*>([^<]+)</i.exec(body);
    const modified = /<(?:[\w-]+:)?getlastmodified\b[^>]*>([^<]+)</i.exec(body);
    if (!href || !modified) continue;
    try { times.set(new URL(href[1].trim().replace(/&amp;/g, '&'), url).href, Date.parse(modified[1].trim())); }
    catch (_cause) { /* An unreadable entry has no age. */ }
  }
  return { times, now };
}

// Candidates whose MOVE was never confirmed and broken locks that could
// not be deleted stay behind as folders. Once they are as old as a stale
// lock no write can still be using them.
async function sweepAbandoned(ctx: DavClientContext): Promise<number> {
  const { times, now } = await modifiedTimes(ctx, ctx.prefix, '1');
  if (!Number.isFinite(now)) return 0;
  const abandoned = [...times].filter(([url, modified]) => url.startsWith(ctx.prefix) &&
    /^lock-(?:candidate|stale)-[-\w]+\/?$/.test(url.slice(ctx.prefix.length)) && now - modified >= STALE_LOCK_MS);
  for (const [url] of abandoned.slice(0, 50)) await requestUrl(ctx, url.replace(/\/?$/, '/'), 'DELETE', undefined, {}, 65536);
  return abandoned.length;
}

async function acquireCreatedLock(ctx: DavClientContext): Promise<CollectionLock> {
  const claimed = await requestUrl(ctx, ctx.lockUrl, 'MKCOL', undefined, {}, 65536);
  if (claimed.status === 405) throw error('remote-locked');
  if (claimed.status !== 201) throw unsupported('state-lock-create', [claimed.status]);
  return { owner: null, release: async () => {
    const released = await requestUrl(ctx, ctx.lockUrl, 'DELETE', undefined, {}, 65536);
    if (released.status !== 204) throw error('lock-release-failed');
  } };
}

// A MOVE that failed without an answer. A late MOVE can still acquire the
// lock, so both paths are kept when its result is unknown; the shared
// destination is never removed here. Null for a definite refusal.
function uncertainMoveFailure(cause: unknown, owner: string): WebDavError | null {
  const status = errorStatus(cause);
  if (!status || (status >= 500 && !REFUSED_STATUSES.includes(status))) {
    return Object.assign(error('lock-write-uncertain'), { staleLock: staleMarker(owner, true) });
  }
  return null;
}

// Checks that the MOVE made this client the owner of the shared lock.
async function verifyMovedLock(ctx: DavClientContext, claimed: DavResponse, candidate: string, owner: string): Promise<CollectionLock> {
  if (claimed.status !== 201) throw unsupported('move-claim', [claimed.status]);
  let target: DavResponse;
  let source: DavResponse;
  try {
    target = await requestUrl(ctx, ctx.lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
    source = await requestUrl(ctx, candidate + 'owner.txt', 'GET', undefined, {}, 65536);
  } catch (cause) {
    // The MOVE reported success, so the lock may well be ours.
    throw withStaleLock(cause, staleMarker(owner, false));
  }
  if (target.status === 200 && text(target) === owner && source.status === 404) {
    return { owner, release: () => releaseOwned(ctx, owner) };
  }
  // Never keep a lock this client cannot vouch for, and never touch one
  // that names someone else.
  const failure = unsupported('move-owner', [target.status, source.status]);
  if (target.status === 200 && text(target) === owner) {
    try { await releaseOwned(ctx, owner); } catch (_cause) { failure.staleLock = staleMarker(owner, false); }
  }
  if (source.status === 200 && text(source) === owner) {
    await requestUrl(ctx, candidate, 'DELETE', undefined, {}, 65536).catch(() => {});
  }
  throw failure;
}

async function acquireCollectionLock(ctx: DavClientContext, allowTakeover = true): Promise<CollectionLock> {
  if (ctx.lockStrategy === 'collection-create') {
    return acquireCreatedLock(ctx);
  }
  // A private candidate avoids relying on concurrent MKCOL being atomic.
  // MOVE with Overwrite:F competes for the one shared destination instead.
  const owner = globalThis.crypto.randomUUID();
  const candidate = `${ctx.prefix}lock-candidate-${owner}/`;
  let cleanup = false;
  try {
    const created = await requestUrl(ctx, candidate, 'MKCOL', undefined, {}, 65536);
    if (created.status !== 201) throw creationFailed(created.status);
    cleanup = true;
    const written = await requestUrl(ctx, candidate + 'owner.txt', 'PUT', owner, { 'Content-Type': 'text/plain' }, 65536);
    if (![200, 201, 204].includes(written.status)) throw error('write-failed');
    let claimed: DavResponse;
    try { claimed = await requestUrl(ctx, candidate, 'MOVE', undefined, { Destination: ctx.lockUrl, Overwrite: 'F' }, 65536); }
    catch (cause) {
      const uncertain = uncertainMoveFailure(cause, owner);
      if (uncertain) {
        cleanup = false;
        throw uncertain;
      }
      throw cause;
    }
    cleanup = false;
    if (!MOVE_REFUSALS.includes(claimed.status)) {
      return await verifyMovedLock(ctx, claimed, candidate, owner);
    }
    // A candidate still holding its owner proves this MOVE took nothing.
    if (!await ownerMatches(ctx, candidate, owner)) throw unsupported('move-claim', [claimed.status]);
    cleanup = true;
    if (!allowTakeover || !await breakStaleLock(ctx)) throw error('remote-locked');
  } finally {
    if (cleanup) await requestUrl(ctx, candidate, 'DELETE', undefined, {}, 65536).catch(() => {});
  }
  // The stale lock was broken: claim it once more, without a takeover.
  return acquireCollectionLock(ctx, false);
}

// Releases a lock an earlier run left behind. Resolves true once nothing
// is left to do (released, or the lock is no longer this client's), false
// while an uncertain write may still be in flight on the server.
async function releaseStaleLock(ctx: DavClientContext, marker: unknown, now = Date.now()): Promise<boolean> {
  if (!isRecord(marker) || typeof marker.owner !== 'string' || !/^[-\w]{1,80}$/.test(marker.owner)) return true;
  const owner = marker.owner;
  if (marker.uncertain && now - Number(marker.at || 0) < STALE_LOCK_MS) return false;
  const current = await requestUrl(ctx, ctx.lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
  if (current.status === 200 && text(current) === owner) {
    const released = await requestUrl(ctx, ctx.lockUrl, 'DELETE', undefined, {}, 65536);
    if (released.status !== 204) throw error('lock-release-failed');
  } else if (![200, 404].includes(current.status)) throw error('lock-release-failed');
  const candidate = `${ctx.prefix}lock-candidate-${owner}/`;
  if (await ownerMatches(ctx, candidate, owner)) await requestUrl(ctx, candidate, 'DELETE', undefined, {}, 65536);
  return true;
}

// Writes whose outcome is unknown: the server may still commit them.
const uncertainWrites = new WeakSet<WebDavError>();

function uncertainWrite(): WebDavError {
  const failure = error('lock-write-uncertain');
  uncertainWrites.add(failure);
  return failure;
}

function isUncertainWrite(cause: unknown): cause is WebDavError {
  return isWebDavError(cause) && uncertainWrites.has(cause);
}

async function putLockedState(ctx: DavClientContext, state: unknown, latest: StateSnapshot | null): Promise<DavResponse> {
  try {
    const validator = latest && latest.httpEtag;
    return await request(ctx, 'state.json', 'PUT', JSON.stringify(state), { 'Content-Type': 'application/json',
      ...(!latest ? { 'If-None-Match': '*' } : validator && /^"[^"\r\n]+"$/.test(validator) ? { 'If-Match': validator } : {}) });
  } catch (cause) {
    // Explicit client-error responses reject the write. Retrying a rate
    // limit or fixing credentials must not leave a lock unnecessarily.
    const status = errorStatus(cause);
    if ((status >= 400 && status < 500) || [507, ...REFUSED_STATUSES].includes(status)) throw cause;
    // A timed-out request may still commit on the server. Releasing or
    // expiring the lock could let that late PUT overwrite a later writer.
    throw uncertainWrite();
  }
}

// Writes the state while this client holds the lock, and reads it back.
async function writeLockedState(ctx: DavClientContext, state: unknown, revision: string | null | undefined): Promise<StateSnapshot> {
  const latest = await readState(ctx);
  if ((latest && latest.etag || null) !== (revision || null)) throw error('remote-changed');
  const written = await putLockedState(ctx, state, latest);
  if (written.status === 412) throw error('remote-changed');
  if ([404, 405].includes(written.status)) throw error('write-failed');
  if (![200, 201, 204].includes(written.status)) throw uncertainWrite();
  const verified = await readState(ctx);
  if (!verified || JSON.stringify(verified.state) !== JSON.stringify(state)) throw error('remote-changed');
  return verified;
}

async function writeWithCollectionLock(ctx: DavClientContext, state: unknown, revision: string | null | undefined): Promise<StateWrite> {
  const lock = await acquireCollectionLock(ctx);
  let primary: unknown = null;
  let verified: StateSnapshot | null = null;
  try {
    verified = await writeLockedState(ctx, state, revision);
  } catch (cause) {
    primary = cause;
  }
  // Never steal another device's lock or release an uncertain write. It
  // stays for this client to release once the write must have settled,
  // or for another device to break once it is stale.
  if (isUncertainWrite(primary)) {
    if (lock.owner) primary.staleLock = staleMarker(lock.owner, true);
    throw primary;
  }
  try { await lock.release(); }
  catch (releaseError) {
    // A failed release never hides why the write itself failed.
    if (!lock.owner) throw primary || releaseError;
    const staleLock = staleMarker(lock.owner, false);
    if (primary || !verified) throw withStaleLock(primary || error('remote-changed'), staleLock);
    return { state: verified.state, etag: verified.etag, staleLock };
  }
  if (primary || !verified) throw primary || error('remote-changed');
  return { state: verified.state, etag: verified.etag };
}

export {
  acquireCollectionLock,
  acquireCreatedLock,
  breakStaleLock,
  isUncertainWrite,
  modifiedTimes,
  putLockedState,
  releaseOwned,
  releaseStaleLock,
  staleMarker,
  sweepAbandoned,
  text,
  uncertainMoveFailure,
  uncertainWrite,
  uncertainWrites,
  verifyMovedLock,
  writeLockedState,
  writeState,
  writeWithCollectionLock
};
