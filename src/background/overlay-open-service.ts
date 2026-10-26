// Opening the search overlay on a tab: the per-tab opening guard, injecting the
// overlay runtime and its stylesheets, handing it the tab list and settings,
// and the fallbacks for pages the overlay cannot run on.
//
// A module of the service worker; background.ts imports it before its own code
// runs. It uses other services' bindings only when its functions run, never
// while this file loads, because the services import one another.

import * as OVERLAY_LOADING_LIFECYCLE from './overlay-loading-lifecycle';
import { openBrowserNewtabFallback, openNewtabFallback, openNewtabFallbackForUrl } from './newtab-fallback';
import {
  getRestrictedAction,
  isDocumentPipEnabled,
  logHotkeyDebug,
  whenBackgroundSettingsReady
} from './worker-context';
import { scheduleSiteSearchProviderIconWarmup } from './favicon-service';
import { loadSiteSearchProviders, siteSearchCache } from './search-suggestions-service';
import {
  canOpenOverlayOnUrl,
  getResolvedTabUrl,
  isBrowserNewtabUrl,
  isLumnoNewtabUrl
} from './browser-urls-service';
import {
  finishOverlayLoadingOpenAttempt,
  getPendingOverlayNavigationUrl,
  overlayLoadingRecordsByTabId,
  rememberOverlayLoadingRecord,
  rememberOverlayPendingNavigationIntent,
  scheduleOverlayLoadingPreCompleteRetry,
  shouldDeferRestrictedOverlayNavigation,
  updateOverlayLoadingRecordFromInvocation
} from './overlay-loading-service';
import {
  getOverlayPrefillQueryForSource,
  isSearchCommandSource,
  recoverOverlayTargetFromCommandNewtab,
  requestFocusVisibleNewtabInput,
  shouldIgnoreDuplicateHotkey,
  shouldTriggerOnboardingOverlayFromCommand,
  triggerOnboardingOverlayFromCommand
} from './command-service';
import type { OverlayOpenContext } from '../domain/messages';
import type { TrackedLoadingRecord } from './overlay-loading-service';

// A tab as the overlay services read it; recovery builds partial ones.
type TargetTab = Partial<chrome.tabs.Tab>;

interface OpenOverlayOptions {
  onComplete?: (ok: boolean) => void;
  // Reopening after the page loaded under the overlay.
  loadingRecovery?: boolean;
  loadingRecord?: TrackedLoadingRecord | null;
  ensureOpen?: boolean;
  skipDuplicateGuard?: boolean;
}

