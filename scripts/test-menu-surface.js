const assert = require('assert');
const { readStylesheet } = require('./helpers/css-tokens');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const menuSurfaceJsPath = path.join(repoRoot, 'src/shared/menu-surface.js');
const menuSurfaceCssPath = path.join(repoRoot, 'src/shared/menu-surface.css');

assert.ok(fs.existsSync(menuSurfaceJsPath), 'shared menu surface behavior should live in src/shared/menu-surface.js');
assert.ok(fs.existsSync(menuSurfaceCssPath), 'shared menu surface styling should live in src/shared/menu-surface.css');

const menuSurfaceCss = readStylesheet('src/shared/menu-surface.css');
const menuSurface = require(menuSurfaceJsPath);

function createFakeElement() {
  const classes = new Set();
  const attributes = new Map();
  const properties = new Map();
  return {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      contains: (name) => classes.has(name)
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
      getPropertyValue: (name) => properties.get(name) || ''
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) || '',
    removeAttribute: (name) => attributes.delete(name)
  };
}

assert.strictEqual(
  menuSurface.className,
  '_x_extension_menu_surface_2024_unique_',
  'shared menu surface should expose a stable CSS class'
);
assert.strictEqual(
  menuSurface.contentWidthAttribute,
  'data-menu-surface-width',
  'shared menu surface should expose the content width attribute'
);
assert.strictEqual(typeof menuSurface.apply, 'function', 'shared menu surface should expose apply()');
assert.strictEqual(typeof menuSurface.applyContentWidth, 'function', 'shared menu surface should expose applyContentWidth()');
assert.strictEqual(typeof menuSurface.open, 'function', 'shared menu surface should expose open()');
assert.strictEqual(typeof menuSurface.close, 'function', 'shared menu surface should expose close()');

const element = createFakeElement();
menuSurface.applyContentWidth(element, {
  minWidth: 210,
  maxWidth: 260
});

assert.ok(
  element.classList.contains(menuSurface.className),
  'content width helper should attach the shared menu surface class'
);
assert.strictEqual(
  element.getAttribute(menuSurface.contentWidthAttribute),
  'content',
  'content width helper should mark the element as content-sized'
);
assert.strictEqual(
  element.style.getPropertyValue('--x-extension-menu-surface-min-width'),
  '210px',
  'content width helper should normalize numeric minimum widths to px'
);
assert.strictEqual(
  element.style.getPropertyValue('--x-extension-menu-surface-max-width'),
  '260px',
  'content width helper should normalize numeric maximum widths to px'
);

let requestedFrame = false;
menuSurface.open(element, {
  requestAnimationFrame: (callback) => {
    requestedFrame = true;
    callback();
  }
});

assert.strictEqual(requestedFrame, true, 'open() should wait a frame so CSS transitions can run');
assert.strictEqual(element.getAttribute('data-open'), 'true', 'open() should mark the surface as open');

menuSurface.close(element);
assert.strictEqual(element.getAttribute('data-open'), 'false', 'close() should mark the surface as closed');

assert.ok(
  menuSurfaceCss.includes('._x_extension_menu_surface_2024_unique_'),
  'menu surface CSS should style the shared surface class'
);
assert.ok(
  menuSurfaceCss.includes('[data-menu-surface-width="content"]'),
  'menu surface CSS should own the content width sizing rule'
);
assert.ok(
  menuSurfaceCss.includes('width: max-content;'),
  'content width surfaces should size to content'
);
assert.ok(
  menuSurfaceCss.includes('transition: opacity 170ms ease, transform 360ms cubic-bezier(0.2, 1.45, 0.35, 1);'),
  'menu surface CSS should own the shared select-style opening animation'
);

console.log('shared menu surface tests passed');
