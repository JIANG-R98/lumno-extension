const assert = require('assert');
const path = require('path');
const { SURFACES, openSearchSurface } = require('../helpers/search-surfaces');

const repoRoot = path.resolve(__dirname, '..', '..');
const preview = require(path.join(repoRoot, 'src/domain/search/suggestion-input-preview.ts'));

// Moving onto a search engine suggestion with the arrow keys writes its query
// into the input, as the address bar does
// (https://github.com/kubai087/lumno-extension/issues/124).

const LOCAL = [
  { type: 'history', title: 'GitHub', url: 'https://github.com/' },
  { type: 'history', title: 'git - Brave Search', url: 'https://search.brave.com/search?q=git' }
];
const ENGINE = ['github desktop', 'github copilot'].map((query) => ({
  type: 'googleSuggest',
  title: query,
  url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
  searchQuery: query,
  forceSearch: true
}));

function testController() {
  const input = {
    value: 'git',
    setSelectionRange(start, end) {
      this.selection = [start, end];
    }
  };
  const controller = preview.createSuggestionInputPreview();
  controller.show(input, LOCAL[0], 'git');
  assert.strictEqual(input.value, 'git', 'a page row leaves the typed text');
  assert.strictEqual(controller.isActive(), false);
  controller.show(input, ENGINE[0], 'git');
  assert.strictEqual(input.value, 'github desktop');
  assert.deepStrictEqual(input.selection, [14, 14], 'the caret goes to the end');
  controller.show(input, { type: 'newtab', searchQuery: 'git' }, 'git ');
  assert.strictEqual(input.value, 'git ', 'the search action row puts back exactly what was typed');
  assert.strictEqual(controller.restore(input, 'git'), false, 'nothing to restore once it is back');
  controller.show(input, ENGINE[1], 'git');
  assert.strictEqual(controller.commit(), true);
  assert.strictEqual(controller.restore(input, 'git'), false, 'a committed suggestion stays');
  assert.strictEqual(input.value, 'github copilot');

  assert.strictEqual(preview.getSuggestionEditText(LOCAL[0]), 'github.com', 'https:// and a lone slash are dropped');
  assert.strictEqual(preview.getSuggestionEditText(LOCAL[1]), 'search.brave.com/search?q=git');
  assert.strictEqual(preview.getSuggestionEditText({ type: 'bookmark', url: 'http://localhost:3000/docs' }),
    'http://localhost:3000/docs', 'http:// and the port stay');
  assert.strictEqual(preview.getSuggestionEditText(ENGINE[0]), '', 'a search suggestion has no address to edit');
  assert.strictEqual(controller.editAddress(input, { type: 'openTab', url: 'https://a.test/' }), false);
  assert.strictEqual(controller.editAddress(input, LOCAL[1]), true);
  assert.strictEqual(input.value, 'search.brave.com/search?q=git');
}

function respond(message) {
  if (message.action === 'getSearchSuggestions') return { suggestions: LOCAL };
  if (message.action === 'getTabsForOverlay' || message.action === 'getTabs') return { tabs: [] };
  if (message.action === 'getSearchEngineSuggestions') {
    return { suggestions: (message.localSuggestions || []).concat(ENGINE), hasRemoteSuggestions: true };
  }
  return undefined;
}

async function openWithSuggestions(name, query) {
  const surface = await openSearchSurface(name, { respond });
  await surface.type(query || 'git');
  await surface.waitFor(() => rowIndex(surface, 'github desktop') >= 0, `${name}: engine suggestions should show`);
  await surface.settle(60);
  return surface;
}

// Rows also read their number shortcut and action label.
function rowIndex(surface, text) {
  return surface.suggestions().findIndex((row) => row.textContent.includes(text));
}

// Presses ArrowDown until the row reading `text` is selected.
async function selectRow(surface, text) {
  const target = rowIndex(surface, text);
  assert.ok(target >= 0, `${surface.name}: a row should read ${text}`);
  for (let step = 0; step <= surface.suggestions().length && surface.selectedIndex() !== target; step += 1) {
    surface.press('ArrowDown');
    await surface.settle(20);
  }
  assert.strictEqual(surface.selectedIndex(), target, `${surface.name}: the arrows should reach ${text}`);
}

