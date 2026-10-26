// The settings store and provider runtime the worker builds from its chrome
// API, built the same way over a test's fake chrome.
const { createProviderStorageRuntime } = require('../../src/platform/settings-storage.ts');
const { createSettingsStore } = require('../../src/platform/settings-store.ts');
const { WORKER_SETTINGS } = require('../../src/background/worker-settings.ts');

function createWorkerSettings(chrome, settings = WORKER_SETTINGS) {
  const provider = createProviderStorageRuntime(chrome);
  const settingsStore = createSettingsStore({ chromeApi: chrome, settings });
  return { provider, settingsStore };
}

// A settings store over a test's own storage areas, for a part of the worker
// tested on its own.
function createAreaSettingsStore(areas, settings = WORKER_SETTINGS) {
  const chrome = {
    runtime: { lastError: null },
    storage: { local: areas.local || areas.sync, sync: areas.sync, onChanged: { addListener() {} } }
  };
  if (areas.session) chrome.storage.session = areas.session;
  return createSettingsStore({ chromeApi: chrome, settings });
}

module.exports = { createAreaSettingsStore, createWorkerSettings };
