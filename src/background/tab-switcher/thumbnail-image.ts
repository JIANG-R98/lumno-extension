// A captured shot cut to the switcher's thumbnail size and re-encoded small.
import { arrayBufferToBase64 } from '../favicon-service';

const TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH = 320;

const TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT = 200;

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The largest part of the shot with the thumbnail's proportions: centered
// across, kept to the top down, as the top of a page says most about it.
function getThumbnailCrop(width: number, height: number): CropRect {
  const sourceWidth = Math.max(1, width || 1);
  const sourceHeight = Math.max(1, height || 1);
  const targetRatio = TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH / TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT;
  const sourceRatio = sourceWidth / sourceHeight;
  if (sourceRatio > targetRatio) {
    const cropWidth = Math.max(1, Math.round(sourceHeight * targetRatio));
    return { x: Math.max(0, Math.round((sourceWidth - cropWidth) / 2)), y: 0, width: cropWidth, height: sourceHeight };
  }
  if (sourceRatio < targetRatio) {
    return { x: 0, y: 0, width: sourceWidth, height: Math.max(1, Math.round(sourceWidth / targetRatio)) };
  }
  return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
}

// The bitmap cut and scaled to the thumbnail, as a WebP data URL; '' when the
// canvas cannot draw.
async function encodeThumbnail(bitmap: ImageBitmap): Promise<string> {
  const canvas = new OffscreenCanvas(TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH, TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT);
  const context = canvas.getContext('2d');
  if (!context) {
    return '';
  }
  const crop = getThumbnailCrop(bitmap.width, bitmap.height);
  context.drawImage(
    bitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    TAB_SWITCHER_THUMBNAIL_TARGET_WIDTH,
    TAB_SWITCHER_THUMBNAIL_TARGET_HEIGHT
  );
  const outputBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.68 });
  const buffer = await outputBlob.arrayBuffer();
  return `data:${outputBlob.type || 'image/webp'};base64,${arrayBufferToBase64(buffer)}`;
}

// The shot as a thumbnail; the shot itself where the worker cannot redraw
// it, and '' for anything that is not an image.
async function prepareSwitcherThumbnailDataUrl(dataUrl: unknown): Promise<string> {
  const source = typeof dataUrl === 'string' ? dataUrl : '';
  if (!source.startsWith('data:image/')) {
    return '';
  }
  if (typeof OffscreenCanvas !== 'function' || typeof createImageBitmap !== 'function' || typeof fetch !== 'function') {
    return source;
  }
  try {
    const response = await fetch(source);
    const blob = response && typeof response.blob === 'function' ? await response.blob() : null;
    if (!blob) {
      return source;
    }
    const bitmap = await createImageBitmap(blob);
    try {
      return (await encodeThumbnail(bitmap)) || source;
    } finally {
      if (typeof bitmap.close === 'function') {
        bitmap.close();
      }
    }
  } catch (_error) {
    return source;
  }
}

export { prepareSwitcherThumbnailDataUrl };
