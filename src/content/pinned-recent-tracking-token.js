(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPinnedRecentTrackingToken = api;
  if (root.window === root && root.chrome) {
    api.attach({ windowObj: root, chromeApi: root.chrome });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const PAGE_TOKEN_STORAGE_KEY = '_x_lumno_pinned_recent_tracking_token_2026_unique_';
  const SYNC_ACTION = 'syncPinnedRecentTrackingToken';
  const REFRESH_ACTION = 'refreshPinnedRecentTrackingToken';

  function createTrackingTokenController(options) {
    const config = options && typeof options === 'object' ? options : {};
    const windowObj = config.windowObj || globalThis.window;
    const chromeApi = config.chromeApi || (windowObj && windowObj.chrome);
    let attached = false;
    let syncTask = null;
    let syncQueued = false;
    let locationMonitorId = null;
    let lastLocationHref = '';

    function getLocationHref() {
      try {
        return String(windowObj && windowObj.location && windowObj.location.href || '');
      } catch (error) {
        return '';
      }
    }

    function stopLocationMonitor() {
      if (locationMonitorId === null) return;
      if (windowObj && typeof windowObj.clearInterval === 'function') {
        windowObj.clearInterval(locationMonitorId);
      }
      locationMonitorId = null;
    }

    function syncAfterLocationChange() {
      const currentHref = getLocationHref();
      if (!currentHref || currentHref === lastLocationHref) return;
      lastLocationHref = currentHref;
      void requestSync();
    }

    function startLocationMonitor() {
      lastLocationHref = getLocationHref();
      if (locationMonitorId !== null || !windowObj ||
          typeof windowObj.setInterval !== 'function') return;
      locationMonitorId = windowObj.setInterval(syncAfterLocationChange, 1000);
    }

    function isTopFrame() {
      try {
        return Boolean(windowObj && windowObj.top === windowObj);
      } catch (error) {
        return false;
      }
    }

    function readToken() {
      try {
        return String(windowObj.sessionStorage.getItem(PAGE_TOKEN_STORAGE_KEY) || '');
      } catch (error) {
        return '';
      }
    }

    function writeToken(token) {
      try {
        const normalized = String(token || '');
        if (normalized) windowObj.sessionStorage.setItem(PAGE_TOKEN_STORAGE_KEY, normalized);
        else windowObj.sessionStorage.removeItem(PAGE_TOKEN_STORAGE_KEY);
        return true;
      } catch (error) {
        return false;
      }
    }

    function requestSync() {
      if (!isTopFrame() || !chromeApi || !chromeApi.runtime ||
          typeof chromeApi.runtime.sendMessage !== 'function') {
        return Promise.resolve({ status: 'ignored' });
      }
      if (syncTask) {
        syncQueued = true;
        return syncTask;
      }
      const requestLocationHref = getLocationHref();
      syncTask = new Promise((resolve) => {
        try {
          chromeApi.runtime.sendMessage({
            action: SYNC_ACTION,
            trackingToken: readToken(),
            currentUrl: requestLocationHref
          }, (response) => {
            if (chromeApi.runtime.lastError) {
              resolve({ status: 'ignored' });
              return;
            }
            const result = response && typeof response === 'object'
              ? response
              : { status: 'ignored' };
            if (result.clear === true) writeToken('');
            else if (result.token) writeToken(result.token);
            if (result.cardId) startLocationMonitor();
            else if (result.clear === true) stopLocationMonitor();
            resolve(result);
          });
        } catch (error) {
          stopLocationMonitor();
          resolve({ status: 'ignored' });
        }
      }).finally(() => {
        syncTask = null;
        const shouldResync = syncQueued || Boolean(
          locationMonitorId !== null && requestLocationHref &&
          getLocationHref() !== requestLocationHref
        );
        syncQueued = false;
        if (shouldResync) void requestSync();
      });
      return syncTask;
    }

    function attach() {
      if (attached || !isTopFrame()) return false;
      attached = true;
      if (chromeApi && chromeApi.runtime && chromeApi.runtime.onMessage &&
          typeof chromeApi.runtime.onMessage.addListener === 'function') {
        chromeApi.runtime.onMessage.addListener((message) => {
          if (!message || message.action !== REFRESH_ACTION) return;
          void requestSync();
        });
      }
      if (windowObj && typeof windowObj.addEventListener === 'function') {
        windowObj.addEventListener('pageshow', () => {
          void requestSync();
        });
        windowObj.addEventListener('popstate', syncAfterLocationChange);
        windowObj.addEventListener('hashchange', syncAfterLocationChange);
        windowObj.addEventListener('pagehide', stopLocationMonitor);
      }
      void requestSync();
      return true;
    }

    return Object.freeze({ attach, requestSync, readToken, writeToken });
  }

  function attach(options) {
    const controller = createTrackingTokenController(options);
    controller.attach();
    return controller;
  }

  return Object.freeze({
    PAGE_TOKEN_STORAGE_KEY,
    SYNC_ACTION,
    REFRESH_ACTION,
    createTrackingTokenController,
    attach
  });
});
