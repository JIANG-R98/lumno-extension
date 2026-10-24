// The WebDAV requests behind sync: reading and writing the shared state file
// under a lock every device honours, the asset and snapshot files next to it,
// and the probe that finds which lock a server supports.

type DiagnosticPhase =
  | 'state-etag' | 'state-lock-create' | 'directory-race' | 'directory-delete' | 'directory-recreate'
  | 'move-race' | 'move-owner' | 'move-delete' | 'move-recreate' | 'move-claim' | 'state-read';

type DavMethod = 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'MKCOL' | 'MOVE' | 'PROPFIND';
type DavHeaders = Record<string, string>;

// 'conditional': the server honours If-Match, so a write cannot silently
// replace a newer state; 'collection-lock': writes rely on the lock alone.
type Concurrency = 'conditional' | 'collection-lock';
// How the lock is taken: by moving a private folder onto the lock folder, or
// by creating the lock folder outright.
type LockStrategy = 'collection-move' | 'collection-create';

// Which step of the lock probe or a write a server failed, with up to two
// HTTP statuses; carries nothing about the account or the data.
interface WebDavDiagnostic {
  revision: string;
  phase: DiagnosticPhase;
  statuses: number[];
}

// A lock this client could not release; the next run releases it first.
interface StaleLockMarker {
  owner: string;
  at: number;
  // The write under it may still land on the server.
  uncertain: boolean;
}

interface WebDavError extends Error {
  code: string;
  status?: number;
  retryAfterMs?: number | null;
  diagnostic?: WebDavDiagnostic | null;
  staleLock?: StaleLockMarker;
}

// A connection as entered or stored; every field is checked.
interface WebDavConfigInput {
  endpoint?: unknown;
  directory?: unknown;
  username?: unknown;
  password?: unknown;
  enabled?: unknown;
  concurrency?: unknown;
  lockStrategy?: unknown;
}

interface WebDavConnection {
  endpoint: string;
  directory: string;
  username: string;
  password: string;
  enabled: boolean;
  concurrency: Concurrency;
  lockStrategy: LockStrategy;
}

// What the client reads of a fetch response.
interface DavFetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  arrayBuffer(): Promise<ArrayBuffer>;
}

type DavFetch = (url: string, init: RequestInit) => Promise<DavFetchResponse>;

interface WebDavClientOptions {
  fetch?: DavFetch;
  timeoutMs?: number;
}

interface DavResponse {
  status: number;
  etag: string | null;
  bytes: Uint8Array<ArrayBuffer>;
  // The Content-Length the server sent, when it sent one.
  size: number | null;
  lastModified: string | null;
  date: string | null;
}

// The state file's content and its revision (a digest of its bytes).
interface StateSnapshot {
  state: unknown;
  etag: string;
  httpEtag: string | null;
}

interface StateWrite {
  state: unknown;
  etag: string;
  staleLock?: StaleLockMarker;
}

interface CollectionLock {
  // The id in the lock's owner file; null for a lock that has none.
  owner: string | null;
  release(): Promise<void>;
}

interface ModifiedTimes {
  times: Map<string, number>;
  // The server's own time, NaN when it sent none.
  now: number;
}

interface ConnectionCapabilities {
  ok: true;
  concurrency: Concurrency;
  lockStrategy: LockStrategy;
}

interface WebDavClient {
  request(path: string, method: DavMethod, body?: BodyInit, headers?: DavHeaders, limit?: number): Promise<DavResponse>;
  ensureDirectories(): Promise<void>;
  // Null when there is no state file yet.
  readState(): Promise<StateSnapshot | null>;
  writeState(state: unknown, etag: string | null | undefined): Promise<StateWrite>;
  releaseStaleLock(marker: unknown, now?: number): Promise<boolean>;
  sweepAbandoned(): Promise<number>;
  testConnection(): Promise<ConnectionCapabilities>;
}

