// Opening a bookmark folder's links in a new tab group.
import type { BookmarkTabGroupReply } from '../domain/messages';

// A bookmark tree node's fields the helpers read.
interface BookmarkNodeLike {
  url?: string;
  title?: string;
  children?: BookmarkNodeLike[];
}

// The callback-style extension API the helpers use.
interface BookmarkTabGroupChromeApi {
  bookmarks?: { getSubTree?(id: string, callback: (nodes: BookmarkNodeLike[]) => void): void };
  tabs?: {
    create?(createProperties: chrome.tabs.CreateProperties, callback: (tab: chrome.tabs.Tab) => void): void;
    group?(options: { tabIds: [number, ...number[]] }, callback: (groupId: number) => void): void;
  };
  tabGroups?: { update?(groupId: number, updateProperties: { title: string }, callback: () => void): void };
  runtime?: { lastError?: { message?: string } | null };
}

// The callable API once checked.
interface ReadyChromeApi extends BookmarkTabGroupChromeApi {
  bookmarks: { getSubTree(id: string, callback: (nodes: BookmarkNodeLike[]) => void): void };
  tabs: {
    create(createProperties: chrome.tabs.CreateProperties, callback: (tab: chrome.tabs.Tab) => void): void;
    group(options: { tabIds: [number, ...number[]] }, callback: (groupId: number) => void): void;
  };
  tabGroups: { update(groupId: number, updateProperties: { title: string }, callback: () => void): void };
}

interface BookmarkTabGroupOptions {
  folderId?: unknown;
  title?: unknown;
  windowId?: number;
  // Where the first tab goes; the rest follow it.
  insertIndex?: number;
}

interface BookmarkTabGroupResult extends BookmarkTabGroupReply {
  requestedCount: number;
  openedCount: number;
  failedCount: number;
  groupId: number | null;
  reason: string;
}

// Every link under a node, depth first, without javascript: bookmarklets.
function collectBookmarkUrls(node: BookmarkNodeLike | null | undefined, collected?: string[]): string[] {
  const urls = Array.isArray(collected) ? collected : [];
  if (!node) {
    return urls;
  }
  const url = node.url ? String(node.url).trim() : '';
  if (url && !/^javascript:/i.test(url)) {
    urls.push(url);
  }
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child) => collectBookmarkUrls(child, urls));
  return urls;
}

function getLastErrorMessage(chromeApi: BookmarkTabGroupChromeApi, fallback: string): string {
  const runtime = chromeApi && chromeApi.runtime;
  return runtime && runtime.lastError
    ? String(runtime.lastError.message || fallback)
    : '';
}

function isReady(chromeApi: BookmarkTabGroupChromeApi): chromeApi is ReadyChromeApi {
  return Boolean(chromeApi.bookmarks && typeof chromeApi.bookmarks.getSubTree === 'function' &&
    chromeApi.tabs && typeof chromeApi.tabs.create === 'function' && typeof chromeApi.tabs.group === 'function' &&
    chromeApi.tabGroups && typeof chromeApi.tabGroups.update === 'function');
}

