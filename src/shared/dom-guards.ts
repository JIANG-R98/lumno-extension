// Structural checks for DOM values. They hold for nodes and events from any
// window (an iframe, a test's own DOM), where instanceof would not.
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// Any DOM node: an element, text, a document.
function isNode(value: EventTarget | Node | null | undefined): value is Node {
  return value !== null && value !== undefined && 'nodeType' in value && typeof value.nodeType === 'number';
}

function isElementNode(value: EventTarget | Node | null | undefined): value is Element {
  return value !== null && value !== undefined && 'nodeType' in value && value.nodeType === 1;
}

// An HTML element of the given tag.
function isHtmlTag<K extends keyof HTMLElementTagNameMap>(
  value: EventTarget | Node | null | undefined,
  tag: K
): value is HTMLElementTagNameMap[K] {
  return isElementNode(value) && value.namespaceURI === HTML_NAMESPACE && value.localName === tag;
}

// Any HTML element (not SVG or MathML).
function isHtmlElement(value: EventTarget | Node | null | undefined): value is HTMLElement {
  return isElementNode(value) && value.namespaceURI === HTML_NAMESPACE;
}

// Any SVG element.
function isSvgElement(value: EventTarget | Node | null | undefined): value is SVGElement {
  return isElementNode(value) && value.namespaceURI === SVG_NAMESPACE;
}

export { isElementNode, isHtmlElement, isHtmlTag, isNode, isSvgElement };
