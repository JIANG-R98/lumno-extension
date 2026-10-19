(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabShortcutIconPlate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';

  // A shortcut icon whose artwork has no background of its own (a bare logo on
  // transparency) gets a plate, so it reads as a tile like the icons that
  // bring their own square. The plate is a soft tint of the artwork's main
  // color. Each shortcut can turn this on or off, or pick the plate color.
  const SAMPLE_SIZE = 32;
  const TRANSPARENT_ALPHA = 24;
  const OPAQUE_ALPHA = 128;
  // A rounded-square icon leaves only its corners clear; a bare logo or a
  // round badge leaves most of the edge clear.
  const MIN_CLEAR_EDGE_RATIO = 0.4;
  const MAX_OPAQUE_COVERAGE = 0.9;
  // Yellow on a pale plate still reads; a white logo on white does not.
  const MIN_PLATE_CONTRAST = 1.4;
  const MAX_PALETTE_SIZE = 3;
  const MIN_PALETTE_SHARE = 0.12;
  const MIN_PALETTE_DISTANCE = 96;
  const MAX_CACHE_ENTRIES = 400;
  const PLATE_MODES = Object.freeze(['on', 'off']);
  const LIGHT_BASE = [255, 255, 255];
  const DARK_BASE = [42, 42, 44];
  const analysisCache = new Map();

  function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function mixColor(color, target, amount) {
    return [0, 1, 2].map((index) => clampChannel(color[index] + ((target[index] - color[index]) * amount)));
  }

  function getLuminance(rgb) {
    const [r, g, b] = rgb.map((value) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  }

  function getContrastRatio(first, second) {
    const a = getLuminance(first);
    const b = getLuminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  function isNearWhite(rgb) {
    return Math.min(rgb[0], rgb[1], rgb[2]) > 232;
  }

  function getColorDistance(first, second) {
    return Math.abs(first[0] - second[0]) + Math.abs(first[1] - second[1]) + Math.abs(first[2] - second[2]);
  }

  function getSaturation(rgb) {
    const max = Math.max(rgb[0], rgb[1], rgb[2]) / 255;
    const min = Math.min(rgb[0], rgb[1], rgb[2]) / 255;
    if (max === min) return 0;
    const lightness = (max + min) / 2;
    return (max - min) / (1 - Math.abs((2 * lightness) - 1));
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
  }

  function hexToRgb(value) {
    const match = /^#([\da-f]{6})$/i.exec(String(value || '').trim());
    if (!match) return null;
    return [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16));
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  // '' means automatic: a plate only behind see-through artwork.
  function normalizePlateMode(value) {
    return PLATE_MODES.includes(value) ? value : '';
  }

  function normalizePlateColor(value) {
    const rgb = hexToRgb(value);
    return rgb ? rgbToHex(rgb) : '';
  }

  // Reads RGBA pixels of a square sample. Returns whether the artwork is
  // see-through at its edge, its main color and a few distinct colors.
  function analyzePixels(data, size) {
    const side = Math.max(1, Math.floor(Number(size) || SAMPLE_SIZE));
    if (!data || data.length < side * side * 4) {
      return null;
    }
    let edgeCount = 0;
    let clearEdgeCount = 0;
    let opaqueCount = 0;
    let visibleCount = 0;
    const buckets = new Map();
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const offset = ((y * side) + x) * 4;
        const alpha = data[offset + 3];
        const onEdge = x < 2 || y < 2 || x >= side - 2 || y >= side - 2;
        if (onEdge) {
          edgeCount += 1;
          if (alpha < TRANSPARENT_ALPHA) clearEdgeCount += 1;
        }
        if (alpha >= OPAQUE_ALPHA) opaqueCount += 1;
        if (alpha < OPAQUE_ALPHA) continue;
        visibleCount += 1;
        const rgb = [data[offset], data[offset + 1], data[offset + 2]];
        // Colorful pixels outweigh white or gray detail, so a white letter on
        // an orange bag still reads as orange.
        const weight = (alpha / 255) * (isNearWhite(rgb) ? 0.08 : 0.3 + getSaturation(rgb));
        const key = ((rgb[0] >> 5) << 6) | ((rgb[1] >> 5) << 3) | (rgb[2] >> 5);
        const bucket = buckets.get(key) || { weight: 0, count: 0, r: 0, g: 0, b: 0 };
        bucket.weight += weight;
        bucket.count += 1;
        bucket.r += rgb[0];
        bucket.g += rgb[1];
        bucket.b += rgb[2];
        buckets.set(key, bucket);
      }
    }
    const total = side * side;
    const transparent = edgeCount > 0 &&
      (clearEdgeCount / edgeCount) >= MIN_CLEAR_EDGE_RATIO &&
      (opaqueCount / total) <= MAX_OPAQUE_COVERAGE &&
      visibleCount > 0;
    const sorted = Array.from(buckets.values()).sort((first, second) => second.weight - first.weight);
    const totalWeight = sorted.reduce((sum, bucket) => sum + bucket.weight, 0);
    const ranked = sorted.map((bucket) => ({
      share: totalWeight ? bucket.weight / totalWeight : 0,
      rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count].map(clampChannel)
    }));
    // Only colors that make up a real part of the artwork, not the blends at
    // its anti-aliased edges; white is always offered on its own.
    const palette = [];
    ranked.forEach(({ share, rgb }) => {
      if (palette.length >= MAX_PALETTE_SIZE || share < MIN_PALETTE_SHARE || isNearWhite(rgb)) return;
      if (palette.some((color) => getColorDistance(color, rgb) < MIN_PALETTE_DISTANCE)) return;
      palette.push(rgb);
    });
    return {
      transparent,
      // A white-only logo keeps white as its color.
      accent: palette[0] || (ranked[0] ? ranked[0].rgb : null),
      palette
    };
  }

  function analyzeImage(image, options) {
    const opts = options && typeof options === 'object' ? options : {};
    const source = image && (image.currentSrc || image.src) ? String(image.currentSrc || image.src) : '';
    if (!source || !image.complete || !(image.naturalWidth > 0)) {
      return null;
    }
    if (analysisCache.has(source)) {
      return analysisCache.get(source);
    }
    const documentObj = opts.documentObj || root.document;
    if (!documentObj || typeof documentObj.createElement !== 'function') {
      return null;
    }
    let result = null;
    try {
      const canvas = documentObj.createElement('canvas');
      canvas.width = SAMPLE_SIZE;
      canvas.height = SAMPLE_SIZE;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      result = analyzePixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data, SAMPLE_SIZE);
    } catch (error) {
      // A cross-origin image taints the canvas; such icons keep no plate.
      result = null;
    }
    if (analysisCache.size >= MAX_CACHE_ENTRIES) {
      analysisCache.delete(analysisCache.keys().next().value);
    }
    analysisCache.set(source, result);
    return result;
  }

  // The first tint that keeps the artwork legible, on the mode's own surface
  // first: a black logo gets a light plate even in dark mode, a white logo a
  // dark one in light mode.
  function pickPlate(accent, candidates) {
    let best = candidates[0];
    let bestContrast = 0;
    for (const candidate of candidates) {
      const contrast = getContrastRatio(candidate, accent);
      if (contrast >= MIN_PLATE_CONTRAST) return candidate;
      if (contrast > bestContrast) {
        best = candidate;
        bestContrast = contrast;
      }
    }
    return best;
  }

  function getAutoPlateColors(accent) {
    const color = Array.isArray(accent) && accent.length === 3 ? accent : null;
    if (!color) {
      return { light: rgbToCss(LIGHT_BASE), dark: rgbToCss([58, 58, 60]) };
    }
    // The tile around the plate is tinted from the same color. In light mode
    // the plate is a paler tint than the tile, gray and black artwork getting
    // plain white; in dark mode a stronger one, so it reads as its own square.
    const strength = getSaturation(color);
    const light = pickPlate(color, [
      mixColor(color, LIGHT_BASE, 1 - (0.12 * strength)),
      mixColor(color, DARK_BASE, 0.62)
    ]);
    const dark = pickPlate(color, [
      mixColor(color, DARK_BASE, 0.78 - (0.26 * strength)),
      mixColor(color, LIGHT_BASE, 0.88)
    ]);
    return { light: rgbToCss(light), dark: rgbToCss(dark) };
  }

  // Plate colors a person can pick in the shortcut dialog: a soft and a
  // stronger tint of the artwork's main color, soft tints of its other
  // colors, then white and near-black.
  function getPlateColorChoices(analysis) {
    const palette = analysis && Array.isArray(analysis.palette) ? analysis.palette : [];
    const candidates = [];
    palette.forEach((rgb, index) => {
      candidates.push(pickPlate(rgb, [mixColor(rgb, LIGHT_BASE, 0.86), mixColor(rgb, DARK_BASE, 0.6)]));
      if (index === 0) {
        candidates.push(pickPlate(rgb, [mixColor(rgb, LIGHT_BASE, 0.68), mixColor(rgb, DARK_BASE, 0.4)]));
      }
    });
    candidates.push(LIGHT_BASE, [28, 28, 30]);
    const choices = [];
    candidates.forEach((rgb) => {
      if (choices.some((color) => getColorDistance(color, rgb) < 24)) return;
      choices.push(rgb);
    });
    return choices.map(rgbToHex);
  }

  // What a tile shows: null for no plate, else the plate colors per mode.
  function resolvePlate(input) {
    const source = input && typeof input === 'object' ? input : {};
    const mode = normalizePlateMode(source.mode);
    if (mode === 'off' || source.eligible === false) {
      return null;
    }
    const analysis = source.analysis || null;
    if (mode !== 'on' && !(analysis && analysis.transparent)) {
      return null;
    }
    const customRgb = hexToRgb(normalizePlateColor(source.color));
    if (customRgb) {
      const css = rgbToCss(customRgb);
      return { light: css, dark: css, custom: true };
    }
    return { ...getAutoPlateColors(analysis && analysis.accent), custom: false };
  }

  return Object.freeze({
    SAMPLE_SIZE,
    PLATE_MODES,
    normalizePlateMode,
    normalizePlateColor,
    analyzePixels,
    analyzeImage,
    getAutoPlateColors,
    getPlateColorChoices,
    resolvePlate,
    rgbToHex,
    hexToRgb,
    getContrastRatio
  });
});
