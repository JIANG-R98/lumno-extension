// The shapes of the WebDAV client: connections, responses, locks and errors.

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


interface DavClientContext {
  readonly opts: WebDavClientOptions;
  readonly connection: WebDavConnection;
  readonly fetchFn: DavFetch;
  readonly parts: string[];
  readonly prefix: string;
  lockStrategy: LockStrategy;
  readonly authorization: string;
  readonly lockUrl: string;
}


// Two contenders racing for one MOVE target during the lock probe.
interface MoveProbe {
  sources: string[];
  target: string;
  owners: string[];
  move(source: string): Promise<DavResponse>;
}

export type {
  CollectionLock,
  Concurrency,
  ConnectionCapabilities,
  DavClientContext,
  DavFetch,
  DavFetchResponse,
  DavHeaders,
  DavMethod,
  DavResponse,
  DiagnosticPhase,
  LockStrategy,
  ModifiedTimes,
  MoveProbe,
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
