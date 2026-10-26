// What a favicon <img> shows and how it sits: its intrinsic size and load
// state attributes, the optical shift that centers its visual weight, and a
// hash of its pixels to compare it with another image.

// A favicon <img>; the load token tells a finished load whether a newer
// one started since. The surfaces read it too.
type FaviconImage = HTMLImageElement & { _xFaviconLoadToken?: number };

type FaviconLoadState = '' | 'priming' | 'loaded';

const FAVICON_INTRINSIC_SIZE = 128;
// The size an icon is drawn at to read its pixels.
const SAMPLE_SIZE = 16;

function setFaviconIntrinsicSize(img: FaviconImage | null | undefined): void {
  if (!img) {
    return;
  }
  img.setAttribute('width', String(FAVICON_INTRINSIC_SIZE));
  img.setAttribute('height', String(FAVICON_INTRINSIC_SIZE));
}

function setFaviconLoadState(img: FaviconImage | null | undefined, state: FaviconLoadState): void {
  if (!img) {
    return;
  }
  if (state) {
    img.setAttribute('data-favicon-load-state', state);
  } else {
    img.removeAttribute('data-favicon-load-state');
  }
}

function ensureFaviconStartsLoading(img: FaviconImage): void {
  try {
    const loadingValue = String(img.getAttribute('loading') || img.loading || '').toLowerCase();
    if (loadingValue === 'lazy') {
      img.loading = 'eager';
      img.setAttribute('loading', 'eager');
    }
  } catch (_error) {
    // Ignore unsupported loading mutations on non-browser test doubles.
  }
}

// The image's pixels drawn at the sample size; null when they cannot be read.
function readSamplePixels(doc: Document, image: CanvasImageSource): Uint8ClampedArray | null {
  const canvas = doc.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
}

// A hash of the image drawn at 16 x 16; empty when it cannot be read.
function readImageSignature(doc: Document | null, image: HTMLImageElement | null | undefined): string {
  if (!image || !doc) {
    return '';
  }
  try {
    const data = readSamplePixels(doc, image);
    if (!data) {
      return '';
    }
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 1) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return `${hash}:${data.length}`;
  } catch (_error) {
    return '';
  }
}

// The center of the visible pixels, weighted by their alpha; null when
// nothing is visible.
function readContentCenter(data: Uint8ClampedArray): { x: number; y: number } | null {
  let sumAlpha = 0;
  let weightedX = 0;
  let weightedY = 0;
  for (let y = 0; y < SAMPLE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_SIZE; x += 1) {
      const alpha = data[(y * SAMPLE_SIZE + x) * 4 + 3];
      if (alpha >= 18) {
        sumAlpha += alpha;
        weightedX += x * alpha;
        weightedY += y * alpha;
      }
    }
  }
  return sumAlpha > 0 ? { x: weightedX / sumAlpha, y: weightedY / sumAlpha } : null;
}

// How far to move a content center to the middle: at most 2px, and none
// below 0.4px.
function readOpticalOffset(center: number): number {
  const offset = Math.max(-2, Math.min(2, (SAMPLE_SIZE - 1) / 2 - center));
  return Math.abs(offset) < 0.4 ? 0 : offset;
}

// Shifts the icon by up to 2px so its visual weight sits in the middle.
function applyFaviconOpticalShift(doc: Document | null, img: FaviconImage | null | undefined): void {
  if (!img || !doc) {
    return;
  }
  try {
    const data = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0 ? readSamplePixels(doc, img) : null;
    const center = data ? readContentCenter(data) : null;
    if (!center) {
      img.style.setProperty('transform', 'none');
      return;
    }
    img.style.setProperty('transform', `translate(${readOpticalOffset(center.x)}px, ${readOpticalOffset(center.y)}px)`);
  } catch (_error) {
    img.style.setProperty('transform', 'none');
  }
}

function applyFaviconOpticalAlignment(doc: Document | null, img: FaviconImage | null | undefined): void {
  if (!img) {
    return;
  }
  setFaviconIntrinsicSize(img);
  img.style.setProperty('object-fit', 'contain');
  img.style.setProperty('object-position', 'center center');
  applyFaviconOpticalShift(doc, img);
}

export type { FaviconImage, FaviconLoadState };
export {
  applyFaviconOpticalAlignment,
  applyFaviconOpticalShift,
  ensureFaviconStartsLoading,
  readImageSignature,
  setFaviconIntrinsicSize,
  setFaviconLoadState
};
