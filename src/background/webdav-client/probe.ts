// The probe that finds which lock and which conditional writes a server
// supports.
import { MOVE_REFUSALS, creationFailed, error, errorStatus, isWebDavError, unsupported } from './errors';
import { absent, ownerMatches, request, requestUrl } from './http';
import { ensureDirectories } from './state';
import type { ConnectionCapabilities, DavClientContext, MoveProbe } from './types';

async function testCollectionLock(ctx: DavClientContext): Promise<void> {
  const url = `${ctx.prefix}probe-lock-${globalThis.crypto.randomUUID()}/`;
  let owned = false;
  try {
    // Test two independent contenders, not just a sequential folder check.
    const attempts = await Promise.allSettled([
      requestUrl(ctx, url, 'MKCOL', undefined, {}, 65536), requestUrl(ctx, url, 'MKCOL', undefined, {}, 65536)
    ]);
    owned = attempts.some((attempt) => attempt.status === 'fulfilled' && attempt.value.status === 201);
    const statuses = attempts.map((attempt) => attempt.status === 'fulfilled' ? attempt.value.status : 0).sort();
    if (statuses.join(',') !== '201,405') throw unsupported('directory-race', statuses);
    const released = await requestUrl(ctx, url, 'DELETE', undefined, {}, 65536);
    if (released.status !== 204) throw unsupported('directory-delete', [released.status]);
    owned = false;
    // A server must actually remove the collection, not only return 204.
    const reclaimed = await requestUrl(ctx, url, 'MKCOL', undefined, {}, 65536);
    if (reclaimed.status !== 201) throw unsupported('directory-recreate', [reclaimed.status]);
    owned = true;
  } finally {
    if (owned) await requestUrl(ctx, url, 'DELETE', undefined, {}, 65536).catch(() => {});
  }
}


async function createProbeSources(ctx: DavClientContext, probe: MoveProbe): Promise<void> {
  for (let index = 0; index < probe.sources.length; index += 1) {
    const created = await requestUrl(ctx, probe.sources[index], 'MKCOL', undefined, {}, 65536);
    if (created.status !== 201) throw creationFailed(created.status);
    const written = await requestUrl(ctx, probe.sources[index] + 'owner.txt', 'PUT', probe.owners[index], { 'Content-Type': 'text/plain' }, 65536);
    if (![200, 201, 204].includes(written.status)) throw error('write-failed');
  }
}

// The contender whose MOVE took the target, after both raced for it.
async function raceWinner(ctx: DavClientContext, probe: MoveProbe, statuses: number[]): Promise<number> {
  const winner = statuses.indexOf(201);
  if (winner >= 0) {
    if (!MOVE_REFUSALS.includes(statuses[1 - winner])) throw unsupported('move-race', statuses);
    return winner;
  }
  // Nextcloud's file locking can refuse both overlapping MOVEs. That is
  // still exclusive when neither moved; claim the target sequentially.
  if (!statuses.every((status) => MOVE_REFUSALS.includes(status)) || !await absent(ctx, probe.target) ||
      !await ownerMatches(ctx, probe.sources[0], probe.owners[0]) || !await ownerMatches(ctx, probe.sources[1], probe.owners[1]) ||
      (await probe.move(probe.sources[0])).status !== 201) throw unsupported('move-race', statuses);
  return 0;
}

// Checks that a second MOVE onto the taken target is refused, and that the
// target can be freed and taken again.
async function checkMoveExclusive(ctx: DavClientContext, probe: MoveProbe, winner: number, statuses: number[]): Promise<void> {
  const loser = 1 - winner;
  const { sources, target, owners } = probe;
  // Accept a refusal only after verifying that neither contender's
  // content was overwritten.
  if (!await ownerMatches(ctx, target, owners[winner]) || !await ownerMatches(ctx, sources[loser], owners[loser]) || !await absent(ctx, sources[winner])) {
    throw unsupported('move-owner', statuses);
  }
  const occupied = await probe.move(sources[loser]);
  if (!MOVE_REFUSALS.includes(occupied.status) || !await ownerMatches(ctx, target, owners[winner]) || !await ownerMatches(ctx, sources[loser], owners[loser])) {
    throw unsupported('move-owner', [occupied.status]);
  }
  const deleted = await requestUrl(ctx, target, 'DELETE', undefined, {}, 65536);
  if (deleted.status !== 204 || !await absent(ctx, target)) throw unsupported('move-delete', [deleted.status]);
  const recreated = await probe.move(sources[loser]);
  if (recreated.status !== 201 || !await ownerMatches(ctx, target, owners[loser]) || !await absent(ctx, sources[loser])) {
    throw unsupported('move-recreate', [recreated.status]);
  }
}

