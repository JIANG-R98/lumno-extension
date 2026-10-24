// @ts-nocheck
// Where recent sites come from: open tabs, top sites and history, read
// once at startup and then on demand, merged into the recent list; plus the
// change history dialog and the recent context menu's copy.
function createRecentSources(deps) {
  const {
    t,
    getRecentContextMenuOptions,
    NEWTAB_CONTEXT_MENU_OPEN_VALUE,
    restoreProgressVersion,
    showToast,
    TOP_SITES_FOLLOW_HISTORY,
    startupRecentSourceReadsAt,
    NEWTAB_RECENT_STORE,
    getRecentStoreOptions,
    isBrowserPageRecentUrl
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  // The first recent-sites pass waits for every layout preference, so the browser reads start now.
  // Preferences that arrive before it start passes of their own, which it then discards, so every
  // pass shares these reads until the first pass lands or the history changes; later passes, or
  // one long after load, read afresh.
  const STARTUP_RECENT_SOURCE_MAX_AGE_MS = 3000;
  const NEWTAB_RECENT_HISTORY_DIALOG = globalThis.LumnoNewtabRecentHistoryDialog;
  let recentHistoryDialogLoadPromise = null;

  function updateRecentContextMenuLanguageStrings() {
    if (!pageState.recentContextMenu || !pageState.recentContextMenuSelectController) {
      return;
    }
    if (pageState.recentContextMenu.trigger) {
      pageState.recentContextMenu.trigger.setAttribute(
        'aria-label',
        t('recent_context_menu_label', 'Recent site actions')
      );
    }
    if (typeof pageState.recentContextMenuSelectController.setOptions === 'function') {
      pageState.recentContextMenuSelectController.setOptions(
        pageState.recentContextMenu.control,
        getRecentContextMenuOptions(pageState.recentContextMenuTarget),
        NEWTAB_CONTEXT_MENU_OPEN_VALUE
      );
    }
  }

  // The change history dialog is loaded the first time someone opens it.
  function openRecentHistoryDialog(item) {
    if (!recentHistoryDialogLoadPromise) {
      recentHistoryDialogLoadPromise = Promise.resolve(
        NEWTAB_RECENT_HISTORY_DIALOG && typeof NEWTAB_RECENT_HISTORY_DIALOG.createRecentHistoryDialog === 'function'
          ? NEWTAB_RECENT_HISTORY_DIALOG.createRecentHistoryDialog({
            documentObj: document,
            windowObj: window,
            t,
            onRestore: restoreProgressVersion,
            onRestoreSuccess() {
              showToast(t('recent_history_restore_success', '已恢复为所选版本'), false);
            }
          })
          : null
      ).then((controller) => {
        if (!controller) throw new Error('Recent history dialog unavailable');
        controller.mount(document.body);
        pageState.recentHistoryDialogController = controller;
        return controller;
      }).catch((error) => {
        recentHistoryDialogLoadPromise = null;
        throw error;
      });
    }
    return recentHistoryDialogLoadPromise.then((controller) => {
      if (pageState.progressTrackingEnabled) controller.open({ item });
    }).catch(() => {
      showToast(t('toast_error', '操作失败，请重试。'), true);
    });
  }

  function readRecentOpenTabs() {
    return new Promise((resolve) => {
      if (!chrome.tabs || !chrome.tabs.query) {
        resolve([]);
        return;
      }
      chrome.tabs.query({}, (tabs) => {
        resolve(chrome.runtime.lastError || !Array.isArray(tabs) ? [] : tabs);
      });
    });
  }

  function readRecentTopSites() {
    return new Promise((resolve) => {
      if (!chrome.topSites || !chrome.topSites.get || !TOP_SITES_FOLLOW_HISTORY) {
        resolve(null);
        return;
      }
      chrome.topSites.get((items) => {
        resolve(chrome.runtime.lastError || !Array.isArray(items) ? null : items);
      });
    });
  }

  function readRecentHistoryItems() {
    return new Promise((resolve) => {
      if (!chrome.history || !chrome.history.search) {
        resolve(null);
        return;
      }
      // Most-visited ranks sites by summed visit counts, so it needs more than the latest few URLs.
      chrome.history.search({
        text: '',
        maxResults: 500,
        startTime: Date.now() - 1000 * 60 * 60 * 24 * 90
      }, (items) => {
        resolve(chrome.runtime.lastError || !Array.isArray(items) ? null : items);
      });
    });
  }

  function releaseStartupRecentSourceReads() {
    pageState.startupRecentSourceReads = null;
  }

  function takeStartupRecentSourceRead(name, read) {
    const pending = pageState.startupRecentSourceReads ? pageState.startupRecentSourceReads[name] : null;
    return pending && Date.now() - startupRecentSourceReadsAt <= STARTUP_RECENT_SOURCE_MAX_AGE_MS
      ? pending
      : read();
  }

  function getRecentSites(limit, mode) {
    const safeLimit = Math.max(0, Number(limit) || 0);
    if (safeLimit > 0 && pageState.firefoxBrowserIcons) {
      // Render recent cards once Firefox's own icons are indexed.
      return pageState.firefoxBrowserIconsReady.then(() => getRecentSitesNow(safeLimit, mode));
    }
    return getRecentSitesNow(limit, mode);
  }

  function getRecentSitesNow(limit, mode) {
    const safeLimit = Math.max(0, Number(limit) || 0);
    const viewMode = mode === 'most' ? 'most' : 'latest';
    if (safeLimit <= 0) {
      return Promise.resolve([]);
    }

    const mergeSources = (sources, mergeMode) => NEWTAB_RECENT_STORE.mergeRecentSiteSources({
      ...getRecentStoreOptions(),
      ...(sources || {}),
      mode: mergeMode || viewMode,
      limit: safeLimit,
      candidateLimit: safeLimit,
      pinned: [],
      hidden: []
    });

    const readOpenTabs = () => takeStartupRecentSourceRead('tabs', readRecentOpenTabs);
    const readTopSites = () => takeStartupRecentSourceRead('topSites', readRecentTopSites);
    const readHistoryItems = () => takeStartupRecentSourceRead('historyItems', readRecentHistoryItems);

    const mergeWithTabsIfNeeded = (sources, mergeMode) => {
      const withoutTabs = mergeSources(sources, mergeMode);
      return readOpenTabs().then((tabs) => {
        const shouldMergeTabs = withoutTabs.length < safeLimit ||
          (Array.isArray(tabs) && tabs.some((tab) => isBrowserPageRecentUrl(tab && tab.url)));
        if (!shouldMergeTabs) {
          return withoutTabs;
        }
        return mergeSources({
          ...(sources || {}),
          tabs
        }, mergeMode);
      });
    };

    const loadLatestRecentSites = () => readHistoryItems().then((historyItems) => {
      if (!Array.isArray(historyItems)) {
        return [];
      }
      const historyOnly = mergeSources({ historyItems }, 'latest');
      if (historyOnly.length >= safeLimit) {
        return mergeWithTabsIfNeeded({ historyItems }, 'latest');
      }
      return readTopSites().then((topSites) => mergeWithTabsIfNeeded({
        historyItems,
        topSites: Array.isArray(topSites) ? topSites : []
      }, 'latest'));
    });

    if (viewMode === 'most') {
      return readTopSites().then((topSites) => {
        const topSiteItems = Array.isArray(topSites) ? topSites : [];
        const topOnly = mergeSources({ topSites: topSiteItems }, 'most');
        if (topOnly.length >= safeLimit) {
          return mergeWithTabsIfNeeded({ topSites: topSiteItems }, 'most');
        }
        // Fill a short topSites list from history ranked by visit counts.
        return readHistoryItems().then((historyItems) => mergeWithTabsIfNeeded({
          topSites: topSiteItems,
          historyItems: Array.isArray(historyItems) ? historyItems : []
        }, 'most'));
      });
    }

    return loadLatestRecentSites();
  }

  return {
    updateRecentContextMenuLanguageStrings,
    openRecentHistoryDialog,
    readRecentOpenTabs,
    readRecentTopSites,
    readRecentHistoryItems,
    releaseStartupRecentSourceReads,
    getRecentSites
  };
}

export { createRecentSources };
