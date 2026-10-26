// Which tabs the person is looking at, and how long they stay on a page.
import { advance } from './advance';
import { getTab } from './tab-reads';
import { isHttpUrl } from './trails';
import type { AdvanceResult, DwellCandidate, ObserveOptions } from './types';
import type { ProgressTracking } from './tracking';

function isTrackableTab(tab: chrome.tabs.Tab | null | undefined): tab is chrome.tabs.Tab & { id: number; url: string } {
  return Boolean(tab && Number.isInteger(tab.id) && !tab.incognito && isHttpUrl(tab.url));
}

function isEngaged(tab: chrome.tabs.Tab | null | undefined): boolean {
  return Boolean(tab && (tab.active || tab.audible));
}

function forget(tracking: ProgressTracking, tabId: number): void {
  const candidate = tracking.candidates.get(tabId);
  if (candidate && candidate.timer !== null) tracking.ports.clearTimer(candidate.timer);
  tracking.candidates.delete(tabId);
}

function startDwell(tracking: ProgressTracking, tabId: number, url: string): void {
  forget(tracking, tabId);
  const candidate: DwellCandidate = { url, timer: null, waiting: false, settled: false };
  candidate.timer = tracking.ports.setTimer(() => {
    candidate.timer = null;
    void settle(tracking, tabId, candidate);
  }, tracking.ports.dwellMs);
  tracking.candidates.set(tabId, candidate);
}

function observe(tracking: ProgressTracking, tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions): void {
  if (!tracking.ports.isEnabled() || !isTrackableTab(tab)) {
    if (tab && typeof tab.id === 'number' && Number.isInteger(tab.id)) forget(tracking, tab.id);
    return;
  }
  const candidate = tracking.candidates.get(tab.id);
  if (candidate && candidate.url === tab.url) {
    // The dwell ran out while the tab was in the background; it starts
    // over once the person comes back to it. A page whose content changes
    // without a new URL (a player moving to the next episode) is read again.
    if ((candidate.waiting && isEngaged(tab)) || (candidate.settled && options && options.contentChanged)) {
      startDwell(tracking, tab.id, tab.url);
    }
    return;
  }
  startDwell(tracking, tab.id, tab.url);
}

function settle(tracking: ProgressTracking, tabId: number, candidate: DwellCandidate): Promise<AdvanceResult | null> {
  return getTab(tracking, tabId).then((tab) => {
    if (tracking.candidates.get(tabId) !== candidate) return null;
    if (!tab || tab.url !== candidate.url || !isTrackableTab(tab)) {
      forget(tracking, tabId);
      return null;
    }
    if (!isEngaged(tab)) {
      candidate.waiting = true;
      return null;
    }
    candidate.settled = true;
    return tracking.queue.run(() => advance(tracking, tab));
  });
}

export {
  forget,
  isEngaged,
  isTrackableTab,
  observe,
  settle,
  startDwell
};
