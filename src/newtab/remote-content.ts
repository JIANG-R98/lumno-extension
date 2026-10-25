// The daily quote and the Bing and bundled wallpapers: fetched, cached in
// local storage, and shared by the quote, the wallpaper panel and settings.
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import type { DailyQuote, RemoteWallpaper } from './remote-content-types';
import { WALLPAPER_CATALOG as CATALOG } from './wallpaper/wallpaper-catalog';

type CatalogCategory = keyof typeof CATALOG;
type CatalogRow = readonly (string | number)[];

// Where the module caches what it fetched.
type RemoteStorageArea = Pick<StorageAreaLike, 'get' | 'set'>;

// navigator.locks; tasks run one at a time across pages under a name.
interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

interface RemoteContentClientOptions {
  storageArea?: RemoteStorageArea | null;
  fetch?: Fetcher;
  now?: () => number;
  locks?: LockManagerLike | null;
  // The page language, which picks Bing's market.
  getLanguage?: () => string;
  language?: string;
  // The quote shown when none could be fetched.
  fallbackQuote?: DailyQuote | (() => DailyQuote);
}

// A failed request, with the HTTP status that failed it.
class RemoteRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isCatalogCategory(value: string): value is CatalogCategory {
  return Object.hasOwn(CATALOG, value);
}

const QUOTE_CACHE_KEY = '_x_extension_newtab_quote_cache_2026_unique_';
const BING_CACHE_KEY = '_x_extension_bing_catalog_cache_2026_unique_';
const BING_DAILY_CACHE_KEY = '_x_extension_bing_daily_cache_2026_unique_';
const BING_META_CACHE_KEY = '_x_extension_bing_wallpaper_meta_2026_unique_';
const BING_DAILY_ID = 'bing-daily';
const BING_ID_PATTERN = /^bing-(\d{8})-(OHR\.[a-zA-Z0-9_-]{1,160})$/;
const BING_ORIGIN = 'https://www.bing.com';
// The random category mixes every bundled category, so it leads the list as the default view.
const RANDOM_CATEGORY = 'random';
const CURATED_CATEGORIES = Object.freeze([RANDOM_CATEGORY, ...Object.keys(CATALOG)]);
const CURATED_DAILY_PREFIX = 'curated-daily-';
const CURATED_DAILY_ID_PATTERN = /^curated-daily-([a-z]{1,24})$/;
// Any Picsum photo resolves from its ID alone, so a pick synced from a version with a larger
// catalog still shows here; only bundled photos carry credits.
const PICSUM_ID_PATTERN = /^picsum-(0|[1-9]\d{0,3})$/;
const PICSUM_ORIGIN = 'https://picsum.photos';
const CMA_ID_PATTERN = /^cma-(\d{4}\.[0-9a-z.]{1,20})$/;
const CMA_IMAGE_ORIGIN = 'https://openaccess-cdn.clevelandart.org';
const CURATED_DAILY_STRIDES = [37, 41, 43, 47, 53];
// Categories the user left out of the random mix. The choice syncs, so devices on the same date
// still list and pick the same photos; the mix always keeps at least one category.
let randomMixExcluded: string[] = [];
const curatedCredits = new Map<string, { category: string; author: string; detail: string }>();
// Photo rows start with a numeric Picsum ID; art rows start with an accession number.
const curatedRowId = (row: CatalogRow): string => typeof row[0] === 'number' ? `picsum-${row[0]}` : `cma-${row[0]}`;
Object.keys(CATALOG).forEach((category) => {
  if (!isCatalogCategory(category)) return;
  CATALOG[category].forEach((row) => {
    curatedCredits.set(curatedRowId(row), { category, author: String(row[1]), detail: String(row[2]) });
  });
});

function normalizeMarket(language: unknown): string {
  const locale = String(language || '').replace(/_/g, '-').toLowerCase();
  if (locale.startsWith('zh')) return locale.includes('tw') || locale.includes('hant') ? 'zh-TW' : 'zh-CN';
  return locale.startsWith('ja') ? 'ja-JP' : 'en-US';
}

function read(area: RemoteStorageArea | null | undefined, key: string): Promise<unknown> {
  return readMany(area, [key]).then((values) => values[key]);
}

