const assert = require('assert');
const settings = require('../../src/shared/settings.js');
const { loadBackground } = require('../helpers/background-harness');

// The background worker caches shortcut icons by page. A miss is not
// cached, a hit is, and changing the favicon policy (the request exclusion
// list or enhanced fetching) drops what it has, including answers still in
// flight. An explicit refresh never joins an older request.

function png(width, marker) {
  const buffer = Buffer.alloc(25);
  buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(width, 20);
  buffer[24] = marker;
  return buffer;
}

// A worker whose network answers with `answer(url)`: an image, null for a
// failed request, or a promise of either.
function openWorker() {
  const requests = [];
  const worker = { answer: () => png(64, 1) };
  const background = loadBackground({
    extensionUrls: true,
    sync: { [settings.FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY]: true },
    fetch: async (url) => {
      const resource = String(url);
      requests.push(resource);
      // The placeholder probe answers with distinct bytes, so page icons are
      // never mistaken for it.
      const image = await (resource.includes('lumno.invalid') ? png(16, 0) : worker.answer(resource));
      return { ok: Boolean(image), url: resource, headers: { get: () => '' }, blob: async () => new Blob([image || ''], { type: 'image/png' }) };
    }
  });
  worker.requests = requests;
  worker.icon = async (pageUrl, refresh) => {
    const response = await background.sendMessage({ action: 'getShortcutFaviconData', pageUrl, refresh: refresh === true }, undefined, 5000);
    return response && response.data ? Buffer.from(response.data.split(',')[1], 'base64')[24] : null;
  };
  worker.change = (key, newValue) => {
    background.storage.sync.data[key] = newValue;
    background.storage.onChanged.dispatch({ [key]: { newValue } }, 'sync');
  };
  return worker;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function testMissesHitsAndPolicyChanges() {
  const worker = openWorker();
  worker.answer = () => null;
  assert.strictEqual(await worker.icon('https://temporary-miss.example/'), null);
  worker.answer = () => png(64, 2);
  assert.strictEqual(await worker.icon('https://temporary-miss.example/'), 2,
    'a temporary cache/network miss must be retried without waiting for policy invalidation');
  const afterHit = worker.requests.length;
  assert.strictEqual(await worker.icon('https://temporary-miss.example/'), 2);
  assert.strictEqual(worker.requests.length, afterHit, 'a found icon should be answered from the cache');

  worker.answer = () => png(64, 3);
  worker.change(settings.FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, []);
  assert.strictEqual(await worker.icon('https://temporary-miss.example/'), 3, 'favicon blacklist changes should invalidate shortcut favicon results');
  worker.answer = () => png(64, 4);
  worker.change(settings.FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY, false);
  assert.strictEqual(await worker.icon('https://temporary-miss.example/'), 4, 'enhanced-fetch setting changes should invalidate shortcut favicon results');
}

async function testOldAnswersDoNotReturn() {
  const worker = openWorker();
  const old = deferred();
  worker.answer = () => old.promise;
  const staleRequest = worker.icon('https://stale.example/');
  await new Promise((resolve) => setTimeout(resolve, 50));
  worker.change(settings.FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, []);
  worker.answer = () => png(64, 5);
  assert.strictEqual(await worker.icon('https://stale.example/'), 5);
  old.resolve(png(64, 6));
  await staleRequest;
  assert.strictEqual(await worker.icon('https://stale.example/'), 5,
    'an old in-flight request should not repopulate the cache after policy invalidation');

  // Nothing newer asked: the old answer still is not kept.
  const lone = deferred();
  worker.answer = () => lone.promise;
  const loneRequest = worker.icon('https://lone.example/');
  await new Promise((resolve) => setTimeout(resolve, 50));
  worker.change(settings.FAVICON_REQUEST_BLACKLIST_STORAGE_KEY, []);
  lone.resolve(png(64, 9));
  await loneRequest;
  worker.answer = () => png(64, 10);
  assert.strictEqual(await worker.icon('https://lone.example/'), 10,
    'an answer from before a policy change should not be cached');

  const automatic = deferred();
  worker.answer = () => automatic.promise;
  const beforeRefresh = worker.icon('https://refresh.example/');
  await new Promise((resolve) => setTimeout(resolve, 50));
  worker.answer = () => png(64, 7);
  assert.strictEqual(await worker.icon('https://refresh.example/', true), 7, 'an explicit refresh must not join an older automatic request');
  automatic.resolve(png(64, 8));
  await beforeRefresh;
  assert.strictEqual(await worker.icon('https://refresh.example/'), 7, 'a late automatic response must not overwrite the refreshed result');
}

(async () => {
  await testMissesHitsAndPolicyChanges();
  await testOldAnswersDoNotReturn();
  console.log('shortcut favicon policy cache tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
