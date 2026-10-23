const assert = require('assert');
const { createOverlayPage } = require('../helpers/overlay-runtime-harness');

// Types into the real overlay (the files the background injects) and checks
// the results it renders from background answers, with the enhanced favicon
// fetch both off and on.

const historyResult = {
  type: 'history',
  title: 'Lumno regression history result',
  url: 'https://history.example.test/lumnotest',
  favicon: 'https://history.example.test/favicon.ico'
};

async function testSearchResults(enhancedFetchEnabled, priority) {
  const page = await createOverlayPage({
    settings: {
      _x_extension_favicon_enhanced_fetch_enabled_2026_unique_: enhancedFetchEnabled,
      _x_extension_search_result_priority_2026_unique_: priority
    },
    respond(message) {
      if (message.action === 'getSearchSuggestions') {
        return { suggestions: message.query === 'lumnotest' ? [historyResult] : [] };
      }
      return undefined;
    }
  });
  try {
    const root = await page.open();
    await page.type('lumnotest');
    await page.waitFor(() => root.textContent.includes(historyResult.title), 'typing should render the background history result');
    assert.ok(page.suggestions().length >= 2, 'the search action and history result should both render');
    assert.ok(page.messages.some((message) => message.action === 'getSearchSuggestions' && message.query === 'lumnotest'),
      'typing should request background search results');

    await page.type('emptyregressionquery');
    await page.waitFor(
      () => root.textContent.includes('emptyregressionquery') && !root.textContent.includes(historyResult.title),
      'a query without history should still render the default search action'
    );
    assert.ok(page.suggestions().length > 0, 'the default search action must remain available');

    await page.type('');
    await page.waitFor(() => page.suggestions().length === 0,
      'clearing the query should clear results when default open tabs are disabled');
    assert.deepStrictEqual(page.errors, []);
  } finally {
    page.toggle();
    await page.settle(0);
    page.close();
  }
}

(async () => {
  await testSearchResults(false, 'autocomplete');
  await testSearchResults(true, 'search');
  console.log('Overlay search results pass with enhanced favicon fetch both off and on.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
