'use strict';

// JSDOM does no layout: every element measures 0×0 and nothing is under the
// pointer. A test that drags or hovers by position gives the elements it
// cares about a box, and the page then measures and hit-tests them the way a
// browser would (getBoundingClientRect, elementFromPoint).
//
//   place(element, box)            a fixed box
//   flow(container, selector, row) boxes laid out in a row in the order the
//                                  matching elements have right now, so a
//                                  reorder moves them as it would on screen
//
// Boxes are { left, top, width, height } in viewport pixels.

function createFakeLayout(window) {
  const boxes = new Map();
  const flows = [];
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
  const flowed = (flow) => Array.from(flow.container.querySelectorAll(flow.selector))
    .filter((element) => element.parentNode === flow.container || flow.container.contains(element));
  const flowBox = (element) => {
    for (const flow of flows) {
      if (!flow.container.isConnected) continue;
      const index = flowed(flow).indexOf(element);
      if (index >= 0) {
        const { left, top, width, height, gap = 0 } = flow.row;
        return { left: left + index * (width + gap), top, width, height };
      }
    }
    return null;
  };
  const boxOf = (element) => flowBox(element) || boxes.get(element) || null;

  const measure = window.Element.prototype.getBoundingClientRect;
  window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    const box = boxOf(this);
    return box ? toRect(box) : measure.call(this);
  };
  // The offset* measures, from the same boxes: the offset parent is the
  // nearest ancestor with a box.
  const offsetParentOf = (element) => {
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (boxOf(node)) return node;
    }
    return null;
  };
  const offsetGetters = {
    offsetWidth: (element, box) => box.width,
    offsetHeight: (element, box) => box.height,
    offsetLeft: (element, box) => {
      const parent = offsetParentOf(element);
      return box.left - (parent ? boxOf(parent).left : 0);
    },
    offsetTop: (element, box) => {
      const parent = offsetParentOf(element);
      return box.top - (parent ? boxOf(parent).top : 0);
    },
    offsetParent: (element) => offsetParentOf(element)
  };
  Object.entries(offsetGetters).forEach(([name, read]) => {
    const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, name);
    Object.defineProperty(window.HTMLElement.prototype, name, {
      configurable: true,
      get() {
        const box = boxOf(this);
        return box ? read(this, box) : original.get.call(this);
      }
    });
  });
  // Elements under the point, topmost first: deeper elements and, at equal
  // depth, the ones laid out last win, as later siblings paint on top.
  const at = (x, y) => {
    const candidates = Array.from(new Set(Array.from(boxes.keys()).concat(...flows.map(flowed))));
    return candidates
      .map((element, order) => ({ element, order, box: boxOf(element) }))
      .filter(({ element, box }) => element.isConnected && box && contains(toRect(box), x, y))
      .sort((a, b) => (depth(b.element) - depth(a.element)) || (b.order - a.order))
      .map(({ element }) => element);
  };
  window.document.elementFromPoint = (x, y) => at(x, y)[0] || window.document.body;
  window.document.elementsFromPoint = (x, y) => at(x, y).concat(window.document.body, window.document.documentElement);

  return {
    place(element, box) {
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
    flow(container, selector, row) {
      flows.push({ container, selector, row: Object.assign({}, row) });
      return flowed(flows[flows.length - 1]).map((element) => element.getBoundingClientRect());
    },
    rect: (element) => element.getBoundingClientRect()
  };
}

module.exports = { createFakeLayout };
