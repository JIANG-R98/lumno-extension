// Reading and saving the pinned cards the tracker moves forward.
import { isRecord } from '../../platform/storage-call';
import * as RecentSiteSettings from '../../domain/settings/recent-sites';
import { readPageHints } from './tab-reads';
import type { AdvanceResult, MediaReading, ProgressContext, TrackedCard } from './types';

function isTrackedCard(item: unknown): item is TrackedCard {
  return isRecord(item) && item.progressTracking === true && typeof item.url === 'string';
}

function readCardTitle(card: TrackedCard): string | undefined {
  return typeof card.title === 'string' ? card.title : undefined;
}

function getPageTitle(tab: chrome.tabs.Tab): string {
  const title = String(tab && tab.title || '').replace(/\s+/g, ' ').trim();
  return title && title !== tab.url ? title : '';
}

function sameUrl(ctx: ProgressContext, a: unknown, b: unknown): boolean {
  const left = ctx.progressMatch.getComparableUrl(a);
  return Boolean(left) && left === ctx.progressMatch.getComparableUrl(b);
}

async function saveCard(
  ctx: ProgressContext,
  items: readonly unknown[],
  index: number,
  previous: TrackedCard,
  nextCard: TrackedCard,
  timestamp: number,
  options?: { record?: boolean }
): Promise<void> {
  if (options && options.record) {
    await ctx.settingsStore.ready;
    const nextHistory = ctx.progressHistory.recordVersion(
      ctx.settingsStore.getStored(RecentSiteSettings.progressHistory),
      ctx.progressHistory.getHistoryId(previous, ctx.progressMatch),
      { url: previous.url, title: previous.title, updatedAt: timestamp }
    );
    await ctx.settingsStore.set(RecentSiteSettings.progressHistory, nextHistory);
  }
  // The site name can come from the old title, so New Tab derives it again.
  const { siteName: _staleSiteName, ...card } = nextCard;
  const nextItems = items.slice();
  nextItems[index] = card;
  await ctx.settingsStore.set(RecentSiteSettings.pinnedRecentSites, nextItems);
}

function getMediaTitle(media: MediaReading): string {
  return media.series && !media.title.includes(media.series)
    ? `${media.series} ${media.title}`
    : media.title;
}

// On a tracked card's own page: remember what the page says about its
// neighbours, and follow a player that moves on without changing the URL
// (sites that keep one address for every episode).
async function refreshOwnPage(
  ctx: ProgressContext,
  tab: chrome.tabs.Tab & { id: number },
  items: readonly unknown[],
  index: number,
  card: TrackedCard
): Promise<AdvanceResult> {
  const historyId = ctx.progressHistory.getHistoryId(card, ctx.progressMatch);
  const known = ctx.cardHints.get(historyId);
  const hints = await readPageHints(ctx, tab.id, { media: true });
  ctx.cardHints.set(historyId, { url: card.url, ...hints });
  if (!hints.media) return { changed: false, reason: 'own-page' };
  const mediaTitle = getMediaTitle(hints.media);
  if (mediaTitle === readCardTitle(card)) return { changed: false, reason: 'own-page' };
  const knownMedia = known && sameUrl(ctx, known.url, card.url) ? known.media : null;
  if (knownMedia && knownMedia.title === hints.media.title) return { changed: false, reason: 'own-page' };
  // The first reading names what is playing; a different reading later
  // means the player moved on, which is a change worth keeping.
  const movedOn = Boolean(knownMedia);
  const timestamp = Math.max(0, Number(ctx.now()) || 0);
  try {
    await saveCard(ctx, items, index, card, { ...card, title: mediaTitle, lastVisitTime: timestamp }, timestamp, {
      record: movedOn
    });
  } catch (_error) {
    return { changed: false, reason: 'storage-error' };
  }
  return { changed: true, reason: movedOn ? 'media-session' : 'media-title', confidence: 'high' };
}

export {
  getMediaTitle,
  getPageTitle,
  isTrackedCard,
  readCardTitle,
  refreshOwnPage,
  sameUrl,
  saveCard
};