function getBookmarkSubTree(chromeApi: ReadyChromeApi, folderId: string): Promise<BookmarkNodeLike | null> {
  return new Promise((resolve, reject) => {
    try {
      chromeApi.bookmarks.getSubTree(folderId, (nodes) => {
        const error = getLastErrorMessage(
          chromeApi,
          'bookmark-folder-unavailable'
        );
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(Array.isArray(nodes) && nodes.length > 0 ? nodes[0] : null);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createBackgroundTab(chromeApi: ReadyChromeApi, createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => {
    try {
      chromeApi.tabs.create(createProperties, (tab) => {
        const error = getLastErrorMessage(chromeApi, 'tab-create-failed');
        if (error || !tab || typeof tab.id !== 'number') {
          resolve(null);
          return;
        }
        resolve(tab);
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

function createTabGroup(chromeApi: ReadyChromeApi, tabIds: [number, ...number[]]): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      chromeApi.tabs.group({ tabIds }, (groupId) => {
        const error = getLastErrorMessage(chromeApi, 'tab-group-failed');
        if (error || typeof groupId !== 'number') {
          reject(new Error(error || 'tab-group-failed'));
          return;
        }
        resolve(groupId);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function updateTabGroupTitle(chromeApi: ReadyChromeApi, groupId: number, title: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      chromeApi.tabGroups.update(groupId, { title }, () => {
        const error = getLastErrorMessage(
          chromeApi,
          'tab-group-title-failed'
        );
        if (error) {
          reject(new Error(error));
          return;
        }
        resolve(true);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function createResult(overrides: Partial<BookmarkTabGroupResult>): BookmarkTabGroupResult {
  return Object.assign({
    ok: false,
    requestedCount: 0,
    openedCount: 0,
    failedCount: 0,
    groupId: null,
    reason: ''
  }, overrides || {});
}

async function openBookmarkFolderInNewTabGroup(
  chromeApi: BookmarkTabGroupChromeApi | null | undefined,
  rawOptions: BookmarkTabGroupOptions | null | undefined
): Promise<BookmarkTabGroupResult> {
  const options = rawOptions && typeof rawOptions === 'object'
    ? rawOptions
    : {};
  const folderId = String(options.folderId || '').trim();
  if (!folderId) {
    return createResult({ reason: 'invalid-folder-id' });
  }
  if (!chromeApi || !chromeApi.bookmarks ||
      typeof chromeApi.bookmarks.getSubTree !== 'function') {
    return createResult({ reason: 'bookmarks-api-unavailable' });
  }
  if (!isReady(chromeApi)) {
    return createResult({ reason: 'tab-group-api-unavailable' });
  }

  let folderNode: BookmarkNodeLike | null = null;
  try {
    folderNode = await getBookmarkSubTree(chromeApi, folderId);
  } catch (error) {
    return createResult({
      reason: error instanceof Error && error.message
        ? error.message
        : 'bookmark-folder-unavailable'
    });
  }
  if (!folderNode) {
    return createResult({ reason: 'bookmark-folder-unavailable' });
  }

  const urls = collectBookmarkUrls(folderNode);
  const requestedCount = urls.length;
  if (!requestedCount) {
    return createResult({ reason: 'empty-folder' });
  }

  const windowId = Number(options.windowId);
  const insertIndex = Number(options.insertIndex);
  const openedTabs: Array<chrome.tabs.Tab & { id: number }> = [];
  for (let index = 0; index < urls.length; index += 1) {
    const createProperties: chrome.tabs.CreateProperties = {
      url: urls[index],
      active: false
    };
    if (Number.isFinite(windowId)) {
      createProperties.windowId = windowId;
    }
    if (Number.isFinite(insertIndex)) {
      createProperties.index = Math.max(0, insertIndex + index);
    }
    const tab = await createBackgroundTab(chromeApi, createProperties);
    const tabId = tab && tab.id;
    if (tab && typeof tabId === 'number') {
      openedTabs.push({ ...tab, id: tabId });
    }
  }

  const openedCount = openedTabs.length;
  const failedCount = requestedCount - openedCount;
  const [firstOpenedTab, ...otherOpenedTabs] = openedTabs;
  if (!firstOpenedTab) {
    return createResult({
      requestedCount,
      failedCount,
      reason: 'tab-create-failed'
    });
  }

  let groupId: number | null = null;
  try {
    groupId = await createTabGroup(
      chromeApi,
      [firstOpenedTab.id, ...otherOpenedTabs.map((tab) => tab.id)]
    );
    const folderTitle = String(options.title || folderNode.title || '').trim();
    await updateTabGroupTitle(chromeApi, groupId, folderTitle);
  } catch (error) {
    return createResult({
      requestedCount,
      openedCount,
      failedCount,
      groupId,
      reason: error instanceof Error && error.message ? error.message : 'tab-group-failed'
    });
  }

  return createResult({
    ok: failedCount === 0,
    requestedCount,
    openedCount,
    failedCount,
    groupId,
    reason: failedCount > 0 ? 'partial-tab-create-failure' : ''
  });
}

export { collectBookmarkUrls, openBookmarkFolderInNewTabGroup };
export type { BookmarkNodeLike, BookmarkTabGroupChromeApi, BookmarkTabGroupOptions, BookmarkTabGroupResult };
