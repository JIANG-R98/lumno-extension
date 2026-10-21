'use strict';

// JSDOM does no layout: every element measures 0×0 and nothing is under the
// pointer. A test that drags or hovers by position gives the elements it
// cares about a box with place(), and the page then measures and hit-tests
// them the way a browser would (getBoundingClientRect, elementFromPoint).

function createFakeLayout(window) {
  const boxes = new Map();
  const order = [];
  const toRect = ({ left, top, width, height }) => ({
    left, top, width, height,
    x: left, y: top, right: left + width, bottom: top + height,
    toJSON() { return { left, top, width, height }; }
  });
  const contains = (rect, x, y) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
  const depth = (element) => {
    let count = 0;
    for (let node = element; node; node = node.parentNode || (node.host || null)) count += 1;
    return count;
  };

  const measure = window.Element.prototype.getBoundingClientRect;
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return boxes.has(this) ? toRect(boxes.get(this)) : measure.call(this);
  };
  // Elements under the point, topmost first: deeper elements and, at equal
  // depth, the ones placed last win, as later siblings paint on top.
  const at = (x, y) => order
    .filter((element) => element.isConnected && contains(toRect(boxes.get(element)), x, y))
    .sort((a, b) => (depth(b) - depth(a)) || (order.indexOf(b) - order.indexOf(a)));
  window.document.elementFromPoint = (x, y) => at(x, y)[0] || window.document.body;
  window.document.elementsFromPoint = (x, y) => at(x, y).concat(window.document.body, window.document.documentElement);

  return {
    // Gives `element` the box { left, top, width, height } (viewport pixels).
    place(element, box) {
      if (!boxes.has(element)) order.push(element);
      boxes.set(element, Object.assign({}, box));
      return element;
    },
    // Places `elements` in a row starting at { left, top }, each
    // { width, height } and `gap` apart; returns their boxes.
    row(elements, { left, top, width, height, gap = 0 }) {
      return elements.map((element, index) => {
        const box = { left: left + index * (width + gap), top, width, height };
        this.place(element, box);
        return toRect(box);
      });
    },
    rect: (element) => element.getBoundingClientRect()
  };
}

module.exports = { createFakeLayout };
