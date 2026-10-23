const assert = require('assert');

const pipMainWorld = require('../../src/background/pip-main-world.js');

function createChromeStub(executeScript) {
  return {
    runtime: {},
    scripting: {
      executeScript
    }
  };
}

async function testNoTab() {
  const api = pipMainWorld.create({
    chromeApi: createChromeStub(() => {
      throw new Error('executeScript should not run without a tab id');
    })
  });

  const result = await api.siteTryEnterPiPInMainWorld({});
  assert.deepStrictEqual(result, { ok: false, reason: 'no-tab' });
}

async function testExecuteScriptTargetAndPayload() {
  let capturedOptions = null;
  const api = pipMainWorld.create({
    chromeApi: createChromeStub((options, callback) => {
      capturedOptions = options;
      callback([{ result: { ok: true, after: true } }]);
    })
  });

  const result = await api.iqiyiSetupAutoPiPInMainWorld({
    tab: { id: 42 },
    frameId: 7
  });

  assert.deepStrictEqual(result, { ok: true, after: true });
  assert.deepStrictEqual(capturedOptions.target, { tabId: 42, frameIds: [7] });
  assert.strictEqual(capturedOptions.world, 'MAIN');
  assert.strictEqual(typeof capturedOptions.func, 'function');
  assert.strictEqual(capturedOptions.func.name, 'iqiyiSetupAutoPiPInMainWorld');
}

async function testDefaultFrameId() {
  let capturedOptions = null;
  const api = pipMainWorld.create({
    chromeApi: createChromeStub((options, callback) => {
      capturedOptions = options;
      callback([{ result: { ok: true } }]);
    })
  });

  await api.forceExitPiPInMainWorld({ tab: { id: 9 } });
  assert.deepStrictEqual(capturedOptions.target, { tabId: 9, frameIds: [0] });
}

async function testRuntimeLastError() {
  let chromeStub = null;
  chromeStub = createChromeStub((options, callback) => {
    chromeStub.runtime.lastError = { message: 'execute failed' };
    callback([]);
  });
  const api = pipMainWorld.create({ chromeApi: chromeStub });

  const result = await api.youtubeForceExitPiPInMainWorld({
    tab: { id: 12 },
    frameId: 3
  });

  assert.deepStrictEqual(result, { ok: false, reason: 'execute failed' });
}

async function testNoResultFallback() {
  const api = pipMainWorld.create({
    chromeApi: createChromeStub((options, callback) => {
      callback([]);
    })
  });

  const result = await api.iqiyiTryEnterPiPInMainWorld({
    tab: { id: 13 },
    frameId: 2
  });

  assert.deepStrictEqual(result, { ok: false, reason: 'no-result' });
}

(async () => {
  await testNoTab();
  await testExecuteScriptTargetAndPayload();
  await testDefaultFrameId();
  await testRuntimeLastError();
  await testNoResultFallback();
  console.log('pip main-world tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
