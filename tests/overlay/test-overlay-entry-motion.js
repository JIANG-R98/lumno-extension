const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseCss } = require('../helpers/css-rules');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// How the real overlay enters and lays itself out: the Web Animations it
// plays for each entry setting, when it skips them, the state it rests in,
// its shell styles and its corner radii with and without results.

const repoRoot = path.resolve(__dirname, '..', '..');
const MOTION_KEY = '_x_extension_motion_effects_enabled_2026_unique_';
const ANIMATION_KEY = '_x_extension_overlay_enter_animation_2026_unique_';
const OPEN_TABS_VISIBLE_KEY = '_x_extension_overlay_open_tabs_default_visible_2026_unique_';
const THEME_KEY = '_x_extension_theme_mode_2024_unique_';
const OVERLAY_ID = '_x_extension_overlay_2024_unique_';
const ELASTIC_REST = 'translateX(-50%) translateY(0) scale(var(--x-ov-visible-scale, 1)) scaleX(1)';
const FADE_REST = 'translateX(-50%) translateY(0) scale(var(--x-ov-visible-scale, 1)) scale(1)';

// The overlay skips its entry when it starts more than 280ms after the open
// was asked for, and a busy test machine can take that long on its own. Cases
// that check which motion plays stop the page's clock, so the start always
// looks instant; the slow-start case keeps the real time.
async function openWithMotion(settings, options, stopClock = false) {
  const page = await createOverlayPage(Object.assign({
    settings: Object.assign({ [MOTION_KEY]: true }, settings),
    stylesheetsLoad: true,
    recordAnimations: true
  }, options || {}));
  if (stopClock) {
    const stoppedAt = page.window.Date.now();
    page.window.Date.now = () => stoppedAt;
  }
  const root = await page.open({ openedAt: page.window.Date.now() });
  await page.settle(80);
  return { page, root, overlay: root.getElementById(OVERLAY_ID) };
}

function entryAnimations(page, overlay) {
  const onPanel = page.animations.filter((animation) => animation.target === overlay);
  return {
    transform: onPanel.find((animation) => animation.keyframes.some((frame) => 'transform' in frame)),
    opacity: onPanel.find((animation) => animation.keyframes.some((frame) => 'opacity' in frame))
  };
}

async function testEachEntrySettingPlaysItsMotion() {
  const cases = [
    [{}, 'translateY(12px) scaleX(0.88)', 210, 'cubic-bezier(0.18, 1.32, 0.32, 1)', 130, ELASTIC_REST],
    [{ [OPEN_TABS_VISIBLE_KEY]: true }, 'translateY(12px) scaleX(0.94)', 210, 'cubic-bezier(0.18, 1.32, 0.32, 1)', 130, ELASTIC_REST],
    [{ [ANIMATION_KEY]: 'fade' }, 'translateY(16px) scale(0.985)', 340, 'cubic-bezier(0.2, 1, 0.36, 1)', 220, FADE_REST]
  ];
  for (const [settings, startDelta, duration, easing, opacityDuration, rest] of cases) {
    const label = JSON.stringify(settings);
    const { page, overlay } = await openWithMotion(settings, null, true);
    await page.waitFor(() => {
      const started = entryAnimations(page, overlay);
      return started.transform && started.opacity;
    }, `${label} should animate the panel`);
    const { transform, opacity } = entryAnimations(page, overlay);
    assert.deepStrictEqual(transform.keyframes, [{ transform: startDelta }, { transform: 'none' }], `${label} entry delta`);
    assert.deepStrictEqual(
      [transform.options.composite, transform.options.fill, transform.options.duration, transform.options.easing],
      ['add', 'backwards', duration, easing],
      `${label} should add its motion on top of the centering transform`
    );
    assert.deepStrictEqual(opacity.keyframes, [{ opacity: 0 }, { opacity: 1 }]);
    assert.strictEqual(opacity.options.duration, opacityDuration);
    assert.strictEqual(overlay.style.getPropertyValue('transform'), rest, 'the panel should sit in its final, centered transform while animating');
    assert.strictEqual(overlay.style.getPropertyValue('will-change'), 'transform, opacity');
    assert.ok(!page.animations.some((animation) => animation.keyframes.some((frame) => 'filter' in frame)),
      'the backdrop-filtered panel should never animate filter');
    assert.strictEqual(overlay.style.getPropertyValue('zoom'), '');

    transform.finish();
    await page.settle(20);
    assert.strictEqual(overlay.style.getPropertyValue('will-change'), 'auto', 'finishing should release the compositor hint');
    assert.deepStrictEqual([overlay.style.getPropertyValue('opacity'), overlay.style.getPropertyPriority('opacity')], ['1', 'important']);
    assert.strictEqual(overlay.style.getPropertyValue('transform'), rest);
    assert.strictEqual(overlay.style.getPropertyValue('transition'), '');
    page.close();
  }
}

async function testEntryMotionIsSkippedWhenItWouldStutter() {
  const assertInstant = async (label, settings, options) => {
    const { page, overlay } = await openWithMotion(settings, options);
    assert.deepStrictEqual(page.animations.filter((animation) => animation.target === overlay), [], `${label}: no entry animation`);
    assert.deepStrictEqual([overlay.style.getPropertyValue('opacity'), overlay.style.getPropertyPriority('opacity')], ['1', 'important']);
    assert.strictEqual(overlay.style.getPropertyValue('transform'), ELASTIC_REST);
    assert.strictEqual(page.root().activeElement, page.input(), `${label}: the input should still take focus`);
    page.close();
  };
  await assertInstant('motion effects off', { [MOTION_KEY]: false });
  await assertInstant('stylesheets still loading', {}, { stylesheetsLoad: false });
  await assertInstant('a slow start', {}, { storageDelayMs: 320 });
}

