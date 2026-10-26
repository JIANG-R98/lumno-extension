// Chrome API calls of the preview: rules, capture, injection and the
// surface's messages.
import * as LumnoMessaging from '../../platform/messaging';
import type { PageReply, PageRequest } from '../../domain/messages';
import { createInjectedAppRun } from '../../platform/injection';
import type { StartCommand } from '../../domain/injected-commands';
import { CAPTURE_JPEG_QUALITY } from './constants';
import type { Rule, SurfaceAction } from './types';
import type { LinkPreview } from './preview-state';

// What a call reads of the preview: the browser it runs in.
type PreviewPorts = Pick<LinkPreview, 'ports'>;

function readLastError(preview: PreviewPorts): chrome.runtime.LastError | null | undefined {
  return preview.ports.chromeApi && preview.ports.chromeApi.runtime ? preview.ports.chromeApi.runtime.lastError : null;
}

// Runs a callback-style extension call. Resolves with what it passed back,
// true for a call that passes nothing, or null when it failed.
function callback<T>(preview: PreviewPorts, fn: (done: (result?: T) => void) => void): Promise<T | true | null> {
  return new Promise((resolve) => {
    try {
      fn((result) => {
        resolve(readLastError(preview) ? null : (result === undefined ? true : result));
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

function readRules(preview: PreviewPorts, dnr: typeof chrome.declarativeNetRequest): Promise<Rule[] | null> {
  return callback<Rule[]>(preview, (done) => dnr.getSessionRules(done))
    .then((rules) => (Array.isArray(rules) ? rules : null));
}

function getDnr(preview: PreviewPorts): typeof chrome.declarativeNetRequest | null {
  const dnr = preview.ports.chromeApi && preview.ports.chromeApi.declarativeNetRequest;
  return dnr && typeof dnr.updateSessionRules === 'function' ? dnr : null;
}


function captureTab(preview: PreviewPorts, tab: chrome.tabs.Tab): Promise<string> {
  const tabs = preview.ports.chromeApi && preview.ports.chromeApi.tabs;
  const windowId = tab.windowId;
  if (!tabs || typeof tabs.captureVisibleTab !== 'function' || typeof windowId !== 'number') {
    return Promise.resolve('');
  }
  return callback<string>(preview, (done) => tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: CAPTURE_JPEG_QUALITY
  }, done)).then((dataUrl) => (typeof dataUrl === 'string' ? dataUrl : ''));
}

function injectSurface(preview: PreviewPorts, tabId: number): Promise<boolean> {
  const scripting = preview.ports.chromeApi && preview.ports.chromeApi.scripting;
  if (!scripting || typeof scripting.executeScript !== 'function') {
    return Promise.resolve(false);
  }
  const runtime = preview.ports.chromeApi && preview.ports.chromeApi.runtime;
  if (!runtime) {
    return Promise.resolve(false);
  }
  const start: StartCommand = { type: 'start' };
  return callback<unknown>(preview, (done) => scripting.executeScript(
    createInjectedAppRun(runtime, { tabId, frameIds: [0] }, ['link-preview'], start),
    done
  )).then(Boolean);
}

function sendToSurface<A extends SurfaceAction>(preview: PreviewPorts, tabId: number, message: PageRequest<A>): Promise<PageReply<A> | null> {
  const tabs = preview.ports.chromeApi && preview.ports.chromeApi.tabs;
  if (!tabs || typeof tabs.sendMessage !== 'function') {
    return Promise.resolve(null);
  }
  // The surface's own answer: a frame without the surface answers nothing
  // (undefined), which must not read as success.
  return new Promise((resolve) => {
    try {
      LumnoMessaging.sendTabMessage<A>(tabs, tabId, message, (response) => {
        resolve(readLastError(preview) || response === undefined ? null : response);
      }, { frameId: 0 });
    } catch (_error) {
      resolve(null);
    }
  });
}

export {
  callback,
  captureTab,
  getDnr,
  injectSurface,
  readLastError,
  readRules,
  sendToSurface
};
