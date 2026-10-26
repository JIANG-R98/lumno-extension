// What the tracker reads about a tab: the tab itself, its page hints and
// how the person got there.
import { isRecord, isThenable } from '../../platform/storage-call';
import { MAX_PAGE_LINKS, readMediaSession, readProgressPageHints } from './page-functions';
import type { MediaReading, PageHints, ProgressContext } from './types';

function readLastError(ctx: ProgressContext): chrome.runtime.LastError | null | undefined {
  return ctx.chromeApi && ctx.chromeApi.runtime ? ctx.chromeApi.runtime.lastError : null;
}

function getTab(ctx: ProgressContext, tabId: number): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    if (!ctx.chromeApi || !ctx.chromeApi.tabs || typeof ctx.chromeApi.tabs.get !== 'function') {
      resolve(null);
      return;
    }
    ctx.chromeApi.tabs.get(tabId, (tab) => {
      resolve(readLastError(ctx) ? null : (tab || null));
    });
  });
}

function withTimeout<T>(ctx: ProgressContext, promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const timer = ctx.setTimer(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ctx.probeTimeoutMs);
    promise.then((value) => {
      if (done) return;
      done = true;
      ctx.clearTimer(timer);
      resolve(value);
    }, () => {
      if (done) return;
      done = true;
      ctx.clearTimer(timer);
      resolve(fallback);
    });
  });
}

// Runs a reader in the tab's top frame. Its result comes from the page,
// so it is unknown until normalized.
function executeInTab(ctx: ProgressContext, tabId: number, func: () => unknown, world?: chrome.scripting.ExecutionWorld | `${chrome.scripting.ExecutionWorld}`): Promise<unknown> {
  const scripting = ctx.chromeApi && ctx.chromeApi.scripting;
  if (!scripting || typeof scripting.executeScript !== 'function') return Promise.resolve(null);
  return withTimeout(ctx, new Promise<unknown>((resolve) => {
    try {
      // Firefox answers with a promise as well as the callback.
      const pending: unknown = scripting.executeScript({ target: { tabId }, func, world: world || 'ISOLATED' }, (results) => {
        resolve(readLastError(ctx) ? null : readFirstResult(results));
      });
      if (isThenable(pending)) {
        pending.then((results) => {
          resolve(readFirstResult(results));
        }, () => resolve(null));
      }
    } catch (_error) {
      resolve(null);
    }
  }), null);
}

function normalizeMedia(value: unknown): MediaReading | null {
  return isRecord(value) && value.title
    ? { title: String(value.title).trim(), series: String(value.series || '').trim() }
    : null;
}

function normalizeHints(value: unknown): PageHints {
  const hints = isRecord(value) ? value : {};
  const urls = (list: unknown): string[] => (Array.isArray(list) ? list.map(String).slice(0, MAX_PAGE_LINKS) : []);
  const media = normalizeMedia(hints.media);
  return {
    nextUrls: urls(hints.nextUrls),
    prevUrls: urls(hints.prevUrls),
    episodeNavigation: hints.episodeNavigation === true,
    seriesName: String(hints.seriesName || '').trim(),
    episode: Math.max(0, Number(hints.episode) || 0),
    media
  };
}

function readPageHints(ctx: ProgressContext, tabId: number, options?: { media?: boolean }): Promise<PageHints> {
  return executeInTab(ctx, tabId, readProgressPageHints).then(async (raw) => {
    const hints = normalizeHints(raw);
    if (!hints.media && options && options.media) {
      const media = normalizeMedia(await executeInTab(ctx, tabId, readMediaSession, 'MAIN'));
      if (media) hints.media = media;
    }
    return hints;
  });
}

// How the person reached this URL, from the browser history: a link, or
// a typed URL, bookmark or search.
function getTransition(ctx: ProgressContext, url: string): Promise<string> {
  const history = ctx.chromeApi && ctx.chromeApi.history;
  if (!history || typeof history.getVisits !== 'function') return Promise.resolve('');
  return withTimeout(ctx, new Promise<string>((resolve) => {
    try {
      history.getVisits({ url }, (visits) => {
        if (readLastError(ctx) || !Array.isArray(visits) || !visits.length) {
          resolve('');
          return;
        }
        const latest = visits.reduce((best, visit) => (
          Number(visit.visitTime) > Number(best.visitTime) ? visit : best
        ));
        resolve(String(latest.transition || ''));
      });
    } catch (_error) {
      resolve('');
    }
  }), '');
}

// The first frame's result of scripting.executeScript, which the page
// produced: callers read it as unknown.
function readFirstResult(results: unknown): unknown {
  return Array.isArray(results) && isRecord(results[0]) ? results[0].result : null;
}

function isHttpUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

export {
  executeInTab,
  getTab,
  getTransition,
  isHttpUrl,
  normalizeHints,
  normalizeMedia,
  readFirstResult,
  readLastError,
  readPageHints,
  withTimeout
};
