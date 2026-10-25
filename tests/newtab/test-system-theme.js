const assert = require('assert');
const systemTheme = require('../../src/newtab/theme/system-theme.ts');

// The theme a theme mode resolves to, and following the system preference.

assert.strictEqual(systemTheme.resolveThemeMode('dark', false), 'dark');
assert.strictEqual(systemTheme.resolveThemeMode('light', true), 'light');
assert.strictEqual(systemTheme.resolveThemeMode('system', true), 'dark');
assert.strictEqual(systemTheme.resolveThemeMode('system', false), 'light');

function createQueryList(matches, api) {
  const listeners = new Set();
  const list = { matches };
  if (api === 'event-target') {
    list.addEventListener = (type, listener) => { assert.strictEqual(type, 'change'); listeners.add(listener); };
    list.removeEventListener = (type, listener) => { assert.strictEqual(type, 'change'); listeners.delete(listener); };
  } else if (api === 'legacy') {
    list.addListener = (listener) => listeners.add(listener);
    list.removeListener = (listener) => listeners.delete(listener);
  }
  return { list, listeners };
}

const queries = [];
const theme = systemTheme.createSystemTheme({
  matchMedia(query) {
    queries.push(query);
    return createQueryList(true, 'event-target').list;
  }
});
assert.deepStrictEqual(queries, ['(prefers-color-scheme: dark)']);
assert.strictEqual(theme.resolveTheme('system'), 'dark', 'system follows the media query');
assert.strictEqual(theme.resolveTheme('system', false), 'light', 'a match the caller read stands in for the query');
assert.strictEqual(theme.resolveTheme('light', true), 'light', 'a fixed mode ignores the system');

const listener = () => {};
['event-target', 'legacy'].forEach((api) => {
  const { list, listeners } = createQueryList(false, api);
  assert.strictEqual(theme.addMediaQueryChangeListener(list, listener), true, `${api} lists take a listener`);
  assert.ok(listeners.has(listener));
  theme.removeMediaQueryChangeListener(list, listener);
  assert.strictEqual(listeners.size, 0, `${api} lists let it go`);
});
const { list: bare } = createQueryList(false, 'none');
assert.strictEqual(theme.addMediaQueryChangeListener(bare, listener), false, 'a list without either API reports that');
theme.removeMediaQueryChangeListener(bare, listener);

console.log('system theme tests passed');
