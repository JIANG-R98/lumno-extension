// Pinned-tab recovery (an opt-in Labs setting): keeps a snapshot of the
// user's pinned tabs and their tab groups in chrome.storage.local and reopens
// the missing ones after a browser or extension update, startup, or a new
// normal window.
//
// A module of the service worker; background.ts imports it before its own code
// runs. It uses other services' bindings only when its functions run, never
// while this file loads, because the services import one another.
// background.ts decides when to snapshot (tab and window events) and when to
// restore (install/startup/window events).
//
// Suspension: the setting is re-read on wake before an event is acted on, and
// a pending debounced snapshot is flushed on runtime.onSuspend.

import { pinnedTabRecoveryEnabled } from '../domain/settings/features';
import { areBackgroundSettingsLoaded, workerSettings } from './worker-context';
import { getResolvedTabUrl } from './browser-urls-service';
import { isTabGroupColor } from './tab-groups';
import type { TabGroupColor } from './tab-groups';
import { pinnedTabSnapshot } from '../domain/settings/features';

// The tab group a pinned tab was in: its key (window and group id when
// saved) tells tabs of one group apart, title and color recreate it.
interface PinnedGroupSnapshot {
  key?: string;
  title?: string;
  color?: string;
}

interface PinnedTabEntry {
  url: string;
  group?: PinnedGroupSnapshot;
}

interface SnapshotPersistOptions {
  // Keep the last snapshot when no normal window is open (the browser is
  // closing its last window), instead of saving an empty one.
  skipEmptyWhenNoNormalWindows?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

const PINNED_TAB_SNAPSHOT_DEBOUNCE_MS = 600;

// Restoring only opens a tab, so any web page qualifies, store pages included
// even though they take no scripts.
function isRestorablePinnedUrl(url: unknown): boolean {
  return /^https?:\/\//i.test(String(url || ''));
}

const PINNED_TAB_RESTORE_MAX_TABS = 24;


// Pinned-tab snapshot: debounced write, flushed on runtime.onSuspend.
let pinnedTabSnapshotTimer: ReturnType<typeof setTimeout> | null = null;

let pinnedTabSnapshotPersistOptions: SnapshotPersistOptions | null = null;



let pinnedTabRestorePromise: Promise<void> | null = null;



function ensurePinnedTabRecoverySettingLoaded(): Promise<boolean> {
  return workerSettings.ready.then(() => workerSettings.get(pinnedTabRecoveryEnabled));
}

function queryTabsForPinnedSnapshot(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.query !== 'function') {
      resolve([]);
      return;
    }
    chrome.tabs.query(queryInfo || {}, (tabs) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve(Array.isArray(tabs) ? tabs : []);
    });
  });
}

function getPinnedSnapshotFromStorage(): Promise<unknown> {
  return workerSettings.ready.then(() => workerSettings.getStored(pinnedTabSnapshot));
}

function setPinnedSnapshotToStorage(snapshot: unknown): Promise<boolean> {
  return workerSettings.set(pinnedTabSnapshot, snapshot).then(() => true, () => false);
}

function createPinnedTabForRestore(url: string, windowId: number | null): Promise<{ ok: boolean; tab: chrome.tabs.Tab | null }> {
  return new Promise((resolve) => {
    if (!chrome || !chrome.tabs || typeof chrome.tabs.create !== 'function') {
      resolve({ ok: false, tab: null });
      return;
    }
    const createWithWindow: chrome.tabs.CreateProperties = (typeof windowId === 'number')
      ? { windowId, url, pinned: true, active: false }
      : { url, pinned: true, active: false };
    chrome.tabs.create(createWithWindow, (tab) => {
      if (!(chrome.runtime && chrome.runtime.lastError)) {
        resolve({ ok: true, tab: tab || null });
        return;
      }
      if (typeof windowId !== 'number') {
        resolve({ ok: false, tab: null });
        return;
      }
      chrome.tabs.create({ url, pinned: true, active: false }, (fallbackTab) => {
        resolve({
          ok: !(chrome.runtime && chrome.runtime.lastError),
          tab: fallbackTab || null
        });
      });
    });
  });
}

function getLastFocusedWindowIdForRestore(): Promise<number | null> {
  return new Promise((resolve) => {
    if (!chrome || !chrome.windows || typeof chrome.windows.getLastFocused !== 'function') {
      resolve(null);
      return;
    }
    chrome.windows.getLastFocused({}, (windowInfo) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const canUse = windowInfo &&
        windowInfo.incognito !== true &&
        (!windowInfo.type || windowInfo.type === 'normal');
      resolve(canUse && typeof windowInfo.id === 'number' ? windowInfo.id : null);
    });
  });
}

