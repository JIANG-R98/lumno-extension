type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

interface BookmarkItemBase {
  id: string;
  parentId: string;
  index: number;
  title: string;
  url: string;
  host: string;
  // The URL whose site colors the card; a folder's first bookmark.
  themeUrl: string;
}

interface BookmarkLinkItem extends BookmarkItemBase {
  type: 'bookmark';
}

interface BookmarkFolderItem extends BookmarkItemBase {
  type: 'folder';
  childCount: number;
  // Up to four URLs inside the folder, for its icon.
  previewUrls: string[];
}

// A card of the bookmark grid.
type BookmarkItem = BookmarkLinkItem | BookmarkFolderItem;

// One step of the breadcrumb, from the bookmarks bar down.
interface BookmarkPathEntry {
  id: string;
  title: string;
}

interface BookmarkItemOptions {
  normalizeHost?: (hostname: string) => string;
}

interface BookmarkFolderCacheOptions extends BookmarkItemOptions {
  // Build only the bookmarks bar's items; other folders as they open.
  lazy?: boolean;
}

interface BookmarkFolderCache {
  rootNode: BookmarkNode | null;
  rootFolderId: string;
  nodeMap: Map<string, BookmarkNode>;
  folderItemsCache: Map<string, BookmarkItem[]>;
}

interface BookmarkFolderPathOptions {
  nodeMap?: ReadonlyMap<string, BookmarkNode>;
  rootId?: string;
  rootTitle?: string;
}

const BOOKMARKS_BAR_TITLES = new Set([
  'bookmarks bar',
  '书签栏',
  '書籤列',
  '書籤欄'
]);
// Chrome's local bookmarks bar is id 1 (an account bar shares its folderType,
// so match by id only); Firefox's toolbar has a fixed GUID.
const BOOKMARKS_BAR_IDS = new Set(['1', 'toolbar_____']);

function defaultNormalizeHost(hostname: string): string {
  return String(hostname || '').trim().toLowerCase().replace(/^www\./i, '');
}

function getNormalizeHost(options: BookmarkItemOptions | undefined): (hostname: string) => string {
  return options && typeof options.normalizeHost === 'function'
    ? options.normalizeHost
    : defaultNormalizeHost;
}

function findBookmarksBarNode(treeNodes: readonly BookmarkNode[] | null | undefined): BookmarkNode | null {
  if (!Array.isArray(treeNodes)) {
    return null;
  }
  for (let i = 0; i < treeNodes.length; i += 1) {
    const root = treeNodes[i];
    const rootChildren: readonly BookmarkNode[] = root && Array.isArray(root.children) ? root.children : [];
    const directMatch = rootChildren.find((child) => child && BOOKMARKS_BAR_IDS.has(String(child.id || '')));
    if (directMatch) {
      return directMatch;
    }
    for (let j = 0; j < rootChildren.length; j += 1) {
      const child = rootChildren[j];
      const title = String(child && child.title || '').toLowerCase();
      if (BOOKMARKS_BAR_TITLES.has(title)) {
        return child;
      }
    }
  }
  return null;
}

