// Reading an icon file's format and dimensions from its bytes.
import type { IconCandidate, IconDimensions, IconInspectOptions, IconResourceInfo } from './types';

// The panel renders provider artwork at 36 CSS px. A 2x display therefore needs
// at least 72 physical pixels; 128px leaves enough headroom for scaling and zoom.
const MIN_ICON_DIMENSION = 128;
const SUPPORTED_DATA_URL_PATTERN =
  /^data:image\/(?:png|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg|gif);base64,/i;


function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] || 0) * 0x1000000) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  ) >>> 0;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16);
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function getPngDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20)
  };
}

function getGifDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 10 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
    return null;
  }
  return {
    width: (bytes[6] || 0) | ((bytes[7] || 0) << 8),
    height: (bytes[8] || 0) | ((bytes[9] || 0) << 8)
  };
}

// The largest image in an .ico directory.
function getIcoDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
    return null;
  }
  const count = Math.min(((bytes[4] || 0) | ((bytes[5] || 0) << 8)), 64);
  let width = 0;
  let height = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + (index * 16);
    if (offset + 15 >= bytes.length) {
      break;
    }
    width = Math.max(width, bytes[offset] || 256);
    height = Math.max(height, bytes[offset + 1] || 256);
  }
  return width && height ? { width, height } : null;
}

function getJpegDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = readUint16BigEndian(bytes, offset + 2);
    if (length < 2) {
      break;
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        width: readUint16BigEndian(bytes, offset + 7),
        height: readUint16BigEndian(bytes, offset + 5)
      };
    }
    offset += length + 2;
  }
  return null;
}

function getWebpLosslessDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 25 || bytes[20] !== 0x2f) {
    return null;
  }
  const bits = (bytes[21] || 0) | ((bytes[22] || 0) << 8) |
    ((bytes[23] || 0) << 16) | ((bytes[24] || 0) << 24);
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1
  };
}

function getWebpLossyDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
    return null;
  }
  return {
    width: ((bytes[26] || 0) | ((bytes[27] || 0) << 8)) & 0x3fff,
    height: ((bytes[28] || 0) | ((bytes[29] || 0) << 8)) & 0x3fff
  };
}

function getWebpDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 30 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = readAscii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1
    };
  }
  if (chunk === 'VP8L') {
    return getWebpLosslessDimensions(bytes);
  }
  return chunk === 'VP8 ' ? getWebpLossyDimensions(bytes) : null;
}

function isAvifResource(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || readAscii(bytes, 4, 8) !== 'ftyp') {
    return false;
  }
  const brands = readAscii(bytes, 8, Math.min(bytes.length, 32));
  return brands.includes('avif') || brands.includes('avis');
}

// What a downloaded icon is and whether it is large enough. AVIF headers
// carry no simple size, so the size the page declared stands in for it.
function isSvgResource(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return false;
  }
  try {
    return /<svg(?:\s|>)/i.test(new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase());
  } catch (_error) {
    return false;
  }
}

// The smallest side an icon may have, between 16 and MIN_ICON_DIMENSION.
function readMinDimension(options: IconInspectOptions | null | undefined): number {
  const requestedMinimum = Number(options && options.minDimension);
  return Number.isFinite(requestedMinimum)
    ? Math.max(16, Math.min(MIN_ICON_DIMENSION, requestedMinimum))
    : MIN_ICON_DIMENSION;
}

// The size and type of a raster icon from its bytes. AVIF has no size
// reader here, so it takes the size the page declared.
function detectRasterIcon(bytes: Uint8Array, type: string, declaredSize: number): { width: number; height: number; mimeType: string } {
  const detectedResources = [
    { dimensions: getPngDimensions(bytes), mimeType: 'image/png' },
    { dimensions: getGifDimensions(bytes), mimeType: 'image/gif' },
    { dimensions: getIcoDimensions(bytes), mimeType: 'image/x-icon' },
    { dimensions: getJpegDimensions(bytes), mimeType: 'image/jpeg' },
    { dimensions: getWebpDimensions(bytes), mimeType: 'image/webp' }
  ];
  const detected = detectedResources.find((item) => item.dimensions);
  if (detected && detected.dimensions) {
    return { ...detected.dimensions, mimeType: detected.mimeType };
  }
  if (isAvifResource(bytes)) {
    return { width: declaredSize, height: declaredSize, mimeType: 'image/avif' };
  }
  return { width: 0, height: 0, mimeType: type.startsWith('image/') ? type : 'image/png' };
}

function inspectIconResource(
  arrayBuffer: ArrayBuffer | null | undefined,
  mimeType: unknown,
  _url: unknown,
  candidate?: Partial<Pick<IconCandidate, 'declaredSize'>> | null,
  options?: IconInspectOptions | null
): IconResourceInfo {
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (isSvgResource(bytes)) {
    return {
      usable: true,
      vector: true,
      width: 0,
      height: 0,
      mimeType: 'image/svg+xml'
    };
  }
  const declaredSize = Number(candidate && candidate.declaredSize || 0);
  const { width: effectiveWidth, height: effectiveHeight, mimeType: resolvedMimeType } = detectRasterIcon(bytes, type, declaredSize);
  const minDimension = readMinDimension(options);
  const usable = Number.isFinite(effectiveWidth) && Number.isFinite(effectiveHeight) &&
    Math.max(effectiveWidth, effectiveHeight) >= minDimension &&
    Math.min(effectiveWidth, effectiveHeight) >= Math.max(16, Math.floor(minDimension / 2));
  return {
    usable,
    vector: false,
    width: Number(effectiveWidth || 0),
    height: Number(effectiveHeight || 0),
    mimeType: resolvedMimeType
  };
}

export {
  MIN_ICON_DIMENSION,
  SUPPORTED_DATA_URL_PATTERN,
  getGifDimensions,
  getIcoDimensions,
  getJpegDimensions,
  getPngDimensions,
  getWebpDimensions,
  inspectIconResource,
  isAvifResource,
  readAscii,
  readUint16BigEndian,
  readUint24LittleEndian,
  readUint32BigEndian
};
