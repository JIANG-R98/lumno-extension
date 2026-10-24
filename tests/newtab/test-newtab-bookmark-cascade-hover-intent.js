const assert = require('assert');
const path = require('path');
const { parsePageCss } = require('../helpers/css-rules');
const { getPageScripts, runsBefore } = require('../helpers/runtime-scripts');

const repoRoot = path.resolve(__dirname, '..', '..');
const {
  buildCascadeSafeTriangle,
  isPointInsideCascadeSafeTriangle
} = require(path.join(repoRoot, 'src', 'newtab', 'bookmarks', 'bookmark-cascade-position.ts'));
const {
  createBookmarkCascadeMenuRuntime
} = require(path.join(repoRoot, 'src', 'newtab', 'bookmarks', 'bookmark-cascade-menu.ts'));
const {
  createFakeBookmarkCascadeView
} = require(path.join(repoRoot, 'tests', 'helpers', 'fake-bookmark-cascade-view.js'));

// Longer than the menus' hover-intent delay and their close delay, and
// shorter than how long a safe triangle protects an open submenu.
const HOVER_PAUSE_MS = 400;
const CLOSE_PAUSE_MS = 600;

// A layer value: a number, or calc(number + number) once tokens resolve.
function layer(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const sum = text.match(/^calc\((-?\d+) \+ (\d+)\)$/);
  return sum ? Number(sum[1]) + Number(sum[2]) : Number.parseInt(text, 10);
}

function createFakeEvent(type, values) {
  return {
    type,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...(values || {})
  };
}

function parseSelector(selector) {
  const source = String(selector || '').trim();
  const attrMatch = source.match(/\[([^=\]]+)="([^"]*)"\]/);
  const attr = attrMatch ? { name: attrMatch[1], value: attrMatch[2] } : null;
  const withoutAttr = attr ? source.replace(attrMatch[0], '') : source;
  const classMatch = withoutAttr.match(/\.([A-Za-z0-9_-]+)/);
  const className = classMatch ? classMatch[1] : '';
  const tag = withoutAttr.replace(/\.[A-Za-z0-9_-]+/, '').trim().toUpperCase();
  return { attr, className, tag };
}

