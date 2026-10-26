// The page a favicon stands for: its canonical URL and host, and the key
// its icon is cached under.
import { getFaviconIsPageUrl, normalizeFaviconHost } from './url-kinds';

function getHttpPageUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : '';
  } catch (e) {
    return '';
  }
}

function getFaviconPageSearchParam(parsedUrl: URL | null | undefined): string {
  if (!parsedUrl || !parsedUrl.searchParams) {
    return '';
  }
  return parsedUrl.searchParams.get('pageUrl') ||
    parsedUrl.searchParams.get('url') ||
    parsedUrl.searchParams.get('domain_url') ||
    '';
}

// A favicon service URL that names the page it is asked about.
function isPageFaviconServiceUrl(parsed: URL): boolean {
  const lowerHost = parsed.hostname.toLowerCase();
  const lowerPath = parsed.pathname.toLowerCase();
  return (parsed.protocol === 'chrome-extension:' && lowerPath.startsWith('/_favicon/')) ||
    (parsed.protocol === 'chrome:' && lowerHost === 'favicon2') ||
    (/(?:^|\.)gstatic\.(?:com|cn)$/i.test(lowerHost) && lowerPath.includes('/favicon')) ||
    (/(?:^|\.)google\.[^/]+$/i.test(lowerHost) && lowerPath.includes('/s2/favicons'));
}

function readServicePageUrl(parsed: URL): string {
  const directPageUrl = getHttpPageUrl(getFaviconPageSearchParam(parsed));
  if (directPageUrl) {
    return directPageUrl;
  }
  const domain = String(parsed.searchParams.get('domain') || '').trim();
  return domain && !/[/?#]/.test(domain) ? getHttpPageUrl(`https://${domain}/`) : '';
}

function getPageUrlFromFaviconProxyUrl(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === 'favicon.is') return getFaviconIsPageUrl(parsed);
    return isPageFaviconServiceUrl(parsed) ? readServicePageUrl(parsed) : '';
  } catch (e) {
    return '';
  }
}

function getCanonicalPageUrlForFavicon(url: unknown): string {
  let current = String(url || '').trim();
  if (!current) {
    return '';
  }
  for (let i = 0; i < 4; i += 1) {
    const next = getPageUrlFromFaviconProxyUrl(current);
    if (!next || next === current) {
      return current;
    }
    current = next;
  }
  return current;
}

function getFaviconPersistCacheKey(pageUrl: unknown, fallbackKey?: unknown): string {
  const canonicalPageUrl = getCanonicalPageUrlForFavicon(pageUrl);
  try {
    const parsed = new URL(canonicalPageUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      parsed.hash = '';
      return `page:${parsed.href}`;
    }
  } catch (e) {
    // Non-web pages keep the existing host or URL fallback below.
  }
  return String(fallbackKey || canonicalPageUrl || '').trim();
}

function getCanonicalFaviconHost(url: unknown): string {
  const pageUrl = getCanonicalPageUrlForFavicon(url);
  if (!pageUrl) {
    return '';
  }
  try {
    return normalizeFaviconHost(new URL(pageUrl).hostname);
  } catch (e) {
    return '';
  }
}

export {
  getCanonicalFaviconHost,
  getCanonicalPageUrlForFavicon,
  getFaviconPageSearchParam,
  getFaviconPersistCacheKey,
  getHttpPageUrl,
  getPageUrlFromFaviconProxyUrl
};
