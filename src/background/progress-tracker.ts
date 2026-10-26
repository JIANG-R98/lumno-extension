// Moves tracked pinned cards forward as the person watches or reads on.
// A page counts once it has stayed in a tab the person is looking at (or
// listening to) for the dwell time; passing through never moves a card.
// Besides the URL and title, the decision weighs how the person got there
// (clicked on from the card's page, or typed and bookmarked) and, on sites
// with a tracked card only, what the page says about itself: next and
// previous links, episode metadata and the media session.
import { isRecord, isThenable } from '../platform/storage-call';
import type * as LumnoProgressMatch from '../domain/progress-match';
import type * as LumnoProgressHistory from '../domain/progress-history';
import type { ProgressComparison, ProgressConfidence } from '../domain/progress-match';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import * as RecentSiteSettings from '../domain/settings/recent-sites';

type ProgressMatchApi = Pick<typeof LumnoProgressMatch,
  'getComparableUrl' | 'getProgressSiteKey' | 'compareProgressPages' | 'shouldAdvance' | 'looksLikeSeriesPage'>;
type ProgressHistoryApi = Pick<typeof LumnoProgressHistory, 'recordVersion' | 'getHistoryId'>;

// A timer from the injected timer functions; only they read it.
type TimerHandle = unknown;

// What a page's media session says is playing.
interface MediaReading {
  title: string;
  series: string;
}

// What a page says about itself (see readProgressPageHints).
interface PageHints {
  nextUrls: string[];
  prevUrls: string[];
  episodeNavigation: boolean;
  seriesName: string;
  episode: number;
  media: MediaReading | null;
}

// Hints read from a tracked card's page, and the page they were read from.
interface CardHints extends PageHints {
  url: string;
}

// A tab whose page is waiting out the dwell time.
interface DwellCandidate {
  url: string;
  timer: TimerHandle | null;
  // The dwell ran out while the tab was in the background.
  waiting: boolean;
  // The page was weighed.
  settled: boolean;
}

// Where a tab is, and the page it was on before.
interface Trail {
  url: string;
  title: string;
  previousUrl: string;
  previousTitle: string;
}

// A pinned card that follows a work, as stored. Fields the tracker does not
// read are kept as they are.
interface TrackedCard extends Record<string, unknown> {
  url: string;
  progressTracking: true;
}

interface AdvanceResult {
  changed: boolean;
  reason: string;
  confidence?: ProgressConfidence;
}

interface ObserveOptions {
  // The page's title or sound changed without a new URL.
  contentChanged?: boolean;
}