function getNormalWindowCountForPinnedSnapshot(): Promise<number> {
  return new Promise((resolve) => {
    if (!chrome || !chrome.windows || typeof chrome.windows.getAll !== 'function') {
      resolve(0);
      return;
    }
    chrome.windows.getAll({ windowTypes: ['normal'] }, (windows) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        resolve(0);
        return;
      }
      const count = Array.isArray(windows)
        ? windows.filter((windowInfo) =>
          windowInfo &&
          windowInfo.incognito !== true &&
          (!windowInfo.type || windowInfo.type === 'normal')
        ).length
        : 0;
      resolve(count);
    });
  });
}

function getPinnedTabUngroupedId(): number {
  return chrome &&
    chrome.tabGroups &&
    typeof chrome.tabGroups.TAB_GROUP_ID_NONE === 'number'
    ? chrome.tabGroups.TAB_GROUP_ID_NONE
    : -1;
}

function isTabInGroup(tab: chrome.tabs.Tab | null | undefined): boolean {
  return Boolean(
    tab &&
    typeof tab.groupId === 'number' &&
    tab.groupId !== getPinnedTabUngroupedId()
  );
}

function normalizePinnedTabGroupSnapshot(rawValue: unknown): PinnedGroupSnapshot | null {
  if (!isRecord(rawValue)) {
    return null;
  }
  const key = String(rawValue.key || '').trim();
  const title = String(rawValue.title || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const color = String(rawValue.color || '').trim();
  if (!key && !title && !color) {
    return null;
  }
  const snapshot: PinnedGroupSnapshot = {};
  if (key) {
    snapshot.key = key;
  }
  if (title) {
    snapshot.title = title;
  }
  if (color) {
    snapshot.color = color;
  }
  return snapshot;
}

function normalizePinnedTabSnapshotEntry(rawValue: unknown): PinnedTabEntry | null {
  const raw: Record<string, unknown> | null = typeof rawValue === 'string'
    ? { url: rawValue }
    : (isRecord(rawValue) ? rawValue : null);
  if (!raw) {
    return null;
  }
  const url = String(raw.url || '').trim();
  if (!isRestorablePinnedUrl(url)) {
    return null;
  }
  const entry: PinnedTabEntry = { url };
  const group = normalizePinnedTabGroupSnapshot(raw.group);
  if (group) {
    entry.group = group;
  }
  return entry;
}

// Version 2 snapshots list entries; version 1 kept bare URLs.
function normalizePinnedTabSnapshot(rawValue: unknown): PinnedTabEntry[] {
  const entries: PinnedTabEntry[] = [];
  const appendEntry = (item: unknown): void => {
    const entry = normalizePinnedTabSnapshotEntry(item);
    if (entry) {
      entries.push(entry);
    }
  };
  if (Array.isArray(rawValue)) {
    rawValue.forEach(appendEntry);
    return entries.slice(0, PINNED_TAB_RESTORE_MAX_TABS);
  }
  if (!isRecord(rawValue)) {
    return [];
  }
  if (Array.isArray(rawValue.entries)) {
    rawValue.entries.forEach(appendEntry);
    return entries.slice(0, PINNED_TAB_RESTORE_MAX_TABS);
  }
  if (Array.isArray(rawValue.urls)) {
    rawValue.urls.forEach(appendEntry);
  }
  return entries.slice(0, PINNED_TAB_RESTORE_MAX_TABS);
}

function countUrls(urls: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  urls.forEach((url) => {
    const current = map.get(url) || 0;
    map.set(url, current + 1);
  });
  return map;
}

function getMissingPinnedTabEntries(savedEntries: readonly PinnedTabEntry[], existingPinnedUrls: readonly string[]): PinnedTabEntry[] {
  const existing = countUrls(existingPinnedUrls);
  const missingEntries: PinnedTabEntry[] = [];
  savedEntries.forEach((entry) => {
    const url = entry && entry.url ? String(entry.url) : '';
    if (!url) {
      return;
    }
    const remaining = existing.get(url) || 0;
    if (remaining > 0) {
      existing.set(url, remaining - 1);
      return;
    }
    missingEntries.push(entry);
  });
  return missingEntries;
}

function getTabGroupById(groupId: number): Promise<chrome.tabGroups.TabGroup | null> {
  return new Promise((resolve) => {
    if (!chrome ||
        !chrome.tabGroups ||
        typeof chrome.tabGroups.get !== 'function' ||
        typeof groupId !== 'number') {
      resolve(null);
      return;
    }
    try {
      chrome.tabGroups.get(groupId, (group) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(group || null);
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

async function getPinnedTabGroupSnapshot(tab: chrome.tabs.Tab): Promise<PinnedGroupSnapshot | null> {
  if (!isTabInGroup(tab)) {
    return null;
  }
  const group = await getTabGroupById(tab.groupId);
  const snapshot = normalizePinnedTabGroupSnapshot({
    key: `${typeof tab.windowId === 'number' ? tab.windowId : 'window'}:${tab.groupId}`,
    title: group && typeof group.title === 'string' ? group.title : '',
    color: group && typeof group.color === 'string' ? group.color : ''
  });
  return snapshot;
}

function getPinnedRestoreGroupKey(group: PinnedGroupSnapshot): string {
  const snapshot = normalizePinnedTabGroupSnapshot(group);
  if (!snapshot) {
    return '';
  }
  return snapshot.key || `${snapshot.title || ''}::${snapshot.color || ''}`;
}

function updateRestoredTabGroup(groupId: number, group: PinnedGroupSnapshot): Promise<boolean> {
  return new Promise((resolve) => {
    const snapshot = normalizePinnedTabGroupSnapshot(group);
    if (!snapshot ||
        typeof groupId !== 'number' ||
        !chrome ||
        !chrome.tabGroups ||
        typeof chrome.tabGroups.update !== 'function') {
      resolve(false);
      return;
    }
    const updates: { title?: string; color?: TabGroupColor } = {};
    if (snapshot.title) {
      updates.title = snapshot.title;
    }
    if (isTabGroupColor(snapshot.color)) {
      updates.color = snapshot.color;
    }
    if (Object.keys(updates).length === 0) {
      resolve(false);
      return;
    }
    try {
      chrome.tabGroups.update(groupId, updates, () => {
        resolve(!(chrome.runtime && chrome.runtime.lastError));
      });
    } catch (_error) {
      resolve(false);
    }
  });
}

function groupRestoredPinnedTab(
  tab: chrome.tabs.Tab | null,
  group: PinnedGroupSnapshot,
  existingGroupId: number | null | undefined
): Promise<number | null> {
  return new Promise((resolve) => {
    const snapshot = normalizePinnedTabGroupSnapshot(group);
    if (!snapshot ||
        !tab ||
        typeof tab.id !== 'number' ||
        !chrome ||
        !chrome.tabs ||
        typeof chrome.tabs.group !== 'function') {
      resolve(null);
      return;
    }
    const groupOptions: chrome.tabs.GroupOptions = { tabIds: tab.id };
    if (typeof existingGroupId === 'number') {
      groupOptions.groupId = existingGroupId;
    }
    try {
      chrome.tabs.group(groupOptions, (groupId) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        const resolvedGroupId = typeof groupId === 'number' ? groupId : existingGroupId;
        if (typeof resolvedGroupId !== 'number') {
          resolve(null);
          return;
        }
        updateRestoredTabGroup(resolvedGroupId, snapshot)
          .catch(() => false)
          .finally(() => resolve(resolvedGroupId));
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

async function persistPinnedTabSnapshotNow(options: SnapshotPersistOptions | null): Promise<void> {
  if (!workerSettings.get(pinnedTabRecoveryEnabled)) {
    return;
  }
  const opts = options && typeof options === 'object' ? options : {};
  const tabs = await queryTabsForPinnedSnapshot({ pinned: true });
  const snapshotTabs = tabs
    .filter((tab) => tab && tab.incognito !== true)
    .sort((a, b) => {
      const winA = typeof a.windowId === 'number' ? a.windowId : 0;
      const winB = typeof b.windowId === 'number' ? b.windowId : 0;
      if (winA !== winB) {
        return winA - winB;
      }
      const indexA = typeof a.index === 'number' ? a.index : 0;
      const indexB = typeof b.index === 'number' ? b.index : 0;
      return indexA - indexB;
    });
  const entries: PinnedTabEntry[] = [];
  for (let i = 0; i < snapshotTabs.length; i += 1) {
    if (entries.length >= PINNED_TAB_RESTORE_MAX_TABS) {
      break;
    }
    const tab = snapshotTabs[i];
    const url = getResolvedTabUrl(tab);
    if (!isRestorablePinnedUrl(url)) {
      continue;
    }
    const entry: PinnedTabEntry = { url };
    const group = await getPinnedTabGroupSnapshot(tab);
    if (group) {
      entry.group = group;
    }
    entries.push(entry);
  }
  if (!entries.length && opts.skipEmptyWhenNoNormalWindows === true) {
    const normalWindowCount = await getNormalWindowCountForPinnedSnapshot();
    if (normalWindowCount <= 0) {
      return;
    }
  }
  await setPinnedSnapshotToStorage({
    version: 2,
    urls: entries.map((entry) => entry.url),
    entries,
    capturedAt: Date.now()
  });
}

function mergePinnedTabSnapshotPersistOptions(options: SnapshotPersistOptions | null | undefined): void {
  if (!options || typeof options !== 'object') {
    return;
  }
  pinnedTabSnapshotPersistOptions = {
    skipEmptyWhenNoNormalWindows: Boolean(
      (pinnedTabSnapshotPersistOptions && pinnedTabSnapshotPersistOptions.skipEmptyWhenNoNormalWindows) ||
      options.skipEmptyWhenNoNormalWindows
    )
  };
}

export function schedulePersistPinnedTabSnapshot(options?: SnapshotPersistOptions | null): void {
  if (!areBackgroundSettingsLoaded()) {
    // A worker woken by a pin, move or close sees that event before the
    // recovery setting is read; dropping it would leave the snapshot stale.
    void workerSettings.ready.then(() => schedulePersistPinnedTabSnapshot(options));
    return;
  }
  if (!workerSettings.get(pinnedTabRecoveryEnabled)) {
    if (pinnedTabSnapshotTimer !== null) {
      clearTimeout(pinnedTabSnapshotTimer);
      pinnedTabSnapshotTimer = null;
    }
    pinnedTabSnapshotPersistOptions = null;
    return;
  }
  mergePinnedTabSnapshotPersistOptions(options);
  if (pinnedTabSnapshotTimer !== null) {
    clearTimeout(pinnedTabSnapshotTimer);
  }
  pinnedTabSnapshotTimer = setTimeout(flushPendingPinnedTabSnapshot, PINNED_TAB_SNAPSHOT_DEBOUNCE_MS);
}

// Turning recovery on takes a snapshot of the pinned tabs now.
workerSettings.subscribe(pinnedTabRecoveryEnabled, () => {
  if (workerSettings.get(pinnedTabRecoveryEnabled)) {
    schedulePersistPinnedTabSnapshot();
  }
});

export function flushPendingPinnedTabSnapshot(): Promise<void> {
  if (pinnedTabSnapshotTimer === null) {
    return Promise.resolve();
  }
  clearTimeout(pinnedTabSnapshotTimer);
  const persistOptions = pinnedTabSnapshotPersistOptions;
  pinnedTabSnapshotPersistOptions = null;
  pinnedTabSnapshotTimer = null;
  return persistPinnedTabSnapshotNow(persistOptions).catch((error) => {
    console.warn('[Lumno] Failed to save the pinned-tab snapshot.', error);
  });
}

async function restorePinnedTabsFromSnapshotNow(): Promise<void> {
  const enabled = await ensurePinnedTabRecoverySettingLoaded();
  if (!enabled) {
    return;
  }
  const savedRaw = await getPinnedSnapshotFromStorage();
  const savedEntries = normalizePinnedTabSnapshot(savedRaw);
  if (!savedEntries.length) {
    return;
  }
  const currentTabs = await queryTabsForPinnedSnapshot({});
  const existingPinnedUrls = currentTabs
    .filter((tab) => tab && tab.pinned && tab.incognito !== true)
    .map((tab) => getResolvedTabUrl(tab))
    .filter((url) => isRestorablePinnedUrl(url));
  const missingEntries = getMissingPinnedTabEntries(savedEntries, existingPinnedUrls);
  if (!missingEntries.length) {
    return;
  }
  const targetWindowId = await getLastFocusedWindowIdForRestore();
  const restoredGroupIds = new Map<string, number>();
  for (let i = 0; i < missingEntries.length && i < PINNED_TAB_RESTORE_MAX_TABS; i += 1) {
    const entry = missingEntries[i];
    const result = await createPinnedTabForRestore(entry.url, targetWindowId);
    if (!result || !result.ok || !entry.group) {
      continue;
    }
    const groupKey = getPinnedRestoreGroupKey(entry.group);
    const existingGroupId = groupKey ? restoredGroupIds.get(groupKey) : null;
    const groupId = await groupRestoredPinnedTab(result.tab, entry.group, existingGroupId);
    if (groupKey && typeof groupId === 'number') {
      restoredGroupIds.set(groupKey, groupId);
    }
  }
  setTimeout(() => {
    schedulePersistPinnedTabSnapshot();
  }, 800);
}

export function restorePinnedTabsFromSnapshotOnStartup(): Promise<void> {
  if (pinnedTabRestorePromise) {
    return pinnedTabRestorePromise;
  }
  pinnedTabRestorePromise = restorePinnedTabsFromSnapshotNow().finally(() => {
    pinnedTabRestorePromise = null;
  });
  return pinnedTabRestorePromise;
}
