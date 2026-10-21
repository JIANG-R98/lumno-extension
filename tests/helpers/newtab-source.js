const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
// Page runtime modules split out of newtab.js, in the order newtab.html loads them.
const NEWTAB_RUNTIME_MODULES = [
  'src/newtab/page-state.js',
  'src/newtab/theme/site-theme-resolver.js',
  'src/newtab/url-policy.js',
  'src/newtab/recent/recent-sites-controller.js',
  'src/newtab/search/site-search-providers.js',
  'src/newtab/bookmarks/bookmark-display-settings.js',
  'src/newtab/feedback-control.js',
  'src/newtab/shortcuts/shortcut-dock.js',
  'src/newtab/shortcuts/shortcut-context-menu.js',
  'src/newtab/bookmarks/bookmark-context-menu.js',
  'src/newtab/bookmarks/bookmark-pager.js',
  'src/newtab/search/search-autocomplete.js',
  'src/newtab/tooltip-bindings.js',
  'src/newtab/page-navigation.js',
  'src/newtab/shortcuts/shortcuts-controller.js',
  'src/newtab/shortcuts/shortcut-drag.js',
  'src/newtab/bookmarks/bookmark-drag-controller.js',
  'src/newtab/recent/recent-card-drag.js',
  'src/newtab/section-loaders.js',
  'src/newtab/theme/card-themes.js',
  'src/newtab/search/search-modes.js',
  'src/newtab/search/search-navigation.js',
  'src/newtab/search/suggestions-controller.js',
  'src/newtab/top-content/top-content.js',
  'src/newtab/mode-commands.js',
  'src/newtab/page-preferences.js',
  'src/newtab/appearance-modes.js',
  'src/newtab/section-headers.js',
  'src/newtab/recent/recent-mode-switch.js',
  'src/newtab/input-focus.js',
  'src/newtab/entry-motion.js',
  'src/newtab/bookmarks/folder-colors.js',
  'src/newtab/page-layout.js',
  'src/newtab/page-language.js',
  'src/newtab/clipboard-actions.js',
  'src/newtab/section-mode-select.js',
  'src/newtab/shortcuts/shortcut-page-actions.js',
  'src/newtab/bookmarks/bookmark-actions.js',
  'src/newtab/recent/recent-sources.js',
  'src/newtab/wallpaper/wallpaper-page.js',
  'src/newtab/search/default-search-engine.js',
  'src/newtab/settings-sync.js',
  'src/newtab/startup-preferences.js',
  'src/newtab/search/search-settings-sync.js',
  'src/newtab/theme/page-favicons.js',
  'src/newtab/tooltip-controllers.js',
  'src/newtab/bookmarks/bookmark-section.js',
  'src/newtab/recent/recent-section.js',
  'src/newtab/search/search-box.js',
  'src/newtab/page-notices.js',
  'src/newtab/search/search-box-controls.js',
  'src/newtab/theme/glass-surfaces.js',
  'src/newtab/search/search-mode-controller.js',
  'src/newtab/page-keyboard.js',
  'src/newtab/search/site-search-runtime.js',
  'src/newtab/section-reload.js',
  'src/newtab/startup-storage.js',
  'src/newtab/viewport-insets.js',
  'src/newtab/shortcuts/bottom-dock-runtime.js',
  'src/newtab/search/suggestions-layout.js',
  'src/newtab/bookmarks/bookmark-cascade-actions.js',
  'src/newtab/page-resize.js',
  'src/newtab/search/search-input-composition.js'
];

// Returns newtab.js followed by the modules split out of it, so source checks
// can locate a function regardless of which file now holds it. newtab.js and
// the split modules share page state as properties of one `pageState`
// object. The prefix and the factory's extra indentation are dropped so
// checks and extracted functions see the same code they would in a single
// closure, with page state as plain variables.
function readNewtabRuntimeSource() {
  const modules = NEWTAB_RUNTIME_MODULES.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')
    .replace(/^  /gm, ''));
  return [fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8'), ...modules]
    .join('\n')
    .replace(/\bpageState\./g, '');
}

module.exports = { NEWTAB_RUNTIME_MODULES, readNewtabRuntimeSource };
