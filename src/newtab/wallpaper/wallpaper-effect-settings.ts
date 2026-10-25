// The wallpaper effect preferences: which effect, its ink and its controls
// for each color mode, as stored and as an effect reads them.
import { clampNumber } from './wallpaper-effect-pixels';

type EffectType = 'none' | 'blur' | 'grain' | 'blocks' | 'halftone' | 'dither' | 'ascii' | 'crt';
// Which tones an effect draws in: 'auto' follows the color mode.
type EffectInkTone = 'auto' | 'dark' | 'light';

// The effect settings of one color mode.
interface WallpaperEffectPrefs {
  version: number;
  type: EffectType;
  inkTone: EffectInkTone;
  // 0-100.
  strength: number;
  size: number;
  spacing: number;
  texture: number;
  // 0-5.
  blockSize: number;
  // The CRT effect's physical values: strength and bloom 0-20, RGB offset
  // 0-100, curvature 0-35.
  crtStrength: number;
  crtBloom: number;
  crtRgbOffset: number;
  crtCurvature: number;
}

// The stored preferences: one set per color mode.
interface WallpaperEffectStoragePrefs {
  version: number;
  light: WallpaperEffectPrefs;
  dark: WallpaperEffectPrefs;
}

const EFFECT_TYPES: readonly EffectType[] = ['none', 'blur', 'grain', 'blocks', 'halftone', 'dither', 'ascii', 'crt'];
const EFFECT_INK_TONES: readonly EffectInkTone[] = ['auto', 'dark', 'light'];
const MIN_BLUR_RADIUS_PX = 2;
const MAX_BLUR_RADIUS_PX = 32;
const DEFAULT_PREFS: WallpaperEffectPrefs = {
  version: 11,
  type: 'none',
  inkTone: 'auto',
  strength: 50,
  size: 50,
  spacing: 50,
  texture: 20,
  blockSize: 1,
  crtStrength: 20,
  crtBloom: 15,
  crtRgbOffset: 35,
  crtCurvature: 18
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isEffectType(value: unknown): value is EffectType {
  return EFFECT_TYPES.some((type) => type === value);
}

function isEffectInkTone(value: unknown): value is EffectInkTone {
  return EFFECT_INK_TONES.some((tone) => tone === value);
}

function clampCrtPhysicalValue(value: unknown, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max) * 1000) / 1000;
}

function normalizeBlockParameter(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.round(clampNumber(number, 0, 5));
}

// A stored set of preferences brought to the latest version; values are
// left for normalizePrefs to check.
function migratePrefsToLatest(value: unknown, inheritedVersion?: unknown): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  const ownVersion = Number(source.version);
  const fallbackVersion = Number(inheritedVersion);
  const storedVersion = Number.isFinite(ownVersion) ? ownVersion : fallbackVersion;
  const migrated: Record<string, unknown> = { ...source };
  if (!Number.isFinite(storedVersion) || storedVersion < 11) {
    if (source.type === 'blocks') {
      const explicitBlockSize = Number(source.blockSize);
      const legacySize = Number(source.size);
      let blockSize = Number.isFinite(explicitBlockSize) ? explicitBlockSize : legacySize;
      if ((!Number.isFinite(storedVersion) || storedVersion < 10) &&
          Number.isFinite(blockSize) && blockSize > 5) {
        blockSize /= 20;
      }
      migrated.blockSize = Number.isFinite(blockSize)
        ? blockSize
        : DEFAULT_PREFS.blockSize;
      migrated.strength = DEFAULT_PREFS.strength;
      migrated.size = DEFAULT_PREFS.size;
      migrated.spacing = DEFAULT_PREFS.spacing;
      migrated.texture = DEFAULT_PREFS.texture;
    }
    if (source.type === 'crt') {
      migrated.crtStrength = Number.isFinite(Number(source.crtStrength))
        ? source.crtStrength
        : (Number.isFinite(Number(source.strength))
          ? source.strength
          : DEFAULT_PREFS.crtStrength);
      migrated.strength = DEFAULT_PREFS.strength;
    }
  }
  migrated.version = DEFAULT_PREFS.version;
  return migrated;
}

