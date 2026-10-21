const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const OPTIONS_ENTRY = 'src/options/options.js';
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
// page state as properties of one `optionsState` object; the factory's extra
// indentation and that prefix are dropped so checks see the code as it read
// inside the single options.js closure.
function readOptionsRuntimeSource() {
  return OPTIONS_RUNTIME_FILES.map((file) => {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    return file === OPTIONS_ENTRY ? source : source.replace(/^  /gm, '');
  }).join('\n').replace(/\boptionsState\./g, '');
}

module.exports = { OPTIONS_RUNTIME_FILES, readOptionsRuntimeSource };
