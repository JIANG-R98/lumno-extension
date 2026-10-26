const assert = require('assert');
const navigationDisposition = require('../../src/domain/navigation-disposition.ts');

assert.strictEqual(
  navigationDisposition.isBackgroundOpenEvent({ metaKey: true, ctrlKey: false, button: 0 }),
  true,
  'Command-click should request a background tab'
);
assert.strictEqual(
  navigationDisposition.isBackgroundOpenEvent({ metaKey: false, ctrlKey: true, button: 0 }),
  true,
  'Control-click should request a background tab'
);
assert.strictEqual(
  navigationDisposition.isBackgroundOpenEvent({ metaKey: false, ctrlKey: false, button: 1 }),
  true,
  'middle-click should request a background tab'
);
assert.strictEqual(
  navigationDisposition.isBackgroundOpenEvent({ metaKey: false, ctrlKey: false, button: 0 }),
  false,
  'ordinary primary click should keep the normal opening behavior'
);
assert.strictEqual(
  navigationDisposition.getDisposition({ metaKey: true }, 'currentTab'),
  'backgroundTab',
  'background modifiers should override the foreground fallback'
);
assert.strictEqual(
  navigationDisposition.getDisposition({ button: 0 }, 'currentTab'),
  'currentTab',
  'ordinary activation should preserve the supplied fallback'
);
assert.strictEqual(
  navigationDisposition.isMiddleClick({ button: 1 }),
  true,
  'middle-button auxiliary clicks should be identifiable without treating other buttons as activation'
);
assert.strictEqual(
  navigationDisposition.isMiddleClick({ button: 2 }),
  false,
  'right-click should not activate link-like controls'
);

[
  [{}, 'newTab'],
  [{ openInOtherTab: true }, 'currentTab'],
  [{ openInBackgroundTab: true }, 'backgroundTab'],
  [{ openInOtherTab: true, openInBackgroundTab: true }, 'currentTab'],
  [{ currentTabByDefault: true }, 'currentTab'],
  [{ currentTabByDefault: true, openInOtherTab: true }, 'newTab'],
  [{ currentTabByDefault: true, openInBackgroundTab: true }, 'backgroundTab'],
  [{ currentTabByDefault: true, openInOtherTab: true, openInBackgroundTab: true }, 'newTab']
].forEach(([options, disposition]) => {
  assert.strictEqual(
    navigationDisposition.getDefaultTabDisposition(options),
    disposition,
    `Option/Alt should flip the default tab and win over background opening: ${JSON.stringify(options)}`
  );
});

console.log('navigation disposition tests passed');
