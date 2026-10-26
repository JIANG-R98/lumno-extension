// Inline SVG drawn from data: an element's tag, its attributes and its
// children. One description builds both a DOM element (for code that draws
// outside React) and React elements (svg-tree.tsx), so no SVG travels as
// markup and nothing is parsed as HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

type SvgAttributeValue = string | number | undefined;

type SvgAttributes = Readonly<Record<string, SvgAttributeValue>>;

type SvgNode = readonly [tag: string, attributes: SvgAttributes, children?: readonly SvgNode[]];

// Builds the element with createElementNS. The xmlns attribute is implied by
// the namespace, and an undefined attribute is left off.
function createSvgElement(documentObj: Document, node: SvgNode): SVGElement {
  const [tag, attributes, children] = node;
  const element = documentObj.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => {
    if (name !== 'xmlns' && value !== undefined) {
      element.setAttribute(name, String(value));
    }
  });
  (children || []).forEach((child) => {
    element.appendChild(createSvgElement(documentObj, child));
  });
  return element;
}

function escapeAttribute(value: SvgAttributeValue): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeNode([tag, attributes, children]: SvgNode): string {
  const attributeText = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  const childText = (children || []).map(serializeNode).join('');
  return childText ? `<${tag}${attributeText}>${childText}</${tag}>` : `<${tag}${attributeText}/>`;
}

// The drawing as a standalone SVG document, for an image URL such as a
// favicon's data: URL. Never for putting markup into a page.
function serializeSvgDocument([tag, attributes, children]: SvgNode): string {
  return serializeNode([tag, { xmlns: SVG_NS, ...attributes }, children]);
}

export { SVG_NS, createSvgElement, serializeSvgDocument };
export type { SvgAttributeValue, SvgAttributes, SvgNode };
