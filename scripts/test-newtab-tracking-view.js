'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
const optionsSource = fs.readFileSync(path.join(repoRoot, 'src/options/options.js'), 'utf8');

assert.match(source, /value:\s*'tracking'[\s\S]*?labelKey:\s*'recent_mode_tracking'/,
  'the recent display menu should expose a tracking view when tracked cards exist');
assert.match(source, /mode !== 'tracking'[\s\S]*?storageArea\.set\(\{ \[RECENT_MODE_STORAGE_KEY\]: mode \}\)/,
  'tracking view should remain transient instead of becoming an appearance preference');
assert.match(source, /currentRecentMode === 'tracking'[\s\S]*?pinnedRecentSites\.filter\(\(item\) => item && item\.trackingEnabled === true\)/,
  'tracking view should render only tracked pinned cards');
assert.match(source, /leaveEmptyTrackingView\(\);/,
  'an empty tracking view should fall back to the preferred recent mode');
assert.doesNotMatch(optionsSource, /recent_mode_tracking/,
  'tracking view should not appear in Appearance settings');

console.log('New Tab tracking-view tests passed.');
