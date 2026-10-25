const assert = require('assert');
const { JSDOM } = require('jsdom');

const fontFaces = require('../../src/shared/overlay-font-faces.js');
const { bundleScript } = require('../helpers/module-script');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// The overlay's font faces: registered through the FontFace API while a
// page loads, so opening the overlay later adds nothing that would restyle
// the whole page, and declared by the overlay itself in pages that started
// without them.

const FONT_FACES_STYLE_ID = '_x_extension_overlay_font_faces_2026_unique_';
const CJK_STYLE_ID = '_x_extension_overlay_cjk_font_faces_2026_unique_';
const getUrl = (assetPath) => `chrome-extension://lumno/${assetPath}`;

// FontFace and document.fonts, which JSDOM lacks.
function installFontFaceApi(window) {
  const added = new Set();
  window.FontFace = class FontFace {
    constructor(family, source, descriptors) {
      this.family = family;
      this.source = source;
      Object.assign(this, { style: 'normal', weight: 'normal', unicodeRange: 'U+0-10FFFF' }, descriptors);
    }
  };
  Object.defineProperty(window.document, 'fonts', {
    configurable: true,
    value: {
      add(face) { added.add(face); return this; },
      has(face) { return added.has(face); },
      delete(face) { return added.delete(face); },
      [Symbol.iterator]() { return added.values(); }
    }
  });
  return added;
}

function createWindow() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { runScripts: 'outside-only' });
  return { window: dom.window, added: installFontFaceApi(dom.window) };
}

function testEarlyRegistration() {
  const { window, added } = createWindow();
  assert.strictEqual(fontFaces.registerEarlyOverlayFontFaces(window, { getUrl, lang: 'zh-CN' }), true);
  const faces = Array.from(added);
  assert.deepStrictEqual(
    faces.map((face) => [face.family, face.weight]),
    [
      ['Lumno Open Sans', '300 549'],
      ['Lumno Open Sans', '550 649'],
      ['Lumno Open Sans', '650 800'],
      ['lumno-remixicon', 'normal'],
      ['Lumno Open Sans', '550 649']
    ],
    'the text bands, the icon face and the CJK face for the browser language should register'
  );
  assert.match(faces[0].source, /^url\("chrome-extension:\/\/lumno\/assets\/fonts\/open-sans\/OpenSans-VariableFont-wdth-wght\.woff2"\) format\("woff2"\)$/);
  assert.strictEqual(faces[0].display, 'swap');
  assert.match(faces[4].source, /PingFangSC-Medium/);
  assert.match(faces[4].unicodeRange, /U\+4E00-9FFF/, 'the CJK face should cover CJK text only');
  assert.strictEqual(window.document.head.children.length, 0, 'registering should leave the page DOM untouched');
  assert.strictEqual(fontFaces.hasEarlyOverlayFontFaces(window), true);

  assert.strictEqual(fontFaces.registerEarlyOverlayFontFaces(window, { getUrl, lang: 'zh-CN' }), false,
    'a page should register the faces once');
  assert.strictEqual(added.size, 5);

  added.delete(faces[0]);
  assert.strictEqual(fontFaces.hasEarlyOverlayFontFaces(window), false,
    'a page that dropped a face should have the overlay declare them again');
  window.close();
}

function testEarlyCjkFaceFollowsTheLanguageSetting() {
  const { window, added } = createWindow();
  fontFaces.registerEarlyOverlayFontFaces(window, { getUrl, lang: 'zh-CN' });
  const cjkFace = Array.from(added)[4];
  assert.strictEqual(fontFaces.keepEarlyCjkFontFace(window, 'zh-SG'), true,
    'a language with the same glyph forms should keep the face');
  assert.strictEqual(fontFaces.keepEarlyCjkFontFace(window, 'zh-TW'), false,
    'another script should replace the face');
  assert.strictEqual(added.has(cjkFace), false);
  assert.strictEqual(fontFaces.keepEarlyCjkFontFace(window, 'zh-CN'), false,
    'once removed, the caller installs the face the setting needs');
  window.close();

  const english = createWindow();
  fontFaces.registerEarlyOverlayFontFaces(english.window, { getUrl, lang: 'en-US' });
  assert.strictEqual(english.added.size, 4, 'a language without a CJK face should register none');
  assert.strictEqual(fontFaces.keepEarlyCjkFontFace(english.window, 'ja'), false);
  english.window.close();
}

