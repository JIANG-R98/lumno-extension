// Inside the preview's own frame: telling the surface a page loaded, its
// look and background, and Escape passed up to close the preview.
import {
  PREVIEW_FRAME_SOURCE,
  readPreviewSurfaceCommand
} from '../domain/link-preview-frame-messages';
import type { PreviewFrameMessage } from '../domain/link-preview-frame-messages';
import { isNavigateEvent, readPageNavigation } from '../platform/page-navigation';
import { cleanups, listenDocument, listenTarget, listenWindow, send } from './link-preview-trigger-runtime';

function postToPreviewSurface(message: PreviewFrameMessage): void {
  try {
    window.parent.postMessage({ source: PREVIEW_FRAME_SOURCE, ...message }, '*');
  } catch (_error) {
    // The parent may be gone while this frame unloads.
  }
}

// Scrolling that runs past the previewed page's edge would otherwise chain
// to the page under the preview, which scrolls out of sight behind its
// screenshot and is found moved when the preview closes.
//
// The page's own scrollbar (the root's, or the body's on pages that scroll
// it, as X does while it loads) is replaced by one drawn here, the same on
// every site and every system setting: a thin thumb on a clear track that
// stops short of the window's rounded corners, which would otherwise cut
// off the ends of a full-height bar. The standard properties go back to
// auto, as Chromium ignores the scrollbar parts while either is set;
// browsers without the parts get a thin standard bar.
const CORNER_CLEARANCE_PX = 16;
const SCROLLBAR_THUMB = 'rgba(128, 128, 128, 0.45)';
function stylePreviewedPage(): void {
  const style = document.createElement('style');
  style.textContent = [
    ':root {',
    '  overscroll-behavior: contain !important;',
    '}',
    '@supports not selector(::-webkit-scrollbar) {',
    '  :root, body {',
    '    scrollbar-width: thin !important;',
    `    scrollbar-color: ${SCROLLBAR_THUMB} transparent !important;`,
    '  }',
    '}',
    '@supports selector(::-webkit-scrollbar) {',
    '  :root, body {',
    '    scrollbar-width: auto !important;',
    '    scrollbar-color: auto !important;',
    '  }',
    '  :root::-webkit-scrollbar, body::-webkit-scrollbar {',
    '    width: 12px !important;',
    '    height: 12px !important;',
    '    background: transparent !important;',
    '  }',
    '  :root::-webkit-scrollbar-track, body::-webkit-scrollbar-track {',
    '    background: transparent !important;',
    `    margin: ${CORNER_CLEARANCE_PX}px !important;`,
    '  }',
    '  :root::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {',
    '    min-height: 32px !important;',
    '    min-width: 32px !important;',
    '    border: 3px solid transparent !important;',
    '    border-radius: 999px !important;',
    `    background: ${SCROLLBAR_THUMB} padding-box !important;`,
    '  }',
    '  :root::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {',
    '    background-color: rgba(128, 128, 128, 0.65) !important;',
    '  }',
    '  :root::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner {',
    '    background: transparent !important;',
    '  }',
    '}'
  ].join('\n');
  (document.head || document.documentElement).append(style);
}

// The preview window paints itself in the page's own background color.
// Its corners clip the frame and the window's color shows in their
// antialiased edge, and through the scrollbar's clear track; a white
// window around a dark page left a light seam in both. The color is taken
// once the page has loaded and held still for a moment, and again whenever
// it settles on another: pages paint a placeholder color while loading (X
// starts black), and following each one flashed the window's edge.
function readDarkQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
}

function readPageBackground(): string {
  for (const element of [document.documentElement, document.body]) {
    if (!element) {
      continue;
    }
    const color = getComputedStyle(element).backgroundColor;
    const match = /^rgba?\(([^)]+)\)$/.exec(color || '');
    const parts = match ? match[1].split(/[\s,/]+/).filter(Boolean) : [];
    if (parts.length >= 3 && (parts.length < 4 || Number(parts[3]) >= 1)) {
      return color;
    }
  }
  // Nothing painted: the canvas color, dark where the page asks for it.
  const scheme = getComputedStyle(document.documentElement).colorScheme || '';
  const darkQuery = readDarkQuery();
  const prefersDark = Boolean(darkQuery && darkQuery.matches);
  const dark = /\bdark\b/.test(scheme) && (prefersDark || !/\blight\b/.test(scheme));
  return dark ? 'rgb(18, 18, 18)' : 'rgb(255, 255, 255)';
}