// The overlay being opened on a tab; a second open meanwhile is ignored.
interface OverlayOpening {
  tabId: number;
  source: string;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const OVERLAY_OPENING_GUARD_MS = 5000;
export const OVERLAY_RUNTIME_VERSION = '2026-10-20-search-title-units-v17';
export const OVERLAY_HOST_ID = '_x_extension_overlay_host_2026_unique_';
export const overlayOpeningByTabId = new Map<number, OverlayOpening>();
let tabOverlayFetchSeq = 0;

// Numbers each tab list handed to an overlay, so it can drop stale ones.
export function nextTabOverlayFetchSeq(): number {
  tabOverlayFetchSeq += 1;
  return tabOverlayFetchSeq;
}

export function finishOverlayOpening(opening: OverlayOpening | null | undefined): void {
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

function beginOverlayOpening(tab: TargetTab, source: string): OverlayOpening | null {
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
  const opening: OverlayOpening = {
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

function openRestrictedOverlayFallback(activeTab: TargetTab, activeUrl: string, source: string): void {
  const action = getRestrictedAction();
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
function openOverlayInjectionFallback(activeTab: TargetTab, activeUrl: string, source: string): void {
  whenBackgroundSettingsReady(() => {
    const followBrowserNewtab = getRestrictedAction() === 'none';
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

export function openOverlayOnTab(
  activeTab: TargetTab | null | undefined,
  tabs: readonly TargetTab[],
  source: string,
  options?: OpenOverlayOptions | null
): void {
  const openOptions: OpenOverlayOptions = options && typeof options === 'object' ? options : {};
  const overlayOpenStartedAt = Date.now();
  // The entry motion budget measures how long the user has waited on the
  // renderer, so a tab's one-time runtime injection restarts it below.
  let overlayEntryMotionStartedAt = overlayOpenStartedAt;
  let overlayOpening: OverlayOpening | null = null;
  let didFinishOpenAttempt = false;
  let shouldRetryPreCompleteFailure = false;
  const finishOpenAttempt = (ok: boolean): void => {
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
  const tabId = activeTab.id;
  if (openOptions.skipDuplicateGuard !== true && shouldIgnoreDuplicateHotkey(tabId)) {
    logHotkeyDebug('duplicate-ignored', { tabId, source: source || '' });
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
      requestFocusVisibleNewtabInput(source, tabId);
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
  const overlayLoadingRecord = rememberOverlayLoadingRecord({ ...activeTab, id: tabId }, source, openOptions);
  shouldRetryPreCompleteFailure = Boolean(overlayLoadingRecord);
  const overlayInjectionFiles = [
    'build/icon-font-preload.js',
    'build/overlay-islands.js',
    'build/overlay.js'
  ];
  const runOverlayScript = (tabZoomFactor: number): void => {
      const prefillQuery = getOverlayPrefillQueryForSource(activeTab, source);
      const prioritizeCurrentPageMatch = source === 'page-hotkey-prefill';
      const siteSearchProviders = Array.isArray(siteSearchCache) ? siteSearchCache : [];
      const overlayContext: OverlayOpenContext = {
        tabZoomFactor: tabZoomFactor,
        prefillQuery: prefillQuery,
        prioritizeCurrentPageMatch: prioritizeCurrentPageMatch,
        currentTabId: tabId,
        currentTabUrl: getResolvedTabUrl(activeTab),
        openedAt: overlayEntryMotionStartedAt,
        documentPipEnabled: isDocumentPipEnabled(),
        siteSearchProviders,
        ensureOpen: openOptions.ensureOpen === true,
        loadingSessionTracked: Boolean(overlayLoadingRecord),
        loadingSession: overlayLoadingRecord && overlayLoadingRecord.session
          ? overlayLoadingRecord.session
          : null
      };
      // Icon warmup is best effort; the overlay falls back to bundled icons.
      loadSiteSearchProviders()
        .then((providers) => {
          scheduleSiteSearchProviderIconWarmup(providers, '');
        })
        .catch(() => {});
      chrome.scripting.executeScript({
            target: {tabId},
            injectImmediately: true,
            // Runs in the page on its own.
            func: (overlayTabs: readonly TargetTab[], overlayPanelContext: OverlayOpenContext, overlayHostId: string): unknown => {
              const toggleOverlay: unknown = Reflect.get(window, '_x_extension_toggleSearchOverlay_2026_unique_');
              if (typeof toggleOverlay !== 'function') {
                console.warn('Lumno: overlay search panel helper not available.');
                return { ok: false, reason: 'search_panel_missing' };
              }
              Reflect.apply(toggleOverlay, window, [overlayTabs, overlayPanelContext]);
              const overlayHost = document.getElementById(overlayHostId);
              return {
                ok: true,
                overlayOpen:
                  Reflect.get(window, '_x_extension_search_overlay_open_2026_unique_') === true &&
                  Boolean(overlayHost && overlayHost.isConnected)
              };
            },
            args: [tabs, overlayContext, OVERLAY_HOST_ID]
          }, function(results) {
            const lastError = chrome.runtime.lastError;
            if (lastError) {
              logHotkeyDebug('inject-failed', {
                step: 'build/overlay.js',
                tabId,
                error: lastError.message || 'unknown',
                source: source || ''
              });
              if (openOptions.loadingRecovery !== true &&
                  !overlayLoadingRecordsByTabId.has(tabId)) {
                openOverlayInjectionFallback(activeTab, activeUrl, source);
              }
              finishOpenAttempt(false);
              return;
            }
            const mainResult = OVERLAY_LOADING_LIFECYCLE.getMainFrameResult(results);
            const result = mainResult && isRecord(mainResult.result) ? mainResult.result : null;
            if (result && result.ok === false) {
              logHotkeyDebug('inject-failed', {
                step: 'build/overlay.js',
                tabId,
                error: String(result.reason || '') || 'unknown',
                source: source || ''
              });
              if (openOptions.loadingRecovery !== true &&
                  !overlayLoadingRecordsByTabId.has(tabId)) {
                openOverlayInjectionFallback(activeTab, activeUrl, source);
              }
              finishOpenAttempt(false);
              return;
            }
            updateOverlayLoadingRecordFromInvocation(activeTab, results);
            logHotkeyDebug('overlay-opened', {
              tabId,
              tabCount: Array.isArray(tabs) ? tabs.length : 0,
              source: source || '',
              tabZoomFactor: tabZoomFactor,
              siteSearchProviderCount: Array.isArray(siteSearchProviders) ? siteSearchProviders.length : 0
            });
            finishOpenAttempt(Boolean(result && result.overlayOpen === true));
          });
  };
  const runOverlayWithResolvedZoom = (): void => {
    if (chrome.tabs && typeof chrome.tabs.getZoom === 'function') {
      chrome.tabs.getZoom(tabId, (zoomFactor) => {
        const zoom = Number.isFinite(Number(zoomFactor)) && Number(zoomFactor) > 0
          ? Number(zoomFactor)
          : 1;
        runOverlayScript(zoom);
      });
      return;
    }
    runOverlayScript(1);
  };
  const injectOverlayRuntime = (): void => {
    logHotkeyDebug('inject-start', { tabId, file: overlayInjectionFiles.join(','), source: source || '' });
    chrome.scripting.executeScript({
      target: {tabId},
      injectImmediately: true,
      files: overlayInjectionFiles
    }, function() {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        logHotkeyDebug('inject-failed', {
          step: overlayInjectionFiles.join(','),
          tabId,
          error: lastError.message || 'unknown',
          source: source || ''
        });
        if (openOptions.loadingRecovery !== true &&
            !overlayLoadingRecordsByTabId.has(tabId)) {
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
    target: {tabId},
    injectImmediately: true,
    // Runs in the page on its own.
    func: (runtimeVersion: string): boolean => {
      return Reflect.get(window, '_x_extension_search_overlay_runtime_version_2026_unique_') === runtimeVersion &&
        typeof Reflect.get(window, '_x_extension_toggleSearchOverlay_2026_unique_') === 'function';
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
        tabId,
        source: source || '',
        version: OVERLAY_RUNTIME_VERSION
      });
      runOverlayWithResolvedZoom();
      return;
    }
    injectOverlayRuntime();
  });
}

export type { OpenOverlayOptions, OverlayOpening, TargetTab };