async function testMoveLock(ctx: DavClientContext): Promise<boolean> {
  const id = globalThis.crypto.randomUUID();
  const target = `${ctx.prefix}probe-${id}-target/`;
  const probe: MoveProbe = {
    sources: [`${ctx.prefix}probe-${id}-a/`, `${ctx.prefix}probe-${id}-b/`],
    target,
    owners: [globalThis.crypto.randomUUID(), globalThis.crypto.randomUUID()],
    move: (source) => requestUrl(ctx, source, 'MOVE', undefined, { Destination: target, Overwrite: 'F' }, 65536)
  };
  try {
    await createProbeSources(ctx, probe);
    const attempts = await Promise.allSettled(probe.sources.map(probe.move));
    const statuses = attempts.map((attempt) => attempt.status === 'fulfilled' ? attempt.value.status : errorStatus(attempt.reason));
    // Only an explicitly unsupported method can select the MKCOL fallback.
    if (statuses.every((status) => [405, 501].includes(status))) return false;
    await checkMoveExclusive(ctx, probe, await raceWinner(ctx, probe, statuses), statuses);
    return true;
  } finally {
    for (const url of [...probe.sources, target]) await requestUrl(ctx, url, 'DELETE', undefined, {}, 65536).catch(() => {});
  }
}

// Whether the server honours If-Match and If-None-Match on the probe file.
// Servers that reject the headers outright simply lack them.
async function probeConditionalWrites(ctx: DavClientContext, path: string, content: string, etag: string | null): Promise<boolean> {
  if (!etag || !/^"[^"\r\n]+"$/.test(etag)) return false;
  try {
    const rejected = await request(ctx, path, 'PUT', 'must-not-overwrite', { 'If-Match': '"lumno-invalid-etag"' }, 65536);
    const unchanged = await request(ctx, path, 'GET', undefined, {}, 65536);
    if (rejected.status !== 412 || unchanged.status !== 200 || new TextDecoder().decode(unchanged.bytes) !== content) return false;
    const updated = await request(ctx, path, 'PUT', content + '-updated', { 'If-Match': etag }, 65536);
    if (![200, 201, 204].includes(updated.status)) return false;
    const duplicate = await request(ctx, path, 'PUT', 'must-not-overwrite', { 'If-None-Match': '*' }, 65536);
    const final = await request(ctx, path, 'GET', undefined, {}, 65536);
    return duplicate.status === 412 && final.status === 200 && new TextDecoder().decode(final.bytes) === content + '-updated';
  } catch (cause) {
    if (!isWebDavError(cause) || !['http-400', 'http-501'].includes(cause.code)) throw cause;
    return false;
  }
}

async function testConnection(ctx: DavClientContext): Promise<ConnectionCapabilities> {
  await ensureDirectories(ctx);
  const path = `probe-${globalThis.crypto.randomUUID()}.txt`;
  const content = 'lumno-webdav-probe';
  let conditional = false;
  try {
    const put = await request(ctx, path, 'PUT', content, { 'Content-Type': 'text/plain' }, 65536);
    if (![200, 201, 204].includes(put.status)) throw error('write-failed');
    const read = await request(ctx, path, 'GET', undefined, {}, 65536);
    if (read.status !== 200 || new TextDecoder().decode(read.bytes) !== content) throw error('write-failed');
    conditional = await probeConditionalWrites(ctx, path, content, read.etag);
    // Prefer non-overwriting MOVE: several providers race when creating
    // the same directory even though sequential MKCOL looks exclusive.
    if (await testMoveLock(ctx)) ctx.lockStrategy = 'collection-move';
    else { await testCollectionLock(ctx); ctx.lockStrategy = 'collection-create'; }
  } finally {
    await request(ctx, path, 'DELETE', undefined, {}, 65536).catch(() => {});
  }
  return { ok: true, concurrency: conditional ? 'conditional' : 'collection-lock', lockStrategy: ctx.lockStrategy };
}

export {
  checkMoveExclusive,
  createProbeSources,
  probeConditionalWrites,
  raceWinner,
  testCollectionLock,
  testConnection,
  testMoveLock
};
