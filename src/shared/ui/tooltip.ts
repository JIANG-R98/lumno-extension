// The shared tooltip: one element per controller, placed beside its target
// and drawn by the React tooltip view (globalThis.LumnoTooltipView).
const TOOLTIP_CLASS = '_x_extension_tooltip_2026_unique_';
const HOST_CLASS = '_x_extension_tooltip_host_2026_unique_';
const LEGACY_HOST_CLASS = '_x_extension_tooltip_host_2024_unique_';
const LINE_CLASS = '_x_extension_tooltip_line_2026_unique_';
const DIVIDER_CLASS = '_x_extension_tooltip_divider_2026_unique_';
const DEFAULT_VISIBLE_ATTRIBUTE = 'data-visible';
const DEFAULT_BOUND_ATTRIBUTE = 'data-tooltip-bound';
const DEFAULT_TEXT_ATTRIBUTE = 'data-tooltip';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'left-above';

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

interface TooltipElementOptions {
  documentObj?: Document | null;
  className?: string;
  id?: string;
  tooltipKind?: string;
  // 'absolute' places the tooltip inside boundaryElement; anything else is fixed.
  positionMode?: string;
  decorateElement?(element: HTMLElement): void;
}

interface TooltipPositionOptions {
  windowObj?: TooltipWindow | null;
  positionMode?: string;
  placement?: TooltipPlacement | string;
  margin?: number;
  // The gap to the target; a function reads it per target.
  spacing?: number | ((target: HTMLElement) => number);
  boundaryElement?: Element | null;
  maxWidth?: number | string;
}

interface TooltipActiveOptions {
  // false shows the tooltip even when the target is neither focused nor hovered.
  checkActive?: boolean;
}

type TooltipShowOptions = TooltipPositionOptions & TooltipActiveOptions;

interface TooltipBindOptions extends TooltipShowOptions {
  boundAttribute?: string;
  // Keep the native title tooltip as well.
  suppressNativeTitle?: boolean;
  // The attribute that holds the text, data-tooltip by default.
  attributeName?: string;
  showOnFocus?: boolean;
  selector?: string;
}

interface TooltipControllerOptions extends TooltipElementOptions, TooltipShowOptions {
  appendTo?: Node | null;
  hideDelay?: number;
}

type TooltipTextSource = (target: HTMLElement) => string | null | undefined;

interface TooltipController {
  readonly element: HTMLElement | null;
  destroy(): void;
  show(target: HTMLElement | null | undefined, text: string | null | undefined, options?: TooltipShowOptions | null): HTMLElement | null;
  hide(): HTMLElement | null;
  bind(target: HTMLElement | null | undefined, getText?: TooltipTextSource | null, options?: TooltipBindOptions | null): HTMLElement | null;
  bindAll(rootNode?: ParentNode | null, options?: TooltipBindOptions | null): HTMLElement[];
}

// The global timers with the DOM's numeric ids.
const globalTimers: Pick<Window, 'setTimeout' | 'clearTimeout'> = globalThis;

function getDocument(options: TooltipElementOptions | null | undefined): Document | null {
  return (options && options.documentObj) || globalThis.document || null;
}

function getWindow(options: TooltipPositionOptions | null | undefined): TooltipWindow {
  return (options && options.windowObj) || globalThis;
}

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

function getDynamicNumber(
  value: number | ((target: HTMLElement) => number) | undefined,
  target: HTMLElement,
  fallback: number
): number {
  const resolved = typeof value === 'function' ? value(target) : value;
  return getNumber(resolved, fallback);
}

