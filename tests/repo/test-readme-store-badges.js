const assert = require('assert');
const fs = require('fs');
const path = require('path');

const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
const badgeAssets = [
  'chrome-web-store-large-bordered.png',
  'microsoft-edge-addons-badge.png',
  'firefox-get-the-addon-badge.png'
];

const widths = badgeAssets.map((name) => {
  const match = readme.match(new RegExp(
    `<img[^>]+src="\\./assets/images/readme/${name}"[^>]+width="(\\d+)"`
  ));
  assert.ok(match, `missing store badge markup for ${name}`);
  return Number(match[1]);
});

assert.ok(widths.every((width) => width === widths[0]), 'store badges must use the same width');

assert.ok(
  /chrome-web-store-large-bordered\.png[\s\S]*?<\/a><br \/>[\s\S]*?microsoft-edge-addons-badge\.png[\s\S]*?<\/a><br \/>[\s\S]*?firefox-get-the-addon-badge\.png/.test(readme),
  'store badges must be stacked vertically: Chrome, Edge, then Firefox'
);

// A release badge rather than a version number written into the README, so
// the README never falls behind a release.
assert.ok(
  /firefox-get-the-addon-badge\.png[\s\S]*?<p align="center">\s*<a href="https:\/\/github\.com\/kubai087\/lumno-extension\/releases\/latest"><img src="https:\/\/img\.shields\.io\/github\/v\/release\/kubai087\/lumno-extension\?/.test(readme),
  'the latest release badge must be centered below the store badges'
);

console.log('README store badge layout test passed');
