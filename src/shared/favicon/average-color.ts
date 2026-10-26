// The average color of an icon, read from a small canvas copy of it.
import type { ThemeRgb } from '../../domain/favicon/types';

// Skips transparent and near-white pixels, unless nothing else is left.
function extractAverageColor(image: CanvasImageSource): ThemeRgb | null {
  const size = 16;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || typeof doc.createElement !== 'function') {
    return null;
  }
  const canvas = doc.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  try {
    context.drawImage(image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 32) {
        continue;
      }
      const red = data[i];
      const green = data[i + 1];
      const blue = data[i + 2];
      const brightness = (red + green + blue) / 3;
      if (brightness > 245) {
        continue;
      }
      r += red;
      g += green;
      b += blue;
      count += 1;
    }
    if (!count) {
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 32) {
          continue;
        }
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count += 1;
      }
    }
    if (!count) {
      return null;
    }
    return [
      Math.round(r / count),
      Math.round(g / count),
      Math.round(b / count)
    ];
  } catch (_error) {
    return null;
  }
}

export { extractAverageColor };
