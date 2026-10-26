// The cursor tooltip: the shared tooltip drawn beside the pointer (for text
// cut short, such as long titles and addresses), with an optional tag above
// it that names what a held modifier key would do.
import * as LumnoTooltip from './tooltip';
import type { TooltipElementOptions, TooltipRect, TooltipWindow } from './tooltip';
import { queryHtmlElements } from '../dom-lookup';

const HOST_CLASS = '_x_extension_cursor_tooltip_host_2026_unique_';
const TAG_CLASS = '_x_extension_cursor_tooltip_tag_2026_unique_';
const TAG_KEY_CLASS = '_x_extension_cursor_tooltip_tag_key_2026_unique_';
const TAG_LABEL_CLASS = '_x_extension_cursor_tooltip_tag_label_2026_unique_';
const WINDOWS_LOGO_CLASS = '_x_extension_cursor_tooltip_windows_logo_2026_unique_';
const DEFAULT_VISIBLE_ATTRIBUTE = 'data-visible';
const DEFAULT_BOUND_ATTRIBUTE = 'data-cursor-tooltip-bound';
const DEFAULT_TEXT_ATTRIBUTE = 'data-cursor-tooltip';

interface CursorPoint {
  clientX: number;
  clientY: number;
}

// A pointer, focus or key event, or a bare point: whatever the caller has.
interface CursorPointInput {
  type?: string;
  key?: string;
  clientX?: number;
  clientY?: number;
  x?: number;
  y?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
  relatedTarget?: EventTarget | null;
}

// A node the pointer may move to, or a test stand-in with these members.
interface HandoffNode {
  parentElement?: HandoffNode | null;
  parentNode?: HandoffNode | null;
  getAttribute?(name: string): string | null;
}

// The page window, or a stand-in with the members used here.
type CursorTooltipWindow = TooltipWindow & {
  navigator?: { platform?: string; userAgent?: string };
  addEventListener?: EventTarget['addEventListener'];
  removeEventListener?: EventTarget['removeEventListener'];
};

// The controller's options; show, move and bind take the same ones, merged
// over these.
interface CursorTooltipOptions extends TooltipElementOptions {
  windowObj?: CursorTooltipWindow | null;
  appendTo?: Node | null;
  hideDelay?: number;
  positionMode?: string;
  margin?: number;
  offsetX?: number;
  offsetY?: number;
  boundaryElement?: Element | null;
  maxWidth?: number | string;
  // false shows the tooltip even when the target is neither focused nor hovered.
  checkActive?: boolean;
  // Return false to keep the tooltip hidden for this target and input.
  shouldShow?(target: HTMLElement, inputEvent: CursorPointInput | null): boolean;
  // The input the current show or move came from.
  inputEvent?: CursorPointInput | null;
  // The action tag above the tooltip, e.g. "Open in new tab"; none when empty.
  getTagText?(input: CursorPointInput, target: HTMLElement): string | null | undefined;
  tagText?: string;
  // The key drawn in the tag: ⌘ on Apple platforms, the Windows logo elsewhere.
  getTagKeyText?(options: CursorTooltipOptions): string | null | undefined;
  tagKeyText?: string | null;
  tagGap?: number;
  tagMaxWidth?: number | string;
  // Moving to another bound target keeps the tooltip on screen.
  preserveVisibleOnTargetSwitch?: boolean;
  // Leaving for another bound target inside handoffRoot hides the tooltip
  // after a delay instead of at once.
  deferHideVisibility?: boolean;
  handoffRoot?: HandoffNode | null;
  handoffElement?: HandoffNode | null;
  boundAttribute?: string;
  // Keep the native title tooltip as well.
  suppressNativeTitle?: boolean;
  // The attribute that holds the text, data-cursor-tooltip by default.
  attributeName?: string;
  selector?: string;
}

interface CursorTooltipHideOptions {
  preserveActiveBinding?: boolean;
  deferVisibility?: boolean;
}

// The text for the target, which may depend on the input, such as where the
// pointer is on it.
type CursorTooltipTextSource = (
  target: HTMLElement,
  inputEvent?: CursorPointInput | null
) => string | null | undefined;

interface CursorTooltipPosition {
  top: number;
  left: number;
}

