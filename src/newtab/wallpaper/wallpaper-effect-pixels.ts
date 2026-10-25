// The arithmetic the wallpaper effects draw with: colors, luminance, tone
// curves, noise, and reading the sampled wallpaper where a cover-fit image
// lands in the viewport.

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface Viewport {
  width: number;
  height: number;
}

// How light a sampled image is, 0-1, and the ink that reads on it.
interface ImageAnalysis {
  averageLuminance: number;
  lowLuminance: number;
  highLuminance: number;
  useDarkInk: boolean;
}

// The wallpaper read into a small canvas, with how its pixels map onto the
// full image.
interface EffectSampler extends ImageAnalysis {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  scaleX: number;
  scaleY: number;
  data: Uint8ClampedArray;
}

// Where a cover-fit wallpaper sits in the viewport.
interface RenderedMetrics {
  scale: number;
  offsetX: number;
  offsetY: number;
  renderedWidth: number;
  renderedHeight: number;
}

const ASCII_LIGHT_WALLPAPER_THRESHOLD = 0.58;
const TARGET_EFFECT_CANVAS_PIXELS = 2048 * 2048;
const MAX_EFFECT_CANVAS_SCALE = 1.6;

function clampNumber(value: unknown, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, number));
}

function quantizeDitherChannel(value: number, threshold: number, levels: number): number {
  const stepCount = Math.max(2, Math.round(Number(levels) || 2));
  const scaled = (clampNumber(value, 0, 255) / 255) * (stepCount - 1);
  const lower = Math.floor(scaled);
  const quantizedIndex = Math.min(
    stepCount - 1,
    lower + ((scaled - lower) > clampNumber(threshold, 0, 1) ? 1 : 0)
  );
  return (quantizedIndex / (stepCount - 1)) * 255;
}

function quantizeDitherColor(
  color: Partial<RgbColor> | null | undefined,
  threshold: number,
  levels: number,
  mix: number
): RgbColor {
  const source = color || {};
  const blend = clampNumber(mix, 0, 1);
  const quantize = (value: unknown): number => {
    const channel = clampNumber(value, 0, 255);
    const quantized = quantizeDitherChannel(channel, threshold, levels);
    return Math.round(channel + ((quantized - channel) * blend));
  };
  return {
    red: quantize(source.red),
    green: quantize(source.green),
    blue: quantize(source.blue)
  };
}

