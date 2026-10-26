// Keeping the toolbar inside the visible viewport.
import { VIEWPORT_SAFE_MARGIN_PX } from './constants';
import { setHostPosition, setHostRightPosition } from './host';
import { state } from './state';
import type { ViewportBounds } from './types';

function getViewportBounds(): ViewportBounds {
  const visualViewport = window.visualViewport;
  const width = visualViewport && Number.isFinite(visualViewport.width)
    ? visualViewport.width
    : (window.innerWidth || document.documentElement.clientWidth || 0);
  const height = visualViewport && Number.isFinite(visualViewport.height)
    ? visualViewport.height
    : (window.innerHeight || document.documentElement.clientHeight || 0);
  const left = visualViewport && Number.isFinite(visualViewport.offsetLeft)
    ? visualViewport.offsetLeft
    : 0;
  const top = visualViewport && Number.isFinite(visualViewport.offsetTop)
    ? visualViewport.offsetTop
    : 0;
  return {
    bottom: top + Math.max(0, height),
    left,
    right: left + Math.max(0, width),
    top
  };
}

function getLayoutViewportWidth(): number {
  return window.innerWidth || document.documentElement.clientWidth || 0;
}

function clampToSafeAxis(value: number, minimum: number, maximum: number): number {
  const safeMaximum = Math.max(minimum, maximum);
  return Math.min(safeMaximum, Math.max(minimum, value));
}

function applySurfaceViewportLimit(surface: HTMLElement, viewport: ViewportBounds): void {
  const availableWidth = Math.max(
    0,
    viewport.right - viewport.left - VIEWPORT_SAFE_MARGIN_PX * 2
  );
  surface.style.maxWidth = `${Math.floor(availableWidth)}px`;
}

function clampVisibleSurfaceToViewport(): void {
  state.viewportRepositionFrame = null;
  if (!state.selectionSurface || state.selectionSurface.host.hidden) {
    return;
  }
  const { host, surface } = state.selectionSurface;
  const viewport = getViewportBounds();
  applySurfaceViewportLimit(surface, viewport);
  const bounds = surface.getBoundingClientRect();
  const safeLeft = viewport.left + VIEWPORT_SAFE_MARGIN_PX;
  const safeTop = viewport.top + VIEWPORT_SAFE_MARGIN_PX;
  const maximumLeft = viewport.right - bounds.width - VIEWPORT_SAFE_MARGIN_PX;
  const maximumTop = viewport.bottom - bounds.height - VIEWPORT_SAFE_MARGIN_PX;
  const currentTop = Number.parseFloat(host.style.top);
  const clampedTop = clampToSafeAxis(
    Number.isFinite(currentTop) ? currentTop : bounds.top,
    safeTop,
    maximumTop
  );
  if (state.hostHorizontalAnchor === 'right') {
    const layoutViewportWidth = getLayoutViewportWidth();
    const currentRightOffset = Number.parseFloat(host.style.right);
    const currentRightEdge = Number.isFinite(currentRightOffset)
      ? layoutViewportWidth - currentRightOffset
      : bounds.right;
    const rightEdge = clampToSafeAxis(
      currentRightEdge,
      safeLeft + bounds.width,
      viewport.right - VIEWPORT_SAFE_MARGIN_PX
    );
    setHostRightPosition(host, layoutViewportWidth - rightEdge, clampedTop);
    return;
  }
  const currentLeft = Number.parseFloat(host.style.left);
  setHostPosition(
    host,
    clampToSafeAxis(Number.isFinite(currentLeft) ? currentLeft : bounds.left, safeLeft, maximumLeft),
    clampedTop
  );
}

function scheduleViewportClamp(): void {
  if (!state.selectionSurface || state.selectionSurface.host.hidden) {
    return;
  }
  if (state.viewportRepositionFrame != null) {
    window.cancelAnimationFrame(state.viewportRepositionFrame);
  }
  state.viewportRepositionFrame = window.requestAnimationFrame(clampVisibleSurfaceToViewport);
}

export {
  applySurfaceViewportLimit,
  clampToSafeAxis,
  clampVisibleSurfaceToViewport,
  getLayoutViewportWidth,
  getViewportBounds,
  scheduleViewportClamp
};