// A stored record of entries by key; empty when nothing usable is stored.
function readRecord(area: RemoteStorageArea | null | undefined, key: string): Promise<Record<string, unknown>> {
  return read(area, key).then((value) => (isRecord(value) ? value : {}));
}

function readMany(area: RemoteStorageArea | null | undefined, keys: string[]): Promise<StorageItems> {
  return new Promise((resolve) => {
    if (!area || typeof area.get !== 'function') return resolve({});
    void area.get(keys, (values) => resolve(values || {}));
  });
}

function write(area: RemoteStorageArea | null | undefined, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!area || typeof area.set !== 'function') return resolve();
    void area.set({ [key]: value }, () => {
      const error = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve();
    });
  });
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function normalizeQuote(value: unknown): DailyQuote | null {
  if (!isRecord(value) || typeof value.hitokoto !== 'string') return null;
  const text = value.hitokoto.trim();
  if (!text || text.length > 120) return null;
  const uuid = typeof value.uuid === 'string' && /^[a-f0-9-]{36}$/i.test(value.uuid)
    ? value.uuid : '';
  return {
    text,
    source: typeof value.from === 'string' ? value.from.slice(0, 160) : '',
    author: typeof value.from_who === 'string' ? value.from_who.slice(0, 80) : '',
    url: uuid ? `https://hitokoto.cn/?uuid=${uuid}` : 'https://hitokoto.cn/'
  };
}

// A quote cached under its type: today's, or the last one while a retry
// waits.
function readCachedQuote(value: unknown): DailyQuote | null {
  if (!isRecord(value) || typeof value.text !== 'string') return null;
  return {
    text: value.text,
    source: typeof value.source === 'string' ? value.source : '',
    author: typeof value.author === 'string' ? value.author : '',
    url: typeof value.url === 'string' ? value.url : ''
  };
}

// The quote cached for a category, from the stored quote cache.
function readCachedQuoteFor(cache: unknown, type: string): DailyQuote | null {
  const entry = isRecord(cache) ? cache[type] : null;
  return isRecord(entry) ? readCachedQuote(entry.quote) : null;
}

function curatedWallpaperFromId(id: string): RemoteWallpaper | null {
  const daily = CURATED_DAILY_ID_PATTERN.exec(id);
  if (daily) {
    // A category from a newer version falls back to the first one instead of losing the pick.
    const category = CURATED_CATEGORIES.includes(daily[1]) ? daily[1] : CURATED_CATEGORIES[0] || '';
    return { id, provider: 'curated', category, daily: true, name: 'Picsum', sourceUrl: PICSUM_ORIGIN };
  }
  const credit = curatedCredits.get(id);
  const art = CMA_ID_PATTERN.exec(id);
  if (art) {
    // Museum prints run 1–8 MB, so the page downscales and caches one copy per device and shows
    // the 900px web image until that copy exists.
    const base = `${CMA_IMAGE_ORIGIN}/${art[1]}/${art[1]}`;
    return { id, provider: 'curated', category: credit ? credit.category : 'art',
      name: credit ? credit.author : '', title: credit ? credit.detail : '',
      sourceUrl: `https://clevelandart.org/art/${art[1]}`,
      imageUrl: `${base}_print.jpg`, thumbnailUrl: `${base}_web.jpg`, cacheImage: true };
  }
  const match = PICSUM_ID_PATTERN.exec(id);
  if (!match) return null;
  // Picsum can take seconds or fail on some networks, and a failed photo never reaches the HTTP
  // cache, so every new tab would wait on it again. Photos are cached once per device like prints.
  return { id, provider: 'curated', category: credit ? credit.category : '',
    name: credit ? credit.author : 'Picsum',
    sourceUrl: credit ? `https://unsplash.com/photos/${credit.detail}` : PICSUM_ORIGIN,
    imageUrl: `${PICSUM_ORIGIN}/id/${match[1]}/2560/1440`,
    // Panel tiles are about 117×66 CSS pixels, so 320×180 stays sharp on 2x screens at half the bytes.
    thumbnailUrl: `${PICSUM_ORIGIN}/id/${match[1]}/320/180`, cacheImage: true };
}

