const assert = require('assert');
const fs = require('fs');
const path = require('path');
const siteDisplayName = require('../src/shared/site-display-name.js');

const repoRoot = path.resolve(__dirname, '..');
const newtabHtml = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const newtabJs = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.js'), 'utf8');
const sharedSource = fs.readFileSync(
  path.join(repoRoot, 'src/shared/site-display-name.js'),
  'utf8'
);

assert.strictEqual(
  siteDisplayName.getSiteDisplayName('www.github.com', 'Repository'),
  'GitHub',
  'known brands should use their stable display names'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('docs.github.com', 'Documentation'),
  'GitHub',
  'known brand names should apply to subdomains'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('weibo.com', 'Home'),
  'Weibo',
  'shared brand defaults should remain locale-neutral'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('login.example.co.uk', 'Example Account | Sign in'),
  'Sign in',
  'noisy subdomains should prefer a concise title candidate'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('product.example.com.cn', 'Example Product'),
  'Example',
  'multi-part public suffixes should keep the registrable host label'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('', 'Fallback Title'),
  'Fallback Title',
  'missing hosts should fall back to the page title'
);
assert.strictEqual(
  siteDisplayName.getSiteDisplayName('mp.weixin.qq.com', 'Article', {
    getBrandName(host, fallback) {
      return host === 'mp.weixin.qq.com' ? 'WeChat Official' : fallback;
    }
  }),
  'WeChat Official',
  'callers should be able to localize a known brand without rebuilding the brand map'
);

const sharedScriptPath = '../shared/site-display-name.js';
assert.ok(
  newtabHtml.includes(`<script src="${sharedScriptPath}"></script>`),
  'newtab should load the shared site display-name resolver'
);
assert.ok(
  newtabHtml.indexOf(`<script src="${sharedScriptPath}"></script>`) <
    newtabHtml.indexOf('data-page-entry="../newtab/newtab.js"'),
  'the shared resolver should load before the newtab runtime entry'
);
assert.ok(
  newtabJs.includes('const SITE_DISPLAY_NAME = globalThis.LumnoSiteDisplayName || {};') &&
    newtabJs.includes("typeof SITE_DISPLAY_NAME.getSiteDisplayName !== 'function'") &&
    newtabJs.includes('return SITE_DISPLAY_NAME.getSiteDisplayName('),
  'newtab should require and delegate to the shared resolver'
);
assert.ok(
  !newtabJs.includes('const brandMap = {') &&
    !newtabJs.includes('const noisySubdomains = new Set([') &&
    sharedSource.indexOf('const DEFAULT_BRAND_NAMES') <
      sharedSource.indexOf('function getSiteDisplayName'),
  'static resolver data should be initialized once in the shared module'
);

console.log('site display name tests passed');
