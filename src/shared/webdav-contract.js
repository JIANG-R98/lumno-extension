(function(root, factory) {
  const settings = root.LumnoSettings || (typeof require === 'function' ? require('./settings.js') : {});
  const shortcuts = root.LumnoNewtabShortcutsStore || (typeof require === 'function' ? require('../newtab/shortcuts-store.js') : {});
  const api = factory(settings, shortcuts);
  root.LumnoWebDavContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(settings, shortcutStore) {
  'use strict';
  const SHORTCUT_KEYS = shortcutStore.DEFAULT_SHORTCUTS_CHUNK_KEYS;
  const OVERFLOW_KEY = '_x_extension_newtab_shortcuts_local_overflow_2026_unique_';
  const ICONS_KEY = '_x_extension_newtab_shortcut_icons_2026_unique_';
  const WALLPAPER_KEY = '_x_extension_newtab_wallpaper_2026_unique_';
  const LOCAL_WALLPAPER_KEY = '_x_extension_newtab_local_wallpaper_2026_unique_';
  const PREFERENCE_KEYS = settings.CHROME_SYNC_STORAGE_KEYS.filter((key) => !SHORTCUT_KEYS.includes(key));
  const MAX_STATE_BYTES = 2 * 1024 * 1024;
  const MAX_ASSET_BYTES = 2 * 1024 * 1024;
  const HASH_PATTERN = /^[a-f0-9]{64}$/;
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
  const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function byteLength(value) { return new TextEncoder().encode(String(value)).byteLength; }
  function canonical(value) {
    if (typeof value === 'undefined') return 'undefined';
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }
  function equal(left, right) { return canonical(left) === canonical(right); }
  function readShortcuts(values, overflow) {
    const stored = SHORTCUT_KEYS.flatMap((key) => Array.isArray(values[key]) ? values[key] : []);
    const extra = Array.isArray(overflow) ? overflow : (Array.isArray(overflow && overflow.items) ? overflow.items : []);
    return shortcutStore.normalizeShortcuts(overflow && overflow.authoritative === true ? extra : [...stored, ...extra]);
  }
  function selectPreferences(values) {
    return Object.fromEntries([...PREFERENCE_KEYS, LOCAL_WALLPAPER_KEY]
      .filter((key) => own(values, key)).map((key) => [key, values[key]]));
  }
  function collectAssets(state) {
    const refs = [...Object.values(state.icons), ...state.wallpapers.flatMap((wallpaper) => [wallpaper.image, wallpaper.thumbnail])];
    return Object.fromEntries([...new Set(refs)].sort().map((hash) => [hash, state.assets[hash]]));
  }
  function validateState(value) {
    if (!isObject(value) || ![1, 2].includes(value.version) || !isObject(value.data) || !Array.isArray(value.shortcuts) ||
        !isObject(value.icons) || !Array.isArray(value.wallpapers) || !isObject(value.assets)) fail('invalid-state');
    if (byteLength(JSON.stringify(value)) > MAX_STATE_BYTES || value.shortcuts.length > 60 || value.wallpapers.length > 256) fail('state-too-large');
    const shortcuts = shortcutStore.normalizeShortcuts(value.shortcuts);
    if (shortcuts.length !== value.shortcuts.length || shortcuts.some((item) => item.type === 'folder' &&
        (value.version < 2 || !item.folderRef))) fail('invalid-shortcuts');
    if (value.shortcuts.some((item) => item.type === 'folder' && own(item, 'folderId'))) fail('invalid-shortcuts');
    const ids = new Set(shortcuts.map((item) => item.id));
    if (ids.size !== shortcuts.length) fail('invalid-shortcuts');
    const assets = {};
    Object.entries(value.assets).forEach(([hash, asset]) => {
      if (!HASH_PATTERN.test(hash) || !isObject(asset) || !['image/png', 'image/webp'].includes(asset.mime) ||
          !Number.isInteger(asset.size) || asset.size <= 0 || asset.size > MAX_ASSET_BYTES) fail('invalid-asset');
      assets[hash] = { mime: asset.mime, size: asset.size };
    });
    const checkRef = (hash, mime, maxSize) => {
      if (!HASH_PATTERN.test(String(hash)) || !own(assets, hash) || assets[hash].mime !== mime || assets[hash].size > maxSize) fail('invalid-asset');
    };
    const icons = Object.fromEntries(Object.entries(value.icons).map(([id, hash]) => {
      if (!ids.has(id)) fail('invalid-icon');
      checkRef(hash, 'image/png', 96 * 1024);
      return [id, hash];
    }));
    const wallpaperIds = new Set();
    const wallpapers = value.wallpapers.map((item) => {
      if (!isObject(item) || !/^custom-wallpaper-[-\w]{1,120}$/.test(item.id) || wallpaperIds.has(item.id) ||
          !Number.isInteger(item.width) || !Number.isInteger(item.height) || item.width < 1 || item.width > 8192 ||
          item.height < 1 || item.height > 8192 || !Number.isFinite(item.updatedAt)) fail('invalid-wallpaper');
      wallpaperIds.add(item.id);
      checkRef(item.image, 'image/webp', MAX_ASSET_BYTES);
      checkRef(item.thumbnail, 'image/webp', 160 * 1024);
      return { id: item.id, name: String(item.name || '').slice(0, 200), width: item.width, height: item.height,
        updatedAt: item.updatedAt, image: item.image, thumbnail: item.thumbnail };
    });
    const state = { version: value.version, data: selectPreferences(value.data), shortcuts, icons, wallpapers, assets };
    state.assets = collectAssets(state);
    return state;
  }
  // Whole lists are deliberate merge domains in v1. Sorting and deletes cannot
  // safely be resolved by joining arrays or choosing a device timestamp.
  function mergeStates(base, local, remote, resolution) {
    const conflicts = [];
    function choose(key, previous, left, right) {
      if (equal(left, right) || equal(right, previous)) return left;
      if (equal(left, previous)) return right;
      if (resolution === 'local') return left;
      if (resolution === 'remote') return right;
      conflicts.push(key);
      return left;
    }
    const data = {};
    PREFERENCE_KEYS.filter((key) => key !== WALLPAPER_KEY).forEach((key) => {
      const value = choose(key, base.data[key], local.data[key], remote.data[key]);
      if (typeof value !== 'undefined') data[key] = value;
    });
    const shortcutDomain = (state) => ({ shortcuts: state.shortcuts, icons: state.icons });
    const wallpaperDomain = (state) => ({ wallpapers: state.wallpapers,
      selection: state.data[LOCAL_WALLPAPER_KEY], builtin: state.data[WALLPAPER_KEY] });
    const links = choose('shortcuts', shortcutDomain(base), shortcutDomain(local), shortcutDomain(remote));
    const images = choose('wallpapers', wallpaperDomain(base), wallpaperDomain(local), wallpaperDomain(remote));
    if (typeof images.selection !== 'undefined') data[LOCAL_WALLPAPER_KEY] = images.selection;
    if (typeof images.builtin !== 'undefined') data[WALLPAPER_KEY] = images.builtin;
    const state = validateState({ version: Math.max(base.version, local.version, remote.version), data, ...links, wallpapers: images.wallpapers,
      assets: { ...base.assets, ...remote.assets, ...local.assets } });
    return { state, conflicts };
  }
  function planChromeBackup(values, existing, options) {
    const opts = options || {};
    const quota = opts.quota || 102400;
    const itemQuota = opts.itemQuota || 8192;
    const maxItems = opts.maxItems || 512;
    const keys = settings.CHROME_SYNC_STORAGE_KEYS;
    const bytes = (key, value) => byteLength(key) + byteLength(JSON.stringify(value));
    // Include retained old values in the budget, including values that no
    // longer fit. A partial backup keeps their last successful Chrome copy.
    const projected = { ...existing };
    const remove = keys.filter((key) => !own(values, key) && own(existing, key));
    remove.forEach((key) => delete projected[key]);
    const hasShortcuts = SHORTCUT_KEYS.some((key) => own(values, key));
    if (hasShortcuts) SHORTCUT_KEYS.forEach((key) => { projected[key] = []; });
    const payload = {};
    const skipped = [];
    for (const key of keys.filter((key) => !SHORTCUT_KEYS.includes(key))) {
      if (!own(values, key)) continue;
      const old = projected[key];
      projected[key] = values[key];
      const total = Object.entries(projected).reduce((sum, [name, value]) => sum + bytes(name, value), 0);
      if (bytes(key, values[key]) > itemQuota || total > quota || Object.keys(projected).length > maxItems) {
        if (typeof old === 'undefined') delete projected[key]; else projected[key] = old;
        skipped.push(key);
      } else if (!equal(existing[key], values[key])) payload[key] = values[key];
    }
    if (hasShortcuts) {
      const nonShortcutBytes = Object.entries(projected).filter(([key]) => !SHORTCUT_KEYS.includes(key))
        .reduce((sum, [key, value]) => sum + bytes(key, value), 0);
      const list = readShortcuts(values, null);
      const fallback = shortcutStore.createShortcutStoragePlan(list, {
        maxItemBytes: Math.min(itemQuota, 7680), maxTotalBytes: Math.max(0, quota - nonShortcutBytes)
      });
      Object.assign(projected, fallback.payload);
      const fits = Object.keys(projected).length <= maxItems && Object.entries(projected)
        .reduce((sum, [key, value]) => sum + bytes(key, value), 0) <= quota;
      if (fits) {
        // All three chunks are updated together, including empty tail chunks.
        // Keeping a stale tail would resurrect removed shortcuts on a new device.
        if (SHORTCUT_KEYS.some((key) => !equal(existing[key], fallback.payload[key]))) Object.assign(payload, fallback.payload);
        if (fallback.overflowItems.length) skipped.push(...SHORTCUT_KEYS);
      } else {
        skipped.push(...SHORTCUT_KEYS);
        // A changed preference must not rely on removing chunks that cannot be
        // replaced. Replan without shortcut allocation under a full quota.
        SHORTCUT_KEYS.forEach((key) => {
          if (own(existing, key)) projected[key] = existing[key]; else delete projected[key];
        });
        for (const key of Object.keys(payload).reverse()) {
          if (Object.entries(projected).reduce((sum, [name, value]) => sum + bytes(name, value), 0) <= quota) break;
          delete payload[key];
          skipped.push(key);
          if (own(existing, key)) projected[key] = existing[key]; else delete projected[key];
        }
      }
    }
    return { payload, remove, skipped, complete: skipped.length === 0 };
  }
  return Object.freeze({ SHORTCUT_KEYS, OVERFLOW_KEY, ICONS_KEY, WALLPAPER_KEY, LOCAL_WALLPAPER_KEY,
    PREFERENCE_KEYS, MAX_STATE_BYTES, MAX_ASSET_BYTES, canonical, equal, byteLength, readShortcuts,
    selectPreferences, validateState, mergeStates, planChromeBackup });
});
