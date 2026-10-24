// Icons for shortcuts and site search providers: the bundled artwork for
// known sites, picking the best icon a page declares, reading an icon
// file's dimensions, and the saved icon snapshots keyed by page.
import * as faviconUtils from './favicon-utils';
import type { SiteSearchProvider } from '../search/types';

// What the icon helpers read from a site search provider.
type IconProvider = Partial<Pick<SiteSearchProvider, 'key' | 'builtinKey' | 'template' | 'icon' | 'iconUrl'>>;

// A saved icon for one page.
interface CachedIcon {
  dataUrl: string;
  // Where the image came from: the page's own icon, a favicon service or
  // the browser's favicon cache.
  sourceUrl: string;
  updatedAt: number;
}

// Saved icons keyed by page URL (getCacheKey).
type CachedIconMap = Record<string, CachedIcon>;

interface IconCacheOptions {
  // 0 keeps icons until their page is removed.
  cacheTtlMs: number;
  cacheMaxEntries: number;
  maxDataUrlLength: number;
}

// How a saved icon was obtained, as the shortcut editor names it.
type CachedIconSource = 'favicon-is' | 'service' | 'cache';

// Where a page declares an icon, or a well-known address tried without one.
type IconCandidateSource = 'icon' | 'apple-touch-icon' | 'manifest' | 'root-svg' | 'root';

interface IconCandidate {
  url: string;
  source: IconCandidateSource;
  // The largest square size declared; Infinity for a vector or "any".
  declaredSize: number;
  vector: boolean;
  // A manifest icon's purpose ('any', 'maskable', ...), or ''.
  purpose: string;
  // How well the icon matches the preferred light or dark theme.
  themeScore: number;
  score: number;
}

interface IconCandidateOptions {
  source?: IconCandidateSource;
  declaredSize?: number;
  vector?: boolean;
  purpose?: string;
  themeScore?: number;
}

interface IconDimensions {
  width: number;
  height: number;
}

// What a downloaded icon file turned out to be.
interface IconResourceInfo {
  // Large enough to show crisply.
  usable: boolean;
  vector: boolean;
  width: number;
  height: number;
  mimeType: string;
}

interface IconInspectOptions {
  // Smallest longer side accepted, between 16 and MIN_ICON_DIMENSION.
  minDimension?: number;
}

interface SiteSearchIconOptions extends Partial<IconCacheOptions> {
  // The extension URL of a bundled asset path.
  resolveAssetUrl?: (assetPath: string) => string;
}

const DEFAULT_STORAGE_KEY = '_x_extension_newtab_shortcut_favicon_cache_2026_unique_';
const SITE_SEARCH_STORAGE_KEY = '_x_extension_site_search_icon_cache_canonical_2026_unique_';
const GOOGLE_BRAND_ICON_URL =
  'https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png';
