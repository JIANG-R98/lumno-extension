// Whether the browser draws with the GPU: the worker's probe and the answer
// it stores for New Tab and the overlay, whose notice suggests graphics
// acceleration (shared/graphics-acceleration-notice.ts).
import type { StorageAreaLike, StorageChangeEventLike } from '../domain/storage-port';

// 'software' when neither WebGL nor WebGPU reaches a GPU: graphics
// acceleration is off, or the browser blocks this GPU or driver. Anything the
// probe cannot be sure of is 'unknown', which suggests nothing.
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

// navigator.gpu, where WebGPU is available.
interface ProbeGpu {
  requestAdapter(): Promise<unknown>;
}

const GRAPHICS_PROBE_STORAGE_KEY = '_x_lumno_graphics_probe_2026_unique_';
// requestAdapter() can stay pending; past this the answer is 'unknown'.
const GPU_ADAPTER_TIMEOUT_MS = 3000;

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

function isProbeGpu(value: unknown): value is ProbeGpu {
  return isRecord(value) && typeof value.requestAdapter === 'function';
}

// A WebGL context that refuses a major performance caveat exists only when
// the GPU draws it. Without the GPU, Chrome either falls back to software
// WebGL (refused here) or has no WebGL at all.
function probeWebglRendering(createCanvas: () => ProbeCanvas | null): GraphicsRendering {
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

// WebGPU's adapter: a real one means the GPU works (WebGL alone was turned
// off, by policy or a flag); none, or only the fallback, means it does not.
function probeWebgpuRendering(gpu: unknown, timeoutMs: number): Promise<GraphicsRendering> {
  if (!isProbeGpu(gpu)) {
    return Promise.resolve('unknown');
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<GraphicsRendering>((resolve) => {
    timer = setTimeout(() => resolve('unknown'), timeoutMs);
  });
  const adapter = Promise.resolve()
    .then(() => gpu.requestAdapter())
    .then((found): GraphicsRendering => {
      if (!isRecord(found)) {
        return 'software';
      }
      const info = isRecord(found.info) ? found.info : null;
      return (info && info.isFallbackAdapter === true) || found.isFallbackAdapter === true ? 'software' : 'hardware';
    })
    .catch((): GraphicsRendering => 'unknown');
  return Promise.race([adapter, timeout]).then((rendering) => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    return rendering;
  });
}

// 'software' only when both WebGL and WebGPU find no GPU, so a browser that
// turned off one of them, or has no WebGPU, never hears it lacks a GPU.
function probeGraphicsRendering(
  createCanvas: () => ProbeCanvas | null,
  gpu: unknown,
  timeoutMs?: number
): Promise<GraphicsRendering> {
  const webgl = probeWebglRendering(createCanvas);
  if (webgl !== 'software') {
    return Promise.resolve(webgl);
  }
  return probeWebgpuRendering(gpu, timeoutMs === undefined ? GPU_ADAPTER_TIMEOUT_MS : timeoutMs)
    .then((webgpu) => (webgpu === 'software' ? 'software' : 'unknown'));
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

export type { GraphicsChromeApi, GraphicsProbe, GraphicsRendering, ProbeCanvas, ProbeGpu };
export {
  GRAPHICS_PROBE_STORAGE_KEY,
  getGraphicsSettingsUrl,
  getStoredGraphicsProbe,
  normalizeGraphicsProbe,
  normalizeGraphicsRendering,
  probeGraphicsRendering,
  setStoredGraphicsProbe
};
