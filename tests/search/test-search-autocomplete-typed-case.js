const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readOverlayPanelSource } = require('../helpers/overlay-source');

const repoRoot = path.resolve(__dirname, '..', '..');
require('../../src/newtab/search/search-autocomplete.js');

// Inline autocomplete appends to what was typed; it must not rewrite the
// typed characters in the candidate's own case ("4A" stays "4A").
function createInput(value) {
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  };
}

const input = createInput('4A');
const pageState = {
  latestRawQuery: '4A',
  searchResultPriorityMode: 'autocomplete',
  lastDeletionAt: 0,
  siteSearchState: null,
  inputParts: { input },
  autocompleteState: null
};
const autocomplete = globalThis.LumnoNewtabSearchAutocomplete.createSearchAutocomplete({
  pageState,
  getUrlDisplay: (url) => String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
  isEnglishQuery: () => true,
  getKeywordSearchSuggestionState: (suggestions) => ({ autocompleteSuggestions: suggestions })
});
autocomplete.applyAutocomplete([{
  type: 'bookmark',
  title: '4A广告网',
  url: 'https://www.4anet.com/'
}], null, 'default');

assert.strictEqual(input.value, '4Anet.com', 'the typed characters should keep their case in the completion');
assert.deepStrictEqual([input.selectionStart, input.selectionEnd], [2, 9], 'only the added text should be selected');
assert.strictEqual(
  pageState.autocompleteState && pageState.autocompleteState.completion,
  '4Anet.com',
  'accepting the completion should keep the typed case too'
);

const overlaySource = readOverlayPanelSource();
assert.match(
  overlaySource,
  /const displayText = rawQuery \+ candidate\.completion\.slice\(rawQuery\.length\);\s*searchInput\.value = displayText;[\s\S]*?completion: displayText,/,
  'the Overlay inline autocomplete should keep the typed case as well'
);

console.log('Search autocomplete typed case tests passed');