function testRegistrationFailureLeavesTheOverlayToDeclareFaces() {
  const { window } = createWindow();
  window.FontFace = function() {
    throw new Error('Permission denied');
  };
  assert.strictEqual(fontFaces.registerEarlyOverlayFontFaces(window, { getUrl, lang: 'ja' }), false);
  assert.strictEqual(fontFaces.hasEarlyOverlayFontFaces(window), false);
  window.close();
}

// The all-frames shortcut observer registers the faces in the top frame of
// a loading Document only.
function testShortcutObserverRegistersWhileTheTopFrameLoads() {
  const load = ({ readyState, subframe }) => {
    const page = createWindow();
    let window = page.window;
    let added = page.added;
    if (subframe) {
      const iframe = window.document.createElement('iframe');
      window.document.body.appendChild(iframe);
      window = iframe.contentWindow;
      added = installFontFaceApi(window);
    }
    Object.defineProperty(window.document, 'readyState', { configurable: true, get: () => readyState });
    window.chrome = {
      runtime: {
        getURL: getUrl,
        sendMessage(message, callback) {
          if (typeof callback === 'function') callback({});
        },
        onMessage: { addListener() {}, removeListener() {} }
      },
      i18n: { getUILanguage: () => 'ja' }
    };
    const observer = bundleScript('shortcut-key-observer');
    window.eval(observer);
    return { window, added, reinject: () => window.eval(observer) };
  };

  const loading = load({ readyState: 'loading' });
  assert.strictEqual(loading.added.size, 5, 'a loading top frame should register the faces');
  assert.match(Array.from(loading.added)[4].source, /HiraginoSans-W5/);
  assert.strictEqual(loading.window.document.querySelector('style'), null);
  loading.reinject();
  assert.strictEqual(loading.added.size, 5, 'a replacement observer should not register again');
  loading.window.close();

  const shown = load({ readyState: 'complete' });
  assert.strictEqual(shown.added.size, 0, 'a page that already shows should be left to the overlay');
  shown.window.close();

  const frame = load({ readyState: 'loading', subframe: true });
  assert.ok(frame.window._x_extension_shortcut_key_observer_2026_unique_, 'the observer should run in the subframe');
  assert.strictEqual(frame.added.size, 0, 'a subframe should register nothing');
  frame.window.top.close();
}

async function testOverlayReusesEarlyFaces() {
  const open = async (language) => {
    let added = null;
    const page = await createOverlayPage({
      settings: { _x_extension_language_2024_unique_: language },
      setup(window) {
        added = installFontFaceApi(window);
        fontFaces.registerEarlyOverlayFontFaces(window, {
          getUrl: window.chrome.runtime.getURL,
          lang: 'zh-CN'
        });
      }
    });
    await page.open();
    await page.settle(60);
    return { page, added };
  };

  const matching = await open('zh_CN');
  assert.strictEqual(matching.page.document.getElementById(FONT_FACES_STYLE_ID), null,
    'the overlay should not declare faces the page already registered');
  assert.strictEqual(matching.page.document.getElementById(CJK_STYLE_ID), null,
    'a matching language setting should keep the early CJK face');
  assert.strictEqual(matching.added.size, 5);
  matching.page.close();

  const otherScript = await open('ja');
  const cjkStyle = otherScript.page.document.getElementById(CJK_STYLE_ID);
  assert.ok(cjkStyle && /HiraginoSans-W5/.test(cjkStyle.textContent),
    'a language setting with other glyph forms should install its own CJK face');
  assert.strictEqual(otherScript.added.size, 4, 'the early CJK face should make way for it');
  otherScript.page.close();
}

testEarlyRegistration();
testEarlyCjkFaceFollowsTheLanguageSetting();
testRegistrationFailureLeavesTheOverlayToDeclareFaces();
testShortcutObserverRegistersWhileTheTopFrameLoads();
testOverlayReusesEarlyFaces()
  .then(() => {
    console.log('overlay font face tests passed');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