function normalizePrefs(value: unknown, inheritedVersion?: unknown): WallpaperEffectPrefs {
  const source = migratePrefsToLatest(value, inheritedVersion);
  const type = isEffectType(source.type) ? source.type : DEFAULT_PREFS.type;
  const inkTone = isEffectInkTone(source.inkTone) ? source.inkTone : DEFAULT_PREFS.inkTone;
  const rawStrength = Number.isFinite(Number(source.strength))
    ? source.strength
    : DEFAULT_PREFS.strength;
  const rawSize = Number.isFinite(Number(source.size))
    ? source.size
    : (Number.isFinite(Number(source.density)) ? source.density : DEFAULT_PREFS.size);
  const rawSpacing = Number.isFinite(Number(source.spacing))
    ? source.spacing
    : DEFAULT_PREFS.spacing;
  const rawTexture = Number.isFinite(Number(source.texture))
    ? source.texture
    : DEFAULT_PREFS.texture;
  const rawBlockSize = Number.isFinite(Number(source.blockSize))
    ? source.blockSize
    : DEFAULT_PREFS.blockSize;
  const rawCrtStrength = Number.isFinite(Number(source.crtStrength))
    ? source.crtStrength
    : DEFAULT_PREFS.crtStrength;
  const rawCrtBloom = Number.isFinite(Number(source.crtBloom))
    ? source.crtBloom
    : DEFAULT_PREFS.crtBloom;
  const rawCrtRgbOffset = Number.isFinite(Number(source.crtRgbOffset))
    ? source.crtRgbOffset
    : DEFAULT_PREFS.crtRgbOffset;
  const rawCrtCurvature = Number.isFinite(Number(source.crtCurvature))
    ? source.crtCurvature
    : DEFAULT_PREFS.crtCurvature;
  return {
    version: DEFAULT_PREFS.version,
    type,
    inkTone,
    strength: Math.round(clampNumber(rawStrength, 0, 100)),
    size: Math.round(clampNumber(rawSize, 0, 100)),
    spacing: Math.round(clampNumber(rawSpacing, 0, 100)),
    texture: Math.round(clampNumber(rawTexture, 0, 100)),
    blockSize: normalizeBlockParameter(rawBlockSize, DEFAULT_PREFS.blockSize),
    crtStrength: clampCrtPhysicalValue(rawCrtStrength, 0, 20),
    crtBloom: clampCrtPhysicalValue(rawCrtBloom, 0, 20),
    crtRgbOffset: Math.round(clampNumber(rawCrtRgbOffset, 0, 100)),
    crtCurvature: clampCrtPhysicalValue(rawCrtCurvature, 0, 35)
  };
}

function normalizeStoragePrefs(value: unknown): WallpaperEffectStoragePrefs {
  const source = isRecord(value) ? value : {};
  const hasModePrefs = isRecord(source.light) || isRecord(source.dark);
  const normalizeMode = (modeValue: unknown) => normalizePrefs(modeValue, source.version);
  const shared = normalizeMode(source);
  const lightSource = hasModePrefs ? (source.light || source.dark) : shared;
  const darkSource = hasModePrefs ? (source.dark || source.light) : shared;
  return {
    version: DEFAULT_PREFS.version,
    light: normalizeMode(lightSource),
    dark: normalizeMode(darkSource)
  };
}

function getBlurRadius(strength: unknown): number {
  const ratio = clampNumber(strength, 0, 100) / 100;
  return Math.round((MIN_BLUR_RADIUS_PX +
    ((MAX_BLUR_RADIUS_PX - MIN_BLUR_RADIUS_PX) * ratio)) * 10) / 10;
}

function getStandardFrostParams(texture: unknown) {
  const inputRatio = clampNumber(texture, 0, 100) / 100;
  const ratio = Math.pow(inputRatio, 0.65);
  return {
    ratio,
    materialOpacity: ratio * 0.18,
    grainSize: Math.round(96 - (32 * ratio)),
    coarseGrainSize: Math.round(420 - (100 * ratio)),
    saturation: Math.round(100 + (10 * ratio)),
    brightness: Math.round(100 + (6 * ratio)),
    contrast: Math.round(100 - (16 * ratio))
  };
}

// 'auto' follows the color mode: light mode samples shadows, dark mode samples highlights.
function resolveAutoInkTone(inkTone: unknown, mode: unknown): 'dark' | 'light' {
  if (inkTone === 'dark' || inkTone === 'light') {
    return inkTone;
  }
  return mode === 'dark' ? 'light' : 'dark';
}

function resolvePrefsForMode(value: unknown, mode: unknown): WallpaperEffectPrefs {
  const normalized = normalizePrefs(value);
  return { ...normalized, inkTone: resolveAutoInkTone(normalized.inkTone, mode) };
}

function resolveUseDarkInk(inkTone: unknown, sampler: { useDarkInk?: boolean } | null | undefined): boolean {
  if (inkTone === 'dark') {
    return true;
  }
  if (inkTone === 'light') {
    return false;
  }
  return Boolean(sampler && sampler.useDarkInk === true);
}

export {
  DEFAULT_PREFS,
  EFFECT_INK_TONES,
  EFFECT_TYPES,
  getBlurRadius,
  getStandardFrostParams,
  migratePrefsToLatest,
  normalizePrefs,
  normalizeStoragePrefs,
  resolveAutoInkTone,
  resolvePrefsForMode,
  resolveUseDarkInk
};
export type { EffectInkTone, EffectType, WallpaperEffectPrefs, WallpaperEffectStoragePrefs };
