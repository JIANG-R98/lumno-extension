// The mode tag's colors: parsing, mixing, and keeping text and focus
// rings readable against the tag.
import type { Rgb } from './types';

const DEFAULT_ACCENT_RGB: Rgb = [59, 130, 246];
const MIN_PREFIX_TEXT_CONTRAST = 4.5;

function defaultRgbToCss(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function defaultParseCssColor(color: unknown): Rgb | null {
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
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : null;
    }
    return null;
  }
  const rgbMatch = trimmed.match(/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)$/);
  if (!rgbMatch) {
    return null;
  }
  const rgb = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  return rgb.every((value) => Number.isFinite(value)) ? rgb : null;
}

function mixRgb(source: Rgb | null | undefined, target: Rgb | null | undefined, targetWeight: number): Rgb {
  const weight = Math.min(1, Math.max(0, Number(targetWeight) || 0));
  return [0, 1, 2].map((index) => {
    const sourceValue = Number(source && source[index]);
    const targetValue = Number(target && target[index]);
    const from = Number.isFinite(sourceValue) ? sourceValue : DEFAULT_ACCENT_RGB[index];
    const to = Number.isFinite(targetValue) ? targetValue : from;
    return Math.round(from + ((to - from) * weight));
  });
}

function getRelativeLuminance(rgb: Rgb): number {
  const channels = [0, 1, 2].map((index) => {
    const value = Math.min(255, Math.max(0, Number(rgb && rgb[index]) || 0)) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getContrastRatio(firstRgb: Rgb, secondRgb: Rgb): number {
  const firstLuminance = getRelativeLuminance(firstRgb);
  const secondLuminance = getRelativeLuminance(secondRgb);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

// The accent, moved towards dark or light until it reads on the background.
function getAccessibleThemeColorRgb(accentRgb: Rgb, backgroundRgb: Rgb, minimumContrast: number): Rgb {
  const darkTarget: Rgb = [15, 23, 42];
  const lightTarget: Rgb = [248, 250, 252];
  const requiredContrast = Number(minimumContrast) || MIN_PREFIX_TEXT_CONTRAST;
  if (getContrastRatio(accentRgb, backgroundRgb) >= requiredContrast) {
    return accentRgb.slice();
  }
  const target = getContrastRatio(darkTarget, backgroundRgb) >=
    getContrastRatio(lightTarget, backgroundRgb)
    ? darkTarget
    : lightTarget;
  let lowerWeight = 0;
  let upperWeight = 1;
  let readableColor = target.slice();
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const weight = (lowerWeight + upperWeight) / 2;
    const candidate = mixRgb(accentRgb, target, weight);
    if (getContrastRatio(candidate, backgroundRgb) >= requiredContrast) {
      readableColor = candidate;
      upperWeight = weight;
    } else {
      lowerWeight = weight;
    }
  }
  return readableColor;
}

function getAccessibleThemeTextRgb(accentRgb: Rgb, backgroundRgb: Rgb): Rgb {
  return getAccessibleThemeColorRgb(
    accentRgb,
    backgroundRgb,
    MIN_PREFIX_TEXT_CONTRAST
  );
}

function getAccessibleThemeFocusRingRgb(accentRgb: Rgb, backgroundRgb: Rgb): Rgb {
  return getAccessibleThemeColorRgb(accentRgb, backgroundRgb, 3);
}

export {
  DEFAULT_ACCENT_RGB,
  MIN_PREFIX_TEXT_CONTRAST,
  defaultParseCssColor,
  defaultRgbToCss,
  getAccessibleThemeColorRgb,
  getAccessibleThemeFocusRingRgb,
  getAccessibleThemeTextRgb,
  getContrastRatio,
  getRelativeLuminance,
  mixRgb
};