const REVISION = 'dav-lock-5';
// Providers refuse an occupied MOVE destination differently: RFC 4918 412,
// Nutstore 409, Go x/net/webdav 423, nginx 405, and Apache, WsgiDAV and
// Nextcloud 500 when the contenders really overlap. None is trusted alone;
// every refusal is confirmed by reading the owner files afterwards.
const MOVE_REFUSALS = [405, 409, 412, 423, 500];
// A write holds the shared lock for a handful of requests of at most 20 s
// each. A lock whose owner file the server last modified this long ago
// belongs to a client that was terminated or lost its network; it may be
// broken. Both times come from the server, never from device clocks.
const STALE_LOCK_MS = 10 * 60 * 1000;
const DIAGNOSTIC_PHASES: readonly DiagnosticPhase[] = ['state-etag', 'state-lock-create', 'directory-race',
  'directory-delete', 'directory-recreate', 'move-race', 'move-owner', 'move-delete', 'move-recreate', 'move-claim',
  'state-read'];
// Rate limits and temporary blocks: the server refused the request without
// acting on it. Nutstore answers 503 "BlockedTemporarily" once an account
// sent too many requests, and keeps refusing while it is still being polled.
const REFUSED_STATUSES = [429, 503];
const RETRY_AFTER_MAX_MS = 6 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function error(code: string, status?: number): WebDavError {
  return Object.assign(new Error(code), { code, status });
}

// A failure this module raised; anything else (a fetch abort or a network
// failure) is reported by code instead.
function isWebDavError(value: unknown): value is WebDavError {
  return value instanceof Error && 'code' in value && typeof value.code === 'string';
}

function errorStatus(cause: unknown): number {
  return isWebDavError(cause) && typeof cause.status === 'number' ? cause.status : 0;
}

function withStaleLock(cause: unknown, staleLock: StaleLockMarker): unknown {
  return cause instanceof Error ? Object.assign(cause, { staleLock }) : cause;
}

// Retry-After holds seconds or an HTTP date, read against the server's clock.
function retryAfterMs(value: string | null, date: string | null): number | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - (Date.parse(date || '') || Date.now());
  return Number.isFinite(ms) ? Math.min(Math.max(ms, 0), RETRY_AFTER_MAX_MS) : null;
}

function isDiagnosticPhase(value: unknown): value is DiagnosticPhase {
  return DIAGNOSTIC_PHASES.some((phase) => phase === value);
}

// A diagnostic of this revision, rebuilt from its known fields only.
function diagnostic(input: unknown): WebDavDiagnostic | null {
  if (!isRecord(input) || input.revision !== REVISION || !isDiagnosticPhase(input.phase)) return null;
  const statuses: unknown[] = Array.isArray(input.statuses) ? input.statuses : [];
  return { revision: REVISION, phase: input.phase,
    statuses: statuses.filter((status): status is number => typeof status === 'number' && Number.isInteger(status) &&
      status >= 0 && status <= 599).slice(0, 2) };
}

function unsupported(phase: DiagnosticPhase, statuses: number[]): WebDavError {
  return Object.assign(error('conditional-write-unsupported'), { diagnostic: diagnostic({ revision: REVISION, phase, statuses }) });
}

// A uniquely named path cannot already exist, so 405 there means the server
// refuses to create folders at all (read-only mounts, Go x/net/webdav backend
// errors, proxies blocking MKCOL), not a concurrency weakness.
function creationFailed(status: number): WebDavError {
  if (status !== 405) return unsupported('state-lock-create', [status]);
  return Object.assign(error('folder-create-refused'), { diagnostic: diagnostic({ revision: REVISION, phase: 'state-lock-create', statuses: [status] }) });
}

