// Links to Lumno's website, help center, store listings and community,
// with the fallbacks used until the website's current list arrives
// (platform/community-links.ts loads it).

// The help center's languages.
type WebLocale = 'zh-CN' | 'zh-TW' | 'ja' | 'en';

// Where community support lives: the WeChat group or the author on X.
type CommunityChannel = 'wechat' | 'x';

type CommunityByLocale = Record<WebLocale, CommunityChannel>;

interface CommunityLinks {
  x: string;
  githubIssue: string;
  licenses: string;
  chromeReview: string;
  edgeReview: string;
  firefoxReview: string;
  wechatQr: string;
  communityByLocale: CommunityByLocale;
}

type StoreId = 'chrome' | 'edge' | 'firefox';

interface StoreListing {
  id: StoreId;
  name: string;
  host: string;
  url: string;
}

const WEB_ORIGIN = 'https://lumno.kubai.design';
const COMMUNITY_LINKS_URL = `${WEB_ORIGIN}/community-links.json`;
const FETCH_TIMEOUT_MS = 2500;
// Help center paths per UI locale: Simplified Chinese is the site's root language.
const HELP_LOCALE_PREFIXES: Readonly<Record<WebLocale, string>> = Object.freeze({
  'zh-CN': '',
  'zh-TW': '/zh-tw',
  ja: '/ja',
  en: '/en'
});
const HELP_DEFAULT_SLUG = 'what-is-lumno';
// Edge Add-ons assigns its own extension ID; every other install (Chrome Web
// Store, including Edge users who installed from it, and keyed dev builds)
// runs under the Chrome Web Store ID.
const EDGE_ADDONS_EXTENSION_ID = 'pfbklkaefmfamjpibfiapaiihlddhchc';
// Firefox and its forks (Zen, LibreWolf, Floorp) install from Firefox Add-ons.
const FIREFOX_ADDONS_URL = 'https://addons.mozilla.org/firefox/addon/lumno-command-bar-new-tab/';
const STORE_LISTINGS: Readonly<Record<StoreId, Readonly<StoreListing>>> = Object.freeze({
  chrome: Object.freeze({
    id: 'chrome',
    name: 'Chrome Web Store',
    host: 'chromewebstore.google.com',
    url: 'https://chromewebstore.google.com/detail/lumno-%E8%81%9A%E7%84%A6%E6%90%9C%E7%B4%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/nggfkkbmogmadfoikakkfegkoilfcfao?utm_source=item-share-cb'
  }),
  edge: Object.freeze({
    id: 'edge',
    name: 'Microsoft Edge Add-ons',
    host: 'microsoftedge.microsoft.com',
    url: `https://microsoftedge.microsoft.com/addons/detail/${EDGE_ADDONS_EXTENSION_ID}`
  }),
  firefox: Object.freeze({
    id: 'firefox',
    name: 'Firefox Add-ons',
    host: 'addons.mozilla.org',
    url: FIREFOX_ADDONS_URL
  })
});
const FALLBACK_LINKS: Readonly<CommunityLinks> = Object.freeze({
  x: 'https://x.com/kubai087',
  githubIssue: 'https://github.com/kubai087/lumno-extension/issues/new',
  licenses: 'https://github.com/kubai087/lumno-extension/blob/main/THIRD_PARTY_NOTICES.md',
  chromeReview: 'https://chromewebstore.google.com/detail/lumno-%E8%81%9A%E7%84%A6%E6%90%9C%E7%B4%A2%E6%96%B0%E6%A0%87%E7%AD%BE%E9%A1%B5/nggfkkbmogmadfoikakkfegkoilfcfao/reviews?utm_source=item-share-cb',
  edgeReview: STORE_LISTINGS.edge.url,
  firefoxReview: `${FIREFOX_ADDONS_URL}reviews/`,
  wechatQr: `${WEB_ORIGIN}/qrcode-20260730.webp`,
  communityByLocale: Object.freeze({
    'zh-CN': 'wechat',
    'zh-TW': 'wechat',
    ja: 'x',
    en: 'x'
  })
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeHttpsUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch (_error) {
    return '';
  }
}

// Discord is retired: the website's older payload still says "discord" for
// non-Chinese locales, which now means the author on X.
function normalizeCommunityChannel(value: unknown, fallback: CommunityChannel): CommunityChannel {
  if (value === 'wechat') {
    return 'wechat';
  }
  return value === 'x' || value === 'discord' ? 'x' : fallback;
}

function normalizeCommunityMap(value: unknown): CommunityByLocale {
  const fallbackMap = FALLBACK_LINKS.communityByLocale;
  const source = isRecord(value) ? value : {};
  return {
    'zh-CN': normalizeCommunityChannel(
      source['zh-CN'] || source.zh_CN,
      fallbackMap['zh-CN']
    ),
    'zh-TW': normalizeCommunityChannel(
      source['zh-TW'] || source.zh_TW,
      fallbackMap['zh-TW']
    ),
    ja: normalizeCommunityChannel(source.ja, fallbackMap.ja),
    en: normalizeCommunityChannel(source.en, fallbackMap.en)
  };
}

// The website's community-links.json, with every link it lacks or gets
// wrong taken from the fallbacks.
function normalizeLinksPayload(payload: unknown): CommunityLinks {
  const source = isRecord(payload) ? payload : {};
  const links = isRecord(source.links) ? source.links : source;
  return {
    x: normalizeHttpsUrl(links.x) || FALLBACK_LINKS.x,
    githubIssue: normalizeHttpsUrl(
      links.githubIssue || links.github_issue || links.issue
    ) || FALLBACK_LINKS.githubIssue,
    licenses: normalizeHttpsUrl(links.licenses) || FALLBACK_LINKS.licenses,
    chromeReview: normalizeHttpsUrl(
      links.chromeReview ||
      links.chrome_review ||
      links.chromeWebStoreReview ||
      links.chrome_web_store_review ||
      links.chromeRating ||
      links.chrome_rating
    ) || FALLBACK_LINKS.chromeReview,
    edgeReview: normalizeHttpsUrl(
      links.edgeReview ||
      links.edge_review ||
      links.edgeAddonsReview ||
      links.edge_addons_review
    ) || FALLBACK_LINKS.edgeReview,
    firefoxReview: normalizeHttpsUrl(
      links.firefoxReview ||
      links.firefox_review ||
      links.firefoxAddonsReview ||
      links.firefox_addons_review
    ) || FALLBACK_LINKS.firefoxReview,
    wechatQr: normalizeHttpsUrl(links.wechatQr || links.wechat_qr) ||
      FALLBACK_LINKS.wechatQr,
    communityByLocale: normalizeCommunityMap(
      source.communityByLocale || source.community_by_locale
    )
  };
}

function normalizeWebLocale(locale: unknown): WebLocale {
  const normalized = String(locale || '')
    .trim()
    .replace(/_/g, '-')
    .toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-')) {
    return normalized.startsWith('zh-hant') ||
      /^zh-(tw|hk|mo)(-|$)/.test(normalized)
      ? 'zh-TW'
      : 'zh-CN';
  }
  if (normalized === 'ja' || normalized.startsWith('ja-')) {
    return 'ja';
  }
  return 'en';
}

