// One persisted value: where it is stored, how it travels between devices,
// what the diagnostics file shows of it, and how a stored value is read back.
import type { Schema } from './schema';

// preferences: the area the user keeps settings in (browser sync, or this
//   device's local area when they keep settings on the device).
// browserSync: always chrome.storage.sync, whatever the user keeps settings
//   in (a record other devices read, never a preference).
// device: always chrome.storage.local; this device's own state.
// cache: chrome.storage.local, and safe to drop at any time.
// session: chrome.storage.session, gone when the browser closes.
// page: a page's window.localStorage, a copy a page reads before storage
//   answers.
// tab: a page's window.sessionStorage, kept for one tab.
type SettingArea = 'preferences' | 'browserSync' | 'device' | 'cache' | 'session' | 'page' | 'tab';

// browser: carried by browser sync, settings transfer and WebDAV.
// webdav: carried by WebDAV only (it is too large for browser sync or is
//   chosen against this device's wallpaper).
// none: stays where it is.
type SettingSync = 'browser' | 'webdav' | 'none';

// value: switches, numbers and option names as they are; free text, lists
//   and objects reduced to their type and size.
// shape: always reduced to its type and size.
// omit: left out of the file.
type SettingDiagnostics = 'value' | 'shape' | 'omit';

interface SettingSpec<T> {
  // The storage key. Never changes once released: stored data and older
  // devices use it.
  key: string;
  area: SettingArea;
  schema: Schema<T>;
  sync?: SettingSync;
  diagnostics?: SettingDiagnostics;
}

interface Setting<T> {
  readonly key: string;
  readonly area: SettingArea;
  readonly sync: SettingSync;
  readonly diagnostics: SettingDiagnostics;
  // What the setting reads as when nothing is stored.
  readonly default: T;
  parse(value: unknown): T;
}

function defineSetting<T>(spec: SettingSpec<T>): Setting<T> {
  const sync = spec.sync || 'none';
  if (sync === 'browser' && spec.area !== 'preferences') {
    throw new Error(`${spec.key}: only preferences travel through browser sync.`);
  }
  if (sync === 'webdav' && spec.area !== 'device') {
    throw new Error(`${spec.key}: WebDAV-only values are device values.`);
  }
  const { schema } = spec;
  return Object.freeze({
    key: spec.key,
    area: spec.area,
    sync,
    diagnostics: spec.diagnostics || (spec.area === 'preferences' ? 'value' : 'omit'),
    default: schema.parse(undefined),
    parse: (value: unknown) => schema.parse(value)
  });
}

export { defineSetting };
export type { Setting, SettingArea, SettingDiagnostics, SettingSpec, SettingSync };