const SITE_SEARCH_PINNED_ICON_ASSETS: Readonly<Record<string, string>> = Object.freeze({
  yt: 'assets/images/site-search/tile-yt.png',
  bb: 'assets/images/site-search/tile-bb.png',
  gh: 'assets/images/site-search/tile-gh.png',
  sf: 'assets/images/site-search/tile-sf.png',
  mdn: 'assets/images/site-search/tile-mdn.png',
  npm: 'assets/images/site-search/tile-npm.png',
  hf: 'assets/images/site-search/tile-hf.png',
  gs: 'assets/images/site-search/tile-gs.png',
  ss: 'assets/images/site-search/tile-ss.png',
  maps: 'assets/images/site-search/tile-maps.png',
  gpt: 'assets/images/site-search/tile-gpt.png',
  gm: 'assets/images/site-search/tile-gm.png',
  dbai: 'assets/images/site-search/tile-dbai.png',
  qw: 'assets/images/site-search/tile-qw.png',
  yb: 'assets/images/site-search/tile-yb.png',
  mx: 'assets/images/site-search/tile-mx.png',
  ds: 'assets/images/site-search/tile-ds.png',
  kimi: 'assets/images/site-search/tile-kimi.png',
  cp: 'assets/images/site-search/tile-cp.png',
  grok: 'assets/images/site-search/tile-grok.png',
  qwen: 'assets/images/site-search/tile-qwen.png',
  ais: 'assets/images/site-search/tile-ais.png',
  pplx: 'assets/images/site-search/tile-pplx.png',
  metaso: 'assets/images/site-search/tile-metaso.png',
  felo: 'assets/images/site-search/tile-felo.png',
  bd: 'assets/images/site-search/tile-bd.png',
  bi: 'assets/images/site-search/tile-bi.png',
  gg: 'assets/images/site-search/tile-gg.png',
  kg: 'assets/images/site-search/tile-kg.png',
  ddg: 'assets/images/site-search/tile-ddg.png',
  br: 'assets/images/site-search/tile-br.png',
  eco: 'assets/images/site-search/tile-eco.png',
  sg: 'assets/images/site-search/tile-sg.png',
  yh: 'assets/images/site-search/tile-yh.png',
  yx: 'assets/images/site-search/tile-yx.png',
  sm: 'assets/images/site-search/tile-sm.png',
  zh: 'assets/images/site-search/tile-zh.png',
  db: 'assets/images/site-search/tile-db.png',
  jj: 'assets/images/site-search/tile-jj.png',
  wx: 'assets/images/site-search/tile-wx.png',
  tb: 'assets/images/site-search/tile-tb.png',
  tm: 'assets/images/site-search/tile-tm.png',
  tw: 'assets/images/site-search/tile-tw.png',
  rd: 'assets/images/site-search/tile-rd.png',
  wb: 'assets/images/site-search/tile-wb.png',
  xhs: 'assets/images/site-search/tile-xhs.png',
  dy: 'assets/images/site-search/tile-dy.png',
  jd: 'assets/images/site-search/tile-jd.png',
  wk: 'assets/images/site-search/tile-wk.png',
  zw: 'assets/images/site-search/tile-zw.png',
  lm: 'assets/images/site-search/tile-lm.png'
});
// Shortcuts supply their own themed tile. Load the original artwork without
// the background and rounded mask baked into the search-provider tiles.
const SHORTCUT_PINNED_ICON_ASSETS: Readonly<Record<string, string>> = Object.freeze({
  yt: 'assets/images/site-search/glyph-yt.svg',
  bb: 'assets/images/site-search/glyph-bb.svg',
  gh: 'assets/images/site-search/glyph-gh.svg',
  sf: 'assets/images/site-search/glyph-sf.svg',
  mdn: 'assets/images/site-search/glyph-mdn.svg',
  npm: 'assets/images/site-search/glyph-npm.svg',
  hf: 'assets/images/site-search/glyph-hf.png',
  gs: 'assets/images/site-search/glyph-gs.png',
  ss: 'assets/images/site-search/glyph-ss.svg',
  maps: 'assets/images/site-search/glyph-maps.png',
  gpt: 'assets/images/site-search/glyph-gpt.svg',
  gm: 'assets/images/site-search/glyph-gm.svg',
  dbai: 'assets/images/site-search/glyph-dbai.png',
  qw: 'assets/images/site-search/glyph-qw.png',
  yb: 'assets/images/site-search/glyph-yb.svg',
  mx: 'assets/images/site-search/glyph-mx.png',
  ds: 'assets/images/site-search/glyph-ds.svg',
  kimi: 'assets/images/site-search/glyph-kimi.svg',
  cp: 'assets/images/site-search/glyph-cp.svg',
  grok: 'assets/images/site-search/glyph-grok.svg',
  qwen: 'assets/images/site-search/glyph-qwen.svg',
  ais: 'assets/images/site-search/glyph-ais.svg',
  pplx: 'assets/images/site-search/glyph-pplx.svg',
  metaso: 'assets/images/site-search/glyph-metaso.png',
  felo: 'assets/images/site-search/glyph-felo.svg',
  bd: 'assets/images/site-search/glyph-bd.svg',
  bi: 'assets/images/site-search/glyph-bi.svg',
  gg: 'assets/images/site-search/glyph-gg.svg',
  kg: 'assets/images/site-search/glyph-kg.png',
  ddg: 'assets/images/site-search/glyph-ddg.svg',
  br: 'assets/images/site-search/glyph-br.svg',
  eco: 'assets/images/site-search/glyph-eco.svg',
  sg: 'assets/images/site-search/glyph-sg.svg',
  yh: 'assets/images/site-search/glyph-yh.svg',
  yx: 'assets/images/site-search/glyph-yx.svg',
  sm: 'assets/images/site-search/glyph-sm.png',
  zh: 'assets/images/site-search/glyph-zh.png',
  db: 'assets/images/site-search/glyph-db.svg',
  jj: 'assets/images/site-search/glyph-jj.svg',
  wx: 'assets/images/site-search/glyph-wx.svg',
  tb: 'assets/images/site-search/glyph-tb.png',
  tm: 'assets/images/site-search/glyph-tm.png',
  tw: 'assets/images/site-search/glyph-tw.svg',
  rd: 'assets/images/site-search/glyph-rd.png',
  wb: 'assets/images/site-search/glyph-wb.png',
  xhs: 'assets/images/site-search/glyph-xhs.png',
  dy: 'assets/images/site-search/glyph-dy.png',
  jd: 'assets/images/site-search/glyph-jd.png',
  wk: 'assets/images/site-search/glyph-wk.svg',
  zw: 'assets/images/site-search/glyph-zw.svg',
  lm: 'assets/images/site-search/glyph-lm.png'
});
// A provider's search often runs on its own subdomain (search.bilibili.com),
// so list the hosts people actually save as shortcuts for the same brand.
const SHORTCUT_ICON_SITE_HOSTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  yt: Object.freeze(['m.youtube.com', 'youtu.be']),
  bb: Object.freeze(['bilibili.com', 'm.bilibili.com', 'space.bilibili.com']),
  maps: Object.freeze(['maps.google.com']),
  gpt: Object.freeze(['chat.openai.com']),
  ds: Object.freeze(['deepseek.com']),
  kimi: Object.freeze(['kimi.moonshot.cn']),
  cp: Object.freeze(['copilot.microsoft.com']),
  bd: Object.freeze(['m.baidu.com']),
  bi: Object.freeze(['cn.bing.com']),
  gg: Object.freeze(['google.com.hk']),
  yh: Object.freeze(['yahoo.com']),
  yx: Object.freeze(['yandex.ru', 'ya.ru']),
  sm: Object.freeze(['sm.cn']),
  zh: Object.freeze(['zhuanlan.zhihu.com']),
  db: Object.freeze(['movie.douban.com', 'book.douban.com', 'music.douban.com']),
  tb: Object.freeze(['taobao.com']),
  tm: Object.freeze(['tmall.com']),
  tw: Object.freeze(['twitter.com']),
  rd: Object.freeze(['old.reddit.com']),
  wb: Object.freeze(['weibo.com', 'm.weibo.cn']),
  jd: Object.freeze(['jd.com']),
  wk: Object.freeze(['wikipedia.org', 'en.m.wikipedia.org']),
  zw: Object.freeze(['zh.m.wikipedia.org'])
});
// Products that share a host with another provider only own their section.
const SHORTCUT_ICON_PATH_SCOPES: Readonly<Record<string, string>> = Object.freeze({
  maps: '/maps'
});
// Shortcut artwork is a saved snapshot; deletion or a URL edit prunes it.
const CACHE_TTL_MS = 0;
const CACHE_MAX_ENTRIES = 60;
const MAX_DATA_URL_LENGTH = 384 * 1024;
const SITE_SEARCH_CACHE_OPTIONS: Readonly<IconCacheOptions> = Object.freeze({
  cacheTtlMs: 1000 * 60 * 60 * 24 * 180,
  cacheMaxEntries: 40,
  maxDataUrlLength: 192 * 1024
});
// The panel renders provider artwork at 36 CSS px. A 2x display therefore needs
// at least 72 physical pixels; 128px leaves enough headroom for scaling and zoom.
const MIN_ICON_DIMENSION = 128;
const SUPPORTED_DATA_URL_PATTERN =
  /^data:image\/(?:png|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon|jpeg|jpg|gif);base64,/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// An own value of a lookup table, so "constructor" and its kin never match.
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function getHtmlAttributeValue(tag: string | undefined, name: string): string {
  if (!tag || !name) {
    return '';
  }
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag).match(pattern);
  return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
}

