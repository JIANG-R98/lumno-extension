// Opening the search overlay on a tab: the per-tab opening guard, injecting the
// overlay runtime and its stylesheets, handing it the tab list and settings,
// and the fallbacks for pages the overlay cannot run on.
//
// Loaded by background.js through its first importScripts block (the Firefox
// build lists that block as background.scripts). Like background.js this is a
// classic script sharing the worker's global scope. Its functions use
// background.js bindings (the settings caches, whenBackgroundSettingsReady, the
// New Tab fallbacks, ...) only when they run, never while this file loads,
// because background.js has not initialized its own top-level bindings yet at
// that point.

const OVERLAY_OPENING_GUARD_MS = 5000;
const OVERLAY_RUNTIME_VERSION = '2026-10-20-search-title-units-v17';
const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
const overlayOpeningByTabId = new Map();
let tabOverlayFetchSeq = 0;

// Numbers each tab list handed to an overlay, so it can drop stale ones.
function nextTabOverlayFetchSeq() {
  tabOverlayFetchSeq += 1;
  return tabOverlayFetchSeq;
}

function finishOverlayOpening(opening) {
  if (!opening || typeof opening.tabId !== 'number') {
    return;
  }
  if (opening.timer) {
    clearTimeout(opening.timer);
    opening.timer = null;
  }
  if (overlayOpeningByTabId.get(opening.tabId) === opening) {
    overlayOpeningByTabId.delete(opening.tabId);
  }
}

function beginOverlayOpening(tab, source) {
  if (!tab || typeof tab.id !== 'number') {
    return null;
  }
  const existing = overlayOpeningByTabId.get(tab.id);
  if (existing) {
    logHotkeyDebug('overlay-opening-guarded', {
      tabId: tab.id,
      source: source || '',
      age: Date.now() - existing.startedAt
    });
    return null;
  }
  const opening = {
    tabId: tab.id,
    source: source || '',
    startedAt: Date.now(),
    timer: null
  };
  opening.timer = setTimeout(() => {
    finishOverlayOpening(opening);
  }, OVERLAY_OPENING_GUARD_MS);
  overlayOpeningByTabId.set(tab.id, opening);
  return opening;
}

function openRestrictedOverlayFallback(activeTab, activeUrl, source) {
  const action = restrictedActionCache || 'default';
  logHotkeyDebug('restricted-url', {
    action: action,
    url: activeUrl,
    source: source || ''
  });
  if (action === 'none') {
    logHotkeyDebug('fallback-open-browser-newtab', { reason: 'restricted_url', source: source || '' });
    openBrowserNewtabFallback({ sourceTab: activeTab });
    return;
  }
  if (action === 'default') {
    logHotkeyDebug('fallback-open-create-newtab', { reason: 'restricted_url', source: source || '' });
    openNewtabFallbackForUrl(activeUrl, { sourceTab: activeTab });
    return;
  }
  logHotkeyDebug('fallback-open-lumno-newtab', { reason: 'restricted_url', source: source || '' });
  openNewtabFallbackForUrl(activeUrl, { sourceTab: activeTab });
}

// Some pages pass the URL check yet refuse the overlay, such as Firefox's PDF
// viewer, so a failed injection follows the restricted page rule too.
function openOverlayInjectionFallback(activeTab, activeUrl, source) {
  whenBackgroundSettingsReady(() => {
    const followBrowserNewtab = restrictedActionCache === 'none';
    logHotkeyDebug('fallback-open-after-inject-failed', {
      followBrowserNewtab: followBrowserNewtab,
      source: source || ''
    });
    openNewtabFallbackForUrl(activeUrl, {
      sourceTab: activeTab,
      followBrowserNewtab: followBrowserNewtab
    });
  });
}