function liftSampleColor(
  color: Partial<RgbColor> | null | undefined,
  brightness: number,
  saturationBoost: number
): RgbColor {
  const source = color || {};
  const red = clampNumber(source.red, 0, 255) / 255;
  const green = clampNumber(source.green, 0, 255) / 255;
  const blue = clampNumber(source.blue, 0, 255) / 255;
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const delta = maxChannel - minChannel;
  let hue = 0;
  if (delta > 0) {
    if (maxChannel === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (maxChannel === green) {
      hue = ((blue - red) / delta) + 2;
    } else {
      hue = ((red - green) / delta) + 4;
    }
    hue = ((hue * 60) + 360) % 360;
  }
  const saturation = maxChannel > 0 ? delta / maxChannel : 0;
  const liftedValue = maxChannel + (
    (1 - maxChannel) * clampNumber(brightness, 0, 1)
  );
  const liftedSaturation = clampNumber(
    saturation * (1 + clampNumber(saturationBoost, 0, 1.2)),
    0,
    1
  );
  const chroma = liftedValue * liftedSaturation;
  const hueSector = hue / 60;
  const secondChannel = chroma * (1 - Math.abs((hueSector % 2) - 1));
  let redPrime = 0;
  let greenPrime = 0;
  let bluePrime = 0;
  if (hueSector < 1) {
    redPrime = chroma;
    greenPrime = secondChannel;
  } else if (hueSector < 2) {
    redPrime = secondChannel;
    greenPrime = chroma;
  } else if (hueSector < 3) {
    greenPrime = chroma;
    bluePrime = secondChannel;
  } else if (hueSector < 4) {
    greenPrime = secondChannel;
    bluePrime = chroma;
  } else if (hueSector < 5) {
    redPrime = secondChannel;
    bluePrime = chroma;
  } else {
    redPrime = chroma;
    bluePrime = secondChannel;
  }
  const match = liftedValue - chroma;
  return {
    red: Math.round(clampNumber((redPrime + match) * 255, 0, 255)),
    green: Math.round(clampNumber((greenPrime + match) * 255, 0, 255)),
    blue: Math.round(clampNumber((bluePrime + match) * 255, 0, 255))
  };
}

function getEffectCanvasScale(devicePixelRatio: unknown, viewportWidth: unknown, viewportHeight: unknown): number {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const height = Math.max(1, Number(viewportHeight) || 1);
  const pixelBudgetScale = Math.sqrt(TARGET_EFFECT_CANVAS_PIXELS / (width * height));
  return clampNumber(
    Math.min(Number(devicePixelRatio) || 1, pixelBudgetScale, MAX_EFFECT_CANVAS_SCALE),
    1,
    MAX_EFFECT_CANVAS_SCALE
  );
}

function analyzeImageData(data: ArrayLike<number> | null | undefined): ImageAnalysis {
  if (!data || typeof data.length !== 'number' || data.length < 4) {
    return {
      averageLuminance: 0.5,
      lowLuminance: 0.1,
      highLuminance: 0.9,
      useDarkInk: false
    };
  }
  const pixelCount = Math.floor(data.length / 4);
  const sampleStride = Math.max(1, Math.floor(pixelCount / 12000));
  let luminanceTotal = 0;
  let sampledPixels = 0;
  const luminanceSamples: number[] = [];
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += sampleStride) {
    const index = pixelIndex * 4;
    const alpha = clampNumber(Number(data[index + 3]) / 255, 0, 1);
    const red = (Number(data[index]) * alpha) + (255 * (1 - alpha));
    const green = (Number(data[index + 1]) * alpha) + (255 * (1 - alpha));
    const blue = (Number(data[index + 2]) * alpha) + (255 * (1 - alpha));
    const luminance = ((red * 0.299) + (green * 0.587) + (blue * 0.114)) / 255;
    luminanceTotal += luminance;
    luminanceSamples.push(luminance);
    sampledPixels += 1;
  }
  const averageLuminance = sampledPixels > 0
    ? clampNumber(luminanceTotal / sampledPixels, 0, 1)
    : 0.5;
  luminanceSamples.sort((first, second) => first - second);
  const lastSampleIndex = Math.max(0, luminanceSamples.length - 1);
  const lowLuminance = luminanceSamples.length > 0
    ? luminanceSamples[Math.round(lastSampleIndex * 0.08)]
    : 0.1;
  const highLuminance = luminanceSamples.length > 0
    ? luminanceSamples[Math.round(lastSampleIndex * 0.92)]
    : 0.9;
  return {
    averageLuminance,
    lowLuminance: clampNumber(lowLuminance, 0, 1),
    highLuminance: clampNumber(highLuminance, 0, 1),
    useDarkInk: averageLuminance >= ASCII_LIGHT_WALLPAPER_THRESHOLD
  };
}

function getLuminanceFromRgb(red: number, green: number, blue: number): number {
  return ((red * 0.299) + (green * 0.587) + (blue * 0.114)) / 255;
}

function getRenderedMetrics(sampler: EffectSampler, viewport: Viewport): RenderedMetrics {
  const scale = Math.max(
    viewport.width / sampler.naturalWidth,
    viewport.height / sampler.naturalHeight
  );
  const renderedWidth = sampler.naturalWidth * scale;
  const renderedHeight = sampler.naturalHeight * scale;
  return {
    scale,
    offsetX: (viewport.width - renderedWidth) / 2,
    offsetY: (viewport.height - renderedHeight) / 2,
    renderedWidth,
    renderedHeight
  };
}

