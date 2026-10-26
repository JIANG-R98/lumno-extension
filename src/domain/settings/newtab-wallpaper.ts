// The New Tab wallpaper and favicon. The values' shapes belong to the
// wallpaper runtime (newtab/wallpaper/); the registry declares where they
// live and how they travel.
import { defineSetting } from './define';
import { opaque } from './schema';

// The wallpaper mode and the chosen built-in or online wallpaper.
const newtabWallpaper = defineSetting({
  key: '_x_extension_newtab_wallpaper_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

// The selected local wallpaper. Browser sync carries no images, so it stays
// on the device and travels only through WebDAV, which carries the images.
const newtabLocalWallpaper = defineSetting({
  key: '_x_extension_newtab_local_wallpaper_2026_unique_',
  area: 'device',
  sync: 'webdav',
  schema: opaque()
});

// Online wallpaper picks live apart from the shared wallpaper key, which
// older versions sanitize.
const newtabOnlineWallpaper = defineSetting({
  key: '_x_extension_newtab_online_wallpaper_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

// Wallpapers added from a link sync as their URLs; each device caches the
// image itself.
const newtabLinkWallpapers = defineSetting({
  key: '_x_extension_newtab_link_wallpapers_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

// A photo picked while a daily wallpaper is on replaces it until the local
// date changes.
const newtabDailyWallpaperPicks = defineSetting({
  key: '_x_extension_newtab_daily_wallpaper_picks_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

// Curated categories left out of the random mix; empty keeps every category in.
const newtabCuratedMixExcluded = defineSetting({
  key: '_x_extension_newtab_curated_mix_excluded_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

const newtabWallpaperOverlay = defineSetting({
  key: '_x_extension_newtab_wallpaper_overlay_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

const newtabWallpaperEffect = defineSetting({
  key: '_x_extension_newtab_wallpaper_effect_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

const newtabFavicon = defineSetting({
  key: '_x_extension_newtab_favicon_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

// What the next New Tab paints before its scripts load: the wallpaper, the
// favicon, and the ink the glass plates take over it.
const newtabWallpaperPreload = defineSetting({
  key: '_x_extension_newtab_wallpaper_preload_2026_unique_',
  area: 'page',
  schema: opaque()
});

const newtabFaviconPreload = defineSetting({
  key: '_x_extension_newtab_favicon_preload_2026_unique_',
  area: 'page',
  schema: opaque()
});

const newtabGlassInkHint = defineSetting({
  key: '_x_extension_newtab_glass_ink_hint_2026_unique_',
  area: 'page',
  schema: opaque()
});

// The Bing catalog, today's Bing photo and its credits.
const bingCatalogCache = defineSetting({
  key: '_x_extension_bing_catalog_cache_2026_unique_',
  area: 'cache',
  schema: opaque()
});

const bingDailyCache = defineSetting({
  key: '_x_extension_bing_daily_cache_2026_unique_',
  area: 'cache',
  schema: opaque()
});

const bingWallpaperMeta = defineSetting({
  key: '_x_extension_bing_wallpaper_meta_2026_unique_',
  area: 'cache',
  schema: opaque()
});

export {
  bingCatalogCache,
  bingDailyCache,
  bingWallpaperMeta,
  newtabCuratedMixExcluded,
  newtabDailyWallpaperPicks,
  newtabFavicon,
  newtabFaviconPreload,
  newtabGlassInkHint,
  newtabLinkWallpapers,
  newtabLocalWallpaper,
  newtabOnlineWallpaper,
  newtabWallpaper,
  newtabWallpaperEffect,
  newtabWallpaperOverlay,
  newtabWallpaperPreload
};
