// Tabs the open switcher showed without a usable thumbnail: their next
// capture goes ahead of the settle wait's usual reason.
import { isSwitcherThumbnailRefreshNeeded } from '../../domain/tab-switcher-model';
import type { TabSwitcherItem } from '../../domain/messages';
import { getResolvedTabUrl } from '../browser-urls-service';
import { logHotkeyDebug } from '../worker-context';
import { canCaptureSwitcherThumbnail } from './capture-rules';
import { recentTabTracker } from './state-store';
import type { SwitcherTab, ThumbnailPriority } from './types';

const tabSwitcherThumbnailPriorityByTabId = new Map<number, ThumbnailPriority>();

function findSwitcherTabById(tabList: readonly chrome.tabs.Tab[], tabId: number): chrome.tabs.Tab | null {
  if (typeof tabId !== 'number') {
    return null;
  }
  return (Array.isArray(tabList) ? tabList : []).find((tab) =>
    tab && typeof tab.id === 'number' && tab.id === tabId
  ) || null;
}

function markSwitcherThumbnailPriorityForItems(items: readonly TabSwitcherItem[], tabList: readonly chrome.tabs.Tab[], reason: string): void {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  items.forEach((item) => {
    if (!item || typeof item.id !== 'number') {
      return;
    }
    if (!isSwitcherThumbnailRefreshNeeded({
      status: item.thumbnailStatus,
      dataUrl: item.thumbnail
    })) {
      return;
    }
    const tab: SwitcherTab = findSwitcherTabById(tabList, item.id) || item;
    if (!canCaptureSwitcherThumbnail(tab)) {
      return;
    }
    tabSwitcherThumbnailPriorityByTabId.set(item.id, {
      url: getResolvedTabUrl(tab) || item.url || '',
      status: item.thumbnailStatus || 'missing',
      reason: reason || '',
      markedAt: Date.now()
    });
  });
}

function clearSwitcherThumbnailPriority(tabId: unknown): void {
  if (typeof tabId !== 'number') {
    return;
  }
  tabSwitcherThumbnailPriorityByTabId.delete(tabId);
}

function consumeSwitcherThumbnailPriority(tab: SwitcherTab, reason: string): boolean {
  const tabId = tab && typeof tab.id === 'number' ? tab.id : null;
  if (typeof tabId !== 'number') {
    return false;
  }
  const entry = tabSwitcherThumbnailPriorityByTabId.get(tabId);
  if (!entry) {
    return false;
  }
  const url = getResolvedTabUrl(tab);
  if (entry.url && url && entry.url !== url) {
    clearSwitcherThumbnailPriority(tabId);
    return false;
  }
  const state = recentTabTracker.getThumbnailState(tabId, url);
  if (!isSwitcherThumbnailRefreshNeeded(state)) {
    clearSwitcherThumbnailPriority(tabId);
    return false;
  }
  clearSwitcherThumbnailPriority(tabId);
  logHotkeyDebug('tab-switcher-thumbnail-priority-consumed', {
    tabId,
    url,
    reason: reason || '',
    markedReason: entry.reason || '',
    status: entry.status || ''
  });
  return true;
}

function clearAllSwitcherThumbnailPriorities(): void {
  tabSwitcherThumbnailPriorityByTabId.clear();
}

export {
  clearAllSwitcherThumbnailPriorities,
  clearSwitcherThumbnailPriority,
  consumeSwitcherThumbnailPriority,
  markSwitcherThumbnailPriorityForItems
};
