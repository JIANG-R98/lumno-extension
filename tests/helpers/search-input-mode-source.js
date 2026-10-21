const fs = require('fs');
const path = require('path');
const { withoutExports } = require('./closure-source');
const { moduleScript } = require('./module-script');

const repoRoot = path.resolve(__dirname, '..', '..');
const INPUT_MODE_ENTRY = 'src/shared/search/search-input-mode.js';
// The parts of the input mode controller in search/input-mode/, then
// search-input-mode.js, in the order the pages and the overlay load them.
const INPUT_MODE_FILES = [
  'src/shared/search/input-mode/controller-dom.js',
  'src/shared/search/input-mode/mode-menu-language.js',
  'src/shared/search/input-mode/prefix-visual.js',
  'src/shared/search/input-mode/prefix-content.js',
  'src/shared/search/input-mode/prefix-motion.js',
  'src/shared/search/input-mode/mode-tab-keys.js',
  'src/shared/search/input-mode/prefix-text.js',
  'src/shared/search/input-mode/mode-menu-icons.js',
  'src/shared/search/input-mode/mode-menu-search.js',
  'src/shared/search/input-mode/mode-menu-navigation.js',
  'src/shared/search/input-mode/mode-menu-render.js',
  'src/shared/search/input-mode/mode-menu-layout.js',
  'src/shared/search/input-mode/mode-menu-lifecycle.js',
  'src/shared/search/search-input-mode.js'
];

// The controller as the pages run it, for evaluating in a test context: a
// script that leaves the module's exports on LumnoSearchInputMode.
function readSearchInputModeRuntimeSource() {
  return moduleScript('src/shared/search/search-input-mode.js', 'LumnoSearchInputMode');
}

// The files for source checks: the parts share controller state as
// properties of one `inputModeState` object, which this drops so checks see
// the code as it read inside the single controller closure.
function readSearchInputModeSource() {
  return withoutExports(INPUT_MODE_FILES.map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8')).join('\n'))
    .replace(/\binputModeState\./g, '');
}

module.exports = { INPUT_MODE_ENTRY, INPUT_MODE_FILES, readSearchInputModeRuntimeSource, readSearchInputModeSource };
