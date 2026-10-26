// Validating a WebDAV state read from a server or another device.
import * as ShortcutNormalize from '../shortcuts/normalize';
import type { ShortcutGroup } from '../shortcuts/types';
import { GROUPED_STATE_VERSION, HASH_PATTERN, LEGACY_MAX_SHORTCUTS, MAX_ASSET_BYTES, MAX_SHORTCUTS, MAX_STATE_BYTES, WebDavContractError, byteLength, collectAssets, fail, isAssetMime, isObject, isWholeNumber, own, selectPreferences } from './state-base';
import type { WebDavAsset, WebDavAssetMime, WebDavState, WebDavWallpaper } from './types';

// A state from the server, a saved baseline or this device, checked and
// reduced to what this version keeps. Throws a WebDavContractError.
type StateRecord = Record<string, unknown> & {
  version: number;
  data: Record<string, unknown>;
  shortcuts: unknown[];
  icons: Record<string, unknown>;
  wallpapers: unknown[];
  assets: Record<string, unknown>;
};

// The state's top-level shape and size.
function readStateEnvelope(value: unknown): StateRecord {
  if (!isObject(value) || !(value.version === 1 || value.version === 2 || value.version === GROUPED_STATE_VERSION) ||
      !isObject(value.data) || !Array.isArray(value.shortcuts) || !isObject(value.icons) ||
      !Array.isArray(value.wallpapers) || !isObject(value.assets)) fail('invalid-state');
  const state: StateRecord = { ...value, version: value.version, data: value.data, shortcuts: value.shortcuts,
    icons: value.icons, wallpapers: value.wallpapers, assets: value.assets };
  const grouped = state.version >= GROUPED_STATE_VERSION;
  if (byteLength(JSON.stringify(value)) > MAX_STATE_BYTES ||
      state.shortcuts.length > (grouped ? MAX_SHORTCUTS : LEGACY_MAX_SHORTCUTS) || state.wallpapers.length > 256) fail('state-too-large');
  return state;
}

// The shortcut groups, each shortcut naming one of them. Older states have
// no groups; their shortcuts all belong to the default one.
function readStateGroups(value: StateRecord, grouped: boolean): ShortcutGroup[] {
  if (!grouped) {
    return ShortcutNormalize.normalizeShortcutGroups(null);
  }
  const rawGroups: unknown = value.groups;
  if (!Array.isArray(rawGroups) || !rawGroups.length) fail('invalid-shortcuts');
  const groupList: unknown[] = rawGroups;
  const groups = ShortcutNormalize.normalizeShortcutGroups(groupList);
  if (groups.length !== groupList.length || groupList.some((group, index) => !isObject(group) ||
      group.id !== groups[index].id)) fail('invalid-shortcuts');
  const groupIds = new Set(groups.map((group) => group.id));
  if (value.shortcuts.some((item) => !isObject(item) || typeof item.groupId !== 'string' || !groupIds.has(item.groupId))) {
    fail('invalid-shortcuts');
  }
  return groups;
}

// The shortcuts, all valid, with unique ids and only portable folders.
function readStateShortcuts(value: StateRecord, groups: ShortcutGroup[], grouped: boolean) {
  const rawShortcuts = value.shortcuts;
  const shortcutState = ShortcutNormalize.normalizeShortcutState({ groups, items: grouped ? rawShortcuts
    : rawShortcuts.map((item) => {
      if (!isObject(item)) return item;
      const { groupId: _ignored, ...rest } = item;
      return rest;
    }) });
  const shortcuts = shortcutState.items;
  if (shortcuts.length !== rawShortcuts.length || shortcuts.some((item) => ShortcutNormalize.isShortcutFolder(item) &&
      (value.version < 2 || !ShortcutNormalize.isPortableFolder(item)))) fail('invalid-shortcuts');
  if (rawShortcuts.some((item) => isObject(item) && item.type === 'folder' && own(item, 'folderId'))) fail('invalid-shortcuts');
  if (new Set(shortcuts.map((item) => item.id)).size !== shortcuts.length) fail('invalid-shortcuts');
  return shortcutState;
}

