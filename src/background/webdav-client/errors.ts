// WebDAV client errors, their diagnostics and the statuses they stand for.
import type { DiagnosticPhase, StaleLockMarker, WebDavDiagnostic, WebDavError } from './types';

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

export {
  DIAGNOSTIC_PHASES,
  MOVE_REFUSALS,
  REFUSED_STATUSES,
  RETRY_AFTER_MAX_MS,
  REVISION,
  STALE_LOCK_MS,
  creationFailed,
  diagnostic,
  error,
  errorStatus,
  isDiagnosticPhase,
  isRecord,
  isWebDavError,
  retryAfterMs,
  unsupported,
  withStaleLock
};