function getCommunityChannel(links: Partial<CommunityLinks> | null | undefined, locale: unknown): CommunityChannel {
  const webLocale = normalizeWebLocale(locale);
  // Chinese community support lives in WeChat. Keep this product policy
  // local so a stale remote map cannot send zh-CN or zh-TW users elsewhere.
  if (webLocale === 'zh-CN' || webLocale === 'zh-TW') {
    return 'wechat';
  }
  const source = links && typeof links === 'object' ? links : FALLBACK_LINKS;
  const communityMap: Partial<CommunityByLocale> = source.communityByLocale &&
      typeof source.communityByLocale === 'object'
    ? source.communityByLocale
    : FALLBACK_LINKS.communityByLocale;
  return normalizeCommunityChannel(
    communityMap[webLocale],
    FALLBACK_LINKS.communityByLocale[webLocale]
  );
}

function getCommunityUrl(links: Partial<CommunityLinks> | null | undefined, locale: unknown): string {
  const source = links && typeof links === 'object' ? links : FALLBACK_LINKS;
  return getCommunityChannel(source, locale) === 'wechat'
    ? (source.wechatQr || FALLBACK_LINKS.wechatQr)
    : (source.x || FALLBACK_LINKS.x);
}

function getHelpUrl(locale: unknown, slug?: unknown, anchor?: unknown): string {
  const page = String(slug || '').trim().replace(/^\/+|\/+$/g, '') || HELP_DEFAULT_SLUG;
  const section = String(anchor || '').trim().replace(/^#/, '');
  return `${WEB_ORIGIN}${HELP_LOCALE_PREFIXES[normalizeWebLocale(locale)]}/help/${page}/${section ? `#${section}` : ''}`;
}

// The index behind the help center's search box, in the reader's language.
function getHelpSearchIndexUrl(locale: unknown): string {
  return `${WEB_ORIGIN}${HELP_LOCALE_PREFIXES[normalizeWebLocale(locale)]}/help/search-index.json`;
}

// Words the help center treats as the same thing, in the reader's language.
function getHelpSearchSynonymsUrl(locale: unknown): string {
  return `${WEB_ORIGIN}${HELP_LOCALE_PREFIXES[normalizeWebLocale(locale)]}/help/search-synonyms.json`;
}

function isEdgeAddonsInstall(extensionId: string): boolean {
  return extensionId === EDGE_ADDONS_EXTENSION_ID;
}

// Gecko add-on IDs are email-like or a braced GUID; Chromium IDs are 32 letters.
function isFirefoxInstall(extensionId: string): boolean {
  return extensionId.includes('@') || /^\{[0-9a-f-]+\}$/i.test(extensionId);
}

// The review page of the store this install came from.
function getReviewUrl(links: Partial<CommunityLinks> | null | undefined, extensionId: string): string {
  const source = links && typeof links === 'object' ? links : FALLBACK_LINKS;
  if (isFirefoxInstall(extensionId)) {
    return source.firefoxReview || FALLBACK_LINKS.firefoxReview;
  }
  return isEdgeAddonsInstall(extensionId)
    ? (source.edgeReview || FALLBACK_LINKS.edgeReview)
    : (source.chromeReview || FALLBACK_LINKS.chromeReview);
}

function getStoreListing(extensionId: string): Readonly<StoreListing> {
  if (isFirefoxInstall(extensionId)) {
    return STORE_LISTINGS.firefox;
  }
  return isEdgeAddonsInstall(extensionId) ? STORE_LISTINGS.edge : STORE_LISTINGS.chrome;
}

// The QR image URL with a parameter that keeps caches from serving an old code.
function buildFreshQrUrl(value: unknown, timestamp?: unknown): string {
  const safeUrl = normalizeHttpsUrl(value);
  if (!safeUrl) {
    return '';
  }
  const url = new URL(safeUrl);
  url.searchParams.set(
    '_lumno_refresh',
    String(Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now())
  );
  return url.toString();
}

export {
  COMMUNITY_LINKS_URL,
  EDGE_ADDONS_EXTENSION_ID,
  FALLBACK_LINKS,
  FETCH_TIMEOUT_MS,
  FIREFOX_ADDONS_URL,
  STORE_LISTINGS,
  WEB_ORIGIN,
  buildFreshQrUrl,
  getCommunityChannel,
  getCommunityUrl,
  getHelpSearchIndexUrl,
  getHelpSearchSynonymsUrl,
  getHelpUrl,
  getReviewUrl,
  getStoreListing,
  isEdgeAddonsInstall,
  isFirefoxInstall,
  normalizeHttpsUrl,
  normalizeLinksPayload,
  normalizeWebLocale
};
export type { CommunityByLocale, CommunityChannel, CommunityLinks, StoreId, StoreListing, WebLocale };