interface CursorTooltipController {
  readonly element: HTMLElement | null;
  readonly tagElement: HTMLElement | null;
  destroy(): void;
  show(
    target: HTMLElement | null | undefined,
    text: string | null | undefined,
    pointInput?: CursorPointInput | null,
    options?: CursorTooltipOptions | null
  ): HTMLElement | null;
  move(pointInput?: CursorPointInput | null, options?: CursorTooltipOptions | null): HTMLElement | null;
  hide(options?: CursorTooltipHideOptions | null): HTMLElement | null;
  // Shows the tooltip again for the target last bound, e.g. after a modifier key changed.
  refresh(event?: CursorPointInput | null): HTMLElement | null;
  bind(
    target: HTMLElement | null | undefined,
    getText?: CursorTooltipTextSource | null,
    options?: CursorTooltipOptions | null
  ): HTMLElement | null;
  bindAll(rootNode?: ParentNode | null, options?: CursorTooltipOptions | null): HTMLElement[];
}

type ListenerTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

interface ActiveBinding {
  target: HTMLElement;
  resolveText: CursorTooltipTextSource;
  settings: CursorTooltipOptions;
  lastPoint: CursorPoint;
}

// The global timers with the DOM's numeric ids.
const globalTimers: Pick<Window, 'setTimeout' | 'clearTimeout'> = globalThis;

function getDocument(options: CursorTooltipOptions | null | undefined): Document | null {
  return (options && options.documentObj) || globalThis.document || null;
}

function getWindow(options: CursorTooltipOptions | null | undefined): CursorTooltipWindow {
  return (options && options.windowObj) || globalThis;
}

function isMacPlatform(options: CursorTooltipOptions): boolean {
  const navigatorObj = getWindow(options).navigator || globalThis.navigator || {};
  const source = `${navigatorObj.platform || ''} ${navigatorObj.userAgent || ''}`.toLowerCase();
  return /mac|iphone|ipad|ipod/.test(source);
}

function getCursorTooltipTagKeyText(options: CursorTooltipOptions): string {
  if (typeof options.getTagKeyText === 'function') {
    return String(options.getTagKeyText(options) || '').trim();
  }
  if (options.tagKeyText !== undefined && options.tagKeyText !== null) {
    return String(options.tagKeyText || '').trim();
  }
  return isMacPlatform(options) ? '⌘' : 'win';
}

