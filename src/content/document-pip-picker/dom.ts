// Narrowing helpers for untyped values and DOM nodes.

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// By node type rather than instanceof Element, which fails for nodes of the
// floating window: it is a realm of its own.
function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null && 'nodeType' in target && target.nodeType === 1;
}

// An HTML element of the given tag, matched by name for the same reason.
function isHtmlTag<K extends keyof HTMLElementTagNameMap>(element: Element, tag: K): element is HTMLElementTagNameMap[K] {
  return element.namespaceURI === HTML_NAMESPACE && element.localName === tag;
}

// HTML and SVG elements have an inline style.
function hasInlineStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return 'style' in element && isRecord(element.style);
}

function readErrorText(error: unknown, field: 'name' | 'message'): string {
  if (!isRecord(error)) {
    return '';
  }
  const value = error[field];
  return value ? String(value) : '';
}

export {
  HTML_NAMESPACE,
  hasInlineStyle,
  isElementTarget,
  isHtmlTag,
  isRecord,
  readErrorText
};
