const assert = require('assert');
const syncApi = require('../src/background/webdav-sync.js');
const settings = require('../src/shared/settings.js');
const { createServer, createDevice, config, set } = require('./test-webdav-sync.js');

async function run() {
  const first = createServer();
  const second = createServer();
  const router = { fetch: (url, options) => (new URL(url).hostname === 'second.test' ? second : first).fetch(url, options) };
  const device = createDevice(router, { sync: { [settings.THEME_STORAGE_KEY]: 'light' } }, [], syncApi.createController);
  const manager = device.controller;
  assert.deepStrictEqual((await manager.status()).connections, []);
  const a = await manager.handle({ operation: 'add', config });
  const b = await manager.handle({ operation: 'add', config: { ...config, endpoint: 'https://second.test/dav/' } });
  assert.notStrictEqual(a.id, b.id);
  assert.strictEqual(first.requests.length + second.requests.length, 0, 'adding only saves local credentials');
  assert.strictEqual((await manager.status()).connections.length, 2);
  assert(!JSON.stringify(await manager.status()).includes(config.password));
  await Promise.all([a, b].map(({ id }) => manager.handle({ operation: 'enable', id })));
  assert((await manager.status()).connections.every((connection) => connection.enabled));
  assert.strictEqual(device.chrome.alarms.names.size, 2, 'each enabled connection has its own recurring alarm');
  await set(device.chrome.storage.sync, { [settings.THEME_STORAGE_KEY]: 'dark' });
  // Both servers must reach this barrier. A global sync queue would deadlock.
  let arrived = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const waitForBoth = async (path, options) => {
    if (path.endsWith('/state.json') && options.method === 'GET') {
      arrived += 1;
      if (arrived === 2) release();
      await barrier;
    }
  };
  first.beforeRequest = second.beforeRequest = waitForBoth;
  const parallel = Promise.all([a, b].map(({ id }) => manager.handle({ operation: 'sync', id })));
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; release(); }, 1000);
  await parallel;
  clearTimeout(timeout);
  assert.strictEqual(timedOut, false, 'server requests actually overlap instead of waiting for another connection');
  assert(arrived >= 2);
  assert.strictEqual(first.state().data[settings.THEME_STORAGE_KEY], 'dark');
  assert.strictEqual(second.state().data[settings.THEME_STORAGE_KEY], 'dark');
  first.beforeRequest = second.beforeRequest = null;
  // Two incoming versions may download in parallel, but cannot interleave local commits.
  first.replaceState({ ...first.state(), data: { ...first.state().data, _x_extension_language_2024_unique_: 'ja' } });
  second.replaceState({ ...second.state(), data: { ...second.state().data, [settings.THEME_STORAGE_KEY]: 'system' } });
  arrived = 0;
  let releaseIncoming;
  const incomingBarrier = new Promise((resolve) => { releaseIncoming = resolve; });
  first.beforeRequest = second.beforeRequest = async (path, options) => {
    if (path.endsWith('/state.json') && options.method === 'GET') {
      if (++arrived === 2) releaseIncoming();
      await incomingBarrier;
    }
  };
  const incoming = await Promise.allSettled([a, b].map(({ id }) => manager.handle({ operation: 'sync', id })));
  assert.strictEqual(incoming.filter((value) => value.status === 'fulfilled').length, 1);
  assert.strictEqual(incoming.find((value) => value.status === 'rejected').reason.code, 'local-changed');
  first.beforeRequest = second.beforeRequest = null;
  const pending = (await manager.status()).connections.find((value) => value.state === 'pending');
  await manager.handle({ operation: 'sync', id: pending.id });
  await manager.handle({ operation: 'sync', id: pending.id === a.id ? b.id : a.id });
  assert.strictEqual(first.state().data[settings.THEME_STORAGE_KEY], 'system');
  assert.strictEqual(second.state().data._x_extension_language_2024_unique_, 'ja');
  await manager.handle({ operation: 'pause', id: a.id });
  let statuses = (await manager.status()).connections;
  assert.strictEqual(statuses.find((value) => value.id === b.id).enabled, true, 'pausing one leaves the other enabled');
  assert.strictEqual(device.chrome.alarms.names.size, 1);
  first.offline = true;
  await manager.handle({ operation: 'enable', id: b.id });
  await assert.rejects(manager.handle({ operation: 'enable', id: a.id }));
  assert.strictEqual((await manager.status()).connections.find((value) => value.id === b.id).state, 'ready');
  const secondFiles = structuredClone([...second.files]);
  const firstFiles = structuredClone([...first.files]);
  const chromeBefore = structuredClone(device.chrome.storage.sync.values);
  await manager.handle({ operation: 'remove', id: a.id });
  assert.deepStrictEqual(device.chrome.storage.sync.values, chromeBefore, 'removing a connection retains Chrome preferences');
  assert.deepStrictEqual([...first.files], firstFiles, 'removing makes no remote request');
  assert.deepStrictEqual([...second.files], secondFiles);
  assert(![...device.privateValues.keys()].some((key) => key.startsWith(`connection:${a.id}:`)), 'credentials and private per-connection history are removed');
  assert.strictEqual((await manager.status()).connections.length, 1);
  await assert.rejects(manager.handle({ operation: 'sync', id: a.id }), /connection-missing/);
  await manager.handle({ operation: 'remove', id: b.id });
  assert.deepStrictEqual((await manager.status()).connections, []);
  assert.strictEqual(device.chrome.alarms.names.size, 0);
  assert.deepStrictEqual((await device.createController().status()).connections, [], 'deletion survives a worker restart');

  const legacy = createDevice(createServer(), { sync: { [settings.THEME_STORAGE_KEY]: 'light' } });
  await legacy.controller.handle({ operation: 'save', config });
  await legacy.controller.stop();
  const createMigrated = () => syncApi.createController({ chrome: legacy.chrome, settings,
    contract: require('../src/shared/webdav-contract.js'), shortcuts: require('../src/newtab/shortcuts-store.js'),
    client: require('../src/background/webdav-client.js'), privateStore: legacy.privateStore, wallpaperStore: legacy.wallpaperStore,
    crypto: require('crypto').webcrypto });
  const migrated = createMigrated();
  assert.strictEqual((await migrated.status()).connections[0].id, 'default');
  assert.strictEqual(legacy.privateValues.get('session').config.password, config.password, 'existing credentials migrate in place');
  await migrated.handle({ operation: 'remove', id: 'default' });
  assert.strictEqual(legacy.privateValues.has('session'), false);
  assert.deepStrictEqual((await createMigrated().status()).connections, [], 'a deleted legacy connection is never reimported');
  await assert.rejects(migrated.handle({ operation: 'add', config: { ...config, password: '' } }), /missing-credentials/);
  assert.deepStrictEqual((await migrated.status()).connections, []);

  const partialA = createServer();
  const partialB = createServer();
  const partial = createDevice({ fetch: (url, options) => (new URL(url).hostname === 'second.test' ? partialB : partialA).fetch(url, options) },
    { sync: { [settings.THEME_STORAGE_KEY]: 'light' } }, [], syncApi.createController);
  const pa = await partial.controller.handle({ operation: 'add', config });
  const pb = await partial.controller.handle({ operation: 'add', config: { ...config, endpoint: 'https://second.test/dav/' } });
  await Promise.all([pa, pb].map(({ id }) => partial.controller.handle({ operation: 'enable', id })));
  partialA.replaceState({ ...partialA.state(), data: { [settings.THEME_STORAGE_KEY]: 'dark' } });
  const replace = partial.wallpaperStore.replaceAll;
  let interrupted = false;
  partial.wallpaperStore.replaceAll = async (records) => {
    await replace(records);
    if (!interrupted) { interrupted = true; throw new Error('interrupted media commit'); }
  };
  await assert.rejects(partial.controller.handle({ operation: 'sync', id: pa.id }));
  const beforePartialUpload = partialB.requests.filter((request) => request.method === 'PUT').length;
  await assert.rejects(partial.controller.handle({ operation: 'sync', id: pb.id }), /interrupted-apply/);
  await assert.rejects(partial.controller.handle({ operation: 'remove', id: pa.id }), /interrupted-apply/);
  await assert.rejects(partial.controller.handle({ operation: 'sync', id: pb.id }), /interrupted-apply/);
  assert.strictEqual(partialB.requests.filter((request) => request.method === 'PUT').length, beforePartialUpload,
    'other connections cannot upload a partial local version, even after the journal is recovered');
  await partial.controller.handle({ operation: 'restoreBackup', id: pa.id });
  await partial.controller.handle({ operation: 'sync', id: pb.id });
  assert.strictEqual((await partial.controller.status()).connections.find((value) => value.id === pb.id).state, 'ready');
  await partial.controller.handle({ operation: 'remove', id: pa.id });
  await partial.controller.handle({ operation: 'remove', id: pb.id });
  console.log('WebDAV multiple-connection tests passed: migration, parallel requests, isolation, deletion and restart');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