function findFirstUrlInFolder(node: BookmarkNode | null | undefined): string {
  if (!node) {
    return '';
  }
  const directUrl = node && node.url ? String(node.url) : '';
  if (directUrl) {
    return directUrl;
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (let i = 0; i < children.length; i += 1) {
    const nested = findFirstUrlInFolder(children[i]);
    if (nested) {
      return nested;
    }
  }
  return '';
}

function collectFolderUrls(
  node: BookmarkNode | null | undefined,
  limit: number,
  collected: string[],
  seen: Set<string>
): void {
  if (!node || collected.length >= limit) {
    return;
  }
  const nodeUrl = node && node.url ? String(node.url) : '';
  if (nodeUrl && !seen.has(nodeUrl)) {
    seen.add(nodeUrl);
    collected.push(nodeUrl);
    if (collected.length >= limit) {
      return;
    }
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (let i = 0; i < children.length; i += 1) {
    collectFolderUrls(children[i], limit, collected, seen);
    if (collected.length >= limit) {
      break;
    }
  }
}

function collectFolderBookmarkUrls(node: BookmarkNode | null | undefined, collected?: string[]): string[] {
  const urls = Array.isArray(collected) ? collected : [];
  if (!node) {
    return urls;
  }
  const nodeUrl = node && node.url ? String(node.url).trim() : '';
  if (nodeUrl && !/^javascript:/i.test(nodeUrl)) {
    urls.push(nodeUrl);
  }
  const children = Array.isArray(node.children) ? node.children : [];
  for (let i = 0; i < children.length; i += 1) {
    collectFolderBookmarkUrls(children[i], urls);
  }
  return urls;
}

// Indexes the tree by id, filling in each node's parentId and index.
function buildBookmarkNodeMap(nodes: readonly BookmarkNode[] | null | undefined): Map<string, BookmarkNode> {
  const nodeMap = new Map<string, BookmarkNode>();
  const walk = (node: BookmarkNode | null | undefined, parentId: string, index: number): void => {
    if (!node) {
      return;
    }
    const nodeId = String(node.id || '');
    if (nodeId) {
      node.parentId = node.parentId || parentId || '';
      if (typeof node.index !== 'number') {
        node.index = Number.isFinite(index) ? index : 0;
      }
      nodeMap.set(nodeId, node);
    }
    const children = Array.isArray(node.children) ? node.children : [];
    for (let i = 0; i < children.length; i += 1) {
      walk(children[i], nodeId, i);
    }
  };
  const rootNodes = Array.isArray(nodes) ? nodes : [];
  for (let i = 0; i < rootNodes.length; i += 1) {
    walk(rootNodes[i], '', i);
  }
  return nodeMap;
}

function buildBookmarkItemsFromChildren(
  children: readonly BookmarkNode[] | null | undefined,
  options?: BookmarkItemOptions
): BookmarkItem[] {
  const normalizeHost = getNormalizeHost(options);
  const items = Array.isArray(children) ? children : [];
  const results: BookmarkItem[] = [];
  // Bookmark cards are identity-based: separate browser nodes may intentionally
  // share a URL and must remain visible after cross-folder moves.
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    const title = String(item.title || '').trim();
    const url = item.url ? String(item.url) : '';
    const itemChildren = Array.isArray(item.children) ? item.children : [];
    if (url) {
      let host = '';
      try {
        host = normalizeHost(new URL(url).hostname);
      } catch (error) {
        host = '';
      }
      results.push({
        id: String(item.id || ''),
        type: 'bookmark',
        parentId: String(item.parentId || ''),
        index: typeof item.index === 'number' ? item.index : index,
        title,
        url,
        host,
        themeUrl: url
      });
      continue;
    }
    const themeUrl = findFirstUrlInFolder(item);
    const previewUrls: string[] = [];
    collectFolderUrls(item, 4, previewUrls, new Set());
    let host = '';
    if (themeUrl) {
      try {
        host = normalizeHost(new URL(themeUrl).hostname);
      } catch (error) {
        host = '';
      }
    }
    results.push({
      id: String(item.id || ''),
      type: 'folder',
      parentId: String(item.parentId || ''),
      index: typeof item.index === 'number' ? item.index : index,
      title,
      url: '',
      host,
      childCount: itemChildren.length,
      themeUrl,
      previewUrls
    });
  }
  return results;
}

function cacheBookmarkFolderItems(
  node: BookmarkNode | null | undefined,
  folderItemsCache: Map<string, BookmarkItem[]>,
  options: BookmarkItemOptions | undefined
): void {
  if (!node) {
    return;
  }
  const nodeId = String(node.id || '');
  const children = Array.isArray(node.children) ? node.children : [];
  if (nodeId) {
    folderItemsCache.set(nodeId, buildBookmarkItemsFromChildren(children, options));
  }
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!child) {
      continue;
    }
    const childChildren = Array.isArray(child.children) ? child.children : [];
    if (childChildren.length > 0) {
      cacheBookmarkFolderItems(child, folderItemsCache, options);
    }
  }
}

function buildBookmarkFolderCache(
  nodes: readonly BookmarkNode[] | null | undefined,
  options?: BookmarkFolderCacheOptions
): BookmarkFolderCache {
  const nodeMap = buildBookmarkNodeMap(nodes);
  const rootNode = findBookmarksBarNode(nodes);
  const folderItemsCache = new Map<string, BookmarkItem[]>();
  if (rootNode) {
    if (options && options.lazy === true) {
      folderItemsCache.set(
        String(rootNode.id || '1'),
        buildBookmarkItemsFromChildren(rootNode.children, options)
      );
    } else {
      cacheBookmarkFolderItems(rootNode, folderItemsCache, options);
    }
  }
  return {
    rootNode,
    rootFolderId: rootNode ? String(rootNode.id || '1') : '1',
    nodeMap,
    folderItemsCache
  };
}

function buildBookmarkFolderPath(folderId: unknown, options?: BookmarkFolderPathOptions): BookmarkPathEntry[] {
  const opts = options || {};
  const nodeMap = opts.nodeMap || new Map<string, BookmarkNode>();
  const rootId = String(opts.rootId || '1');
  const rootTitle = String(opts.rootTitle || 'Bookmarks');
  const targetId = String(folderId || rootId);
  const path: BookmarkPathEntry[] = [{ id: rootId, title: rootTitle }];
  if (targetId === rootId) {
    return path;
  }
  const chain: BookmarkPathEntry[] = [];
  let cursor = nodeMap.get(targetId);
  let guard = 0;
  while (cursor && guard < 64) {
    const cursorId = String(cursor.id || '');
    if (!cursorId || cursorId === rootId) {
      break;
    }
    chain.push({
      id: cursorId,
      title: String(cursor.title || '').trim() || rootTitle
    });
    const parentId = String(cursor.parentId || '');
    cursor = parentId ? nodeMap.get(parentId) : undefined;
    guard += 1;
  }
  chain.reverse().forEach((item) => path.push(item));
  return path;
}

function getBookmarkPageItems<T>(items: readonly T[] | null | undefined, page: number, limit: number): T[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  const pageLimit = Math.max(0, Number(limit) || 0);
  if (pageLimit <= 0) {
    return [];
  }
  const pageCount = Math.max(1, Math.ceil(items.length / pageLimit));
  const safePage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);
  const start = safePage * pageLimit;
  return items.slice(start, start + pageLimit);
}

export {
  BOOKMARKS_BAR_TITLES,
  findBookmarksBarNode,
  findFirstUrlInFolder,
  collectFolderUrls,
  collectFolderBookmarkUrls,
  buildBookmarkNodeMap,
  buildBookmarkItemsFromChildren,
  buildBookmarkFolderCache,
  buildBookmarkFolderPath,
  getBookmarkPageItems
};
export type {
  BookmarkFolderCache,
  BookmarkFolderItem,
  BookmarkItem,
  BookmarkLinkItem,
  BookmarkNode,
  BookmarkPathEntry
};
