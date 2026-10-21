const assert = require('assert');
const fs = require('fs');

const matcher = require('../../src/shared/shortcut-key-matcher.js');
const { readNewtabRuntimeSource } = require('../helpers/newtab-source');
const { getManifestContentScripts, getPageScripts, runsBefore } = require('../helpers/runtime-scripts');

const macEvent = matcher.describeKeyboardEvent({
  code: 'KeyK',
  key: 'K',
  ctrlKey: false,
  altKey: false,
  shiftKey: true,
  metaKey: true
});

assert.deepStrictEqual(macEvent, {
  ctrlKey: false,
  altKey: false,
  shiftKey: true,
  metaKey: true,
  key: 'k'
});
assert.strictEqual(
  matcher.descriptorMatchesShortcut(macEvent, 'Command+Shift+K'),
  true,
  'the browser-configured macOS shortcut should match a normalized trusted key descriptor'
);
assert.strictEqual(
  matcher.descriptorMatchesShortcut(macEvent, 'Ctrl+Shift+K'),
  false,
  'a shortcut with different primary modifiers must not match'
);

const customSlashEvent = matcher.describeKeyboardEvent({
  code: 'Slash',
  key: '?',
  ctrlKey: true,
  altKey: true,
  shiftKey: true,
  metaKey: false
});
assert.strictEqual(
  matcher.descriptorMatchesShortcut(customSlashEvent, 'Ctrl+Alt+Shift+Slash'),
  true,
  'custom command shortcuts should use the physical code for punctuation keys'
);
assert.strictEqual(
  matcher.canBeChromeCommandShortcut(customSlashEvent),
  true,
  'a modified keydown should be eligible for one cold-start verification round trip'
);
assert.strictEqual(
  matcher.canBeChromeCommandShortcut(matcher.describeKeyboardEvent({ code: 'KeyA', key: 'a' })),
  false,
  'ordinary typing must not wake the extension background while the shortcut is loading'
);
assert.strictEqual(
  matcher.descriptorMatchesShortcut(macEvent, 'Command+Unknown+K'),
  false,
  'invalid configured shortcuts should fail closed'
);
assert.deepStrictEqual(matcher.parseShortcut('⌘⇧K'), {
  ctrl: false,
  alt: false,
  shift: true,
  meta: true,
  key: 'k'
});
assert.deepStrictEqual(matcher.parseShortcut('Ctrl+ArrowUp'), {
  ctrl: true,
  alt: false,
  shift: false,
  meta: false,
  key: 'ArrowUp'
});
assert.strictEqual(
  matcher.eventMatchesShortcut({
    code: 'Equal',
    key: '+',
    ctrlKey: true
  }, 'Ctrl+Equal'),
  true
);

const contentScripts = getManifestContentScripts();
assert(
  contentScripts.some((files) => runsBefore(files, 'src/shared/shortcut-key-matcher.js', 'src/content/shortcut-key-observer.js')),
  'the page shortcut observer should load the shared matcher first'
);
assert.strictEqual(
  contentScripts.filter((files) => files.includes('src/shared/shortcut-key-matcher.js')).length,
  1,
  'the shared matcher should be injected once per frame, by the observer entry that uses it'
);
const onboardingSource = fs.readFileSync('src/onboarding/onboarding-content.js', 'utf8');
const newtabSource = readNewtabRuntimeSource();
assert.match(onboardingSource, /SHORTCUT_KEY_MATCHER\.parseShortcut\(normalizeShortcutValue\(shortcut\)\)/);
assert.match(onboardingSource, /SHORTCUT_KEY_MATCHER\.eventMatchesShortcut\(event, parseShortcutHotkey\(shortcut\)\)/);
assert(
  runsBefore(getPageScripts('src/onboarding/onboarding.html'), 'src/shared/shortcut-key-matcher.js', 'src/onboarding/onboarding-content.js'),
  'onboarding should load the shared matcher before its content model'
);
assert.match(newtabSource, /SHORTCUT_KEY_MATCHER\.parseShortcut\(nextShortcut\)/);
assert.match(
  newtabSource,
  /SHORTCUT_KEY_MATCHER\.eventMatchesShortcut\(event, fallbackShortcutSpec\)/
);
assert(
  runsBefore(getPageScripts('newtab.html'), 'src/shared/shortcut-key-matcher.js', 'src/newtab/newtab.js'),
  'newtab should load the shared matcher before its runtime entry'
);

console.log('shortcut key matcher tests passed');