function wallpaperFromId(id: unknown): RemoteWallpaper | null {
  const value = String(id || '');
  if (value === BING_DAILY_ID) return { id: value, provider: 'bing', name: 'Bing', sourceUrl: BING_ORIGIN };
  const match = BING_ID_PATTERN.exec(value);
  // Like curated photos, a Bing photo is cached once per device, so new tabs open without the network.
  return match ? { id: value, provider: 'bing', date: match[1], rawId: match[2], name: 'Bing', sourceUrl: BING_ORIGIN,
    imageUrl: `${BING_ORIGIN}/th?id=${match[2]}_1920x1080.jpg&pid=hp`,
    thumbnailUrl: `${BING_ORIGIN}/th?id=${match[2]}_1920x1080.jpg&pid=hp&w=480&h=270&c=1`, cacheImage: true }
    : curatedWallpaperFromId(value);
}

function getWallpaperProvider(id: unknown): string {
  const item = wallpaperFromId(id);
  return item ? item.provider : '';
}

function isDailyWallpaperId(id: unknown): boolean {
  return id === BING_DAILY_ID || CURATED_DAILY_ID_PATTERN.test(String(id || ''));
}

function curatedDailyId(category: string): string {
  return `${CURATED_DAILY_PREFIX}${CURATED_CATEGORIES.includes(category) ? category : CURATED_CATEGORIES[0]}`;
}

function normalizeRandomMixExcluded(value: unknown): string[] {
  const bundled = Object.keys(CATALOG);
  const listed: readonly unknown[] = Array.isArray(value) ? value : [];
  const excluded = bundled.filter((category) => listed.includes(category));
  return excluded.length < bundled.length ? excluded : [];
}

function setRandomMixExcluded(value: unknown): void {
  randomMixExcluded = normalizeRandomMixExcluded(value);
}

function getRandomMixCategories(): string[] {
  return Object.keys(CATALOG).filter((category) => !randomMixExcluded.includes(category));
}

function getCuratedRows(category: string): readonly CatalogRow[] {
  if (category === RANDOM_CATEGORY) {
    return getRandomMixCategories().flatMap((key): readonly CatalogRow[] => (isCatalogCategory(key) ? CATALOG[key] : []));
  }
  return isCatalogCategory(category) ? CATALOG[category] : [];
}