function normalizePageUrl(value: unknown): string {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    parsed.hash = '';
    return parsed.href;
  } catch (_error) {
    return '';
  }
}

function getCacheKey(pageUrl: unknown): string {
  return normalizePageUrl(pageUrl);
}

function normalizeIconSourceUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (faviconUtils.isSafeVirtualFaviconRequestUrl(raw)) {
    try { return new URL(raw).href; } catch (_error) { return ''; }
  }
  return normalizePageUrl(raw);
}

function getCachedIconSource(entry: Partial<CachedIcon> | null | undefined): CachedIconSource {
  const sourceUrl = String(entry && entry.sourceUrl || '');
  if (faviconUtils.isFaviconIsUrl(sourceUrl)) return 'favicon-is';
  return !faviconUtils.isSafeVirtualFaviconRequestUrl(sourceUrl) && faviconUtils.isFaviconProxyUrl(sourceUrl)
    ? 'service' : 'cache';
}

function isCachedIconForPage(entry: Partial<CachedIcon> | null | undefined, pageUrl: unknown): boolean {
  const page = normalizePageUrl(pageUrl);
  if (!entry || !page) return false;
  const parsedPage = new URL(page);
  const isOriginPage = parsedPage.pathname === '/' && !parsedPage.search;
  const sourceUrl = normalizeIconSourceUrl(entry.sourceUrl);
  // Older Chrome snapshots lost their source URL. Reacquire path-specific
  // entries once, since their page-to-icon mapping cannot be verified.
  if (!sourceUrl) return isOriginPage;
  // The chrome://favicon2 local-storage branch ignores fallbackToHost=0.
  if (faviconUtils.isChromeMonogramFaviconUrl(sourceUrl)) return false;
  if (faviconUtils.isFaviconProxyUrl(sourceUrl) || faviconUtils.isSafeVirtualFaviconRequestUrl(sourceUrl)) {
    const target = normalizePageUrl(faviconUtils.getPageUrlFromFaviconProxyUrl(sourceUrl));
    if (target && faviconUtils.isFaviconIsUrl(sourceUrl)) {
      return new URL(target).hostname === parsedPage.hostname;
    }
    if (!target || target !== page) return false;
    if (faviconUtils.isSafeVirtualFaviconRequestUrl(sourceUrl)) {
      return new URL(sourceUrl).searchParams.get('fallbackToHost') === '0';
    }
  }
  return true;
}

