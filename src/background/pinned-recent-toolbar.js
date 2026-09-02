(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LumnoPinnedRecentToolbar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function callControllerForFreshTab(chromeApi, controller, options) {
    const config = options && typeof options === 'object' ? options : {};
    const tabId = Number(config.tabId);
    const method = String(config.method || '');
    const tabs = chromeApi && chromeApi.tabs;
    const runtime = chromeApi && chromeApi.runtime;
    if (!Number.isInteger(tabId) || !tabs || typeof tabs.get !== 'function' ||
        !controller || typeof controller[method] !== 'function') {
      return Promise.resolve({ ok: false, status: 'error', reason: 'unavailable' });
    }
    return new Promise((resolve) => {
      tabs.get(tabId, (tab) => {
        if ((runtime && runtime.lastError) || !tab) {
          resolve({ ok: false, status: 'error', reason: 'tab-unavailable' });
          return;
        }
        Promise.resolve(controller[method](tab, ...(Array.isArray(config.args) ? config.args : [])))
          .then(resolve)
          .catch(() => resolve({ ok: false, status: 'error', reason: 'action-failed' }));
      });
    });
  }

  return Object.freeze({ callControllerForFreshTab });
});
