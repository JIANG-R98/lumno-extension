(function() {
  const NEWTAB_SEARCH_OVERLAY_COMMAND_ACTION = 'lumno:newtab-toggle-search-overlay';
  const SHORTCUT_DUPLICATE_WINDOW_MS = 250;
  // Shared search helpers are already loaded by newtab.html. Keep the overlay
  // and its React bundle off the normal New Tab startup path.
  const OVERLAY_SCRIPT_FILES = [
    'src/shared/browser-profile.js',
    'src/overlay/runtime.js',
    'src/overlay/favicon-view.js',
    'src/overlay/lifecycle.js',
    'src/overlay/site-fixes.js',
    'src/overlay/page-theme.js',
    'src/overlay/notices.js',
    'src/overlay/keyboard.js',
    'src/react/overlay-islands.js',
    'src/overlay/search-panel.js'
  ];
  const loadedScripts = new Map();
  let openingTask = null;
  let lastToggleAt = -Infinity;

  function loadScript(path) {
    if (!loadedScripts.has(path)) {
      const task = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(path);
        script.onload = () => resolve();
        script.onerror = () => {
          script.remove();
          reject(new Error(`Failed to load ${path}`));
        };
        document.head.appendChild(script);
      }).catch((error) => {
        loadedScripts.delete(path);
        throw error;
      });
      loadedScripts.set(path, task);
    }
    return loadedScripts.get(path);
  }

  function getCurrentTab() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.getCurrent((tab) => {
          resolve(chrome.runtime.lastError ? null : tab || null);
        });
      } catch (error) {
        resolve(null);
      }
    });
  }

  function isTargetTab(tab, requestedTabId) {
    return Boolean(tab && typeof tab.id === 'number' && tab.active &&
      document.visibilityState === 'visible' &&
      (requestedTabId === undefined || tab.id === requestedTabId));
  }

  function getOverlayContext(tab) {
    return Promise.all([
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getTabsForOverlay', currentTabId: tab.id }, (response) => {
          const tabs = !chrome.runtime.lastError && response && Array.isArray(response.tabs)
            ? response.tabs
            : [];
          resolve(tabs);
        });
      }),
      new Promise((resolve) => {
        chrome.tabs.getZoom(tab.id, (zoomFactor) => {
          const zoom = chrome.runtime.lastError ? 1 : Number(zoomFactor);
          resolve(Number.isFinite(zoom) && zoom > 0 ? zoom : 1);
        });
      })
    ]);
  }

  async function toggleSearchOverlay(requestedTabId) {
    try {
      const tab = await getCurrentTab();
      if (!isTargetTab(tab, requestedTabId)) {
        return { ok: false, reason: 'inactive-tab' };
      }
      // A browser command and the page fallback can describe the same press.
      if (openingTask || (Date.now() - lastToggleAt) < SHORTCUT_DUPLICATE_WINDOW_MS) {
        return { ok: true, suppressed: true };
      }
      lastToggleAt = Date.now();
      openingTask = (async () => {
        for (const path of OVERLAY_SCRIPT_FILES) {
          await loadScript(path);
        }
        const [tabs, tabZoomFactor] = await getOverlayContext(tab);
        // Loading may finish after the user has switched tabs.
        if (!isTargetTab(await getCurrentTab(), tab.id)) {
          return { ok: false, reason: 'inactive-tab' };
        }
        const activeElement = document.activeElement;
        window._x_extension_toggleSearchOverlay_2026_unique_(tabs, {
          currentTabId: tab.id,
          currentTabUrl: window.location.href,
          tabZoomFactor
        });
        // The overlay takes focus when its reveal gate opens. Release the
        // previous input meanwhile so typing cannot update the page below it.
        if (window._x_extension_search_overlay_open_2026_unique_ &&
            document.activeElement === activeElement && activeElement &&
            typeof activeElement.blur === 'function') {
          activeElement.blur();
        }
        return { ok: true };
      })();
      try {
        return await openingTask;
      } finally {
        openingTask = null;
      }
    } catch (error) {
      lastToggleAt = -Infinity;
      console.warn('[Lumno] New Tab search overlay failed to open.', error);
      return { ok: false, reason: 'overlay-unavailable' };
    }
  }

  function handleNewtabSearchOverlayCommand(message, _sender, sendResponse) {
    if (!message || message.action !== NEWTAB_SEARCH_OVERLAY_COMMAND_ACTION || !Number.isInteger(message.tabId)) {
      return;
    }
    // runtime messages reach every extension page, including visible tabs in
    // other windows. Only the addressed tab may open or answer the command.
    getCurrentTab().then((tab) => {
      if (isTargetTab(tab, message.tabId)) {
        toggleSearchOverlay(message.tabId).then(sendResponse);
      }
    });
    return true;
  }

  chrome.runtime.onMessage.addListener(handleNewtabSearchOverlayCommand);

  globalThis.LumnoNewtabSearchOverlay = { toggleSearchOverlay };
})();
