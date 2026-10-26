// Turning an uploaded image into the library's WebP copies: the wallpaper,
// its thumbnail and a small sample, each cropped to 16:9.
import { getSamplerSize } from '../domain/wallpaper-sampler-size';
import { CUSTOM_WALLPAPER_ID_PREFIX } from './wallpaper-records';
import type { WallpaperPage, WallpaperRecordInput } from './wallpaper-records';

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderedImage {
  dataUrl: string;
  width: number;
  height: number;
  byteSize: number;
  quality: number;
}


const OUTPUT_RATIO = 16 / 9;
const MAX_OUTPUT_WIDTH = 2560;
const THUMBNAIL_WIDTH = 480;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_SOURCE_DIMENSION = 8192;
const MAX_SOURCE_PIXELS = 40 * 1000 * 1000;
// Chrome drops a CSS custom property whose value is longer than this, and the page shows a
// wallpaper through var(--x-nt-wallpaper-image), so a stored data URL must stay under it.
const MAX_CSS_URL_LENGTH = 2 * 1024 * 1024;
const WEBP_DATA_URL_PREFIX = 'data:image/webp;base64,';
// Largest WebP whose base64 data URL, wrapped in the CSS url() function, still fits: about 1.5 MB.
const MAX_WALLPAPER_BYTES =
  Math.floor((MAX_CSS_URL_LENGTH - WEBP_DATA_URL_PREFIX.length - 'url("")'.length) / 4) * 3;
const MAX_THUMBNAIL_BYTES = 160 * 1024;
// Panel tiles are about 117×66 CSS pixels; 320 wide stays sharp on 2x screens.
const TILE_THUMBNAIL_WIDTH = 320;
const MAX_TILE_THUMBNAIL_BYTES = 32 * 1024;
const WEBP_QUALITIES = Object.freeze([0.88, 0.82, 0.76, 0.7, 0.64, 0.58]);
const ACCEPTED_SOURCE_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function readFileAsDataUrl(ctx: WallpaperPage, file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const Reader = ctx.windowObj && ctx.windowObj.FileReader ? ctx.windowObj.FileReader : globalThis.FileReader;
    if (typeof Reader !== 'function') {
      reject(new Error('FileReader is not available.'));
      return;
    }
    const reader = new Reader();
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read image.'));
    };
    reader.onload = () => {
      resolve(String(reader.result || ''));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(ctx: WallpaperPage, dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const ImageConstructor = ctx.windowObj && ctx.windowObj.Image ? ctx.windowObj.Image : globalThis.Image;
    if (typeof ImageConstructor !== 'function') {
      reject(new Error('Image decoder is not available.'));
      return;
    }
    const image = new ImageConstructor();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('Failed to load image.'));
    };
    image.src = dataUrl;
  });
}

function getCenteredCrop(width: number, height: number): CropRect {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > OUTPUT_RATIO) {
    const cropWidth = Math.round(sourceHeight * OUTPUT_RATIO);
    return {
      x: Math.round((sourceWidth - cropWidth) / 2),
      y: 0,
      width: cropWidth,
      height: sourceHeight
    };
  }
  const cropHeight = Math.round(sourceWidth / OUTPUT_RATIO);
  return {
    x: 0,
    y: Math.round((sourceHeight - cropHeight) / 2),
    width: sourceWidth,
    height: cropHeight
  };
}

function getDataUrlByteLength(dataUrl: string): number {
  const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(String(dataUrl || ''));
  if (!match) {
    return 0;
  }
  const encoded = match[1];
  const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
}

function createCanvas(ctx: WallpaperPage): HTMLCanvasElement {
  if (!ctx.documentObj) {
    throw new Error('Canvas is not available.');
  }
  return ctx.documentObj.createElement('canvas');
}

function renderCroppedDataUrl(ctx: WallpaperPage, image: HTMLImageElement, crop: CropRect, targetWidth: number, maxBytes: number): RenderedImage {
  const canvas = createCanvas(ctx);
  const initialWidth = Math.max(1, Math.round(targetWidth));
  const minimumWidth = Math.min(initialWidth, initialWidth > THUMBNAIL_WIDTH ? 1280 : 320);
  const widths: number[] = [];
  let width = initialWidth;
  while (width >= minimumWidth) {
    if (!widths.includes(width)) widths.push(width);
    if (width === minimumWidth) break;
    width = Math.max(minimumWidth, Math.floor(width * 0.82));
  }

  for (const candidateWidth of widths) {
    const height = Math.max(1, Math.round(candidateWidth / OUTPUT_RATIO));
    canvas.width = candidateWidth;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is not available.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      candidateWidth,
      height
    );
    for (const quality of WEBP_QUALITIES) {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      if (!dataUrl || !dataUrl.startsWith(WEBP_DATA_URL_PREFIX)) {
        throw new Error('WebP encoding is not available.');
      }
      const byteSize = getDataUrlByteLength(dataUrl);
      if (byteSize > 0 && byteSize <= maxBytes) {
        return { dataUrl, width: candidateWidth, height, byteSize, quality };
      }
    }
  }
  throw new Error('Compressed wallpaper exceeds the upload limit.');
}

