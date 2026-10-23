const assert = require('assert');

const LumnoSuggestionActionModel = require('../../src/shared/search/suggestion-action-model.js');

const actionModel = LumnoSuggestionActionModel;

assert.ok(actionModel, 'suggestion action model should be exported');
[
  'commandNewTab',
  'commandSettings',
  'modeSwitch',
  'zenSwitch',
  'commandOpenTabs',
  'commandCopyUrl',
  'commandDocumentPip'
].forEach((type) => {
  assert.strictEqual(
    actionModel.getVisitButtonAction({ type }),
    null,
    `${type} command rows should not render a redundant action button`
  );
  const commandModel = actionModel.createSearchActionModel({
    suggestion: { type },
    isPrimaryHighlight: true,
    primaryHighlightReason: 'command'
  });
  assert.strictEqual(commandModel.alwaysHideVisitButton, true,
    `${type} command rows should keep the right-side action hidden`);
  assert.deepStrictEqual(commandModel.actionTags, [],
    `${type} command rows should not replace the removed action with an action tag`);
});
assert.strictEqual(
  actionModel.getModifierAdjustedAction('openNewTab', { openInCurrentTab: true }),
  'go',
  'Alt/Option should present open-new-tab actions as current-tab navigation'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('search', { openInCurrentTab: true }),
  'search',
  'Alt/Option should not rewrite non-new-tab actions'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('openNewTab', { openInBackgroundTab: true }),
  'openBackgroundTab',
  'Command/Ctrl should present open-new-tab actions as background-tab opening'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('go', { openInBackgroundTab: true }),
  'openBackgroundTab',
  'Command/Ctrl should present current-tab Enter actions as background-tab opening'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('openNewTab', {
    openInCurrentTab: true,
    openInBackgroundTab: true
  }),
  'go',
  'Alt/Option current-tab labels should take priority over Command/Ctrl background labels'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('switch', { openSwitchInNewTab: true }),
  'openNewTab',
  'Shift should present switch actions as open-new-tab navigation'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('switch', { openInBackgroundTab: true }),
  'openBackgroundTab',
  'Command/Ctrl should present matched open-tab switch actions as background duplicate opening'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('switch', {
    openSwitchInNewTab: true,
    openInBackgroundTab: true
  }),
  'openBackgroundTab',
  'Shift+Command/Ctrl should present matched open-tab switch actions as background duplicate opening'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('switch', { openInCurrentTab: true, openSwitchInNewTab: true }),
  'openNewTab',
  'Shift should keep switch actions as open-new-tab navigation even when Alt/Option is also held'
);
assert.strictEqual(
  actionModel.getModifierAdjustedAction('switch', {
    openInCurrentTab: true,
    openSwitchInNewTab: true,
    openInBackgroundTab: true
  }),
  'openNewTab',
  'Alt/Option should keep Shift switch labels foreground even when Command/Ctrl is also held'
);

const historySuggestion = {
  type: 'history',
  title: 'Lumno',
  url: 'https://lumno.example/'
};
assert.strictEqual(
  actionModel.shouldOpenNewTabActionInCurrentTab(historySuggestion, { openInCurrentTab: true }),
  true,
  'Alt/Option should make default open-new-tab search results eligible for current-tab navigation'
);
assert.strictEqual(
  actionModel.shouldOpenNewTabActionInCurrentTab({ type: 'googleSuggest', searchQuery: 'lumno' }, { openInCurrentTab: true }),
  false,
  'Alt/Option should not treat search suggestions as open-new-tab result actions'
);
assert.strictEqual(
  actionModel.shouldOpenSwitchActionInNewTab(
    { ...historySuggestion, _xMatchedTabId: 42 },
    { action: 'switch', openSwitchInNewTab: true }
  ),
  true,
  'Shift should make switch search results eligible for duplicate new-tab navigation'
);
assert.strictEqual(
  actionModel.shouldOpenSwitchActionInNewTab(
    { type: 'history', title: 'Missing URL', _xMatchedTabId: 42 },
    { action: 'switch', openSwitchInNewTab: true }
  ),
  false,
  'Shift should not duplicate switch results that do not have a URL to open'
);
assert.strictEqual(
  actionModel.getSearchResultOpenDisposition({ openInBackgroundTab: true }),
  'backgroundTab',
  'Command/Ctrl should request background-tab opening for search results'
);
assert.strictEqual(
  actionModel.getSearchResultOpenDisposition({
    openInCurrentTab: true,
    openInBackgroundTab: true
  }),
  'currentTab',
  'Alt/Option current-tab behavior should take priority over Command/Ctrl background opening'
);
assert.strictEqual(
  actionModel.getSearchResultOpenDisposition({
    openSwitchInNewTab: true,
    openInBackgroundTab: true
  }),
  'backgroundTab',
  'Shift can still choose the new-tab switch result while Command/Ctrl makes that new tab background'
);
assert.strictEqual(
  actionModel.getSearchResultOpenDisposition({}),
  'newTab',
  'search results that explicitly create tabs should default to foreground new tabs'
);

const normalNavigationModel = actionModel.createSearchActionModel({
  suggestion: historySuggestion,
  isPrimaryHighlight: true,
  primaryHighlightReason: 'autocomplete',
  enterAction: 'openNewTab'
});
assert.deepStrictEqual(
  normalNavigationModel.actionTags,
  [{ action: 'openNewTab' }],
  'normal mode should keep only the action label'
);
assert.strictEqual(normalNavigationModel.alwaysHideVisitButton, false);

const switchNavigationModel = actionModel.createSearchActionModel({
  suggestion: historySuggestion,
  isPrimaryHighlight: true,
  primaryHighlightReason: 'openTab',
  shouldSwitchMatchedTab: true
});
assert.deepStrictEqual(
  switchNavigationModel.actionTags,
  [{ action: 'switch' }],
  'matched tabs should keep only the switch action label'
);

const normalSearchModel = actionModel.createSearchActionModel({
  suggestion: { type: 'newtab', searchQuery: 'lumno' },
  isPrimaryHighlight: true,
  onlyKeywordSuggestions: true
});
assert.deepStrictEqual(
  normalSearchModel.actionTags,
  [{ action: 'search' }],
  'keyword search should keep only the search action label'
);

const simpleNavigationModel = actionModel.createSearchActionModel({
  suggestion: historySuggestion,
  isPrimaryHighlight: true,
  primaryHighlightReason: 'autocomplete',
  enterAction: 'openNewTab',
  simpleMode: true
});
assert.deepStrictEqual(
  simpleNavigationModel.actionTags,
  [{ action: 'openNewTab' }],
  'simple mode should keep only the plain action label'
);
assert.strictEqual(
  simpleNavigationModel.alwaysHideVisitButton,
  true,
  'simple mode should hide the decorated visit button'
);

const simpleSearchModel = actionModel.createSearchActionModel({
  suggestion: { type: 'newtab', searchQuery: 'lumno' },
  isPrimaryHighlight: true,
  onlyKeywordSuggestions: true,
  simpleMode: true
});
assert.deepStrictEqual(
  simpleSearchModel.actionTags,
  [],
  'simple mode should remove the redundant Search/Enter decoration'
);

console.log('suggestion action model tests passed');