interface ProgressTrackerOptions {
  chromeApi?: typeof chrome | null;
  progressMatch: ProgressMatchApi;
  progressHistory: ProgressHistoryApi;
  getPinnedArea: () => StorageAreaLike | null;
  historyArea: StorageAreaLike | null;
  pinnedKey: string;
  isEnabled?: () => boolean;
  dwellMs?: number;
  probeTimeoutMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

interface ProgressTracker {
  attach(): boolean;
  observe(tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions): void;
  advance(tab: chrome.tabs.Tab & { id: number; url: string }): Promise<AdvanceResult>;
  probeSeries(url: unknown): Promise<boolean>;
  getPendingCount(): number;
}

const DEFAULT_DWELL_MS = 15000;
const DEFAULT_PROBE_TIMEOUT_MS = 800;
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
  let episodeNavigation = false;
  document.querySelectorAll('link[rel~="next"][href], a[rel~="next"][href]').forEach((node) => {
    pushUnique(nextUrls, node.getAttribute('href'));
  });
  document.querySelectorAll('link[rel~="prev"][href], a[rel~="prev"][href], link[rel~="previous"][href]').forEach((node) => {
    pushUnique(prevUrls, node.getAttribute('href'));
  });
  const anchors = document.querySelectorAll('a[href]');
  for (let index = 0; index < anchors.length && index < 600; index += 1) {
    const anchor = anchors[index];
    const text = String(anchor.textContent || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text || text.length > 24) continue;
    if (NEXT_TEXT.test(text)) pushUnique(nextUrls, anchor.getAttribute('href'));
    else if (PREV_TEXT.test(text)) pushUnique(prevUrls, anchor.getAttribute('href'));
    if (EPISODE_NAV_TEXT.test(text)) episodeNavigation = true;
  }
  let seriesName = '';
  let episode = 0;
  const visit = (value: unknown, depth: number): void => {
    if (!isObject(value) || depth > 4 || seriesName) return;
    if (Array.isArray(value)) {
      value.forEach((entry: unknown) => visit(entry, depth + 1));
      return;
    }
    const typeValue = value['@type'] || [];
    const types: unknown[] = Array.isArray(typeValue) ? typeValue : [typeValue];
    if (types.some((type) => EPISODE_TYPES.test(String(type)))) {
      const season = value.partOfSeason;
      const series = value.partOfSeries || (isObject(season) && season.partOfSeries) || value.isPartOf;
      const name = isObject(series) ? series.name : '';
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
  let media: MediaReading | null = null;
  try {
    const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
    if (metadata && metadata.title) {
      media = { title: String(metadata.title), series: String(metadata.album || metadata.artist || '') };
    }
  } catch (_error) {
    media = null;
  }
  return { nextUrls, prevUrls, episodeNavigation, seriesName, episode, media };
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

function isTrackedCard(item: unknown): item is TrackedCard {
  return isRecord(item) && item.progressTracking === true && typeof item.url === 'string';
}

function readCardTitle(card: TrackedCard): string | undefined {
  return typeof card.title === 'string' ? card.title : undefined;
}

// The first frame's result of scripting.executeScript, which the page
// produced: callers read it as unknown.
function readFirstResult(results: unknown): unknown {
  return Array.isArray(results) && isRecord(results[0]) ? results[0].result : null;
}

function createProgressTracker(options: ProgressTrackerOptions): Readonly<ProgressTracker> {
  const config = options;
  const chromeApi = config.chromeApi || null;
  const progressMatch = config.progressMatch;
  const progressHistory = config.progressHistory;
  const getPinnedArea = config.getPinnedArea;
  const historyArea = config.historyArea;
  const pinnedKey = config.pinnedKey;
  const isEnabled = typeof config.isEnabled === 'function' ? config.isEnabled : () => true;
  const dwellMs = Number.isFinite(Number(config.dwellMs)) ? Number(config.dwellMs) : DEFAULT_DWELL_MS;
  const probeTimeoutMs = Number.isFinite(Number(config.probeTimeoutMs))
    ? Number(config.probeTimeoutMs)
    : DEFAULT_PROBE_TIMEOUT_MS;
  const now = typeof config.now === 'function' ? config.now : Date.now;
  const setTimer = typeof config.setTimer === 'function'
    ? config.setTimer
    : (callback: () => void, delay: number): TimerHandle => setTimeout(callback, delay);
  const clearTimer = typeof config.clearTimer === 'function'
    ? config.clearTimer
    : (timerId: TimerHandle): void => {
      if (typeof timerId === 'number') clearTimeout(timerId);
    };
  const candidates = new Map<number, DwellCandidate>();
  // Where each tab came from.
  const trails = new Map<number, Trail>();
  // card history id → hints read from the card's own page while it was open.
  const cardHints = new Map<string, CardHints>();
  let queue: Promise<unknown> = Promise.resolve();

  function readLastError(): chrome.runtime.LastError | null | undefined {
    return chromeApi && chromeApi.runtime ? chromeApi.runtime.lastError : null;
  }

  function storageGet(area: StorageAreaLike | null, key: string): Promise<StorageItems> {
    return new Promise((resolve) => {
      if (!area || typeof area.get !== 'function') {
        resolve({});
        return;
      }
      area.get([key], (result) => {
        resolve(readLastError() ? {} : (result || {}));
      });
    });
  }

  function storageSet(area: StorageAreaLike | null, value: StorageItems): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.set !== 'function') {
        reject(new Error('storage-unavailable'));
        return;
      }
      area.set(value, () => {
        const error = readLastError();
        if (error) reject(new Error(error.message || 'storage-error'));
        else resolve();
      });
    });
  }

  function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    return new Promise((resolve) => {
      if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.get !== 'function') {
        resolve(null);
        return;
      }
      chromeApi.tabs.get(tabId, (tab) => {
        resolve(readLastError() ? null : (tab || null));
      });
    });
  }

  function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimer(() => {
        if (!done) {
          done = true;
          resolve(fallback);
        }
      }, probeTimeoutMs);
      promise.then((value) => {
        if (done) return;
        done = true;
        clearTimer(timer);
        resolve(value);
      }, () => {
        if (done) return;
        done = true;
        clearTimer(timer);
        resolve(fallback);
      });
    });
  }

  // Runs a reader in the tab's top frame. Its result comes from the page,
  // so it is unknown until normalized.
  function executeInTab(tabId: number, func: () => unknown, world?: chrome.scripting.ExecutionWorld | `${chrome.scripting.ExecutionWorld}`): Promise<unknown> {
    const scripting = chromeApi && chromeApi.scripting;
    if (!scripting || typeof scripting.executeScript !== 'function') return Promise.resolve(null);
    return withTimeout(new Promise<unknown>((resolve) => {
      try {
        // Firefox answers with a promise as well as the callback.
        const pending: unknown = scripting.executeScript({ target: { tabId }, func, world: world || 'ISOLATED' }, (results) => {
          resolve(readLastError() ? null : readFirstResult(results));
        });
        if (isThenable(pending)) {
          pending.then((results) => {
            resolve(readFirstResult(results));
          }, () => resolve(null));
        }
      } catch (_error) {
        resolve(null);
      }
    }), null);
  }

  function normalizeMedia(value: unknown): MediaReading | null {
    return isRecord(value) && value.title
      ? { title: String(value.title).trim(), series: String(value.series || '').trim() }
      : null;
  }

  function normalizeHints(value: unknown): PageHints {
    const hints = isRecord(value) ? value : {};
    const urls = (list: unknown): string[] => (Array.isArray(list) ? list.map(String).slice(0, MAX_PAGE_LINKS) : []);
    const media = normalizeMedia(hints.media);
    return {
      nextUrls: urls(hints.nextUrls),
      prevUrls: urls(hints.prevUrls),
      episodeNavigation: hints.episodeNavigation === true,
      seriesName: String(hints.seriesName || '').trim(),
      episode: Math.max(0, Number(hints.episode) || 0),
      media
    };
  }

  function readPageHints(tabId: number, options?: { media?: boolean }): Promise<PageHints> {
    return executeInTab(tabId, readProgressPageHints).then(async (raw) => {
      const hints = normalizeHints(raw);
      if (!hints.media && options && options.media) {
        const media = normalizeMedia(await executeInTab(tabId, readMediaSession, 'MAIN'));
        if (media) hints.media = media;
      }
      return hints;
    });
  }

  // How the person reached this URL, from the browser history: a link, or
  // a typed URL, bookmark or search.
  function getTransition(url: string): Promise<string> {
    const history = chromeApi && chromeApi.history;
    if (!history || typeof history.getVisits !== 'function') return Promise.resolve('');
    return withTimeout(new Promise<string>((resolve) => {
      try {
        history.getVisits({ url }, (visits) => {
          if (readLastError() || !Array.isArray(visits) || !visits.length) {
            resolve('');
            return;
          }
          const latest = visits.reduce((best, visit) => (
            Number(visit.visitTime) > Number(best.visitTime) ? visit : best
          ));
          resolve(String(latest.transition || ''));
        });
      } catch (_error) {
        resolve('');
      }
    }), '');
  }

  function isHttpUrl(url: unknown): url is string {
    return typeof url === 'string' && /^https?:\/\//i.test(url);
  }

  function isTrackableTab(tab: chrome.tabs.Tab | null | undefined): tab is chrome.tabs.Tab & { id: number; url: string } {
    return Boolean(tab && Number.isInteger(tab.id) && !tab.incognito && isHttpUrl(tab.url));
  }

  function isEngaged(tab: chrome.tabs.Tab | null | undefined): boolean {
    return Boolean(tab && (tab.active || tab.audible));
  }

  function rememberTrail(tabId: number, url: string | undefined, title: string | undefined): void {
    const entry = trails.get(tabId) || { url: '', title: '', previousUrl: '', previousTitle: '' };
    if (url && url !== entry.url) {
      // A blank or internal page in between (a new tab's first load) keeps
      // the page the tab really came from.
      const cameFrom = isHttpUrl(entry.url)
        ? { previousUrl: entry.url, previousTitle: entry.title }
        : { previousUrl: entry.previousUrl, previousTitle: entry.previousTitle };
      trails.set(tabId, { url, title: String(title || ''), ...cameFrom });
      return;
    }
    if (title) trails.set(tabId, { ...entry, title: String(title) });
  }

  function forget(tabId: number): void {
    const candidate = candidates.get(tabId);
    if (candidate && candidate.timer !== null) clearTimer(candidate.timer);
    candidates.delete(tabId);
  }

  function startDwell(tabId: number, url: string): void {
    forget(tabId);
    const candidate: DwellCandidate = { url, timer: null, waiting: false, settled: false };
    candidate.timer = setTimer(() => {
      candidate.timer = null;
      void settle(tabId, candidate);
    }, dwellMs);
    candidates.set(tabId, candidate);
  }

  function observe(tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions): void {
    if (!isEnabled() || !isTrackableTab(tab)) {
      if (tab && typeof tab.id === 'number' && Number.isInteger(tab.id)) forget(tab.id);
      return;
    }
    const candidate = candidates.get(tab.id);
    if (candidate && candidate.url === tab.url) {
      // The dwell ran out while the tab was in the background; it starts
      // over once the person comes back to it. A page whose content changes
      // without a new URL (a player moving to the next episode) is read again.
      if ((candidate.waiting && isEngaged(tab)) || (candidate.settled && options && options.contentChanged)) {
        startDwell(tab.id, tab.url);
      }
      return;
    }
    startDwell(tab.id, tab.url);
  }

  function settle(tabId: number, candidate: DwellCandidate): Promise<AdvanceResult | null> {
    return getTab(tabId).then((tab) => {
      if (candidates.get(tabId) !== candidate) return null;
      if (!tab || tab.url !== candidate.url || !isTrackableTab(tab)) {
        forget(tabId);
        return null;
      }
      if (!isEngaged(tab)) {
        candidate.waiting = true;
        return null;
      }
      candidate.settled = true;
      return enqueue(() => advance(tab));
    });
  }

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  }

  function getPageTitle(tab: chrome.tabs.Tab): string {
    const title = String(tab && tab.title || '').replace(/\s+/g, ' ').trim();
    return title && title !== tab.url ? title : '';
  }

  function sameUrl(a: unknown, b: unknown): boolean {
    const left = progressMatch.getComparableUrl(a);
    return Boolean(left) && left === progressMatch.getComparableUrl(b);
  }

  async function saveCard(
    items: readonly unknown[],
    index: number,
    previous: TrackedCard,
    nextCard: TrackedCard,
    timestamp: number,
    options?: { record?: boolean }
  ): Promise<void> {
    if (options && options.record) {
      const historyKey = RecentSiteSettings.progressHistory.key;
      const storedHistory = await storageGet(historyArea, historyKey);
      const nextHistory = progressHistory.recordVersion(
        storedHistory[historyKey],
        progressHistory.getHistoryId(previous, progressMatch),
        { url: previous.url, title: previous.title, updatedAt: timestamp }
      );
      await storageSet(historyArea, { [historyKey]: nextHistory });
    }
    // The site name can come from the old title, so New Tab derives it again.
    const { siteName: _staleSiteName, ...card } = nextCard;
    const nextItems = items.slice();
    nextItems[index] = card;
    await storageSet(getPinnedArea(), { [pinnedKey]: nextItems });
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
    tab: chrome.tabs.Tab & { id: number },
    items: readonly unknown[],
    index: number,
    card: TrackedCard
  ): Promise<AdvanceResult> {
    const historyId = progressHistory.getHistoryId(card, progressMatch);
    const known = cardHints.get(historyId);
    const hints = await readPageHints(tab.id, { media: true });
    cardHints.set(historyId, { url: card.url, ...hints });
    if (!hints.media) return { changed: false, reason: 'own-page' };
    const mediaTitle = getMediaTitle(hints.media);
    if (mediaTitle === readCardTitle(card)) return { changed: false, reason: 'own-page' };
    const knownMedia = known && sameUrl(known.url, card.url) ? known.media : null;
    if (knownMedia && knownMedia.title === hints.media.title) return { changed: false, reason: 'own-page' };
    // The first reading names what is playing; a different reading later
    // means the player moved on, which is a change worth keeping.
    const movedOn = Boolean(knownMedia);
    const timestamp = Math.max(0, Number(now()) || 0);
    try {
      await saveCard(items, index, card, { ...card, title: mediaTitle, lastVisitTime: timestamp }, timestamp, {
        record: movedOn
      });
    } catch (_error) {
      return { changed: false, reason: 'storage-error' };
    }
    return { changed: true, reason: movedOn ? 'media-session' : 'media-title', confidence: 'high' };
  }

  // Finds the tracked card this page continues and moves it forward. The
  // version it leaves goes into the history first, so it can be restored.
  async function advance(tab: chrome.tabs.Tab & { id: number; url: string }): Promise<AdvanceResult> {
    if (!isEnabled()) return { changed: false, reason: 'disabled' };
    const stored = await storageGet(getPinnedArea(), pinnedKey);
    const storedItems = stored[pinnedKey];
    const items: readonly unknown[] = Array.isArray(storedItems) ? storedItems : [];
    const siteKey = progressMatch.getProgressSiteKey(tab.url);
    const tracked: Array<{ item: TrackedCard; index: number }> = [];
    items.forEach((item, index) => {
      if (isTrackedCard(item) && progressMatch.getProgressSiteKey(item.url) === siteKey) {
        tracked.push({ item, index });
      }
    });
    if (!tracked.length) return { changed: false, reason: 'no-match' };

    const own = tracked.find(({ item }) => sameUrl(item.url, tab.url));
    if (own) return refreshOwnPage(tab, items, own.index, own.item);

    const page = { url: tab.url, title: getPageTitle(tab) };
    const trail = trails.get(tab.id);
    const [candidateHints, transition] = await Promise.all([
      readPageHints(tab.id),
      getTransition(tab.url)
    ]);
    // A site can have several tracked works; the strongest evidence wins.
    let best: { item: TrackedCard; index: number; result: ProgressComparison } | null = null;
    for (const { item, index } of tracked) {
      const historyId = progressHistory.getHistoryId(item, progressMatch);
      const hints = cardHints.get(historyId);
      const currentHints = hints && sameUrl(hints.url, item.url) ? hints : null;
      const result = progressMatch.compareProgressPages(
        { url: item.url, title: readCardTitle(item) },
        page,
        {
          fromCurrent: sameUrl(trail ? trail.previousUrl : undefined, item.url),
          transition,
          currentHints: currentHints || undefined,
          candidateHints,
          currentEpisode: currentHints ? currentHints.episode : undefined
        }
      );
      if (!progressMatch.shouldAdvance(result)) continue;
      if (!best || result.score > best.result.score) best = { item, index, result };
    }
    if (!best) return { changed: false, reason: 'no-match' };
    const bestIndex = best.index;
    if (items.some((item, index) => index !== bestIndex && isRecord(item) && sameUrl(item.url, page.url))) {
      return { changed: false, reason: 'url-conflict' };
    }
    const timestamp = Math.max(0, Number(now()) || 0);
    try {
      await saveCard(items, best.index, best.item, {
        ...best.item,
        url: page.url,
        title: page.title || best.item.title,
        lastVisitTime: timestamp
      }, timestamp, { record: true });
    } catch (_error) {
      return { changed: false, reason: 'storage-error' };
    }
    // The page the card now points to tells us about its own neighbours.
    cardHints.set(progressHistory.getHistoryId(best.item, progressMatch), { url: page.url, ...candidateHints });
    return { changed: true, reason: best.result.reason, confidence: best.result.confidence };
  }

  // Whether an open tab showing this URL reads as an episode or chapter,
  // for pinning: its title, URL, episode navigation or metadata.
  function probeSeries(url: unknown): Promise<boolean> {
    const tabs = chromeApi && chromeApi.tabs;
    if (!isHttpUrl(url) || !tabs || typeof tabs.query !== 'function') return Promise.resolve(false);
    return withTimeout(new Promise<boolean>((resolve) => {
      tabs.query({}, (openTabs) => {
        const tab = !readLastError() && Array.isArray(openTabs)
          ? openTabs.find((entry) => entry && !entry.incognito && sameUrl(entry.url, url))
          : null;
        if (!tab || typeof tab.id !== 'number') {
          resolve(false);
          return;
        }
        readPageHints(tab.id).then((hints) => {
          resolve(progressMatch.looksLikeSeriesPage({ url: tab.url || '', title: getPageTitle(tab) }, hints));
        }, () => resolve(false));
      });
    }), false);
  }

  function attach(): boolean {
    const tabs = chromeApi && chromeApi.tabs;
    if (!tabs) return false;
    if (tabs.onCreated && typeof tabs.onCreated.addListener === 'function') {
      tabs.onCreated.addListener((tab) => {
        const openerTabId = Number(tab && tab.openerTabId);
        const opener = Number.isInteger(openerTabId) ? trails.get(openerTabId) : null;
        if (!tab || typeof tab.id !== 'number' || !Number.isInteger(tab.id) || !opener || !isHttpUrl(opener.url)) return;
        // A tab opened from a page came from that page.
        trails.set(tab.id, { url: '', title: '', previousUrl: opener.url, previousTitle: opener.title });
      });
    }
    if (tabs.onUpdated && typeof tabs.onUpdated.addListener === 'function') {
      tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (!changeInfo) return;
        rememberTrail(tabId, changeInfo.url || (tab && tab.url), changeInfo.title || (tab && tab.title));
        const contentChanged = Boolean(changeInfo.title) ||
          Object.prototype.hasOwnProperty.call(changeInfo, 'audible');
        if (!(changeInfo.url || changeInfo.status === 'complete' || contentChanged)) return;
        observe({ ...tab, id: tabId }, { contentChanged });
      });
    }
    if (tabs.onActivated && typeof tabs.onActivated.addListener === 'function') {
      tabs.onActivated.addListener((activeInfo) => {
        const tabId = Number(activeInfo && activeInfo.tabId);
        if (!Number.isInteger(tabId) || !candidates.has(tabId)) return;
        void getTab(tabId).then((tab) => {
          if (tab) observe(tab);
        });
      });
    }
    if (tabs.onRemoved && typeof tabs.onRemoved.addListener === 'function') {
      tabs.onRemoved.addListener((tabId) => {
        forget(tabId);
        trails.delete(tabId);
      });
    }
    if (tabs.onReplaced && typeof tabs.onReplaced.addListener === 'function') {
      tabs.onReplaced.addListener((addedTabId, removedTabId) => {
        forget(removedTabId);
        const trail = trails.get(removedTabId);
        if (trail) trails.set(addedTabId, trail);
        trails.delete(removedTabId);
      });
    }
    return true;
  }

  return Object.freeze({
    attach,
    observe,
    advance: (tab: chrome.tabs.Tab & { id: number; url: string }) => enqueue(() => advance(tab)),
    probeSeries,
    getPendingCount: () => candidates.size
  });
}

export type { AdvanceResult, PageHints, ProgressTracker, ProgressTrackerOptions };
export { DEFAULT_DWELL_MS, createProgressTracker, readProgressPageHints };
