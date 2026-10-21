const assert = require('assert');

const iconStoreApi = require('../../src/newtab/shortcut-icon-store.js');

function createMemoryStorage(initialData) {
  const data = { ...(initialData || {}) };
  return {
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        result[key] = data[key];
      });
      callback(result);
    },
    set(value, callback) {
      Object.assign(data, value || {});
      callback();
    },
    data
  };
}

function testSourceValidation() {
  assert.strictEqual(iconStoreApi.MAX_SOURCE_BYTES, 10 * 1024 * 1024);
  assert.strictEqual(iconStoreApi.MAX_SOURCE_DIMENSION, 4096);
  assert.strictEqual(iconStoreApi.OUTPUT_SIZE, 128);
  assert.strictEqual(iconStoreApi.MAX_OUTPUT_BYTES, 96 * 1024);
  assert.strictEqual(iconStoreApi.isAcceptedMimeType('image/png'), true);
  assert.strictEqual(iconStoreApi.isAcceptedMimeType('image/svg+xml'), false);

  assert.throws(
    () => iconStoreApi.validateSourceFile({ type: 'image/svg+xml', size: 120 }),
    (error) => error && error.code === 'unsupported-type'
  );
  assert.strictEqual(
    iconStoreApi.validateSourceFile({
      type: 'image/png',
      size: (1024 * 1024) + 1
    }),
    true,
    'source images larger than 1 MB should be accepted before normalization'
  );
  assert.throws(
    () => iconStoreApi.validateSourceDimensions(4097, 128),
    (error) => error && error.code === 'dimensions-too-large'
  );
  assert.throws(
    () => iconStoreApi.validateSourceFile({
      type: 'image/png',
      size: iconStoreApi.MAX_SOURCE_BYTES + 1
    }),
    (error) => error && error.code === 'file-too-large'
  );
  const oversizedPng = `data:image/png;base64,${Buffer.alloc(iconStoreApi.MAX_OUTPUT_BYTES + 1).toString('base64')}`;
  assert.strictEqual(iconStoreApi.normalizeIconDataUrl(oversizedPng), '',
    'decoded icon bytes must be bounded independently of the Data URL string length');
}

function testContainedRenderingGeometry() {
  assert.deepStrictEqual(
    iconStoreApi.getContainedRect(512, 256, 128),
    { x: 0, y: 32, width: 128, height: 64 },
    'wide logos should be centered with transparent vertical padding'
  );
  assert.deepStrictEqual(
    iconStoreApi.getContainedRect(64, 128, 128),
    { x: 32, y: 0, width: 64, height: 128 },
    'tall logos should be centered with transparent horizontal padding'
  );
}

async function testLocalStorageMap() {
  const storageKey = '_test_shortcut_icons';
  const validDataUrl = `data:image/png;base64,${Buffer.from('icon').toString('base64')}`;
  const storage = createMemoryStorage({
    [storageKey]: {
      one: validDataUrl,
      invalid: 'https://example.com/icon.png'
    }
  });
  const store = iconStoreApi.createShortcutIconStore({
    storageArea: storage,
    storageKey,
    windowObj: {}
  });
  const loaded = await store.readAll();
  assert.deepStrictEqual(loaded, { one: validDataUrl });

  const saved = await store.writeAll({
    two: validDataUrl,
    invalid: 'data:image/jpeg;base64,abc'
  });
  assert.deepStrictEqual(saved, { two: validDataUrl });
  assert.deepStrictEqual(storage.data[storageKey], saved);
}

async function testFileNormalization() {
  const drawCalls = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return {
        clearRect() {},
        drawImage(...args) {
          drawCalls.push(args);
        }
      };
    },
    toDataURL(type) {
      assert.strictEqual(type, 'image/png');
      return `data:image/png;base64,${Buffer.from('normalized').toString('base64')}`;
    }
  };
  class FakeFileReader {
    readAsDataURL() {
      this.result = 'data:image/png;base64,source';
      this.onload();
    }
  }
  class FakeImage {
    set src(value) {
      this._src = value;
      this.naturalWidth = 512;
      this.naturalHeight = 256;
      this.onload();
    }
  }
  const store = iconStoreApi.createShortcutIconStore({
    documentObj: {
      createElement(tagName) {
        assert.strictEqual(tagName, 'canvas');
        return canvas;
      }
    },
    windowObj: {
      FileReader: FakeFileReader,
      Image: FakeImage
    },
    storageArea: createMemoryStorage()
  });
  const prepared = await store.prepareFile({
    type: 'image/png',
    size: 512,
    name: 'logo.png'
  });
  assert.strictEqual(prepared.outputWidth, 128);
  assert.strictEqual(prepared.outputHeight, 128);
  assert.strictEqual(prepared.sourceWidth, 512);
  assert.strictEqual(prepared.sourceHeight, 256);
  assert.strictEqual(prepared.dataUrl.startsWith('data:image/png;base64,'), true);
  assert.deepStrictEqual(
    drawCalls[0].slice(1),
    [0, 32, 128, 64],
    'normalization should contain the source image without cropping'
  );
}

async function run() {
  testSourceValidation();
  testContainedRenderingGeometry();
  await testLocalStorageMap();
  await testFileNormalization();
  console.log('newtab shortcut icon store tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