// The small copy the effects sample (getWallpaperSample in wallpaper-sources.ts): the stored
// wallpaper decoded and drawn at the sampler's size the way the sampler draws it, then saved
// losslessly, so sampling it reads the pixels sampling the full wallpaper would. Lossy WebP keeps
// colour at half resolution and loses the fine colour specks of painted or dotted images. '' when
// the wallpaper is no larger than the sampler or the browser cannot make the copy.
function renderSampleDataUrl(ctx: WallpaperPage, dataUrl: string, width: number, height: number): Promise<string> {
  const size = getSamplerSize(width, height);
  if (size.width >= width && size.height >= height) {
    return Promise.resolve('');
  }
  return loadImageFromDataUrl(ctx, dataUrl).then((image) => {
    const canvas = createCanvas(ctx);
    canvas.width = size.width;
    canvas.height = size.height;
    // Read-optimised like the sampler's canvas, so Chrome filters the downscale the same way.
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return '';
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    const sampleDataUrl = canvas.toDataURL('image/webp', 1);
    return sampleDataUrl.startsWith(WEBP_DATA_URL_PREFIX) ? sampleDataUrl : '';
  }).catch(() => '');
}

function buildRecordFromFile(ctx: WallpaperPage, file: File | null | undefined): Promise<WallpaperRecordInput> {
  if (!file || !ACCEPTED_SOURCE_MIME_TYPES.includes(String(file.type || '').toLowerCase())) {
    return Promise.reject(new Error('Invalid image file.'));
  }
  const sourceBytes = Number(file.size);
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0 || sourceBytes > MAX_SOURCE_BYTES) {
    return Promise.reject(new Error('Wallpaper source file is too large.'));
  }
  return readFileAsDataUrl(ctx, file).then((dataUrl) => {
    return loadImageFromDataUrl(ctx, dataUrl);
  }).then((image) => {
    const sourceWidth = Math.max(1, Number(image.naturalWidth || image.width) || 1);
    const sourceHeight = Math.max(1, Number(image.naturalHeight || image.height) || 1);
    if (sourceWidth > MAX_SOURCE_DIMENSION || sourceHeight > MAX_SOURCE_DIMENSION ||
        sourceWidth * sourceHeight > MAX_SOURCE_PIXELS) {
      throw new Error('Wallpaper source dimensions are too large.');
    }
    const crop = getCenteredCrop(sourceWidth, sourceHeight);
    const outputWidth = Math.min(MAX_OUTPUT_WIDTH, Math.max(1, crop.width));
    const wallpaper = renderCroppedDataUrl(ctx, image, crop, outputWidth, MAX_WALLPAPER_BYTES);
    const thumbnail = renderCroppedDataUrl(ctx, image, crop, THUMBNAIL_WIDTH, MAX_THUMBNAIL_BYTES);
    return renderSampleDataUrl(ctx, wallpaper.dataUrl, wallpaper.width, wallpaper.height).then((sampleDataUrl): WallpaperRecordInput => ({
      id: `${CUSTOM_WALLPAPER_ID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name
        ? String(file.name).replace(/\.[^.]+$/, '')
        : '',
      imageDataUrl: wallpaper.dataUrl,
      thumbnailDataUrl: thumbnail.dataUrl,
      sampleDataUrl,
      width: wallpaper.width,
      height: wallpaper.height,
      updatedAt: Date.now()
    }));
  });
}

// A small WebP of a panel tile's photo, cropped to the tile's 16:9 like the wallpaper itself.
function buildTileThumbnail(ctx: WallpaperPage, blob: Blob): Promise<string> {
  return readFileAsDataUrl(ctx, blob).then(((dataUrl: string) => loadImageFromDataUrl(ctx, dataUrl))).then((image) => {
    const crop = getCenteredCrop(image.naturalWidth || image.width, image.naturalHeight || image.height);
    return renderCroppedDataUrl(ctx, image, crop, Math.min(TILE_THUMBNAIL_WIDTH, crop.width),
      MAX_TILE_THUMBNAIL_BYTES).dataUrl;
  });
}

export {
  ACCEPTED_SOURCE_MIME_TYPES,
  MAX_CSS_URL_LENGTH,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_DIMENSION,
  MAX_SOURCE_PIXELS,
  MAX_THUMBNAIL_BYTES,
  MAX_WALLPAPER_BYTES,
  buildRecordFromFile,
  buildTileThumbnail
};
