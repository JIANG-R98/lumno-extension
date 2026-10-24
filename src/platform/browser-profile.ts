type BrowserInternalScheme = 'about:' | 'edge://' | 'brave://' | 'vivaldi://' | 'opera://' | 'chrome://';
type BrowserFamily = 'firefox' | 'chromium';

// navigator, or the parts of it the profile reads.
interface NavigatorLike {
  userAgent?: string;
  userAgentData?: { brands?: Array<{ brand?: string } | null> } | null;
}

interface BrowserInternalProfile {
  scheme: BrowserInternalScheme;
  name: string;
}

interface RuntimeUrlApi {
  runtime?: { getURL?: (path: string) => string };
}

function getBrowserInternalScheme(userAgent: unknown): BrowserInternalScheme {
  const ua = String(userAgent || '');
  // Firefox and its forks (Zen, LibreWolf) report Firefox/ and no Chrome/.
  if (ua.includes('Firefox/') && !ua.includes('Chrome/')) {
    return 'about:';
  }
  if (ua.includes('Edg/')) {
    return 'edge://';
  }
  if (ua.includes('Brave')) {
    return 'brave://';
  }
  if (ua.includes('Vivaldi')) {
    return 'vivaldi://';
  }
  if (ua.includes('OPR/') || ua.includes('Opera')) {
    return 'opera://';
  }
  return 'chrome://';
}

function normalizeBrandName(brand: unknown): string {
  return String(brand || '').replace(/\s+/g, ' ').trim();
}

function isGreaseBrandName(brand: string): boolean {
  const compact = normalizeBrandName(brand).toLowerCase().replace(/[^a-z]/g, '');
  return compact.includes('not') && compact.includes('brand');
}

function isChromiumEngineBrandName(brand: string): boolean {
  return normalizeBrandName(brand).toLowerCase() === 'chromium';
}

function getClientHintBrowserName(userAgentData: NavigatorLike['userAgentData']): string {
  const brands = userAgentData && Array.isArray(userAgentData.brands)
    ? userAgentData.brands
    : [];
  const names = brands
    .map((item) => normalizeBrandName(item && item.brand))
    .filter((name) => name && !isGreaseBrandName(name));
  const productName = names.find((name) => {
    const lower = name.toLowerCase();
    return !isChromiumEngineBrandName(name) &&
      lower !== 'google chrome' &&
      lower !== 'chrome';
  });
  if (productName) {
    return productName;
  }
  return names.find((name) => !isChromiumEngineBrandName(name)) ||
    names.find((name) => isChromiumEngineBrandName(name)) ||
    '';
}

function getFallbackBrowserName(scheme: BrowserInternalScheme): string {
  if (scheme === 'about:') {
    return 'Firefox';
  }
  if (scheme === 'edge://') {
    return 'Microsoft Edge';
  }
  if (scheme === 'brave://') {
    return 'Brave';
  }
  if (scheme === 'vivaldi://') {
    return 'Vivaldi';
  }
  if (scheme === 'opera://') {
    return 'Opera';
  }
  return 'Chrome';
}

// Firefox refuses to let extensions open privileged about: pages, so its
// internal-page shortcuts would only fail silently.
function canOpenBrowserPages(scheme: BrowserInternalScheme): boolean {
  return scheme !== 'about:';
}

// Takes navigator, or a user agent string on its own.
function getBrowserInternalProfile(navigatorLike?: NavigatorLike | string | null): Readonly<BrowserInternalProfile> {
  const source: NavigatorLike = typeof navigatorLike === 'object' && navigatorLike
    ? navigatorLike
    : { userAgent: typeof navigatorLike === 'string' ? navigatorLike : undefined };
  const scheme = getBrowserInternalScheme(source.userAgent);
  return Object.freeze({
    scheme,
    name: getClientHintBrowserName(source.userAgentData) ||
      getFallbackBrowserName(scheme)
  });
}

// The extension's own URL scheme is the reliable signal for code that cares
// about Firefox's extension APIs rather than the browser's branding.
function isFirefoxExtensionRuntime(chromeApi?: RuntimeUrlApi | null): boolean {
  const api: RuntimeUrlApi | null | undefined = chromeApi === undefined && typeof chrome !== 'undefined' ? chrome : chromeApi;
  try {
    return Boolean(api && api.runtime && typeof api.runtime.getURL === 'function' &&
      /^moz-extension:/i.test(api.runtime.getURL('')));
  } catch (e) {
    return false;
  }
}

function getBrowserFamily(navigatorLike?: NavigatorLike | string | null): BrowserFamily {
  return getBrowserInternalProfile(navigatorLike).scheme === 'about:' ? 'firefox' : 'chromium';
}

// Marks an extension page with its browser family and hides UI declared for
// the other one, e.g. <button data-browser-only="chromium"> in Firefox.
function applyDocumentBrowserFamily(documentObj: Document | null | undefined, navigatorLike?: NavigatorLike | null): BrowserFamily | '' {
  const rootElement = documentObj && documentObj.documentElement;
  if (!documentObj || !rootElement) {
    return '';
  }
  const family = getBrowserFamily(navigatorLike);
  rootElement.setAttribute('data-browser-family', family);
  if (!documentObj.getElementById('lumno-browser-family-style')) {
    const style = documentObj.createElement('style');
    style.id = 'lumno-browser-family-style';
    style.textContent = 'html[data-browser-family="firefox"] [data-browser-only="chromium"],' +
      'html[data-browser-family="chromium"] [data-browser-only="firefox"]{display:none !important;}';
    (documentObj.head || rootElement).appendChild(style);
  }
  return family;
}

// Extension pages only: this module also runs in web pages for the overlay,
// which must never be restyled.
const pageLocation = globalThis.location;
if (pageLocation && /^(?:chrome|moz)-extension:$/.test(pageLocation.protocol) && globalThis.document) {
  applyDocumentBrowserFamily(globalThis.document, globalThis.navigator);
}

export {
  isFirefoxExtensionRuntime,
  getBrowserFamily,
  applyDocumentBrowserFamily,
  getBrowserInternalScheme,
  getClientHintBrowserName,
  getFallbackBrowserName,
  getBrowserInternalProfile,
  canOpenBrowserPages
};
export type { BrowserFamily, BrowserInternalProfile, BrowserInternalScheme, NavigatorLike };