async function testArrowsShowTheSuggestion(name) {
  const surface = await openWithSuggestions(name);
  const typedHighlight = surface.selectedIndex();
  await selectRow(surface, 'github desktop');
  assert.strictEqual(surface.input().value, 'github desktop', `${name}: the selected suggestion fills the input`);
  surface.press('ArrowDown');
  await surface.settle(20);
  assert.strictEqual(surface.input().value, 'github copilot', `${name}: the next suggestion replaces it`);
  await selectRow(surface, 'GitHub');
  assert.strictEqual(surface.input().value, 'git', `${name}: a page row shows what was typed`);
  await selectRow(surface, 'github desktop');
  surface.press('Escape');
  await surface.settle(40);
  assert.strictEqual(surface.input().value, 'git', `${name}: Escape puts back what was typed`);
  assert.strictEqual(surface.selectedIndex(), typedHighlight, `${name}: Escape goes back to the highlight as typed`);
  assert.ok(surface.suggestions().length > 0, `${name}: the first Escape keeps the results open`);
  surface.close();
}

async function testEnterSearchesTheSuggestion(name) {
  const surface = await openWithSuggestions(name);
  await selectRow(surface, 'github desktop');
  surface.press('Enter');
  await surface.settle(120);
  assert.deepStrictEqual(surface.navigation(), { search: 'github desktop' }, `${name}: Enter searches the suggestion`);
  surface.close();
}

async function testTypingKeepsTheSuggestion(name) {
  const surface = await openWithSuggestions(name);
  await selectRow(surface, 'github desktop');
  await surface.type('github desktop app');
  await surface.settle(150);
  assert.strictEqual(surface.input().value, 'github desktop app', `${name}: typing on keeps the suggestion as typed text`);

  const tabbed = await openWithSuggestions(name);
  await selectRow(tabbed, 'github copilot');
  tabbed.press('Tab');
  await tabbed.settle(150);
  assert.strictEqual(tabbed.input().value, 'github copilot', `${name}: Tab takes the suggestion`);
  assert.ok(tabbed.page.messages.some((message) => (
    message.action === 'getSearchSuggestions' && message.query === 'github copilot'
  )), `${name}: Tab lists results for the suggestion`);
  surface.close();
  tabbed.close();
}

// Tab on a page the arrows selected puts its address in the input; Enter
// then opens what was edited.
async function testTabEditsPageAddress(name) {
  const surface = await openWithSuggestions(name);
  await selectRow(surface, 'git - Brave Search');
  assert.strictEqual(surface.input().value, 'git', `${name}: the arrows alone leave a page row's address out`);
  surface.press('Tab');
  await surface.settle(150);
  assert.strictEqual(surface.input().value, 'search.brave.com/search?q=git', `${name}: Tab takes the page's address`);
  await surface.type('search.brave.com/search?q=github');
  await surface.settle(150);
  surface.press('Enter');
  await surface.settle(150);
  assert.deepStrictEqual(surface.navigation(), { url: 'https://search.brave.com/search?q=github' },
    `${name}: Enter opens the edited address`);
  surface.close();
}

// Typed text that names a site search ("yt") would switch the scope on Tab;
// with a suggestion shown, Tab takes the suggestion instead.
async function testTabOverSiteSearchTrigger(name) {
  const surface = await openWithSuggestions(name, 'yt');
  await selectRow(surface, 'github copilot');
  surface.press('Tab');
  await surface.settle(150);
  assert.strictEqual(surface.scopeLabel(), '', `${name}: Tab should not open the typed site search`);
  assert.strictEqual(surface.input().value, 'github copilot', `${name}: Tab takes the suggestion`);
  surface.close();
}

(async () => {
  testController();
  for (const name of SURFACES) {
    await testArrowsShowTheSuggestion(name);
    await testEnterSearchesTheSuggestion(name);
    await testTypingKeepsTheSuggestion(name);
    await testTabOverSiteSearchTrigger(name);
    await testTabEditsPageAddress(name);
  }
  console.log('suggestion input preview tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
