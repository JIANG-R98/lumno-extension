const assert = require('assert');
const store = require('../src/newtab/recent-sites-store.js');
const { createController } = require('../src/background/popup-recent-pin.js');

const KEY = '_x_extension_newtab_pinned_recent_sites_2026_unique_';

function memoryArea(initial) {
  const data = { ...initial };
  return {
    data,
    get(keys, callback) {
      callback(Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])));
    },
    set(values, callback) {
      Object.assign(data, values);
      callback();
    }
  };
}

function controller(area, series = false) {
  return createController({
    store,
    key: KEY,
    storeOptions: { maxPinned: 3 },
    getArea: () => area,
    probeSeries: () => Promise.resolve(series),
    createProgressId: () => 'p1'
  });
}

const page = { url: 'https://km.woa.com/articles/1', title: 'Seedance 2.5' };

(async () => {
  // A web page pins in front, and the same site then reads as pinned.
  {
    const area = memoryArea({ [KEY]: [{ url: 'https://example.com/', title: 'Example' }] });
    const pin = controller(area);
    assert.deepStrictEqual(await pin.getStatus(page), { available: true, pinned: false, full: false });
    assert.deepStrictEqual(await pin.toggle(page), { status: 'pinned', tracking: false });
    assert.deepStrictEqual(area.data[KEY].map((item) => item.url), [page.url, 'https://example.com/']);
    assert(area.data[KEY][0].pinnedAt > 0);
    const otherPage = { url: 'https://km.woa.com/articles/2', title: 'Another' };
    assert.strictEqual((await pin.getStatus(otherPage)).pinned, true, 'one card per site');
    assert.deepStrictEqual(await pin.toggle(otherPage), { status: 'unpinned' }, 'unpinning drops the site card');
    assert.deepStrictEqual(area.data[KEY].map((item) => item.url), ['https://example.com/']);
  }

  // Three cards fill the list; a fourth is refused.
  {
    const area = memoryArea({ [KEY]: ['a', 'b', 'c'].map((name) => ({ url: `https://${name}.com/`, title: name })) });
    const pin = controller(area);
    assert.deepStrictEqual(await pin.getStatus(page), { available: true, pinned: false, full: true });
    assert.deepStrictEqual(await pin.toggle(page), { status: 'limit' });
    assert.strictEqual(area.data[KEY].length, 3);
  }

  // An episode starts tracked, as when it is pinned on the New Tab.
  {
    const area = memoryArea({});
    const pin = controller(area, true);
    assert.deepStrictEqual(await pin.toggle(page), { status: 'pinned', tracking: true });
    assert.strictEqual(area.data[KEY][0].progressTracking, true);
    assert.strictEqual(area.data[KEY][0].progressId, 'p1');
  }

  // Browser pages and missing tabs cannot be pinned.
  {
    const pin = controller(memoryArea({}));
    assert.deepStrictEqual(await pin.getStatus({ url: 'chrome://settings/' }), { available: false, pinned: false, full: false });
    assert.deepStrictEqual(await pin.getStatus(null), { available: false, pinned: false, full: false });
    assert.deepStrictEqual(await pin.toggle(null), { status: 'invalid' });
  }

  // Two quick clicks toggle twice rather than both pinning.
  {
    const area = memoryArea({});
    const pin = controller(area);
    const results = await Promise.all([pin.toggle(page), pin.toggle(page)]);
    assert.deepStrictEqual(results.map((result) => result.status), ['pinned', 'unpinned']);
    assert.deepStrictEqual(area.data[KEY], []);
  }

  console.log('Popup recent pin tests passed: pin, unpin by site, limit, tracked episodes, browser pages, ordering.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