function getElementRect(element: Element | null | undefined, fallback?: TooltipRect): TooltipRect {
  if (element) {
    return element.getBoundingClientRect();
  }
  return fallback || { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
}

function createElement(doc: Document | null | undefined, options?: TooltipElementOptions | null): HTMLElement | null {
  const documentObj = doc || getDocument(options);
  const tooltipView = globalThis.LumnoTooltipView;
  if (!documentObj || !tooltipView) {
    return null;
  }
  const config: TooltipElementOptions = options || {};
  const element = tooltipView.createTooltipElement({
    className: config.className || '',
    documentObj,
    id: config.id ? String(config.id) : '',
    kind: config.tooltipKind || '',
    positionMode: config.positionMode
  });
  if (element && typeof config.decorateElement === 'function') {
    config.decorateElement(element);
  }
  return element;
}

function renderText(element: HTMLElement | null | undefined, text: string | null | undefined): HTMLElement | null {
  if (!element) {
    return null;
  }
  const tooltipView = globalThis.LumnoTooltipView;
  if (!tooltipView) {
    return null;
  }
  tooltipView.renderTooltipText(element, String(text || ''));
  return element;
}

function isTargetActive(target: HTMLElement | null, doc: Document | null, options: TooltipActiveOptions): boolean {
  if (options.checkActive === false) {
    return true;
  }
  if (!target) {
    return false;
  }
  if (target.isConnected === false) {
    return false;
  }
  if (doc && doc.activeElement === target) {
    return true;
  }
  try {
    return target.matches(':hover');
  } catch (_error) {
    return true;
  }
}

function readPlacement(value: string | undefined): TooltipPlacement {
  return value === 'left' || value === 'left-above' || value === 'bottom' ? value : 'top';
}

// Places the tooltip above its target (or below, to the left, or above and to
// the left), flipped to the other side when it would leave the viewport or
// the boundary element, and clamped inside it.
function position(
  element: HTMLElement | null | undefined,
  target: HTMLElement | null | undefined,
  options?: TooltipPositionOptions | null
): Readonly<TooltipPosition> | null {
  if (!element || !target) {
    return null;
  }
  const config: TooltipPositionOptions = options || {};
  const windowObj = getWindow(config);
  const positionMode = config.positionMode === 'absolute' ? 'absolute' : 'fixed';
  const placement = readPlacement(config.placement);
  const margin = getNumber(config.margin, 8);
  const spacing = getDynamicNumber(config.spacing, target, 10);
  const viewportWidth = getNumber(windowObj.innerWidth, 1024);
  const viewportHeight = getNumber(windowObj.innerHeight, 768);
  const boundaryElement = config.boundaryElement || null;
  const viewportRect: TooltipRect = {
    top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight
  };
  const boundaryRect = positionMode === 'absolute' ? getElementRect(boundaryElement, viewportRect) : viewportRect;
  const availableWidth = Math.max(180, Math.floor((boundaryRect.width || viewportWidth) - (margin * 2)));
  const configuredMaxWidth = config.maxWidth === undefined ? 420 : config.maxWidth;
  const resolvedMaxWidth = typeof configuredMaxWidth === 'number'
    ? `${Math.min(configuredMaxWidth, availableWidth)}px`
    : (normalizeCssLength(configuredMaxWidth) || `${availableWidth}px`);
  element.style.setProperty('max-width', resolvedMaxWidth);
  element.style.setProperty('width', 'max-content');
  element.setAttribute('data-tooltip-position', positionMode);

  const targetRect = getElementRect(target);
  const tooltipRect = getElementRect(element);
  let top = 0;
  let left = 0;
  const targetTop = targetRect.top - boundaryRect.top;
  const targetBottom = targetRect.bottom - boundaryRect.top;
  const targetLeft = targetRect.left - boundaryRect.left;
  const targetRight = targetRect.right - boundaryRect.left;

  if (placement === 'left' || placement === 'left-above') {
    top = targetTop + ((targetRect.height - tooltipRect.height) / 2);
    left = targetLeft - tooltipRect.width - spacing;
    if (placement === 'left-above') {
      top = targetTop - tooltipRect.height - spacing;
    }
    if (left < margin) {
      left = targetRight + spacing;
    }
  } else if (placement === 'bottom') {
    top = targetBottom + spacing;
    left = targetLeft + ((targetRect.width - tooltipRect.width) / 2);
    if (top + tooltipRect.height + margin > (boundaryRect.height || viewportHeight)) {
      top = targetTop - tooltipRect.height - spacing;
    }
  } else {
    top = targetTop - tooltipRect.height - spacing;
    left = targetLeft + ((targetRect.width - tooltipRect.width) / 2);
    if (top < margin) {
      top = targetBottom + spacing;
    }
  }

  const maxTop = Math.max(margin, (boundaryRect.height || viewportHeight) - tooltipRect.height - margin);
  const maxLeft = Math.max(margin, (boundaryRect.width || viewportWidth) - tooltipRect.width - margin);
  top = Math.max(margin, Math.min(top, maxTop));
  left = Math.max(margin, Math.min(left, maxLeft));
  element.style.setProperty('top', `${Math.round(top)}px`);
  element.style.setProperty('left', `${Math.round(left)}px`);
  return Object.freeze({ top: Math.round(top), left: Math.round(left) });
}

function createController(options?: TooltipControllerOptions | null): TooltipController {
  const config: TooltipControllerOptions = options || {};
  const documentObj = getDocument(config);
  const windowObj = getWindow(config);
  const requestFrame = getRequestAnimationFrame(windowObj);
  const setTimer = getSetTimeout(windowObj);
  const clearTimer = getClearTimeout(windowObj);
  let element: HTMLElement | null = null;
  let hideTimer: number | null = null;
  let currentTarget: HTMLElement | null = null;
  let token = 0;

  function ensureElement(): HTMLElement | null {
    if (element) {
      return element;
    }
    element = createElement(documentObj, config);
    const appendTo = config.appendTo || (documentObj && documentObj.body);
    if (appendTo && element) {
      appendTo.appendChild(element);
    }
    return element;
  }

  function show(
    target: HTMLElement | null | undefined,
    text: string | null | undefined,
    showOptions?: TooltipShowOptions | null
  ): HTMLElement | null {
    const content = String(text || '');
    if (!target || !content) {
      return null;
    }
    const tooltip = ensureElement();
    if (!tooltip) {
      return null;
    }
    if (hideTimer) {
      clearTimer(hideTimer);
      hideTimer = null;
    }
    token += 1;
    const showToken = token;
    currentTarget = target;
    renderText(tooltip, content);
    tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
    tooltip.setAttribute('aria-hidden', 'true');
    const mergedOptions: TooltipShowOptions = { ...config, ...showOptions };
    position(tooltip, target, mergedOptions);
    requestFrame(() => {
      if (showToken !== token || currentTarget !== target || !isTargetActive(target, documentObj, mergedOptions)) {
        return;
      }
      tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'true');
      tooltip.setAttribute('aria-hidden', 'false');
    });
    return tooltip;
  }

  function hide(): HTMLElement | null {
    const tooltip = element;
    if (!tooltip) {
      return null;
    }
    token += 1;
    const hideToken = token;
    currentTarget = null;
    tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
    tooltip.setAttribute('aria-hidden', 'true');
    if (hideTimer) {
      clearTimer(hideTimer);
    }
    hideTimer = setTimer(() => {
      if (hideToken !== token || !element) {
        return;
      }
      element.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      hideTimer = null;
    }, getNumber(config.hideDelay, 120));
    return tooltip;
  }

  function bind(
    target: HTMLElement | null | undefined,
    getText?: TooltipTextSource | null,
    bindOptions?: TooltipBindOptions | null
  ): HTMLElement | null {
    if (!target) {
      return null;
    }
    const settings: TooltipBindOptions = bindOptions || {};
    const boundAttribute = settings.boundAttribute || DEFAULT_BOUND_ATTRIBUTE;
    if (target.getAttribute(boundAttribute) === 'true') {
      return target;
    }
    target.classList.add(HOST_CLASS);
    target.classList.add(LEGACY_HOST_CLASS);
    target.setAttribute(boundAttribute, 'true');
    if (settings.suppressNativeTitle !== false) {
      const nativeTitle = target.getAttribute('title');
      if (nativeTitle) {
        target.setAttribute('data-tooltip-native-title', nativeTitle);
        target.removeAttribute('title');
      }
    }
    const resolveText: TooltipTextSource = typeof getText === 'function'
      ? getText
      : () => target.getAttribute(settings.attributeName || DEFAULT_TEXT_ATTRIBUTE);
    const showBoundTooltip = (): void => {
      show(target, resolveText(target), settings);
    };
    target.addEventListener('mouseenter', showBoundTooltip);
    target.addEventListener('mouseleave', hide);
    if (settings.showOnFocus !== false) {
      target.addEventListener('focus', showBoundTooltip);
      target.addEventListener('blur', hide);
    }
    return target;
  }

  function bindAll(rootNode?: ParentNode | null, bindOptions?: TooltipBindOptions | null): HTMLElement[] {
    const scope = rootNode || documentObj;
    if (!scope) {
      return [];
    }
    const settings: TooltipBindOptions = bindOptions || {};
    const selector = settings.selector || `[${settings.attributeName || DEFAULT_TEXT_ATTRIBUTE}]`;
    const bound: HTMLElement[] = [];
    scope.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      const result = bind(node, null, settings);
      if (result) {
        bound.push(result);
      }
    });
    return bound;
  }

  return {
    get element() {
      return ensureElement();
    },
    destroy() {
      token += 1;
      currentTarget = null;
      if (hideTimer) {
        clearTimer(hideTimer);
        hideTimer = null;
      }
      const tooltipView = globalThis.LumnoTooltipView;
      if (element && tooltipView) {
        tooltipView.destroyTooltipElement(element);
      }
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
      element = null;
    },
    show,
    hide,
    bind,
    bindAll
  };
}

export type {
  TooltipActiveOptions,
  TooltipBindOptions,
  TooltipController,
  TooltipControllerOptions,
  TooltipElementOptions,
  TooltipPlacement,
  TooltipPosition,
  TooltipPositionOptions,
  TooltipRect,
  TooltipShowOptions,
  TooltipTextSource,
  TooltipWindow
};
export {
  TOOLTIP_CLASS as className,
  HOST_CLASS as hostClassName,
  LINE_CLASS as lineClassName,
  DIVIDER_CLASS as dividerClassName,
  createElement,
  createController,
  renderText,
  position
};