function createFakeElement(tagName, ownerDocument) {
  const children = [];
  const attributes = new Map();
  const listeners = new Map();
  const classes = new Set();
  const styleValues = new Map();
  let classNameValue = '';
  let textContentValue = '';
  let rect = { left: 0, top: 0, width: 210, height: 32 };
  const element = {
    tagName: String(tagName || '').toUpperCase(),
    nodeType: 1,
    children,
    childNodes: children,
    ownerDocument,
    parentNode: null,
    get className() {
      return classNameValue;
    },
    set className(value) {
      classNameValue = String(value || '');
      classes.clear();
      classNameValue.split(/\s+/).filter(Boolean).forEach((part) => classes.add(part));
    },
    innerHTML: '',
    get textContent() {
      return textContentValue || children.map((child) => child.textContent || '').join('');
    },
    set textContent(value) {
      textContentValue = String(value || '');
    },
    title: '',
    type: '',
    tabIndex: 0,
    _connected: false,
    get isConnected() {
      return element._connected ||
        element === ownerDocument.body ||
        Boolean(element.parentNode && element.parentNode.isConnected);
    },
    get firstChild() {
      return children[0] || null;
    },
    get offsetWidth() {
      return rect.width;
    },
    get offsetHeight() {
      return rect.height;
    },
    classList: {
      add: (...names) => {
        names.forEach((name) => {
          String(name || '').split(/\s+/).filter(Boolean).forEach((part) => classes.add(part));
        });
        classNameValue = Array.from(classes).join(' ');
      },
      remove: (...names) => {
        names.forEach((name) => classes.delete(name));
        classNameValue = Array.from(classes).join(' ');
      },
      contains: (name) => classes.has(name)
    },
    style: {
      setProperty: (name, value) => styleValues.set(name, String(value)),
      removeProperty: (name) => styleValues.delete(name),
      getPropertyValue: (name) => styleValues.get(name) || ''
    },
    setRect(nextRect) {
      rect = { ...rect, ...(nextRect || {}) };
    },
    appendChild(child) {
      child.parentNode = element;
      child.ownerDocument = ownerDocument;
      children.push(child);
      return child;
    },
    insertBefore(child, reference) {
      child.parentNode = element;
      child.ownerDocument = ownerDocument;
      const index = children.indexOf(reference);
      if (index < 0) {
        children.push(child);
      } else {
        children.splice(index, 0, child);
      }
      return child;
    },
    removeChild(child) {
      const index = children.indexOf(child);
      if (index >= 0) {
        children.splice(index, 1);
        child.parentNode = null;
      }
      return child;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    addEventListener(type, listener) {
      const eventName = String(type || '');
      listeners.set(eventName, [...(listeners.get(eventName) || []), listener]);
    },
    dispatchEvent(event) {
      const nextEvent = event || createFakeEvent('');
      nextEvent.target = nextEvent.target || element;
      (listeners.get(nextEvent.type) || []).forEach((listener) => listener(nextEvent));
      return !nextEvent.defaultPrevented;
    },
    focus() {
      ownerDocument.activeElement = element;
      element.dispatchEvent(createFakeEvent('focus', { target: element }));
    },
    matches(selector) {
      if (selector === ':hover') {
        return false;
      }
      const parsed = parseSelector(selector);
      if (parsed.tag && element.tagName !== parsed.tag) {
        return false;
      }
      if (parsed.className && !classes.has(parsed.className)) {
        return false;
      }
      if (parsed.attr && element.getAttribute(parsed.attr.name) !== parsed.attr.value) {
        return false;
      }
      return true;
    },
    contains(target) {
      if (target === element) {
        return true;
      }
      return children.some((child) => child.contains && child.contains(target));
    },
    querySelector(selector) {
      return element.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      function visit(node) {
        if (node.matches && node.matches(selector)) {
          matches.push(node);
        }
        (node.children || []).forEach(visit);
      }
      children.forEach(visit);
      return matches;
    },
    getBoundingClientRect() {
      return {
        left: rect.left,
        top: rect.top,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        width: rect.width,
        height: rect.height
      };
    }
  };
  return element;
}

function createFakeDocument() {
  const listeners = new Map();
  const fakeDocument = {
    activeElement: null,
    body: null,
    documentElement: { clientWidth: 1024, clientHeight: 720 },
    createElement(tagName) {
      return createFakeElement(tagName, fakeDocument);
    },
    createElementNS(_namespace, tagName) {
      return createFakeElement(tagName, fakeDocument);
    },
    addEventListener(type, listener) {
      const eventName = String(type || '');
      listeners.set(eventName, [...(listeners.get(eventName) || []), listener]);
    },
    dispatchEvent(event) {
      const nextEvent = event || createFakeEvent('');
      nextEvent.target = nextEvent.target || fakeDocument.activeElement || fakeDocument.body;
      (listeners.get(nextEvent.type) || []).forEach((listener) => listener(nextEvent));
      return !nextEvent.defaultPrevented;
    }
  };
  fakeDocument.body = createFakeElement('body', fakeDocument);
  fakeDocument.body._connected = true;
  return fakeDocument;
}

function createFakeClock() {
  let now = 0;
  let nextTimerId = 1;
  const timers = [];
  function runDueTimers() {
    timers.sort((a, b) => a.due - b.due);
    for (let index = 0; index < timers.length; index += 1) {
      const timer = timers[index];
      if (timer.cleared || timer.due > now) {
        continue;
      }
      timers.splice(index, 1);
      index -= 1;
      timer.callback();
      timers.sort((a, b) => a.due - b.due);
    }
  }
  return {
    now: () => now,
    setTimeout(callback, delay) {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.push({
        id,
        due: now + Math.max(0, Number(delay) || 0),
        callback,
        cleared: false
      });
      return id;
    },
    clearTimeout(id) {
      timers.forEach((timer) => {
        if (timer.id === id) {
          timer.cleared = true;
        }
      });
    },
    advance(ms) {
      now += Math.max(0, Number(ms) || 0);
      runDueTimers();
    }
  };
}

function getMenuLevels(documentObj) {
  return documentObj.body.querySelectorAll('.x-nt-bookmark-cascade-level');
}

function getMenuItems(levelElement) {
  return levelElement ? levelElement.querySelectorAll('.x-nt-bookmark-cascade-item') : [];
}

function getActiveLabel(levelElement) {
  const active = levelElement && levelElement.querySelector('.x-nt-bookmark-cascade-item[data-active="true"]');
  return active ? active.textContent : '';
}

function setLevelLayout(levelElement, rect) {
  if (!levelElement) {
    return;
  }
  const levelRect = { left: 40, top: 70, width: 210, height: 140, ...(rect || {}) };
  levelElement.setRect(levelRect);
  getMenuItems(levelElement).forEach((item, index) => {
    item.setRect({
      left: levelRect.left,
      top: levelRect.top + 34 + (index * 32),
      width: levelRect.width,
      height: 32
    });
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

assert.strictEqual(
  typeof buildCascadeSafeTriangle,
  'function',
  'cascade positioning should expose a safe-triangle builder'
);
assert.strictEqual(
  typeof isPointInsideCascadeSafeTriangle,
  'function',
  'cascade positioning should expose safe-triangle hit testing'
);
assert.strictEqual(
  typeof createBookmarkCascadeMenuRuntime,
  'function',
  'bookmark cascade menu should expose a reusable runtime factory'
);

{
  const triangle = buildCascadeSafeTriangle({
    pointer: { x: 100, y: 120 },
    submenuRect: { left: 220, right: 420, top: 80, bottom: 220 },
    side: 'right'
  });

  assert.deepStrictEqual(
    triangle,
    [
      { x: 100, y: 120 },
      { x: 220, y: 80 },
      { x: 220, y: 220 }
    ],
    'right-opening submenus should use the submenu left edge as the safe-triangle base'
  );
  assert.ok(
    isPointInsideCascadeSafeTriangle({ x: 180, y: 128 }, triangle),
    'points inside the right-opening safe triangle should be protected'
  );
  assert.ok(
    !isPointInsideCascadeSafeTriangle({ x: 180, y: 40 }, triangle),
    'points outside the right-opening safe triangle should not be protected'
  );
}

{
  const triangle = buildCascadeSafeTriangle({
    pointer: { x: 500, y: 220 },
    submenuRect: { left: 120, right: 320, top: 160, bottom: 360 },
    side: 'left'
  });

  assert.deepStrictEqual(
    triangle,
    [
      { x: 500, y: 220 },
      { x: 320, y: 160 },
      { x: 320, y: 360 }
    ],
    'left-opening submenus should use the submenu right edge as the safe-triangle base'
  );
  assert.ok(
    isPointInsideCascadeSafeTriangle({ x: 410, y: 230 }, triangle),
    'points inside the left-opening safe triangle should be protected'
  );
  assert.ok(
    !isPointInsideCascadeSafeTriangle({ x: 410, y: 120 }, triangle),
    'points outside the left-opening safe triangle should not be protected'
  );
}

{
  const newtabScripts = getPageScripts('newtab.html');
  assert.ok(
    runsBefore(newtabScripts, 'src/newtab/bookmarks/bookmark-cascade-position.ts', 'src/newtab/newtab.ts') &&
      runsBefore(newtabScripts, 'src/newtab/bookmarks/bookmark-cascade-menu.ts', 'src/newtab/newtab.ts'),
    'newtab should load the cascade menu runtime and its positioning helpers before the page entry'
  );
}
{
  const css = parsePageCss('newtab.html');
  const item = css.rule('.x-nt-bookmark-cascade-item');
  assert.strictEqual(item.get('transition'), 'color 120ms ease',
    'row text colour transitions while the hover background appears at once');
  assert.ok(css.selectors().some((selector) => selector.startsWith('.x-nt-bookmark-cascade-item[data-hover-suppressed="true"]:hover')),
    'rows crossed inside a safe triangle should not show a competing hover');
  assert.ok(layer(css.rule('.x-nt-bookmark-cursor-tooltip').get('--x-extension-tooltip-z-index')) >
    layer(css.rule('.x-nt-bookmark-cascade-menu').get('z-index')),
  'the bookmark cursor tooltip should render above the bookmark menus');
  assert.ok(!css.entries.some((entry) => entry.selectors.includes('.x-nt-bookmark-cascade-item:focus-visible') &&
    /^2px solid/.test(entry.style.getPropertyValue('outline'))),
  'keyboard focus in a menu uses the selected row background, not an outline');
}

function createCascadeRuntimeFixture(overrides) {
  const configOverrides = overrides || {};
  const documentObj = createFakeDocument();
  const clock = createFakeClock();
  const openedLevels = [];
  const openedUrls = [];
  const tooltipBindings = [];
  const anchor = documentObj.createElement('button');
  anchor.setRect({ left: 20, top: 20, width: 120, height: 40 });
  documentObj.body.appendChild(anchor);

  const itemsByFolder = configOverrides.itemsByFolder || {
    root: [
      { id: 'research', title: 'Research', type: 'folder' },
      { id: 'archive', title: 'Archive', url: 'https://example.com/archive' }
    ],
    research: [
      { id: 'amazon', title: 'Amazon Menu Aim', url: 'https://example.com/amazon' }
    ]
  };

  const runtime = createBookmarkCascadeMenuRuntime({
    view: createFakeBookmarkCascadeView(),
    documentObj,
    windowObj: {
      innerWidth: 1024,
      innerHeight: 720,
      performance: { now: clock.now },
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame() {},
      getComputedStyle: () => ({ transform: 'none' })
    },
    positionUtils: {
      placeRootCascadeMenu: () => ({ left: 40, top: 70, side: 'right', horizontal: 'left', vertical: 'below' }),
      placeCascadeSubmenu: () => ({ left: 252, top: 70, side: 'right', horizontal: 'right', vertical: 'below' }),
      getTranslateNeutralRect: (rect) => rect,
      buildCascadeSafeTriangle,
      isPointInsideCascadeSafeTriangle
    },
    menuSurface: {
      applyContentWidth() {},
      open(element) {
        openedLevels.push(element);
        element.setAttribute('data-open', 'true');
      }
    },
    t: (_key, fallback) => fallback || '',
    sanitizeDisplayText: (value) => String(value || ''),
    getHostFromUrl: () => '',
    getSiteDisplayName: (_host, title) => title || '',
    getUrlDisplay: (url) => url,
    getRiSvg: () => '',
    getFigmaFolderSvg: () => '',
    initFolderPathMorph() {},
    playFolderPathMorph() {},
    attachFaviconWithFallbacks() {},
    ensureReady: () => Promise.resolve(true),
    getItems: (folderId) => itemsByFolder[String(folderId || '')] || [],
    navigateToUrl: configOverrides.navigateToUrl || ((url) => {
      openedUrls.push({ url, via: 'navigate' });
    }),
    openUrl: configOverrides.openUrl || ((url, options) => {
      openedUrls.push({ url, background: Boolean(options && options.openInBackgroundTab) });
    }),
    bindCursorTooltip: configOverrides.bindCursorTooltip || ((target, getText, options) => {
      tooltipBindings.push({ target, getText, options });
      return target;
    }),
    hideCursorTooltip: configOverrides.hideCursorTooltip || (() => {}),
    shouldSuppressHover: configOverrides.shouldSuppressHover || (() => false)
  });

  return { anchor, clock, documentObj, openedLevels, openedUrls, runtime, tooltipBindings };
}

async function openCascadeWithSubmenu(overrides) {
  const fixture = createCascadeRuntimeFixture(overrides);
  fixture.runtime.open({ id: 'root', title: 'Root' }, fixture.anchor);
  await flushPromises();

  let levels = getMenuLevels(fixture.documentObj);
  setLevelLayout(levels[0], { left: 40, top: 70, width: 210, height: 140 });

  const rootItems = getMenuItems(levels[0]);
  rootItems[0].dispatchEvent(createFakeEvent('click', { target: rootItems[0] }));

  levels = getMenuLevels(fixture.documentObj);
  setLevelLayout(levels[0], { left: 40, top: 70, width: 210, height: 140 });
  setLevelLayout(levels[1], { left: 252, top: 104, width: 210, height: 120 });

  return fixture;
}

(async () => {
  {
    let suppressHover = false;
    const { anchor, clock, documentObj, runtime } = createCascadeRuntimeFixture({
      shouldSuppressHover: () => suppressHover
    });
    runtime.open({ id: 'root', title: 'Root' }, anchor);
    await flushPromises();
    let levels = getMenuLevels(documentObj);
    setLevelLayout(levels[0], { left: 40, top: 70, width: 210, height: 140 });
    let rootItems = getMenuItems(levels[0]);
    suppressHover = true;
    rootItems[0].dispatchEvent(createFakeEvent('pointerenter', {
      clientX: 80,
      clientY: 104,
      pointerType: 'mouse',
      target: rootItems[0]
    }));
    clock.advance(HOVER_PAUSE_MS);

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      levels.length,
      1,
      'drag hover suppression should prevent folder rows from opening a delayed cascade submenu'
    );
    assert.strictEqual(
      rootItems[0].getAttribute('data-hover-suppressed'),
      'true',
      'drag hover suppression should suppress native hover styling on the crossed cascade row'
    );
  }

  {
    const { anchor, clock, documentObj, runtime } = createCascadeRuntimeFixture();
    runtime.open({ id: 'root', title: 'Root' }, anchor);
    await flushPromises();
    const levels = getMenuLevels(documentObj);
    setLevelLayout(levels[0], { left: 40, top: 70, width: 210, height: 140 });

    runtime.setDragMode(true);
    documentObj.dispatchEvent(createFakeEvent('pointermove', {
      clientX: 900,
      clientY: 650,
      target: documentObj.body
    }));
    clock.advance(CLOSE_PAUSE_MS);

    assert.strictEqual(
      runtime.isOpen(),
      true,
      'an active cascade drag should not close or detach the menu when crossing outside its current levels'
    );
  }


  {
    const { clock, documentObj } = await openCascadeWithSubmenu();
    let levels = getMenuLevels(documentObj);
    let rootItems = getMenuItems(levels[0]);
    documentObj.dispatchEvent(createFakeEvent('pointermove', {
      clientX: 120,
      clientY: 120,
      target: rootItems[0]
    }));
    rootItems[0].dispatchEvent(createFakeEvent('pointerleave', {
      clientX: 220,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[0]
    }));
    rootItems[1].dispatchEvent(createFakeEvent('pointerenter', {
      clientX: 220,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[1]
    }));

    clock.advance(HOVER_PAUSE_MS);

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      levels.length,
      2,
      'diagonal pointer movement toward an open submenu should keep safe-triangle protection after the base hover delay'
    );
    assert.strictEqual(
      getActiveLabel(levels[0]),
      'Research',
      'safe-triangle protection should not switch the parent row while the pointer is moving toward the submenu'
    );
  }

  {
    const { clock, documentObj } = await openCascadeWithSubmenu();
    let levels = getMenuLevels(documentObj);
    let rootItems = getMenuItems(levels[0]);
    documentObj.dispatchEvent(createFakeEvent('pointermove', {
      clientX: 120,
      clientY: 120,
      target: rootItems[0]
    }));
    rootItems[0].dispatchEvent(createFakeEvent('pointerleave', {
      clientX: 170,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[0]
    }));
    rootItems[1].dispatchEvent(createFakeEvent('pointerenter', {
      clientX: 170,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[1]
    }));

    clock.advance(HOVER_PAUSE_MS);

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      levels.length,
      2,
      'mid-lane diagonal movement toward an open submenu should stay protected before the pointer reaches the submenu edge'
    );
    assert.strictEqual(
      getActiveLabel(levels[0]),
      'Research',
      'mid-lane diagonal protection should keep the active parent folder while the pointer moves toward its submenu'
    );
    assert.strictEqual(
      rootItems[1].getAttribute('data-hover-suppressed'),
      'true',
      'safe-triangle protection should suppress the next row native hover visual while it keeps the current submenu active'
    );
  }

  {
    const { documentObj } = await openCascadeWithSubmenu();
    let levels = getMenuLevels(documentObj);
    let rootItems = getMenuItems(levels[0]);
    documentObj.dispatchEvent(createFakeEvent('pointermove', {
      clientX: 120,
      clientY: 120,
      target: rootItems[0]
    }));
    rootItems[0].dispatchEvent(createFakeEvent('pointerleave', {
      clientX: 170,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[0]
    }));
    rootItems[1].dispatchEvent(createFakeEvent('pointerenter', {
      clientX: 170,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[1]
    }));
    rootItems[1].dispatchEvent(createFakeEvent('pointerleave', {
      clientX: 252,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[1]
    }));

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      rootItems[1].getAttribute('data-hover-suppressed'),
      '',
      'leaving a protected sibling row should clear its temporary hover suppression'
    );
  }

  {
    const { clock, documentObj } = await openCascadeWithSubmenu();
    let levels = getMenuLevels(documentObj);
    let rootItems = getMenuItems(levels[0]);
    documentObj.dispatchEvent(createFakeEvent('pointermove', {
      clientX: 120,
      clientY: 120,
      target: rootItems[0]
    }));
    rootItems[0].dispatchEvent(createFakeEvent('pointerleave', {
      clientX: 150,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[0]
    }));

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      levels.length,
      1,
      'vertical pointer leave should clear the old submenu immediately when the pointer is not moving toward it'
    );
    assert.strictEqual(
      getActiveLabel(levels[0]),
      '',
      'vertical pointer leave should remove the old row highlight before waiting for the next hover intent'
    );

    rootItems[1].dispatchEvent(createFakeEvent('pointerenter', {
      clientX: 150,
      clientY: 138,
      pointerType: 'mouse',
      target: rootItems[1]
    }));

    clock.advance(HOVER_PAUSE_MS);

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      levels.length,
      1,
      'vertical pointer movement between rows should switch after the base hover delay instead of waiting out safe-triangle protection'
    );
    assert.strictEqual(
      getActiveLabel(levels[0]),
      'Archive',
      'vertical sibling hover should activate the newly hovered row'
    );
  }

  {
    const { documentObj, openedLevels } = await openCascadeWithSubmenu();
    let levels = getMenuLevels(documentObj);
    let rootItems = getMenuItems(levels[0]);
    const openCountAfterFirstSubmenu = openedLevels.length;
    rootItems[0].setAttribute('data-active', 'false');
    rootItems[0].dispatchEvent(createFakeEvent('click', { target: rootItems[0] }));

    levels = getMenuLevels(documentObj);
    rootItems = getMenuItems(levels[0]);
    assert.strictEqual(
      openedLevels.length,
      openCountAfterFirstSubmenu,
      'clicking a folder whose submenu is already expanded should reuse the existing submenu instead of replaying its open animation'
    );
    assert.strictEqual(
      levels.length,
      2,
      'reusing an already expanded folder submenu should keep the child level mounted'
    );
    assert.strictEqual(
      getActiveLabel(levels[0]),
      'Research',
      'reusing an already expanded folder submenu should restore the parent folder active state'
    );
  }

  {
    const hiddenTooltips = [];
    const { documentObj, openedUrls, runtime, tooltipBindings } = await openCascadeWithSubmenu({
      hideCursorTooltip: () => {
        hiddenTooltips.push(true);
      }
    });
    const levels = getMenuLevels(documentObj);
    const submenuItems = getMenuItems(levels[1]);
    const nestedUrlItem = submenuItems[0];
    const tooltipBinding = tooltipBindings.find((entry) => entry.target === nestedUrlItem);

    assert.ok(
      tooltipBinding,
      'bookmark cascade URL items inside folders should bind a cursor-following tooltip'
    );
    assert.strictEqual(
      tooltipBinding.getText(nestedUrlItem),
      'Amazon Menu Aim',
      'bookmark cascade URL tooltip text should use the nested bookmark title'
    );
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(tooltipBinding.options, 'getTagText'),
      false,
      'bookmark cascade URL cursor tooltip should not render an extra background-open badge'
    );

    nestedUrlItem.dispatchEvent(createFakeEvent('click', {
      metaKey: true,
      target: nestedUrlItem
    }));
    assert.strictEqual(
      runtime.isOpen(),
      true,
      'Command-clicking a bookmark URL should keep the cascade menu open'
    );
    nestedUrlItem.dispatchEvent(createFakeEvent('auxclick', {
      button: 1,
      target: nestedUrlItem
    }));
    assert.strictEqual(
      runtime.isOpen(),
      true,
      'middle-clicking a bookmark URL should keep the cascade menu open'
    );

    assert.deepStrictEqual(
      openedUrls,
      [
        { url: 'https://example.com/amazon', background: true },
        { url: 'https://example.com/amazon', background: true }
      ],
      'bookmark cascade URL items should support Command-click and middle-click background opening'
    );
    assert.ok(
      hiddenTooltips.length > 0,
      'bookmark cascade URL activation should hide the cursor-following tooltip'
    );

    documentObj.dispatchEvent(createFakeEvent('pointerdown', {
      target: documentObj.body
    }));
    assert.strictEqual(
      runtime.isOpen(),
      false,
      'clicking outside should close a cascade menu kept open after background opening'
    );
  }

  {
    const { documentObj, openedUrls, runtime } = await openCascadeWithSubmenu();
    const levels = getMenuLevels(documentObj);
    const nestedUrlItem = getMenuItems(levels[1])[0];

    nestedUrlItem.dispatchEvent(createFakeEvent('click', {
      target: nestedUrlItem
    }));

    assert.strictEqual(runtime.isOpen(), false, 'ordinary bookmark clicks should close the cascade menu');
    assert.deepStrictEqual(
      openedUrls,
      [{ url: 'https://example.com/amazon', background: false }],
      'ordinary bookmark clicks should keep their foreground navigation behavior'
    );
  }

  {
    const { documentObj, openedUrls, runtime } = await openCascadeWithSubmenu();
    const levels = getMenuLevels(documentObj);
    const nestedUrlItem = getMenuItems(levels[1])[0];

    nestedUrlItem.dispatchEvent(createFakeEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      target: nestedUrlItem
    }));

    assert.deepStrictEqual(
      openedUrls,
      [{ url: 'https://example.com/amazon', background: true }],
      'bookmark cascade URL keyboard activation inside folders should open in the background while Ctrl is held'
    );
    assert.strictEqual(
      runtime.isOpen(),
      true,
      'Ctrl+Enter on a bookmark URL should keep the cascade menu open'
    );
  }

  console.log('newtab bookmark cascade hover intent tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
