// The page helpers the parts of the search box's mode share.

// The page window, with the resize observer the layout follows.
type InputModeWindow = Window & { ResizeObserver?: typeof ResizeObserver };

function getDocument(options: { document?: Document | null }): Document | null {
  return options.document || globalThis.document || null;
}

function getWindow(options: { windowObj?: InputModeWindow | null }): InputModeWindow {
  return options.windowObj || globalThis.window;
}

function setStyle(
  element: ElementCSSInlineStyle | null | undefined,
  property: string,
  value: string
): void {
  if (!element || !element.style) {
    return;
  }
  element.style.setProperty(property, value);
}

function hasInlineStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return 'style' in element;
}

function isElementVisible(element: Element | null | undefined): boolean {
  if (!element) {
    return false;
  }
  const visibleState = element.getAttribute('data-visible');
  if (visibleState === 'true') {
    return true;
  }
  if (visibleState === 'false') {
    return false;
  }
  return hasInlineStyle(element) && element.style.getPropertyValue('display') !== 'none';
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== undefined && value !== null && Number.isFinite(parsed) ? parsed : null;
}

export type { InputModeWindow };
export { getDocument, getWindow, hasOwn, isElementVisible, readNumber, setStyle };
