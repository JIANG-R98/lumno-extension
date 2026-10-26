import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SvgTree } from './svg-tree';
import { createSvgElement, type SvgNode } from '../ui/svg-tree';
import { describeEmptyStateArt } from '../ui/empty-state-art';
import { describeFolderIcon } from '../../newtab/bookmarks/bookmark-folder-icon';

let roots: Root[] = [];

function renderTree(node: SvgNode): Element {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<SvgTree node={node} />));
  const element = host.firstElementChild;
  if (!element) throw new Error('nothing rendered');
  return element;
}

// Tag, attributes and children, so two builds can be compared.
function snapshot(element: Element): unknown {
  return [
    element.namespaceURI,
    element.localName,
    Object.fromEntries(Array.from(element.attributes, (attribute) => [attribute.name, attribute.value])),
    Array.from(element.children, snapshot)
  ];
}

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots = [];
  document.body.replaceChildren();
});

describe('SvgTree', () => {
  it('renders exactly what the DOM builder builds', () => {
    const scenes: SvgNode[] = [
      describeFolderIcon('probe', '10'),
      describeEmptyStateArt('noResults', { size: 96, id: 'art' }),
      ['svg', {}, [
        ['filter', { id: 'f', 'color-interpolation-filters': 'sRGB', x: 0 }, [
          ['feFlood', { 'flood-color': 'red', 'flood-opacity': 0.5 }],
          ['feDisplacementMap', { in: 'SourceGraphic', in2: 'map', xChannelSelector: 'R' }]
        ]]
      ]]
    ];
    scenes.forEach((scene) => {
      expect(snapshot(renderTree(scene))).toEqual(snapshot(createSvgElement(document, scene)));
    });
  });

  it('leaves undefined attributes off', () => {
    const element = createSvgElement(document, ['path', { d: 'M0 0', fill: undefined }]);
    expect(element.hasAttribute('fill')).toBe(false);
    expect(renderTree(['svg', { fill: undefined }]).hasAttribute('fill')).toBe(false);
  });
});