function getSiteSearchProviderPageUrl(provider: IconProvider | null | undefined): string {
  const template = provider && provider.template ? String(provider.template).trim() : '';
  if (!template) {
    return '';
  }
  try {
    const parsed = new URL(template.replace(/\{query\}/g, 'test'));
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return `${parsed.origin}/`;
  } catch (_error) {
    return '';
  }
}

function getSiteSearchProviderExplicitIcon(provider: IconProvider | null | undefined): string {
  return String(provider && (provider.icon || provider.iconUrl) || '').trim();
}

function getProviderAssetKey(provider: IconProvider | null | undefined): string {
  return String(provider && (provider.builtinKey || provider.key) || '').trim().toLowerCase();
}

function getSiteSearchPinnedIconAssetPath(provider: IconProvider | null | undefined): string {
  return lookup(SITE_SEARCH_PINNED_ICON_ASSETS, getProviderAssetKey(provider)) || '';
}

function getSiteSearchIconAssetPath(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    return new URL(raw, 'https://lumno.invalid/').pathname.replace(/^\/+/, '');
  } catch (_error) {
    return raw.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  }
}

function isSiteSearchPinnedIconAssetUrl(value: unknown): boolean {
  const assetPath = getSiteSearchIconAssetPath(value);
  return Boolean(
    assetPath && Object.values(SITE_SEARCH_PINNED_ICON_ASSETS).includes(assetPath)
  );
}

function shouldHydrateSiteSearchProviderIcon(value: unknown): boolean {
  const iconUrl = String(value || '').trim();
  return Boolean(
    iconUrl &&
    !iconUrl.startsWith('data:') &&
    !isSiteSearchPinnedIconAssetUrl(iconUrl)
  );
}

// Swaps a provider icon for its saved image once that is available; bundled
// artwork and data URLs are shown as they are.
function createSiteSearchProviderIconHydrator<I, H>(
  attachFaviconData: ((icon: I, iconUrl: string, iconHost: H) => void) | null | undefined
): (icon: I, iconUrl: unknown, iconHost: H) => boolean {
  const attach = typeof attachFaviconData === 'function' ? attachFaviconData : null;
  return function hydrateSiteSearchProviderIcon(icon: I, iconUrl: unknown, iconHost: H): boolean {
    const resolvedIconUrl = String(iconUrl || '').trim();
    if (!attach || !shouldHydrateSiteSearchProviderIcon(resolvedIconUrl)) {
      return false;
    }
    attach(icon, resolvedIconUrl, iconHost);
    return true;
  };
}

function getPinnedSiteSearchProviderIcon(provider: IconProvider | null | undefined): string {
  const explicitIcon = getSiteSearchProviderExplicitIcon(provider);
  if (!explicitIcon) {
    return '';
  }
  const providerKey = String(provider && provider.key || '').trim().toLowerCase();
  return providerKey === 'gg' && explicitIcon === GOOGLE_BRAND_ICON_URL
    ? explicitIcon
    : '';
}

function getSiteSearchProviderIcon(
  cacheMap: unknown,
  provider: IconProvider | null | undefined,
  nowValue?: unknown,
  options?: SiteSearchIconOptions | null
): string {
  const pinnedAssetPath = getSiteSearchPinnedIconAssetPath(provider);
  const resolveAssetUrl = options && typeof options.resolveAssetUrl === 'function'
    ? options.resolveAssetUrl
    : null;
  if (pinnedAssetPath && resolveAssetUrl) {
    const assetUrl = String(resolveAssetUrl(pinnedAssetPath) || '').trim();
    if (assetUrl) {
      return assetUrl;
    }
  }
  const pageUrl = getSiteSearchProviderPageUrl(provider);
  const cacheKey = getCacheKey(pageUrl);
  const normalizedCache = normalizeCacheMap(cacheMap, nowValue, options);
  const cachedEntry = cacheKey ? lookup(normalizedCache, cacheKey) : undefined;
  const pinnedIcon = getPinnedSiteSearchProviderIcon(provider);
  if (cachedEntry && cachedEntry.dataUrl) {
    const cachedSource = normalizePageUrl(cachedEntry.sourceUrl);
    const pinnedSource = normalizePageUrl(pinnedIcon);
    if (!pinnedSource || cachedSource === pinnedSource) {
      return cachedEntry.dataUrl;
    }
  }
  return pinnedIcon || getSiteSearchProviderExplicitIcon(provider);
}

function getHttpHost(url: unknown): string {
  try {
    const parsed = new URL(String(url || ''));
    return /^https?:$/.test(parsed.protocol)
      ? parsed.hostname.toLowerCase().replace(/^www\./, '') : '';
  } catch (_error) {
    return '';
  }
}

