// The shared look and open/close motion of floating menus, and the option
// to size a menu to its content between a minimum and a maximum width.
const SURFACE_CLASS = '_x_extension_menu_surface_2024_unique_';
const CONTENT_WIDTH_ATTRIBUTE = 'data-menu-surface-width';
const MIN_WIDTH_VAR = '--x-extension-menu-surface-min-width';
const MAX_WIDTH_VAR = '--x-extension-menu-surface-max-width';

// A number of pixels or any CSS length.
type CssLength = number | string | null | undefined;

// A menu element, or a test double with the members used here.
interface MenuSurfaceElement {
  classList: Pick<DOMTokenList, 'add'>;
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

type FrameRequest = (callback: () => void) => unknown;

interface MenuSurfaceOptions {
  // 'content' (or contentWidth: true) sizes the menu to its content.
  width?: string;
  menuWidth?: string;
  contentWidth?: boolean;
  minWidth?: CssLength;
  menuMinWidth?: CssLength;
  maxWidth?: CssLength;
  menuMaxWidth?: CssLength;
  requestAnimationFrame?: FrameRequest;
}

function normalizeCssLength(value: CssLength): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? `${value}px` : '';
  }
  return String(value).trim();
}

function getRequestAnimationFrame(options: MenuSurfaceOptions | null | undefined): FrameRequest {
  if (options && typeof options.requestAnimationFrame === 'function') {
    return options.requestAnimationFrame;
  }
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame.bind(globalThis);
  }
  return (callback) => globalThis.setTimeout(callback, 0);
}

function apply<T extends MenuSurfaceElement>(element: T | null | undefined, options?: MenuSurfaceOptions | null): T | null {
  if (!element) {
    return null;
  }
  const config: MenuSurfaceOptions = options || {};
  element.classList.add(SURFACE_CLASS);
  if (config.width === 'content' || config.menuWidth === 'content' || config.contentWidth) {
    applyContentWidth(element, config);
  }
  return element;
}

function applyContentWidth<T extends MenuSurfaceElement>(element: T | null | undefined, options?: MenuSurfaceOptions | null): T | null {
  if (!element) {
    return null;
  }
  const config: MenuSurfaceOptions = options || {};
  const minWidth = normalizeCssLength(
    config.minWidth === undefined ? config.menuMinWidth : config.minWidth
  ) || '0';
  const maxWidth = normalizeCssLength(
    config.maxWidth === undefined ? config.menuMaxWidth : config.maxWidth
  ) || 'calc(100vw - 32px)';
  element.classList.add(SURFACE_CLASS);
  element.setAttribute(CONTENT_WIDTH_ATTRIBUTE, 'content');
  element.style.setProperty(MIN_WIDTH_VAR, minWidth);
  element.style.setProperty(MAX_WIDTH_VAR, maxWidth);
  return element;
}

function clearContentWidth<T extends MenuSurfaceElement>(element: T | null | undefined): T | null {
  if (!element) {
    return null;
  }
  element.removeAttribute(CONTENT_WIDTH_ATTRIBUTE);
  element.style.removeProperty(MIN_WIDTH_VAR);
  element.style.removeProperty(MAX_WIDTH_VAR);
  return element;
}

// Draws the menu closed for a frame, then open, so the open motion plays.
function open<T extends MenuSurfaceElement>(element: T | null | undefined, options?: MenuSurfaceOptions | null): T | null {
  if (!element) {
    return null;
  }
  element.classList.add(SURFACE_CLASS);
  element.setAttribute('data-open', 'false');
  getRequestAnimationFrame(options)(() => {
    element.setAttribute('data-open', 'true');
  });
  return element;
}

function close<T extends MenuSurfaceElement>(element: T | null | undefined): T | null {
  if (!element) {
    return null;
  }
  element.setAttribute('data-open', 'false');
  return element;
}

export type { CssLength, MenuSurfaceElement, MenuSurfaceOptions };
export {
  SURFACE_CLASS as className,
  CONTENT_WIDTH_ATTRIBUTE as contentWidthAttribute,
  apply,
  applyContentWidth,
  clearContentWidth,
  open,
  close
};
