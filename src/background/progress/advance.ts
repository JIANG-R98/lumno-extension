// Deciding whether a page moves a tracked card forward, and moving it.
import { isRecord } from '../../platform/storage-call';
import type { ProgressComparison } from '../../domain/progress-match';
import * as RecentSiteSettings from '../../domain/settings/recent-sites';
import { getPageTitle, isTrackedCard, readCardTitle, refreshOwnPage, sameUrl, saveCard } from './cards';
import { getTransition, isHttpUrl, readLastError, readPageHints, withTimeout } from './tab-reads';
import type { AdvanceResult, PageHints, ProgressContext, TrackedEntry, Trail } from './types';

// The tracked cards on the same site as the page.
function findTrackedCards(ctx: ProgressContext, items: readonly unknown[], url: string): TrackedEntry[] {
  const siteKey = ctx.progressMatch.getProgressSiteKey(url);
  const tracked: TrackedEntry[] = [];
  items.forEach((item, index) => {
    if (isTrackedCard(item) && ctx.progressMatch.getProgressSiteKey(item.url) === siteKey) {
      tracked.push({ item, index });
    }
  });
  return tracked;
}

// A site can have several tracked works; the strongest evidence wins.
function pickBestCard(
  ctx: ProgressContext,
  tracked: readonly TrackedEntry[],
  page: { url: string; title: string },
  trail: Trail | undefined,
  candidateHints: PageHints,
  transition: string
): (TrackedEntry & { result: ProgressComparison }) | null {
  let best: (TrackedEntry & { result: ProgressComparison }) | null = null;
  for (const { item, index } of tracked) {
    const historyId = ctx.progressHistory.getHistoryId(item, ctx.progressMatch);
    const hints = ctx.cardHints.get(historyId);
    const currentHints = hints && sameUrl(ctx, hints.url, item.url) ? hints : null;
    const result = ctx.progressMatch.compareProgressPages(
      { url: item.url, title: readCardTitle(item) },
      page,
      {
        fromCurrent: sameUrl(ctx, trail ? trail.previousUrl : undefined, item.url),
        transition,
        currentHints: currentHints || undefined,
        candidateHints,
        currentEpisode: currentHints ? currentHints.episode : undefined
      }
    );
    if (!ctx.progressMatch.shouldAdvance(result)) continue;
    if (!best || result.score > best.result.score) best = { item, index, result };
  }
  return best;
}

async function advance(ctx: ProgressContext, tab: chrome.tabs.Tab & { id: number; url: string }): Promise<AdvanceResult> {
  if (!ctx.isEnabled()) return { changed: false, reason: 'disabled' };
  await ctx.settingsStore.ready;
  const storedItems = ctx.settingsStore.getStored(RecentSiteSettings.pinnedRecentSites);
  const items: readonly unknown[] = Array.isArray(storedItems) ? storedItems : [];
  const tracked = findTrackedCards(ctx, items, tab.url);
  if (!tracked.length) return { changed: false, reason: 'no-match' };

  const own = tracked.find(({ item }) => sameUrl(ctx, item.url, tab.url));
  if (own) return refreshOwnPage(ctx, tab, items, own.index, own.item);

  const page = { url: tab.url, title: getPageTitle(tab) };
  const trail = ctx.trails.get(tab.id);
  const [candidateHints, transition] = await Promise.all([
    readPageHints(ctx, tab.id),
    getTransition(ctx, tab.url)
  ]);
  const best = pickBestCard(ctx, tracked, page, trail, candidateHints, transition);
  if (!best) return { changed: false, reason: 'no-match' };
  const bestIndex = best.index;
  if (items.some((item, index) => index !== bestIndex && isRecord(item) && sameUrl(ctx, item.url, page.url))) {
    return { changed: false, reason: 'url-conflict' };
  }
  const timestamp = Math.max(0, Number(ctx.now()) || 0);
  try {
    await saveCard(ctx, items, best.index, best.item, {
      ...best.item,
      url: page.url,
      title: page.title || best.item.title,
      lastVisitTime: timestamp
    }, timestamp, { record: true });
  } catch (_error) {
    return { changed: false, reason: 'storage-error' };
  }
  // The page the card now points to tells us about its own neighbours.
  ctx.cardHints.set(ctx.progressHistory.getHistoryId(best.item, ctx.progressMatch), { url: page.url, ...candidateHints });
  return { changed: true, reason: best.result.reason, confidence: best.result.confidence };
}

// Whether an open tab showing this URL reads as an episode or chapter,
// for pinning: its title, URL, episode navigation or metadata.
function probeSeries(ctx: ProgressContext, url: unknown): Promise<boolean> {
  const tabs = ctx.chromeApi && ctx.chromeApi.tabs;
  if (!isHttpUrl(url) || !tabs || typeof tabs.query !== 'function') return Promise.resolve(false);
  return withTimeout(ctx, new Promise<boolean>((resolve) => {
    tabs.query({}, (openTabs) => {
      const tab = !readLastError(ctx) && Array.isArray(openTabs)
        ? openTabs.find((entry) => entry && !entry.incognito && sameUrl(ctx, entry.url, url))
        : null;
      if (!tab || typeof tab.id !== 'number') {
        resolve(false);
        return;
      }
      readPageHints(ctx, tab.id).then((hints) => {
        resolve(ctx.progressMatch.looksLikeSeriesPage({ url: tab.url || '', title: getPageTitle(tab) }, hints));
      }, () => resolve(false));
    });
  }), false);
}

export {
  advance,
  findTrackedCards,
  pickBestCard,
  probeSeries
};
