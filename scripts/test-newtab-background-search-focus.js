const assert = require('assert');
const fs = require('fs');
const path = require('path');

require(path.join('..', 'src', 'newtab', 'background-search-focus.js'));

const {
  createBackgroundFocusHandler,
  shouldFocusSearchFromPointer
} = globalThis.LumnoNewtabBackgroundSearchFocus;

const body = { name: 'body' };
const root = { name: 'search root' };
const searchLayer = { name: 'search layer' };
const backgroundTargets = [body, root, searchLayer];

function createPointerEvent(target, overrides) {
  return {
    target,
    defaultPrevented: false,
    ...(overrides || {})
  };
}

function assertFocuses(target, message) {
  assert.strictEqual(
    shouldFocusSearchFromPointer(createPointerEvent(target), backgroundTargets),
    true,
    message
  );
}

function assertDoesNotFocus(target, message) {
  assert.strictEqual(
    shouldFocusSearchFromPointer(createPointerEvent(target), backgroundTargets),
    false,
    message
  );
}

assertFocuses(body, 'clicking the page background should focus search');
assertFocuses(root, 'clicking the exposed search shell should focus search');
assertFocuses(searchLayer, 'clicking the exposed search layer should focus search');

[
  'bookmark card',
  'bookmark breadcrumb',
  'bookmark pager',
  'bookmark cascade menu',
  'recent site card',
  'shortcut tile',
  'mode menu',
  'wallpaper control',
  'feedback control',
  'dialog'
].forEach((name) => {
  assertDoesNotFocus({ name }, `clicking ${name} should not focus search`);
});

assert.strictEqual(
  shouldFocusSearchFromPointer(createPointerEvent(body, { defaultPrevented: true }), backgroundTargets),
  false,
  'handled pointer events should not focus search'
);
assert.strictEqual(
  shouldFocusSearchFromPointer(null, backgroundTargets),
  false,
  'missing pointer events should not focus search'
);

let searchValue = '';
let focusCount = 0;
let dismissCount = 0;
const handleBackgroundPointerFocus = createBackgroundFocusHandler({
  getBackgroundTargets: () => backgroundTargets,
  getSearchValue: () => searchValue,
  dismissSearchResults: () => {
    dismissCount += 1;
  },
  focusSearch: () => {
    focusCount += 1;
  }
});

assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(body)), true);
assert.strictEqual(focusCount, 1, 'an empty search should focus from the background');
assert.strictEqual(dismissCount, 0, 'an empty search should not dismiss results');

searchValue = 'lumno';
assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(searchLayer)), true);
assert.strictEqual(focusCount, 1, 'a populated search should not be focused again');
assert.strictEqual(dismissCount, 1, 'a populated search should dismiss its results');

searchValue = ' ';
assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(root)), true);
assert.strictEqual(focusCount, 1, 'whitespace still counts as input content');
assert.strictEqual(dismissCount, 2, 'whitespace input should follow the populated-search path');

assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent({ name: 'bookmark card' })), false);
assert.strictEqual(focusCount, 1, 'component pointer events should leave search focus unchanged');
assert.strictEqual(dismissCount, 2, 'component pointer events should not dismiss search results');

const newtabSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'newtab', 'newtab.js'),
  'utf8'
);
assert.match(
  newtabSource,
  /createBackgroundFocusHandler\(\{[\s\S]*?getSearchValue:\s*\(\)\s*=>\s*inputParts\.input\.value,[\s\S]*?dismissSearchResults:\s*dismissSearchSuggestionsFromBackground,/,
  'the New Tab background handler should branch on the live input value and dismiss populated results'
);
assert.match(
  newtabSource,
  /function restoreUserAuthoredSearchInput\(\)\s*\{[\s\S]*?autocompleteState\.rawQuery[\s\S]*?inputParts\.input\.value\s*=\s*rawQuery;[\s\S]*?latestRawQuery\s*=\s*rawQuery;[\s\S]*?clearAutocomplete\(\);/,
  'closing autocomplete should restore the exact value authored by the user'
);
assert.match(
  newtabSource,
  /function dismissSearchSuggestionsFromBackground\(\)\s*\{\s*restoreUserAuthoredSearchInput\(\);[\s\S]*?searchSuggestionsDismissed\s*=\s*true;[\s\S]*?suggestionRequestSeq\s*\+=\s*1;[\s\S]*?clearSearchSuggestions\(\);/,
  'background dismissal should restore authored input, hide results, and invalidate pending requests'
);
assert.match(
  newtabSource,
  /function restoreDismissedSearchSuggestions\(\)\s*\{[\s\S]*?searchSuggestionsDismissed\s*=\s*false;[\s\S]*?isSlashCommandInput\(query\)[\s\S]*?renderSuggestions\(\[\], query\);[\s\S]*?requestSuggestions\(query, \{ immediate: true \}\);/,
  'refocusing populated search should restore both slash-command and regular results'
);
assert.match(
  newtabSource,
  /const searchInput = inputParts\.input;\s*searchInput\.addEventListener\('focus', restoreDismissedSearchSuggestions\);/,
  'the search input should restore dismissed results when it regains focus'
);
assert.doesNotMatch(
  newtabSource,
  /onBlur:\s*function\(event\)\s*\{[\s\S]*?isSlashCommandInput\(rawValue\)[\s\S]*?event\.target\.value\s*=\s*'';/,
  'slash commands should not be erased when the search input loses focus'
);
assert.match(
  newtabSource,
  /onInput:\s*function\(event\)\s*\{\s*searchSuggestionsDismissed\s*=\s*false;/,
  'editing the input should allow suggestions to render again'
);

console.log('newtab background search focus tests passed');
