const assert = require('assert');
const { getRiSvg } = require('../../src/shared/ui/remix-icon.ts');

// Remix Icon markup shared by every surface.

assert.strictEqual(getRiSvg('ri-search-line'),
  '<i class="ri-icon ri-size-16 ri-search-line" aria-hidden="true"></i>', 'the default size is 16');
assert.strictEqual(getRiSvg('ri-close-line', 'ri-size-12'),
  '<i class="ri-icon ri-size-12 ri-close-line" aria-hidden="true"></i>');
assert.strictEqual(getRiSvg('ri-close-line', 'ri-size-12', 'is-muted'),
  '<i class="ri-icon ri-size-12 is-muted ri-close-line" aria-hidden="true"></i>', 'extra classes come before the glyph');

console.log('remix icon tests passed');
