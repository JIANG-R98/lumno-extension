const fs = require('fs');
const path = require('path');
const { withoutExports } = require('./closure-source');

const repoRoot = path.resolve(__dirname, '..', '..');
// The parts of the overlay panel split out into src/overlay/panel/, then
// search-panel.js, in the order the overlay injection list loads them.
const OVERLAY_PANEL_FILES = [
  'src/overlay/panel/entry-motion.js',
  'src/overlay/panel/panel-language.js',
  'src/overlay/panel/default-search-engine.js',
  'src/overlay/panel/panel-session.js',
  'src/overlay/panel/favicon-policy.js',
  'src/overlay/panel/page-guards.js',
  'src/overlay/panel/results-layout.js',
  'src/overlay/panel/slash-commands.js',
  'src/overlay/panel/panel-theme.js',
  'src/overlay/panel/suggestion-themes.js',
  'src/overlay/panel/result-activation.js',
  'src/overlay/panel/tab-matching.js',
  'src/overlay/panel/autocomplete.js',
  'src/overlay/panel/site-search-providers.js',
  'src/overlay/panel/search-mode-menu.js',
  'src/overlay/panel/search-modes.js',
  'src/overlay/panel/search-input-events.js',
  'src/overlay/panel/panel-keys.js',
  'src/overlay/panel/suggestions-render.js',
  'src/overlay/panel/suggestion-sources.js',
  'src/overlay/panel/remote-suggestions.js',
  'src/overlay/panel/copy-actions.js',
  'src/overlay/panel/panel-notices.js',
  'src/overlay/panel/settings-sync.js',
  'src/overlay/search-panel.js'
];

// The panel source for source checks and extracted functions. The parts
// share panel state as properties of one `overlayState` object; that prefix
// is dropped so checks see the code as it read inside the single panel
// closure.
function readOverlayPanelSource() {
  return withoutExports(OVERLAY_PANEL_FILES
    .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n'))
    .replace(/\boverlayState\./g, '');
}

module.exports = { OVERLAY_PANEL_FILES, readOverlayPanelSource };
