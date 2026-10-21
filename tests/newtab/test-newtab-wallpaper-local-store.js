const assert = require('assert');

const wallpaperStoreApi = require('../../src/newtab/wallpaper-local-store.js');

function dataUrlBytes(dataUrl) {
  return Buffer.from(String(dataUrl).split(',')[1] || '', 'base64').byteLength;
}

function createStore(options) {
  const settings = options || {};
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        drawImage() {},
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low'
      };
    },
    toDataURL(type, quality) {
      assert.strictEqual(type, 'image/webp');
      const byteLength = quality > 0.7
        ? wallpaperStoreApi.MAX_WALLPAPER_BYTES + 1
        : (settings.outputBytes || 100);
      return `data:image/webp;base64,${Buffer.alloc(byteLength, 1).toString('base64')}`;
    }
  };
  class FakeFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,c291cmNl';
      this.onload();
    }
  }
  class FakeImage {
    set src(_value) {
      this.naturalWidth = settings.width || 4000;
      this.naturalHeight = settings.height || 3000;
      this.onload();
    }
  }
  return wallpaperStoreApi.createWallpaperLocalStore({
    documentObj: { createElement: () => canvas },
    windowObj: {
      FileReader: FakeFileReader,
      Image: FakeImage
    }
  });
}

function createIndexedDbWindow(records, calls) {
  const itemsByKey = new Map((records || []).map((record) => [record.key, record]));
  const metrics = calls || { get: [], getAll: 0, open: 0 };
  return {
    indexedDB: {
      open() {
        metrics.open += 1;
        const openRequest = {};
        setTimeout(() => {
          const db = {
            close() {},
            transaction() {
              let pending = 0;
              const transaction = {
                error: null,
                objectStore() {
                  return {
                    get(key) {
                      metrics.get.push(key);
                      pending += 1;
                      const request = {};
                      setTimeout(() => {
                        request.result = itemsByKey.get(key);
                        if (request.onsuccess) {
                          request.onsuccess();
                        }
                        pending -= 1;
                        if (pending === 0) {
                          setTimeout(() => {
                            if (transaction.oncomplete) {
                              transaction.oncomplete();
                            }
                          }, 0);
                        }
                      }, 0);
                      return request;
                    },
                    getAll() {
                      metrics.getAll += 1;
                      return {};
                    }
                  };
                }
              };
              return transaction;
            }
          };
          openRequest.result = db;
          if (openRequest.onsuccess) {
            openRequest.onsuccess();
          }
        }, 0);
        return openRequest;
      }
    }
  };
}

async function run() {
  assert.strictEqual(wallpaperStoreApi.MAX_SOURCE_BYTES, 25 * 1024 * 1024);
  assert.strictEqual(wallpaperStoreApi.MAX_CSS_URL_LENGTH, 2 * 1024 * 1024);
  // The page applies a wallpaper through a CSS custom property, which Chrome drops past 2 MB, so
  // the largest allowed WebP must still fit there as url("data:…").
  const largestWallpaperCssValue =
    `url("data:image/webp;base64,${Buffer.alloc(wallpaperStoreApi.MAX_WALLPAPER_BYTES).toString('base64')}")`;
  assert(largestWallpaperCssValue.length <= wallpaperStoreApi.MAX_CSS_URL_LENGTH);
  assert.strictEqual(wallpaperStoreApi.MAX_THUMBNAIL_BYTES, 160 * 1024);
  assert.deepStrictEqual(
    Array.from(wallpaperStoreApi.ACCEPTED_SOURCE_MIME_TYPES),
    ['image/jpeg', 'image/png', 'image/webp']
  );

  const record = await createStore().buildRecordFromFile({
    type: 'image/png',
    size: 5 * 1024 * 1024,
    name: 'wallpaper.png'
  });
  assert.strictEqual(record.width, 2560);
  assert.strictEqual(record.height, 1440);
  assert(dataUrlBytes(record.imageDataUrl) <= wallpaperStoreApi.MAX_WALLPAPER_BYTES);
  assert(dataUrlBytes(record.thumbnailDataUrl) <= wallpaperStoreApi.MAX_THUMBNAIL_BYTES);
  assert.match(record.imageDataUrl, /^data:image\/webp;base64,/);

  await assert.rejects(
    () => createStore().buildRecordFromFile({
      type: 'image/png',
      size: wallpaperStoreApi.MAX_SOURCE_BYTES + 1,
      name: 'huge.png'
    }),
    /source file is too large/
  );
  await assert.rejects(
    () => createStore().buildRecordFromFile({ type: 'image/svg+xml', size: 100, name: 'polyglot.svg' }),
    /Invalid image file/
  );
  await assert.rejects(
    () => createStore({ width: 9000, height: 100 }).buildRecordFromFile({
      type: 'image/webp',
      size: 100,
      name: 'wide.webp'
    }),
    /source dimensions are too large/
  );

  const selectedId = 'custom-wallpaper-selected';
  const indexedDbCalls = { get: [], getAll: 0, open: 0 };
  const indexedDbStore = wallpaperStoreApi.createWallpaperLocalStore({
    documentObj: {},
    windowObj: createIndexedDbWindow([{
      id: selectedId,
      key: selectedId,
      imageDataUrl: 'data:image/webp;base64,selected',
      thumbnailDataUrl: 'data:image/webp;base64,selected-thumb',
      updatedAt: 2
    }, {
      id: 'custom-upload',
      key: 'custom',
      imageDataUrl: 'data:image/webp;base64,legacy',
      thumbnailDataUrl: 'data:image/webp;base64,legacy-thumb',
      updatedAt: 1
    }, {
      id: 'custom-wallpaper-unselected',
      key: 'custom-wallpaper-unselected',
      imageDataUrl: 'data:image/webp;base64,unselected',
      thumbnailDataUrl: 'data:image/webp;base64,unselected-thumb',
      updatedAt: 3
    }], indexedDbCalls)
  });
  const targetedRecords = await indexedDbStore.readByIds([
    selectedId,
    'custom-wallpaper-legacy',
    'built-in-wallpaper'
  ]);
  assert.deepStrictEqual(
    targetedRecords.map((item) => item.id),
    ['custom-wallpaper-legacy', selectedId],
    'targeted reads should return only selected records and support the legacy key'
  );
  assert.deepStrictEqual(
    indexedDbCalls.get,
    [selectedId, 'custom-wallpaper-legacy', 'custom'],
    'targeted reads should use object-store get calls for the requested ids'
  );
  assert.strictEqual(indexedDbCalls.getAll, 0, 'targeted reads should never scan the full object store');

  await testTileThumbnailIsASmallCroppedWebp();
  await testThumbnailCacheKeepsTheMostRecentlySeenTiles();

  console.log('newtab wallpaper local store tests passed');
}

