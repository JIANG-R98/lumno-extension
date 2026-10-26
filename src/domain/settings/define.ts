// One persisted value: where it is stored, how it travels between devices,
// and how a stored value is read back.
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

interface SettingSpec<T> {
  // The storage key. Never changes once released: stored data and older
  // devices use it.
  key: string;
  area: SettingArea;
  schema: Schema<T>;
  sync?: SettingSync;
}

interface Setting<T> {
  readonly key: string;
  readonly area: SettingArea;
  readonly sync: SettingSync;
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
    default: schema.parse(undefined),
    parse: (value: unknown) => schema.parse(value)
  });
}

interface SettingFamilySpec<T> {
  // What every key of the family starts with; the rest is the member's id.
  prefix: string;
  area: SettingArea;
  schema: Schema<T>;
}

// Values stored under one key each, named by an id known only at run time
// (a tab, a release version, a WebDAV connection).
interface SettingFamily<T> {
  readonly prefix: string;
  readonly area: SettingArea;
  keyFor(id: string | number): string;
  // The id a key of this family names, or null for any other key.
  idOf(key: string): string | null;
  parse(value: unknown): T;
  // One member as a setting of its own, so a store can read, write and
  // follow it like any other; the same member is always the same object.
  member(id: string | number): Setting<T>;
}

function defineSettingFamily<T>(spec: SettingFamilySpec<T>): SettingFamily<T> {
  const { prefix, schema } = spec;
  const members = new Map<string, Setting<T>>();
  const keyFor = (id: string | number) => `${prefix}${id}`;
  const parse = (value: unknown) => schema.parse(value);
  function member(id: string | number): Setting<T> {
    const key = keyFor(id);
    const known = members.get(key);
    if (known) return known;
    const created: Setting<T> = Object.freeze({
      key,
      area: spec.area,
      sync: 'none',
      default: schema.parse(undefined),
      parse
    });
    members.set(key, created);
    return created;
  }
  return Object.freeze({
    prefix,
    area: spec.area,
    keyFor,
    idOf: (key: string) => (key.startsWith(prefix) ? key.slice(prefix.length) : null),
    parse,
    member
  });
}

export { defineSetting, defineSettingFamily };
export type { Setting, SettingArea, SettingFamily, SettingFamilySpec, SettingSpec, SettingSync };
