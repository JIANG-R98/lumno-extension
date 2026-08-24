const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const sandbox = {
  globalThis: null
};
sandbox.globalThis = sandbox;

vm.runInNewContext(fs.readFileSync('src/newtab/wallpaper-effects.js', 'utf8'), sandbox, {
  filename: 'src/newtab/wallpaper-effects.js'
});

const effects = sandbox.LumnoNewtabWallpaperEffects;
assert.ok(effects, 'wallpaper effects module should initialize');
assert.strictEqual(typeof effects.analyzeImageData, 'function');
assert.strictEqual(typeof effects.getEffectCanvasScale, 'function');
assert.ok(effects.EFFECT_TYPES.includes('dither'), 'Dither should be a supported wallpaper effect');
assert.strictEqual(typeof effects.quantizeDitherColor, 'function');
assert.strictEqual(typeof effects.liftSampleColor, 'function');

const warmSample = effects.liftSampleColor(
  { red: 180, green: 90, blue: 30 },
  0.4,
  0.2
);
assert.ok(
  warmSample.red > 180 && warmSample.red > warmSample.green && warmSample.green > warmSample.blue,
  'sampled warm hues should stay warm while becoming brighter'
);
const coolSample = effects.liftSampleColor(
  { red: 40, green: 90, blue: 160 },
  0.4,
  0.2
);
assert.ok(
  coolSample.blue > 160 && coolSample.blue > coolSample.green && coolSample.green > coolSample.red,
  'sampled cool hues should stay cool while becoming brighter'
);
const neutralSample = effects.liftSampleColor(
  { red: 80, green: 80, blue: 80 },
  0.4,
  0.2
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(neutralSample)),
  { red: 150, green: 150, blue: 150 },
  'neutral wallpaper samples should brighten without gaining a color cast'
);

const darkProfile = effects.analyzeImageData([
  10, 20, 30, 255,
  30, 40, 50, 255
]);
assert.ok(darkProfile.averageLuminance < 0.2, 'dark wallpaper samples should remain dark');
assert.ok(darkProfile.lowLuminance <= darkProfile.highLuminance);
assert.strictEqual(
  darkProfile.useDarkInk,
  false,
  'dark wallpapers should use luminous characters over the retained image'
);

const lightProfile = effects.analyzeImageData([
  238, 242, 248, 255,
  250, 246, 240, 255
]);
assert.ok(lightProfile.averageLuminance > 0.9, 'light wallpaper samples should remain light');
assert.ok(lightProfile.lowLuminance > 0.9, 'light wallpaper percentiles should retain their tonal range');
assert.strictEqual(
  lightProfile.useDarkInk,
  true,
  'light wallpapers should use dark characters over the retained image'
);

const transparentProfile = effects.analyzeImageData([
  0, 0, 0, 0
]);
assert.ok(
  transparentProfile.averageLuminance > 0.99,
  'transparent source pixels should be composited against white like the sampler'
);
assert.strictEqual(transparentProfile.useDarkInk, true);

const fallbackProfile = effects.analyzeImageData(null);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(fallbackProfile)),
  {
    averageLuminance: 0.5,
    lowLuminance: 0.1,
    highLuminance: 0.9,
    useDarkInk: false
  }
);

assert.ok(
  effects.getEffectCanvasScale(2, 1920, 1080) > 1.4,
  'common desktop viewports should receive supersampled effect layers'
);
assert.ok(
  effects.getEffectCanvasScale(2, 2560, 1440) > 1,
  'large desktop canvases should stay above CSS-pixel resolution while respecting the target budget'
);
assert.strictEqual(
  effects.getEffectCanvasScale(3, 390, 844),
  1.6,
  'small mobile canvases should use the configured supersampling ceiling'
);
assert.strictEqual(
  effects.getEffectCanvasScale(2, 5120, 2880),
  1,
  'very large viewports should never be upscaled from a sub-CSS-pixel backing buffer'
);

const normalized = effects.normalizePrefs({
  type: 'ascii',
  inkTone: 'light',
  strength: 140,
  size: -4,
  spacing: 60,
  // Legacy stored values may still contain this removed preference.
  hover: false
});
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(normalized)),
  {
    version: 4,
    type: 'ascii',
    inkTone: 'light',
    strength: 100,
    size: 0,
    spacing: 60
  }
);
assert.strictEqual(effects.resolveUseDarkInk('dark', { useDarkInk: false }), true);
assert.strictEqual(effects.resolveUseDarkInk('light', { useDarkInk: true }), false);
assert.strictEqual(
  effects.resolveUseDarkInk('auto', { useDarkInk: true }),
  true,
  'legacy automatic tone should continue following wallpaper luminance'
);
assert.strictEqual(
  effects.normalizePrefs({ inkTone: 'unknown' }).inkTone,
  'auto',
  'unknown stored ink tones should fall back to the legacy automatic behavior'
);

