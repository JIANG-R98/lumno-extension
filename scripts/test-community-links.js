const assert = require('assert');
const fs = require('fs');

const communityLinks = require('../src/shared/community-links.js');

(async () => {
  assert.strictEqual(
    communityLinks.COMMUNITY_LINKS_URL,
    'https://lumno.kubai.design/community-links.json',
    'all community surfaces should share one remote configuration endpoint'
  );
  assert.strictEqual(
    communityLinks.normalizeHttpsUrl('http://example.com/qr.webp'),
    '',
    'remote community URLs should reject insecure HTTP values'
  );

  const normalized = communityLinks.normalizeLinksPayload({
    links: {
      chrome_rating: 'https://example.com/review',
      wechat_qr: 'https://cdn.example.com/latest-qr.webp'
    },
    community_by_locale: {
      zh_CN: 'wechat',
      en: 'discord'
    }
  });
  assert.strictEqual(
    normalized.wechatQr,
    'https://cdn.example.com/latest-qr.webp',
    'the loader should accept the remote QR URL aliases used by the endpoint'
  );
  assert.strictEqual(
    communityLinks.getCommunityChannel(normalized, 'zh-CN'),
    'wechat',
    'Simplified Chinese should use the shared WeChat destination'
  );
  assert.strictEqual(
    communityLinks.getCommunityChannel(normalized, 'zh_TW'),
    'wechat',
    'Traditional Chinese should use the shared WeChat destination'
  );
  assert.strictEqual(
    communityLinks.getCommunityChannel(normalized, 'zh-HK'),
    'wechat',
    'Traditional Chinese regional locales should use the shared WeChat destination'
  );
  assert.strictEqual(
    communityLinks.getCommunityChannel(normalized, 'zh-SG'),
    'wechat',
    'Simplified Chinese regional locales should use the shared WeChat destination'
  );
  assert.strictEqual(
    communityLinks.getCommunityChannel(normalized, 'en-US'),
    'discord',
    'all non-Chinese locales should use Discord'
  );
  assert.strictEqual(
    communityLinks.getCommunityUrl(normalized, 'zh-TW'),
    'https://cdn.example.com/latest-qr.webp',
    'Traditional Chinese should resolve the dynamic QR URL'
  );
  assert.strictEqual(
    communityLinks.getCommunityUrl(normalized, 'ja'),
    communityLinks.FALLBACK_LINKS.discord,
    'Japanese should resolve the dynamic Discord destination'
  );
  const overriddenCommunity = communityLinks.normalizeLinksPayload({
    links: {
      discord: 'https://discord.example/invite'
    },
    community_by_locale: {
      zh_TW: 'discord'
    }
  });
  assert.strictEqual(
    communityLinks.getCommunityChannel(overriddenCommunity, 'zh-HK'),
    'wechat',
    'a stale remote locale map must not route Traditional Chinese users to Discord'
  );
  assert.strictEqual(
    communityLinks.getCommunityUrl(overriddenCommunity, 'zh-HK'),
    communityLinks.FALLBACK_LINKS.wechatQr,
    'Traditional Chinese should still resolve the WeChat QR URL when remote routing is stale'
  );

  const requests = [];
  let qrRevision = 1;
  const loader = communityLinks.createLoader({
    fetchImpl(url, init) {
      requests.push({ url, init });
      return Promise.resolve({
        ok: true,
        json() {
          return Promise.resolve({
            links: {
              wechatQr: `https://cdn.example.com/qr-v${qrRevision}.webp`
            }
          });
        }
      });
    },
    windowObj: {
      clearTimeout() {},
      setTimeout() {
        return 1;
      }
    }
  });

  const first = await loader.load();
  assert.strictEqual(first.wechatQr, 'https://cdn.example.com/qr-v1.webp');
  assert.strictEqual(requests[0].url, communityLinks.COMMUNITY_LINKS_URL);
  assert.strictEqual(requests[0].init.cache, 'no-store');

  qrRevision = 2;
  const cached = await loader.load();
  assert.strictEqual(cached.wechatQr, 'https://cdn.example.com/qr-v1.webp');
  assert.strictEqual(requests.length, 1, 'normal reads should share the page-level cache');

  const refreshed = await loader.load({ force: true });
  assert.strictEqual(refreshed.wechatQr, 'https://cdn.example.com/qr-v2.webp');
  assert.strictEqual(requests.length, 2, 'forced refresh should fetch the latest remote QR URL');

  let failedRequests = 0;
  const failingLoader = communityLinks.createLoader({
    fetchImpl() {
      failedRequests += 1;
      return Promise.reject(new Error('offline'));
    }
  });
  assert.deepStrictEqual(
    await failingLoader.load(),
    communityLinks.FALLBACK_LINKS,
    'remote failures should use the one shared fallback set'
  );
  await failingLoader.load();
  assert.strictEqual(
    failedRequests,
    1,
    'a failed load should cache the fallback instead of retrying for every consumer'
  );
  await failingLoader.load({ force: true });
  assert.strictEqual(
    failedRequests,
    2,
    'a forced refresh should still retry after a cached failure'
  );

  const newtabSource = fs.readFileSync('src/newtab/newtab.js', 'utf8');
  const newtabHtml = fs.readFileSync('newtab.html', 'utf8');
  const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
  const optionsHtml = fs.readFileSync('src/options/options.html', 'utf8');
  const overlaySource = fs.readFileSync('src/overlay/search-panel.js', 'utf8');
  const backgroundSource = fs.readFileSync('src/background/background.js', 'utf8');
  assert(
    !newtabSource.includes('qrcode-20260730.webp') &&
      !optionsSource.includes('qrcode-20260730.webp') &&
      !overlaySource.includes('qrcode-20260730.webp'),
    'feature surfaces should not duplicate the fallback QR URL outside the shared module'
  );
  assert(
    newtabHtml.indexOf('../shared/community-links.js') <
      newtabHtml.indexOf('../shared/engagement-notice.js'),
    'newtab should load community links before the engagement runtime'
  );
  assert(
    optionsHtml.indexOf('../shared/community-links.js') <
      optionsHtml.indexOf('../shared/react-page-bootstrap.js'),
    'Options should load community links before its page entry bootstrap'
  );
  assert(
    backgroundSource.indexOf("'src/shared/community-links.js'") <
      backgroundSource.indexOf("'src/shared/engagement-notice.js'"),
    'overlay injection should load community links before engagement actions'
  );

  console.log('community links tests passed');
})();
