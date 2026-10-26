// Moves tracked pinned cards forward as the person watches or reads on.
// A page counts once it has stayed in a tab the person is looking at (or
// listening to) for the dwell time; passing through never moves a card.
// Besides the URL and title, the decision weighs how the person got there
// (clicked on from the card's page, or typed and bookmarked) and, on sites
// with a tracked card only, what the page says about itself: next and
// previous links, episode metadata and the media session.
import { advance, probeSeries } from './advance';
import { forget, observe } from './dwell';
import { getTab } from './tab-reads';
import { TaskQueue } from './tracking';
import { TabTrails } from './trails';
import type { ProgressPorts, ProgressTracking } from './tracking';
import type { ObserveOptions, ProgressTracker, ProgressTrackerOptions, TimerHandle } from './types';

const DEFAULT_DWELL_MS = 15000;
const DEFAULT_PROBE_TIMEOUT_MS = 800;

function listenToTabUpdates(tracking: ProgressTracking, tabs: typeof chrome.tabs): void {
  tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo) return;
    tracking.trails.remember(tabId, changeInfo.url || (tab && tab.url), changeInfo.title || (tab && tab.title));
    const contentChanged = Boolean(changeInfo.title) || Object.prototype.hasOwnProperty.call(changeInfo, 'audible');
    if (!(changeInfo.url || changeInfo.status === 'complete' || contentChanged)) return;
    observe(tracking, { ...tab, id: tabId }, { contentChanged });
  });
}

function hasEvent(event: { addListener?: unknown } | undefined): boolean {
  return Boolean(event && typeof event.addListener === 'function');
}

function attach(tracking: ProgressTracking): boolean {
  const tabs = tracking.ports.chromeApi && tracking.ports.chromeApi.tabs;
  if (!tabs) return false;
  if (hasEvent(tabs.onCreated)) tabs.onCreated.addListener((tab) => tracking.trails.openedFrom(tab));
  if (hasEvent(tabs.onUpdated)) listenToTabUpdates(tracking, tabs);
  if (hasEvent(tabs.onActivated)) {
    tabs.onActivated.addListener((activeInfo) => {
      const tabId = Number(activeInfo && activeInfo.tabId);
      if (!Number.isInteger(tabId) || !tracking.candidates.has(tabId)) return;
      void getTab(tracking, tabId).then((tab) => {
        if (tab) observe(tracking, tab);
      });
    });
  }
  if (hasEvent(tabs.onRemoved)) {
    tabs.onRemoved.addListener((tabId) => {
      forget(tracking, tabId);
      tracking.trails.forget(tabId);
    });
  }
  if (hasEvent(tabs.onReplaced)) {
    tabs.onReplaced.addListener((addedTabId, removedTabId) => {
      forget(tracking, removedTabId);
      tracking.trails.replace(addedTabId, removedTabId);
    });
  }
  return true;
}

function readPorts(config: ProgressTrackerOptions): ProgressPorts {
  const finite = (value: unknown, fallback: number): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  return {
    chromeApi: config.chromeApi || null,
    settingsStore: config.settingsStore,
    isEnabled: typeof config.isEnabled === 'function' ? config.isEnabled : () => true,
    now: typeof config.now === 'function' ? config.now : Date.now,
    setTimer: typeof config.setTimer === 'function'
      ? config.setTimer
      : (callback: () => void, delay: number): TimerHandle => setTimeout(callback, delay),
    clearTimer: typeof config.clearTimer === 'function'
      ? config.clearTimer
      : (timerId: TimerHandle): void => {
        if (typeof timerId === 'number') clearTimeout(timerId);
      },
    dwellMs: finite(config.dwellMs, DEFAULT_DWELL_MS),
    probeTimeoutMs: finite(config.probeTimeoutMs, DEFAULT_PROBE_TIMEOUT_MS)
  };
}

function createProgressTracker(options: ProgressTrackerOptions): Readonly<ProgressTracker> {
  const tracking: ProgressTracking = {
    ports: readPorts(options),
    trails: new TabTrails(),
    candidates: new Map(),
    cardHints: new Map(),
    queue: new TaskQueue()
  };
  return Object.freeze({
    attach: () => attach(tracking),
    observe: (tab: chrome.tabs.Tab | null | undefined, observeOptions?: ObserveOptions) => observe(tracking, tab, observeOptions),
    advance: (tab: chrome.tabs.Tab & { id: number; url: string }) => tracking.queue.run(() => advance(tracking, tab)),
    probeSeries: (url: unknown) => probeSeries(tracking, url),
    getPendingCount: () => tracking.candidates.size
  });
}

export {
  DEFAULT_DWELL_MS,
  DEFAULT_PROBE_TIMEOUT_MS,
  createProgressTracker
};
