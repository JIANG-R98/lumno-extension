// Showing the switcher in its host tab: opening it there (through the
// extension page's port, a message, or by injecting the switcher app), or
// advancing one that is already open.
import type { SwitcherOffset } from '../../domain/tab-switcher-model';
import { readScriptResults } from '../../domain/tab-switcher-model';
import type { TabSwitcherContext, TabSwitcherItem } from '../../domain/messages';
import { createInjectedAppRun } from '../../platform/injection';
import * as LumnoMessaging from '../../platform/messaging';
import { getResolvedTabUrl } from '../browser-urls-service';
import { openNewtabFallback, openNewtabFallbackForUrl } from '../newtab-fallback';
import {
  isTabSwitcherExtensionPageMessageTarget,
  postTabSwitcherMessageToExtensionPage
} from '../tab-switcher-extension-page';
import { logHotkeyDebug } from '../worker-context';
import { canHostSwitcherSurface } from './host';
import type { InjectContext } from './types';
import { inlineExtensionFaviconsForWebPage } from '../favicon/favicon-data';

// Opening the switcher in one host tab, and reporting how it went.
interface SwitcherInjection {
  hostTab: chrome.tabs.Tab;
  hostTabId: number;
  itemCount: number;
  source: string;
  finish(ok: boolean, reason: string): void;
}

function buildSwitcherContext(
  items: TabSwitcherItem[],
  context: InjectContext,
  hostTabId: number,
  tabZoomFactor: number
): TabSwitcherContext {
  return {
    tabs: items,
    currentTabId: typeof context.currentTabId === 'number' ? context.currentTabId : hostTabId,
    selectedIndex: typeof context.selectedIndex === 'number' ? context.selectedIndex : 0,
    tabZoomFactor,
    advanceOnExisting: true,
    suppressInitialShortcutAdvance: context.source === 'commands-tab-switcher',
    shortcut: typeof context.shortcut === 'string' ? context.shortcut : 'Alt+Q',
    reverse: context.reverse,
    source: context.source || ''
  };
}

function reportSwitcherOpened(injection: SwitcherInjection, path: string): void {
  logHotkeyDebug('tab-switcher-opened', {
    tabId: injection.hostTabId,
    itemCount: injection.itemCount,
    source: injection.source,
    path
  });
  injection.finish(true, path);
}

// An extension page hosting the switcher opens it through its port.
function openSwitcherOnExtensionPage(injection: SwitcherInjection, switcherContext: TabSwitcherContext): void {
  const { hostTab } = injection;
  postTabSwitcherMessageToExtensionPage(hostTab, {
    action: 'openTabSwitcherFromCommand',
    context: switcherContext
  }, (ok, reason) => {
    if (ok) {
      reportSwitcherOpened(injection, 'extension-page-port');
      return;
    }
    logHotkeyDebug('tab-switcher-extension-page-open-failed', { tabId: hostTab.id, reason: reason || '', source: injection.source });
    openNewtabFallbackForUrl(getResolvedTabUrl(hostTab), { sourceTab: hostTab });
    injection.finish(false, reason || 'extension-page-open-failed');
  });
}

// Injects the switcher app into a web page that has none yet. The icon font
// preload loads alongside it, so the font starts loading before the
// switcher's larger modules have parsed.
function injectSwitcherApp(injection: SwitcherInjection, switcherContext: TabSwitcherContext): void {
  const { hostTab, hostTabId, source } = injection;
  chrome.scripting.executeScript(createInjectedAppRun(
    chrome.runtime,
    { tabId: hostTabId },
    ['icon-font-preload', 'tab-switcher'],
    { type: 'toggle', context: switcherContext }
  ), (results) => {
    const injectError = chrome.runtime && chrome.runtime.lastError;
    if (injectError) {
      const errorMessage = injectError.message || 'unknown';
      logHotkeyDebug('tab-switcher-inject-failed', { tabId: hostTab.id, error: errorMessage, source });
      openNewtabFallbackForUrl(getResolvedTabUrl(hostTab), { sourceTab: hostTab });
      injection.finish(false, errorMessage);
      return;
    }
    const result = readScriptResults(results)[0];
    if (result && result.ok === false) {
      const failure = String(result.reason || '');
      logHotkeyDebug('tab-switcher-run-failed', { tabId: hostTabId, error: failure || 'unknown', source });
      injection.finish(false, failure || 'run-failed');
      return;
    }
    reportSwitcherOpened(injection, 'executeScript');
  });
}

