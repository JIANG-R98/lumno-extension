// What kind of address a favicon or page URL is: an icon service, a
// browser or extension endpoint, or a browser page.

function normalizeFaviconHost(hostname: unknown): string {
  if (!hostname) {
    return '';
  }
  const host = String(hostname).toLowerCase().replace(/^www\./i, '');
  if (host === 'feishu.cn' || host.endsWith('.feishu.cn')) {
    return 'feishu.cn';
  }
  return host;
}

function getFaviconIsPageUrl(parsed: URL): string {
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'favicon.is' ||
      parsed.port || parsed.username || parsed.password) return '';
  const domain = decodeURIComponent(parsed.pathname.slice(1)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(domain)) return '';
  const page = new URL(`https://${domain}/`);
  return page.hostname === domain ? page.href : '';
}

function isFaviconIsUrl(url: unknown): boolean {
  try { return Boolean(getFaviconIsPageUrl(new URL(String(url || '').trim()))); }
  catch (error) { return false; }
}

function isFaviconProxyUrl(url: unknown): boolean {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (parsed.protocol === 'chrome-extension:') {
      return path.startsWith('/_favicon/');
    }
    if (parsed.protocol !== 'https:') {
      return false;
    }
    return ((host === 'google.com' || host === 'www.google.com') && path === '/s2/favicons') ||
      (/^(?:[a-z0-9-]+\.)?gstatic\.(?:com|cn)$/.test(host) && /^\/favicon(?:v2)?\/?$/.test(path)) ||
      Boolean(getFaviconIsPageUrl(parsed));
  } catch (e) {
    return false;
  }
}

function isChromeMonogramFaviconUrl(url: unknown): boolean {
  return /^chrome:\/\/favicon2\//i.test(String(url || '').trim());
}

// Chromium's _favicon endpoint answers from the browser's own icon cache.
// It is not web accessible (a page could probe it to learn which sites were
// visited), so web-page surfaces load these through the background instead.
function isExtensionFaviconEndpointUrl(url: unknown): boolean {
  return /^chrome-extension:\/\/[^/]+\/_favicon\//i.test(String(url || '').trim());
}

// Services that receive only the site origin answer for the whole site.
function isOriginScopedFaviconProxyUrl(url: unknown): boolean {
  try {
    const parsed = new URL(String(url || '').trim());
    return parsed.protocol === 'https:' && isFaviconProxyUrl(url) && !getFaviconIsPageUrl(parsed);
  } catch (e) {
    return false;
  }
}

function isSafeVirtualFaviconRequestUrl(url: unknown): boolean {
  const raw = String(url || '').trim();
  if (!raw) {
    return false;
  }
  if (isChromeMonogramFaviconUrl(raw)) {
    return true;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'chrome-extension:' &&
      String(parsed.pathname || '').toLowerCase().startsWith('/_favicon/');
  } catch (e) {
    return false;
  }
}



function isBrowserInternalPageUrl(url: unknown): boolean {
  const lower = String(url || '').trim().toLowerCase();
  return lower.startsWith('chrome://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('brave://') ||
    lower.startsWith('vivaldi://') ||
    lower.startsWith('opera://') ||
    lower.startsWith('about:');
}

function isBrowserExtensionProtocol(protocol: unknown): boolean {
  const normalized = String(protocol || '').toLowerCase();
  return normalized === 'chrome-extension:' ||
    normalized === 'moz-extension:' ||
    normalized === 'ms-browser-extension:';
}

export {
  getFaviconIsPageUrl,
  isBrowserExtensionProtocol,
  isBrowserInternalPageUrl,
  isChromeMonogramFaviconUrl,
  isExtensionFaviconEndpointUrl,
  isFaviconIsUrl,
  isFaviconProxyUrl,
  isOriginScopedFaviconProxyUrl,
  isSafeVirtualFaviconRequestUrl,
  normalizeFaviconHost
};
