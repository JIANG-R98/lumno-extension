const assert = require('assert');
const vm = require('vm');
const { moduleScript } = require('../helpers/module-script');

function createStyle() {
  const values = new Map();
  return {
    getPropertyValue(name) {
      return values.get(String(name)) || '';
    },
    setProperty(name, value) {
      values.set(String(name), String(value));
    },
    removeProperty(name) {
      values.delete(String(name));
    }
  };
}

function createElement(rect) {
  const attributes = new Map();
  return {
    style: createStyle(),
    getAttribute(name) {
      return attributes.has(String(name)) ? attributes.get(String(name)) : null;
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
    removeAttribute(name) {
      attributes.delete(String(name));
    },
    getBoundingClientRect() {
      return rect || {
        left: 100,
        top: 100,
        right: 148,
        bottom: 148,
        width: 48,
        height: 48
      };
    }
  };
}

function createCanvas() {
  let drawnImage = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage(image) {
          drawnImage = image;
        },
        getImageData() {
          const pixel = drawnImage && drawnImage.pixel
            ? drawnImage.pixel
            : { red: 128, green: 128, blue: 128 };
          const length = Math.max(1, canvas.width * canvas.height) * 4;
          const data = new Uint8ClampedArray(length);
          for (let index = 0; index < length; index += 4) {
            // A two-tone image is dark on its left half and bright on its right.
            const tone = drawnImage && drawnImage.leftPixel && ((index / 4) % canvas.width) < canvas.width / 2
              ? drawnImage.leftPixel
              : pixel;
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

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

function getCssRgbChannels(value) {
  const channels = String(value || '').match(/[\d.]+/g);
  return channels ? channels.slice(0, 3).map(Number) : [];
}

(async () => {
  const target = createElement();
  const body = createElement();
  body.setAttribute('data-wallpaper-active', 'true');
  const canvas = createCanvas();
  const pendingImages = [];
  const scheduledFrames = new Map();
  let nextFrameId = 0;
  let currentWallpaper = {
    id: 'dark-wallpaper',
    url: 'test://dark-wallpaper'
  };
  let overlayAlpha = 0;
  let overlayLuminance = 1;
  let preferOverlayPolarity = true;
  let extraTargets = [];

  class FakeImage {
    constructor() {
      this.width = 10;
      this.height = 10;
      this.naturalWidth = 10;
      this.naturalHeight = 10;
      this.onload = null;
      this.onerror = null;
      this.pixel = null;
      this.settled = false;
      pendingImages.push(this);
    }

    set src(value) {
      this._src = String(value);
    }

    get src() {
      return this._src;
    }

    decode() {
      return Promise.resolve();
    }

    resolve(pixel, leftPixel) {
      assert.strictEqual(this.settled, false, `image ${this.src} should settle once`);
      this.settled = true;
      this.pixel = pixel;
      this.leftPixel = leftPixel || null;
      this.onload();
    }

    reject() {
      assert.strictEqual(this.settled, false, `image ${this.src} should settle once`);
      this.settled = true;
      this.onerror();
    }
  }

  function getPendingImage(url) {
    const image = pendingImages.find((candidate) => candidate.src === url && !candidate.settled);
    assert.ok(image, `expected a pending image for ${url}`);
    return image;
  }

  const documentObj = {
    body,
    documentElement: {
      clientWidth: 1000,
      clientHeight: 600
    },
    createElement(tagName) {
      return String(tagName).toLowerCase() === 'canvas' ? canvas : createElement();
    }
  };
  const windowObj = {
    innerWidth: 1000,
    innerHeight: 600,
    requestAnimationFrame(callback) {
      const id = ++nextFrameId;
      scheduledFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      scheduledFrames.delete(id);
    }
  };
  const sandbox = {
    console,
    Image: FakeImage,
    Uint8ClampedArray,
    setTimeout,
    clearTimeout
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    moduleScript('src/newtab/wallpaper/wallpaper-adaptive-tone.ts', 'LumnoNewtabWallpaperAdaptiveTone'),
    sandbox,
    { filename: 'src/newtab/wallpaper/wallpaper-adaptive-tone.ts' }
  );

  const readySamplers = [];
  const runtime = sandbox.LumnoNewtabWallpaperAdaptiveTone.createWallpaperAdaptiveTone({
    documentObj,
    windowObj,
    getTargets() {
      return [{
        element: target,
        sampleElement: target,
        minWidth: 42,
        minHeight: 42,
        iconButton: true,
        surface: 'topbar',
        preferOverlayPolarity
      }].concat(extraTargets);
    },
    getCurrentWallpaper() {
      return currentWallpaper;
    },
    getWallpaperImageUrl(wallpaper) {
      return wallpaper.url;
    },
    getOverlayAlphaAtViewportY() {
      return overlayAlpha;
    },
    getOverlayLuminance() {
      return overlayLuminance;
    },
    getEffectLuminanceAtViewport() {
      return null;
    },
    applyWordmarkThemeAppearance() {},
    onSamplerReady(sampler) {
      readySamplers.push(sampler);
    }
  });

  runtime.refresh();
  getPendingImage('test://dark-wallpaper').resolve({ red: 16, green: 24, blue: 32 });
  await flushAsyncWork();
  assert.deepStrictEqual(
    readySamplers.map((sampler) => sampler.url),
    ['test://dark-wallpaper'],
    'each new sampler should be handed out once, so wallpaper.ts can cache a placeholder from it'
  );
  assert.strictEqual(readySamplers[0].canvas, canvas, 'the handed-out sampler should carry its scaled canvas');

  const darkInk = target.getAttribute('data-wallpaper-ink');
  const darkAdaptiveColor = target.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink');
  const darkMistSurface = target.style.getPropertyValue('--x-nt-wallpaper-surface-mist');
  const darkClearSurface = target.style.getPropertyValue('--x-nt-wallpaper-surface-clear');
  assert.strictEqual(darkInk, 'light');
  assert.ok(darkAdaptiveColor, 'the initial wallpaper should apply an adaptive color');
  assert.ok(darkMistSurface, 'the topbar target should receive an adaptive mist surface');
  assert.ok(darkClearSurface, 'the topbar target should receive a protected clear surface');
  assert.notStrictEqual(
    darkMistSurface,
    darkClearSurface,
    'mist and clear surfaces should retain different opacity levels'
  );
  assert.strictEqual(scheduledFrames.size, 1, 'the initial apply should schedule a follow-up sample');
  assert.strictEqual(
    body.style.getPropertyValue('--x-nt-wallpaper-base-color'),
    'rgb(16 24 32)',
    'the page color under the wallpaper should take its mean, so a restored window does not flash'
  );

  currentWallpaper = {
    id: 'middle-wallpaper',
    url: 'test://middle-wallpaper'
  };
  runtime.refresh();

  assert.strictEqual(
    scheduledFrames.size,
    0,
    'starting a replacement sampler should cancel the stale scheduled apply'
  );
  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    darkInk,
    'the previous ink choice should remain while the replacement image is loading'
  );
  assert.strictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink'),
    darkAdaptiveColor,
    'the previous adaptive color should remain while the replacement image is loading'
  );

  runtime.schedule();
  assert.strictEqual(
    scheduledFrames.size,
    0,
    'layout updates should not resample the previous image during a wallpaper transition'
  );

  const staleMiddleImage = getPendingImage('test://middle-wallpaper');
  currentWallpaper = {
    id: 'dark-wallpaper',
    url: 'test://dark-wallpaper'
  };
  runtime.refresh();

  assert.strictEqual(
    pendingImages.filter((image) => image.src === 'test://dark-wallpaper').length,
    1,
    'switching back should reuse the retained sampler instead of loading the previous wallpaper again'
  );
  assert.strictEqual(
    scheduledFrames.size,
    1,
    'switching back should resume sampling from the retained active wallpaper'
  );

  staleMiddleImage.resolve({ red: 150, green: 150, blue: 150 });
  await flushAsyncWork();
  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    darkInk,
    'a canceled replacement load should not overwrite the restored active wallpaper'
  );

  currentWallpaper = {
    id: 'middle-wallpaper',
    url: 'test://middle-wallpaper'
  };
  runtime.refresh();
  getPendingImage('test://middle-wallpaper').resolve({ red: 150, green: 150, blue: 150 });
  await flushAsyncWork();

  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    'dark',
    'a replacement wallpaper should choose fresh ink instead of inheriting the previous wallpaper hysteresis'
  );
  assert.notStrictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink'),
    darkAdaptiveColor,
    'the replacement sampler should overwrite the retained adaptive color'
  );
  assert.notStrictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-surface-mist'),
    darkMistSurface,
    'the replacement sampler should retint the topbar material'
  );

  currentWallpaper = {
    id: 'failed-wallpaper',
    url: 'test://failed-wallpaper'
  };
  runtime.refresh();
  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    'dark',
    'a pending image should retain the last valid tone even if it will later fail'
  );

  getPendingImage('test://failed-wallpaper').reject();
  await flushAsyncWork();

  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    null,
    'a current wallpaper load failure should clear the retained tone'
  );
  assert.strictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink'),
    '',
    'a current wallpaper load failure should restore the theme fallback'
  );
  assert.strictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-surface-mist'),
    '',
    'a current wallpaper load failure should clear the sampled topbar material'
  );
  assert.strictEqual(
    body.style.getPropertyValue('--x-nt-wallpaper-base-color'),
    '',
    'a current wallpaper load failure should hand the page its theme color back'
  );

  body.setAttribute('data-theme', 'dark');
  overlayAlpha = 0.44;
  overlayLuminance = 0;
  currentWallpaper = {
    id: 'bright-wallpaper-with-dark-mask',
    url: 'test://bright-wallpaper-with-dark-mask'
  };
  runtime.refresh();
  getPendingImage('test://bright-wallpaper-with-dark-mask').resolve({
    red: 255,
    green: 255,
    blue: 255
  });
  await flushAsyncWork();

  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    'light',
    'a meaningful black mask should keep the default topbar in the dark-material family'
  );
  const maskedDarkSurfaceChannels = getCssRgbChannels(
    target.style.getPropertyValue('--x-nt-wallpaper-surface-mist')
  );
  assert.strictEqual(maskedDarkSurfaceChannels.length, 3);
  assert.ok(
    Math.max(...maskedDarkSurfaceChannels) < 80,
    'a black mask over a bright wallpaper should produce a dark topbar surface for light text'
  );
  assert.strictEqual(
    body.style.getPropertyValue('--x-nt-wallpaper-base-color'),
    'rgb(143 143 143)',
    'the page color under the wallpaper should include the mask drawn over it'
  );

  body.setAttribute('data-theme', 'light');
  overlayAlpha = 0.54;
  overlayLuminance = 1;
  currentWallpaper = {
    id: 'dark-wallpaper-with-light-mask',
    url: 'test://dark-wallpaper-with-light-mask'
  };
  runtime.refresh();
  getPendingImage('test://dark-wallpaper-with-light-mask').resolve({
    red: 0,
    green: 0,
    blue: 0
  });
  await flushAsyncWork();

  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    'dark',
    'a meaningful white mask should keep the default topbar in the light-material family'
  );
  const maskedLightSurfaceChannels = getCssRgbChannels(
    target.style.getPropertyValue('--x-nt-wallpaper-surface-mist')
  );
  assert.strictEqual(maskedLightSurfaceChannels.length, 3);
  assert.ok(
    Math.min(...maskedLightSurfaceChannels) > 200,
    'a white mask over a dark wallpaper should produce a light topbar surface for dark text'
  );

  preferOverlayPolarity = false;
  body.setAttribute('data-theme', 'dark');
  overlayAlpha = 0.44;
  overlayLuminance = 0;
  currentWallpaper = {
    id: 'bright-wallpaper-under-transparent-topbar',
    url: 'test://bright-wallpaper-under-transparent-topbar'
  };
  runtime.refresh();
  getPendingImage('test://bright-wallpaper-under-transparent-topbar').resolve({
    red: 255,
    green: 255,
    blue: 255
  });
  await flushAsyncWork();

  assert.strictEqual(
    target.getAttribute('data-wallpaper-ink'),
    'dark',
    'a transparent topbar should keep choosing ink from the actually composited background'
  );

  preferOverlayPolarity = false;
  body.setAttribute('data-theme', 'light');
  body.setAttribute('data-wallpaper-effect', 'dither');
  overlayAlpha = 0;
  overlayLuminance = 1;
  currentWallpaper = {
    id: 'mid-tone-textured-wallpaper',
    url: 'test://mid-tone-textured-wallpaper'
  };
  runtime.refresh();
  getPendingImage('test://mid-tone-textured-wallpaper').resolve({
    red: 120,
    green: 120,
    blue: 120
  });
  await flushAsyncWork();

  assert.strictEqual(target.getAttribute('data-wallpaper-ink'), 'light');
  const midToneWordmarkInk = getCssRgbChannels(
    target.style.getPropertyValue('--x-nt-wallpaper-wordmark-ink')
  );
  assert.ok(
    Math.min(...midToneWordmarkInk) > 200,
    'a mid tone where neither extreme reaches the textured contrast floor should keep the light ink family'
  );
  const midToneShadow = target.style.getPropertyValue('--x-nt-wallpaper-wordmark-shadow');
  assert.ok(
    Math.max(...getCssRgbChannels(midToneShadow)) < 40 && / \/ 30%\)$/.test(midToneShadow),
    'light wordmark ink should be backed by a deep, full-strength shadow on a textured mid tone'
  );
  assert.ok(
    / \/ 20%\)$/.test(target.style.getPropertyValue('--x-nt-wallpaper-wordmark-halo')),
    'a textured mid tone should get the full-strength halo'
  );
  assert.strictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-adaptive-shadow'),
    'rgb(15 23 42 / 42%)',
    'light ink at the threshold should not get the weakest shadow'
  );

  body.removeAttribute('data-wallpaper-effect');
  currentWallpaper = {
    id: 'calm-bright-wallpaper',
    url: 'test://calm-bright-wallpaper'
  };
  runtime.refresh();
  getPendingImage('test://calm-bright-wallpaper').resolve({
    red: 236,
    green: 238,
    blue: 240
  });
  await flushAsyncWork();

  assert.strictEqual(target.getAttribute('data-wallpaper-ink'), 'dark');
  const calmWordmarkInk = getCssRgbChannels(
    target.style.getPropertyValue('--x-nt-wallpaper-wordmark-ink')
  );
  assert.ok(Math.max(...calmWordmarkInk) < 160, 'a bright wallpaper should produce dark wordmark ink');
  const calmHaloAlpha = Number(
    (target.style.getPropertyValue('--x-nt-wallpaper-wordmark-halo').match(/\/ ([\d.]+)%/) || [])[1]
  );
  assert.ok(
    target.style.getPropertyValue('--x-nt-wallpaper-wordmark-halo').startsWith('rgb(248 250 252 /') &&
      calmHaloAlpha <= 12,
    'dark wordmark ink on a calm background should only get a faint light halo'
  );
  assert.strictEqual(
    target.style.getPropertyValue('--x-nt-wallpaper-wordmark-shadow'),
    'transparent',
    'dark wordmark ink should not get an offset shadow under its strokes'
  );

  // A caption and its heading read one sample over the box around both, so a
  // heading over the dark half and a caption over the bright half share one ink.
  const heading = createElement({ left: 380, top: 100, right: 480, bottom: 160, width: 100, height: 60 });
  const caption = createElement({ left: 520, top: 170, right: 620, bottom: 200, width: 100, height: 30 });
  const runFrames = () => {
    while (scheduledFrames.size > 0) {
      const [id, callback] = scheduledFrames.entries().next().value;
      scheduledFrames.delete(id);
      callback();
    }
  };
  const captionTargets = (grouped) => [heading, caption].map((element) => ({
    element,
    sampleElement: grouped ? [heading, caption] : element,
    toneGroup: grouped ? 'caption' : '',
    minWidth: 42,
    minHeight: 32
  }));
  scheduledFrames.clear();
  extraTargets = captionTargets(false);
  currentWallpaper = {
    id: 'two-tone-wallpaper',
    url: 'test://two-tone-wallpaper'
  };
  runtime.refresh();
  getPendingImage('test://two-tone-wallpaper').resolve({ red: 236, green: 238, blue: 240 }, { red: 20, green: 24, blue: 30 });
  await flushAsyncWork();
  runFrames();
  assert.notStrictEqual(heading.getAttribute('data-wallpaper-ink'), caption.getAttribute('data-wallpaper-ink'),
    'ungrouped, a heading and caption over opposite halves should take opposite inks');
  extraTargets = captionTargets(true);
  runtime.schedule();
  runFrames();
  assert.strictEqual(caption.getAttribute('data-wallpaper-ink'), heading.getAttribute('data-wallpaper-ink'),
    'a grouped caption should share its heading ink');
  assert.strictEqual(
    caption.style.getPropertyValue('--x-nt-wallpaper-local-luma'),
    heading.style.getPropertyValue('--x-nt-wallpaper-local-luma'),
    'a grouped caption should read the same sample as its heading'
  );
  assert.strictEqual(
    caption.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink'),
    heading.style.getPropertyValue('--x-nt-wallpaper-adaptive-ink'),
    'a grouped caption should share its heading adaptive ink'
  );

  // A clock ink the user fixed holds whatever the sample says and gets that ink's shadow; its
  // caption keeps the sampled ink, and going back to automatic returns to it.
  const sampledInk = heading.getAttribute('data-wallpaper-ink');
  const fixedInk = sampledInk === 'dark' ? 'light' : 'dark';
  extraTargets = captionTargets(true).map((target) => (target.element === heading ? { ...target, ink: fixedInk } : target));
  runtime.schedule();
  runFrames();
  assert.strictEqual(heading.getAttribute('data-wallpaper-ink'), fixedInk, 'a fixed ink should override the sample');
  assert.strictEqual(caption.getAttribute('data-wallpaper-ink'), sampledInk,
    'a grouped caption should keep the sampled ink, not the clock\'s fixed one');
  const fixedWordmarkInk = getCssRgbChannels(heading.style.getPropertyValue('--x-nt-wallpaper-wordmark-ink'));
  assert.ok(fixedInk === 'light' ? Math.min(...fixedWordmarkInk) > 200 : Math.max(...fixedWordmarkInk) < 120,
    `the wordmark ink should be drawn in the fixed ${fixedInk} ink (${fixedWordmarkInk})`);
  assert.strictEqual(
    heading.style.getPropertyValue('--x-nt-wallpaper-wordmark-shadow') === 'transparent',
    fixedInk === 'dark',
    'the wordmark shadow should follow the fixed ink: an offset shadow for light ink, none for dark'
  );
  extraTargets = captionTargets(true);
  runtime.schedule();
  runFrames();
  assert.strictEqual(heading.getAttribute('data-wallpaper-ink'), sampledInk,
    'back to automatic, the clock should take the sampled ink again');

  // A row of icons scrolled partly out of view reads only the icons on screen:
  // one far off the left edge must not drag the sample over the dark half.
  const shownFolder = createElement({ left: 620, top: 500, right: 668, bottom: 548, width: 48, height: 48 });
  const shownAdd = createElement({ left: 720, top: 500, right: 768, bottom: 548, width: 48, height: 48 });
  const scrolledAway = createElement({ left: -1400, top: 500, right: -1352, bottom: 548, width: 48, height: 48 });
  const rowIcons = [scrolledAway, shownFolder, shownAdd];
  extraTargets = rowIcons.map((element) => ({
    element,
    sampleElement: rowIcons,
    toneGroup: 'row',
    minWidth: 42,
    minHeight: 42
  }));
  runtime.schedule();
  runFrames();
  const shownRowLuma = Number(shownFolder.style.getPropertyValue('--x-nt-wallpaper-local-luma'));
  assert.ok(shownRowLuma > 0.8,
    `a row scrolled partly out of view should sample only its shown icons (luma ${shownRowLuma})`);
  assert.strictEqual(shownAdd.getAttribute('data-wallpaper-ink'), 'dark',
    'the shown icons over the bright half should take the dark ink');
  assert.strictEqual(shownAdd.getAttribute('data-wallpaper-ink'), shownFolder.getAttribute('data-wallpaper-ink'),
    'icons in one row should share one ink');
  extraTargets = [];

  // The New Tab reveals its content once the first sample is on the page (whenSettled), and that
  // sample reads the image the preload already decoded instead of loading the file again.
  const settledTarget = createElement();
  let settledWallpaper = { id: 'preloaded-wallpaper', url: 'test://preloaded-wallpaper' };
  const preloadedRequests = [];
  let resolvePreloaded = null;
  const preloadedImages = new Map([
    ['test://preloaded-wallpaper', new Promise((resolve) => { resolvePreloaded = resolve; })],
    ['test://preload-missing', Promise.resolve(null)]
  ]);
  const settledRuntime = sandbox.LumnoNewtabWallpaperAdaptiveTone.createWallpaperAdaptiveTone({
    documentObj,
    windowObj,
    getTargets: () => [{ element: settledTarget, sampleElement: settledTarget, minWidth: 42, minHeight: 42, iconButton: true }],
    getCurrentWallpaper: () => settledWallpaper,
    getWallpaperImageUrl: (wallpaper) => wallpaper.url,
    getWallpaperSample: (wallpaper) => (wallpaper.sampleUrl ? { url: wallpaper.sampleUrl, width: 2048, height: 1152 } : null),
    getPreloadedImage(url) {
      preloadedRequests.push(url);
      return preloadedImages.get(url) || null;
    }
  });
  let settled = false;
  await settledRuntime.whenSettled();
  settledRuntime.refresh();
  settledRuntime.whenSettled().then(() => { settled = true; });
  await flushAsyncWork();
  assert.deepStrictEqual(preloadedRequests, ['test://preloaded-wallpaper']);
  assert.strictEqual(settled, false, 'the reveal waits while the wallpaper image is still decoding');
  assert.strictEqual(pendingImages.some((image) => image.src === 'test://preloaded-wallpaper'), false,
    'a preloaded image is never loaded a second time');
  resolvePreloaded({ width: 10, height: 10, naturalWidth: 10, naturalHeight: 10, pixel: { red: 16, green: 24, blue: 32 } });
  await flushAsyncWork();
  assert.strictEqual(settled, true, 'the first sample settles the wait');
  assert.strictEqual(settledTarget.getAttribute('data-wallpaper-ink'), 'light',
    'the controls carry the wallpaper tones by the time the wait settles');

  settledWallpaper = { id: 'preload-missing', url: 'test://preload-missing' };
  settledRuntime.refresh();
  settled = false;
  settledRuntime.whenSettled().then(() => { settled = true; });
  await flushAsyncWork();
  getPendingImage('test://preload-missing').resolve({ red: 236, green: 238, blue: 240 });
  await flushAsyncWork();
  assert.strictEqual(settled, true, 'without a preloaded image the sampler loads the file itself');

  settledWallpaper = { id: 'broken-wallpaper', url: 'test://broken-wallpaper' };
  settledRuntime.refresh();
  settled = false;
  settledRuntime.whenSettled().then(() => { settled = true; });
  getPendingImage('test://broken-wallpaper').reject();
  await flushAsyncWork();
  assert.strictEqual(settled, true, 'a wallpaper that fails to load never holds the page');

  // A wallpaper with a small copy samples that copy, and the full image only if the copy fails.
  settledWallpaper = { id: 'thumbed', url: 'test://thumbed-full', sampleUrl: 'test://thumbed-small' };
  settledRuntime.refresh();
  settled = false;
  settledRuntime.whenSettled().then(() => { settled = true; });
  await flushAsyncWork();
  getPendingImage('test://thumbed-small').resolve({ red: 16, green: 24, blue: 32 });
  await flushAsyncWork();
  assert.strictEqual(settled, true, 'the small copy settles the wait');
  assert.strictEqual(pendingImages.some((image) => image.src === 'test://thumbed-full'), false,
    'the full image is never decoded for a sample when a small copy exists');

  settledWallpaper = { id: 'thumb-broken', url: 'test://thumb-broken-full', sampleUrl: 'test://thumb-broken-small' };
  settledRuntime.refresh();
  settled = false;
  settledRuntime.whenSettled().then(() => { settled = true; });
  await flushAsyncWork();
  getPendingImage('test://thumb-broken-small').reject();
  await flushAsyncWork();
  assert.strictEqual(settled, false, 'a small copy that fails falls back to the full image');
  getPendingImage('test://thumb-broken-full').resolve({ red: 236, green: 238, blue: 240 });
  await flushAsyncWork();
  assert.strictEqual(settled, true);

  settledWallpaper = null;
  settledRuntime.refresh();
  await settledRuntime.whenSettled();

  console.log('new tab wallpaper adaptive tone transition tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
