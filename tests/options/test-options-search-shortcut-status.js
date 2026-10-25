const assert = require('assert');
const { createSearchShortcutStatus } = require('../../src/options/options-search-shortcut-status');

// The status chip names the browser's current search shortcut, formatted
// for the platform, and the platform default when the browser has none.
function status(options) {
  const config = options || {};
  const labels = [];
  const section = createSearchShortcutStatus({
    chromeApi: {
      commands: config.commands === null ? undefined : {
        getAll: (callback) => callback(config.commands || [])
      },
      runtime: { lastError: config.lastError || null }
    },
    isMacPlatform: Boolean(config.mac),
    formatShortcutForDisplay: (shortcut) => `fmt(${shortcut})`,
    getMessage: (key, fallback) => fallback,
    onChange: (label) => labels.push(label)
  });
  return { section, labels };
}

{
  const { section, labels } = status();
  assert.strictEqual(section.getLabel(), '未设置', 'before the browser answers the chip says nothing is set');
  section.load();
  assert.deepStrictEqual(labels, ['fmt(Ctrl+Shift+K)'], 'without a bound command the platform default shows');
}

{
  const { section, labels } = status({ mac: true, commands: [{ name: 'show-search', shortcut: ' ⌥K ' }] });
  section.load();
  assert.deepStrictEqual(labels, ['fmt(⌥K)'], 'the bound chord shows, trimmed and formatted');
  section.render();
  assert.deepStrictEqual(labels, ['fmt(⌥K)', 'fmt(⌥K)'], 'rendering again hands the label over again');
}

{
  const { section, labels } = status({ mac: true, commands: null });
  section.load();
  assert.deepStrictEqual(labels, ['fmt(Command+Shift+K)'], 'browsers without commands fall back to the macOS default');
}

{
  const { section, labels } = status({ commands: [{ name: 'show-search', shortcut: '⌥K' }], lastError: { message: 'gone' } });
  section.load();
  assert.deepStrictEqual(labels, ['fmt(Ctrl+Shift+K)'], 'a failed read falls back to the default');
}

console.log('options search shortcut status tests passed');