function normalizeConfig(input: WebDavConfigInput): WebDavConnection {
  let endpoint: URL;
  try { endpoint = new URL(String(input.endpoint || '').trim()); } catch (_error) { throw error('invalid-endpoint'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw error('invalid-endpoint');
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/';
  const directory = String(input.directory || 'lumno').trim().replace(/^\/+|\/+$/g, '');
  if (!directory || directory.length > 240 || directory.split('/').some((part) => !/^[-\w\u0080-￿ ]+$/.test(part) || part === '.' || part === '..')) throw error('invalid-directory');
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  if (!username || username.includes(':') || username.length > 256 || !password || password.length > 4096) throw error('missing-credentials');
  return { endpoint: endpoint.href, directory, username, password, enabled: input.enabled === true,
    concurrency: input.concurrency === 'collection-lock' ? 'collection-lock' : 'conditional',
    lockStrategy: input.lockStrategy === 'collection-create' ? 'collection-create' : 'collection-move' };
}

function createClient(config: WebDavConfigInput, options?: WebDavClientOptions | null): Readonly<WebDavClient> {
  const opts = options || {};
  const connection = normalizeConfig(config);
  const fetchFn: DavFetch = opts.fetch || globalThis.fetch.bind(globalThis);
  const parts = [...connection.directory.split('/'), 'v1'].map(encodeURIComponent);
  const prefix = `${connection.endpoint}${parts.join('/')}/`;
  let lockStrategy = connection.lockStrategy;
  const token = new TextEncoder().encode(`${connection.username}:${connection.password}`);
  const authorization = 'Basic ' + globalThis.btoa(Array.from(token, (byte) => String.fromCharCode(byte)).join(''));
  async function request(path: string, method: DavMethod, body?: BodyInit, headers?: DavHeaders, limit?: number): Promise<DavResponse> {
    if (!/^(?:state\.json|assets\/[a-f0-9]{64}\.(?:png|webp)|snapshots\/[-\w]+\.json|probe-[-\w]+(?:\.txt|\/(?:owner\.txt)?)|)$/.test(path)) throw error('invalid-path');
    return requestUrl(prefix + path, method, body, headers, limit);
  }
  async function requestUrl(
    url: string,
    method: DavMethod,
    body?: BodyInit,
    headers?: DavHeaders,
    limit = 2 * 1024 * 1024
  ): Promise<DavResponse> {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), opts.timeoutMs || 20000);
    try {
      const response = await fetchFn(url, { method, body, redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: abort.signal, headers: { Authorization: authorization, ...headers } });
      if (method !== 'HEAD' && Number(response.headers.get('Content-Length')) > limit) throw error('response-too-large');
      let bytes: Uint8Array<ArrayBuffer>;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > limit) { await reader.cancel(); throw error('response-too-large'); }
          chunks.push(chunk.value);
        }
        const joined = new Uint8Array(length);
        let offset = 0;
        chunks.forEach((chunk) => { joined.set(chunk, offset); offset += chunk.byteLength; });
        bytes = joined;
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > limit) throw error('response-too-large');
      if (![200, 201, 204, 304, 404, 405, 412].includes(response.status) && !(method === 'MOVE' && MOVE_REFUSALS.includes(response.status)) &&
          !(method === 'PROPFIND' && response.status === 207)) {
        const failure = error(`http-${response.status}`, response.status);
        if (REFUSED_STATUSES.includes(response.status)) {
          failure.retryAfterMs = retryAfterMs(response.headers.get('Retry-After'), response.headers.get('Date'));
        }
        throw failure;
      }
      const length = response.headers.get('Content-Length');
      return { status: response.status, etag: response.headers.get('ETag'), bytes,
        size: length !== null && /^\d+$/.test(length) ? Number(length) : null,
        lastModified: response.headers.get('Last-Modified'), date: response.headers.get('Date') };
    } catch (cause) {
      if (isWebDavError(cause)) throw cause;
      throw error(abort.signal.aborted ? 'timeout' : 'network-error');
    } finally { clearTimeout(timer); }
  }
  async function ownerMatches(url: string, owner: string): Promise<boolean> {
    const result = await requestUrl(url + 'owner.txt', 'GET', undefined, {}, 65536);
    return result.status === 200 && new TextDecoder().decode(result.bytes) === owner;
  }
  async function absent(url: string): Promise<boolean> {
    return (await requestUrl(url + 'owner.txt', 'GET', undefined, {}, 65536)).status === 404;
  }
  async function ensureDirectories(): Promise<void> {
    for (let index = 1; index <= parts.length; index += 1) {
      const result = await requestUrl(`${connection.endpoint}${parts.slice(0, index).join('/')}/`, 'MKCOL', undefined, {}, 65536);
      if (![201, 405].includes(result.status)) throw error('directory-unavailable');
    }
    for (const directory of ['assets', 'snapshots']) {
      const result = await requestUrl(`${prefix}${directory}/`, 'MKCOL', undefined, {}, 65536);
      if (![201, 405].includes(result.status)) throw error('directory-unavailable');
    }
  }
  // The state file's bytes and their revision; null when there is none.
  async function readStateBytes(): Promise<{ bytes: Uint8Array<ArrayBuffer>; revision: string; httpEtag: string | null } | null> {
    const result = await request('state.json', 'GET');
    if (result.status === 404) return null;
    if (result.status !== 200) {
      throw Object.assign(error('remote-unreadable'), { diagnostic: diagnostic({ revision: REVISION, phase: 'state-read', statuses: [result.status] }) });
    }
    // The revision is a local content digest, never an HTTP validator. Weak
    // or absent ETags, and strong ones derived from size plus a one-second
    // mtime (sabre/dav's filesystem backend), cannot hide a changed state.
    // Writes always hold the shared lock, so a strong ETag is optional: CDNs
    // such as Cloudflare weaken it whenever they compress the response.
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', result.bytes));
    const revision = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { bytes: result.bytes, revision, httpEtag: result.etag };
  }
  function parseState(bytes: Uint8Array): unknown {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (_cause) { throw error('remote-corrupt'); }
  }
  async function readState(): Promise<StateSnapshot | null> {
    const read = await readStateBytes();
    return read ? { state: parseState(read.bytes), etag: read.revision, httpEtag: read.httpEtag } : null;
  }
  async function writeState(state: unknown, etag: string | null | undefined): Promise<StateWrite> {
    // Both acquisition strategies use the same mutex. A capability change
    // must never bypass a lock left by an uncertain write.
    return writeWithCollectionLock(state, etag);
  }
  const lockUrl = `${prefix}write-lock/`;
  const text = (result: DavResponse): string => new TextDecoder().decode(result.bytes);
  // Releases the shared lock only while it still names this owner.
  async function releaseOwned(owner: string): Promise<void> {
    const current = await requestUrl(lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
    if (current.status === 404) return;
    if (current.status !== 200 || text(current) !== owner) throw error('lock-release-failed');
    const released = await requestUrl(lockUrl, 'DELETE', undefined, {}, 65536);
    if (released.status !== 204) throw error('lock-release-failed');
  }
  // A lock this client could not release, so the next run releases it first.
  const staleMarker = (owner: string, uncertain: boolean): StaleLockMarker => ({ owner, at: Date.now(), uncertain: Boolean(uncertain) });
  // Breaks a MOVE lock whose owner file is older than STALE_LOCK_MS by the
  // server's own clock. It is moved aside rather than deleted, so of several
  // devices breaking it at once only one succeeds, and a fresh lock taken in
  // between is recognised by its owner and put back.
  async function breakStaleLock(): Promise<boolean> {
    const current = await requestUrl(lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
    // A collection-create lock has no owner file; its age is never guessed.
    if (current.status !== 200) return false;
    const now = Date.parse(current.date || '');
    if (!Number.isFinite(now)) return false;
    // Nutstore sends no Last-Modified with GET; the WebDAV property has it.
    let modified = Date.parse(current.lastModified || '');
    if (!Number.isFinite(modified)) {
      const own = (await modifiedTimes(lockUrl + 'owner.txt', '0')).times;
      modified = own.get(lockUrl + 'owner.txt') ?? (own.size === 1 ? [...own.values()][0] : NaN);
    }
    if (!Number.isFinite(modified) || now - modified < STALE_LOCK_MS) return false;
    const staleOwner = text(current);
    const aside = `${prefix}lock-stale-${globalThis.crypto.randomUUID()}/`;
    const moved = await requestUrl(lockUrl, 'MOVE', undefined, { Destination: aside, Overwrite: 'F' }, 65536);
    if (moved.status !== 201) return false;
    if (await ownerMatches(aside, staleOwner)) {
      await requestUrl(aside, 'DELETE', undefined, {}, 65536).catch(() => {});
      await sweepAbandoned().catch(() => {});
      return true;
    }
    await requestUrl(aside, 'MOVE', undefined, { Destination: lockUrl, Overwrite: 'F' }, 65536).catch(() => {});
    return false;
  }
  // Server modification times by absolute URL, from a PROPFIND of one path
  // (depth 0) or of a folder and its children (depth 1), plus the server's
  // own time. A server without PROPFIND, or without the property, yields no
  // time and so no stale lock. Folder URLs keep the trailing slash some
  // servers (Nutstore) leave out.
  async function modifiedTimes(url: string, depth: '0' | '1'): Promise<ModifiedTimes> {
    const times = new Map<string, number>();
    const result = await requestUrl(url, 'PROPFIND',
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
  async function sweepAbandoned(): Promise<number> {
    const { times, now } = await modifiedTimes(prefix, '1');
    if (!Number.isFinite(now)) return 0;
    const abandoned = [...times].filter(([url, modified]) => url.startsWith(prefix) &&
      /^lock-(?:candidate|stale)-[-\w]+\/?$/.test(url.slice(prefix.length)) && now - modified >= STALE_LOCK_MS);
    for (const [url] of abandoned.slice(0, 50)) await requestUrl(url.replace(/\/?$/, '/'), 'DELETE', undefined, {}, 65536);
    return abandoned.length;
  }
  async function acquireCollectionLock(allowTakeover = true): Promise<CollectionLock> {
    if (lockStrategy === 'collection-create') {
      const claimed = await requestUrl(lockUrl, 'MKCOL', undefined, {}, 65536);
      if (claimed.status === 405) throw error('remote-locked');
      if (claimed.status !== 201) throw unsupported('state-lock-create', [claimed.status]);
      return { owner: null, release: async () => {
        const released = await requestUrl(lockUrl, 'DELETE', undefined, {}, 65536);
        if (released.status !== 204) throw error('lock-release-failed');
      } };
    }
    // A private candidate avoids relying on concurrent MKCOL being atomic.
    // MOVE with Overwrite:F competes for the one shared destination instead.
    const owner = globalThis.crypto.randomUUID();
    const candidate = `${prefix}lock-candidate-${owner}/`;
    let cleanup = false;
    try {
      const created = await requestUrl(candidate, 'MKCOL', undefined, {}, 65536);
      if (created.status !== 201) throw creationFailed(created.status);
      cleanup = true;
      const written = await requestUrl(candidate + 'owner.txt', 'PUT', owner, { 'Content-Type': 'text/plain' }, 65536);
      if (![200, 201, 204].includes(written.status)) throw error('write-failed');
      let claimed: DavResponse;
      try { claimed = await requestUrl(candidate, 'MOVE', undefined, { Destination: lockUrl, Overwrite: 'F' }, 65536); }
      catch (cause) {
        // A late MOVE can still acquire the lock. Preserve both paths when
        // its result is unknown; never remove the shared destination here.
        const status = errorStatus(cause);
        if (!status || (status >= 500 && !REFUSED_STATUSES.includes(status))) {
          cleanup = false;
          throw Object.assign(error('lock-write-uncertain'), { staleLock: staleMarker(owner, true) });
        }
        throw cause;
      }
      cleanup = false;
      if (MOVE_REFUSALS.includes(claimed.status)) {
        // A candidate still holding its owner proves this MOVE took nothing.
        if (!await ownerMatches(candidate, owner)) throw unsupported('move-claim', [claimed.status]);
        cleanup = true;
        if (!allowTakeover || !await breakStaleLock()) throw error('remote-locked');
      } else {
        if (claimed.status !== 201) throw unsupported('move-claim', [claimed.status]);
        let target: DavResponse;
        let source: DavResponse;
        try {
          target = await requestUrl(lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
          source = await requestUrl(candidate + 'owner.txt', 'GET', undefined, {}, 65536);
        } catch (cause) {
          // The MOVE reported success, so the lock may well be ours.
          throw withStaleLock(cause, staleMarker(owner, false));
        }
        if (target.status !== 200 || text(target) !== owner || source.status !== 404) {
          // Never keep a lock this client cannot vouch for, and never touch
          // one that names someone else.
          cleanup = source.status === 200 && text(source) === owner;
          const failure = unsupported('move-owner', [target.status, source.status]);
          if (target.status === 200 && text(target) === owner) {
            try { await releaseOwned(owner); } catch (_cause) { failure.staleLock = staleMarker(owner, false); }
          }
          throw failure;
        }
        return { owner, release: () => releaseOwned(owner) };
      }
    } finally {
      if (cleanup) await requestUrl(candidate, 'DELETE', undefined, {}, 65536).catch(() => {});
    }
    // The stale lock was broken: claim it once more, without a takeover.
    return acquireCollectionLock(false);
  }
  // Releases a lock an earlier run left behind. Resolves true once nothing
  // is left to do (released, or the lock is no longer this client's), false
  // while an uncertain write may still be in flight on the server.
  async function releaseStaleLock(marker: unknown, now = Date.now()): Promise<boolean> {
    if (!isRecord(marker) || typeof marker.owner !== 'string' || !/^[-\w]{1,80}$/.test(marker.owner)) return true;
    const owner = marker.owner;
    if (marker.uncertain && now - Number(marker.at || 0) < STALE_LOCK_MS) return false;
    const current = await requestUrl(lockUrl + 'owner.txt', 'GET', undefined, {}, 65536);
    if (current.status === 200 && text(current) === owner) {
      const released = await requestUrl(lockUrl, 'DELETE', undefined, {}, 65536);
      if (released.status !== 204) throw error('lock-release-failed');
    } else if (![200, 404].includes(current.status)) throw error('lock-release-failed');
    const candidate = `${prefix}lock-candidate-${owner}/`;
    if (await ownerMatches(candidate, owner)) await requestUrl(candidate, 'DELETE', undefined, {}, 65536);
    return true;
  }
  async function writeWithCollectionLock(state: unknown, revision: string | null | undefined): Promise<StateWrite> {
    const lock = await acquireCollectionLock();
    let uncertain: WebDavError | null = null;
    let primary: unknown = null;
    let verified: StateSnapshot | null = null;
    try {
      const latest = await readState();
      if ((latest && latest.etag || null) !== (revision || null)) throw error('remote-changed');
      let written: DavResponse;
      try {
        const validator = latest && latest.httpEtag;
        written = await request('state.json', 'PUT', JSON.stringify(state), { 'Content-Type': 'application/json',
          ...(!latest ? { 'If-None-Match': '*' } : validator && /^"[^"\r\n]+"$/.test(validator) ? { 'If-Match': validator } : {}) });
      } catch (cause) {
        // Explicit client-error responses reject the write. Retrying a rate
        // limit or fixing credentials must not leave a lock unnecessarily.
        const status = errorStatus(cause);
        if ((status >= 400 && status < 500) || [507, ...REFUSED_STATUSES].includes(status)) throw cause;
        // A timed-out request may still commit on the server. Releasing or
        // expiring the lock could let that late PUT overwrite a later writer.
        uncertain = error('lock-write-uncertain');
        throw uncertain;
      }
      if (written.status === 412) throw error('remote-changed');
      if ([404, 405].includes(written.status)) throw error('write-failed');
      if (![200, 201, 204].includes(written.status)) { uncertain = error('lock-write-uncertain'); throw uncertain; }
      verified = await readState();
      if (!verified || JSON.stringify(verified.state) !== JSON.stringify(state)) throw error('remote-changed');
    } catch (cause) {
      primary = cause;
    }
    // Never steal another device's lock or release an uncertain write. It
    // stays for this client to release once the write must have settled,
    // or for another device to break once it is stale.
    if (uncertain) {
      if (lock.owner) uncertain.staleLock = staleMarker(lock.owner, true);
      throw uncertain;
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
  async function testCollectionLock(): Promise<void> {
    const url = `${prefix}probe-lock-${globalThis.crypto.randomUUID()}/`;
    let owned = false;
    try {
      // Test two independent contenders, not just a sequential folder check.
      const attempts = await Promise.allSettled([
        requestUrl(url, 'MKCOL', undefined, {}, 65536), requestUrl(url, 'MKCOL', undefined, {}, 65536)
      ]);
      owned = attempts.some((attempt) => attempt.status === 'fulfilled' && attempt.value.status === 201);
      const statuses = attempts.map((attempt) => attempt.status === 'fulfilled' ? attempt.value.status : 0).sort();
      if (statuses.join(',') !== '201,405') throw unsupported('directory-race', statuses);
      const released = await requestUrl(url, 'DELETE', undefined, {}, 65536);
      if (released.status !== 204) throw unsupported('directory-delete', [released.status]);
      owned = false;
      // A server must actually remove the collection, not only return 204.
      const reclaimed = await requestUrl(url, 'MKCOL', undefined, {}, 65536);
      if (reclaimed.status !== 201) throw unsupported('directory-recreate', [reclaimed.status]);
      owned = true;
    } finally {
      if (owned) await requestUrl(url, 'DELETE', undefined, {}, 65536).catch(() => {});
    }
  }
  async function testMoveLock(): Promise<boolean> {
    const id = globalThis.crypto.randomUUID();
    const sources = [`${prefix}probe-${id}-a/`, `${prefix}probe-${id}-b/`];
    const target = `${prefix}probe-${id}-target/`;
    const owners = [globalThis.crypto.randomUUID(), globalThis.crypto.randomUUID()];
    const move = (source: string): Promise<DavResponse> => (
      requestUrl(source, 'MOVE', undefined, { Destination: target, Overwrite: 'F' }, 65536)
    );
    try {
      for (let index = 0; index < sources.length; index += 1) {
        const created = await requestUrl(sources[index], 'MKCOL', undefined, {}, 65536);
        if (created.status !== 201) throw creationFailed(created.status);
        const written = await requestUrl(sources[index] + 'owner.txt', 'PUT', owners[index], { 'Content-Type': 'text/plain' }, 65536);
        if (![200, 201, 204].includes(written.status)) throw error('write-failed');
      }
      const attempts = await Promise.allSettled(sources.map(move));
      const statuses = attempts.map((attempt) => attempt.status === 'fulfilled' ? attempt.value.status : errorStatus(attempt.reason));
      // Only an explicitly unsupported method can select the MKCOL fallback.
      if (statuses.every((status) => [405, 501].includes(status))) return false;
      let winner = statuses.indexOf(201);
      if (winner < 0) {
        // Nextcloud's file locking can refuse both overlapping MOVEs. That is
        // still exclusive when neither moved; claim the target sequentially.
        if (!statuses.every((status) => MOVE_REFUSALS.includes(status)) || !await absent(target) ||
            !await ownerMatches(sources[0], owners[0]) || !await ownerMatches(sources[1], owners[1]) ||
            (await move(sources[0])).status !== 201) throw unsupported('move-race', statuses);
        winner = 0;
      } else if (!MOVE_REFUSALS.includes(statuses[1 - winner])) throw unsupported('move-race', statuses);
      const loser = 1 - winner;
      // Accept a refusal only after verifying that neither contender's
      // content was overwritten.
      if (!await ownerMatches(target, owners[winner]) || !await ownerMatches(sources[loser], owners[loser]) || !await absent(sources[winner])) {
        throw unsupported('move-owner', statuses);
      }
      const occupied = await move(sources[loser]);
      if (!MOVE_REFUSALS.includes(occupied.status) || !await ownerMatches(target, owners[winner]) || !await ownerMatches(sources[loser], owners[loser])) {
        throw unsupported('move-owner', [occupied.status]);
      }
      const deleted = await requestUrl(target, 'DELETE', undefined, {}, 65536);
      if (deleted.status !== 204 || !await absent(target)) throw unsupported('move-delete', [deleted.status]);
      const recreated = await move(sources[loser]);
      if (recreated.status !== 201 || !await ownerMatches(target, owners[loser]) || !await absent(sources[loser])) {
        throw unsupported('move-recreate', [recreated.status]);
      }
      return true;
    } finally {
      for (const url of [...sources, target]) await requestUrl(url, 'DELETE', undefined, {}, 65536).catch(() => {});
    }
  }
  async function testConnection(): Promise<ConnectionCapabilities> {
    await ensureDirectories();
    const path = `probe-${globalThis.crypto.randomUUID()}.txt`;
    const content = 'lumno-webdav-probe';
    let conditional = false;
    try {
      const put = await request(path, 'PUT', content, { 'Content-Type': 'text/plain' }, 65536);
      if (![200, 201, 204].includes(put.status)) throw error('write-failed');
      const read = await request(path, 'GET', undefined, {}, 65536);
      if (read.status !== 200 || new TextDecoder().decode(read.bytes) !== content) throw error('write-failed');
      if (read.etag && /^"[^"\r\n]+"$/.test(read.etag)) {
        try {
          const rejected = await request(path, 'PUT', 'must-not-overwrite', { 'If-Match': '"lumno-invalid-etag"' }, 65536);
          const unchanged = await request(path, 'GET', undefined, {}, 65536);
          if (rejected.status === 412 && unchanged.status === 200 && new TextDecoder().decode(unchanged.bytes) === content) {
            const updated = await request(path, 'PUT', content + '-updated', { 'If-Match': read.etag }, 65536);
            if ([200, 201, 204].includes(updated.status)) {
              const duplicate = await request(path, 'PUT', 'must-not-overwrite', { 'If-None-Match': '*' }, 65536);
              const final = await request(path, 'GET', undefined, {}, 65536);
              conditional = duplicate.status === 412 && final.status === 200 && new TextDecoder().decode(final.bytes) === content + '-updated';
            }
          }
        } catch (cause) {
          if (!isWebDavError(cause) || !['http-400', 'http-501'].includes(cause.code)) throw cause;
        }
      }
      // Prefer non-overwriting MOVE: several providers race when creating
      // the same directory even though sequential MKCOL looks exclusive.
      if (await testMoveLock()) lockStrategy = 'collection-move';
      else { await testCollectionLock(); lockStrategy = 'collection-create'; }
    } finally {
      await request(path, 'DELETE', undefined, {}, 65536).catch(() => {});
    }
    return { ok: true, concurrency: conditional ? 'conditional' : 'collection-lock', lockStrategy };
  }
  return Object.freeze({ request, ensureDirectories, readState, writeState, releaseStaleLock, sweepAbandoned, testConnection });
}

export type {
  ConnectionCapabilities,
  DavResponse,
  StaleLockMarker,
  StateSnapshot,
  StateWrite,
  WebDavClient,
  WebDavClientOptions,
  WebDavConfigInput,
  WebDavConnection,
  WebDavDiagnostic,
  WebDavError
};
export {
  normalizeConfig,
  createClient,
  error,
  diagnostic,
  isWebDavError,
  REVISION,
  MOVE_REFUSALS,
  REFUSED_STATUSES,
  RETRY_AFTER_MAX_MS,
  STALE_LOCK_MS
};
