// Moves tracked pinned cards forward as the person watches or reads on.
import { advance, probeSeries } from './advance';
import { enqueue, forget, observe, rememberTrail } from './dwell';
import { getTab, isHttpUrl } from './tab-reads';
import type { CardHints, DwellCandidate, ObserveOptions, ProgressContext, ProgressTracker, ProgressTrackerOptions, TimerHandle, Trail } from './types';
// A page counts once it has stayed in a tab the person is looking at (or
// listening to) for the dwell time; passing through never moves a card.
// Besides the URL and title, the decision weighs how the person got there
// (clicked on from the card's page, or typed and bookmarked) and, on sites
// with a tracked card only, what the page says about itself: next and
// previous links, episode metadata and the media session.

const DEFAULT_DWELL_MS = 15000;
const DEFAULT_PROBE_TIMEOUT_MS = 800;

function attach(ctx: ProgressContext): boolean {
  const tabs = ctx.chromeApi && ctx.chromeApi.tabs;
  if (!tabs) return false;
  if (tabs.onCreated && typeof tabs.onCreated.addListener === 'function') {
    tabs.onCreated.addListener((tab) => {
      const openerTabId = Number(tab && tab.openerTabId);
      const opener = Number.isInteger(openerTabId) ? ctx.trails.get(openerTabId) : null;
      if (!tab || typeof tab.id !== 'number' || !Number.isInteger(tab.id) || !opener || !isHttpUrl(opener.url)) return;
      // A tab opened from a page came from that page.
      ctx.trails.set(tab.id, { url: '', title: '', previousUrl: opener.url, previousTitle: opener.title });
    });
  }
  if (tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
    tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (!changeInfo) return;
      rememberTrail(ctx, tabId, changeInfo.url || (tab && tab.url), changeInfo.title || (tab && tab.title));
      const contentChanged = Boolean(changeInfo.title) ||
        Object.prototype.hasOwnProperty.call(changeInfo, 'audible');
      if (!(changeInfo.url || changeInfo.status === 'complete' || contentChanged)) return;
      observe(ctx, { ...tab, id: tabId }, { contentChanged });
    });
  }
  if (tabs.onActivated && typeof tabs.onActivated.addListener === 'function') {
    tabs.onActivated.addListener((activeInfo) => {
      const tabId = Number(activeInfo && activeInfo.tabId);
      if (!Number.isInteger(tabId) || !ctx.candidates.has(tabId)) return;
      void getTab(ctx, tabId).then((tab) => {
        if (tab) observe(ctx, tab);
      });
    });
  }
  if (tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
    tabs.onRemoved.addListener((tabId) => {
      forget(ctx, tabId);
      ctx.trails.delete(tabId);
    });
  }
  if (tabs.onReplaced && typeof tabs.onReplaced.addListener === 'function') {
    tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      forget(ctx, removedTabId);
      const trail = ctx.trails.get(removedTabId);
      if (trail) ctx.trails.set(addedTabId, trail);
      ctx.trails.delete(removedTabId);
    });
  }
  return true;
}

function createProgressTracker(options: ProgressTrackerOptions): Readonly<ProgressTracker> {
  const config = options;
  const chromeApi = config.chromeApi || null;
  const progressMatch = config.progressMatch;
  const progressHistory = config.progressHistory;
  const settingsStore = config.settingsStore;
  const isEnabled = typeof config.isEnabled === 'function' ? config.isEnabled : () => true;
  const dwellMs = Number.isFinite(Number(config.dwellMs)) ? Number(config.dwellMs) : DEFAULT_DWELL_MS;
  const probeTimeoutMs = Number.isFinite(Number(config.probeTimeoutMs))
    ? Number(config.probeTimeoutMs)
    : DEFAULT_PROBE_TIMEOUT_MS;
  const now = typeof config.now === 'function' ? config.now : Date.now;
  const setTimer = typeof config.setTimer === 'function'
    ? config.setTimer
    : (callback: () => void, delay: number): TimerHandle => setTimeout(callback, delay);
  const clearTimer = typeof config.clearTimer === 'function'
    ? config.clearTimer
    : (timerId: TimerHandle): void => {
      if (typeof timerId === 'number') clearTimeout(timerId);
    };
  const candidates = new Map<number, DwellCandidate>();
  // Where each tab came from.
  const trails = new Map<number, Trail>();
  // card history id → hints read from the card's own page while it was open.
  const cardHints = new Map<string, CardHints>();
  const ctx: ProgressContext = {
    config,
    chromeApi,
    progressMatch,
    progressHistory,
    settingsStore,
    isEnabled,
    dwellMs,
    probeTimeoutMs,
    now,
    setTimer,
    clearTimer,
    candidates,
    trails,
    cardHints,
    queue: Promise.resolve()
  };

  return Object.freeze({
    attach: () => attach(ctx),
    observe: (tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions) => observe(ctx, tab, options),
    advance: (tab: chrome.tabs.Tab & { id: number; url: string }) => enqueue(ctx, () => advance(ctx, tab)),
    probeSeries: (url: unknown) => probeSeries(ctx, url),
    getPendingCount: () => ctx.candidates.size
  });
}

export {
  DEFAULT_DWELL_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  attach,
  createProgressTracker
};
