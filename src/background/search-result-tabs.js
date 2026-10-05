(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchResultTabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function resolvePlacement(chromeApi, sourceTab, position) {
    return new Promise((resolve) => {
      const finish = (tab) => {
        const context = { sourceTab: tab || null };
        if (tab && Number.isInteger(tab.windowId)) {
          context.windowId = tab.windowId;
        }
        if ((position === 'afterCurrent' || position === 'beforeCurrent') &&
            tab && Number.isInteger(tab.index) && tab.index >= 0) {
          context.index = tab.index + (position === 'afterCurrent' ? 1 : 0);
        }
        resolve(context);
      };
      if ((position !== 'afterCurrent' && position !== 'beforeCurrent') || !chromeApi || !chromeApi.tabs) {
        finish(sourceTab);
        return;
      }
      try {
        if (sourceTab && typeof sourceTab.id === 'number' && typeof chromeApi.tabs.get === 'function') {
          // Refresh the index: tabs can move while search suggestions are loading.
          chromeApi.tabs.get(sourceTab.id, (tab) => {
            finish(chromeApi.runtime && chromeApi.runtime.lastError ? null : tab);
          });
        } else if (!sourceTab && typeof chromeApi.tabs.query === 'function') {
          chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            finish(chromeApi.runtime && chromeApi.runtime.lastError ? null : tabs && tabs[0]);
          });
        } else {
          finish(sourceTab);
        }
      } catch (error) {
        finish(null);
      }
    });
  }

  function searchInTab(chromeApi, options, callback) {
    const fallback = () => {
      if (typeof options.onFallback === 'function') {
        options.onFallback();
      }
      // Reuse the positioned tab if the browser search API fails.
      try {
        chromeApi.tabs.update(options.tabId, { url: options.fallbackUrl }, () => {
          const error = chromeApi.runtime && chromeApi.runtime.lastError;
          callback({ ok: !error, reason: error ? error.message : '' });
        });
      } catch (error) {
        callback({ ok: false, reason: error.message || 'tab-update-failed' });
      }
    };
    try {
      chromeApi.search.query({ text: options.query, tabId: options.tabId }, () => {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          fallback();
          return;
        }
        callback({ ok: true });
      });
    } catch (error) {
      fallback();
    }
  }

  return Object.freeze({ resolvePlacement, searchInTab });
});