function sampleColor(sampler: EffectSampler, metrics: RenderedMetrics, viewportX: number, viewportY: number): RgbColor {
  const sourceX = ((viewportX - metrics.offsetX) / metrics.scale) * sampler.scaleX;
  const sourceY = ((viewportY - metrics.offsetY) / metrics.scale) * sampler.scaleY;
  const x = Math.round(clampNumber(sourceX, 0, sampler.width - 1));
  const y = Math.round(clampNumber(sourceY, 0, sampler.height - 1));
  const index = (y * sampler.width + x) * 4;
  const red = sampler.data[index] || 0;
  const green = sampler.data[index + 1] || 0;
  const blue = sampler.data[index + 2] || 0;
  const alpha = (sampler.data[index + 3] || 255) / 255;
  return {
    red: Math.round((red * alpha) + (255 * (1 - alpha))),
    green: Math.round((green * alpha) + (255 * (1 - alpha))),
    blue: Math.round((blue * alpha) + (255 * (1 - alpha)))
  };
}

function getLuminance(color: RgbColor): number {
  return getLuminanceFromRgb(color.red, color.green, color.blue);
}

function clampChannel(value: number): number {
  return Math.round(clampNumber(value, 0, 255));
}

function boostSampleColor(color: RgbColor, amount: number): RgbColor {
  const boost = 1 + clampNumber(amount, 0, 1.2);
  const luma = ((color.red * 0.299) + (color.green * 0.587) + (color.blue * 0.114));
  return {
    red: clampChannel(luma + ((color.red - luma) * boost)),
    green: clampChannel(luma + ((color.green - luma) * boost)),
    blue: clampChannel(luma + ((color.blue - luma) * boost))
  };
}

function getEffectAlpha(base: number, strength: number): number {
  return clampNumber((strength / 100) * base, 0, 1);
}

function smoothstep(value: number): number {
  const x = clampNumber(value, 0, 1);
  return x * x * (3 - (2 * x));
}

function applyToneCurve(tone: number, strength: number): number {
  const amount = clampNumber(strength, 0, 100) / 100;
  const blackPoint = amount * 0.22;
  const whitePoint = 1 - (amount * 0.08);
  const leveled = clampNumber((tone - blackPoint) / Math.max(0.01, whitePoint - blackPoint), 0, 1);
  const curved = smoothstep(leveled);
  return (leveled * (1 - amount)) + (curved * amount);
}

function getLayerEffectTone(luminance: number, sampler: EffectSampler, strength: number, useDarkInk: boolean): number {
  const useLightInk = useDarkInk !== true;
  const rawTone = useLightInk ? luminance : (1 - luminance);
  const low = clampNumber(sampler.lowLuminance, 0, 1);
  const high = clampNumber(sampler.highLuminance, 0, 1);
  const range = high - low;
  if (range < 0.025) {
    return applyToneCurve(rawTone, strength);
  }
  const normalizedTone = useLightInk
    ? clampNumber((luminance - low) / range, 0, 1)
    : clampNumber((high - luminance) / range, 0, 1);
  const contrastMix = 0.72 + ((clampNumber(strength, 0, 100) / 100) * 0.14);
  return applyToneCurve(
    (rawTone * (1 - contrastMix)) + (normalizedTone * contrastMix),
    strength
  );
}

function getControlRange(value: number, minValue: number, maxValue: number): number {
  const ratio = clampNumber(value, 0, 100) / 100;
  return minValue + ((maxValue - minValue) * ratio);
}

function getOverlayBlendLuminance(baseLuminance: number, effectLuminance: number): number {
  const base = clampNumber(baseLuminance, 0, 1);
  const source = clampNumber(effectLuminance, 0, 1);
  if (base <= 0.5) {
    return 2 * base * source;
  }
  return 1 - (2 * (1 - base) * (1 - source));
}

function quantizeBlockColor(color: RgbColor, texture: number): RgbColor {
  const levels = 4 + Math.round((clampNumber(texture, 0, 100) / 100) * 20);
  const quantize = (value: number) => Math.round(
    (Math.round((clampNumber(value, 0, 255) / 255) * (levels - 1)) / (levels - 1)) * 255
  );
  return {
    red: quantize(color.red),
    green: quantize(color.green),
    blue: quantize(color.blue)
  };
}

function shadeBlockColor(color: RgbColor, amount: number): RgbColor {
  const ratio = clampNumber(amount, -1, 1);
  const target = ratio >= 0 ? 255 : 0;
  const mix = Math.abs(ratio);
  return {
    red: Math.round(color.red + ((target - color.red) * mix)),
    green: Math.round(color.green + ((target - color.green) * mix)),
    blue: Math.round(color.blue + ((target - color.blue) * mix))
  };
}

