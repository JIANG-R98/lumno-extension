const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

async function run() {
  const dom = new JSDOM(fs.readFileSync('src/options/options.html', 'utf8'), {
    url: 'https://extension.test/options.html', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const window = dom.window;
  const requests = [];
  const listeners = [];
  let infoModel;
  let renderModel;
  let actions;
  let nextError;
  let model = { connections: [], clientRevision: 'dav-lock-4', syncRevision: 'dav-multi-1' };
  const chrome = { runtime: { lastError: null, sendMessage(request, callback) {
    requests.push(request);
    if (request.operation === 'status') return callback({ ok: true, ...model });
    if (nextError) { const error = nextError; nextError = null; return callback({ ok: false, ...error }); }
    callback({ ok: true });
  } }, storage: { onChanged: { addListener(fn) { listeners.push(fn); } } } };
  window.LumnoOptionsInfoButton = { createInfoButtonController: () => ({ render(value) { infoModel = value; } }) };
  window.LumnoOptionsWebDavList = { createWebDavListController(host, options) {
    assert.strictEqual(host.id, 'lumno-webdav-list');
    actions = options;
    return { render(value) { renderModel = value; } };
  } };
  window.eval(fs.readFileSync('src/shared/settings.js', 'utf8'));
  window.eval(fs.readFileSync('src/options/webdav-options.js', 'utf8'));
  const messages = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8'));
  window.chrome = chrome;
  chrome.i18n = { getMessage: (key) => messages[key]?.message || '' };
  // Exercise the real host's declaration order and translation callback. A
  // standalone widget fixture misses errors that abort the whole settings page.
  const optionsSource = fs.readFileSync('src/options/options.js', 'utf8');
  const start = optionsSource.indexOf('  let currentMessages = null;');
  const bootstrap = optionsSource.slice(start, optionsSource.indexOf('  if (searchResultSourceTypeController)', start));
  const getMessageSource = optionsSource.slice(optionsSource.indexOf('  function getMessage(key, fallback) {'),
    optionsSource.indexOf('  function getFeedbackSupportWebLocale() {'));
  let controller;
  assert.doesNotThrow(() => {
    controller = window.eval(`(() => { function animateOptionsPanelHeight() {} ${getMessageSource}\n${bootstrap}\nreturn webDavSettingsController; })()`);
  }, 'WebDAV initialization must not read a host variable before it is initialized');
  await controller.refresh();
  assert.strictEqual(renderModel.ready, true);
  assert.strictEqual(renderModel.connections.length, 0);
  assert.strictEqual(infoModel.tooltipKey, 'webdav_beta_hint');
  assert.strictEqual(renderModel.copy.webdav_add, 'Add WebDAV');
  assert.strictEqual(window.document.querySelector('#lumno-webdav-setup-hint').hidden, false);
  const a = { id: 'a', state: 'paused', enabled: false, config: { endpoint: 'https://dav.test/', directory: 'lumno', username: 'user', hasPassword: true } };
  model.connections = [a, { ...a, id: 'b', state: 'conflict', conflicts: ['shortcuts', 'wallpapers'], error: 'remote-missing' }];
  await controller.refresh();
  assert.strictEqual(renderModel.connections.length, 2);
  assert.strictEqual(renderModel.connections[1].remoteMissing, true);
  assert(renderModel.connections[1].conflictsText.includes('Shortcuts and icons'));
  assert.strictEqual(window.document.querySelector('#lumno-webdav-setup-hint').hidden, true);
  await actions.onAction('pause', 'a');
  assert(requests.some((request) => request.operation === 'pause' && request.id === 'a'));
  await actions.onAction('remove', 'b');
  assert(requests.some((request) => request.operation === 'remove' && request.id === 'b'));
  await actions.onAction('add', undefined, { config: { endpoint: 'https://new.test/' } });
  assert(requests.some((request) => request.operation === 'add' && !request.id));
  nextError = { error: 'conditional-write-unsupported', diagnostic: { revision: 'dav-lock-4', phase: 'move-race', statuses: [201, 201], password: 'never-display' } };
  await assert.rejects(actions.onAction('test', 'a'), (error) => error.message.includes('dav-lock-4 / move-race / 201,201') && !error.message.includes('never-display'));
  nextError = { error: 'network-error' };
  await assert.rejects(actions.onAction('sync', 'a'), /Local data is retained/);
  model.syncRevision = 'dav-parallel-1';
  await controller.refresh();
  assert.strictEqual(renderModel.outdated, true);
  assert.strictEqual(window.document.querySelector('#lumno-webdav-version').hidden, false);
  const count = requests.length;
  await assert.rejects(actions.onAction('add'), /multiple WebDAV connections/);
  await assert.rejects(actions.onAction('remove', 'a'), /multiple WebDAV connections/);
  assert.strictEqual(requests.length, count);
  await actions.onAction('pause', 'a');
  model.syncRevision = 'dav-multi-1';
  model.connections = [];
  const key = `${window.LumnoSettings.WEBDAV_STATUS_STORAGE_KEY}:b`;
  listeners.forEach((fn) => fn({ [key]: {} }, 'local'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(renderModel.connections.length, 0);
  assert.strictEqual(window.document.querySelector('#lumno-webdav-setup-hint').hidden, false);
  window.close();
  console.log('WebDAV settings adapter tests passed: empty state, per-connection actions, diagnostics and version guards');
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