function readStateAssets(rawAssets: Record<string, unknown>): Record<string, WebDavAsset> {
  const assets: Record<string, WebDavAsset> = {};
  Object.entries(rawAssets).forEach(([hash, asset]) => {
    if (!HASH_PATTERN.test(hash) || !isObject(asset) || !isAssetMime(asset.mime) ||
        !isWholeNumber(asset.size) || asset.size <= 0 || asset.size > MAX_ASSET_BYTES) fail('invalid-asset');
    assets[hash] = { mime: asset.mime, size: asset.size };
  });
  return assets;
}

// A reference to a listed asset of the expected type and size.
function createAssetRefChecker(assets: Record<string, WebDavAsset>) {
  return (hash: unknown, mime: WebDavAssetMime, maxSize: number): string => {
    const ref = String(hash);
    if (!HASH_PATTERN.test(ref) || !own(assets, ref) || assets[ref].mime !== mime || assets[ref].size > maxSize) fail('invalid-asset');
    return ref;
  };
}

function readStateWallpapers(rawWallpapers: unknown[], checkRef: ReturnType<typeof createAssetRefChecker>): WebDavWallpaper[] {
  const wallpaperIds = new Set<string>();
  return rawWallpapers.map((item): WebDavWallpaper => {
    if (!isObject(item)) return fail('invalid-wallpaper');
    const { id, width, height, updatedAt } = item;
    if (typeof id !== 'string' || !/^custom-wallpaper-[-\w]{1,120}$/.test(id) || wallpaperIds.has(id) ||
        !isWholeNumber(width) || !isWholeNumber(height) || width < 1 || width > 8192 ||
        height < 1 || height > 8192 || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) fail('invalid-wallpaper');
    wallpaperIds.add(id);
    const image = checkRef(item.image, 'image/webp', MAX_ASSET_BYTES);
    const thumbnail = checkRef(item.thumbnail, 'image/webp', 160 * 1024);
    return { id, name: String(item.name || '').slice(0, 200), width, height, updatedAt, image, thumbnail };
  });
}

// The preference keys a state carries, when it lists them.
function readStateKeys(rawKeys: unknown): string[] {
  if (!Array.isArray(rawKeys) || rawKeys.length > 2000) fail('invalid-state');
  const keys: string[] = [];
  for (const key of rawKeys) {
    if (typeof key !== 'string' || key.length > 200) fail('invalid-state');
    keys.push(key);
  }
  return [...new Set(keys)].sort();
}

function validateState(input: unknown): WebDavState {
  const value = readStateEnvelope(input);
  const grouped = value.version >= GROUPED_STATE_VERSION;
  const shortcutState = readStateShortcuts(value, readStateGroups(value, grouped), grouped);
  const shortcuts = shortcutState.items;
  const ids = new Set(shortcuts.map((item) => item.id));
  const assets = readStateAssets(value.assets);
  const checkRef = createAssetRefChecker(assets);
  const icons: Record<string, string> = Object.fromEntries(Object.entries(value.icons).map(([id, hash]) => {
    if (!ids.has(id)) fail('invalid-icon');
    return [id, checkRef(hash, 'image/png', 96 * 1024)];
  }));
  const wallpapers = readStateWallpapers(value.wallpapers, checkRef);
  const state: WebDavState = { version: value.version, data: selectPreferences(value.data), groups: shortcutState.groups,
    shortcuts, icons, wallpapers, assets };
  if (own(value, 'keys')) {
    state.keys = readStateKeys(value.keys);
  }
  state.assets = collectAssets(state);
  return state;
}

function isWebDavContractError(value: unknown): value is WebDavContractError {
  return value instanceof WebDavContractError;
}

export {
  createAssetRefChecker,
  isWebDavContractError,
  readStateAssets,
  readStateEnvelope,
  readStateGroups,
  readStateKeys,
  readStateShortcuts,
  readStateWallpapers,
  validateState
};
export type {
  StateRecord
};
