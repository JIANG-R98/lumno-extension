// Shortcut limits, storage keys and sync budgets, and the shortcuts a new
// install starts with.
import { newtabShortcutsGroupChunk2, newtabShortcutsGroupChunk3, newtabShortcutsGroupHead, newtabShortcutsLegacy, newtabShortcutsLegacyChunk2, newtabShortcutsLegacyChunk3 } from '../settings/newtab-shortcuts';
import type { ShortcutIconPlate, ShortcutIconSource } from './types';

const DEFAULT_MAX_SHORTCUTS = 200;
const DEFAULT_MAX_SHORTCUT_GROUPS = 20;
const SHORTCUT_GROUP_TITLE_MAX_LENGTH = 24;
const DEFAULT_SHORTCUT_GROUP_ID = 'g0';
const SHORTCUTS_STORAGE_VERSION = 2;
const SHORTCUTS_SYNC_KEYS: readonly string[] = Object.freeze([
  newtabShortcutsGroupHead.key,
  newtabShortcutsGroupChunk2.key,
  newtabShortcutsGroupChunk3.key
]);
const LEGACY_SHORTCUTS_CHUNK_KEYS: readonly string[] = Object.freeze([
  newtabShortcutsLegacy.key,
  newtabShortcutsLegacyChunk2.key,
  newtabShortcutsLegacyChunk3.key
]);
const SHORTCUT_STORAGE_KEYS: readonly string[] = Object.freeze([...SHORTCUTS_SYNC_KEYS, ...LEGACY_SHORTCUTS_CHUNK_KEYS]);
// Every older device has updated long before this, so the legacy copy can
// give its sync bytes back.
const LEGACY_SHORTCUTS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// chrome.storage.sync allows 8192 bytes per item; keep a margin under it.
const DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES = 7680;
// Shortcuts never take more than this from browser sync, legacy copy included.
const DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES =
  DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES * SHORTCUTS_SYNC_KEYS.length;
// Browser sync space shortcuts must leave to every other setting.
const DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES = 64 * 1024;
const DEFAULT_SYNC_QUOTA_BYTES = 100 * 1024;
const DEFAULT_SHORTCUTS: ReadonlyArray<Readonly<{ id: string; title: string; url: string }>> = Object.freeze([
  Object.freeze({
    id: 'shortcut-lumno-default',
    title: 'Lumno',
    url: 'https://lumno.kubai.design/'
  })
]);
const BROWSER_INTERNAL_PROTOCOLS: ReadonlySet<string> = new Set([
  'chrome:', 'edge:', 'brave:', 'vivaldi:', 'opera:'
]);
const ICON_SOURCES: ReadonlySet<string> = new Set<ShortcutIconSource>(['service', 'favicon-is', 'cache', 'custom', 'builtin']);
const ICON_PLATE_MODES: ReadonlySet<string> = new Set<ShortcutIconPlate>(['on', 'off']);
const ICON_PLATE_COLOR_PATTERN = /^#[\dA-F]{6}$/;
const ID_PATTERN = /^[\w-]{1,120}$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export {
  BROWSER_INTERNAL_PROTOCOLS,
  DEFAULT_MAX_SHORTCUTS,
  DEFAULT_MAX_SHORTCUT_GROUPS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES,
  DEFAULT_SHORTCUTS_SYNC_RESERVE_BYTES,
  DEFAULT_SHORTCUTS_SYNC_TOTAL_BUDGET_BYTES,
  DEFAULT_SHORTCUT_GROUP_ID,
  DEFAULT_SYNC_QUOTA_BYTES,
  ICON_PLATE_COLOR_PATTERN,
  ICON_PLATE_MODES,
  ICON_SOURCES,
  ID_PATTERN,
  LEGACY_SHORTCUTS_CHUNK_KEYS,
  LEGACY_SHORTCUTS_RETENTION_MS,
  SCHEME_PATTERN,
  SHORTCUTS_STORAGE_VERSION,
  SHORTCUTS_SYNC_KEYS,
  SHORTCUT_GROUP_TITLE_MAX_LENGTH,
  SHORTCUT_STORAGE_KEYS
};
