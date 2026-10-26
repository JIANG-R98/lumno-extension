// The icon a shortcut shows, and site-search icons shared with shortcuts to
// the same site.
import type { ShortcutIconMap } from '../../shortcut-icon-map';
import { getSiteSearchPinnedIconAssetPath, getSiteSearchProviderPageUrl } from './bundled-icons';
import { getCacheKey, getCachedIconSource, normalizeCacheMap, normalizeDataUrl, normalizePageUrl } from './persisted';
import type { CachedIconMap, IconProvider } from './types';
import type { ShortcutItem, ShortcutLink } from '../../shortcuts/types';

function getShortcutHomeHost(url: unknown): string {
  const page = normalizePageUrl(url);
  if (!page) {
    return '';
  }
  const parsed = new URL(page);
  return parsed.pathname === '/' && !parsed.search
    ? parsed.hostname.toLowerCase().replace(/^www\./, '') : '';
}

// The image a home-page shortcut shows when its icon was chosen by hand: an
// uploaded icon, or the Gstatic / Favicon.is snapshot it saved. The browser
// cache and built-in choices match what site search already uses.
function getShortcutChosenIcon(
  shortcut: ShortcutLink,
  shortcutIcons: ShortcutIconMap | null | undefined,
  shortcutFavicons: CachedIconMap | null | undefined
): string {
  const id = String(shortcut.id || '').trim();
  const uploaded = id && shortcutIcons ? String(shortcutIcons[id] || '') : '';
  if (uploaded) {
    return uploaded;
  }
  const source = shortcut.iconSource;
  if (source !== 'service' && source !== 'favicon-is') {
    return '';
  }
  const entry = shortcutFavicons ? shortcutFavicons[getCacheKey(shortcut.url)] : null;
  return entry && entry.dataUrl && getCachedIconSource(entry) === source ? String(entry.dataUrl) : '';
}

// Custom site-search providers without bundled artwork take the icon chosen
// for a shortcut to the same site's home page. Keyed like the site-search
// icon cache.
function getSiteSearchShortcutIcons(
  providers: readonly IconProvider[] | null | undefined,
  shortcuts: readonly ShortcutItem[] | null | undefined,
  shortcutIcons: ShortcutIconMap | null | undefined,
  shortcutFavicons: CachedIconMap | null | undefined
): ShortcutIconMap {
  const links = (shortcuts || []).filter((shortcut): shortcut is ShortcutLink => shortcut.type !== 'folder');
  const result: ShortcutIconMap = {};
  for (const provider of providers || []) {
    const pageUrl = getSiteSearchProviderPageUrl(provider);
    const key = getCacheKey(pageUrl);
    if (!key || result[key] || getSiteSearchPinnedIconAssetPath(provider)) {
      continue;
    }
    const host = getShortcutHomeHost(pageUrl);
    const dataUrl = links.reduce((found, shortcut) => found || (
      getShortcutHomeHost(shortcut.url) === host
        ? getShortcutChosenIcon(shortcut, shortcutIcons, shortcutFavicons) : ''
    ), '');
    if (dataUrl) {
      result[key] = dataUrl;
    }
  }
  return result;
}

// Writes the shortcut icons into the site-search icon cache and drops the
// ones whose shortcut no longer chooses an icon, so the warmup fetches the
// site's own icon again. Returns null when nothing changes.
function applySiteSearchShortcutIcons(
  cacheMap: unknown,
  shortcutIconMap: ShortcutIconMap | null | undefined,
  nowValue?: unknown,
  options?: unknown
): CachedIconMap | null {
  const current = normalizeCacheMap(cacheMap, nowValue, options);
  const icons: ShortcutIconMap = shortcutIconMap || {};
  const next: CachedIconMap = { ...current };
  let changed = false;
  Object.keys(current).forEach((key) => {
    if (current[key].fromShortcut && !icons[key]) {
      delete next[key];
      changed = true;
    }
  });
  Object.keys(icons).forEach((rawKey) => {
    const key = getCacheKey(rawKey);
    const dataUrl = normalizeDataUrl(icons[rawKey], options);
    const entry = current[key];
    if (!key || !dataUrl || (entry && entry.fromShortcut && entry.dataUrl === dataUrl)) {
      return;
    }
    next[key] = {
      dataUrl,
      sourceUrl: '',
      updatedAt: Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now(),
      fromShortcut: true
    };
    changed = true;
  });
  return changed ? normalizeCacheMap(next, nowValue, options) : null;
}

export {
  applySiteSearchShortcutIcons,
  getShortcutChosenIcon,
  getShortcutHomeHost,
  getSiteSearchShortcutIcons
};
