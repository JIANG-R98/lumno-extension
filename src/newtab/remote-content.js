(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LumnoNewtabRemoteContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const QUOTE_CACHE_KEY = '_x_extension_newtab_quote_cache_2026_unique_';
  const BING_CACHE_KEY = '_x_extension_bing_catalog_cache_2026_unique_';
  const BING_DAILY_CACHE_KEY = '_x_extension_bing_daily_cache_2026_unique_';
  const BING_DAILY_ID = 'bing-daily';
  const BING_ID_PATTERN = /^bing-(\d{8})-(OHR\.[a-zA-Z0-9_-]{1,160})$/;
  const BING_ORIGIN = 'https://www.bing.com';

  function normalizeMarket(language) {
    const locale = String(language || '').replace(/_/g, '-').toLowerCase();
    if (locale.startsWith('zh')) return locale.includes('tw') || locale.includes('hant') ? 'zh-TW' : 'zh-CN';
    return locale.startsWith('ja') ? 'ja-JP' : 'en-US';
  }

  function read(area, key) {
    return new Promise((resolve) => {
      if (!area || typeof area.get !== 'function') return resolve(undefined);
      area.get([key], (values) => resolve(values && values[key]));
    });
  }

  function write(area, key, value) {
    return new Promise((resolve, reject) => {
      if (!area || typeof area.set !== 'function') return resolve();
      area.set({ [key]: value }, () => {
        const error = root.chrome && root.chrome.runtime && root.chrome.runtime.lastError;
        if (error) reject(new Error(error.message)); else resolve();
      });
    });
  }

  function localDay(timestamp) {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  function normalizeQuote(value) {
    if (!value || typeof value !== 'object' || typeof value.hitokoto !== 'string') return null;
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

  function wallpaperFromId(id) {
    if (id === BING_DAILY_ID) return { id, name: 'Bing', sourceUrl: BING_ORIGIN };
    const match = BING_ID_PATTERN.exec(String(id || ''));
    return match ? { id, date: match[1], rawId: match[2], name: 'Bing', sourceUrl: BING_ORIGIN,
      imageUrl: `${BING_ORIGIN}/th?id=${match[2]}_1920x1080.jpg&pid=hp`,
      thumbnailUrl: `${BING_ORIGIN}/th?id=${match[2]}_1920x1080.jpg&pid=hp&w=480&h=270&c=1` } : null;
  }

  function normalizeWallpaper(value) {
    if (!value || value.wp !== true || !/^\d{8}$/.test(value.startdate)) return null;
    const date = new Date(`${value.startdate.slice(0, 4)}-${value.startdate.slice(4, 6)}-${value.startdate.slice(6, 8)}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10).replace(/-/g, '') !== value.startdate) return null;
    try {
      const url = new URL(value.urlbase, BING_ORIGIN);
      if (url.origin !== BING_ORIGIN || url.pathname !== '/th' || url.username || url.password) return null;
      const item = wallpaperFromId(`bing-${value.startdate}-${url.searchParams.get('id')}`);
      if (!item || !item.rawId) return null;
      let sourceUrl = BING_ORIGIN;
      if (value.copyrightlink) {
        const source = new URL(value.copyrightlink);
        if (source.protocol === 'https:' && ['www.bing.com', 'cn.bing.com'].includes(source.hostname) &&
            !source.port && !source.username && !source.password) sourceUrl = source.href;
      }
      return { ...item, name: String(value.title || 'Bing').slice(0, 200),
        copyright: String(value.copyright || '').slice(0, 500), date: value.startdate, sourceUrl };
    } catch (_error) { return null; }
  }

  function normalizeStoredWallpaper(value) {
    const item = value && wallpaperFromId(value.id);
    return item && item.rawId ? normalizeWallpaper({ wp: true, startdate: value.date,
      urlbase: `/th?id=${item.rawId}`, title: value.name, copyright: value.copyright,
      copyrightlink: value.sourceUrl }) : null;
  }

  function createMediaStore(indexedDB) {
    let databaseTask;
    function open() {
      if (!databaseTask) databaseTask = new Promise((resolve, reject) => {
        if (!indexedDB) return reject(new Error('Wallpaper storage is unavailable.'));
        const request = indexedDB.open('lumno-bing', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((error) => { databaseTask = null; throw error; });
      return databaseTask;
    }
    async function get(id) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction('images', 'readonly').objectStore('images').get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async function put(record, pinnedIds) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('images', 'readwrite');
        const store = transaction.objectStore('images');
        store.put(record);
        const request = store.getAll();
        request.onsuccess = () => {
          const records = request.result.sort((a, b) => b.updatedAt - a.updatedAt);
          const keep = new Set([record.id, ...pinnedIds]);
          records.forEach((item) => { if (keep.size < 12) keep.add(item.id); });
          records.forEach((item) => { if (!keep.has(item.id)) store.delete(item.id); });
        };
        transaction.oncomplete = () => resolve(record);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('Wallpaper could not be saved.'));
      });
    }
    return { get, put };
  }

  function createClient(options) {
    const config = options || {};
    const area = config.storageArea;
    const fetcher = config.fetch || root.fetch.bind(root);
    const now = config.now || Date.now;
    const locks = config.locks || (root.navigator && root.navigator.locks);
    const mediaStore = config.mediaStore || createMediaStore(root.indexedDB);
    const images = new Map();
    const pendingImages = new Map();
    const quoteTasks = new Map();
    const catalogTasks = new Map();
    let pinnedIds = [];
    let dailyWallpaper = null;
    const getMarket = () => normalizeMarket(typeof config.getLanguage === 'function' ? config.getLanguage() : config.language);
    function lock(name, task) {
      return locks && typeof locks.request === 'function' ? locks.request(name, task) : task();
    }
    async function request(url, kind) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), kind === 'image' ? 20000 : 8000);
      try {
        const response = await fetcher(url, { signal: controller.signal, credentials: 'omit',
          referrerPolicy: 'no-referrer' });
        if (!response.ok) {
          const error = new Error(`Request failed (${response.status}).`);
          error.status = response.status;
          throw error;
        }
        if (kind !== 'image') return await response.json();
        const length = Number(response.headers.get('content-length'));
        if (length > 25 * 1024 * 1024) throw new Error('Wallpaper is too large.');
        const blob = await response.blob();
        if (blob.size > 25 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(blob.type)) {
          throw new Error('Unsupported wallpaper image.');
        }
        return blob;
      } finally { clearTimeout(timer); }
    }
    function getQuote(category) {
      const type = category === 'poetry' ? 'poetry' : 'literature';
      if (quoteTasks.has(type)) return quoteTasks.get(type);
      const task = lock('lumno-daily-quote', async () => {
        const cache = (await read(area, QUOTE_CACHE_KEY)) || {};
        const entry = cache[type];
        if (entry && entry.quote && (entry.day === localDay(now()) || entry.retryAt > now())) {
          return entry.quote;
        }
        try {
          const data = await request(`https://v1.hitokoto.cn/?c=${type === 'poetry' ? 'i' : 'd'}&encode=json&max_length=40`);
          const quote = normalizeQuote(data);
          if (!quote) throw new Error('Invalid quote response.');
          // Read again so concurrently updated categories are not overwritten.
          const latest = (await read(area, QUOTE_CACHE_KEY)) || {};
          await write(area, QUOTE_CACHE_KEY, { ...latest, [type]: { quote, day: localDay(now()) } });
          return quote;
        } catch (_error) {
          const fallback = typeof config.fallbackQuote === 'function' ? config.fallbackQuote() : config.fallbackQuote;
          const quote = entry && entry.quote || fallback || {
            text: 'A journey of a thousand miles begins with a single step.', author: 'Laozi',
            source: 'Tao Te Ching', url: 'https://hitokoto.cn/'
          };
          const latest = (await read(area, QUOTE_CACHE_KEY)) || {};
          await write(area, QUOTE_CACHE_KEY, { ...latest,
            [type]: { quote, day: entry && entry.day || '', retryAt: now() + 15 * 60 * 1000 } }).catch(() => {});
          return quote;
        }
      }).finally(() => quoteTasks.delete(type));
      quoteTasks.set(type, task);
      return task;
    }
    function getCatalog(refresh) {
      const market = getMarket();
      if (catalogTasks.has(market)) return catalogTasks.get(market);
      const task = lock(`lumno-bing-catalog-${market}`, async () => {
        const cache = (await read(area, BING_CACHE_KEY)) || {};
        const entry = cache[market] || {};
        const cached = Array.isArray(entry.items) ? entry.items.map(normalizeStoredWallpaper).filter(Boolean) : [];
        const remember = (items) => {
          items.forEach((item) => images.set(item.id, { ...images.get(item.id), ...item }));
          return items;
        };
        // Recheck during the day because Bing's publishing boundary can differ from the local date.
        if ((!refresh && entry.day === localDay(now()) && entry.updatedAt > now() - 60 * 60 * 1000 ||
            entry.retryAt > now()) && cached.length) return remember(cached);
        if (entry.retryAt > now()) throw new Error('Please try again shortly.');
        try {
          const params = new URLSearchParams({ format: 'js', idx: '0', n: '8', mkt: market });
          const data = await request(`${BING_ORIGIN}/HPImageArchive.aspx?${params}`);
          if (!data || !Array.isArray(data.images)) throw new Error('Invalid wallpaper response.');
          const items = data.images.slice(0, 8).map(normalizeWallpaper).filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date));
          if (!items.length) throw new Error('No downloadable wallpapers.');
          await write(area, BING_CACHE_KEY, { ...cache,
            [market]: { items, day: localDay(now()), updatedAt: now(), retryAt: 0 } });
          return remember(items);
        } catch (error) {
          await write(area, BING_CACHE_KEY, { ...cache, [market]: { ...entry,
            retryAt: now() + (error.status === 429 ? 60000 : 15 * 60 * 1000) } }).catch(() => {});
          if (cached.length) return remember(cached);
          throw error;
        }
      }).finally(() => catalogTasks.delete(market));
      catalogTasks.set(market, task);
      return task;
    }
    async function restoreWallpaper(id) {
      if (!wallpaperFromId(id)) return null;
      if (id === BING_DAILY_ID) {
        const cache = (await read(area, BING_DAILY_CACHE_KEY)) || {};
        const entry = cache[getMarket()];
        const descriptor = entry && wallpaperFromId(entry.id);
        dailyWallpaper = descriptor && descriptor.rawId ? await restoreWallpaper(entry.id) : null;
        return dailyWallpaper ? { ...dailyWallpaper, id: BING_DAILY_ID, dailyId: dailyWallpaper.id } : null;
      }
      const cached = await mediaStore.get(id).catch(() => null);
      const item = normalizeStoredWallpaper(cached);
      if (item && /^data:image\/(jpeg|png|webp);base64,/.test(cached.imageDataUrl || '')) {
        const record = { ...item, imageDataUrl: cached.imageDataUrl,
          thumbnailDataUrl: /^data:image\/(jpeg|png|webp);base64,/.test(cached.thumbnailDataUrl || '')
            ? cached.thumbnailDataUrl : '', updatedAt: cached.updatedAt };
        images.set(id, record);
        return record;
      }
      return null;
    }
    function ensureWallpaper(id) {
      if (!wallpaperFromId(id)) return Promise.reject(new Error('Invalid wallpaper ID.'));
      if (id === BING_DAILY_ID) return ensureDailyWallpaper();
      if (pendingImages.has(id)) return pendingImages.get(id);
      const task = lock(`lumno-bing-image-${id}`, async () => {
        const cached = images.get(id);
        if (cached && cached.imageDataUrl) return cached;
        const restored = await restoreWallpaper(id);
        if (restored) return restored;
        const item = images.get(id) || wallpaperFromId(id);
        const blob = await request(item.imageUrl, 'image');
        const file = new File([blob], `${item.rawId}.jpg`, { type: blob.type });
        const processed = await config.processFile(file);
        const record = { ...item, imageDataUrl: processed.imageDataUrl,
          thumbnailDataUrl: processed.thumbnailDataUrl, updatedAt: now() };
        const dailyCache = (await read(area, BING_DAILY_CACHE_KEY)) || {};
        const keepIds = [...pinnedIds.filter((pin) => pin !== BING_DAILY_ID),
          ...Object.values(dailyCache).map((entry) => entry.id)];
        await mediaStore.put(record, keepIds);
        images.set(id, record);
        return record;
      }).finally(() => pendingImages.delete(id));
      pendingImages.set(id, task);
      return task;
    }
    function ensureDailyWallpaper() {
      const market = getMarket();
      const key = `${BING_DAILY_ID}-${market}`;
      if (pendingImages.has(key)) return pendingImages.get(key);
      const task = lock(`lumno-bing-daily-${market}`, async () => {
        await restoreWallpaper(BING_DAILY_ID);
        const dailyCache = (await read(area, BING_DAILY_CACHE_KEY)) || {};
        if (dailyCache[market] && dailyCache[market].retryAt > now()) {
          if (dailyWallpaper) return getWallpaper(BING_DAILY_ID);
          throw new Error('Please try again shortly.');
        }
        try {
          const items = await getCatalog();
          const latest = items[0];
          // A delayed or stale archive response must not replace a newer cached daily image.
          if (dailyWallpaper && dailyWallpaper.date >= latest.date) return getWallpaper(BING_DAILY_ID);
          const record = await ensureWallpaper(latest.id);
          const cache = (await read(area, BING_DAILY_CACHE_KEY)) || {};
          await write(area, BING_DAILY_CACHE_KEY, { ...cache, [market]: { id: record.id, retryAt: 0 } });
          dailyWallpaper = record;
          return getWallpaper(BING_DAILY_ID);
        } catch (error) {
          const cache = (await read(area, BING_DAILY_CACHE_KEY)) || {};
          await write(area, BING_DAILY_CACHE_KEY, { ...cache, [market]: {
            ...cache[market], retryAt: now() + 15 * 60 * 1000 } }).catch(() => {});
          if (dailyWallpaper) return getWallpaper(BING_DAILY_ID);
          throw error;
        }
      }).finally(() => pendingImages.delete(key));
      pendingImages.set(key, task);
      return task;
    }
    function getWallpaper(id) {
      if (id === BING_DAILY_ID && dailyWallpaper) {
        return { ...dailyWallpaper, id, dailyId: dailyWallpaper.id };
      }
      return images.get(id) || wallpaperFromId(id);
    }
    return Object.freeze({ getQuote, getCatalog, ensureWallpaper, restoreWallpaper, getWallpaper,
      setPinnedIds: (ids) => { pinnedIds = ids.filter((id) => wallpaperFromId(id)); } });
  }

  return Object.freeze({ QUOTE_CACHE_KEY, BING_CACHE_KEY, BING_DAILY_CACHE_KEY, BING_DAILY_ID, normalizeMarket,
    localDay, normalizeQuote, normalizeWallpaper, wallpaperFromId, createMediaStore, createClient });
});
