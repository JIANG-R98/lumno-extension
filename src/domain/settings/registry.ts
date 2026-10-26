// Every persisted value, collected from the area modules, and the lists
// derived from their declarations: what browser sync, WebDAV and settings
// transfer carry, and what each storage area holds.
import * as Appearance from './appearance';
import * as Bookmarks from './bookmarks';
import type { Setting, SettingArea } from './define';
import * as Features from './features';
import * as Locale from './locale';
import * as NewtabPage from './newtab-page';
import * as NewtabQuote from './newtab-quote';
import * as NewtabShortcuts from './newtab-shortcuts';
import * as NewtabTime from './newtab-time';
import * as NewtabWallpaper from './newtab-wallpaper';
import * as Overlay from './overlay-panel';
import * as PageCache from './page-cache';
import * as RecentSites from './recent-sites';
import * as Search from './search';
import * as SyncState from './sync-state';

const AREA_MODULES: readonly object[] = [
  Locale,
  Appearance,
  NewtabPage,
  NewtabShortcuts,
  NewtabTime,
  NewtabQuote,
  NewtabWallpaper,
  Bookmarks,
  RecentSites,
  Search,
  Overlay,
  Features,
  SyncState,
  PageCache
];

function isSetting(value: unknown): value is Setting<unknown> {
  return Boolean(value) && typeof value === 'object' &&
    typeof Reflect.get(Object(value), 'key') === 'string' &&
    typeof Reflect.get(Object(value), 'parse') === 'function' &&
    typeof Reflect.get(Object(value), 'area') === 'string';
}

const ALL_SETTINGS: readonly Setting<unknown>[] = Object.freeze(
  AREA_MODULES.flatMap((module) => Object.values(module).filter(isSetting))
);

const SETTINGS_BY_KEY: ReadonlyMap<string, Setting<unknown>> = new Map(ALL_SETTINGS.map((setting) => [setting.key, setting]));

function getSetting(key: string): Setting<unknown> | undefined {
  return SETTINGS_BY_KEY.get(key);
}

function keysOf(settings: readonly Setting<unknown>[]): readonly string[] {
  return Object.freeze(settings.map((setting) => setting.key));
}

function settingsIn(area: SettingArea): readonly Setting<unknown>[] {
  return ALL_SETTINGS.filter((setting) => setting.area === area);
}

// The preferences browser sync, settings transfer and WebDAV carry.
const BROWSER_SYNC_KEYS = keysOf(ALL_SETTINGS.filter((setting) => setting.sync === 'browser'));

// Device values WebDAV carries but browser sync never does.
const WEBDAV_ONLY_KEYS = keysOf(ALL_SETTINGS.filter((setting) => setting.sync === 'webdav'));

// What the diagnostics file may show: every value it does not omit.
const DIAGNOSTIC_SETTINGS: readonly Setting<unknown>[] = Object.freeze(
  ALL_SETTINGS.filter((setting) => setting.diagnostics !== 'omit')
);

export { ALL_SETTINGS, BROWSER_SYNC_KEYS, DIAGNOSTIC_SETTINGS, WEBDAV_ONLY_KEYS, getSetting, isSetting, keysOf, settingsIn };
