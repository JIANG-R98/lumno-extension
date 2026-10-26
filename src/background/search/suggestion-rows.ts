// How a local result is shown: why it matched, its icon, and for a bookmark
// the folders it sits in.
import * as SEARCH_UTILS from '../../domain/search/search-utils';
import type { SearchQueryContext, SearchRankingOptions } from '../../domain/search/types';
import { getOwnExtensionFaviconUrl, isOwnExtensionUrl } from '../browser-urls-service';
import { normalizeHost } from '../worker-context';
import type { BookmarkNodeInfo, SourceItem } from './types';
import { getFaviconFallbackHost, getHostFaviconUrl, getPageFaviconCandidateUrl, isBrowserInternalPageUrl, shouldBlockFaviconForHost } from '../favicon/candidates';

// The roots every bookmark tree has, which a path leaves out.
const ROOT_FOLDER_TITLES: ReadonlySet<string> = new Set([
  'Bookmarks bar',
  'Other bookmarks',
  'Mobile bookmarks',
  '书签栏',
  '其他书签',
  '移动设备书签'
]);

const SOURCE_REASONS: Readonly<Record<string, string>> = Object.freeze({
  bookmark: '来源：书签',
  topSite: '来源：常用站点',
  openTab: '来源：打开的标签页',
  history: '来源：浏览历史'
});

function describeRecentVisit(lastVisitTime: number | undefined): string {
  if (!lastVisitTime) {
    return '';
  }
  const hoursSinceVisit = (Date.now() - lastVisitTime) / (1000 * 60 * 60);
  if (hoursSinceVisit < 24) {
    return '最近 24 小时访问';
  }
  return hoursSinceVisit < 72 ? '最近 3 天访问' : '';
}

// Up to three reasons, for the result's tooltip: its source, a pinyin or
// initials title match, a recent visit and how often it was visited.
function buildSuggestionReasons(
  item: SourceItem | null | undefined,
  sourceType: string,
  context: SearchQueryContext,
  scoreOptions: SearchRankingOptions
): string[] {
  const reasons: string[] = [];
  if (SOURCE_REASONS[sourceType]) {
    reasons.push(SOURCE_REASONS[sourceType]);
  }
  const unitMatch = context.unitQuery
    ? SEARCH_UTILS.getSearchTitleUnitMatch(item && item.title, context.unitQuery, scoreOptions, { skipLiteral: true })
    : null;
  if (unitMatch && unitMatch.abbreviation) {
    reasons.push('标题首字母匹配');
  } else if (unitMatch && unitMatch.usesPinyin) {
    reasons.push('标题拼音匹配');
  }
  const recentVisit = describeRecentVisit(item ? item.lastVisitTime : undefined);
  if (recentVisit) {
    reasons.push(recentVisit);
  }
  const visitCount = Number(item && item.visitCount) || 0;
  if (visitCount > 1) {
    reasons.push(`访问 ${visitCount} 次`);
  }
  return reasons.slice(0, 3);
}

function buildSearchSuggestionFavicon(url: string): string {
  if (isOwnExtensionUrl(url)) {
    return getOwnExtensionFaviconUrl();
  }
  if (isBrowserInternalPageUrl(url)) {
    return getPageFaviconCandidateUrl(url);
  }
  try {
    const urlObj = new URL(url);
    const host = normalizeHost(urlObj.hostname);
    return shouldBlockFaviconForHost(host) ? '' : getPageFaviconCandidateUrl(urlObj.href);
  } catch (_error) {
    const fallbackHost = getFaviconFallbackHost(url);
    return shouldBlockFaviconForHost(fallbackHost) ? '' : getHostFaviconUrl(fallbackHost);
  }
}

// The bookmark's folders, outermost first, without the tree's roots.
function buildBookmarkPath(bookmark: SourceItem, nodeMap: ReadonlyMap<string, BookmarkNodeInfo>): string {
  const pathParts: string[] = [];
  let parentId: string | null = bookmark && bookmark.parentId
    ? bookmark.parentId
    : (bookmark && bookmark.id !== undefined ? String(bookmark.id) : null);
  while (parentId) {
    const node = nodeMap.get(parentId);
    if (!node) {
      break;
    }
    const isRootFolder = !node.parentId && ROOT_FOLDER_TITLES.has(node.title);
    if (!node.hasUrl && node.title && !isRootFolder) {
      pathParts.unshift(node.title);
    }
    parentId = node.parentId;
  }
  return pathParts.join('/');
}

export { buildBookmarkPath, buildSearchSuggestionFavicon, buildSuggestionReasons };
