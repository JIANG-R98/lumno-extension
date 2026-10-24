const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { readStylesheet } = require('../helpers/css-tokens');
const { parseCss } = require('../helpers/css-rules');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');
const suggestionNavigation = require('../../src/shared/search/suggestion-navigation.ts');

const macNavigator = { platform: 'MacIntel' };
const ctrlNavigationEvent = (key, code, overrides) => ({
  key,
  code,
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...(overrides || {})
});

assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    ctrlNavigationEvent('n', 'KeyN'),
    { macosCtrlEnabled: false, navigatorLike: macNavigator }
  ),
  '',
  'the macOS navigation experiment should be disabled by default'
);
assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    ctrlNavigationEvent('n', 'KeyN'),
    { macosCtrlEnabled: true, navigatorLike: macNavigator }
  ),
  'ArrowDown'
);
assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    ctrlNavigationEvent('p', 'KeyP'),
    { macosCtrlEnabled: true, navigatorLike: macNavigator }
  ),
  'ArrowUp'
);
assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    ctrlNavigationEvent('n', 'KeyN'),
    { macosCtrlEnabled: true, navigatorLike: { platform: 'Win32' } }
  ),
  '',
  'Ctrl+N/P should stay untouched outside macOS'
);
assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    ctrlNavigationEvent('n', 'KeyN', { shiftKey: true }),
    { macosCtrlEnabled: true, navigatorLike: macNavigator }
  ),
  '',
  'additional modifiers should not trigger the experiment'
);
assert.strictEqual(
  suggestionNavigation.getSuggestionNavigationKey(
    { key: 'ArrowDown' },
    { macosCtrlEnabled: false, navigatorLike: { platform: 'Win32' } }
  ),
  'ArrowDown',
  'existing arrow navigation should remain platform independent'
);

function createKeyEvent(overrides) {
  return {
    type: 'keydown',
    key: '',
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...(overrides || {})
  };
}

const activatedIndexes = [];
const shortcutItems = Array.from({ length: 3 }, (_, index) => ({
  click() {
    activatedIndexes.push(index);
  }
}));

const shortcutContainer = {
  attributes: new Map(),
  setAttribute(name, value) {
    this.attributes.set(name, value);
  },
  removeAttribute(name) {
    this.attributes.delete(name);
  },
  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
};

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

// Holding the primary modifier (⌘ on macOS, Ctrl elsewhere) over results
// arms number jump mode with a Toast; releasing it shows a number on each
// result, and a digit opens that result.
const RESULTS = Array.from({ length: 4 }, (_, index) => ({ type: 'history', title: `Result ${index}`, url: `https://r${index}.test/` }));
const SURFACE_PARTS = {
  overlay: { container: '#_x_extension_suggestions_container_2024_unique_', badge: '.x-ov-suggestion-number-shortcut', modifier: ['Control', 'ControlLeft', 'ctrlKey'] },
  newtab: { container: '#_x_extension_newtab_suggestions_container_2024_unique_', badge: '.x-nt-suggestion-number-shortcut', modifier: ['Meta', 'MetaLeft', 'metaKey'] }
};

async function openWithResults(name) {
  const surface = await openSearchSurface(name, {
    respond: (message) => (message.action === 'getSearchSuggestions' ? { suggestions: RESULTS } : undefined)
  });
  await surface.type('result');
  await surface.settle(150);
  const parts = SURFACE_PARTS[name];
  const container = surface.root.querySelector(parts.container);
  const mode = () => [container.getAttribute('data-number-shortcuts-active'), container.getAttribute('data-number-shortcuts-scroll-locked')];
  return { surface, parts, container, mode };
}

async function hold(surface, [key, code, flag]) {
  surface.press(key, { code, [flag]: true });
  await surface.settle(450);
}

