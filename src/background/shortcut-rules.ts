// The words that open a browser page or a site from the search box
// (assets/data/shortcut-rules.json).
import * as browserProfile from '../platform/browser-profile';
import type { ShortcutRule } from '../domain/messages';

interface ShortcutRulesOptions {
  chromeApi?: { runtime?: { getURL?: (path: string) => string } } | null;
  fetchImpl?: ((url: string) => Promise<{ json(): Promise<unknown> }>) | null;
  navigatorLike?: browserProfile.NavigatorLike | null;
}

interface ShortcutRules {
  loadShortcutRules(): Promise<ShortcutRule[]>;
  // The page a query's leading words open, or null.
  getShortcutUrl(query: string, rules: readonly ShortcutRule[] | null | undefined): string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The rules of the packaged list; malformed entries are left out.
function readRules(data: unknown): ShortcutRule[] {
  const items: unknown[] = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  return items.filter(isRecord).map((item): ShortcutRule => ({
    ...(typeof item.type === 'string' ? { type: item.type } : {}),
    ...(Array.isArray(item.keys) ? { keys: item.keys.filter((key): key is string => typeof key === 'string') } : {}),
    ...(typeof item.path === 'string' ? { path: item.path } : {}),
    ...(typeof item.url === 'string' ? { url: item.url } : {}),
    ...(typeof item.searchSourceType === 'string' ? { searchSourceType: item.searchSourceType } : {})
  }));
}

function getShortcutUrlForScheme(
  query: string,
  rules: readonly (ShortcutRule | null | undefined)[] | null | undefined,
  scheme: string
): string | null {
  if (!query || !Array.isArray(rules)) {
    return null;
  }
  const queryLower = query.toLowerCase();
  const browserScheme = scheme || 'chrome://';
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const keys = rule ? rule.keys : undefined;
    if (!rule || !Array.isArray(keys)) {
      continue;
    }
    const isMatch = keys.some((key) => queryLower.startsWith(key));
    if (!isMatch) {
      continue;
    }
    if (rule.type === 'browserPage' && rule.path) {
      return `${browserScheme}${rule.path}`;
    }
    if (rule.type === 'url' && rule.url) {
      return rule.url;
    }
  }
  return null;
}

function create(options?: ShortcutRulesOptions | null): Readonly<ShortcutRules> {
  const settings = options && typeof options === 'object' ? options : {};
  const chromeApi = settings.chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
  const fetchImpl = settings.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const navigatorLike = settings.navigatorLike || (typeof navigator !== 'undefined' ? navigator : null);
  let shortcutRulesCache: ShortcutRule[] | null = null;
  let shortcutRulesPromise: Promise<ShortcutRule[]> | null = null;

  function getRuntimeUrl(path: string): string {
    return chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function'
      ? chromeApi.runtime.getURL(path)
      : path;
  }

  function loadShortcutRules(): Promise<ShortcutRule[]> {
    if (shortcutRulesCache) {
      return Promise.resolve(shortcutRulesCache);
    }
    if (shortcutRulesPromise) {
      return shortcutRulesPromise;
    }
    if (typeof fetchImpl !== 'function') {
      return Promise.resolve([]);
    }
    const rulesUrl = getRuntimeUrl('assets/data/shortcut-rules.json');
    shortcutRulesPromise = fetchImpl(rulesUrl)
      .then((response) => response.json())
      .then((data) => {
        const items = readRules(data);
        shortcutRulesCache = items;
        return items;
      })
      .catch((): ShortcutRule[] => []);
    return shortcutRulesPromise;
  }

  function getShortcutUrl(query: string, rules: readonly ShortcutRule[] | null | undefined): string | null {
    const scheme = browserProfile.getBrowserInternalProfile(navigatorLike).scheme;
    const usableRules = browserProfile.canOpenBrowserPages(scheme)
      ? rules
      : (Array.isArray(rules) ? rules.filter((rule) => !rule || rule.type !== 'browserPage') : rules);
    return getShortcutUrlForScheme(query, usableRules, scheme);
  }

  return Object.freeze({
    loadShortcutRules,
    getShortcutUrl
  });
}

export { create, getShortcutUrlForScheme };
export type { ShortcutRules, ShortcutRulesOptions };
