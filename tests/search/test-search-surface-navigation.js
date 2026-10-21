const assert = require('assert');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

// Both search surfaces read typed URLs, match results to open tabs and
// autocomplete the same way, through the shared rules in search-utils.js
// (unit-tested in test-search-utils.js).

function respondWith(suggestions, tabs) {
  return {
    openContext: tabs ? { tabs } : {},
    respond(message) {
      if (message.action === 'getSearchSuggestions') return { suggestions };
      if (message.action === 'getTabsForOverlay' || message.action === 'getTabs') return { tabs: tabs || [] };
      if (message.action === 'getSearchEngineSuggestions') {
        return {
          suggestions: (message.localSuggestions || []).concat([
            { type: 'googleSuggest', title: 'github desktop', url: 'https://www.google.com/search?q=github%20desktop' }
          ]),
          hasRemoteSuggestions: true
        };
      }
      return undefined;
    }
  };
}

async function testTypedUrls(name) {
  for (const [query, expected] of [
    ['localhost:3000/docs', { url: 'https://localhost:3000/docs' }],
    ['example.com/docs', { url: 'https://example.com/docs' }],
    ['javascript:alert(1)', { search: 'javascript:alert(1)' }]
  ]) {
    const surface = await openSearchSurface(name);
    await surface.type(query);
    await surface.settle(60);
    surface.press('Enter');
    await surface.settle(120);
    assert.deepStrictEqual(surface.navigation(), expected, `${name}: Enter on ${query}`);
    surface.close();
  }
}

async function testOpenTabsMatchByPort(name) {
  const tabs = [{ id: 7, windowId: 1, title: 'Dev 3000', url: 'http://localhost:3000/app' }];
  for (const [url, switches] of [['http://localhost:3000/app', true], ['http://localhost:4000/app', false]]) {
    const surface = await openSearchSurface(name, respondWith([{ type: 'history', title: 'Dev app', url }], tabs));
    await surface.type('dev app');
    await surface.settle(150);
    const row = surface.suggestions().find((item) => /Dev app/.test(item.textContent));
    const before = surface.page.messages.length;
    row.dispatchEvent(new surface.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await surface.settle(120);
    const switched = surface.page.messages.slice(before).some((message) => message.action === 'switchToTab' && message.tabId === 7);
    assert.strictEqual(switched, switches, `${name}: ${url} should ${switches ? '' : 'not '}switch to the tab open on port 3000`);
    if (!switches) {
      assert.deepStrictEqual(surface.navigation(), { url }, `${name}: a different port should open its own page`);
    }
    surface.close();
  }
}

async function testAutocompleteNeedsALocalResult(name) {
  for (const local of [false, true]) {
    const surface = await openSearchSurface(name, respondWith(local ? [{ type: 'history', title: 'GitHub', url: 'https://github.com/' }] : []));
    const input = surface.input();
    input.value = 'git';
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new surface.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 't' }));
    await surface.settle(250);
    const types = surface.suggestions().map((row) => row._xSuggestion && row._xSuggestion.type);
    if (local) {
      assert.deepStrictEqual([input.value, input.selectionStart, input.selectionEnd], ['github.com', 3, 10],
        `${name}: a matching local result should complete inline, leaving the completion selected`);
    } else {
      assert.strictEqual(input.value, 'git', `${name}: engine suggestions alone should not autocomplete the input`);
      assert.strictEqual(types[0], 'newtab', `${name}: the search action should stay first`);
    }
    surface.close();
  }
}

(async () => {
  for (const name of SURFACES) {
    await testTypedUrls(name);
    await testOpenTabsMatchByPort(name);
    await testAutocompleteNeedsALocalResult(name);
  }
  console.log('search surface navigation tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
