const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.resolve(__dirname, '..');
const optionsHtml = readPageSource('src/options/options.html');
const optionsJs = fs.readFileSync(
  path.join(repoRoot, 'src', 'options', 'options.js'),
  'utf8'
);
const recentSettingsRow = optionsHtml.slice(
  optionsHtml.indexOf('data-i18n="settings_recent_sites_title"'),
  optionsHtml.indexOf('data-i18n="settings_newtab_width_title"')
);
const recentModeStateSource = optionsJs.slice(
  optionsJs.indexOf('function setRecentModeTabState'),
  optionsJs.indexOf('function setOverlaySizeTabState')
);

assert.match(
  optionsHtml,
  /id="_x_extension_recent_count_control_2026_unique_"/,
  'recent site cards should mount the shared range slider control'
);
assert.doesNotMatch(
  optionsHtml,
  /_x_extension_recent_count_select_2024_unique_/,
  'recent site cards should not keep the old select control'
);
assert.ok(
  recentSettingsRow.indexOf('_x_extension_recent_count_control_2026_unique_') <
    recentSettingsRow.indexOf('_x_extension_recent_mode_tabs_wrap_2024_unique_'),
  'the recent card slider should appear before the mode tabs'
);
assert.doesNotMatch(
  recentSettingsRow,
  /data-recent-mode="(?:latest|most)"[\s\S]*?<i\b/,
  'recent mode tabs should keep text labels without embedded icons'
);
assert.match(
  optionsJs,
  /kind:\s*'recent-count',[\s\S]*?id:\s*'_x_extension_recent_count_slider_2026_unique_'[\s\S]*?min:\s*0,[\s\S]*?max:\s*2,[\s\S]*?step:\s*1/,
  'recent site cards should use a 0-2 row slider'
);
assert.match(
  optionsJs,
  /normalizeRecentCount\(Math\.round\(Number\(value\)\) \* 4\)/,
  'recent slider values should preserve the existing rows-times-four storage format'
);
assert.match(
  optionsJs,
  /value:\s*currentRecentCount \/ 4/,
  'stored recent card counts should render as row values on the slider'
);
assert.doesNotMatch(
  recentModeStateSource,
  /iconClass:/,
  'the recent mode segmented control should not provide tab icons'
);

console.log('Options recent-site count slider tests passed.');