async function testSurfaces() {
  for (const name of SURFACES) {
    const { surface, parts, mode } = await openWithResults(name);
    const badges = surface.suggestions().map((row) => row.querySelector(parts.badge).textContent);
    assert.deepStrictEqual(badges, badges.map((_badge, index) => String(index)), `${name}: each result should carry its number`);
    const second = surface.suggestions()[2]._xSuggestion.url;
    assert.deepStrictEqual(mode(), [null, null], `${name}: numbers stay hidden until asked for`);
    await hold(surface, parts.modifier);
    assert.deepStrictEqual(mode(), [null, 'true'], `${name}: holding the modifier should lock scrolling before revealing numbers`);
    assert.deepStrictEqual(surface.toast(), { shown: true, text: 'Release to show numbers' }, `${name}: the hold should explain itself`);
    surface.keyup(parts.modifier[0], { code: parts.modifier[1] });
    await surface.settle(40);
    assert.deepStrictEqual(mode(), ['true', 'true'], `${name}: releasing should reveal the numbers`);
    assert.strictEqual(surface.toast().shown, false, `${name}: and dismiss the Toast`);
    surface.press('2', { code: 'Digit2' });
    await surface.settle(120);
    assert.deepStrictEqual(surface.navigation(), { url: second }, `${name}: a digit should open the result showing it`);
    assert.deepStrictEqual(mode(), [null, null], `${name}: and leave number mode`);
    surface.close();

    const pointer = await openWithResults(name);
    await hold(pointer.surface, pointer.parts.modifier);
    pointer.surface.keyup(pointer.parts.modifier[0], { code: pointer.parts.modifier[1] });
    await pointer.surface.settle(40);
    pointer.surface.page.trusted(pointer.surface.suggestions()[0], 'pointerdown', { bubbles: true, composed: true });
    await pointer.surface.settle(30);
    assert.deepStrictEqual(pointer.mode(), [null, null], `${name}: using the pointer should leave number mode`);
    pointer.surface.close();

    const alt = await openWithResults(name);
    await hold(alt.surface, ['Alt', 'AltLeft', 'altKey']);
    assert.deepStrictEqual(alt.mode(), [null, null], `${name}: the background-open modifier alone should not arm number mode`);
    alt.surface.close();
  }
}

function testStylesheets() {
  [
    ['New Tab', ['src/newtab/styles/suggestions.css', 'src/newtab/styles/page-overrides.css', 'src/newtab/styles/notices-and-suggestions.css'], 'x-nt'],
    ['Overlay', ['src/overlay/suggestions-view.css'], 'x-ov']
  ].forEach(([surface, files, prefix]) => {
    const entries = files.flatMap((file) => parseCss(readStylesheet(file)).entries).filter((entry) => entry.conditions.length === 0);
    const badge = `.${prefix}-suggestion-number-shortcut`;
    const declares = (test, property, value) => entries.some((entry) => entry.selectors.some(test) && entry.style.getPropertyValue(property) === value);
    assert.ok(declares((selector) => selector.includes('[data-number-shortcuts-active="true"]') && selector.endsWith(badge), 'display', 'inline-flex'),
      `${surface} should show the numbers only in number mode`);
    assert.ok(declares((selector) => selector.endsWith('[data-number-shortcuts-scroll-locked="true"]'), 'overflow-y', 'hidden'),
      `${surface} should lock scrolling in number mode`);
  });
  const onboarding = new JSDOM(fs.readFileSync('src/onboarding/onboarding.html', 'utf8')).window.document;
  assert.ok(onboarding.querySelector('link[rel="stylesheet"][href="../overlay/suggestions-view.css"]'),
    'the onboarding overlay preview should use the overlay result styles');
  assert.ok(parseCss(readStylesheet('src/onboarding/styles/newtab-preview.css')).selectors().some((selector) => selector.includes('.x-nt-suggestion-number-shortcut')),
    'the onboarding New Tab preview should style its number badges');
}

