// The New Tab's visible order: the wallpaper first, then the content entering.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readStylesheet } = require('../helpers/css-tokens');
const { readNewtabRuntimeSource } = require('../helpers/newtab-source');

const repoRoot = path.resolve(__dirname, '..', '..');
const entryMotionSource = fs.readFileSync(path.join(repoRoot, 'src/newtab/entry-motion.js'), 'utf8');
const effectPreloadSource = fs.readFileSync(path.join(repoRoot, 'src/newtab/wallpaper/wallpaper-effect-preload.js'), 'utf8');
const newtabSource = readNewtabRuntimeSource();
const newtabCss = readStylesheet('src/newtab/newtab.css');
const glassCss = readStylesheet('src/newtab/glass-style.css');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createElement() {
  const attributes = new Map();
  return {
    attributes,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name)
  };
}

function createEntryMotion({ wallpaperActive, wallpaperShownAgoMs, focusResume }) {
  const body = createElement();
  const root = createElement();
  const documentElement = createElement();
  if (focusResume) {
    documentElement.setAttribute('data-nt-focus-resume', 'true');
  }
  if (wallpaperActive) {
    body.setAttribute('data-wallpaper-active', 'true');
  }
  const pageState = {
    newtabReadyRequested: false,
    newtabReadyViewportRevision: 0,
    newtabResizeLayoutLocked: false,
    resolveNewtabEntryAnimationReady: null,
    wallpaperShownAt: wallpaperShownAgoMs === null ? 0 : performance.now() - wallpaperShownAgoMs
  };
  const sandbox = {
    document: { body, documentElement },
    window: { setTimeout, clearTimeout },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    performance,
    globalThis: null
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(entryMotionSource, sandbox, { filename: 'src/newtab/entry-motion.js' });
  const viewport = { width: 1280, height: 800 };
  const motion = sandbox.LumnoNewtabEntryMotion.createEntryMotion({
    root,
    pageState,
    shouldSkipNewtabEntryMotion: () => false,
    updateBookmarkSectionPosition() {},
    finishWordmarkEntryAnimation() {},
    markNewtabStartupMilestone() {},
    rememberSearchEntryViewport() {},
    getSearchEntryViewportSnapshot: () => viewport,
    hasSearchEntryViewportChanged: () => false
  });
  return { body, motion, pageState };
}

async function testContentWaitsForTheWallpaperLead() {
  const fresh = createEntryMotion({ wallpaperActive: true, wallpaperShownAgoMs: 0 });
  fresh.motion.markNewtabReady();
  await delay(20);
  assert.strictEqual(fresh.body.getAttribute('data-nt-ready'), null,
    'content shown right after the wallpaper waits, so the two never land in one moment');
  assert.strictEqual(fresh.pageState.newtabReadyRequested, false);
  fresh.motion.markNewtabReady();
  await delay(80);
  assert.strictEqual(fresh.body.getAttribute('data-nt-ready'), '1', 'the content enters once the wallpaper has led');
  assert.strictEqual(fresh.body.getAttribute('data-nt-enter'), 'run');

  const settled = createEntryMotion({ wallpaperActive: true, wallpaperShownAgoMs: 400 });
  settled.motion.markNewtabReady();
  await delay(5);
  assert.strictEqual(settled.body.getAttribute('data-nt-ready'), '1',
    'a wallpaper that showed long ago adds no wait');

  const plain = createEntryMotion({ wallpaperActive: false, wallpaperShownAgoMs: 0 });
  plain.motion.markNewtabReady();
  await delay(5);
  assert.strictEqual(plain.body.getAttribute('data-nt-ready'), '1', 'without a wallpaper nothing has to lead');

  const resumed = createEntryMotion({ wallpaperActive: true, wallpaperShownAgoMs: 0, focusResume: true });
  resumed.motion.markNewtabReady();
  await delay(5);
  assert.strictEqual(resumed.body.getAttribute('data-nt-ready'), '1',
    'the search shortcut reload holds the old page until this one is ready, so it skips the lead');

  const unknown = createEntryMotion({ wallpaperActive: true, wallpaperShownAgoMs: null });
  unknown.motion.markNewtabReady();
  await delay(5);
  assert.strictEqual(unknown.body.getAttribute('data-nt-ready'), '1');
}

async function testEffectPreloadRecordsWhenTheWallpaperShowed() {
  const body = createElement();
  const sandbox = {
    document: { documentElement: createElement(), body },
    window: {},
    performance,
    LumnoNewtabWallpaperEffects: {
      createWallpaperEffects: () => ({ apply() {}, refresh: () => Promise.resolve() }),
      resolvePrefsForMode: () => ({ type: 'none' })
    },
    LumnoNewtabWallpaperPreload: {
      effectPrefsReady: Promise.resolve({ type: 'none' }),
      imageUrl: 'chrome-extension://abc/assets/wallpapers/test.webp',
      wallpaper: { id: 'test' }
    },
    globalThis: null
  };
  sandbox.globalThis = sandbox;
  const before = performance.now();
  vm.runInNewContext(effectPreloadSource, sandbox, { filename: 'src/newtab/wallpaper/wallpaper-effect-preload.js' });
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(body.getAttribute('data-nt-wallpaper-ready'), '1');
  const shownAt = sandbox.LumnoNewtabWallpaperEffectPreload.wallpaperShownAt;
  assert.ok(shownAt >= before && shownAt <= performance.now(), 'the reveal time is what the entry measures its lead from');
}

function testRevealWaitsForTheWallpaperTones() {
  assert.match(
    newtabSource,
    /observeNewtabStartupTask\('wallpaper-tone', waitForInitialWallpaperTone\(\)\);\s*\}\)\.then\(\(\) => \{\s*maybeShowFileAccessNotice\(\);\s*markNewtabReady\(\);/,
    'the content is revealed only after the first wallpaper sample has tinted its controls'
  );
  assert.match(
    newtabSource,
    /function markInitialWallpaperVisualReady\(\)[\s\S]*?wallpaperShownAt = performance\.now\(\);[\s\S]*?effectPreload\.wallpaperShownAt/,
    'the runtime remembers when the wallpaper showed, taking the preload\'s time when it revealed it'
  );
}

function testSampledColorsSnapUntilTheEntryIsDone() {
  assert.match(newtabCss, /body:not\(\[data-nt-enter="done"\]\) \.x-nt-shortcut-icon \{\s*transition: none;\s*\}/,
    'the add tile takes its sampled color at once instead of fading through the wallpaper\'s gray');
  assert.match(glassCss,
    /body\[data-glass-style\]:not\(\[data-nt-enter="done"\]\) :is\(\.x-nt-shortcut-icon, \.x-nt-shortcut-group-header\) \{\s*transition: none;\s*\}/,
    'glass shortcut plates take their sampled tint at once during the entry too');
}

function testNoBlurredStandInForTheWallpaper() {
  ['--x-nt-wallpaper-placeholder', '--x-nt-wallpaper-backdrop', 'data-wallpaper-placeholder'].forEach((name) => {
    assert.ok(!newtabCss.includes(name), `the New Tab never shows a blurred copy of its wallpaper (${name})`);
  });
}

function testNothingBlursTheWallpaperBeforeTheReveal() {
  assert.match(newtabCss,
    /body:not\(\[data-nt-ready="1"\]\) :is\(\*, #_x_extension_newtab_root_2024_unique_\),\s*body:not\(\[data-nt-ready="1"\]\) :is\(\*, #_x_extension_newtab_root_2024_unique_\)::before,\s*body:not\(\[data-nt-ready="1"\]\) :is\(\*, #_x_extension_newtab_root_2024_unique_\)::after \{\s*backdrop-filter: none !important;\s*-webkit-backdrop-filter: none !important;/,
    'hidden cards must not show their blur over the wallpaper before the page is revealed');
}

(async () => {
  testNoBlurredStandInForTheWallpaper();
  testNothingBlursTheWallpaperBeforeTheReveal();
  await testContentWaitsForTheWallpaperLead();
  await testEffectPreloadRecordsWhenTheWallpaperShowed();
  testRevealWaitsForTheWallpaperTones();
  testSampledColorsSnapUntilTheEntryIsDone();
  console.log('newtab entry wallpaper lead tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
