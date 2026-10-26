// The URLs an icon can be fetched from: the extension's _favicon endpoint,
// Google's and favicon.is's services, the browser's own pages and Lumno's
// bundled artwork.
import { getFaviconResolverSize } from './source-policy';
import type { ExtensionRuntimeInfo, FaviconChromeApi, FaviconUrlOptions, RuntimeUrlGetter } from './types';
import { isBrowserExtensionProtocol, isBrowserInternalPageUrl } from './url-kinds';

const LUMNO_EXTENSION_ICON_PATH = 'assets/images/lumno.png';

function getExtensionFaviconUrl(pageUrl: string, options?: FaviconUrlOptions | null): string {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
    return '';
  }
  const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
    ? options.getRuntimeUrl
    : null;
  if (!getRuntimeUrl) {
    return '';
  }
  const size = getFaviconResolverSize(options);
  try {
    const faviconUrl = new URL(getRuntimeUrl('/_favicon/'));
    // Only Chromium serves _favicon. Elsewhere (Firefox) the URL would never
    // load, so it is kept solely as the browser-cache request marker that the
    // background resolves from the browser's own icons.
    if (faviconUrl.protocol !== 'chrome-extension:' && !(options && options.browserCacheRequest === true)) {
      return '';
    }
    faviconUrl.searchParams.set('pageUrl', pageUrl);
    faviconUrl.searchParams.set('size', String(size));
    // A same-host icon can belong to a different application or page path.
    faviconUrl.searchParams.set('fallbackToHost', '0');
    return faviconUrl.toString();
  } catch (e) {
    return '';
  }
}

// Third-party icon services only learn which site is shown, never the page:
// paths and queries can carry document ids, intranet paths or tokens.
function getFaviconServiceSiteUrl(pageUrl: unknown): string {
  try {
    const parsed = new URL(String(pageUrl || '').trim());
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? `${parsed.origin}/` : '';
  } catch (e) {
    return '';
  }
}

function getGstaticFaviconUrl(pageUrl: unknown, options?: FaviconUrlOptions | null): string {
  const siteUrl = getFaviconServiceSiteUrl(pageUrl);
  if (!siteUrl) {
    return '';
  }
  const size = getFaviconResolverSize(options);
  const host = options && options.host ? String(options.host) : 't2.gstatic.cn';
  try {
    const faviconUrl = new URL(`https://${host}/faviconV2`);
    faviconUrl.searchParams.set('client', 'SOCIAL');
    faviconUrl.searchParams.set('type', 'FAVICON');
    faviconUrl.searchParams.set('fallback_opts', 'TYPE,SIZE,URL');
    faviconUrl.searchParams.set('url', siteUrl);
    faviconUrl.searchParams.set('size', String(size));
    return faviconUrl.toString();
  } catch (e) {
    return '';
  }
}

