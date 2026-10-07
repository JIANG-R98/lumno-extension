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
  const LINK_WALLPAPERS_KEY = settings.NEWTAB_LINK_WALLPAPERS_STORAGE_KEY;
  // Browser sync stores the link list as one item of at most 8 KB.
  const MAX_LINK_WALLPAPERS_BYTES = 8000;
  const PREFERENCE_KEYS = settings.CHROME_SYNC_STORAGE_KEYS.filter((key) => !SHORTCUT_KEYS.includes(key));
  // Preferences kept in chrome.storage.local that WebDAV carries but browser
  // sync never does: the custom wallpaper selection and the bookmark bar
  // material chosen against it.
  const TOPBAR_KEYS = settings.BOOKMARK_TOPBAR_WEBDAV_STORAGE_KEYS || [];
  const LOCAL_PREFERENCE_KEYS = [LOCAL_WALLPAPER_KEY, ...TOPBAR_KEYS];
  // Records whose fields are independent settings merge field by field, so
  // two devices editing different fields of one record do not conflict.
  // Folder colors merge per folder for the same reason.
  const FIELD_MERGE_KEYS = [settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY,
    settings.BOOKMARK_FOLDER_COLOR_REFS_STORAGE_KEY].filter(Boolean);
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
  // Both sides must still hold a record; a deleted or replaced value is a
  // whole-value change. A missing base record counts as an empty one.
  function fieldMergeable(key, base, local, remote) {
    return FIELD_MERGE_KEYS.includes(key) && isObject(local) && isObject(remote) && (typeof base === 'undefined' || isObject(base));
  }
  function fieldNames(...records) {
    return [...new Set(records.flatMap((record) => Object.keys(record || {})))].sort();
  }
  function readShortcuts(values, overflow) {
    const stored = SHORTCUT_KEYS.flatMap((key) => Array.isArray(values[key]) ? values[key] : []);
    const extra = Array.isArray(overflow) ? overflow : (Array.isArray(overflow && overflow.items) ? overflow.items : []);
    return shortcutStore.normalizeShortcuts(overflow && overflow.authoritative === true ? extra : [...stored, ...extra]);
  }
  function selectPreferences(values) {
    return Object.fromEntries([...PREFERENCE_KEYS, ...LOCAL_PREFERENCE_KEYS]
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
  // A first join that merges keeps the server's settings and selection, and adds this
  // device's wallpapers to them: uploads not already on the server (the same image
  // counts once) and links to new addresses. Nothing is dropped to fit; a merge
  // past the sync limits fails with merge-too-large and changes nothing.
  function mergeInitialWallpapers(local, remote) {
    const remoteImages = new Set(remote.wallpapers.map((item) => item.image));
    const remoteIds = new Set(remote.wallpapers.map((item) => item.id));
    const wallpapers = remote.wallpapers.concat(local.wallpapers.filter((item) =>
      !remoteImages.has(item.image) && !remoteIds.has(item.id)));
    const data = { ...remote.data };
    const remoteLinks = Array.isArray(remote.data[LINK_WALLPAPERS_KEY]) ? remote.data[LINK_WALLPAPERS_KEY] : [];
    const localLinks = Array.isArray(local.data[LINK_WALLPAPERS_KEY]) ? local.data[LINK_WALLPAPERS_KEY] : [];
    const linkUrls = new Set(remoteLinks.map((item) => item && item.url));
    const linkIds = new Set(remoteLinks.map((item) => item && item.id));
    const links = remoteLinks.concat(localLinks.filter((item) => item && !linkUrls.has(item.url) && !linkIds.has(item.id)));
    if (LINK_WALLPAPERS_KEY && links.length) {
      if (byteLength(JSON.stringify(links)) > MAX_LINK_WALLPAPERS_BYTES) fail('merge-too-large');
      data[LINK_WALLPAPERS_KEY] = links;
    }
    try {
      return validateState({ version: Math.max(local.version, remote.version), data, shortcuts: remote.shortcuts,
        icons: remote.icons, wallpapers, assets: { ...local.assets, ...remote.assets } });
    } catch (cause) {
      if (cause.code === 'state-too-large') fail('merge-too-large');
      throw cause;
    }
  }
  // Whole lists are deliberate merge domains in v1. Sorting and deletes cannot
  // safely be resolved by joining arrays or choosing a device timestamp, so a
  // list both sides changed apart is a conflict. Any other value is a single
  // setting: this device's edit reached WebDAV within seconds, so it is the
  // latest one and wins without asking.
  // Every part merges on its own. Chrome sync delivers shared keys before
  // WebDAV delivers local-only ones (wallpaper selection, icons), and a
  // half-arrived edit must not look like a second device's change.
  function mergeStates(base, local, remote, resolution) {
    const conflicts = [];
    function choose(key, previous, left, right) {
      if (equal(left, right) || equal(right, previous)) return left;
      if (equal(left, previous)) return right;
      if (resolution === 'remote') return right;
      if (resolution === 'local' || ![previous, left, right].some(Array.isArray)) return left;
      conflicts.push(key);
      return left;
    }
    function chooseFields(key, previous, left, right) {
      const record = {};
      fieldNames(previous, left, right).forEach((field) => {
        const value = choose(key, (previous || {})[field], (left || {})[field], (right || {})[field]);
        if (typeof value !== 'undefined') record[field] = value;
      });
      return record;
    }
    const data = {};
    [...PREFERENCE_KEYS, ...LOCAL_PREFERENCE_KEYS].forEach((key) => {
      const value = fieldMergeable(key, base.data[key], local.data[key], remote.data[key])
        ? chooseFields(key, base.data[key], local.data[key], remote.data[key])
        : choose(key, base.data[key], local.data[key], remote.data[key]);
      if (typeof value !== 'undefined') data[key] = value;
    });
    const shortcutList = choose('shortcuts', base.shortcuts, local.shortcuts, remote.shortcuts);
    const ids = new Set(shortcutList.map((item) => item.id));
    const icons = Object.fromEntries(Object.entries(chooseFields('shortcuts', base.icons, local.icons, remote.icons))
      .filter(([id]) => ids.has(id)));
    const wallpapers = choose('wallpapers', base.wallpapers, local.wallpapers, remote.wallpapers);
    const state = validateState({ version: Math.max(base.version, local.version, remote.version), data,
      shortcuts: shortcutList, icons, wallpapers, assets: { ...base.assets, ...remote.assets, ...local.assets } });
    return { state, conflicts: [...new Set(conflicts)] };
  }
  // A conflict summary is display data only: names are capped and values are
  // reduced to their kind, so it never ships full shortcut lists or images.
  const SUMMARY_NAMES = 6;
  function names(list, name) {
    return { names: list.slice(0, SUMMARY_NAMES).map(name), count: list.length };
  }
  function summarizeValue(value) {
    if (typeof value === 'undefined' || value === null) return { kind: 'unset' };
    if (typeof value === 'boolean') return { kind: 'boolean', value };
    if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
    if (typeof value === 'string' && value.length <= 40) return { kind: 'text', value };
    if (Array.isArray(value)) return { kind: 'list', count: value.length };
    return { kind: 'changed' };
  }
  function describeList(before, after, name, changedItem) {
    const previous = new Map(before.map((item) => [item.id, item]));
    const next = new Set(after.map((item) => item.id));
    const kept = after.filter((item) => previous.has(item.id));
    return {
      total: after.length,
      added: names(after.filter((item) => !previous.has(item.id)), name),
      removed: names(before.filter((item) => !next.has(item.id)), name),
      changed: names(kept.filter((item) => changedItem(item, previous.get(item.id))), name),
      reordered: !equal(kept.map((item) => item.id), before.filter((item) => next.has(item.id)).map((item) => item.id))
    };
  }
  function describeShortcuts(base, side) {
    return describeList(base.shortcuts, side.shortcuts, (item) => String(item.title || item.url || '').slice(0, 60),
      (item, previous) => !equal(item, previous) || side.icons[item.id] !== base.icons[item.id]);
  }
  function describeWallpapers(base, side) {
    const summary = describeList(base.wallpapers, side.wallpapers, (item) => String(item.name || '').slice(0, 60),
      (item, previous) => item.image !== previous.image || item.name !== previous.name);
    summary.selectionChanged = !equal(side.data[LOCAL_WALLPAPER_KEY], base.data[LOCAL_WALLPAPER_KEY]) ||
      !equal(side.data[WALLPAPER_KEY], base.data[WALLPAPER_KEY]);
    return summary;
  }
  // A folder color entry also carries the folder's creation time; only the
  // color means anything to the person choosing a side.
  function fieldValue(key, value) {
    return key === settings.BOOKMARK_FOLDER_COLOR_REFS_STORAGE_KEY && isObject(value) ? value.color : value;
  }
  // A field-merged record lists only the fields both sides changed apart.
  function describeFields(key, previous, left, right) {
    return fieldNames(previous, left, right).filter((field) => {
      const before = (previous || {})[field];
      return !equal(left[field], right[field]) && !equal(left[field], before) && !equal(right[field], before);
    }).map((field) => ({ key, field, domain: 'preference', local: summarizeValue(fieldValue(key, left[field])),
      remote: summarizeValue(fieldValue(key, right[field])) }));
  }
  function describeConflict(base, local, remote, keys) {
    return [...new Set(keys)].flatMap((key) => {
      if (key === 'shortcuts') return { key, domain: 'shortcuts', local: describeShortcuts(base, local), remote: describeShortcuts(base, remote) };
      if (key === 'wallpapers') return { key, domain: 'wallpapers', local: describeWallpapers(base, local), remote: describeWallpapers(base, remote) };
      if (fieldMergeable(key, base.data[key], local.data[key], remote.data[key])) {
        return describeFields(key, base.data[key], local.data[key], remote.data[key]);
      }
      return { key, domain: 'preference', local: summarizeValue(local.data[key]), remote: summarizeValue(remote.data[key]) };
    });
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
  return Object.freeze({ SHORTCUT_KEYS, FIELD_MERGE_KEYS, OVERFLOW_KEY, ICONS_KEY, WALLPAPER_KEY, LOCAL_WALLPAPER_KEY, LOCAL_PREFERENCE_KEYS,
    PREFERENCE_KEYS, MAX_STATE_BYTES, MAX_ASSET_BYTES, canonical, equal, byteLength, readShortcuts,
    selectPreferences, validateState, mergeStates, mergeInitialWallpapers, describeConflict, planChromeBackup });
});
