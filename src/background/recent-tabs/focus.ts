// Bringing a tab's window forward and activating the tab.
import type { FocusResult } from './types';

function callChromeCallback<T>(fn: (done: (value?: T) => void) => void): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      fn((value) => resolve(value || null));
    } catch (_error) {
      resolve(null);
    }
  });
}

function getRuntimeError(chromeApi: typeof chrome): chrome.runtime.LastError | null {
  return chromeApi && chromeApi.runtime && chromeApi.runtime.lastError
    ? chromeApi.runtime.lastError
    : null;
}

async function focusWindow(api: typeof chrome, windowId: number | null): Promise<void> {
  if (typeof windowId === 'number' && api.windows && typeof api.windows.update === 'function') {
    await callChromeCallback<chrome.windows.Window>((done) => {
      api.windows.update(windowId, { focused: true }, done);
    });
  }
}

function readWindowId(tab: chrome.tabs.Tab | null | undefined): number | null {
  return tab && typeof tab.windowId === 'number' ? tab.windowId : null;
}

async function focusWindowAndActivateTab(
  chromeApi: typeof chrome | null | undefined,
  request: { tabId?: unknown; windowId?: unknown } | null | undefined
): Promise<FocusResult> {
  const api = chromeApi;
  const tabId = request && typeof request.tabId === 'number' ? request.tabId : null;
  const windowId = request && typeof request.windowId === 'number' ? request.windowId : null;
  if (!api || typeof tabId !== 'number' || !api.tabs || typeof api.tabs.update !== 'function') {
    return { ok: false, reason: 'invalid-tab' };
  }

  await focusWindow(api, windowId);

  const tab = await callChromeCallback<chrome.tabs.Tab>((done) => {
    api.tabs.update(tabId, { active: true }, done);
  });
  const error = getRuntimeError(api);
  if (error) {
    return {
      ok: false,
      tabId,
      windowId,
      reason: error.message || 'tab-update-failed'
    };
  }

  return { ok: Boolean(tab), tabId, windowId: windowId ?? readWindowId(tab) };
}

export {
  callChromeCallback,
  focusWindowAndActivateTab,
  getRuntimeError
};