function getRequestAnimationFrame(windowObj: CursorTooltipWindow): (callback: () => void) => void {
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

function getSetTimeout(windowObj: CursorTooltipWindow): (callback: () => void, delay: number) => number {
  const setTimer = typeof windowObj.setTimeout === 'function' ? windowObj.setTimeout : null;
  if (setTimer) {
    return (callback, delay) => Reflect.apply(setTimer, windowObj, [callback, delay]);
  }
  return (callback, delay) => globalTimers.setTimeout(callback, delay);
}

function getClearTimeout(windowObj: CursorTooltipWindow): (timerId: number) => void {
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

function getExplicitPointFromInput(input: CursorPointInput | null | undefined): CursorPoint | null {
  const source: CursorPointInput = input || {};
  const x = Number(source.clientX !== undefined ? source.clientX : source.x);
  const y = Number(source.clientY !== undefined ? source.clientY : source.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { clientX: x, clientY: y };
  }
  return null;
}

// The input's point, or the middle of the target's bottom edge without one.
function getPointFromInput(input: CursorPointInput | null | undefined, target: Element | null | undefined): CursorPoint {
  const point = getExplicitPointFromInput(input);
  if (point) {
    return point;
  }
  const rect = getElementRect(target);
  return {
    clientX: rect.left + ((rect.width || 0) / 2),
    clientY: rect.bottom || (rect.top + (rect.height || 0))
  };
}

function isPointInsideElement(point: CursorPoint | null, element: Element | null): boolean {
  if (!point || !element) {
    return false;
  }
  const rect = getElementRect(element);
  return point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom;
}

function isSamePoint(point: CursorPoint | null, referencePoint: CursorPoint | null): boolean {
  if (!point || !referencePoint) {
    return false;
  }
  return Math.abs(point.clientX - referencePoint.clientX) <= 1 &&
    Math.abs(point.clientY - referencePoint.clientY) <= 1;
}

function isTargetActive(target: HTMLElement | null, doc: Document | null, options: CursorTooltipOptions): boolean {
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

function shouldShowTarget(target: HTMLElement, options: CursorTooltipOptions): boolean {
  if (typeof options.shouldShow !== 'function') {
    return true;
  }
  try {
    return options.shouldShow(target, options.inputEvent || null) !== false;
  } catch (_error) {
    return false;
  }
}

// The element's sizes, or a stand-in with them.
type TruncationTarget = Partial<Pick<Element, 'clientWidth' | 'scrollWidth' | 'clientHeight' | 'scrollHeight'>>;

// Whether the element's text overflows it: horizontally by default, and
// vertically (clamped lines) when asked.
function isElementTextTruncated(
  element: TruncationTarget | null | undefined,
  options?: { horizontal?: boolean; vertical?: boolean } | null
): boolean {
  if (!element) {
    return false;
  }
  const config = options || {};
  const checkHorizontal = config.horizontal !== false;
  const checkVertical = config.vertical === true;
  const clientWidth = Number(element.clientWidth);
  const scrollWidth = Number(element.scrollWidth);
  const clientHeight = Number(element.clientHeight);
  const scrollHeight = Number(element.scrollHeight);
  const hasHorizontalOverflow = checkHorizontal &&
    Number.isFinite(clientWidth) &&
    Number.isFinite(scrollWidth) &&
    clientWidth > 0 &&
    scrollWidth > clientWidth;
  const hasVerticalOverflow = checkVertical &&
    Number.isFinite(clientHeight) &&
    Number.isFinite(scrollHeight) &&
    clientHeight > 0 &&
    scrollHeight > clientHeight;
  return hasHorizontalOverflow || hasVerticalOverflow;
}

function createElement(doc: Document | null, options: CursorTooltipOptions, tooltipKind?: string): HTMLElement | null {
  return LumnoTooltip.createElement(doc, { ...options, tooltipKind: tooltipKind || 'cursor' });
}

function isWindowsLogoKeyText(text: string): boolean {
  return String(text || '').trim().toLowerCase() === 'win';
}

function getCursorTooltipTagText(target: HTMLElement, pointInput: CursorPointInput | null | undefined, options: CursorTooltipOptions): string {
  if (typeof options.getTagText === 'function') {
    return String(options.getTagText(pointInput || {}, target) || '').trim();
  }
  return String(options.tagText || '').trim();
}

// Places the tooltip below and to the right of the point, flipped to the
// other side when it would leave the viewport or the boundary element.
function positionAtPoint(
  element: HTMLElement | null | undefined,
  point: CursorPointInput | null | undefined,
  options?: CursorTooltipOptions | null
): Readonly<CursorTooltipPosition> | null {
  if (!element || !point) {
    return null;
  }
  const config: CursorTooltipOptions = options || {};
  const windowObj = getWindow(config);
  const positionMode = config.positionMode === 'absolute' ? 'absolute' : 'fixed';
  const margin = getNumber(config.margin, 8);
  const offsetX = getNumber(config.offsetX, 14);
  const offsetY = getNumber(config.offsetY, 16);
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

  const tooltipRect = getElementRect(element);
  const pointerLeft = getNumber(point.clientX !== undefined ? point.clientX : point.x, 0) - boundaryRect.left;
  const pointerTop = getNumber(point.clientY !== undefined ? point.clientY : point.y, 0) - boundaryRect.top;
  let left = pointerLeft + offsetX;
  let top = pointerTop + offsetY;
  if (left + tooltipRect.width + margin > (boundaryRect.width || viewportWidth)) {
    left = pointerLeft - tooltipRect.width - offsetX;
  }
  if (top + tooltipRect.height + margin > (boundaryRect.height || viewportHeight)) {
    top = pointerTop - tooltipRect.height - offsetY;
  }

  const maxTop = Math.max(margin, (boundaryRect.height || viewportHeight) - tooltipRect.height - margin);
  const maxLeft = Math.max(margin, (boundaryRect.width || viewportWidth) - tooltipRect.width - margin);
  top = Math.max(margin, Math.min(top, maxTop));
  left = Math.max(margin, Math.min(left, maxLeft));
  element.style.setProperty('top', `${Math.round(top)}px`);
  element.style.setProperty('left', `${Math.round(left)}px`);
  return Object.freeze({ top: Math.round(top), left: Math.round(left) });
}

function isHandoffNode(value: unknown): value is HandoffNode {
  return typeof value === 'object' && value !== null && ('parentNode' in value || 'getAttribute' in value);
}

function getNodeParent(node: HandoffNode | null | undefined): HandoffNode | null {
  return (node && (node.parentElement || node.parentNode)) || null;
}

function isNodeContainedBy(container: HandoffNode, node: HandoffNode): boolean {
  let current: HandoffNode | null = node;
  while (current) {
    if (current === container) {
      return true;
    }
    current = getNodeParent(current);
  }
  return false;
}

// The nearest bound target at or above the node, below the root.
function getBoundHandoffTarget(node: HandoffNode, boundAttribute: string, rootNode: HandoffNode): HandoffNode | null {
  let current: HandoffNode | null = node;
  while (current && current !== rootNode) {
    if (typeof current.getAttribute === 'function' && current.getAttribute(boundAttribute) === 'true') {
      return current;
    }
    current = getNodeParent(current);
  }
  return null;
}

function isModifierRefreshEvent(event: CursorPointInput | null | undefined): boolean {
  if (!event) {
    return false;
  }
  const key = String(event.key || '');
  return Boolean(
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    key === 'Meta' ||
    key === 'Control' ||
    key === 'Alt' ||
    key === 'Shift'
  );
}

function createController(options?: CursorTooltipOptions | null): CursorTooltipController {
  const config: CursorTooltipOptions = options || {};
  const documentObj = getDocument(config);
  const windowObj = getWindow(config);
  const requestFrame = getRequestAnimationFrame(windowObj);
  const setTimer = getSetTimeout(windowObj);
  const clearTimer = getClearTimeout(windowObj);
  let element: HTMLElement | null = null;
  let tagElement: HTMLElement | null = null;
  let hideTimer: number | null = null;
  let currentTarget: HTMLElement | null = null;
  let currentText = '';
  let lastPoint: CursorPoint | null = null;
  let activeBinding: ActiveBinding | null = null;
  let modifierListenersAttached = false;
  let detachModifierListeners: (() => void) | null = null;
  let token = 0;

  function appendToPage(node: HTMLElement): void {
    const appendTo = config.appendTo || (documentObj && documentObj.body);
    if (appendTo) {
      appendTo.appendChild(node);
    }
  }

  function ensureElement(): HTMLElement | null {
    if (element) {
      return element;
    }
    element = createElement(documentObj, config);
    if (element) {
      appendToPage(element);
    }
    return element;
  }

  function ensureTagElement(): HTMLElement | null {
    if (tagElement) {
      return tagElement;
    }
    const tagOptions: CursorTooltipOptions = {
      ...config,
      id: config.id ? `${config.id}_tag` : '',
      className: [config.className, TAG_CLASS].filter(Boolean).join(' ')
    };
    tagElement = createElement(documentObj, tagOptions, 'cursor-tag');
    if (tagElement) {
      tagElement.setAttribute('data-cursor-tooltip-tag', 'true');
      appendToPage(tagElement);
    }
    return tagElement;
  }

  function hideCursorTooltipTag(): HTMLElement | null {
    if (element) {
      element.setAttribute('data-cursor-tooltip-tag-visible', 'false');
    }
    if (!tagElement) {
      return null;
    }
    tagElement.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
    tagElement.setAttribute('aria-hidden', 'true');
    return tagElement;
  }

  function renderCursorTooltipTag(tagText: string, renderOptions: CursorTooltipOptions): HTMLElement | null {
    const text = String(tagText || '').trim();
    if (element) {
      element.setAttribute('data-cursor-tooltip-tag-visible', text ? 'true' : 'false');
    }
    if (!text) {
      hideCursorTooltipTag();
      return null;
    }
    const tag = ensureTagElement();
    if (!tag) {
      return null;
    }
    const keyText = getCursorTooltipTagKeyText({ ...config, ...renderOptions });
    const tooltipView = globalThis.LumnoTooltipView;
    if (!tooltipView) {
      return null;
    }
    tooltipView.renderCursorTag(tag, {
      keyText,
      label: text,
      windowsLogo: isWindowsLogoKeyText(keyText)
    });
    tag.setAttribute('aria-label', `${keyText} ${text}`.trim());
    tag.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
    tag.setAttribute('aria-hidden', 'true');
    return tag;
  }

  function setCursorTooltipTagVisible(visible: boolean): void {
    if (!tagElement) {
      return;
    }
    tagElement.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, visible ? 'true' : 'false');
    tagElement.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  // Sets the tag just above the tooltip's left edge.
  function positionCursorTooltipTag(
    tag: HTMLElement | null,
    tooltipPosition: Readonly<CursorTooltipPosition> | null,
    positionOptions: CursorTooltipOptions
  ): Readonly<CursorTooltipPosition> | null {
    if (!tag || !tooltipPosition) {
      return null;
    }
    const positionMode = positionOptions.positionMode === 'absolute' ? 'absolute' : 'fixed';
    const margin = getNumber(positionOptions.margin, 8);
    const gap = getNumber(positionOptions.tagGap, 6);
    const viewportWidth = getNumber(windowObj.innerWidth, 1024);
    const viewportHeight = getNumber(windowObj.innerHeight, 768);
    const boundaryElement = positionOptions.boundaryElement || null;
    const viewportRect: TooltipRect = {
      top: 0, left: 0, right: viewportWidth, bottom: viewportHeight, width: viewportWidth, height: viewportHeight
    };
    const boundaryRect = positionMode === 'absolute' ? getElementRect(boundaryElement, viewportRect) : viewportRect;
    const availableWidth = Math.max(120, Math.floor((boundaryRect.width || viewportWidth) - (margin * 2)));
    const configuredMaxWidth = positionOptions.tagMaxWidth === undefined ? 220 : positionOptions.tagMaxWidth;
    const resolvedMaxWidth = typeof configuredMaxWidth === 'number'
      ? `${Math.min(configuredMaxWidth, availableWidth)}px`
      : (normalizeCssLength(configuredMaxWidth) || `${availableWidth}px`);
    tag.style.setProperty('max-width', resolvedMaxWidth);
    tag.style.setProperty('width', 'max-content');
    tag.setAttribute('data-tooltip-position', positionMode);

    const tagRect = getElementRect(tag);
    const maxLeft = Math.max(margin, (boundaryRect.width || viewportWidth) - tagRect.width - margin);
    const maxTop = Math.max(margin, (boundaryRect.height || viewportHeight) - tagRect.height - margin);
    const left = Math.max(margin, Math.min(tooltipPosition.left, maxLeft));
    const top = Math.max(margin, Math.min(tooltipPosition.top - tagRect.height - gap, maxTop));
    tag.style.setProperty('left', `${Math.round(left)}px`);
    tag.style.setProperty('top', `${Math.round(top)}px`);
    return Object.freeze({ top: Math.round(top), left: Math.round(left) });
  }

  function setActiveBinding(
    target: HTMLElement,
    resolveText: CursorTooltipTextSource,
    settings: CursorTooltipOptions,
    pointInput: CursorPointInput | null
  ): void {
    activeBinding = {
      target,
      resolveText,
      settings,
      lastPoint: getPointFromInput(pointInput, target)
    };
  }

  function clearActiveBinding(target: HTMLElement): void {
    if (activeBinding && activeBinding.target === target) {
      activeBinding = null;
    }
  }

  // Whether leaving the target for another bound target in the handoff root
  // should keep the tooltip up for the hide delay.
  function shouldDeferBoundTooltipHide(
    event: CursorPointInput | null | undefined,
    target: HTMLElement,
    settings: CursorTooltipOptions,
    boundAttribute: string
  ): boolean {
    if (settings.deferHideVisibility !== true || !event) {
      return false;
    }
    const relatedTarget = event.relatedTarget;
    if (!isHandoffNode(relatedTarget) || relatedTarget === target) {
      return false;
    }
    const handoffRoot = settings.handoffRoot || settings.handoffElement || getNodeParent(target);
    if (!handoffRoot || !isNodeContainedBy(handoffRoot, relatedTarget)) {
      return false;
    }
    const relatedBoundTarget = getBoundHandoffTarget(relatedTarget, boundAttribute, handoffRoot);
    return Boolean(relatedBoundTarget && relatedBoundTarget !== target);
  }

  // A pointerenter that fires again where the pointer already was (the page
  // re-rendered under it) must not move the tooltip to another target.
  function shouldIgnoreStaleEnter(
    event: CursorPointInput | null | undefined,
    target: HTMLElement,
    settings: CursorTooltipOptions
  ): boolean {
    if (settings.preserveVisibleOnTargetSwitch !== true || !currentTarget || currentTarget === target) {
      return false;
    }
    const point = getExplicitPointFromInput(event);
    const staleEnter = isSamePoint(point, lastPoint) || isPointInsideElement(point, currentTarget);
    if (staleEnter && hideTimer) {
      clearTimer(hideTimer);
      hideTimer = null;
      token += 1;
    }
    return staleEnter;
  }

  function getModifierRefreshInput(event: CursorPointInput | null | undefined, binding: ActiveBinding): CursorPointInput {
    const source: CursorPointInput = event || {};
    const point = binding.lastPoint || lastPoint || getPointFromInput(null, binding.target);
    return {
      type: source.type || 'modifierchange',
      key: source.key || '',
      clientX: point.clientX,
      clientY: point.clientY,
      metaKey: Boolean(source.metaKey),
      ctrlKey: Boolean(source.ctrlKey),
      altKey: Boolean(source.altKey),
      shiftKey: Boolean(source.shiftKey)
    };
  }

  function hideWithOptions(hideOptions?: CursorTooltipHideOptions | null): HTMLElement | null {
    const preserveActiveBinding = Boolean(hideOptions && hideOptions.preserveActiveBinding);
    const deferVisibility = Boolean(hideOptions && hideOptions.deferVisibility);
    if (!preserveActiveBinding) {
      activeBinding = null;
    }
    const tooltip = element;
    if (!tooltip) {
      hideCursorTooltipTag();
      return null;
    }
    token += 1;
    const hideToken = token;
    hideCursorTooltipTag();
    if (hideTimer) {
      clearTimer(hideTimer);
    }
    if (deferVisibility) {
      hideTimer = setTimer(() => {
        if (hideToken !== token || !element) {
          return;
        }
        currentTarget = null;
        element.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
        element.setAttribute('aria-hidden', 'true');
        hideTimer = null;
      }, getNumber(config.hideDelay, 120));
      return tooltip;
    }
    currentTarget = null;
    tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
    tooltip.setAttribute('aria-hidden', 'true');
    hideTimer = setTimer(() => {
      if (hideToken !== token || !element) {
        return;
      }
      element.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'false');
      hideTimer = null;
    }, getNumber(config.hideDelay, 120));
    return tooltip;
  }

  function refreshActiveBinding(event?: CursorPointInput | null): HTMLElement | null {
    const binding = activeBinding;
    if (!binding) {
      return null;
    }
    const input = getModifierRefreshInput(event, binding);
    const eventOptions: CursorTooltipOptions = { ...binding.settings, inputEvent: input };
    if (!shouldShowTarget(binding.target, eventOptions)) {
      return hideWithOptions({ preserveActiveBinding: true });
    }
    return show(binding.target, binding.resolveText(binding.target, input), input, eventOptions);
  }

  function handleModifierRefreshEvent(event: CursorPointInput): void {
    if (!isModifierRefreshEvent(event)) {
      return;
    }
    refreshActiveBinding(event);
  }

  function handleModifierBlur(): void {
    refreshActiveBinding({
      type: 'blur',
      key: '',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false
    });
  }

  function getModifierListenerTarget(): ListenerTarget | null {
    const { addEventListener: addListener, removeEventListener: removeListener } = windowObj;
    if (typeof addListener !== 'function') {
      return documentObj;
    }
    return {
      addEventListener: (...args) => Reflect.apply(addListener, windowObj, args),
      removeEventListener: (...args) => {
        if (typeof removeListener === 'function') {
          Reflect.apply(removeListener, windowObj, args);
        }
      }
    };
  }

  // Held modifier keys change the action tag, so key presses refresh it.
  function attachModifierListeners(): void {
    if (modifierListenersAttached) {
      return;
    }
    const listenerTarget = getModifierListenerTarget();
    if (!listenerTarget) {
      return;
    }
    modifierListenersAttached = true;
    listenerTarget.addEventListener('keydown', handleModifierRefreshEvent, true);
    listenerTarget.addEventListener('keyup', handleModifierRefreshEvent, true);
    listenerTarget.addEventListener('blur', handleModifierBlur, true);
    detachModifierListeners = () => {
      listenerTarget.removeEventListener('keydown', handleModifierRefreshEvent, true);
      listenerTarget.removeEventListener('keyup', handleModifierRefreshEvent, true);
      listenerTarget.removeEventListener('blur', handleModifierBlur, true);
      modifierListenersAttached = false;
      detachModifierListeners = null;
    };
  }

  function show(
    target: HTMLElement | null | undefined,
    text: string | null | undefined,
    pointInput?: CursorPointInput | null,
    showOptions?: CursorTooltipOptions | null
  ): HTMLElement | null {
    const content = String(text || '');
    const mergedOptions: CursorTooltipOptions = { ...config, ...showOptions, inputEvent: pointInput || null };
    if (!target || !content || !shouldShowTarget(target, mergedOptions)) {
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
    currentText = content;
    const point = getPointFromInput(pointInput, target);
    lastPoint = point;
    LumnoTooltip.renderText(tooltip, content);
    const tag = renderCursorTooltipTag(getCursorTooltipTagText(target, pointInput, mergedOptions), mergedOptions);
    const preserveVisible = Boolean(
      mergedOptions.preserveVisibleOnTargetSwitch &&
      tooltip.getAttribute(DEFAULT_VISIBLE_ATTRIBUTE) === 'true'
    );
    tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, preserveVisible ? 'true' : 'false');
    tooltip.setAttribute('aria-hidden', preserveVisible ? 'false' : 'true');
    const tooltipPosition = positionAtPoint(tooltip, point, mergedOptions);
    positionCursorTooltipTag(tag, tooltipPosition, mergedOptions);
    requestFrame(() => {
      if (showToken !== token || currentTarget !== target || !isTargetActive(target, documentObj, mergedOptions)) {
        return;
      }
      tooltip.setAttribute(DEFAULT_VISIBLE_ATTRIBUTE, 'true');
      tooltip.setAttribute('aria-hidden', 'false');
      if (tag) {
        setCursorTooltipTagVisible(true);
      }
    });
    return tooltip;
  }

  function move(pointInput?: CursorPointInput | null, moveOptions?: CursorTooltipOptions | null): HTMLElement | null {
    if (!element || !currentTarget) {
      return null;
    }
    const point = getPointFromInput(pointInput, currentTarget);
    lastPoint = point;
    const mergedOptions: CursorTooltipOptions = { ...config, ...moveOptions, inputEvent: pointInput || null };
    if (!shouldShowTarget(currentTarget, mergedOptions)) {
      hide();
      return element;
    }
    const tag = renderCursorTooltipTag(getCursorTooltipTagText(currentTarget, pointInput, mergedOptions), mergedOptions);
    const tooltipPosition = positionAtPoint(element, point, mergedOptions);
    positionCursorTooltipTag(tag, tooltipPosition, mergedOptions);
    if (tag) {
      setCursorTooltipTagVisible(true);
    }
    return element;
  }

  function hide(hideOptions?: CursorTooltipHideOptions | null): HTMLElement | null {
    return hideWithOptions(hideOptions);
  }

  function bind(
    target: HTMLElement | null | undefined,
    getText?: CursorTooltipTextSource | null,
    bindOptions?: CursorTooltipOptions | null
  ): HTMLElement | null {
    if (!target) {
      return null;
    }
    attachModifierListeners();
    const settings: CursorTooltipOptions = bindOptions || {};
    const boundAttribute = settings.boundAttribute || DEFAULT_BOUND_ATTRIBUTE;
    if (target.getAttribute(boundAttribute) === 'true') {
      return target;
    }
    target.classList.add(HOST_CLASS);
    target.setAttribute(boundAttribute, 'true');
    if (settings.suppressNativeTitle !== false) {
      const nativeTitle = target.getAttribute('title');
      if (nativeTitle) {
        target.setAttribute('data-cursor-tooltip-native-title', nativeTitle);
        target.removeAttribute('title');
      }
    }
    const resolveText: CursorTooltipTextSource = typeof getText === 'function'
      ? getText
      : () => target.getAttribute(settings.attributeName || DEFAULT_TEXT_ATTRIBUTE);
    const getEventOptions = (event: CursorPointInput | null): CursorTooltipOptions => ({
      ...settings,
      inputEvent: event || null
    });
    const showBoundTooltip = (event: CursorPointInput): void => {
      if (shouldIgnoreStaleEnter(event, target, settings)) {
        return;
      }
      setActiveBinding(target, resolveText, settings, event);
      const eventOptions = getEventOptions(event);
      if (!shouldShowTarget(target, eventOptions)) {
        hideWithOptions({ preserveActiveBinding: true });
        return;
      }
      show(target, resolveText(target, event), event, eventOptions);
    };
    const moveBoundTooltip = (event: CursorPointInput): void => {
      const eventOptions = getEventOptions(event);
      if (currentTarget && currentTarget !== target) {
        return;
      }
      setActiveBinding(target, resolveText, settings, event);
      if (!shouldShowTarget(target, eventOptions)) {
        hideWithOptions({ preserveActiveBinding: true });
        return;
      }
      if (!currentTarget) {
        show(target, resolveText(target, event), event, eventOptions);
        return;
      }
      // A target whose text depends on where the pointer is on it, such as a
      // result row over its address line, swaps the text in place.
      const text = String(resolveText(target, event) || '');
      if (!text) {
        hideWithOptions({ preserveActiveBinding: true });
        return;
      }
      if (text !== currentText && element) {
        currentText = text;
        LumnoTooltip.renderText(element, text);
      }
      move(event, eventOptions);
    };
    const showFocusTooltip = (): void => {
      setActiveBinding(target, resolveText, settings, null);
      const eventOptions = getEventOptions(null);
      if (!shouldShowTarget(target, eventOptions)) {
        hideWithOptions({ preserveActiveBinding: true });
        return;
      }
      show(target, resolveText(target), getPointFromInput(null, target), eventOptions);
    };
    const hideBoundTooltip = (event: CursorPointInput): void => {
      if (currentTarget && currentTarget !== target) {
        clearActiveBinding(target);
        return;
      }
      clearActiveBinding(target);
      hide({
        deferVisibility: shouldDeferBoundTooltipHide(event, target, settings, boundAttribute)
      });
    };
    target.addEventListener('pointerenter', showBoundTooltip, true);
    target.addEventListener('pointermove', moveBoundTooltip);
    target.addEventListener('pointerleave', hideBoundTooltip);
    target.addEventListener('pointercancel', hideBoundTooltip);
    target.addEventListener('focus', showFocusTooltip);
    target.addEventListener('blur', hideBoundTooltip);
    return target;
  }

  function bindAll(rootNode?: ParentNode | null, bindOptions?: CursorTooltipOptions | null): HTMLElement[] {
    const scope = rootNode || documentObj;
    if (!scope) {
      return [];
    }
    const settings: CursorTooltipOptions = bindOptions || {};
    const selector = settings.selector || `[${settings.attributeName || DEFAULT_TEXT_ATTRIBUTE}]`;
    const bound: HTMLElement[] = [];
    queryHtmlElements(scope, selector).forEach((node) => {
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
    get tagElement() {
      return ensureTagElement();
    },
    destroy() {
      token += 1;
      currentTarget = null;
      activeBinding = null;
      if (detachModifierListeners) {
        detachModifierListeners();
      }
      if (hideTimer) {
        clearTimer(hideTimer);
        hideTimer = null;
      }
      const tooltipView = globalThis.LumnoTooltipView;
      [element, tagElement].forEach((node) => {
        if (node && tooltipView) {
          tooltipView.destroyTooltipElement(node);
        }
        if (node && node.parentNode) {
          node.parentNode.removeChild(node);
        }
      });
      element = null;
      tagElement = null;
    },
    show,
    move,
    hide,
    refresh: refreshActiveBinding,
    bind,
    bindAll
  };
}

export type {
  CursorPoint,
  CursorPointInput,
  CursorTooltipController,
  CursorTooltipHideOptions,
  CursorTooltipOptions,
  CursorTooltipPosition,
  CursorTooltipTextSource,
  CursorTooltipWindow,
  HandoffNode,
  TruncationTarget
};
export {
  HOST_CLASS as hostClassName,
  TAG_CLASS as tagClassName,
  TAG_KEY_CLASS as tagKeyClassName,
  TAG_LABEL_CLASS as tagLabelClassName,
  WINDOWS_LOGO_CLASS as windowsLogoClassName,
  createController,
  isElementTextTruncated,
  positionAtPoint
};
