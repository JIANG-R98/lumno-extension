// Functions the tracker runs in a page to read what it says about itself.
import type { MediaReading, PageHints } from './types';

const MAX_PAGE_LINKS = 6;

// Runs in the page (isolated world) and returns plain data only. Must not
// reference anything outside itself: it is serialized by scripting.
function readProgressPageHints(): PageHints {
  const NEXT_TEXT = /^(?:下一[集话話章节節页頁篇回]|下[集章]|next(?:\s+(?:episode|chapter|page|part))?|次の(?:話|章|エピソード|ページ)|次へ|다음(?:\s*(?:화|장|편))?)\s*[>›»→]*$/i;
  const PREV_TEXT = /^[<‹«←]*\s*(?:上一[集话話章节節页頁篇回]|上[集章]|prev(?:ious)?(?:\s+(?:episode|chapter|page|part))?|前の(?:話|章|エピソード|ページ)|前へ|이전(?:\s*(?:화|장|편))?)$/i;
  const EPISODE_NAV_TEXT = /下一[集话話章节節回]|上一[集话話章节節回]|(?:next|previous|prev)\s+(?:episode|chapter)|(?:次|前)の(?:話|章|エピソード)|(?:다음|이전)\s*(?:화|장)/i;
  const EPISODE_TYPES = /^(?:TVEpisode|Episode|PodcastEpisode|RadioEpisode|Chapter)$/;
  const limit = 6;
  const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
  const absolute = (href: string | null): string => {
    if (href === null) return '';
    try {
      const url = new URL(href, location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (_error) {
      return '';
    }
  };
  const pushUnique = (list: string[], href: string | null): void => {
    const url = absolute(href);
    if (url && url !== location.href && !list.includes(url) && list.length < limit) list.push(url);
  };
  const nextUrls: string[] = [];
  const prevUrls: string[] = [];
  document.querySelectorAll('link[rel~="next"][href], a[rel~="next"][href]').forEach((node) => {
    pushUnique(nextUrls, node.getAttribute('href'));
  });
  document.querySelectorAll('link[rel~="prev"][href], a[rel~="prev"][href], link[rel~="previous"][href]').forEach((node) => {
    pushUnique(prevUrls, node.getAttribute('href'));
  });
  // Links labelled as the next or previous part; true when one names an
  // episode or chapter.
  const scanAnchors = (): boolean => {
    let found = false;
    const anchors = document.querySelectorAll('a[href]');
    for (let index = 0; index < anchors.length && index < 600; index += 1) {
      const anchor = anchors[index];
      const text = String(anchor.textContent || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || text.length > 24) continue;
      if (NEXT_TEXT.test(text)) pushUnique(nextUrls, anchor.getAttribute('href'));
      else if (PREV_TEXT.test(text)) pushUnique(prevUrls, anchor.getAttribute('href'));
      if (EPISODE_NAV_TEXT.test(text)) found = true;
    }
    return found;
  };
  let episodeNavigation = scanAnchors();
  let seriesName = '';
  let episode = 0;
  const seriesNameOf = (value: Record<string, unknown>): unknown => {
    const season = value.partOfSeason;
    const series = value.partOfSeries || (isObject(season) && season.partOfSeries) || value.isPartOf;
    return isObject(series) ? series.name : '';
  };
  const visit = (value: unknown, depth: number): void => {
    if (!isObject(value) || depth > 4 || seriesName) return;
    if (Array.isArray(value)) {
      value.forEach((entry: unknown) => visit(entry, depth + 1));
      return;
    }
    const typeValue = value['@type'] || [];
    const types: unknown[] = Array.isArray(typeValue) ? typeValue : [typeValue];
    if (types.some((type) => EPISODE_TYPES.test(String(type)))) {
      const name = seriesNameOf(value);
      if (name) seriesName = String(name);
      episode = Number(value.episodeNumber || value.position) || 0;
    }
    if (value['@graph']) visit(value['@graph'], depth + 1);
  };
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    try {
      visit(JSON.parse(node.textContent || ''), 0);
    } catch (_error) {
      // Malformed metadata is ignored.
    }
  });
  const ogType = document.querySelector('meta[property="og:type"]');
  if (ogType && /^video\.episode$/i.test(String(ogType.getAttribute('content') || ''))) {
    episodeNavigation = true;
  }
  const readMedia = (): MediaReading | null => {
    try {
      const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
      return metadata && metadata.title
        ? { title: String(metadata.title), series: String(metadata.album || metadata.artist || '') }
        : null;
    } catch (_error) {
      return null;
    }
  };
  return { nextUrls, prevUrls, episodeNavigation, seriesName, episode, media: readMedia() };
}

// The media session set by the page's own player, which the isolated world
// may not see. Runs in the page's main world and only reads.
function readMediaSession(): MediaReading | null {
  try {
    const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
    return metadata && metadata.title
      ? { title: String(metadata.title), series: String(metadata.album || metadata.artist || '') }
      : null;
  } catch (_error) {
    return null;
  }
}

export {
  MAX_PAGE_LINKS,
  readMediaSession,
  readProgressPageHints
};
