// The WebDAV requests behind sync: reading and writing the shared state file
// under a lock every device honours, the asset and snapshot files next to it,
// and the probe that finds which lock a server supports.
import { normalizeConfig } from './config';
import { request } from './http';
import { releaseStaleLock, sweepAbandoned, writeState } from './lock';
import { testConnection } from './probe';
import { ensureDirectories, readState } from './state';
import type { DavClientContext, DavFetch, DavHeaders, DavMethod, WebDavClient, WebDavClientOptions, WebDavConfigInput } from './types';

function createClient(config: WebDavConfigInput, options?: WebDavClientOptions | null): Readonly<WebDavClient> {
  const opts = options || {};
  const connection = normalizeConfig(config);
  const fetchFn: DavFetch = opts.fetch || globalThis.fetch.bind(globalThis);
  const parts = [...connection.directory.split('/'), 'v1'].map(encodeURIComponent);
  const prefix = `${connection.endpoint}${parts.join('/')}/`;
  const token = new TextEncoder().encode(`${connection.username}:${connection.password}`);
  const authorization = 'Basic ' + globalThis.btoa(Array.from(token, (byte) => String.fromCharCode(byte)).join(''));
  const lockUrl = `${prefix}write-lock/`;
  const ctx: DavClientContext = {
    opts,
    connection,
    fetchFn,
    parts,
    prefix,
    lockStrategy: connection.lockStrategy,
    authorization,
    lockUrl
  };
  return Object.freeze({
    request: (path: string, method: DavMethod, body?: BodyInit, headers?: DavHeaders, limit?: number) => request(ctx, path, method, body, headers, limit),
    ensureDirectories: () => ensureDirectories(ctx),
    readState: () => readState(ctx),
    writeState: (state: unknown, etag: string | null | undefined) => writeState(ctx, state, etag),
    releaseStaleLock: (marker: unknown, now?: number) => releaseStaleLock(ctx, marker, now),
    sweepAbandoned: () => sweepAbandoned(ctx),
    testConnection: () => testConnection(ctx)
  });
}

export {
  createClient
};
