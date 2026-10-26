import { describe, expect, it } from 'vitest';
import { createSvgElement, serializeSvgDocument, type SvgNode } from './svg-tree';

const DRAWING: SvgNode = ['svg', { viewBox: '0 0 10 10', xmlns: 'http://www.w3.org/2000/svg' }, [
  ['path', { d: 'M0 0H10', fill: 'currentColor', 'fill-opacity': 0.5 }]
]];

describe('svg-tree', () => {
  it('builds SVG elements in the SVG namespace', () => {
    const svg = createSvgElement(document, DRAWING);
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.hasAttribute('xmlns')).toBe(false);
    const path = svg.firstElementChild;
    expect(path?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(path?.getAttribute('fill-opacity')).toBe('0.5');
  });

  it('serializes a standalone document an image URL can load', () => {
    const text = serializeSvgDocument(DRAWING);
    expect(text.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">')).toBe(true);
    const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
    expect(parsed.documentElement.querySelector('path')?.getAttribute('d')).toBe('M0 0H10');
    expect(serializeSvgDocument(['svg', {}, [['title', { 'data-note': 'a "b" <c> & d' }]]]))
      .toBe('<svg xmlns="http://www.w3.org/2000/svg"><title data-note="a &quot;b&quot; &lt;c&gt; &amp; d"/></svg>');
  });
});
