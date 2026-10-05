const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
// Page runtime modules split out of newtab.js, in the order newtab.html loads them.
const NEWTAB_RUNTIME_MODULES = [
  'src/newtab/site-theme-resolver.js',
  'src/newtab/url-policy.js',
  'src/newtab/recent-sites-controller.js',
  'src/newtab/site-search-providers.js',
  'src/newtab/bookmark-display-settings.js',
  'src/newtab/feedback-control.js',
  'src/newtab/shortcut-dock.js',
  'src/newtab/shortcut-context-menu.js',
  'src/newtab/bookmark-context-menu.js',
  'src/newtab/bookmark-pager.js',
  'src/newtab/search-autocomplete.js',
  'src/newtab/tooltip-bindings.js',
  'src/newtab/page-navigation.js',
  'src/newtab/shortcuts-controller.js',
  'src/newtab/shortcut-drag.js',
  'src/newtab/bookmark-drag-controller.js',
  'src/newtab/section-loaders.js'
];

// Returns newtab.js followed by the modules split out of it, so source checks
// can locate a function regardless of which file now holds it. Split modules
// reach page-owned variables through `pageState.name` accessors that map 1:1
// onto the newtab.js bindings. The prefix and the factory's extra indentation
// are dropped so checks and extracted functions see the same code they would
// in a single closure.
function readNewtabRuntimeSource() {
  const modules = NEWTAB_RUNTIME_MODULES.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')
    .replace(/^  /gm, ''));
  return [fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8'), ...modules]
    .join('\n')
    .replace(/\bpageState\./g, '');
}

module.exports = { NEWTAB_RUNTIME_MODULES, readNewtabRuntimeSource };
