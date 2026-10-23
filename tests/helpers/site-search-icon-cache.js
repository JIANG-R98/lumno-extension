'use strict';

// The chrome.storage.local items that hold site-search provider icons, made
// with the extension's own icon store, so a test can start a page or the
// worker with icons already cached.

const shortcutFavicon = require('../../src/shared/favicon/shortcut-favicon.js');

// entries: [{ provider, dataUrl }]
async function siteSearchIconCacheStorage(entries) {
  const data = {};
  const area = {
    get(keys, callback) {
      const list = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(list.filter((key) => key in data).map((key) => [key, data[key]])));
    },
    set(items, callback) {
      Object.assign(data, JSON.parse(JSON.stringify(items)));
      if (callback) callback();
    },
    remove(_keys, callback) {
      if (callback) callback();
    }
  };
  const store = shortcutFavicon.createShortcutFaviconStore({
    chromeApi: { runtime: {} },
    storageArea: area,
    storageKey: shortcutFavicon.SITE_SEARCH_STORAGE_KEY,
    ...shortcutFavicon.SITE_SEARCH_CACHE_OPTIONS
  });
  const cache = entries.reduce((current, { provider, dataUrl }) => {
    const pageUrl = shortcutFavicon.getSiteSearchProviderPageUrl(provider);
    return shortcutFavicon.setCachedIcon(current, pageUrl, dataUrl,
      `https://t2.gstatic.cn/faviconV2?url=${encodeURIComponent(pageUrl)}`, Date.now(), shortcutFavicon.SITE_SEARCH_CACHE_OPTIONS);
  }, {});
  await store.writeAll(cache);
  return data;
}

module.exports = { siteSearchIconCacheStorage };
