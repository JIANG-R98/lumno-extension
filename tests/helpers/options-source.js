const fs = require('fs');
const path = require('path');
const { withoutExports } = require('./closure-source');

const repoRoot = path.resolve(__dirname, '..', '..');
// The parts of the Options page runtime split out of options.js, then
// options.js, in the order options.html loads them.
const OPTIONS_RUNTIME_FILES = [
  'src/options/options-toggle-controls.js',
  'src/options/options-select-controls.js',
  'src/options/options-slider-controls.js',
  'src/options/options-forms.js',
  'src/options/options-normalizers.js',
  'src/options/options-segmented-tabs.js',
  'src/options/options-language.js',
  'src/options/options-tooltips.js',
  'src/options/options-popconfirm.js',
  'src/options/options-shortcut-reference.js',
  'src/options/options-navigation.js',
  'src/options/options-site-search-form.js',
  'src/options/options-site-search-list.js',
  'src/options/options-aggregate-search-list.js',
  'src/options/options-blacklist-lists.js',
  'src/options/options-setting-binds.js',
  'src/options/options-control-events.js',
  'src/options/options-site-search-events.js',
  'src/options/options.js'
];

// The runtime for source checks and extracted functions. The parts share
// page state as properties of one `optionsState` object; that prefix is
// dropped so checks see the code as it read inside the single options.js
// closure.
function readOptionsRuntimeSource() {
  return withoutExports(OPTIONS_RUNTIME_FILES
    .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n'))
    .replace(/\boptionsState\./g, '');
}

module.exports = { OPTIONS_RUNTIME_FILES, readOptionsRuntimeSource };
