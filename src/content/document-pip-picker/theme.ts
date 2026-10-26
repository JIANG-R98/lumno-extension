// The colors the picker and the clip window take from the picked area.
import type { Rgba, VisualTheme } from './types';

function clampChannel(value: string | number): number {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function clampAlpha(value: string | number): number {
  return Math.max(0, Math.min(1, Number(value)));
}

function parseRgbColor(body: string): Rgba | null {
  const parts = body.split(',').map((item) => item.trim());
  if (parts.length < 3) {
    return null;
  }
  return [
    clampChannel(parts[0]),
    clampChannel(parts[1]),
    clampChannel(parts[2]),
    parts.length > 3 ? clampAlpha(parts[3]) : 1
  ];
}

// #rgb, #rgba, #rrggbb or #rrggbbaa, without the #.
function parseHexColor(hex: string): Rgba | null {
  if (hex.length === 3 || hex.length === 4) {
    const chars = hex.split('');
    return [
      parseInt(chars[0] + chars[0], 16),
      parseInt(chars[1] + chars[1], 16),
      parseInt(chars[2] + chars[2], 16),
      hex.length === 4 ? clampAlpha(parseInt(chars[3] + chars[3], 16) / 255) : 1
    ];
  }
  if (hex.length === 6 || hex.length === 8) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      hex.length === 8 ? clampAlpha(parseInt(hex.slice(6, 8), 16) / 255) : 1
    ];
  }
  return null;
}

function parseCssColor(value: string): Rgba | null {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'transparent' || raw === 'initial' || raw === 'inherit') {
    return null;
  }
  const rgbaMatch = raw.match(/^rgba?\(([^)]+)\)$/);
  if (rgbaMatch) {
    return parseRgbColor(rgbaMatch[1]);
  }
  const hexMatch = raw.match(/^#([0-9a-f]{3,8})$/i);
  return hexMatch ? parseHexColor(hexMatch[1]) : null;
}

function rgbToCss(color: Rgba, alphaOverride?: number): string {
  const alpha = alphaOverride == null ? color[3] : alphaOverride;
  if (alpha >= 0.999) {
    return `rgb(${clampChannel(color[0])}, ${clampChannel(color[1])}, ${clampChannel(color[2])})`;
  }
  return `rgba(${clampChannel(color[0])}, ${clampChannel(color[1])}, ${clampChannel(color[2])}, ${clampAlpha(alpha).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')})`;
}

function getLuminance(color: Rgba): number {
  const normalize = (channel: number): number => {
    const value = clampChannel(channel) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * normalize(color[0]) + 0.7152 * normalize(color[1]) + 0.0722 * normalize(color[2]);
}

function findNearestPaintedElement(element: Element): Element {
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const backgroundColor = parseCssColor(style.backgroundColor);
    if ((backgroundColor && backgroundColor[3] > 0.04) || style.backgroundImage !== 'none') {
      return current;
    }
    current = current.parentElement;
  }
  return document.body || document.documentElement;
}

function getVisualTheme(element: Element): VisualTheme {
  const surfaceElement = findNearestPaintedElement(element);
  const pageElement = document.body || document.documentElement;
  const surfaceStyle = window.getComputedStyle(surfaceElement);
  const pageStyle = window.getComputedStyle(pageElement);
  const surfaceColor: Rgba = parseCssColor(surfaceStyle.backgroundColor) ||
    parseCssColor(pageStyle.backgroundColor) ||
    [255, 255, 255, 1];
  const pageColor = parseCssColor(pageStyle.backgroundColor) || surfaceColor;
  const isDark = getLuminance(surfaceColor) < 0.45;
  return {
    pageBackground: rgbToCss(pageColor),
    hudBackground: rgbToCss(surfaceColor, isDark ? 0.86 : 0.9),
    hudBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)',
    buttonBackground: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)',
    secondaryButtonBackground: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.05)',
    buttonText: isDark ? '#f8fafc' : '#0f172a',
    buttonShadow: isDark
      ? 'inset 0 0 0 1px rgba(255,255,255,0.1)'
      : 'inset 0 0 0 1px rgba(255,255,255,0.46)',
    cardShadow: isDark ? '0 22px 60px rgba(0, 0, 0, 0.34)' : '0 22px 60px rgba(15, 23, 42, 0.14)',
    highlightBorder: isDark ? 'rgba(147, 197, 253, 0.92)' : 'rgba(37, 99, 235, 0.72)',
    highlightBackground: isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(37, 99, 235, 0.10)',
    highlightShadow: isDark
      ? '0 0 0 1px rgba(255,255,255,0.12), 0 20px 60px rgba(0, 0, 0, 0.28)'
      : '0 0 0 1px rgba(255,255,255,0.55), 0 20px 60px rgba(15, 23, 42, 0.18)',
    isDark
  };
}

function getPickerTheme(element: Element | null): VisualTheme {
  return getVisualTheme(element || document.body || document.documentElement);
}

export {
  clampAlpha,
  clampChannel,
  findNearestPaintedElement,
  getLuminance,
  getPickerTheme,
  getVisualTheme,
  parseCssColor,
  rgbToCss
};
