// Whether the browser draws with the GPU: the worker's probe and the answer
// it stores for New Tab and the overlay, whose notice suggests graphics
// acceleration (shared/graphics-acceleration-notice.ts).
import type { StorageAreaLike, StorageChangeEventLike } from '../domain/storage-port';

// 'software' when WebGL only runs without the GPU (or not at all): graphics
// acceleration is off, or the browser blocks this GPU or driver.
type GraphicsRendering = 'hardware' | 'software' | 'unknown';

interface GraphicsProbe {
  rendering: GraphicsRendering;
  checkedAt: number;
}

// The storage the probe and the notice use, from chrome or a test double.
interface GraphicsChromeApi {
  runtime?: { lastError?: unknown } | null;
  storage?: { local?: StorageAreaLike; onChanged?: StorageChangeEventLike } | null;
}

// A canvas the probe can ask for a WebGL context: OffscreenCanvas in the
// worker, a <canvas> in tests.
interface ProbeCanvas {
  getContext(type: 'webgl', options: WebGLContextAttributes): unknown;
}

const GRAPHICS_PROBE_STORAGE_KEY = '_x_lumno_graphics_probe_2026_unique_';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeGraphicsRendering(value: unknown): GraphicsRendering {
  return value === 'hardware' || value === 'software' ? value : 'unknown';
}

function normalizeGraphicsProbe(value: unknown): GraphicsProbe {
  const source = isRecord(value) ? value : {};
  return {
    rendering: normalizeGraphicsRendering(source.rendering),
    checkedAt: Math.max(0, Number(source.checkedAt) || 0)
  };
}

function isWebglContext(value: unknown): value is Pick<WebGLRenderingContext, 'getExtension'> {
  return isRecord(value) && typeof value.getExtension === 'function';
}

// A WebGL context that refuses a major performance caveat exists only when
// the GPU draws it. Without the GPU, Chrome either falls back to software
// WebGL (refused here) or has no WebGL at all.
function probeGraphicsRendering(createCanvas: () => ProbeCanvas | null): GraphicsRendering {
  try {
    const canvas = createCanvas();
    if (!canvas) {
      return 'unknown';
    }
    const context = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!context) {
      return 'software';
    }
    if (isWebglContext(context)) {
      const loseContext = context.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
    }
    return 'hardware';
  } catch (_error) {
    return 'unknown';
  }
}

function getLocalArea(chromeApi: GraphicsChromeApi | null | undefined): StorageAreaLike | null {
  return chromeApi && chromeApi.storage ? chromeApi.storage.local || null : null;
}

function readLocalValue(chromeApi: GraphicsChromeApi | null | undefined, key: string): Promise<unknown> {
  const area = getLocalArea(chromeApi);
  if (!area) {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    try {
      area.get([key], (result) => {
        const runtimeError = chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
        resolve(runtimeError || !result ? undefined : result[key]);
      });
    } catch (_error) {
      resolve(undefined);
    }
  });
}

function writeLocalValue(chromeApi: GraphicsChromeApi | null | undefined, key: string, value: unknown): void {
  const area = getLocalArea(chromeApi);
  if (!area) {
    return;
  }
  try {
    area.set({ [key]: value }, () => {});
  } catch (_error) {
    // The probe runs again at the next browser start.
  }
}

function getStoredGraphicsProbe(chromeApi: GraphicsChromeApi | null | undefined): Promise<GraphicsProbe> {
  return readLocalValue(chromeApi, GRAPHICS_PROBE_STORAGE_KEY).then(normalizeGraphicsProbe);
}

function setStoredGraphicsProbe(chromeApi: GraphicsChromeApi | null | undefined, rendering: GraphicsRendering, now?: number): void {
  writeLocalValue(chromeApi, GRAPHICS_PROBE_STORAGE_KEY, {
    rendering,
    checkedAt: Math.max(1, Number(now) || Date.now())
  });
}

// The browser's own settings page with the graphics acceleration switch.
function getGraphicsSettingsUrl(internalScheme: string): string {
  if (internalScheme === 'edge://' || internalScheme === 'brave://') {
    return `${internalScheme}settings/system`;
  }
  return 'chrome://settings/system';
}

export type { GraphicsChromeApi, GraphicsProbe, GraphicsRendering, ProbeCanvas };
export {
  GRAPHICS_PROBE_STORAGE_KEY,
  getGraphicsSettingsUrl,
  getStoredGraphicsProbe,
  normalizeGraphicsProbe,
  normalizeGraphicsRendering,
  probeGraphicsRendering,
  setStoredGraphicsProbe
};