function getBlockColorCss(color: RgbColor, alpha?: number): string {
  if (typeof alpha === 'number' && Number.isFinite(alpha)) {
    return `rgb(${color.red} ${color.green} ${color.blue} / ${clampNumber(alpha, 0, 1)})`;
  }
  return `rgb(${color.red} ${color.green} ${color.blue})`;
}

function getBlockMaterialHash(column: number, row: number): number {
  return Math.abs(Math.imul(column + 17, 374761393) ^ Math.imul(row + 29, 668265263));
}

function getBlockMaterialVariation(column: number, row: number): number {
  return ((getBlockMaterialHash(column, row) % 17) - 8) / 400;
}

function mixBlockColors(first: RgbColor, second: RgbColor | null | undefined, ratio: number): RgbColor {
  const mix = clampNumber(ratio, 0, 1);
  const target = second || first;
  return {
    red: Math.round(first.red + ((target.red - first.red) * mix)),
    green: Math.round(first.green + ((target.green - first.green) * mix)),
    blue: Math.round(first.blue + ((target.blue - first.blue) * mix))
  };
}

function getGridStart(step: number, minimum: number): number {
  const first = step / 2;
  if (minimum <= first) {
    return first;
  }
  return first + (Math.floor((minimum - first) / step) * step);
}

function getNoiseByte(x: number, y: number, seed: number): number {
  let value = ((x * 374761393) ^ (y * 668265263) ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return (value ^ (value >>> 16)) & 255;
}

function getCoarseNoiseByte(x: number, y: number, tileSize: number): number {
  const cellSize = 16;
  const cellCount = Math.max(1, Math.round(tileSize / cellSize));
  const cellX = Math.floor(x / cellSize);
  const cellY = Math.floor(y / cellSize);
  const nextX = (cellX + 1) % cellCount;
  const nextY = (cellY + 1) % cellCount;
  const offsetX = (x % cellSize) / cellSize;
  const offsetY = (y % cellSize) / cellSize;
  const smoothX = offsetX * offsetX * (3 - (2 * offsetX));
  const smoothY = offsetY * offsetY * (3 - (2 * offsetY));
  const topLeft = getNoiseByte(cellX, cellY, 0x51f15e);
  const topRight = getNoiseByte(nextX, cellY, 0x51f15e);
  const bottomLeft = getNoiseByte(cellX, nextY, 0x51f15e);
  const bottomRight = getNoiseByte(nextX, nextY, 0x51f15e);
  const top = topLeft + ((topRight - topLeft) * smoothX);
  const bottom = bottomLeft + ((bottomRight - bottomLeft) * smoothX);
  return Math.round(top + ((bottom - top) * smoothY));
}

function writeTransparentNoisePixel(data: Uint8ClampedArray, index: number, value: number, alphaScale: number): void {
  const delta = value - 127.5;
  const channel = delta >= 0 ? 255 : 0;
  data[index] = channel;
  data[index + 1] = channel;
  data[index + 2] = channel;
  data[index + 3] = Math.round(Math.min(255, Math.abs(delta) * 2 * alphaScale));
}

export {
  analyzeImageData,
  applyToneCurve,
  boostSampleColor,
  clampChannel,
  clampNumber,
  getBlockColorCss,
  getBlockMaterialHash,
  getBlockMaterialVariation,
  getCoarseNoiseByte,
  getControlRange,
  getEffectAlpha,
  getEffectCanvasScale,
  getGridStart,
  getLayerEffectTone,
  getLuminance,
  getLuminanceFromRgb,
  getNoiseByte,
  getOverlayBlendLuminance,
  getRenderedMetrics,
  liftSampleColor,
  mixBlockColors,
  quantizeBlockColor,
  quantizeDitherChannel,
  quantizeDitherColor,
  sampleColor,
  shadeBlockColor,
  smoothstep,
  writeTransparentNoisePixel
};
export type { EffectSampler, ImageAnalysis, RenderedMetrics, RgbColor, Viewport };
