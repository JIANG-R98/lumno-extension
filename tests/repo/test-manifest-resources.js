const assert = require('assert');

const manifestResources = require('../../scripts/check/check-manifest-resources.js');

assert.strictEqual(
  manifestResources.normalizeManifestResourcePath('assets\\images\\site-search\\tile-gg.png'),
  'assets/images/site-search/tile-gg.png'
);
assert.strictEqual(
  manifestResources.manifestResourcePatternMatchesPath(
    'assets/images/site-search/*.png',
    'assets\\images\\site-search\\tile-gg.png'
  ),
  true,
  'manifest wildcard resources should match Windows filesystem paths'
);
assert.strictEqual(
  manifestResources.manifestResourcePatternMatchesPath(
    'assets/images/site-search/*.svg',
    'assets\\images\\site-search\\tile-gg.png'
  ),
  false
);

console.log('manifest resource path tests passed');
