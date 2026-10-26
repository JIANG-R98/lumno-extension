// The worker's probe of whether the browser draws with the GPU, through
// WebGL and WebGPU, and the browser page that turns graphics acceleration on.
import type { GraphicsRendering } from '../domain/settings/features';

// A canvas the probe can ask for a WebGL context: OffscreenCanvas in the
// worker, a <canvas> in tests.
interface ProbeCanvas {
  getContext(type: 'webgl', options: WebGLContextAttributes): unknown;
}

// navigator.gpu, where WebGPU is available.
interface ProbeGpu {
  requestAdapter(): Promise<unknown>;
}

// requestAdapter() can stay pending; past this the answer is 'unknown'.
const GPU_ADAPTER_TIMEOUT_MS = 3000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
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

// The browser's own settings page with the graphics acceleration switch, by
// its internal page scheme.
function getGraphicsSettingsUrl(internalScheme: string): string {
  if (internalScheme === 'edge://' || internalScheme === 'brave://') {
    return `${internalScheme}settings/system`;
  }
  return 'chrome://settings/system';
}

export type { ProbeCanvas, ProbeGpu };
export { getGraphicsSettingsUrl, probeGraphicsRendering };