function openOverlayOnTab(activeTab, tabs, source, options) {
  const openOptions = options && typeof options === 'object' ? options : {};
  const overlayOpenStartedAt = Date.now();
  // The entry motion budget measures how long the user has waited on the
  // renderer, so a tab's one-time runtime injection restarts it below.
  let overlayEntryMotionStartedAt = overlayOpenStartedAt;
  let overlayOpening = null;
  let didFinishOpenAttempt = false;
  let shouldRetryPreCompleteFailure = false;
  const finishOpenAttempt = (ok) => {
    if (didFinishOpenAttempt) {
      return;
    }
    didFinishOpenAttempt = true;
    if (typeof openOptions.onComplete === 'function') {
      openOptions.onComplete(ok === true);
    }
    if (overlayOpening) {
      finishOverlayOpening(overlayOpening);
      overlayOpening = null;
    }
    if (ok !== true && openOptions.loadingRecovery !== true &&
        shouldRetryPreCompleteFailure && activeTab &&
        typeof activeTab.id === 'number') {
      const trackedRecord = overlayLoadingRecordsByTabId.get(activeTab.id) || null;
      if (trackedRecord) {
        scheduleOverlayLoadingPreCompleteRetry(activeTab, trackedRecord);
      }
    }
    if ((openOptions.loadingRecovery === true || shouldRetryPreCompleteFailure) &&
        activeTab && typeof activeTab.id === 'number') {
      finishOverlayLoadingOpenAttempt(activeTab.id);
    }
  };
  if (!activeTab || typeof activeTab.id !== 'number') {
    logHotkeyDebug('no-active-tab', { source: source || '' });
    openNewtabFallback();
    finishOpenAttempt(false);
    return;
  }
  if (openOptions.skipDuplicateGuard !== true && shouldIgnoreDuplicateHotkey(activeTab.id)) {
    logHotkeyDebug('duplicate-ignored', { tabId: activeTab.id, source: source || '' });
    finishOpenAttempt(false);
    return;
  }
  const pendingNavigationUrl = getPendingOverlayNavigationUrl(activeTab);
  if (openOptions.loadingRecovery !== true &&
      shouldDeferRestrictedOverlayNavigation(activeTab) &&
      rememberOverlayPendingNavigationIntent(activeTab, source, pendingNavigationUrl)) {
    finishOpenAttempt(false);
    return;
  }
  const activeUrl = getResolvedTabUrl(activeTab);
  const rawUrl = typeof activeTab.url === 'string' ? activeTab.url : '';
  const rawPendingUrl = typeof activeTab.pendingUrl === 'string' ? activeTab.pendingUrl : '';
  const restricted = !canOpenOverlayOnUrl(activeUrl);
  logHotkeyDebug('active-tab', {
    tabId: activeTab.id,
    resolvedUrl: activeUrl,
    tabUrl: rawUrl,
    pendingUrl: rawPendingUrl,
    url: activeUrl,
    restricted: restricted,
    source: source || ''
  });
  if (restricted) {
    finishOpenAttempt(false);
    if (isSearchCommandSource(source) && (isLumnoNewtabUrl(activeUrl) || isBrowserNewtabUrl(activeUrl))) {
      requestFocusVisibleNewtabInput(source, activeTab.id);
      return;
    }
    if (shouldTriggerOnboardingOverlayFromCommand(source, activeUrl)) {
      triggerOnboardingOverlayFromCommand(activeTab, source);
      logHotkeyDebug('suppressed', { reason: 'restricted_onboarding_command', source: source || '' });
      return;
    }
    if (recoverOverlayTargetFromCommandNewtab(activeTab, tabs, source)) {
      return;
    }
    whenBackgroundSettingsReady(() => {
      openRestrictedOverlayFallback(activeTab, activeUrl, source);
    });
    return;
  }
  overlayOpening = beginOverlayOpening(activeTab, source);
  if (!overlayOpening) {
    finishOpenAttempt(false);
    return;
  }
  const overlayLoadingRecord = rememberOverlayLoadingRecord(activeTab, source, openOptions);
  shouldRetryPreCompleteFailure = Boolean(overlayLoadingRecord);
  const shouldInjectOverlayCodexDebugSurface = codexDebugBridge.isEnabled();
  const overlayInjectionFiles = [
    'build/icon-font-preload.js',
    ...(shouldInjectOverlayCodexDebugSurface ? ['build/codex-debug-surface.js'] : []),
    'src/react/overlay-islands.js',
    'build/overlay.js'
  ];
  const runOverlayScript = (tabZoomFactor) => {
      const prefillQuery = getOverlayPrefillQueryForSource(activeTab, source);
      const prioritizeCurrentPageMatch = source === 'page-hotkey-prefill';
      const siteSearchProviders = Array.isArray(siteSearchCache) ? siteSearchCache : [];
      // Icon warmup is best effort; the overlay falls back to bundled icons.
      loadSiteSearchProviders()
        .then((providers) => {
          scheduleSiteSearchProviderIconWarmup(providers, '');
        })
        .catch(() => {});
      chrome.scripting.executeScript({
            target: {tabId: activeTab.id},
            injectImmediately: true,
            func: (overlayTabs, overlayPanelContext, overlayHostId) => {
              const toggleOverlay = window._x_extension_toggleSearchOverlay_2026_unique_;
              if (typeof toggleOverlay !== 'function') {
                console.warn('Lumno: overlay search panel helper not available.');
                return { ok: false, reason: 'search_panel_missing' };
              }
              toggleOverlay(overlayTabs, overlayPanelContext);
              const overlayHost = document.getElementById(overlayHostId);
              return {
                ok: true,
                overlayOpen:
                  window._x_extension_search_overlay_open_2026_unique_ === true &&
                  Boolean(overlayHost && overlayHost.isConnected)
              };
            },
            args: [tabs, {
              tabZoomFactor: tabZoomFactor,
              prefillQuery: prefillQuery,
              prioritizeCurrentPageMatch: prioritizeCurrentPageMatch,
              currentTabId: typeof activeTab.id === 'number' ? activeTab.id : null,
              currentTabUrl: getResolvedTabUrl(activeTab),
              openedAt: overlayEntryMotionStartedAt,
              documentPipEnabled: documentPipEnabledCache,
              siteSearchProviders: Array.isArray(siteSearchProviders) ? siteSearchProviders : [],
              ensureOpen: openOptions.ensureOpen === true,
              loadingSessionTracked: Boolean(overlayLoadingRecord),
              loadingSession: overlayLoadingRecord && overlayLoadingRecord.session
                ? overlayLoadingRecord.session
                : null
            }, OVERLAY_HOST_ID]
          }, function(results) {
            if (chrome.runtime.lastError) {
              logHotkeyDebug('inject-failed', {
                step: 'build/overlay.js',
                tabId: activeTab.id,
                error: chrome.runtime.lastError.message || 'unknown',
                source: source || ''
              });
              if (openOptions.loadingRecovery !== true &&
                  !overlayLoadingRecordsByTabId.has(activeTab.id)) {
                openOverlayInjectionFallback(activeTab, activeUrl, source);
              }
              finishOpenAttempt(false);
              return;
            }
            const mainResult = OVERLAY_LOADING_LIFECYCLE.getMainFrameResult(results);
            const result = mainResult ? mainResult.result : null;
            if (result && result.ok === false) {
              logHotkeyDebug('inject-failed', {
                step: 'build/overlay.js',
                tabId: activeTab.id,
                error: result.reason || 'unknown',
                source: source || ''
              });
              if (openOptions.loadingRecovery !== true &&
                  !overlayLoadingRecordsByTabId.has(activeTab.id)) {
                openOverlayInjectionFallback(activeTab, activeUrl, source);
              }
              finishOpenAttempt(false);
              return;
            }
            updateOverlayLoadingRecordFromInvocation(activeTab, results);
            logHotkeyDebug('overlay-opened', {
              tabId: activeTab.id,
              tabCount: Array.isArray(tabs) ? tabs.length : 0,
              source: source || '',
              tabZoomFactor: tabZoomFactor,
              siteSearchProviderCount: Array.isArray(siteSearchProviders) ? siteSearchProviders.length : 0
            });
            finishOpenAttempt(Boolean(result && result.overlayOpen === true));
          });
  };
  const runOverlayWithResolvedZoom = () => {
    if (chrome.tabs && typeof chrome.tabs.getZoom === 'function') {
      chrome.tabs.getZoom(activeTab.id, (zoomFactor) => {
        const zoom = Number.isFinite(Number(zoomFactor)) && Number(zoomFactor) > 0
          ? Number(zoomFactor)
          : 1;
        runOverlayScript(zoom);
      });
      return;
    }
    runOverlayScript(1);
  };
  const injectOverlayRuntime = () => {
    logHotkeyDebug('inject-start', { tabId: activeTab.id, file: overlayInjectionFiles.join(','), source: source || '' });
    chrome.scripting.executeScript({
      target: {tabId: activeTab.id},
      injectImmediately: true,
      files: overlayInjectionFiles
    }, function() {
      if (chrome.runtime.lastError) {
        logHotkeyDebug('inject-failed', {
          step: overlayInjectionFiles.join(','),
          tabId: activeTab.id,
          error: chrome.runtime.lastError.message || 'unknown',
          source: source || ''
        });
        if (openOptions.loadingRecovery !== true &&
            !overlayLoadingRecordsByTabId.has(activeTab.id)) {
          openOverlayInjectionFallback(activeTab, activeUrl, source);
        }
        finishOpenAttempt(false);
        return;
      }
      // Parsing about 1.5MB of scripts can exceed the whole budget on slower
      // Windows machines, which used to drop every first open's motion.
      overlayEntryMotionStartedAt = Date.now();
      runOverlayWithResolvedZoom();
    });
  };
  chrome.scripting.executeScript({
    target: {tabId: activeTab.id},
    injectImmediately: true,
    func: (runtimeVersion) => {
      return window._x_extension_search_overlay_runtime_version_2026_unique_ === runtimeVersion &&
        typeof window._x_extension_toggleSearchOverlay_2026_unique_ === 'function';
    },
    args: [OVERLAY_RUNTIME_VERSION]
  }, (results) => {
    const probeError = chrome.runtime.lastError;
    const runtimeReady = !probeError &&
      Array.isArray(results) &&
      results[0] &&
      results[0].result === true;
    if (runtimeReady) {
      logHotkeyDebug('runtime-reused', {
        tabId: activeTab.id,
        source: source || '',
        version: OVERLAY_RUNTIME_VERSION
      });
      runOverlayWithResolvedZoom();
      return;
    }
    injectOverlayRuntime();
  });
}