async function testTileThumbnailIsASmallCroppedWebp() {
  const drawn = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: (...args) => drawn.push(args.slice(1)) }),
    toDataURL: () => `data:image/webp;base64,${Buffer.alloc(9000, 1).toString('base64')}`
  };
  class FakeFileReader {
    readAsDataURL() { this.result = 'data:image/jpeg;base64,c291cmNl'; this.onload(); }
  }
  class FakeImage {
    set src(_value) { this.naturalWidth = 900; this.naturalHeight = 720; this.onload(); }
  }
  const store = wallpaperStoreApi.createWallpaperLocalStore({
    documentObj: { createElement: () => canvas },
    windowObj: { FileReader: FakeFileReader, Image: FakeImage }
  });
  const dataUrl = await store.buildTileThumbnail({ type: 'image/jpeg' });
  assert.match(dataUrl, /^data:image\/webp;base64,/);
  assert.strictEqual(canvas.width, 320, 'Tiles are encoded at 320 wide, enough for a 2x panel tile');
  assert.strictEqual(canvas.height, 180);
  assert.deepStrictEqual(drawn[0], [0, 107, 900, 506, 0, 0, 320, 180], 'A painting is cropped to the 16:9 tile');
}

// An in-memory IndexedDB with what the thumbnail cache uses: get, put, count and a cursor over an index.
function createMemoryIndexedDb() {
  const records = new Map();
  let created = false;
  return {
    records,
    open() {
      const request = {};
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: () => created },
          createObjectStore: () => { created = true; return { createIndex() {} }; },
          close() {},
          transaction() {
            let pending = 0;
            const transaction = {};
            const schedule = (step) => {
              pending += 1;
              setTimeout(() => {
                step();
                pending -= 1;
                if (pending === 0) setTimeout(() => { if (pending === 0 && transaction.oncomplete) transaction.oncomplete(); }, 0);
              }, 0);
            };
            const respond = (compute) => {
              const op = {};
              schedule(() => { op.result = compute(); if (op.onsuccess) op.onsuccess(); });
              return op;
            };
            const store = {
              get: (key) => respond(() => records.get(key)),
              put: (value) => respond(() => { records.set(value.id, value); }),
              count: () => respond(() => records.size),
              index: () => ({
                openCursor() {
                  const keys = Array.from(records.values()).sort((a, b) => a.usedAt - b.usedAt).map((value) => value.id);
                  let position = 0;
                  const cursorRequest = {};
                  const step = () => {
                    const key = keys[position];
                    cursorRequest.result = key === undefined ? null : {
                      value: records.get(key),
                      delete() { records.delete(key); },
                      continue() { position += 1; schedule(step); }
                    };
                    if (cursorRequest.onsuccess) cursorRequest.onsuccess();
                  };
                  schedule(step);
                  return cursorRequest;
                }
              })
            };
            transaction.objectStore = () => store;
            return transaction;
          }
        };
        request.result = db;
        if (!created && request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

async function testThumbnailCacheKeepsTheMostRecentlySeenTiles() {
  const indexedDB = createMemoryIndexedDb();
  let time = 1000;
  const cache = wallpaperStoreApi.createWallpaperThumbnailCache({ windowObj: { indexedDB }, limit: 2, now: () => time });
  const tile = (id) => ({ id, url: `https://picsum.photos/id/${id}/320/180`, dataUrl: `data:image/webp;base64,${id}` });
  await cache.write(tile('a'));
  time += 1;
  await cache.write(tile('b'));
  assert.deepStrictEqual((await cache.readByIds(['a', 'missing'])).map((record) => record.dataUrl),
    ['data:image/webp;base64,a'], 'Only cached tiles are returned');
  assert.strictEqual(indexedDB.records.get('a').usedAt, 1000, 'A tile read again within the hour is not rewritten');

  time += 2 * 60 * 60 * 1000;
  await cache.readByIds(['a']);
  assert.strictEqual(indexedDB.records.get('a').usedAt, time, 'A tile shown again later moves to the front');
  time += 1;
  await cache.write(tile('c'));
  assert.deepStrictEqual(Array.from(indexedDB.records.keys()).sort(), ['a', 'c'],
    'Past the limit the tile seen longest ago is dropped');

  await assert.rejects(() => wallpaperStoreApi.createWallpaperThumbnailCache({ windowObj: {} }).readByIds(['a']),
    /IndexedDB is not available/);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