const brightDitherSample = effects.quantizeDitherColor(
  { red: 100, green: 150, blue: 200 },
  0.1,
  4,
  1
);
const darkDitherSample = effects.quantizeDitherColor(
  { red: 100, green: 150, blue: 200 },
  0.9,
  4,
  1
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(brightDitherSample)),
  { red: 170, green: 170, blue: 255 },
  'low Bayer thresholds should promote channels to the next palette level'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(darkDitherSample)),
  { red: 85, green: 85, blue: 170 },
  'high Bayer thresholds should retain the lower palette level'
);
assert.strictEqual(
  effects.normalizePrefs({ type: 'dither' }).type,
  'dither',
  'stored Dither preferences should survive normalization'
);

const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
assert.match(
  newtabHtml,
  /body\[data-wallpaper-active="true"\]\[data-wallpaper-effect="halftone"\]::after,\s*body\[data-wallpaper-active="true"\]\[data-wallpaper-effect="ascii"\]::after\s*\{[\s\S]*?opacity:\s*0;/,
  'halftone and ASCII should render as transparent layers above the existing wallpaper'
);
assert.doesNotMatch(
  newtabHtml,
  /body\[data-wallpaper-active="true"\]\[data-wallpaper-effect="(?:halftone|ascii)"\]\s*\{[^}]*--x-nt-wallpaper-image:\s*none;/,
  'layered effects should keep the CSS wallpaper visible instead of repainting it into the canvas'
);
assert.match(
  newtabHtml,
  /\.x-nt-wallpaper-effect-canvas\[data-resize-enter="true"\],\s*\.x-nt-wallpaper-effect-canvas\[data-resize-exit="true"\]\s*\{\s*opacity:\s*0 !important;/,
  'resized wallpaper effects should expose enter and exit states for an opacity crossfade'
);
assert.match(
  newtabHtml,
  /\.x-nt-wallpaper-effect-canvas\[data-resize-jump="true"\]\s*\{\s*transition:\s*none !important;/,
  'the resized destination canvas should be hidden without animating before its crossfade'
);

const effectsSource = fs.readFileSync('src/newtab/wallpaper-effects.js', 'utf8');
const wallpaperSource = fs.readFileSync('src/newtab/wallpaper.js', 'utf8');
const wallpaperPreloadSource = fs.readFileSync('src/newtab/wallpaper-preload.js', 'utf8');
const effectPreloadSource = fs.readFileSync('src/newtab/wallpaper-effect-preload.js', 'utf8');
vm.runInNewContext(wallpaperSource, sandbox, {
  filename: 'src/newtab/wallpaper.js'
});
const wallpaper = sandbox.LumnoNewtabWallpaper;
assert.ok(wallpaper, 'wallpaper runtime module should initialize');
assert.strictEqual(
  wallpaper.WALLPAPER_EFFECT_MODE_STORAGE_VERSION,
  4,
  'mode-aware wallpaper effect storage should have an explicit schema version'
);
const legacyEffectPrefs = {
  version: 3,
  type: 'grain',
  strength: 64,
  size: 35,
  spacing: 72
};
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(wallpaper.normalizeWallpaperEffectStoragePrefs(legacyEffectPrefs))),
  {
    version: 4,
    light: { version: 4, type: 'grain', inkTone: 'auto', strength: 64, size: 35, spacing: 72 },
    dark: { version: 4, type: 'grain', inkTone: 'auto', strength: 64, size: 35, spacing: 72 }
  },
  'legacy shared wallpaper effects should migrate to identical light and dark preferences'
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(wallpaper.normalizeWallpaperEffectStoragePrefs({
    version: 4,
    light: { type: 'halftone', strength: 31, size: 42, spacing: 53 },
    dark: { type: 'ascii', strength: 82, size: 73, spacing: 64 }
  }))),
  {
    version: 4,
    light: { version: 4, type: 'halftone', inkTone: 'auto', strength: 31, size: 42, spacing: 53 },
    dark: { version: 4, type: 'ascii', inkTone: 'auto', strength: 82, size: 73, spacing: 64 }
  },
  'mode-aware wallpaper effects should preserve independent light and dark values'
);
assert.match(
  effectsSource,
  /function drawCachedLayeredEffect\([\s\S]*?effectBaseCacheKey !== cacheKey[\s\S]*?drawLayer\(context,[\s\S]*?effectBaseCacheKey = cacheKey;/,
  'layered wallpaper filters should cache their high-resolution static canvas'
);
assert.match(
  effectsSource,
  /function drawDitherLayer\([\s\S]*?BAYER_4X4[\s\S]*?quantizeDitherColor[\s\S]*?putImageData/,
  'Dither should use a deterministic Bayer matrix and palette quantization'
);
assert.match(
  effectsSource,
  /function drawHalftoneLayer\([\s\S]*?liftSampleColor\(/,
  'halftone dots should retain locally sampled wallpaper hues'
);
assert.match(
  effectsSource,
  /function drawAsciiLayer\([\s\S]*?liftSampleColor\(/,
  'ASCII glyphs should retain locally sampled wallpaper hues'
);
assert.doesNotMatch(
  effectsSource,
  /shiftSampleColor|getCurvedEffectColor/,
  'halftone and ASCII colors should not be pushed toward monochrome ink'
);
assert.match(
  effectsSource,
  /shouldCrossfadeResize\s*=\s*Boolean\([\s\S]*?normalized\.type === 'dither'/,
  'Dither should crossfade its cached canvas after viewport resizing'
);
assert.match(
  effectsSource,
  /previousPrefs\.inkTone !== prefs\.inkTone/,
  'changing dot or ASCII color should invalidate and rerender the cached effect layer'
);
assert.match(
  effectsSource,
  /function prepareResizeCrossfade\(\)[\s\S]*?snapshotContext\.drawImage\(canvas,\s*0,\s*0\)[\s\S]*?data-resize-enter/,
  'resize rendering should preserve the existing halftone or ASCII frame before replacing it'
);
assert.match(
  effectsSource,
  /function finishResizeCrossfade\(\)[\s\S]*?requestFrame\([\s\S]*?data-resize-enter[\s\S]*?data-resize-exit/,
  'the old and new effect canvases should crossfade on separate animation frames'
);
assert.match(
  effectsSource,
  /windowObj\.addEventListener\('resize',[\s\S]*?shouldCrossfadeResize\s*=\s*Boolean\([\s\S]*?normalized\.type === 'halftone'[\s\S]*?normalized\.type === 'ascii'[\s\S]*?scheduleRender\(RESIZE_RENDER_SETTLE_MS\)/,
  'viewport resize settling should opt halftone and ASCII renders into the crossfade'
);
assert.doesNotMatch(
  newtabHtml,
  /x-nt-wallpaper-effect-hover-canvas/,
  'new tab styles should not retain the removed wallpaper hover canvas'
);
assert.doesNotMatch(
  effectsSource,
  /pointermove|pointerleave|hoverPointer|hoverContext|prefs\.hover/,
  'wallpaper filters should not bind pointer-driven hover rendering'
);
assert.doesNotMatch(
  wallpaperSource,
  /newtab_wallpaper_effect_hover|wallpaperEffectHover|createEffectToggleControl/,
  'wallpaper settings should not render or localize a hover-effect control'
);
assert.match(
  wallpaperSource,
  /currentWallpaperPrefs && currentWallpaperPrefs\.sameForModes === false[\s\S]*?\\? \[editMode\][\s\S]*?: NEWTAB_WALLPAPER_MODES/,
  'split wallpapers should save effects only to the mode currently being edited'
);
assert.match(
  wallpaperSource,
  /function handleThemeModeChange\([\s\S]*?applyWallpaperEffectForResolvedMode\(\)/,
  'theme changes should apply the effect stored for the resolved wallpaper mode'
);
assert.match(
  effectsSource,
  /visualPrefsChanged && previousType === prefs\.type[\s\S]*?scheduleRender\(PARAMETER_RENDER_DEBOUNCE_MS\)/,
  'continuous parameter input should debounce expensive full-layer renders'
);
assert.match(
  effectsSource,
  /function refresh\(options\)[\s\S]*?return waitForRenderRevision\(scheduleRender/,
  'wallpaper effect refreshes should expose render completion for first-paint gating'
);
assert.match(
  wallpaperSource,
  /function waitForInitialWallpaperEffectVisual\(\)[\s\S]*?initialWallpaperReadyPromise[\s\S]*?wallpaperEffects\.refresh\(\{ immediate: true \}\)/,
  'the New Tab should wait for the selected wallpaper effect to render before becoming ready'
);
assert.ok(
  newtabHtml.indexOf('<script src="wallpaper-effects.js"></script>') <
    newtabHtml.indexOf('<script src="wallpaper-preload.js"></script>'),
  'the wallpaper effect renderer should load before the head preload fast path'
);
assert.ok(
  newtabHtml.indexOf('<script src="wallpaper-effect-preload.js"></script>') <
    newtabHtml.indexOf('<div id="_x_extension_newtab_root_2024_unique_"'),
  'the focused-route wallpaper effect should start before New Tab content bootstraps'
);
assert.match(
  wallpaperSource,
  /wallpaperEffects:\s*getWallpaperEffectStorageValue\(\)/,
  'the synchronous wallpaper preload cache should retain the current mode-aware effect'
);
assert.match(
  wallpaperSource,
  /wallpaperEffectPreload && wallpaperEffectPreload\.controller[\s\S]*?wallpaperEffects = wallpaperEffectPreload\.controller/,
  'the full wallpaper runtime should adopt the early effect canvas instead of repainting it'
);
assert.match(
  wallpaperPreloadSource,
  /effectPrefsReady:\s*readStoredEffectPrefs\(cachedWallpaper\.mode, cachedWallpaper\.effectPrefs\)/,
  'the head preload should use cached effect preferences and fall back to an early storage read'
);

function createFakeCanvas() {
  const attributes = new Map();
  const context = {
    setTransform() {},
    clearRect() {},
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData() {},
    createPattern() {
      return {};
    },
    fillRect() {}
  };
  return {
    className: '',
    height: 0,
    parentNode: null,
    style: {},
    width: 0,
    getAttribute(name) {
      return attributes.get(name) || null;
    },
    getContext() {
      return context;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    }
  };
}

async function testEffectRefreshWaitsForPaint() {
  const bodyAttributes = new Map([['data-wallpaper-active', 'true']]);
  const createdCanvases = [];
  const body = {
    firstChild: null,
    getAttribute(name) {
      return bodyAttributes.get(name) || null;
    },
    insertBefore(element) {
      element.parentNode = this;
      this.firstChild = element;
    }
  };
  const documentObj = {
    body,
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    createElement() {
      const canvas = createFakeCanvas();
      createdCanvases.push(canvas);
      return canvas;
    }
  };
  const windowObj = {
    devicePixelRatio: 1,
    innerHeight: 800,
    innerWidth: 1200,
    addEventListener() {},
    cancelAnimationFrame: clearTimeout,
    requestAnimationFrame(callback) {
      return setTimeout(callback, 0);
    }
  };
  const controller = effects.createWallpaperEffects({
    documentObj,
    windowObj,
    getCurrentWallpaper: () => ({ id: 'test-wallpaper' }),
    getWallpaperImageUrl: () => '',
    shouldAnimateTransition: () => false
  });
  controller.apply({ type: 'grain', strength: 50, size: 50, spacing: 50 });
  await controller.refresh({ immediate: true });
  assert.strictEqual(createdCanvases[0].getAttribute('data-effect'), 'grain');
  assert.notStrictEqual(createdCanvases[0].style.opacity, '0');
}

async function testFocusedRoutePreloadsEffectBeforeContent() {
  const attributes = new Map();
  const body = {
    setAttribute(name, value) {
      attributes.set(name, String(value));
    }
  };
  const appliedPrefs = [];
  const controller = {
    apply(prefs) {
      appliedPrefs.push(prefs);
    },
    refresh() {
      return Promise.resolve();
    }
  };
  const preloadSandbox = {
    console,
    document: {
      body,
      documentElement: {
        getAttribute(name) {
          return name === 'data-nt-focus-route' ? 'true' : null;
        }
      }
    },
    LumnoNewtabWallpaperEffects: {
      createWallpaperEffects() {
        return controller;
      },
      normalizePrefs(value) {
        return value;
      }
    },
    LumnoNewtabWallpaperPreload: {
      effectPrefsReady: Promise.resolve({ type: 'grain', strength: 50, size: 50, spacing: 50 }),
      imageUrl: 'chrome-extension://abc/assets/wallpapers/test.webp',
      wallpaper: { id: 'test-wallpaper' }
    },
    window: {}
  };
  preloadSandbox.globalThis = preloadSandbox;
  vm.runInNewContext(effectPreloadSource, preloadSandbox, {
    filename: 'src/newtab/wallpaper-effect-preload.js'
  });
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(appliedPrefs.length, 1);
  assert.strictEqual(attributes.get('data-wallpaper-effect'), 'grain');
  assert.strictEqual(attributes.get('data-nt-wallpaper-ready'), '1');
  assert.strictEqual(preloadSandbox.LumnoNewtabWallpaperEffectPreload.controller, controller);
}

Promise.all([
  testEffectRefreshWaitsForPaint(),
  testFocusedRoutePreloadsEffectBeforeContent()
]).then(() => {
  process.stdout.write('new tab wallpaper effects tests passed\n');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
