import { describe, expect, it } from 'vitest';
import { measureSegmentedIndicator } from './segmented-indicator';

function box(element: HTMLElement, left: number, width: number) {
  element.getBoundingClientRect = () => ({ left, width, top: 0, height: 30, right: left + width, bottom: 30, x: left, y: 0, toJSON() {} });
}

function setLayout(element: HTMLElement, values: Record<string, number>) {
  Object.entries(values).forEach(([name, value]) => {
    Object.defineProperty(element, name, { configurable: true, value });
  });
}

describe('measureSegmentedIndicator', () => {
  it('places the indicator over the active button in a scrolled, bordered, scaled strip', () => {
    const container = document.createElement('div');
    const indicator = document.createElement('span');
    const button = document.createElement('button');
    container.append(indicator, button);
    document.body.append(container);
    // Scaled to 0.5 by an opening panel, scrolled 40px, with a 1px border.
    box(container, 100, 150);
    setLayout(container, { offsetWidth: 300, scrollLeft: 40, clientLeft: 1 });
    box(button, 160, 50);
    expect(measureSegmentedIndicator(container, indicator, button)).toEqual({
      ready: true,
      transform: `translateX(${(160 - 100) / 0.5 + 40 - 1}px)`,
      width: '100px'
    });
  });

  it('waits while there is no active button or the strip is hidden', () => {
    const container = document.createElement('div');
    const indicator = document.createElement('span');
    expect(measureSegmentedIndicator(container, indicator, null).ready).toBe(false);
    const button = document.createElement('button');
    box(container, 0, 0);
    box(button, 0, 0);
    expect(measureSegmentedIndicator(container, indicator, button).ready).toBe(false);
  });
});
