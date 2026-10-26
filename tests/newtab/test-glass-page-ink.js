// The page-wide glass ink: one threshold for a fresh decision (a setting changed, or a new set of
// plates), hysteresis only while re-sampling the same plates, floating surfaces following the
// plates, and only the light theme's own ink remembered.
const assert = require('assert');
const vm = require('vm');
const { moduleScript } = require('../helpers/module-script');
const wallpaperSettings = require('../../src/domain/settings/newtab-wallpaper.ts');

function createElement(rect) {
  const attributes = new Map();
  const styles = new Map();
  return {
    style: {
      getPropertyValue: (name) => styles.get(String(name)) || '',
      setProperty: (name, value) => styles.set(String(name), String(value)),
      removeProperty: (name) => styles.delete(String(name))
    },
    getAttribute: (name) => (attributes.has(String(name)) ? attributes.get(String(name)) : null),
    setAttribute: (name, value) => attributes.set(String(name), String(value)),
    removeAttribute: (name) => attributes.delete(String(name)),
    getBoundingClientRect: () => rect
  };
}

const rectAt = (left, top) => ({ left, top, right: left + 100, bottom: top + 60, width: 100, height: 60 });

// The fake image is one tone, or dark on its left half and `pixel` on its right.
function createCanvas() {
  let drawn = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage(image) { drawn = image; },
        getImageData() {
          const data = new Uint8ClampedArray(Math.max(1, canvas.width * canvas.height) * 4);
          for (let index = 0; index < data.length; index += 4) {
            const tone = drawn.leftPixel && ((index / 4) % canvas.width) < canvas.width / 2
              ? drawn.leftPixel
              : drawn.pixel;
            data[index] = tone.red;
            data[index + 1] = tone.green;
            data[index + 2] = tone.blue;
            data[index + 3] = 255;
          }
          return { data };
        }
      };
    }
  };
  return canvas;
}

const grey = (value) => ({ red: value, green: value, blue: value });
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function createPage({ pixel, leftPixel, targets }) {
  const body = createElement();
  body.setAttribute('data-wallpaper-active', 'true');
  const canvas = createCanvas();
  const frames = new Map();
  let nextFrame = 0;
  const stored = new Map();
  const images = [];
  class FakeImage {
    constructor() {
      this.width = this.height = this.naturalWidth = this.naturalHeight = 10;
      images.push(this);
    }
    set src(value) { this._src = String(value); }
    get src() { return this._src; }
    decode() { return Promise.resolve(); }
  }
  const windowObj = {
    innerWidth: 1000,
    innerHeight: 600,
    requestAnimationFrame(callback) {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame(id) { frames.delete(id); },
    localStorage: {
      getItem: (key) => (stored.has(key) ? stored.get(key) : null),
      setItem: (key, value) => stored.set(key, String(value))
    }
  };
  const sandbox = { console, Image: FakeImage, Uint8ClampedArray, setTimeout, clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    moduleScript('src/newtab/wallpaper/wallpaper-adaptive-tone.ts', 'LumnoNewtabWallpaperAdaptiveTone'),
    sandbox,
    { filename: 'src/newtab/wallpaper/wallpaper-adaptive-tone.ts' }
  );
  const tone = sandbox.LumnoNewtabWallpaperAdaptiveTone;
  const runtime = tone.createWallpaperAdaptiveTone({
    documentObj: {
      body,
      documentElement: { clientWidth: 1000, clientHeight: 600 },
      createElement: (tag) => (String(tag).toLowerCase() === 'canvas' ? canvas : createElement())
    },
    windowObj,
    getTargets: () => targets,
    getCurrentWallpaper: () => ({ id: 'wallpaper', url: 'test://wallpaper' }),
    getWallpaperImageUrl: (wallpaper) => wallpaper.url,
    getOverlayAlphaAtViewportY: () => 0,
    getOverlayLuminance: () => 1,
    getEffectLuminanceAtViewport: () => null,
    applyWordmarkThemeAppearance() {}
  });
  runtime.refresh();
  const image = images.find((candidate) => candidate.src === 'test://wallpaper');
  image.pixel = pixel;
  image.leftPixel = leftPixel || null;
  image.onload();
  await flush();
  const runFrames = () => {
    while (frames.size > 0) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    }
  };
  runFrames();
  return {
    body,
    targets,
    runtime,
    runFrames,
    remembered: () => stored.get(wallpaperSettings.newtabGlassInkHint.key) || null
  };
}

(async () => {
  // A wallpaper inside the hysteresis band (luma 0.47) opens in light ink: under the threshold.
  const plate = createElement(rectAt(100, 100));
  const page = await createPage({ pixel: grey(120), targets: [{ element: plate, sampleElement: plate, glass: true }] });
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'light');
  assert.strictEqual(page.body.getAttribute('data-glass-ink-hint'), 'light');
  assert.strictEqual(page.remembered(), 'light');

  // A material held light marks the page dark-ink; letting it go and re-sampling without a reset
  // would hold that ink in the band, which is how the page used to end up on the other ink.
  page.body.setAttribute('data-glass-theme', 'light');
  page.body.setAttribute('data-glass-ink-hint', 'dark');
  page.runtime.schedule();
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'dark', 'a material held light keeps dark ink');
  assert.strictEqual(page.remembered(), 'light', 'a held material leaves the remembered ink alone');
  page.body.removeAttribute('data-glass-theme');
  page.runtime.schedule({ resetInk: true });
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'light', 'back on Auto, the page decides afresh');
  assert.strictEqual(page.body.getAttribute('data-glass-ink-hint'), 'light');

  // Without a reset, a re-sample keeps the ink it has (resize, scroll).
  page.body.setAttribute('data-glass-ink-hint', 'dark');
  page.runtime.schedule(new Event('resize'));
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'dark', 'an event argument is not a reset');
  page.runtime.schedule({ resetInk: true });
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'light');

  // A plate that renders later (the page still filling in) is a new layout: decided afresh too.
  page.body.setAttribute('data-glass-ink-hint', 'dark');
  page.runtime.schedule();
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'dark');
  const laterPlate = createElement(rectAt(300, 100));
  page.targets.push({ element: laterPlate, sampleElement: laterPlate, glass: true });
  page.runtime.schedule();
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'light', 'a new set of plates decides afresh');
  assert.strictEqual(laterPlate.getAttribute('data-glass-ink'), 'light');

  // The dark theme reads light ink but never writes the hint a light page opens in.
  page.body.setAttribute('data-glass-ink-hint', 'dark');
  page.body.setAttribute('data-theme', 'dark');
  page.runtime.schedule({ resetInk: true });
  page.runFrames();
  assert.strictEqual(plate.getAttribute('data-glass-ink'), 'light');
  assert.strictEqual(page.body.getAttribute('data-glass-ink-hint'), 'dark', 'the dark theme leaves the hint alone');

  // A floating panel over a bright patch follows the plates instead of turning the page.
  const darkPlate = createElement(rectAt(100, 100));
  const panel = createElement(rectAt(700, 100));
  await createPage({
    pixel: grey(240),
    leftPixel: grey(20),
    targets: [
      { element: darkPlate, sampleElement: darkPlate, glass: true },
      { element: panel, sampleElement: panel, glass: true, paletteSwap: true, floating: true }
    ]
  });
  assert.strictEqual(darkPlate.getAttribute('data-glass-ink'), 'light');
  assert.strictEqual(panel.getAttribute('data-glass-ink'), 'light', 'the panel takes the plates\' ink');
  assert.strictEqual(panel.getAttribute('data-glass-ink-theme'), 'dark');

  console.log('glass page ink tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
