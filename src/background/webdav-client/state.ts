// The folders and the shared state file.
import { REVISION, diagnostic, error } from './errors';
import { request, requestUrl } from './http';
import type { DavClientContext, StateSnapshot } from './types';

async function ensureDirectories(ctx: DavClientContext): Promise<void> {
  for (let index = 1; index <= ctx.parts.length; index += 1) {
    const result = await requestUrl(ctx, `${ctx.connection.endpoint}${ctx.parts.slice(0, index).join('/')}/`, 'MKCOL', undefined, {}, 65536);
    if (![201, 405].includes(result.status)) throw error('directory-unavailable');
  }
  for (const directory of ['assets', 'snapshots']) {
    const result = await requestUrl(ctx, `${ctx.prefix}${directory}/`, 'MKCOL', undefined, {}, 65536);
    if (![201, 405].includes(result.status)) throw error('directory-unavailable');
  }
}

// The state file's bytes and their revision; null when there is none.
async function readStateBytes(ctx: DavClientContext): Promise<{ bytes: Uint8Array<ArrayBuffer>; revision: string; httpEtag: string | null } | null> {
  const result = await request(ctx, 'state.json', 'GET');
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

async function readState(ctx: DavClientContext): Promise<StateSnapshot | null> {
  const read = await readStateBytes(ctx);
  return read ? { state: parseState(read.bytes), etag: read.revision, httpEtag: read.httpEtag } : null;
}

export {
  ensureDirectories,
  parseState,
  readState,
  readStateBytes
};