// A web page whose switcher app is already loaded opens it on a message;
// otherwise the app is injected.
function openSwitcherOnWebPage(injection: SwitcherInjection, switcherContext: TabSwitcherContext): void {
  if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function') {
    injectSwitcherApp(injection, switcherContext);
    return;
  }
  try {
    LumnoMessaging.sendTabMessage(chrome.tabs, injection.hostTabId, {
      action: 'openTabSwitcherFromCommand',
      context: switcherContext
    }, (response) => {
      const didOpen = !(chrome.runtime && chrome.runtime.lastError) && response && response.ok === true;
      if (didOpen) {
        reportSwitcherOpened(injection, 'runtime-message');
      } else {
        injectSwitcherApp(injection, switcherContext);
      }
    });
  } catch (_error) {
    injectSwitcherApp(injection, switcherContext);
  }
}

function readTabZoom(tabId: number): Promise<number> {
  if (!chrome.tabs || typeof chrome.tabs.getZoom !== 'function') {
    return Promise.resolve(1);
  }
  return new Promise((resolve) => {
    chrome.tabs.getZoom(tabId, (zoomFactor) => {
      resolve(Number.isFinite(Number(zoomFactor)) && Number(zoomFactor) > 0 ? Number(zoomFactor) : 1);
    });
  });
}

function injectTabSwitcherOnTab(hostTab: chrome.tabs.Tab, items: TabSwitcherItem[], context: InjectContext): void {
  const finish = (ok: boolean, reason: string): void => {
    if (context && typeof context.onOpenComplete === 'function') {
      context.onOpenComplete(Boolean(ok), reason || '');
    }
  };
  const hostTabId = hostTab ? hostTab.id : undefined;
  if (!hostTab || typeof hostTabId !== 'number') {
    openNewtabFallback();
    finish(false, 'invalid-host-tab');
    return;
  }
  const source = context && context.source ? context.source : '';
  const tabItems = Array.isArray(items) ? items : [];
  if (!tabItems.length) {
    logHotkeyDebug('tab-switcher-empty', { hostTabId, source });
    finish(false, 'empty');
    return;
  }
  const injection: SwitcherInjection = { hostTab, hostTabId, itemCount: tabItems.length, source, finish };
  if (isTabSwitcherExtensionPageMessageTarget(hostTab)) {
    openSwitcherOnExtensionPage(injection, buildSwitcherContext(tabItems, context, hostTabId, 1));
    return;
  }
  // The switcher renders inside the web page, which cannot load _favicon URLs.
  void Promise.all([readTabZoom(hostTabId), inlineExtensionFaviconsForWebPage(tabItems)]).then(([zoom, pageItems]) => {
    openSwitcherOnWebPage(injection, buildSwitcherContext(pageItems, context, hostTabId, zoom));
  });
}

function advanceExistingTabSwitcherOnTab(
  tab: chrome.tabs.Tab,
  source: string,
  offset: SwitcherOffset,
  callback: (didAdvance: boolean) => void
): void {
  if (!tab || typeof tab.id !== 'number' || !canHostSwitcherSurface(tab)) {
    if (typeof callback === 'function') {
      callback(false);
    }
    return;
  }

  const tabId = tab.id;
  const finish = (didAdvance: boolean): void => {
    if (typeof callback === 'function') {
      callback(Boolean(didAdvance));
    }
  };

  if (isTabSwitcherExtensionPageMessageTarget(tab)) {
    postTabSwitcherMessageToExtensionPage(tab, {
      action: 'advanceOpenTabSwitcherFromCommand',
      offset
    }, (ok, _reason, response) => {
      const didAdvance = Boolean(ok && response && response.advanced === true);
      if (didAdvance) {
        logHotkeyDebug('tab-switcher-advanced-fast', {
          tabId: tab.id,
          source: source || '',
          path: 'extension-page-port'
        });
      }
      finish(didAdvance);
    });
    return;
  }

  const runRuntimeMessageFastPath = (): void => {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.sendMessage !== 'function' || typeof tabId !== 'number') {
      finish(false);
      return;
    }
    try {
      LumnoMessaging.sendTabMessage(chrome.tabs, tabId, {
        action: 'advanceOpenTabSwitcherFromCommand',
        offset
      }, (response) => {
        const didAdvance = Boolean(!(chrome.runtime && chrome.runtime.lastError) &&
          response &&
          response.ok === true &&
          response.advanced === true);
        if (didAdvance) {
          logHotkeyDebug('tab-switcher-advanced-fast', {
            tabId: tab.id,
            source: source || '',
            path: 'runtime-message'
          });
        }
        finish(didAdvance);
      });
    } catch (_error) {
      finish(false);
    }
  };

  runRuntimeMessageFastPath();
}

export { advanceExistingTabSwitcherOnTab, injectTabSwitcherOnTab };