async function run() {
  const holdSignals = [];
  const commandHoldOptions = {
    primaryModifier: 'meta',
    holdDurationMs: 5,
    timeoutMs: 20,
    onHoldStart() {
      holdSignals.push('start');
    },
    onHoldEnd() {
      holdSignals.push('end');
    }
  };

  const commandDownEvent = createKeyEvent({
    key: 'Meta',
    code: 'MetaLeft',
    metaKey: true
  });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      commandDownEvent,
      shortcutItems,
      shortcutContainer,
      commandHoldOptions
    ),
    false,
    'pressing Command should begin the hold without consuming the browser event'
  );
  assert.strictEqual(commandDownEvent.defaultPrevented, false);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    null,
    'number badges should stay hidden while the hold threshold is pending'
  );
  await wait(10);
  assert.deepStrictEqual(holdSignals, ['start']);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-scroll-locked'),
    'true',
    'reaching the hold threshold should lock result scrolling'
  );
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    null,
    'reaching the hold threshold should show only the Toast, not the badges'
  );

  const wheelEvent = createKeyEvent();
  assert.strictEqual(
    suggestionNavigation.preventNumberShortcutWheel(wheelEvent, shortcutContainer),
    true,
    'wheel scrolling should be blocked once the long hold is armed'
  );
  assert.strictEqual(wheelEvent.defaultPrevented, true);

  const commandUpEvent = createKeyEvent({
    type: 'keyup',
    key: 'Meta',
    code: 'MetaLeft',
    metaKey: false
  });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      commandUpEvent,
      shortcutItems,
      shortcutContainer,
      commandHoldOptions
    ),
    true,
    'releasing Command after a long hold should enter number jump mode'
  );
  assert.deepStrictEqual(holdSignals, ['start', 'end']);
  assert.strictEqual(commandUpEvent.defaultPrevented, true);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    'true'
  );
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-scroll-locked'),
    'true'
  );
  assert.deepStrictEqual(activatedIndexes, []);

  const numberEvent = createKeyEvent({ key: '2', code: 'Digit2' });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      numberEvent,
      shortcutItems,
      shortcutContainer,
      commandHoldOptions
    ),
    true,
    'a plain number should activate its result after the modifier is released'
  );
  assert.strictEqual(numberEvent.defaultPrevented, true);
  assert.strictEqual(numberEvent.propagationStopped, true);
  assert.deepStrictEqual(activatedIndexes, [2]);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    null,
    'number jump mode should close after a selection'
  );
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-scroll-locked'),
    null
  );

  const quickSignals = [];
  const quickOptions = {
    primaryModifier: 'meta',
    holdDurationMs: 20,
    onHoldStart() {
      quickSignals.push('start');
    },
    onHoldEnd() {
      quickSignals.push('end');
    }
  };
  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ key: 'Meta', metaKey: true }),
    shortcutItems,
    shortcutContainer,
    quickOptions
  );
  const quickReleaseEvent = createKeyEvent({ type: 'keyup', key: 'Meta' });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      quickReleaseEvent,
      shortcutItems,
      shortcutContainer,
      quickOptions
    ),
    false,
    'a quick Command tap should remain invisible and unconsumed'
  );
  await wait(25);
  assert.deepStrictEqual(quickSignals, []);
  assert.strictEqual(shortcutContainer.getAttribute('data-number-shortcuts-active'), null);

  const oldCommandNumberEvent = createKeyEvent({ key: '1', metaKey: true });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      oldCommandNumberEvent,
      shortcutItems,
      shortcutContainer,
      commandHoldOptions
    ),
    false,
    'Command-number should remain available to Chrome while Command is held'
  );
  assert.strictEqual(oldCommandNumberEvent.defaultPrevented, false);
  assert.deepStrictEqual(activatedIndexes, [2]);

  const instantOptions = {
    primaryModifier: 'meta',
    timeoutMs: 5,
    instantActive: true
  };
  const instantCommandDownEvent = createKeyEvent({
    key: 'Meta',
    code: 'MetaLeft',
    metaKey: true
  });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      instantCommandDownEvent,
      shortcutItems,
      shortcutContainer,
      instantOptions
    ),
    false,
    'instant mode should reveal number badges without consuming Command'
  );
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    'true',
    'instant mode should reveal badges on the trusted modifier keydown'
  );
  await wait(10);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    'true',
    'instant mode should stay active while the primary modifier remains held'
  );
  const instantCommandUpEvent = createKeyEvent({
    type: 'keyup',
    key: 'Meta',
    code: 'MetaLeft'
  });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      instantCommandUpEvent,
      shortcutItems,
      shortcutContainer,
      instantOptions
    ),
    false,
    'releasing Command in instant mode should not consume the browser event'
  );
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    null,
    'trusted modifier keyup should dismiss instant number badges'
  );

  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ key: 'Meta', code: 'MetaLeft', metaKey: true }),
    shortcutItems,
    shortcutContainer,
    instantOptions
  );
  const instantNumberEvent = createKeyEvent({
    key: '1',
    code: 'Digit1',
    metaKey: true
  });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      instantNumberEvent,
      shortcutItems,
      shortcutContainer,
      instantOptions
    ),
    true,
    'instant mode should activate a digit while Command remains held'
  );
  assert.deepStrictEqual(activatedIndexes, [2, 1]);
  assert.strictEqual(shortcutContainer.getAttribute('data-number-shortcuts-active'), null);

  const cancelSignals = [];
  const controlOptions = {
    primaryModifier: 'ctrl',
    holdDurationMs: 5,
    timeoutMs: 10,
    onHoldStart() {
      cancelSignals.push('start');
    },
    onHoldEnd() {
      cancelSignals.push('end');
    }
  };
  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ key: 'Control', ctrlKey: true }),
    shortcutItems,
    shortcutContainer,
    controlOptions
  );
  await wait(10);
  const commandEnterEvent = createKeyEvent({ key: 'Enter', ctrlKey: true });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      commandEnterEvent,
      shortcutItems,
      shortcutContainer,
      controlOptions
    ),
    false,
    'another key should cancel an armed hold without intercepting Ctrl+Enter'
  );
  assert.deepStrictEqual(cancelSignals, ['start', 'end']);
  assert.strictEqual(commandEnterEvent.defaultPrevented, false);
  assert.strictEqual(shortcutContainer.getAttribute('data-number-shortcuts-scroll-locked'), null);

  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ key: 'Control', ctrlKey: true }),
    shortcutItems,
    shortcutContainer,
    controlOptions
  );
  await wait(10);
  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ type: 'keyup', key: 'Control' }),
    shortcutItems,
    shortcutContainer,
    controlOptions
  );
  const escapeEvent = createKeyEvent({ key: 'Escape', code: 'Escape' });
  assert.strictEqual(
    suggestionNavigation.handleNumberShortcutKeyEvent(
      escapeEvent,
      shortcutItems,
      shortcutContainer,
      controlOptions
    ),
    true,
    'Escape should cancel active number jump mode'
  );
  assert.strictEqual(escapeEvent.defaultPrevented, true);

  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ key: 'Control', ctrlKey: true }),
    shortcutItems,
    shortcutContainer,
    controlOptions
  );
  await wait(10);
  suggestionNavigation.handleNumberShortcutKeyEvent(
    createKeyEvent({ type: 'keyup', key: 'Control' }),
    shortcutItems,
    shortcutContainer,
    controlOptions
  );
  await wait(15);
  assert.strictEqual(
    shortcutContainer.getAttribute('data-number-shortcuts-active'),
    null,
    'number jump mode should expire after its timeout'
  );
  assert.strictEqual(
    suggestionNavigation.preventNumberShortcutWheel(createKeyEvent(), shortcutContainer),
    false,
    'wheel scrolling should resume after number jump mode closes'
  );

  await testSurfaces();
  testStylesheets();

  console.log('search result number shortcut tests passed');
}

run().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
