const assert = require('assert');
const fs = require('fs');

const matcher = require('../src/shared/shortcut-key-matcher.js');

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

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const hotkeyScripts = manifest.content_scripts[0].js;
assert(
  hotkeyScripts.indexOf('src/shared/shortcut-key-matcher.js') <
    hotkeyScripts.indexOf('src/content/hotkey-listener.js'),
  'content hotkey listener should load the shared matcher first'
);
const contentHotkeySource = fs.readFileSync('src/content/hotkey-listener.js', 'utf8');
const onboardingSource = fs.readFileSync('src/onboarding/onboarding-content.js', 'utf8');
const onboardingHtml = fs.readFileSync('src/onboarding/onboarding.html', 'utf8');
const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
const newtabHtml = fs.readFileSync('src/newtab/newtab.html', 'utf8');
assert.match(contentHotkeySource, /SHORTCUT_KEY_MATCHER\.parseShortcut\(nextShortcut\)/);
assert.match(contentHotkeySource, /SHORTCUT_KEY_MATCHER\.eventMatchesShortcut\(event, shortcutSpec\)/);
assert.doesNotMatch(contentHotkeySource, /function parseShortcut\(/);
assert.doesNotMatch(contentHotkeySource, /function shortcutMatchesEvent\(/);
assert.match(onboardingSource, /SHORTCUT_KEY_MATCHER\.parseShortcut\(normalizeShortcutValue\(shortcut\)\)/);
assert.match(onboardingSource, /SHORTCUT_KEY_MATCHER\.eventMatchesShortcut\(event, parseShortcutHotkey\(shortcut\)\)/);
assert.doesNotMatch(onboardingSource, /function getShortcutKeyTokenFromCode\(/);
assert(
  onboardingHtml.indexOf('../shared/shortcut-key-matcher.js') <
    onboardingHtml.indexOf('onboarding-content.js'),
  'onboarding should load the shared matcher before its content model'
);
assert.match(newtabSource, /SHORTCUT_KEY_MATCHER\.parseShortcut\(nextShortcut\)/);
assert.match(
  newtabSource,
  /SHORTCUT_KEY_MATCHER\.eventMatchesShortcut\(event, fallbackShortcutSpec\)/
);
assert.doesNotMatch(newtabSource, /function parseFallbackShortcut\(/);
assert.doesNotMatch(newtabSource, /function getFallbackShortcutKeyTokenFromCode\(/);
assert.doesNotMatch(newtabSource, /function shortcutMatchesEvent\(/);
assert(
  newtabHtml.indexOf('../shared/shortcut-key-matcher.js') <
    newtabHtml.indexOf('data-page-entry="../newtab/newtab.js"'),
  'newtab should load the shared matcher before its runtime entry'
);

console.log('shortcut key matcher tests passed');
