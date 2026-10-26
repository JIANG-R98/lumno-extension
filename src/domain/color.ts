// Colors as [red, green, blue] channels: parsing CSS colors, mixing,
// writing them back as CSS, and the WCAG luminance and contrast between two.
import type { ThemeRgb } from './favicon/types';

function copyRgb(rgb: readonly number[]): ThemeRgb {
  return [rgb[0], rgb[1], rgb[2]];
}

function isRgb(value: unknown): value is ThemeRgb {
  return Array.isArray(value) && value.length === 3;
}

function mixColor(color: readonly number[], target: readonly number[], amount: number): ThemeRgb {
  return [
    Math.round(color[0] + (target[0] - color[0]) * amount),
    Math.round(color[1] + (target[1] - color[1]) * amount),
    Math.round(color[2] + (target[2] - color[2]) * amount)
  ];
}

function stableHashCode(text: unknown): number {
  const input = String(text || '');
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function rgbToCss(rgb: readonly number[]): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function rgbToCssAlpha(rgb: readonly number[], alpha: number): string {
  const nextAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${nextAlpha})`;
}

function rgbToCssParts(rgb: readonly number[]): string {
  return `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
}

function parseCssColor(color: unknown): ThemeRgb | null {
  if (!color || typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [r, g, b];
      }
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [r, g, b];
      }
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*(?:[0-9.]+|[0-9.]+%))?\s*\)$/);
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    if ([r, g, b].every((value) => Number.isFinite(value))) {
      return [r, g, b];
    }
  }
  return null;
}

function getLuminance(rgb: readonly number[]): number {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(firstRgb: readonly number[], secondRgb: readonly number[]): number {
  const firstLuminance = getLuminance(firstRgb);
  const secondLuminance = getLuminance(secondRgb);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function getReadableTextColor(bgRgb: unknown): string {
  if (!isRgb(bgRgb)) {
    return '#111827';
  }
  const darkText: ThemeRgb = [17, 24, 39];
  const lightText: ThemeRgb = [248, 250, 252];
  const contrastWithDark = getContrastRatio(darkText, bgRgb);
  const contrastWithLight = getContrastRatio(lightText, bgRgb);
  return contrastWithDark >= contrastWithLight ? '#111827' : '#F8FAFC';
}

export {
  copyRgb,
  getContrastRatio,
  getLuminance,
  getReadableTextColor,
  isRgb,
  mixColor,
  parseCssColor,
  rgbToCss,
  rgbToCssAlpha,
  rgbToCssParts,
  stableHashCode
};
