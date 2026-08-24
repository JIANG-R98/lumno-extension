const assert = require('assert');
const fs = require('fs');
const path = require('path');
const suggestionModel = require('../src/shared/suggestion-action-model.js');

const repoRoot = path.join(__dirname, '..');

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function verifyClassification() {
  const runtime = suggestionModel;
  const directBefore = {
    type: 'directUrl',
    title: '打开 https://code.0h',
    url: 'https://code.0h'
  };
  const directAfter = {
    type: 'directUrl',
    title: '打开 https://code.0htt',
    url: 'https://code.0htt'
  };
  const history = {
    type: 'history',
    title: 'Code',
    url: 'https://code.example/'
  };
  const bookmark = {
    type: 'bookmark',
    title: 'Docs',
    url: 'https://docs.example/'
  };
  const baseState = {
    actionContextKey: '0|navigation|mixed',
    lastRenderedActionContextKey: '0|navigation|mixed'
  };

  assert.strictEqual(
    runtime.getSuggestionStructureIdentity(directBefore),
    runtime.getSuggestionStructureIdentity(directAfter),
    'a growing direct URL should keep one semantic row identity'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [directBefore, history],
      allSuggestions: [directAfter, history]
    }),
    'content',
    'a direct URL text change should be local content work'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [history],
      allSuggestions: [{ ...history }]
    }),
    'highlight',
    'identical ordered results should only update highlights'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [{
        ...history,
        score: 120,
        visitCount: 4,
        typedCount: 2,
        lastVisitTime: 100,
        reasons: ['标题前缀']
      }],
      allSuggestions: [{
        ...history,
        score: 260,
        visitCount: 9,
        typedCount: 5,
        lastVisitTime: 200,
        reasons: ['URL 前缀']
      }]
    }),
    'highlight',
    'ranking metadata must not invalidate a visible row'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [history],
      allSuggestions: [{ ...history, title: 'Code Home' }]
    }),
    'content',
    'visible row text changes still require content work'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [history],
      allSuggestions: [history, bookmark]
    }),
    'append',
    'a stable prefix plus new rows should be an append'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [history, bookmark],
      allSuggestions: [bookmark, history]
    }),
    'structure',
    'reordered semantic rows require a structure update'
  );
  assert.strictEqual(
    runtime.getSuggestionUpdateKind({
      ...baseState,
      currentSuggestions: [directBefore],
      allSuggestions: [{ ...directAfter, _xMatchedTabId: 42 }]
    }),
    'structure',
    'changing from open to switch-tab is a semantic change'
  );
}

verifyClassification();
const newtabSource = readSource('src/newtab/newtab.js');
const newtabHtml = readSource('newtab.html');
const newtabLayoutSource = readSource('src/newtab/layout.js');
const overlaySource = readSource('src/overlay/search-panel.js');

[newtabSource, overlaySource].forEach((source, index) => {
  assert.match(
    source,
    /SUGGESTION_ACTION_MODEL\.getSuggestionUpdateKind\(/,
    `${index === 0 ? 'New Tab' : 'Overlay'} should delegate update classification to the shared model`
  );
});

assert.match(
  newtabSource,
  /suggestionsView\.render\(\{[\s\S]*?if \(updateKind !== 'highlight'\) \{[\s\S]*?setSuggestionsVisible\(true\);/,
  'New Tab should publish rendered result rows without a height-interpolation phase'
);
assert.match(
  overlaySource,
  /function commitSuggestionsNaturalHeightAfterRender\(\) \{[\s\S]*?SUGGESTIONS_HEIGHT_LAYOUT\.applyNaturalSuggestionsHeightLayout\([\s\S]*?suggestionsContainer[\s\S]*?syncSearchModeMenuResultOffset\(\);/,
  'Overlay result commits should adopt natural height and publish the final menu offset synchronously'
);
assert.doesNotMatch(
  `${newtabSource}\n${newtabLayoutSource}\n${overlaySource}`,
  /captureSuggestionsHeightState|deferCappedShrink|animateSuggestionsHeight|beginSuggestionsInputSession|captureSuggestionsResizeState|animateSuggestionsResize|holdSuggestionsInputHeight|settleHeightAfterRemoteMix/,
  'New Tab and Overlay should not capture, lock, defer, or animate result height'
);
assert.match(
  newtabHtml,
  /<script src="direct-navigation-settle\.js"><\/script>/,
  'New Tab should load the direct-navigation settle controller before its page runtime'
);
assert.match(
  newtabSource,
  /const directUrlSuggestion = getDirectUrlSuggestion\(query\);[\s\S]*?hasCachedOpenTabMatch[\s\S]*?renderPendingSuggestions\(query\);[\s\S]*?deferInitialDirectNavigationRender: Boolean\([\s\S]*?directUrlSuggestion && !hasCachedOpenTabMatch/,
  'New Tab should render cached open-tab matches immediately and defer only unresolved direct-navigation placeholders'
);
assert.match(
  newtabSource,
  /createDirectNavigationSettleController\(\{[\s\S]*?delayMs: DIRECT_NAVIGATION_SETTLE_DELAY_MS,[\s\S]*?onSettle: \(\{ query, requestSeq \}\)[\s\S]*?renderPendingSuggestions\(query\);/,
  'New Tab should delegate settle timer ownership to the tested controller'
);
assert.match(
  newtabSource,
  /function requestSuggestions\(query, options\)[\s\S]*?directNavigationSettleController\.schedule\(\{[\s\S]*?query: requestQuery,[\s\S]*?requestSeq[\s\S]*?directNavigationSettleController\.cancel\(\);[\s\S]*?if \(requestLocalSearchScope\) \{\s*renderSuggestions\(localSuggestions, requestQuery\);/,
  'New Tab should cancel the provisional direct URL render when the local result arrives in time and preserve scoped local rendering'
);
assert.match(
  newtabSource,
  /function getDirectUrlSuggestion\(input\)[\s\S]*?getMatchedOpenTabForSuggestion\(suggestion\)[\s\S]*?_xMatchedTabId: matchedTab\.id/,
  'New Tab should build a cached open-tab URL result with its final title and switch identity'
);
assert.match(
  newtabSource,
  /refreshTabsForSearchContext\(\(\) => \{\}\);[\s\S]*?function resolveQuickNavigation/,
  'New Tab should warm its open-tab snapshot before the first URL input'
);
assert.match(
  overlaySource,
  /if \(isPaste \|\| getDirectUrlSuggestion\(query\)\) \{[\s\S]*?updatePendingSearchSuggestions\(query\);/,
  'Overlay should update a direct URL preview without arming a height deferral'
);
assert.match(
  newtabLayoutSource,
  /function commitSuggestionsNaturalHeightAfterRender\(\) \{[\s\S]*?SUGGESTIONS_HEIGHT_LAYOUT\.applyNaturalSuggestionsHeightLayout\([\s\S]*?suggestionsContainer/,
  'New Tab should delegate its final result height to the shared natural-height helper'
);
assert.match(
  newtabSource,
  /function requestSuggestions\(query, options\)[\s\S]*?if \(!showExactSearchPendingState\) \{\s*renderSuggestions\(localSuggestions, requestQuery\);\s*\}[\s\S]*?renderSuggestions\(remoteResponse\.suggestions, requestQuery\);/,
  'New Tab should suppress the local-result flash only for the search-first pending state before committing the remote mix'
);

console.log('suggestion render stability tests passed');
