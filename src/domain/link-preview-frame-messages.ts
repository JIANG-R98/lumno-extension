// What the link preview's frame and the surface around it say to each other
// through postMessage. The frame runs link-preview-trigger.ts inside the
// previewed page; the surface is link-preview.ts in the page underneath.
// Either side reads the other's messages as untrusted page data.

const PREVIEW_FRAME_SOURCE = 'lumno-link-preview-frame';
const PREVIEW_SURFACE_SOURCE = 'lumno-link-preview-surface';

// From the frame: a real page loaded (Chrome's error page for a refused
// frame runs no content script), its background color, loading and loaded,
// and Escape pressed inside it.
type PreviewFrameMessage =
  | { type: 'alive'; url: string; canGoBack: boolean }
  | { type: 'background'; color: string }
  | { type: 'loading' }
  | { type: 'loaded' }
  | { type: 'escape' };

// From the surface: go back in the frame's own history, or reload it.
type PreviewSurfaceCommand = 'back' | 'reload';

const CSS_RGB_PATTERN = /^rgba?\([\d.,\s%/]+\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function readPreviewFrameMessage(data: unknown): PreviewFrameMessage | null {
  if (!isRecord(data) || data.source !== PREVIEW_FRAME_SOURCE) {
    return null;
  }
  if (data.type === 'alive' && typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) {
    return { type: 'alive', url: data.url, canGoBack: data.canGoBack === true };
  }
  if (data.type === 'background' && typeof data.color === 'string' && CSS_RGB_PATTERN.test(data.color)) {
    return { type: 'background', color: data.color };
  }
  if (data.type === 'loading' || data.type === 'loaded' || data.type === 'escape') {
    return { type: data.type };
  }
  return null;
}

function readPreviewSurfaceCommand(data: unknown): PreviewSurfaceCommand | null {
  if (!isRecord(data) || data.source !== PREVIEW_SURFACE_SOURCE) {
    return null;
  }
  return data.type === 'back' || data.type === 'reload' ? data.type : null;
}

export {
  PREVIEW_FRAME_SOURCE,
  PREVIEW_SURFACE_SOURCE,
  readPreviewFrameMessage,
  readPreviewSurfaceCommand
};
export type { PreviewFrameMessage, PreviewSurfaceCommand };
