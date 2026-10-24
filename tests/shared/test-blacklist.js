const assert = require('node:assert/strict');
const blacklistUtils = require('../../src/shared/blacklist-utils.ts');

function run() {
  assert.deepEqual(
    blacklistUtils.normalizeMatchModes([], 'prefix'),
    ['prefix'],
    'empty match modes should fall back to prefix when requested'
  );

  assert.deepEqual(
    blacklistUtils.normalizeMatchModes([], null),
    [],
    'empty match modes should stay empty when fallback is disabled'
  );

  assert.equal(
    blacklistUtils.normalizePattern('https://Example.com/settings?tab=1#hash', ['exact'], null),
    'example.com/settings?tab=1',
    'exact mode should normalize host casing and strip hash'
  );

  assert.equal(
    blacklistUtils.normalizePattern('example.com/docs/', ['prefix'], null),
    'example.com/docs/',
    'prefix mode should accept domain/path input without scheme'
  );

  assert.equal(
    blacklistUtils.normalizePattern('www.baidu.com/news', ['suffix'], null),
    'baidu.com',
    'whole-site mode should normalize a pasted host or URL into the base site domain'
  );

  assert.equal(
    blacklistUtils.normalizePattern('https://example.com/settings', ['suffix'], null),
    'example.com',
    'whole-site mode should accept pasted URLs and keep only the site domain'
  );

  assert.deepEqual(
    blacklistUtils.normalizeItems([
      'example.com/a',
      { pattern: 'example.com/a', matchModes: ['prefix'] },
      { pattern: 'example.com/a', matchModes: ['exact'] }
    ], 'prefix'),
    [
      { pattern: 'example.com/a', matchModes: ['prefix'] },
      { pattern: 'example.com/a', matchModes: ['exact'] }
    ],
    'items should dedupe by pattern + match mode, not pattern alone'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://example.com/docs/article#section', [
      { pattern: 'example.com/docs/', matchModes: ['prefix'] }
    ]),
    true,
    'prefix rules should match normalized URLs and ignore hashes'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('http://example.com/a', [
      { pattern: 'example.com/a', matchModes: ['exact'] }
    ]),
    true,
    'exact rules should not depend on http vs https input'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://www.baidu.com/', [
      { pattern: 'baidu.com/', matchModes: ['exact'] }
    ]),
    true,
    'exact rules should treat bare and www hosts as the same root page'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://baidu.com/settings?tab=1', [
      { pattern: 'www.baidu.com/settings?tab=1', matchModes: ['exact'] }
    ]),
    true,
    'exact rules should treat bare and www hosts as the same page path'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://www.baidu.com/search?wd=test', [
      { pattern: 'baidu.com/', matchModes: ['exact'] }
    ]),
    false,
    'exact rules should still reject deeper paths that were not configured'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://www.baidu.com/docs/article', [
      { pattern: 'baidu.com/docs/', matchModes: ['prefix'] }
    ]),
    true,
    'prefix rules should treat bare and www hosts as the same site path'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://baidu.com/docs/article', [
      { pattern: 'www.baidu.com/docs/', matchModes: ['prefix'] }
    ]),
    true,
    'prefix rules should also work in the reverse www-to-bare direction'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://m.baidu.com/', [
      { pattern: 'baidu.com', matchModes: ['suffix'] }
    ]),
    true,
    'whole-site rules should match subdomains under the same site'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://tieba.baidu.com/f', [
      { pattern: 'www.baidu.com', matchModes: ['suffix'] }
    ]),
    true,
    'whole-site rules should work even if the saved domain was entered with www'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('chrome://extensions', [
      { pattern: 'extensions', matchModes: ['suffix'] }
    ]),
    false,
    'non-http URLs should not be matched by whole-site rules'
  );

  assert.equal(
    blacklistUtils.isUrlBlocked('https://baidu.net/', [
      { pattern: 'baidu.com', matchModes: ['suffix'] }
    ]),
    false,
    'whole-site rules should not match different registrable domains'
  );
}

run();
console.log('blacklist tests passed');
