// Deciding whether a page moves a tracked card forward, and moving it.
import { isRecord } from '../../platform/storage-call';
import type { ProgressComparison } from '../../domain/progress-match';
import * as RecentSiteSettings from '../../domain/settings/recent-sites';
import { getPageTitle, isTrackedCard, readCardTitle, refreshOwnPage, sameUrl, saveCard } from './cards';
import { getTransition, readLastError, readPageHints, withTimeout } from './tab-reads';
import { isHttpUrl } from './trails';
import type { AdvanceResult, PageHints, TrackedEntry, Trail } from './types';
import type { ProgressTracking } from './tracking';
import { compareProgressPages, getProgressSiteKey, looksLikeSeriesPage, shouldAdvance } from '../../domain/progress-match';
import { getHistoryId } from '../../domain/progress-history';

// The tracked cards on the same site as the page.
function findTrackedCards(tracking: ProgressTracking, items: readonly unknown[], url: string): TrackedEntry[] {
  const siteKey = getProgressSiteKey(url);
  const tracked: TrackedEntry[] = [];
  items.forEach((item, index) => {
    if (isTrackedCard(item) && getProgressSiteKey(item.url) === siteKey) {
      tracked.push({ item, index });
    }
  });
  return tracked;
}

// A site can have several tracked works; the strongest evidence wins.
function pickBestCard(
  tracking: ProgressTracking,
  tracked: readonly TrackedEntry[],
  page: { url: string; title: string },
  trail: Trail | undefined,
  candidateHints: PageHints,
  transition: string
): (TrackedEntry & { result: ProgressComparison }) | null {
  let best: (TrackedEntry & { result: ProgressComparison }) | null = null;
  for (const { item, index } of tracked) {
    const historyId = getHistoryId(item);
    const hints = tracking.cardHints.get(historyId);
    const currentHints = hints && sameUrl(tracking, hints.url, item.url) ? hints : null;
    const result = compareProgressPages(
      { url: item.url, title: readCardTitle(item) },
      page,
      {
        fromCurrent: sameUrl(tracking, trail ? trail.previousUrl : undefined, item.url),
        transition,
        currentHints: currentHints || undefined,
        candidateHints,
        currentEpisode: currentHints ? currentHints.episode : undefined
      }
    );
    if (!shouldAdvance(result)) continue;
    if (!best || result.score > best.result.score) best = { item, index, result };
  }
  return best;
}

async function advance(tracking: ProgressTracking, tab: chrome.tabs.Tab & { id: number; url: string }): Promise<AdvanceResult> {
  if (!tracking.ports.isEnabled()) return { changed: false, reason: 'disabled' };
  await tracking.ports.settingsStore.ready;
  const storedItems = tracking.ports.settingsStore.getStored(RecentSiteSettings.pinnedRecentSites);
  const items: readonly unknown[] = Array.isArray(storedItems) ? storedItems : [];
  const tracked = findTrackedCards(tracking, items, tab.url);
  if (!tracked.length) return { changed: false, reason: 'no-match' };

  const own = tracked.find(({ item }) => sameUrl(tracking, item.url, tab.url));
  if (own) return refreshOwnPage(tracking, tab, items, own.index, own.item);

  const page = { url: tab.url, title: getPageTitle(tab) };
  const trail = tracking.trails.get(tab.id);
  const [candidateHints, transition] = await Promise.all([
    readPageHints(tracking, tab.id),
    getTransition(tracking, tab.url)
  ]);
  const best = pickBestCard(tracking, tracked, page, trail, candidateHints, transition);
  if (!best) return { changed: false, reason: 'no-match' };
  const bestIndex = best.index;
  if (items.some((item, index) => index !== bestIndex && isRecord(item) && sameUrl(tracking, item.url, page.url))) {
    return { changed: false, reason: 'url-conflict' };
  }
  const timestamp = Math.max(0, Number(tracking.ports.now()) || 0);
  try {
    await saveCard(tracking, items, best.index, best.item, {
      ...best.item,
      url: page.url,
      title: page.title || best.item.title,
      lastVisitTime: timestamp
    }, timestamp, { record: true });
  } catch (_error) {
    return { changed: false, reason: 'storage-error' };
  }
  // The page the card now points to tells us about its own neighbours.
  tracking.cardHints.set(getHistoryId(best.item), { url: page.url, ...candidateHints });
  return { changed: true, reason: best.result.reason, confidence: best.result.confidence };
}

// Whether an open tab showing this URL reads as an episode or chapter,
// for pinning: its title, URL, episode navigation or metadata.
function probeSeries(tracking: ProgressTracking, url: unknown): Promise<boolean> {
  const tabs = tracking.ports.chromeApi && tracking.ports.chromeApi.tabs;
  if (!isHttpUrl(url) || !tabs || typeof tabs.query !== 'function') return Promise.resolve(false);
  return withTimeout(tracking, new Promise<boolean>((resolve) => {
    tabs.query({}, (openTabs) => {
      const tab = !readLastError(tracking) && Array.isArray(openTabs)
        ? openTabs.find((entry) => entry && !entry.incognito && sameUrl(tracking, entry.url, url))
        : null;
      if (!tab || typeof tab.id !== 'number') {
        resolve(false);
        return;
      }
      readPageHints(tracking, tab.id).then((hints) => {
        resolve(looksLikeSeriesPage({ url: tab.url || '', title: getPageTitle(tab) }, hints));
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