// The bundled artwork for a shortcut to a site a provider stands for, or ''.
function getBundledShortcutIconAssetPath(pageUrl: unknown, providers: readonly IconProvider[] | null | undefined): string {
  const host = getHttpHost(pageUrl);
  if (!host) {
    return '';
  }
  const pathname = new URL(String(pageUrl)).pathname;
  const matchesSearchHost = (item: IconProvider): boolean => {
    const scope = lookup(SHORTCUT_ICON_PATH_SCOPES, getProviderAssetKey(item));
    return getHttpHost(getSiteSearchProviderPageUrl(item)) === host &&
      (!scope || pathname === scope || pathname.startsWith(`${scope}/`));
  };
  const candidates = (Array.isArray(providers) ? providers : []).filter((item) => (
    getSiteSearchPinnedIconAssetPath(item) &&
    (matchesSearchHost(item) || (lookup(SHORTCUT_ICON_SITE_HOSTS, getProviderAssetKey(item)) || []).includes(host))
  ));
  // A path-scoped product (Google Maps) wins inside its section; elsewhere
  // on a shared host the site's own artwork applies.
  const provider = candidates.find((item) => lookup(SHORTCUT_ICON_PATH_SCOPES, getProviderAssetKey(item))) || candidates[0];
  return lookup(SHORTCUT_PINNED_ICON_ASSETS, getProviderAssetKey(provider)) || '';
}

function normalizeCacheOptions(options: unknown): Readonly<IconCacheOptions> {
  const settings = isRecord(options) ? options : {};
  const ttl = Number(settings.cacheTtlMs);
  const maxEntries = Number(settings.cacheMaxEntries);
  const maxLength = Number(settings.maxDataUrlLength);
  return Object.freeze({
    cacheTtlMs: Number.isFinite(ttl) && ttl >= 0 ? ttl : CACHE_TTL_MS,
    cacheMaxEntries: Number.isFinite(maxEntries) && maxEntries > 0 ? Math.floor(maxEntries) : CACHE_MAX_ENTRIES,
    maxDataUrlLength: Number.isFinite(maxLength) && maxLength > 0 ? Math.floor(maxLength) : MAX_DATA_URL_LENGTH
  });
}

function normalizeDataUrl(value: unknown, options?: unknown): string {
  const cacheOptions = normalizeCacheOptions(options);
  const dataUrl = String(value || '').trim();
  if (!SUPPORTED_DATA_URL_PATTERN.test(dataUrl) || dataUrl.length > cacheOptions.maxDataUrlLength) {
    return '';
  }
  return dataUrl;
}

// The largest square size in a sizes attribute ("16x16 32x32"); Infinity
// for "any".
function getLargestDeclaredSize(value: unknown): number {
  const sizes = String(value || '').trim().toLowerCase();
  if (!sizes) {
    return 0;
  }
  if (sizes.split(/\s+/).includes('any')) {
    return Number.POSITIVE_INFINITY;
  }
  const dimensions: string[] = sizes.match(/(\d+)\s*x\s*(\d+)/g) || [];
  return dimensions.reduce((largest: number, dimension) => {
    const parts = dimension.split('x').map((part) => Number(part));
    return Math.max(largest, Math.min(parts[0] || 0, parts[1] || 0));
  }, 0);
}

function getThemeScore(url: string, media: string, preferredTheme: unknown): number {
  const theme = String(preferredTheme || '').trim().toLowerCase();
  if (theme !== 'dark' && theme !== 'light') {
    return 0;
  }
  const haystack = `${String(url || '').toLowerCase()} ${String(media || '').toLowerCase()}`;
  const opposite = theme === 'dark' ? 'light' : 'dark';
  let score = 0;
  if (haystack.includes(theme)) {
    score += 80;
  }
  if (haystack.includes(opposite)) {
    score -= 120;
  }
  return score;
}

function scoreIconCandidate(candidate: Omit<IconCandidate, 'score'>): number {
  const declaredSize = Number(candidate.declaredSize || 0);
  let score = 0;
  if (candidate.vector) {
    score += 1200;
  } else if (declaredSize >= 256) {
    score += 1000;
  } else if (declaredSize >= 180) {
    score += 940;
  } else if (declaredSize >= 128) {
    score += 900;
  } else if (declaredSize >= 96) {
    score += 800;
  } else if (declaredSize >= 64) {
    score += 700;
  } else if (declaredSize >= 48) {
    score += 400;
  } else if (declaredSize > 0) {
    score += 100;
  } else {
    score += 520;
  }
  if (candidate.source === 'manifest') {
    score += 60;
  }
  if (candidate.source === 'apple-touch-icon') {
    score += 50;
  }
  if (candidate.purpose === 'any') {
    score += 20;
  }
  score += Number(candidate.themeScore || 0);
  return score;
}