function localDayNumber(timestamp: number): number {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// The random mix reshuffles once a day: pages and highlights stay put within the day, and
// devices on the same date list the photos in the same order.
function shuffleForDay<T>(rows: readonly T[], timestamp: number): T[] {
  let seed = localDayNumber(timestamp) * 2654435761 >>> 0;
  const next = () => {
    seed = seed + 0x6D2B79F5 >>> 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  const shuffled = rows.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

function getCuratedWallpapers(category: string, timestamp?: number): RemoteWallpaper[] {
  const rows = category === RANDOM_CATEGORY
    ? shuffleForDay(getCuratedRows(category), timestamp === undefined ? Date.now() : timestamp)
    : getCuratedRows(category);
  return rows.flatMap((row) => {
    const item = curatedWallpaperFromId(curatedRowId(row));
    return item ? [item] : [];
  });
}

// Devices on the same local date pick the same photo without talking to each other. A stride
// coprime to the list length walks the whole category before repeating, and consecutive days
// land far apart in the list.
function getCuratedDailyWallpaper(category: string, timestamp: number): RemoteWallpaper | null {
  const list = getCuratedRows(category);
  if (!list.length) return null;
  const day = localDayNumber(timestamp);
  const stride = CURATED_DAILY_STRIDES.find((step) => list.length % step !== 0) || 1;
  return curatedWallpaperFromId(curatedRowId(list[((day * stride) % list.length + list.length) % list.length]));
}

// Credit links are optional, so a relative or malformed one falls back to Bing instead of dropping the photo.
function normalizeSourceUrl(link: unknown): string {
  if (!link) return BING_ORIGIN;
  try {
    const source = new URL(String(link), BING_ORIGIN);
    return source.protocol === 'https:' && ['www.bing.com', 'cn.bing.com'].includes(source.hostname) &&
      !source.port && !source.username && !source.password ? source.href : BING_ORIGIN;
  } catch { return BING_ORIGIN; }
}

function normalizeWallpaper(value: unknown): RemoteWallpaper | null {
  if (!isRecord(value) || value.wp !== true || typeof value.startdate !== 'string' || !/^\d{8}$/.test(value.startdate)) return null;
  const startdate = value.startdate;
  const date = new Date(`${startdate.slice(0, 4)}-${startdate.slice(4, 6)}-${startdate.slice(6, 8)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10).replace(/-/g, '') !== startdate) return null;
  try {
    const url = new URL(String(value.urlbase), BING_ORIGIN);
    if (url.origin !== BING_ORIGIN || url.pathname !== '/th' || url.username || url.password) return null;
    const item = wallpaperFromId(`bing-${startdate}-${url.searchParams.get('id')}`);
    if (!item || !item.rawId) return null;
    return { ...item, name: String(value.title || 'Bing').slice(0, 200),
      copyright: String(value.copyright || '').slice(0, 500), date: startdate,
      sourceUrl: normalizeSourceUrl(value.copyrightlink) };
  } catch { return null; }
}

function normalizeStoredWallpaper(value: unknown): RemoteWallpaper | null {
  const item = isRecord(value) ? wallpaperFromId(value.id) : null;
  return isRecord(value) && item && item.rawId ? normalizeWallpaper({ wp: true, startdate: value.date,
    urlbase: `/th?id=${item.rawId}`, title: value.name, copyright: value.copyright,
    copyrightlink: value.sourceUrl }) : null;
}

// Earlier versions kept Bing images in their own database; copies now share the wallpaper image cache.
function deleteLegacyMediaStore(indexedDB: IDBFactory | undefined): void {
  try {
    if (indexedDB && typeof indexedDB.deleteDatabase === 'function') indexedDB.deleteDatabase('lumno-bing');
  } catch {
    // An old database that cannot be removed stays harmless.
  }
}

function createClient(options?: RemoteContentClientOptions | null) {
  const config: RemoteContentClientOptions = options || {};
  const area = config.storageArea;
  const fetcher: Fetcher = config.fetch || ((url, init) => globalThis.fetch(url, init));
  const now = config.now || Date.now;
  const locks: LockManagerLike | null = config.locks || (globalThis.navigator && globalThis.navigator.locks) || null;
  const images = new Map<string, RemoteWallpaper>();
  const pendingImages = new Map<string, Promise<RemoteWallpaper>>();
  const quoteTasks = new Map<string, Promise<DailyQuote>>();
  const catalogTasks = new Map<string, Promise<RemoteWallpaper[]>>();
  let pinnedIds: string[] = [];
  let dailyWallpaper: RemoteWallpaper | null = null;
  let dailyMarket = '';
  const getMarket = () => normalizeMarket(typeof config.getLanguage === 'function' ? config.getLanguage() : config.language);
  deleteLegacyMediaStore(globalThis.indexedDB);
  function lock<T>(name: string, task: () => Promise<T>): Promise<T> {
    return locks && typeof locks.request === 'function' ? locks.request(name, task) : task();
  }
  async function request(url: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetcher(url, { signal: controller.signal, credentials: 'omit',
        referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        throw new RemoteRequestError(`Request failed (${response.status}).`, response.status);
      }
      const data: unknown = await response.json();
      return data;
    } finally { clearTimeout(timer); }
  }
  // A reroll skips the daily cache and saves its pick as today's quote, so it stays until the next day.
  // It fails loudly instead of falling back, leaving the current quote in place.
  function getQuote(category: string, options?: { reroll?: boolean }): Promise<DailyQuote> {
    const type = category === 'poetry' ? 'poetry' : 'literature';
    const reroll = Boolean(options && options.reroll);
    const taskKey = reroll ? `${type}:reroll` : type;
    const pendingQuote = quoteTasks.get(taskKey);
    if (pendingQuote) return pendingQuote;
    const task = lock('lumno-daily-quote', async (): Promise<DailyQuote> => {
      const cache = await readRecord(area, QUOTE_CACHE_KEY);
      const entry = isRecord(cache[type]) ? cache[type] : null;
      const entryQuote = entry ? readCachedQuote(entry.quote) : null;
      const entryDay = entry && typeof entry.day === 'string' ? entry.day : '';
      const entryRetryAt = entry ? Number(entry.retryAt) || 0 : 0;
      if (!reroll && entryQuote && (entryDay === localDay(now()) || entryRetryAt > now())) {
        return entryQuote;
      }
      const url = `https://v1.hitokoto.cn/?c=${type === 'poetry' ? 'i' : 'd'}&encode=json&max_length=40`;
      if (reroll) {
        let quote = normalizeQuote(await request(url));
        // The pool is large but not endless; one more draw keeps a reroll from showing the same line.
        if (quote && entryQuote && quote.text === entryQuote.text) quote = normalizeQuote(await request(url));
        if (!quote) throw new Error('Invalid quote response.');
        const latest = await readRecord(area, QUOTE_CACHE_KEY);
        await write(area, QUOTE_CACHE_KEY, { ...latest, [type]: { quote, day: localDay(now()) } });
        return quote;
      }
      try {
        const data = await request(url);
        const quote = normalizeQuote(data);
        if (!quote) throw new Error('Invalid quote response.');
        // Read again so concurrently updated categories are not overwritten.
        const latest = await readRecord(area, QUOTE_CACHE_KEY);
        await write(area, QUOTE_CACHE_KEY, { ...latest, [type]: { quote, day: localDay(now()) } });
        return quote;
      } catch {
        const fallback = typeof config.fallbackQuote === 'function' ? config.fallbackQuote() : config.fallbackQuote;
        const quote = entryQuote || fallback || {
          text: 'A journey of a thousand miles begins with a single step.', author: 'Laozi',
          source: 'Tao Te Ching', url: 'https://hitokoto.cn/'
        };
        const latest = await readRecord(area, QUOTE_CACHE_KEY);
        await write(area, QUOTE_CACHE_KEY, { ...latest,
          [type]: { quote, day: entryDay, retryAt: now() + 15 * 60 * 1000 } }).catch(() => {});
        return quote;
      }
    }).finally(() => quoteTasks.delete(taskKey));
    quoteTasks.set(taskKey, task);
    return task;
  }
  function getCatalog(refresh?: boolean): Promise<RemoteWallpaper[]> {
    const market = getMarket();
    // A refresh must not resolve with a pending plain load that may serve the cache.
    const taskKey = `${market}${refresh ? ':refresh' : ''}`;
    const pendingCatalog = catalogTasks.get(taskKey);
    if (pendingCatalog) return pendingCatalog;
    const task = lock(`lumno-bing-catalog-${market}`, async (): Promise<RemoteWallpaper[]> => {
      const catalog = await readRecord(area, BING_CACHE_KEY);
      const entry = isRecord(catalog[market]) ? catalog[market] : {};
      const cached = readWallpaperList(entry.items);
      const entryDay = typeof entry.day === 'string' ? entry.day : '';
      const entryUpdatedAt = Number(entry.updatedAt) || 0;
      const entryRetryAt = Number(entry.retryAt) || 0;
      const remember = (items: RemoteWallpaper[]): RemoteWallpaper[] => {
        items.forEach((item) => images.set(item.id, { ...images.get(item.id), ...item }));
        return items;
      };
      // Recheck during the day because Bing's publishing boundary can differ from the local date.
      if ((!refresh && entryDay === localDay(now()) && entryUpdatedAt > now() - 60 * 60 * 1000 ||
          entryRetryAt > now()) && cached.length) return remember(cached);
      if (entryRetryAt > now()) throw new Error('Please try again shortly.');
      try {
        const params = new URLSearchParams({ format: 'js', idx: '0', n: '8', mkt: market });
        const data = await request(`${BING_ORIGIN}/HPImageArchive.aspx?${params}`);
        if (!isRecord(data) || !Array.isArray(data.images)) throw new Error('Invalid wallpaper response.');
        const items = readWallpaperList(data.images.slice(0, 8), normalizeWallpaper)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        if (!items.length) throw new Error('No downloadable wallpapers.');
        await writeCatalogEntry(market, { items, day: localDay(now()), updatedAt: now(), retryAt: 0 });
        return remember(items);
      } catch (error) {
        const status = error instanceof RemoteRequestError ? error.status : 0;
        await writeCatalogEntry(market, { ...entry,
          retryAt: now() + (status === 429 ? 60000 : 15 * 60 * 1000) }).catch(() => {});
        if (cached.length) return remember(cached);
        throw error;
      }
    }).finally(() => catalogTasks.delete(taskKey));
    catalogTasks.set(taskKey, task);
    return task;
  }
  // Read again so markets updated while the request was in flight are not overwritten.
  async function writeCatalogEntry(market: string, entry: Record<string, unknown>): Promise<void> {
    const latest = await readRecord(area, BING_CACHE_KEY);
    await write(area, BING_CACHE_KEY, { ...latest, [market]: entry });
  }
  // Titles and credits of chosen photos outlive the 8-day catalog, so keep them separately.
  async function readStoredDetails(id: string): Promise<RemoteWallpaper | null> {
    const saved = await readRecord(area, BING_META_CACHE_KEY);
    if (saved[id]) return normalizeStoredWallpaper(saved[id]);
    const catalog = await readRecord(area, BING_CACHE_KEY);
    const entry = Object.values(catalog)
      .flatMap((market): unknown[] => (isRecord(market) && Array.isArray(market.items) ? market.items : []))
      .find((item) => isRecord(item) && item.id === id);
    return entry ? normalizeStoredWallpaper(entry) : null;
  }
  function rememberDetails(item: RemoteWallpaper): Promise<void> {
    return lock('lumno-bing-meta', async () => {
      const saved = await readRecord(area, BING_META_CACHE_KEY);
      const dailyCache = await readRecord(area, BING_DAILY_CACHE_KEY);
      const keep = new Set<unknown>([item.id, ...pinnedIds,
        ...Object.values(dailyCache).map((entry) => (isRecord(entry) ? entry.id : undefined))]);
      const next: Record<string, unknown> = { [item.id]: { id: item.id, date: item.date, name: item.name, copyright: item.copyright,
        sourceUrl: item.sourceUrl, savedAt: now() } };
      Object.values(saved)
        .filter((entry): entry is Record<string, unknown> => isRecord(entry) && entry.id !== item.id)
        .sort((a, b) => (Number(b.savedAt) || 0) - (Number(a.savedAt) || 0))
        .forEach((entry) => {
          if (keep.has(entry.id) || Object.keys(next).length < 12) next[String(entry.id)] = entry;
        });
      await write(area, BING_META_CACHE_KEY, next);
    });
  }
  async function restoreWallpaper(id: string): Promise<RemoteWallpaper | null> {
    const descriptor = wallpaperFromId(id);
    if (!descriptor) return null;
    if (descriptor.provider === 'curated') return getWallpaper(id);
    if (id === BING_DAILY_ID) {
      const market = getMarket();
      // New tabs wait on this, so read the photo's saved details along with the daily entry.
      const stored = await readMany(area, [BING_DAILY_CACHE_KEY, BING_META_CACHE_KEY]);
      const dailyCache = isRecord(stored[BING_DAILY_CACHE_KEY]) ? stored[BING_DAILY_CACHE_KEY] : {};
      const entry = isRecord(dailyCache[market]) ? dailyCache[market] : null;
      const daily = entry ? wallpaperFromId(entry.id) : null;
      // Without an entry for this market (e.g. after a language change), keep the previous
      // photo on screen until ensureDailyWallpaper fetches this market's one.
      if (daily && daily.rawId) {
        const metaCache = isRecord(stored[BING_META_CACHE_KEY]) ? stored[BING_META_CACHE_KEY] : {};
        const saved = metaCache[daily.id];
        const details = saved ? normalizeStoredWallpaper(saved) : null;
        if (details && !images.has(daily.id)) images.set(daily.id, details);
        dailyWallpaper = await restoreWallpaper(daily.id);
        dailyMarket = market;
      }
      return dailyWallpaper ? { ...dailyWallpaper, id: BING_DAILY_ID, dailyId: dailyWallpaper.id } : null;
    }
    const known = images.get(id);
    if (known) return known;
    const stored = await readStoredDetails(id).catch(() => null);
    const restored = stored || descriptor;
    images.set(id, restored);
    return restored;
  }
  function ensureWallpaper(id: string): Promise<RemoteWallpaper> {
    const descriptor = wallpaperFromId(id);
    if (!descriptor) return Promise.reject(new Error('Invalid wallpaper ID.'));
    // Curated photos resolve from the bundle; the image itself loads like any other.
    if (descriptor.provider === 'curated') return Promise.resolve(getWallpaper(id) || descriptor);
    if (id === BING_DAILY_ID) return ensureDailyWallpaper();
    const pendingImage = pendingImages.get(id);
    if (pendingImage) return pendingImage;
    const task = restoreWallpaper(id).then(async (restored) => {
      const item = restored || descriptor;
      // A bare ID carries no title yet; only details from the catalog are worth keeping.
      if ('copyright' in item) await rememberDetails(item).catch(() => {});
      return item;
    }).finally(() => pendingImages.delete(id));
    pendingImages.set(id, task);
    return task;
  }
  function ensureDailyWallpaper(): Promise<RemoteWallpaper> {
    const market = getMarket();
    const key = `${BING_DAILY_ID}-${market}`;
    const pendingDaily = pendingImages.get(key);
    if (pendingDaily) return pendingDaily;
    const task = lock(`lumno-bing-daily-${market}`, async (): Promise<RemoteWallpaper> => {
      await restoreWallpaper(BING_DAILY_ID);
      // The daily photo as the page shows it; the daily ID is always valid, so the
      // bare descriptor only stands in for the type.
      const showDaily = (): RemoteWallpaper => getWallpaper(BING_DAILY_ID) ||
        { id: BING_DAILY_ID, provider: 'bing', name: 'Bing', sourceUrl: BING_ORIGIN };
      // Backoff lives in getCatalog alone, so a successful refresh resolves the daily photo right away.
      try {
        const items = await getCatalog();
        const latest = items[0];
        // A delayed or stale archive response must not replace a newer daily photo.
        if (dailyWallpaper && dailyMarket === market && String(dailyWallpaper.date) >= String(latest.date)) {
          return showDaily();
        }
        const record = await ensureWallpaper(latest.id);
        const cache = await readRecord(area, BING_DAILY_CACHE_KEY);
        await write(area, BING_DAILY_CACHE_KEY, { ...cache, [market]: { id: record.id } });
        dailyWallpaper = record;
        dailyMarket = market;
        return showDaily();
      } catch (error) {
        if (dailyWallpaper) return showDaily();
        throw error;
      }
    }).finally(() => pendingImages.delete(key));
    pendingImages.set(key, task);
    return task;
  }
  function getWallpaper(id: string): RemoteWallpaper | null {
    if (id === BING_DAILY_ID && dailyWallpaper) {
      return { ...dailyWallpaper, id, dailyId: dailyWallpaper.id };
    }
    const descriptor = wallpaperFromId(id);
    if (descriptor && descriptor.daily && descriptor.provider === 'curated') {
      const pick = getCuratedDailyWallpaper(descriptor.category || '', now());
      return pick ? { ...pick, id, daily: true, dailyId: pick.id } : descriptor;
    }
    return images.get(id) || wallpaperFromId(id);
  }
  return Object.freeze({ getQuote, getCatalog, ensureWallpaper, restoreWallpaper, getWallpaper,
    setPinnedIds: (ids: readonly string[]) => { pinnedIds = ids.filter((id) => wallpaperFromId(id)); } });
}

// The wallpapers a stored or fetched list holds; entries that are not
// wallpapers are left out.
function readWallpaperList(
  value: unknown,
  normalize: (item: unknown) => RemoteWallpaper | null = normalizeStoredWallpaper
): RemoteWallpaper[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    const wallpaper = normalize(item);
    return wallpaper ? [wallpaper] : [];
  });
}

type RemoteContentClient = ReturnType<typeof createClient>;

export {
  QUOTE_CACHE_KEY,
  BING_CACHE_KEY,
  BING_DAILY_CACHE_KEY,
  BING_META_CACHE_KEY,
  BING_DAILY_ID,
  CURATED_CATEGORIES,
  RANDOM_CATEGORY,
  normalizeMarket,
  localDay,
  normalizeQuote,
  normalizeWallpaper,
  wallpaperFromId,
  getWallpaperProvider,
  isDailyWallpaperId,
  curatedDailyId,
  getCuratedWallpapers,
  getCuratedDailyWallpaper,
  normalizeRandomMixExcluded,
  setRandomMixExcluded,
  getRandomMixCategories,
  readCachedQuoteFor,
  createClient
};
export type { RemoteContentClient, RemoteContentClientOptions };
