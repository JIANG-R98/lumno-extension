// Requests to the server, with the body limit, timeout and credentials
// every request carries.
import { MOVE_REFUSALS, REFUSED_STATUSES, error, isWebDavError, retryAfterMs } from './errors';
import type { DavClientContext, DavFetchResponse, DavHeaders, DavMethod, DavResponse } from './types';

async function request(ctx: DavClientContext, path: string, method: DavMethod, body?: BodyInit, headers?: DavHeaders, limit?: number): Promise<DavResponse> {
  if (!/^(?:state\.json|assets\/[a-f0-9]{64}\.(?:png|webp)|snapshots\/[-\w]+\.json|probe-[-\w]+(?:\.txt|\/(?:owner\.txt)?)|)$/.test(path)) throw error('invalid-path');
  return requestUrl(ctx, ctx.prefix + path, method, body, headers, limit);
}

// The response body, failing once it passes the limit.
async function readBody(response: DavFetchResponse, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return new Uint8Array(await response.arrayBuffer());
  }
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
  return joined;
}

// Fails on a status the protocol code does not handle itself; a refusal
// carries how long the server asked to wait.
function checkStatus(response: DavFetchResponse, method: DavMethod): void {
  if ([200, 201, 204, 304, 404, 405, 412].includes(response.status) || (method === 'MOVE' && MOVE_REFUSALS.includes(response.status)) ||
      (method === 'PROPFIND' && response.status === 207)) {
    return;
  }
  const failure = error(`http-${response.status}`, response.status);
  if (REFUSED_STATUSES.includes(response.status)) {
    failure.retryAfterMs = retryAfterMs(response.headers.get('Retry-After'), response.headers.get('Date'));
  }
  throw failure;
}

async function requestUrl(
  ctx: DavClientContext,
  url: string,
  method: DavMethod,
  body?: BodyInit,
  headers?: DavHeaders,
  limit = 2 * 1024 * 1024
): Promise<DavResponse> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ctx.opts.timeoutMs || 20000);
  try {
    const response = await ctx.fetchFn(url, { method, body, redirect: 'error', credentials: 'omit', cache: 'no-store',
      signal: abort.signal, headers: { Authorization: ctx.authorization, ...headers } });
    if (method !== 'HEAD' && Number(response.headers.get('Content-Length')) > limit) throw error('response-too-large');
    const bytes = await readBody(response, limit);
    if (bytes.byteLength > limit) throw error('response-too-large');
    checkStatus(response, method);
    const length = response.headers.get('Content-Length');
    return { status: response.status, etag: response.headers.get('ETag'), bytes,
      size: length !== null && /^\d+$/.test(length) ? Number(length) : null,
      lastModified: response.headers.get('Last-Modified'), date: response.headers.get('Date') };
  } catch (cause) {
    if (isWebDavError(cause)) throw cause;
    throw error(abort.signal.aborted ? 'timeout' : 'network-error');
  } finally { clearTimeout(timer); }
}

async function ownerMatches(ctx: DavClientContext, url: string, owner: string): Promise<boolean> {
  const result = await requestUrl(ctx, url + 'owner.txt', 'GET', undefined, {}, 65536);
  return result.status === 200 && new TextDecoder().decode(result.bytes) === owner;
}

async function absent(ctx: DavClientContext, url: string): Promise<boolean> {
  return (await requestUrl(ctx, url + 'owner.txt', 'GET', undefined, {}, 65536)).status === 404;
}

export {
  absent,
  checkStatus,
  ownerMatches,
  readBody,
  request,
  requestUrl
};
