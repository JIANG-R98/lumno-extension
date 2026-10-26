// Which tabs the person is looking at, and how long they stay on a page.
import { advance } from './advance';
import { getTab, isHttpUrl } from './tab-reads';
import type { AdvanceResult, DwellCandidate, ObserveOptions, ProgressContext } from './types';

function isTrackableTab(tab: chrome.tabs.Tab | null | undefined): tab is chrome.tabs.Tab & { id: number; url: string } {
  return Boolean(tab && Number.isInteger(tab.id) && !tab.incognito && isHttpUrl(tab.url));
}

function isEngaged(tab: chrome.tabs.Tab | null | undefined): boolean {
  return Boolean(tab && (tab.active || tab.audible));
}

function rememberTrail(ctx: ProgressContext, tabId: number, url: string | undefined, title: string | undefined): void {
  const entry = ctx.trails.get(tabId) || { url: '', title: '', previousUrl: '', previousTitle: '' };
  if (url && url !== entry.url) {
    // A blank or internal page in between (a new tab's first load) keeps
    // the page the tab really came from.
    const cameFrom = isHttpUrl(entry.url)
      ? { previousUrl: entry.url, previousTitle: entry.title }
      : { previousUrl: entry.previousUrl, previousTitle: entry.previousTitle };
    ctx.trails.set(tabId, { url, title: String(title || ''), ...cameFrom });
    return;
  }
  if (title) ctx.trails.set(tabId, { ...entry, title: String(title) });
}

function forget(ctx: ProgressContext, tabId: number): void {
  const candidate = ctx.candidates.get(tabId);
  if (candidate && candidate.timer !== null) ctx.clearTimer(candidate.timer);
  ctx.candidates.delete(tabId);
}

function startDwell(ctx: ProgressContext, tabId: number, url: string): void {
  forget(ctx, tabId);
  const candidate: DwellCandidate = { url, timer: null, waiting: false, settled: false };
  candidate.timer = ctx.setTimer(() => {
    candidate.timer = null;
    void settle(ctx, tabId, candidate);
  }, ctx.dwellMs);
  ctx.candidates.set(tabId, candidate);
}

function observe(ctx: ProgressContext, tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions): void {
  if (!ctx.isEnabled() || !isTrackableTab(tab)) {
    if (tab && typeof tab.id === 'number' && Number.isInteger(tab.id)) forget(ctx, tab.id);
    return;
  }
  const candidate = ctx.candidates.get(tab.id);
  if (candidate && candidate.url === tab.url) {
    // The dwell ran out while the tab was in the background; it starts
    // over once the person comes back to it. A page whose content changes
    // without a new URL (a player moving to the next episode) is read again.
    if ((candidate.waiting && isEngaged(tab)) || (candidate.settled && options && options.contentChanged)) {
      startDwell(ctx, tab.id, tab.url);
    }
    return;
  }
  startDwell(ctx, tab.id, tab.url);
}

function settle(ctx: ProgressContext, tabId: number, candidate: DwellCandidate): Promise<AdvanceResult | null> {
  return getTab(ctx, tabId).then((tab) => {
    if (ctx.candidates.get(tabId) !== candidate) return null;
    if (!tab || tab.url !== candidate.url || !isTrackableTab(tab)) {
      forget(ctx, tabId);
      return null;
    }
    if (!isEngaged(tab)) {
      candidate.waiting = true;
      return null;
    }
    candidate.settled = true;
    return enqueue(ctx, () => advance(ctx, tab));
  });
}

function enqueue<T>(ctx: ProgressContext, task: () => Promise<T>): Promise<T> {
  const run = ctx.queue.then(task, task);
  ctx.queue = run.catch(() => {});
  return run;
}

export {
  enqueue,
  forget,
  isEngaged,
  isTrackableTab,
  observe,
  rememberTrail,
  settle,
  startDwell
};