const BACKGROUND_SETTLE_MS = 250;
function followPageBackground(): void {
  let reported = '';
  let loaded = document.readyState === 'complete';
  let timer = 0;
  const report = (): void => {
    timer = 0;
    const color = readPageBackground();
    if (color !== reported) {
      reported = color;
      postToPreviewSurface({ type: 'background', color });
    }
  };
  // Also keeps pages that touch their root's attributes on every scroll
  // cheap: the style is read once a burst is over.
  const schedule = (): void => {
    if (!loaded) {
      return;
    }
    window.clearTimeout(timer);
    timer = window.setTimeout(report, BACKGROUND_SETTLE_MS);
  };
  const observer = new MutationObserver(schedule);
  const observe = (): void => {
    observer.observe(document.documentElement, { attributes: true });
    if (document.body) {
      observer.observe(document.body, { attributes: true });
    }
  };
  observe();
  cleanups.push(() => {
    observer.disconnect();
    window.clearTimeout(timer);
  });
  listenDocument('DOMContentLoaded', observe);
  listenWindow('load', () => {
    loaded = true;
    schedule();
  });
  const darkQuery = readDarkQuery();
  if (darkQuery) {
    listenTarget(darkQuery, 'change', schedule);
  }
  schedule();
}

function setupPreviewFrame(): void {
  if (document.documentElement) {
    stylePreviewedPage();
    followPageBackground();
  }
  // canGoBack is the frame's own history, never the tab's: the preview's
  // Back goes through the Navigation API, which cannot step out of the
  // frame, where history.back() from its first page would take the page
  // under the preview back instead.
  const navigation = readPageNavigation(window);
  const reportLocation = (): void => {
    postToPreviewSurface({
      type: 'alive',
      url: location.href,
      canGoBack: Boolean(navigation && navigation.canGoBack)
    });
  };
  reportLocation();
  // The background reads this page's address from the browser and lets
  // the preview frame its site from now on (see linkPreviewFrameCommitted;
  // until the frame is bound it is ignored, and the bind below counts).
  send({ action: 'linkPreviewFrameCommitted' });
  if (navigation) {
    // Where the frame goes next, for the background to try again if the
    // site there refuses framing. It allows nothing by itself.
    listenTarget(navigation, 'navigate', (event) => {
      if (!isNavigateEvent(event) || event.downloadRequest || (event.destination && event.destination.sameDocument)) {
        return;
      }
      const url = event.destination && typeof event.destination.url === 'string' ? event.destination.url : '';
      if (/^https?:\/\//i.test(url)) {
        send({ action: 'linkPreviewFrameNavigating', url });
      }
    });
    listenTarget(navigation, 'navigatesuccess', reportLocation);
    listenTarget(navigation, 'currententrychange', reportLocation);
    // The window shows the page loading again when it leaves for another
    // document (a link, Back, Shift+click); the frame's load event ends it,
    // or navigatesuccess when the page handles the navigation itself.
    listenTarget(navigation, 'navigate', (event) => {
      if (isNavigateEvent(event) && !event.downloadRequest && !(event.destination && event.destination.sameDocument)) {
        postToPreviewSurface({ type: 'loading' });
      }
    });
    listenTarget(navigation, 'navigatesuccess', () => postToPreviewSurface({ type: 'loaded' }));
  }
  listenWindow('message', (event) => {
    if (event.source !== window.parent) {
      return;
    }
    const command = readPreviewSurfaceCommand(event.data);
    if (!command) {
      return;
    }
    if (command.type === 'back' && navigation && navigation.canGoBack && typeof navigation.back === 'function') {
      const result = navigation.back();
      // A traversal the page cancels rejects both; nothing is left to do.
      [result.committed, result.finished].forEach((promise) => {
        if (promise) {
          promise.catch(() => {});
        }
      });
    } else if (command.type === 'reload') {
      location.reload();
    } else if (command.type === 'bind') {
      send({ action: 'linkPreviewFrameBind', secret: command.secret });
    }
  });
  // Escape closes the preview even where the previewed page claims the key
  // for itself (many prevent it, or stop it, on every press); only an open
  // modal of the page keeps it. Watching in the capture phase and deciding
  // once the event has gone through the page sees presses the page stops
  // and knows whether it took them.
  listenWindow('keydown', (event) => {
    if (event.key !== 'Escape' || !event.isTrusted) {
      return;
    }
    window.setTimeout(() => {
      if (!(event.defaultPrevented && hasOpenModal())) {
        postToPreviewSurface({ type: 'escape' });
      }
    }, 0);
  }, true);
}

function hasOpenModal(): boolean {
  const modals = document.querySelectorAll('dialog[open], [aria-modal="true"]');
  return Array.from(modals).some((modal) => modal.getClientRects().length > 0);
}

export {
  BACKGROUND_SETTLE_MS,
  CORNER_CLEARANCE_PX,
  SCROLLBAR_THUMB,
  followPageBackground,
  hasOpenModal,
  postToPreviewSurface,
  readDarkQuery,
  readPageBackground,
  setupPreviewFrame,
  stylePreviewedPage
};
