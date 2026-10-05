const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readNewtabRuntimeSource } = require('./helpers/newtab-source');

const repoRoot = path.resolve(__dirname, '..');
const newtabJs = readNewtabRuntimeSource();

function assertContains(source, needle, message) {
  assert.ok(source.includes(needle), message);
}

function assertMatches(source, pattern, message) {
  assert.ok(pattern.test(source), message);
}

assertContains(
  newtabJs,
  'function setVisibleThemeMode(mode) {',
  'newtab mode command should use a dedicated visible-theme setter'
);

assertMatches(
  newtabJs,
  /function getScopedThemeMode\(\) \{[\s\S]*?return isNewtabThemeFollowingGlobal\(\) \? globalThemeMode : newtabThemeMode;[\s\S]*?\}/,
  'New Tab should keep its local override as the effective appearance mode when configured'
);

assertMatches(
  newtabJs,
  /function getSelectedThemeMode\(\) \{[\s\S]*?if \(newtabThemeScope !== 'home'\) \{[\s\S]*?return globalThemeMode;[\s\S]*?\}[\s\S]*?return isNewtabThemeFollowingGlobal\(\) \? 'system' : newtabThemeMode;[\s\S]*?\}/,
  'New Tab appearance controls should display global and New Tab-specific theme selections separately'
);

assertMatches(
  newtabJs,
  /function setThemeMode\(mode\) \{[\s\S]*?const isEditingNewtabTheme = newtabThemeScope === 'home';[\s\S]*?const targetKey = isEditingNewtabTheme[\s\S]*?\? NEWTAB_THEME_MODE_STORAGE_KEY[\s\S]*?: THEME_STORAGE_KEY;/,
  'New Tab appearance picker should write the selected Global or New Tab-specific theme scope'
);

assertMatches(
  newtabJs,
  /function setVisibleThemeMode\(mode\) \{[\s\S]*?if \(isNewtabThemeFollowingGlobal\(\)\) \{[\s\S]*?setGlobalThemeMode\(nextMode\);[\s\S]*?return;[\s\S]*?storageArea\.set\(\{ \[NEWTAB_THEME_MODE_STORAGE_KEY\]: nextStoredMode \}/,
  'newtab /mode should update the New Tab-specific override when it controls the visible theme'
);

assertMatches(
  newtabJs,
  /if \(suggestion\.type === 'modeSwitch'\) \{[\s\S]*?setVisibleThemeMode\(suggestion\.nextMode\);/,
  'rendered mode suggestions should switch the visible New Tab theme'
);

assertMatches(
  newtabJs,
  /if \((?:!localSearchScopeState && )?isModeCommand\(query\)\) \{[\s\S]*?setVisibleThemeMode\(getNextThemeMode\(currentThemeMode\)\);/,
  'pressing Enter on /mode should switch the visible New Tab theme'
);

assertMatches(
  newtabJs,
  /if \(selectedSuggestion\.type === 'modeSwitch'\) \{[\s\S]*?setVisibleThemeMode\(selectedSuggestion\.nextMode\);/,
  'selected modeSwitch suggestions should switch the visible New Tab theme'
);

console.log('newtab mode command tests passed');