function createCandidate(url: string, options?: IconCandidateOptions): IconCandidate | null {
  const normalizedUrl = normalizePageUrl(url);
  if (!normalizedUrl) {
    return null;
  }
  const settings = options || {};
  const candidate = {
    url: normalizedUrl,
    source: settings.source || 'icon',
    declaredSize: Number(settings.declaredSize || 0),
    vector: settings.vector === true,
    purpose: String(settings.purpose || ''),
    themeScore: Number(settings.themeScore || 0)
  };
  return { ...candidate, score: scoreIconCandidate(candidate) };
}

// The page URL relative links resolve against: its <base href>, or itself.
function getHtmlBaseUrl(html: string, pageUrl: string): string {
  const baseTag = (html.match(/<base\b[^>]*>/i) || [])[0];
  const baseHref = getHtmlAttributeValue(baseTag, 'href');
  if (!baseHref) {
    return pageUrl;
  }
  try {
    return new URL(baseHref, pageUrl).href;
  } catch (_error) {
    return pageUrl;
  }
}

function parseHtmlIconCandidates(html: unknown, pageUrl: unknown, preferredTheme?: unknown): IconCandidate[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!html || !normalizedPageUrl) {
    return [];
  }
  const text = String(html);
  const baseUrl = getHtmlBaseUrl(text, normalizedPageUrl);
  const candidates: IconCandidate[] = [];
  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const href = getHtmlAttributeValue(tag, 'href');
    if (!href || (!rel.includes('icon') && !rel.includes('apple-touch-icon'))) {
      continue;
    }
    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(href, baseUrl).href;
    } catch (_error) {
      continue;
    }
    const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
    const media = getHtmlAttributeValue(tag, 'media');
    const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
    const candidate = createCandidate(resolvedUrl, {
      source: rel.includes('apple-touch-icon') ? 'apple-touch-icon' : 'icon',
      declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(getHtmlAttributeValue(tag, 'sizes')),
      vector,
      themeScore: getThemeScore(resolvedUrl, media, preferredTheme)
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return mergeCandidates(candidates);
}

function parseHtmlManifestUrls(html: unknown, pageUrl: unknown): string[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!html || !normalizedPageUrl) {
    return [];
  }
  const text = String(html);
  const baseUrl = getHtmlBaseUrl(text, normalizedPageUrl);
  const seen = new Set<string>();
  return (text.match(/<link\b[^>]*>/gi) || []).flatMap((tag) => {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const href = getHtmlAttributeValue(tag, 'href');
    if (!rel.split(/\s+/).includes('manifest') || !href) {
      return [];
    }
    try {
      const url = new URL(href, baseUrl).href;
      if (!normalizePageUrl(url) || seen.has(url)) {
        return [];
      }
      seen.add(url);
      return [url];
    } catch (_error) {
      return [];
    }
  });
}

function parseManifestIconCandidates(manifest: unknown, manifestUrl: unknown): IconCandidate[] {
  const source = isRecord(manifest) ? manifest : {};
  const icons: unknown[] = Array.isArray(source.icons) ? source.icons : [];
  return mergeCandidates(icons.flatMap((value) => {
    const icon = isRecord(value) ? value : {};
    const src = String(icon.src || '').trim();
    if (!src) {
      return [];
    }
    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(src, String(manifestUrl)).href;
    } catch (_error) {
      return [];
    }
    const type = String(icon.type || '').toLowerCase();
    const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
    const purposeTokens = String(icon.purpose || 'any').toLowerCase().split(/\s+/);
    const candidate = createCandidate(resolvedUrl, {
      source: 'manifest',
      declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(icon.sizes),
      vector,
      purpose: purposeTokens.includes('any') ? 'any' : (purposeTokens[0] || '')
    });
    return candidate ? [candidate] : [];
  }));
}

// The addresses sites conventionally serve icons at.
function getRootIconCandidates(pageUrl: unknown): IconCandidate[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!normalizedPageUrl) {
    return [];
  }
  const origin = new URL(normalizedPageUrl).origin;
  return [
    createCandidate(`${origin}/favicon.svg`, {
      source: 'root-svg',
      declaredSize: Number.POSITIVE_INFINITY,
      vector: true
    }),
    createCandidate(`${origin}/apple-touch-icon.png`, {
      source: 'apple-touch-icon',
      declaredSize: 180
    }),
    createCandidate(`${origin}/favicon-192.png`, {
      source: 'root',
      declaredSize: 192
    }),
    createCandidate(`${origin}/favicon.png`, { source: 'root' }),
    createCandidate(`${origin}/favicon.ico`, { source: 'root' })
  ].filter((candidate): candidate is IconCandidate => candidate !== null);
}

// One candidate per URL, the best scored, best first.
function mergeCandidates(candidates: ReadonlyArray<IconCandidate | null | undefined> | null | undefined): IconCandidate[] {
  const byUrl = new Map<string, IconCandidate>();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || !candidate.url) {
      continue;
    }
    const current = byUrl.get(candidate.url);
    if (!current || Number(candidate.score || 0) > Number(current.score || 0)) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return Array.from(byUrl.values()).sort((left, right) =>
    Number(right.score || 0) - Number(left.score || 0));
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] || 0) * 0x1000000) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  ) >>> 0;
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] || 0) |
    ((bytes[offset + 1] || 0) << 8) |
    ((bytes[offset + 2] || 0) << 16);
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function getPngDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return null;
  }
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20)
  };
}

function getGifDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 10 || bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
    return null;
  }
  return {
    width: (bytes[6] || 0) | ((bytes[7] || 0) << 8),
    height: (bytes[8] || 0) | ((bytes[9] || 0) << 8)
  };
}

// The largest image in an .ico directory.
function getIcoDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 22 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 1 || bytes[3] !== 0) {
    return null;
  }
  const count = Math.min(((bytes[4] || 0) | ((bytes[5] || 0) << 8)), 64);
  let width = 0;
  let height = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + (index * 16);
    if (offset + 15 >= bytes.length) {
      break;
    }
    width = Math.max(width, bytes[offset] || 256);
    height = Math.max(height, bytes[offset + 1] || 256);
  }
  return width && height ? { width, height } : null;
}

function getJpegDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = readUint16BigEndian(bytes, offset + 2);
    if (length < 2) {
      break;
    }
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        width: readUint16BigEndian(bytes, offset + 7),
        height: readUint16BigEndian(bytes, offset + 5)
      };
    }
    offset += length + 2;
  }
  return null;
}

function getWebpDimensions(bytes: Uint8Array): IconDimensions | null {
  if (bytes.length < 30 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = readAscii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1
    };
  }
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = (bytes[21] || 0) | ((bytes[22] || 0) << 8) |
      ((bytes[23] || 0) << 16) | ((bytes[24] || 0) << 24);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1
    };
  }
  if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d &&
      bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: ((bytes[26] || 0) | ((bytes[27] || 0) << 8)) & 0x3fff,
      height: ((bytes[28] || 0) | ((bytes[29] || 0) << 8)) & 0x3fff
    };
  }
  return null;
}

function isAvifResource(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || readAscii(bytes, 4, 8) !== 'ftyp') {
    return false;
  }
  const brands = readAscii(bytes, 8, Math.min(bytes.length, 32));
  return brands.includes('avif') || brands.includes('avis');
}

// What a downloaded icon is and whether it is large enough. AVIF headers
// carry no simple size, so the size the page declared stands in for it.
function inspectIconResource(
  arrayBuffer: ArrayBuffer | null | undefined,
  mimeType: unknown,
  _url: unknown,
  candidate?: Partial<Pick<IconCandidate, 'declaredSize'>> | null,
  options?: IconInspectOptions | null
): IconResourceInfo {
  const bytes = new Uint8Array(arrayBuffer || new ArrayBuffer(0));
  const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
  let leadingText = '';
  if (bytes.length > 0) {
    try {
      leadingText = new TextDecoder().decode(bytes.slice(0, 512)).trim().toLowerCase();
    } catch (_error) {
      leadingText = '';
    }
  }
  if (/<svg(?:\s|>)/i.test(leadingText)) {
    return {
      usable: true,
      vector: true,
      width: 0,
      height: 0,
      mimeType: 'image/svg+xml'
    };
  }
  const detectedResources = [
    { dimensions: getPngDimensions(bytes), mimeType: 'image/png' },
    { dimensions: getGifDimensions(bytes), mimeType: 'image/gif' },
    { dimensions: getIcoDimensions(bytes), mimeType: 'image/x-icon' },
    { dimensions: getJpegDimensions(bytes), mimeType: 'image/jpeg' },
    { dimensions: getWebpDimensions(bytes), mimeType: 'image/webp' }
  ];
  const detected = detectedResources.find((item) => item.dimensions);
  const detectedDimensions = detected ? detected.dimensions : null;
  const avif = isAvifResource(bytes);
  const declaredSize = Number(candidate && candidate.declaredSize || 0);
  const effectiveWidth = detectedDimensions ? detectedDimensions.width : (avif ? declaredSize : 0);
  const effectiveHeight = detectedDimensions ? detectedDimensions.height : (avif ? declaredSize : 0);
  const requestedMinimum = Number(options && options.minDimension);
  const minDimension = Number.isFinite(requestedMinimum)
    ? Math.max(16, Math.min(MIN_ICON_DIMENSION, requestedMinimum))
    : MIN_ICON_DIMENSION;
  const usable = Number.isFinite(effectiveWidth) && Number.isFinite(effectiveHeight) &&
    Math.max(effectiveWidth, effectiveHeight) >= minDimension &&
    Math.min(effectiveWidth, effectiveHeight) >= Math.max(16, Math.floor(minDimension / 2));
  const resolvedMimeType = detected
    ? detected.mimeType
    : (avif ? 'image/avif' : (type.startsWith('image/') ? type : 'image/png'));
  return {
    usable,
    vector: false,
    width: Number(effectiveWidth || 0),
    height: Number(effectiveHeight || 0),
    mimeType: resolvedMimeType
  };
}