// The shell's own rest state is covered by src/overlay/react/shell.test.tsx.
async function testThemeElevation() {
  const { page, overlay } = await openWithMotion({});
  const lightShadow = overlay.style.getPropertyValue('--x-ov-shadow');
  assert.ok(lightShadow, 'the light theme should set the panel elevation');
  assert.strictEqual(overlay.style.getPropertyValue('--x-ov-blur'), '14px');

  page.changeSetting(THEME_KEY, 'dark');
  await page.settle();
  const darkShadow = overlay.style.getPropertyValue('--x-ov-shadow');
  assert.notStrictEqual(darkShadow, lightShadow, 'dark mode should have its own elevation');
  assert.ok((darkShadow.match(/rgba\(\d+, \d+, \d+/g) || []).every((color) => /rgba\((0, 0, 0|255, 255, 255)/.test(color)),
    'the dark elevation should stay neutral, without a colored glow');
  assert.strictEqual(overlay.style.getPropertyValue('--x-ov-blur'), '28px', 'the dark panel should cap its backdrop blur');
  page.close();
}

async function testCornersFollowTheResults() {
  const page = await createOverlayPage({
    respond(message) {
      if (message.action === 'getSearchSuggestions') {
        return { suggestions: [{ type: 'history', title: 'Local history hit', url: 'https://local.example.test/' }] };
      }
      if (message.action === 'getSearchEngineSuggestions') {
        return { suggestions: (message.localSuggestions || []).concat([{ type: 'googleSuggest', title: 'remote phrase', url: '' }]), hasRemoteSuggestions: true };
      }
      return undefined;
    }
  });
  const root = await page.open();
  const overlay = root.getElementById(OVERLAY_ID);
  const inputShell = () => Array.from(root.querySelectorAll('[style]')).find((element) => /content-radius/.test(element.style.getPropertyValue('border-radius')));
  assert.strictEqual(overlay.style.getPropertyValue('border-radius'), 'var(--x-ov-panel-radius, 26px)');
  await page.type('local');
  await page.waitFor(() => root.textContent.includes('Local history hit'), 'local results should render first');
  await page.waitFor(() => root.textContent.includes('remote phrase'), 'remote results should join them');
  assert.strictEqual(inputShell().style.getPropertyValue('border-radius'),
    'var(--x-ov-content-radius, 25px) var(--x-ov-content-radius, 25px) 0 0', 'with results the input should square its lower corners');
  assert.strictEqual(overlay.style.getPropertyValue('border-radius'), 'var(--x-ov-panel-radius, 26px)', 'the panel keeps all four corners round');
  const results = root.querySelector('.x-ov-suggestions-container') || page.suggestions()[0].parentElement;
  assert.ok(!/^\d+px$/.test(results.style.getPropertyValue('height')), 'results should keep their natural height, not a fixed one');
  await page.type('');
  await page.waitFor(() => page.suggestions().length === 0, 'clearing should collapse the results');
  assert.strictEqual(inputShell().style.getPropertyValue('border-radius'), 'var(--x-ov-content-radius, 25px)');
  page.close();

  const suggestionsCss = parseCss(fs.readFileSync(path.join(repoRoot, 'src/overlay/suggestions-view.css'), 'utf8'));
  const container = suggestionsCss.entries.find((entry) => entry.selectors.some((selector) => selector.endsWith('.x-ov-suggestions-container')) &&
    entry.style.getPropertyValue('border-radius'));
  assert.strictEqual(container.style.getPropertyValue('border-radius'), '0 0 var(--x-ov-content-radius, 25px) var(--x-ov-content-radius, 25px)',
    'results should follow the inner radius at their lower corners');
}

function testSharedSearchInputMotionTokens() {
  const css = parseCss(fs.readFileSync(path.join(repoRoot, 'src/shared/search/search-input.css'), 'utf8'));
  const tokens = css.entries.find((entry) => entry.style.getPropertyValue('--x-lumno-search-entry-scale-start'));
  assert.ok(tokens, 'overlay and New Tab should share an entry motion fallback');
  assert.strictEqual(tokens.style.getPropertyValue('--x-lumno-search-entry-scale-start').trim(), '0.97');
  assert.strictEqual(tokens.style.getPropertyValue('--x-lumno-search-entry-easing').trim(), 'cubic-bezier(0.16, 1, 0.3, 1)');
  const openMenu = css.rule('.x-lumno-search-input-mode__menu:not([hidden])');
  assert.match(openMenu.get('transition'), /transform 360ms cubic-bezier\(0\.2, 1\.45, 0\.35, 1\)/, 'the scope menu should spring open');
  const reduced = css.rule('.x-lumno-search-input-mode__menu', /prefers-reduced-motion/);
  assert.deepStrictEqual([reduced.get('animation'), reduced.get('transition')], ['none', 'none'],
    'the scope menu should respect reduced motion');
}

(async () => {
  await testEachEntrySettingPlaysItsMotion();
  await testEntryMotionIsSkippedWhenItWouldStutter();
  await testThemeElevation();
  await testCornersFollowTheResults();
  testSharedSearchInputMotionTokens();
  console.log('overlay entry motion tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