function getFaviconIsUrl(pageUrl: unknown): string {
  try {
    const parsed = new URL(String(pageUrl || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return `https://favicon.is/${parsed.hostname}?larger=true`;
  } catch (error) { return ''; }
}

function getChromeFaviconUrl(pageUrl: unknown, options?: FaviconUrlOptions | null): string {
  const page = String(pageUrl || '').trim();
  if (!page) {
    return '';
  }
  const size = getFaviconResolverSize(options);
  // chrome://favicon2 forces host fallback in its local-storage branch.
  // Web pages must use the extension endpoint, which honors exact matching.
  if (/^https?:\/\//i.test(page)) {
    return getExtensionFaviconUrl(page, options);
  }
  try {
    const faviconUrl = new URL('chrome://favicon2/');
    faviconUrl.searchParams.set('pageUrl', page);
    faviconUrl.searchParams.set('size', String(size));
    return faviconUrl.toString();
  } catch (e) {
    return '';
  }
}

function getBrowserPageFaviconUrl(pageUrl: unknown, options?: FaviconUrlOptions | null): string {
  const page = String(pageUrl || '').trim();
  if (!isBrowserInternalPageUrl(page)) {
    return '';
  }
  const size = getFaviconResolverSize(options);
  const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
    ? options.getRuntimeUrl
    : null;
  if (getRuntimeUrl) {
    try {
      const faviconUrl = new URL(getRuntimeUrl('/_favicon/'));
      faviconUrl.searchParams.set('pageUrl', page);
      faviconUrl.searchParams.set('size', String(size));
      return faviconUrl.toString();
    } catch (e) {
      // Fall through to chrome://favicon2 below.
    }
  }
  return getChromeFaviconUrl(page, { size });
}



function getRuntimeFaviconUrl(path: string, options?: FaviconUrlOptions | null): string {
  const getRuntimeUrl = options && typeof options.getRuntimeUrl === 'function'
    ? options.getRuntimeUrl
    : null;
  if (!getRuntimeUrl) {
    return '';
  }
  try {
    return String(getRuntimeUrl(path) || '');
  } catch (e) {
    return '';
  }
}

function getOwnExtensionRuntimeInfo(
  options: { chromeApi?: FaviconChromeApi | null } | null | undefined,
  getRuntimeUrl: RuntimeUrlGetter | null
): ExtensionRuntimeInfo {
  const runtime = options && options.chromeApi && options.chromeApi.runtime
    ? options.chromeApi.runtime
    : null;
  // The id is the extension URL host. Chrome uses runtime.id as that host;
  // Firefox uses a per-install UUID, so the runtime URL is authoritative.
  const info = {
    id: '',
    protocol: 'chrome-extension:'
  };
  const fallbackId = runtime && runtime.id ? String(runtime.id) : '';
  if (typeof getRuntimeUrl !== 'function') {
    info.id = fallbackId;
    return info;
  }
  const resolved = ['', '/'].some((path) => {
    let runtimeUrl = '';
    try {
      runtimeUrl = String(getRuntimeUrl(path) || '').trim();
    } catch (e) {
      return false;
    }
    if (!runtimeUrl) {
      return false;
    }
    try {
      const parsed = new URL(runtimeUrl);
      if (!isBrowserExtensionProtocol(parsed.protocol) || !parsed.hostname) {
        return false;
      }
      info.id = parsed.hostname;
      info.protocol = parsed.protocol;
      return true;
    } catch (e) {
      return false;
    }
  });
  if (!resolved) {
    info.id = fallbackId;
  }
  return info;
}

function getOwnExtensionAssetUrl(path: string, runtimeInfo: ExtensionRuntimeInfo | null | undefined, options?: FaviconUrlOptions | null): string {
  const assetPath = String(path || '').replace(/^\/+/, '');
  if (!assetPath) {
    return '';
  }
  const runtimeUrl = getRuntimeFaviconUrl(assetPath, options);
  if (runtimeUrl) {
    try {
      const parsed = new URL(runtimeUrl);
      if (isBrowserExtensionProtocol(parsed.protocol) &&
          (!runtimeInfo || !runtimeInfo.id || parsed.hostname === runtimeInfo.id)) {
        return runtimeUrl;
      }
    } catch (e) {
      // Fall through to constructing the known extension asset URL below.
    }
  }
  if (runtimeInfo && runtimeInfo.id) {
    return `${runtimeInfo.protocol || 'chrome-extension:'}//${runtimeInfo.id}/${assetPath}`;
  }
  return runtimeUrl;
}

export {
  LUMNO_EXTENSION_ICON_PATH,
  getBrowserPageFaviconUrl,
  getChromeFaviconUrl,
  getExtensionFaviconUrl,
  getFaviconIsUrl,
  getFaviconServiceSiteUrl,
  getGstaticFaviconUrl,
  getOwnExtensionAssetUrl,
  getOwnExtensionRuntimeInfo,
  getRuntimeFaviconUrl
};