// The valid, unexpired icons of a stored map, the newest `cacheMaxEntries`.
function normalizeCacheMap(value: unknown, nowValue?: unknown, options?: unknown): CachedIconMap {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const cacheOptions = normalizeCacheOptions(options);
  const source = isRecord(value) && !Array.isArray(value) ? value : {};
  const entries = Object.keys(source).flatMap((rawKey) => {
    const item = source[rawKey];
    const fields = isRecord(item) ? item : {};
    const key = getCacheKey(rawKey);
    const dataUrl = normalizeDataUrl(fields.dataUrl, cacheOptions);
    const sourceUrl = normalizeIconSourceUrl(fields.sourceUrl);
    const updatedAt = Number(fields.updatedAt || 0);
    if (!key || !dataUrl || !Number.isFinite(updatedAt) || updatedAt <= 0 ||
        (cacheOptions.cacheTtlMs > 0 && now - updatedAt > cacheOptions.cacheTtlMs)) {
      return [];
    }
    return [{ key, dataUrl, sourceUrl, updatedAt }];
  }).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, cacheOptions.cacheMaxEntries);
  const result: CachedIconMap = {};
  for (const entry of entries) {
    result[entry.key] = {
      dataUrl: entry.dataUrl,
      sourceUrl: entry.sourceUrl,
      updatedAt: entry.updatedAt
    };
  }
  return result;
}

function setCachedIcon(
  cacheMap: unknown,
  pageUrl: unknown,
  dataUrl: unknown,
  sourceUrl: unknown,
  nowValue?: unknown,
  options?: unknown
): CachedIconMap {
  const key = getCacheKey(pageUrl);
  const iconDataUrl = normalizeDataUrl(dataUrl, options);
  if (!key || !iconDataUrl) {
    return normalizeCacheMap(cacheMap, nowValue, options);
  }
  return normalizeCacheMap({
    ...(isRecord(cacheMap) ? cacheMap : {}),
    [key]: {
      dataUrl: iconDataUrl,
      sourceUrl: normalizeIconSourceUrl(sourceUrl),
      updatedAt: Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now()
    }
  }, nowValue, options);
}

// Only the icons of these pages; the rest belong to removed shortcuts.
function retainCachedIcons(cacheMap: unknown, pageUrls: unknown, nowValue?: unknown, options?: unknown): CachedIconMap {
  const urls: unknown[] = Array.isArray(pageUrls) ? pageUrls : [];
  const allowed = new Set(urls.map(getCacheKey).filter(Boolean));
  const normalized = normalizeCacheMap(cacheMap, nowValue, options);
  const result: CachedIconMap = {};
  for (const [key, entry] of Object.entries(normalized)) {
    if (allowed.has(key)) {
      result[key] = entry;
    }
  }
  return result;
}

function getCachedIconDataUrl(cacheMap: unknown, pageUrl: unknown, nowValue?: unknown, options?: unknown): string {
  const normalized = normalizeCacheMap(cacheMap, nowValue, options);
  const entry = lookup(normalized, getCacheKey(pageUrl));
  return entry && isCachedIconForPage(entry, pageUrl) ? entry.dataUrl : '';
}

export {
  DEFAULT_STORAGE_KEY,
  SITE_SEARCH_STORAGE_KEY,
  GOOGLE_BRAND_ICON_URL,
  SITE_SEARCH_PINNED_ICON_ASSETS,
  SHORTCUT_PINNED_ICON_ASSETS,
  CACHE_TTL_MS,
  CACHE_MAX_ENTRIES,
  MAX_DATA_URL_LENGTH,
  SITE_SEARCH_CACHE_OPTIONS,
  MIN_ICON_DIMENSION,
  getCacheKey,
  getCachedIconSource,
  isCachedIconForPage,
  getSiteSearchProviderPageUrl,
  getSiteSearchProviderExplicitIcon,
  getSiteSearchPinnedIconAssetPath,
  isSiteSearchPinnedIconAssetUrl,
  shouldHydrateSiteSearchProviderIcon,
  createSiteSearchProviderIconHydrator,
  getPinnedSiteSearchProviderIcon,
  getSiteSearchProviderIcon,
  getBundledShortcutIconAssetPath,
  normalizePageUrl,
  normalizeCacheOptions,
  normalizeDataUrl,
  getLargestDeclaredSize,
  parseHtmlIconCandidates,
  parseHtmlManifestUrls,
  parseManifestIconCandidates,
  getRootIconCandidates,
  mergeCandidates,
  inspectIconResource,
  normalizeCacheMap,
  setCachedIcon,
  retainCachedIcons,
  getCachedIconDataUrl
};
export type {
  CachedIcon,
  CachedIconMap,
  CachedIconSource,
  IconCacheOptions,
  IconCandidate,
  IconCandidateSource,
  IconDimensions,
  IconInspectOptions,
  IconProvider,
  IconResourceInfo,
  SiteSearchIconOptions
};
