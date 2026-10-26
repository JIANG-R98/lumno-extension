// Shortcut icons and wallpapers: checking, hashing and moving them to and
// from the server.
import type { StorageItems } from '../../domain/storage-port';
import type { WallpaperRecord } from '../../shared/wallpaper-records';
import { isArrayBufferBytes, isRecord } from './records';
import { fail } from './runtime';
import type { DecodedImage, ImageCheck } from './types';
import type { Connection } from './connection';
import type { WebDavClient } from '../webdav-client/types';
import type { WebDavAsset, WebDavAssetMime, WebDavState } from '../../domain/webdav/types';
import { ICONS_KEY, MAX_ASSET_BYTES, equal } from '../../domain/webdav/state-base';
import { validateState } from '../../domain/webdav/validation';

async function hash(conn: Connection, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await conn.ports.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeImage(conn: Connection, dataUrl: unknown, mime: WebDavAssetMime, maximum: number): DecodedImage {
  const text = String(dataUrl);
  if (!text.startsWith(`data:${mime};base64,`)) fail(conn, 'invalid-asset');
  let bytes: Uint8Array<ArrayBuffer>;
  try { bytes = Uint8Array.from(globalThis.atob(text.slice(text.indexOf(',') + 1)), (character) => character.charCodeAt(0)); }
  catch (_error) { fail(conn, 'invalid-asset'); }
  if (!bytes.byteLength || bytes.byteLength > maximum) fail(conn, 'asset-too-large');
  return { bytes, ...checkImage(conn, bytes, mime) };
}

function pngSize(conn: Connection, bytes: Uint8Array, header: number[], view: DataView): ImageCheck {
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) fail(conn, 'invalid-asset');
  if (bytes.length < 33 || view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') fail(conn, 'invalid-asset');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function webpSize(conn: Connection, bytes: Uint8Array, header: number[], view: DataView): ImageCheck {
  if (String.fromCharCode(...header.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...header.slice(8, 12)) !== 'WEBP' ||
      bytes.length < 30 || view.getUint32(4, true) + 8 !== bytes.length) fail(conn, 'invalid-asset');
  const format = String.fromCharCode(...bytes.slice(12, 16));
  if (format === 'VP8X') {
    if (bytes[20] & 2) fail(conn, 'invalid-asset'); // Uploaded wallpapers are still images.
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }
  if (format === 'VP8L' && bytes[20] === 47) {
    const dimensions = view.getUint32(21, true);
    return { width: 1 + (dimensions & 16383), height: 1 + ((dimensions >>> 14) & 16383) };
  }
  if (format === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
    return { width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
  }
  return fail(conn, 'invalid-asset');
}

function checkImage(conn: Connection, bytes: Uint8Array, mime: WebDavAssetMime): ImageCheck {
  const header = Array.from(bytes.slice(0, 12));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { width, height } = mime === 'image/png' ? pngSize(conn, bytes, header, view) : webpSize(conn, bytes, header, view);
  if (!width || !height || width > 8192 || height > 8192 || width * height > 40000000) fail(conn, 'invalid-asset');
  return { width, height };
}

function toDataUrl(bytes: Uint8Array, mime: WebDavAssetMime): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  return `data:${mime};base64,${globalThis.btoa(chunks.join(''))}`;
}


function assetPath(conn: Connection, hashValue: string, mime: WebDavAssetMime): string { return `assets/${hashValue}.${mime === 'image/png' ? 'png' : 'webp'}`; }


async function collectMedia(
  conn: Connection,
  state: WebDavState,
  local: StorageItems,
  ids: ReadonlySet<string>
): Promise<{ validated: WebDavState; records: WallpaperRecord[] }> {
  async function addAsset(dataUrl: unknown, mime: WebDavAssetMime, maximum: number): Promise<{ digest: string } & ImageCheck> {
    const { bytes, width, height } = decodeImage(conn, dataUrl, mime, maximum);
    const digest = await hash(conn, bytes);
    state.assets[digest] = { mime, size: bytes.byteLength };
    // Binary cache and credentials live in extension-origin IndexedDB,
    // never in content-script-accessible chrome.storage.local.
    if (!await conn.ports.privateStore.get(`asset:${digest}`)) await conn.ports.privateStore.put(`asset:${digest}`, bytes);
    return { digest, width, height };
  }
  const icons = local[ICONS_KEY];
  for (const [id, dataUrl] of Object.entries(isRecord(icons) ? icons : {})) {
    if (ids.has(id)) state.icons[id] = (await addAsset(dataUrl, 'image/png', 96 * 1024)).digest;
  }
  const records = await conn.ports.wallpaperStore.readAll();
  for (const record of records) {
    // Wallpapers saved before dimensions were recorded read back as 0x0,
    // so the size comes from the image itself.
    const image = await addAsset(record.imageDataUrl, 'image/webp', MAX_ASSET_BYTES);
    const thumbnail = await addAsset(record.thumbnailDataUrl, 'image/webp', 160 * 1024);
    state.wallpapers.push({ id: record.id, name: record.name, width: image.width, height: image.height,
      updatedAt: record.updatedAt, image: image.digest, thumbnail: thumbnail.digest });
  }
  return { validated: validateState(state), records };
}

async function getAsset(conn: Connection, digest: string, asset: WebDavAsset | undefined, client: WebDavClient | null): Promise<Uint8Array<ArrayBuffer>> {
  if (!asset) fail(conn, 'asset-missing');
  const cached = await conn.ports.privateStore.get(`asset:${digest}`);
  let bytes: Uint8Array<ArrayBuffer>;
  if (isArrayBufferBytes(cached)) {
    bytes = cached;
  } else {
    if (!client) fail(conn, 'asset-missing');
    const response = await client.request(assetPath(conn, digest, asset.mime), 'GET', undefined, {}, asset.size);
    if (response.status !== 200) fail(conn, 'asset-missing');
    bytes = response.bytes;
  }
  if (bytes.byteLength !== asset.size || await hash(conn, bytes) !== digest) fail(conn, 'asset-integrity');
  checkImage(conn, bytes, asset.mime);
  await conn.ports.privateStore.put(`asset:${digest}`, bytes);
  return bytes;
}

// Fails unless the server's copy of an asset has the expected content.
async function verifyRemoteAsset(conn: Connection, client: WebDavClient, digest: string, asset: WebDavAsset): Promise<void> {
  const downloaded = await client.request(assetPath(conn, digest, asset.mime), 'GET', undefined, {}, asset.size);
  if (downloaded.status !== 200 || downloaded.bytes.byteLength !== asset.size || await hash(conn, downloaded.bytes) !== digest) fail(conn, 'asset-integrity');
}

async function uploadAsset(conn: Connection, client: WebDavClient, digest: string, asset: WebDavAsset): Promise<void> {
  const bytes = await getAsset(conn, digest, asset, client);
  const existing = await client.request(assetPath(conn, digest, asset.mime), 'HEAD', undefined, {}, 65536);
  // Asset files are named by the SHA-256 of their content and only ever
  // written whole, so a file of the expected size needs no download.
  // Without a size, or with another one, its content is checked.
  if (existing.status === 200 && existing.size === asset.size) return;
  if (existing.status === 200) {
    await verifyRemoteAsset(conn, client, digest, asset);
    return;
  }
  if (existing.status !== 404) fail(conn, 'asset-missing');
  const written = await client.request(assetPath(conn, digest, asset.mime), 'PUT', bytes,
    { 'If-None-Match': '*', 'Content-Type': asset.mime }, 65536);
  if (![200, 201, 204, 412].includes(written.status)) fail(conn, 'write-failed');
  if (written.status === 412) await verifyRemoteAsset(conn, client, digest, asset);
}

async function uploadAssets(conn: Connection, state: WebDavState, client: WebDavClient, knownAssets: Record<string, WebDavAsset> | null | undefined): Promise<void> {
  for (const [digest, asset] of Object.entries(state.assets)) {
    if (knownAssets && equal(knownAssets[digest], asset)) continue;
    await uploadAsset(conn, client, digest, asset);
  }
}

export {
  assetPath,
  checkImage,
  collectMedia,
  decodeImage,
  getAsset,
  hash,
  toDataUrl,
  uploadAssets
};
