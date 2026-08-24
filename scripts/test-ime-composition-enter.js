const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const guardPath = path.join(repoRoot, 'src/shared/ime-key-guard.js');
const guard = require(guardPath);

function createClock(start) {
  let current = start;
  return {
    now() {
      return current;
    },
    tick(ms) {
      current += ms;
    }
  };
}

const clock = createClock(1000);
const input = { nodeName: 'INPUT' };
const otherInput = { nodeName: 'INPUT' };
const imeGuard = guard.createImeKeyGuard({ now: clock.now, commitEnterIgnoreMs: 120 });

imeGuard.markCompositionStart({ target: input });
assert.strictEqual(
  imeGuard.shouldIgnoreKeydown({ key: 'a', target: input }),
  true,
  'guard should ignore keydown while an IME composition is active'
);

imeGuard.markCompositionEnd({ target: input });
assert.strictEqual(
  imeGuard.shouldIgnoreKeydown({
    key: 'Enter',
    keyCode: 13,
    which: 13,
    isComposing: false,
    target: input
  }),
  true,
  'guard should ignore the Enter keydown that commits raw IME text after compositionend'
);

assert.strictEqual(
  imeGuard.shouldIgnoreKeydown({
    key: 'Enter',
    keyCode: 13,
    which: 13,
    isComposing: false,
    target: otherInput
  }),
  false,
  'guard should not suppress Enter on an unrelated target'
);

clock.tick(121);
assert.strictEqual(
  imeGuard.shouldIgnoreKeydown({
    key: 'Enter',
    keyCode: 13,
    which: 13,
    isComposing: false,
    target: input
  }),
  false,
  'guard should allow deliberate Enter after the composition commit window'
);

const newtabHtml = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(repoRoot, 'src/background/background.js'), 'utf8');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
const overlayJs = fs.readFileSync(path.join(repoRoot, 'src/overlay/search-panel.js'), 'utf8');

assert.ok(
  newtabHtml.includes('<script src="../shared/ime-key-guard.js"></script>'),
  'New Tab should load the IME key guard before newtab.js'
);

assert.ok(
  backgroundJs.includes("'src/shared/ime-key-guard.js'"),
  'overlay injection should load the IME key guard before search-panel.js'
);

assert.match(
  newtabJs,
  /const imeKeyGuard = LumnoImeKeyGuard\.createImeKeyGuard\(\);[\s\S]*?function isImeCompositionEvent\(event\)[\s\S]*?return imeKeyGuard\.shouldIgnoreKeydown\(event\);/,
  'New Tab keydown handling should suppress IME commit Enter through the shared guard'
);

assert.match(
  overlayJs,
  /const imeKeyGuard = LumnoImeKeyGuard\.createImeKeyGuard\(\);[\s\S]*?function isImeCompositionEvent\(event\)[\s\S]*?return imeKeyGuard\.shouldIgnoreKeydown\(event\);/,
  'overlay keydown handling should suppress IME commit Enter through the shared guard'
);

console.log('IME composition Enter tests passed');
