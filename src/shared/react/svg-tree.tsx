// Renders an SVG description (shared/ui/svg-tree.ts) as React elements.
import { createElement, type ReactElement } from 'react';
import type { SvgAttributes, SvgNode } from '../ui/svg-tree';

// React names SVG attributes in camelCase; data-* and aria-* keep their own
// names.
function toPropName(name: string): string {
  if (name === 'class') {
    return 'className';
  }
  if (name.startsWith('data-') || name.startsWith('aria-')) {
    return name;
  }
  return name.replace(/[-:]([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function toProps(attributes: SvgAttributes, key?: number): Record<string, unknown> {
  const props: Record<string, unknown> = key === undefined ? {} : { key };
  // xmlns is implied: React creates <svg> and its children in the SVG namespace.
  Object.entries(attributes).forEach(([name, value]) => {
    if (name !== 'xmlns' && value !== undefined) {
      props[toPropName(name)] = value;
    }
  });
  return props;
}

function renderNode(node: SvgNode, key?: number): ReactElement {
  const [tag, attributes, children] = node;
  return createElement(
    tag,
    toProps(attributes, key),
    ...(children || []).map((child, index) => renderNode(child, index))
  );
}

export function SvgTree({ node }: { node: SvgNode }) {
  return renderNode(node);
}
