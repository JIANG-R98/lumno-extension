// What the tooltip and the cursor tooltip share: the window's timers, and
// sizing a tooltip inside the viewport or its boundary element and clamping
// it there.

// The page window, or a stand-in with the members used here.
type TooltipWindow = Partial<Pick<Window, 'innerWidth' | 'innerHeight' | 'requestAnimationFrame' | 'setTimeout' | 'clearTimeout'>>;

interface TooltipRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface TooltipPosition {
  top: number;
  left: number;
}

interface TooltipFrameOptions {
  // 'absolute' places the tooltip inside boundaryElement; anything else is fixed.
  positionMode?: string;
  margin?: number;
  boundaryElement?: Element | null;
  maxWidth?: number | string;
}

// The area a tooltip stays inside, in the tooltip's own coordinates.
interface TooltipFrame {
  margin: number;
  boundaryRect: TooltipRect;
  width: number;
  height: number;
}

const globalTimers: Pick<Window, 'setTimeout' | 'clearTimeout'> = globalThis;

function getRequestAnimationFrame(windowObj: TooltipWindow): (callback: () => void) => void {
  if (typeof windowObj.requestAnimationFrame === 'function') {
    const requestFrame = windowObj.requestAnimationFrame;
    return (callback) => {
      Reflect.apply(requestFrame, windowObj, [callback]);
    };
  }
  return (callback) => {
    globalTimers.setTimeout(callback, 0);
  };
}

function getSetTimeout(windowObj: TooltipWindow): (callback: () => void, delay: number) => number {
  const setTimer = typeof windowObj.setTimeout === 'function' ? windowObj.setTimeout : null;
  if (setTimer) {
    return (callback, delay) => Reflect.apply(setTimer, windowObj, [callback, delay]);
  }
  return (callback, delay) => globalTimers.setTimeout(callback, delay);
}

function getClearTimeout(windowObj: TooltipWindow): (timerId: number) => void {
  const clearTimer = typeof windowObj.clearTimeout === 'function' ? windowObj.clearTimeout : null;
  if (clearTimer) {
    return (timerId) => {
      Reflect.apply(clearTimer, windowObj, [timerId]);
    };
  }
  return (timerId) => globalTimers.clearTimeout(timerId);
}

function normalizeCssLength(value: number | string | null | undefined): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? `${value}px` : '';
  }
  return String(value).trim();
}

function getNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getElementRect(element: Element | null | undefined, fallback?: TooltipRect): TooltipRect {
  if (element) {
    return element.getBoundingClientRect();
  }
  return fallback || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
}

function resolveMaxWidth(configuredMaxWidth: number | string | undefined, availableWidth: number, defaultMaxWidth: number): string {
  const maxWidth = configuredMaxWidth === undefined ? defaultMaxWidth : configuredMaxWidth;
  return typeof maxWidth === 'number'
    ? `${Math.min(maxWidth, availableWidth)}px`
    : (normalizeCssLength(maxWidth) || `${availableWidth}px`);
}

// The narrowest a tooltip's width cap may get, and its cap when the
// options name none.
interface TooltipWidthLimits {
  minWidth: number;
  defaultMaxWidth: number;
}

const TOOLTIP_WIDTH_LIMITS: TooltipWidthLimits = { minWidth: 180, defaultMaxWidth: 420 };

// Sizes the tooltip to fit the viewport, or the boundary element when it is
// placed inside one, and returns that area.
function prepareTooltipFrame(
  element: HTMLElement,
  config: TooltipFrameOptions,
  windowObj: TooltipWindow,
  limits: TooltipWidthLimits = TOOLTIP_WIDTH_LIMITS
): TooltipFrame {
  const positionMode = config.positionMode === 'absolute' ? 'absolute' : 'fixed';
  const margin = getNumber(config.margin, 8);
  const viewportWidth = getNumber(windowObj.innerWidth, 1024);
  const viewportHeight = getNumber(windowObj.innerHeight, 768);
  const viewportRect: TooltipRect = {
    top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight
  };
  const boundaryRect = positionMode === 'absolute'
    ? getElementRect(config.boundaryElement || null, viewportRect)
    : viewportRect;
  const width = boundaryRect.width || viewportWidth;
  const availableWidth = Math.max(limits.minWidth, Math.floor(width - (margin * 2)));
  element.style.setProperty('max-width', resolveMaxWidth(config.maxWidth, availableWidth, limits.defaultMaxWidth));
  element.style.setProperty('width', 'max-content');
  element.setAttribute('data-tooltip-position', positionMode);
  return { margin, boundaryRect, width, height: boundaryRect.height || viewportHeight };
}

// Clamps the tooltip inside its frame and places it there.
function placeTooltipAt(
  element: HTMLElement,
  frame: TooltipFrame,
  tooltipRect: TooltipRect,
  wanted: TooltipPosition
): Readonly<TooltipPosition> {
  const { margin } = frame;
  const maxTop = Math.max(margin, frame.height - tooltipRect.height - margin);
  const maxLeft = Math.max(margin, frame.width - tooltipRect.width - margin);
  const top = Math.round(Math.max(margin, Math.min(wanted.top, maxTop)));
  const left = Math.round(Math.max(margin, Math.min(wanted.left, maxLeft)));
  element.style.setProperty('top', `${top}px`);
  element.style.setProperty('left', `${left}px`);
  return Object.freeze({ top, left });
}

export type { TooltipFrame, TooltipFrameOptions, TooltipPosition, TooltipRect, TooltipWindow };
export {
  getClearTimeout,
  getElementRect,
  getNumber,
  getRequestAnimationFrame,
  getSetTimeout,
  normalizeCssLength,
  placeTooltipAt,
  prepareTooltipFrame
};
