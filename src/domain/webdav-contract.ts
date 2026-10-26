// The state WebDAV carries between devices: preferences, shortcuts with
// their icons, and custom wallpapers with their images, plus the rules for
// validating a state, merging two of them and backing one up to browser
// sync.
import * as settings from './settings';
import * as shortcutStore from './shortcuts-store';
import type { GroupedShortcutItem, ShortcutGroup, ShortcutStateRead } from './shortcuts-store';
import type { WebDavOperation } from './messages';
import type { StorageItems } from './storage-port';
import { customQuotes } from './settings/newtab-quote';
import { newtabShortcutIcons, newtabShortcutsLocalOverflow } from './settings/newtab-shortcuts';

type WebDavAssetMime = 'image/png' | 'image/webp';

// An image stored next to the state under its SHA-256 hash.
interface WebDavAsset {
  mime: WebDavAssetMime;
  size: number;
}

interface WebDavWallpaper {
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: number;
  // Asset hashes.
  image: string;
  thumbnail: string;
}

interface WebDavState {
  // 1: links only; 2: portable folders; 3: shortcut groups.
  version: number;
  // Preference values by storage key.
  data: StorageItems;
  groups: ShortcutGroup[];
  shortcuts: GroupedShortcutItem[];
  // Shortcut id to icon asset hash.
  icons: Record<string, string>;
  wallpapers: WebDavWallpaper[];
  assets: Record<string, WebDavAsset>;
  // Every preference key the writer knew; absent from states written by
  // 1.0.0 or earlier.
  keys?: string[];
}

type WebDavErrorCode =
  | 'invalid-state'
  | 'state-too-large'
  | 'invalid-shortcuts'
  | 'invalid-asset'
  | 'invalid-icon'
  | 'invalid-wallpaper'
  | 'merge-too-large';

// How a conflict side should resolve: take the remote or the local value,
// or report the conflict.
type MergeResolution = 'remote' | 'local' | null | undefined;

interface MergeResult {
  state: WebDavState;
  // Keys, or 'shortcuts' / 'wallpapers', both sides changed apart.
  conflicts: string[];
}

// Up to SUMMARY_NAMES display names of a set, and its size.
interface NameSample {
  names: string[];
  count: number;
}

type ValueSummary =
  | { kind: 'unset' }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'list'; count: number }
  | { kind: 'changed' };

interface ListChangeSummary {
  total: number;
  added: NameSample;
  removed: NameSample;
  changed: NameSample;
  reordered: boolean;
  // Wallpapers only: the selected wallpaper changed.
  selectionChanged?: boolean;
}

type ConflictDescription =
  | { key: 'shortcuts'; domain: 'shortcuts'; local: ListChangeSummary; remote: ListChangeSummary }
  | { key: 'wallpapers'; domain: 'wallpapers'; local: ListChangeSummary; remote: ListChangeSummary }
  | { key: string; field?: string; domain: 'preference'; local: ValueSummary; remote: ValueSummary };

interface ChromeBackupOptions {
  // chrome.storage.sync's total, per-item and item-count limits.
  quota?: number;
  itemQuota?: number;
  maxItems?: number;
}

interface ChromeBackupPlan {
  payload: StorageItems;
  remove: string[];
  // Keys that did not fit and keep their last browser sync copy.
  skipped: string[];
  complete: boolean;
}

class WebDavContractError extends Error {
  code: WebDavErrorCode;

  constructor(code: WebDavErrorCode) {
    super(code);
    this.code = code;
  }
}

// Grouped and legacy shortcut keys: none of them is a plain preference.
const SHORTCUT_KEYS = shortcutStore.SHORTCUT_STORAGE_KEYS;
const SHORTCUT_SYNC_KEYS = shortcutStore.SHORTCUTS_SYNC_KEYS;
const OVERFLOW_KEY = newtabShortcutsLocalOverflow.key;
// Version 3 states carry shortcut groups and more shortcuts than older
// versions accept; a state is only written as version 3 when it needs to be.
const GROUPED_STATE_VERSION = 3;
const LEGACY_MAX_SHORTCUTS = 60;
const MAX_SHORTCUTS = shortcutStore.DEFAULT_MAX_SHORTCUTS;
const ICONS_KEY = newtabShortcutIcons.key;
const WALLPAPER_KEY = settings.newtabWallpaper.key;
const LOCAL_WALLPAPER_KEY = settings.newtabLocalWallpaper.key;
// Browser sync stores the link list as one item of at most 8 KB.
const MAX_LINK_WALLPAPERS_BYTES = 8000;
const PREFERENCE_KEYS: readonly string[] = settings.BROWSER_SYNC_KEYS.filter((key) => !SHORTCUT_KEYS.includes(key));
const LOCAL_PREFERENCE_KEYS: readonly string[] = [LOCAL_WALLPAPER_KEY, ...settings.BOOKMARK_TOPBAR_WEBDAV_KEYS, customQuotes.key];
// Every preference this version reads and writes. A state carries its
// writer's list as `keys`, so a reader can tell a value the writer removed
// from one the writer never knew: an older version drops what it does not
// know whenever it saves. States without the list were written by 1.0.0 or
// earlier, which knew every key except these.
const KNOWN_KEYS: readonly string[] = Object.freeze([...PREFERENCE_KEYS, ...LOCAL_PREFERENCE_KEYS]);
const KEYS_UNKNOWN_TO_LEGACY_WRITERS: readonly string[] = Object.freeze([
  settings.newtabGlassStyle.key,
  settings.newtabGlassTheme.key,
  settings.newtabTimeFontSize.key,
  settings.newtabTimeOpacity.key,
  settings.newtabTimeFont.key,
  settings.newtabTimeInk.key,
  settings.newtabTime12Hour.key,
  settings.searchSourceOrder.key,
  customQuotes.key
]);
const FIELD_MERGE_KEYS: readonly string[] = [settings.newtabQuotePrefs.key,
  settings.bookmarkFolderColorRefs.key];
const MAX_STATE_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

function own(value: unknown, key: string): boolean {
  return Boolean(value) && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function fail(code: WebDavErrorCode): never {
  throw new WebDavContractError(code);
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(String(value)).byteLength;
}

// JSON with sorted object keys, so equal values compare equal.
function canonical(value: unknown): string {
  if (typeof value === 'undefined') return 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function equal(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

// Both sides must still hold a record; a deleted or replaced value is a
// whole-value change. A missing base record counts as an empty one.
function fieldMergeable(key: string, base: unknown, local: unknown, remote: unknown): boolean {
  return FIELD_MERGE_KEYS.includes(key) && isObject(local) && isObject(remote) && (typeof base === 'undefined' || isObject(base));
}

function fieldNames(...records: unknown[]): string[] {
  return [...new Set(records.flatMap((record) => Object.keys(asRecord(record))))].sort();
}

function writerKnows(state: Pick<WebDavState, 'keys'>, key: string): boolean {
  return Array.isArray(state.keys) ? state.keys.includes(key) : !KEYS_UNKNOWN_TO_LEGACY_WRITERS.includes(key);
}

// The other side's value for a key, or `fallback` when its writer never
// knew the key and so has no say in it.
function sideValue(state: Pick<WebDavState, 'keys' | 'data'>, key: string, fallback: unknown): unknown {
  return writerKnows(state, key) ? state.data[key] : fallback;
}

// Same content, whichever version wrote each side. Comparing writer lists
// too would make two versions rewrite the server after each other forever.
function sameContent(left: WebDavState | null | undefined, right: WebDavState | null | undefined): boolean {
  const { keys: _leftKeys, ...leftContent } = left || {};
  const { keys: _rightKeys, ...rightContent } = right || {};
  return equal(leftContent, rightContent);
}

// The remote state as this device applies it: values for keys its writer
// never knew stay as they are here.
function adoptRemote(local: WebDavState, remote: WebDavState): WebDavState {
  const data = { ...remote.data };
  KNOWN_KEYS.forEach((key) => {
    if (!writerKnows(remote, key) && own(local.data, key)) data[key] = local.data[key];
  });
  return validateState({ ...remote, data, keys: KNOWN_KEYS });
}

function readShortcutState(values: unknown, overflow: unknown): ShortcutStateRead {
  return shortcutStore.readShortcutState(values, overflow);
}

// Whether a state needs the grouped format: real groups, or more shortcuts
// than older versions accept.
function needsGroupedState(groups: unknown, shortcuts: readonly unknown[]): boolean {
  return !shortcutStore.isDefaultShortcutGroupLayout(groups) || shortcuts.length > LEGACY_MAX_SHORTCUTS;
}

function selectPreferences(values: unknown): StorageItems {
  const source = asRecord(values);
  return Object.fromEntries([...PREFERENCE_KEYS, ...LOCAL_PREFERENCE_KEYS]
    .filter((key) => own(source, key)).map((key) => [key, source[key]]));
}

// The assets the icons and wallpapers refer to, and no others.
function collectAssets(state: Omit<WebDavState, 'groups' | 'shortcuts' | 'data'>): Record<string, WebDavAsset> {
  const refs = [...Object.values(state.icons), ...state.wallpapers.flatMap((wallpaper) => [wallpaper.image, wallpaper.thumbnail])];
  return Object.fromEntries([...new Set(refs)].sort().map((hash) => [hash, state.assets[hash]]));
}

function isAssetMime(value: unknown): value is WebDavAssetMime {
  return value === 'image/png' || value === 'image/webp';
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

// A state from the server, a saved baseline or this device, checked and
// reduced to what this version keeps. Throws a WebDavContractError.
function validateState(value: unknown): WebDavState {
  if (!isObject(value) || !(value.version === 1 || value.version === 2 || value.version === GROUPED_STATE_VERSION) ||
      !isObject(value.data) || !Array.isArray(value.shortcuts) || !isObject(value.icons) ||
      !Array.isArray(value.wallpapers) || !isObject(value.assets)) fail('invalid-state');
  const version: number = value.version;
  const rawShortcuts: unknown[] = value.shortcuts;
  const rawWallpapers: unknown[] = value.wallpapers;
  const rawIcons = value.icons;
  const rawAssets = value.assets;
  const grouped = version >= GROUPED_STATE_VERSION;
  if (byteLength(JSON.stringify(value)) > MAX_STATE_BYTES ||
      rawShortcuts.length > (grouped ? MAX_SHORTCUTS : LEGACY_MAX_SHORTCUTS) || rawWallpapers.length > 256) fail('state-too-large');
  // Older states have no groups; their shortcuts all belong to the default one.
  let groups = shortcutStore.normalizeShortcutGroups(null);
  if (grouped) {
    const rawGroups: unknown = value.groups;
    if (!Array.isArray(rawGroups) || !rawGroups.length) fail('invalid-shortcuts');
    const groupList: unknown[] = rawGroups;
    groups = shortcutStore.normalizeShortcutGroups(groupList);
    if (groups.length !== groupList.length || groupList.some((group, index) => !isObject(group) ||
        group.id !== groups[index].id)) fail('invalid-shortcuts');
    const groupIds = new Set(groups.map((group) => group.id));
    if (rawShortcuts.some((item) => !isObject(item) || typeof item.groupId !== 'string' || !groupIds.has(item.groupId))) {
      fail('invalid-shortcuts');
    }
  }
  const shortcutState = shortcutStore.normalizeShortcutState({ groups, items: grouped ? rawShortcuts
    : rawShortcuts.map((item) => {
      if (!isObject(item)) return item;
      const { groupId: _ignored, ...rest } = item;
      return rest;
    }) });
  const shortcuts = shortcutState.items;
  if (shortcuts.length !== rawShortcuts.length || shortcuts.some((item) => shortcutStore.isShortcutFolder(item) &&
      (version < 2 || !shortcutStore.isPortableFolder(item)))) fail('invalid-shortcuts');
  if (rawShortcuts.some((item) => isObject(item) && item.type === 'folder' && own(item, 'folderId'))) fail('invalid-shortcuts');
  const ids = new Set(shortcuts.map((item) => item.id));
  if (ids.size !== shortcuts.length) fail('invalid-shortcuts');
  const assets: Record<string, WebDavAsset> = {};
  Object.entries(rawAssets).forEach(([hash, asset]) => {
    if (!HASH_PATTERN.test(hash) || !isObject(asset) || !isAssetMime(asset.mime) ||
        !isWholeNumber(asset.size) || asset.size <= 0 || asset.size > MAX_ASSET_BYTES) fail('invalid-asset');
    assets[hash] = { mime: asset.mime, size: asset.size };
  });
  const checkRef = (hash: unknown, mime: WebDavAssetMime, maxSize: number): string => {
    const ref = String(hash);
    if (!HASH_PATTERN.test(ref) || !own(assets, ref) || assets[ref].mime !== mime || assets[ref].size > maxSize) fail('invalid-asset');
    return ref;
  };
  const icons: Record<string, string> = Object.fromEntries(Object.entries(rawIcons).map(([id, hash]) => {
    if (!ids.has(id)) fail('invalid-icon');
    return [id, checkRef(hash, 'image/png', 96 * 1024)];
  }));
  const wallpaperIds = new Set<string>();
  const wallpapers = rawWallpapers.map((item): WebDavWallpaper => {
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
  const state: WebDavState = { version, data: selectPreferences(value.data), groups: shortcutState.groups, shortcuts,
    icons, wallpapers, assets };
  if (own(value, 'keys')) {
    const rawKeys: unknown = value.keys;
    if (!Array.isArray(rawKeys) || rawKeys.length > 2000) fail('invalid-state');
    const keys: string[] = [];
    for (const key of rawKeys) {
      if (typeof key !== 'string' || key.length > 200) fail('invalid-state');
      keys.push(key);
    }
    state.keys = [...new Set(keys)].sort();
  }
  state.assets = collectAssets(state);
  return state;
}

function isWebDavContractError(value: unknown): value is WebDavContractError {
  return value instanceof WebDavContractError;
}

// A first join that merges keeps the server's settings and selection, and adds this
// device's wallpapers to them: uploads not already on the server (the same image
// counts once) and links to new addresses. Nothing is dropped to fit; a merge
// past the sync limits fails with merge-too-large and changes nothing.
function mergeInitialWallpapers(local: WebDavState, remote: WebDavState): WebDavState {
  const remoteImages = new Set(remote.wallpapers.map((item) => item.image));
  const remoteIds = new Set(remote.wallpapers.map((item) => item.id));
  const wallpapers = remote.wallpapers.concat(local.wallpapers.filter((item) =>
    !remoteImages.has(item.image) && !remoteIds.has(item.id)));
  const data = { ...adoptRemote(local, remote).data };
  const remoteLinkValue = remote.data[settings.newtabLinkWallpapers.key];
  const localLinkValue = local.data[settings.newtabLinkWallpapers.key];
  const remoteLinks: unknown[] = Array.isArray(remoteLinkValue) ? remoteLinkValue : [];
  const localLinks: unknown[] = Array.isArray(localLinkValue) ? localLinkValue : [];
  const linkUrls = new Set(remoteLinks.map((item) => asRecord(item).url));
  const linkIds = new Set(remoteLinks.map((item) => asRecord(item).id));
  const links = remoteLinks.concat(localLinks.filter((item) => isObject(item) && !linkUrls.has(item.url) && !linkIds.has(item.id)));
  if (links.length) {
    if (byteLength(JSON.stringify(links)) > MAX_LINK_WALLPAPERS_BYTES) fail('merge-too-large');
    data[settings.newtabLinkWallpapers.key] = links;
  }
  try {
    return validateState({ version: Math.max(local.version, remote.version), data, groups: remote.groups,
      shortcuts: remote.shortcuts, icons: remote.icons, wallpapers, assets: { ...local.assets, ...remote.assets },
      keys: KNOWN_KEYS });
  } catch (cause) {
    if (isWebDavContractError(cause) && cause.code === 'state-too-large') fail('merge-too-large');
    throw cause;
  }
}

// A three-way merge against the last state both sides agreed on. Whatever
// only one side changed is taken from that side. A value both sides changed
// apart is a conflict for the person to resolve, whether it is a list or a
// single setting: a device that was offline or paused may hold the older
// edit, so neither side wins on its own. Sorting and deletes cannot safely be
// resolved by joining arrays, so whole lists stay single merge domains.
// Every part merges on its own. Chrome sync delivers shared keys before
// WebDAV delivers local-only ones (wallpaper selection, icons), and a
// half-arrived edit must not look like a second device's change.
function mergeStates(savedBase: unknown, local: WebDavState, remote: WebDavState, resolution?: MergeResolution): MergeResult {
  // A baseline saved by an older version still holds fields this version
  // drops; compare it in the same form as both sides.
  const base = validateState(savedBase);
  const conflicts: string[] = [];
  function choose<T>(key: string, previous: T, left: T, right: T): T {
    if (equal(left, right) || equal(right, previous)) return left;
    if (equal(left, previous)) return right;
    if (resolution === 'remote') return right;
    if (resolution === 'local') return left;
    conflicts.push(key);
    return left;
  }
  // Fields outside `only` are dropped before they could conflict.
  function chooseFields(key: string, previous: unknown, left: unknown, right: unknown, only?: ReadonlySet<string>): Record<string, unknown> {
    const before = asRecord(previous);
    const mine = asRecord(left);
    const theirs = asRecord(right);
    const record: Record<string, unknown> = {};
    fieldNames(previous, left, right).filter((field) => !only || only.has(field)).forEach((field) => {
      const value = choose<unknown>(key, before[field], mine[field], theirs[field]);
      if (typeof value !== 'undefined') record[field] = value;
    });
    return record;
  }
  const data: StorageItems = {};
  KNOWN_KEYS.forEach((key) => {
    // A side whose writer never knew the key left it as it was.
    const previous = own(base.data, key) ? base.data[key] : sideValue(base, key, local.data[key]);
    const left = local.data[key];
    const right = sideValue(remote, key, previous);
    const value = fieldMergeable(key, previous, left, right)
      ? chooseFields(key, previous, left, right)
      : choose<unknown>(key, previous, left, right);
    if (typeof value !== 'undefined') data[key] = value;
  });
  // Groups and the shortcuts inside them change together as one list.
  const shortcutDomain = (state: WebDavState): Pick<WebDavState, 'groups' | 'shortcuts'> =>
    ({ groups: state.groups, shortcuts: state.shortcuts });
  const shortcutState = choose('shortcuts', shortcutDomain(base), shortcutDomain(local), shortcutDomain(remote));
  const shortcutList = shortcutState.shortcuts;
  // An icon belongs to the shortcut domain: two different icons for one
  // shortcut conflict there, while the icon of a removed shortcut goes too.
  const icons = chooseFields('shortcuts', base.icons, local.icons, remote.icons, new Set(shortcutList.map((item) => item.id)));
  const wallpapers = choose('wallpapers', base.wallpapers, local.wallpapers, remote.wallpapers);
  const state = validateState({ version: Math.max(base.version, local.version, remote.version), data,
    groups: shortcutState.groups, shortcuts: shortcutList, icons, wallpapers,
    assets: { ...base.assets, ...remote.assets, ...local.assets }, keys: KNOWN_KEYS });
  return { state, conflicts: [...new Set(conflicts)] };
}

// A conflict summary is display data only: names are capped and values are
// reduced to their kind, so it never ships full shortcut lists or images.
const SUMMARY_NAMES = 6;

function names<T>(list: readonly T[], name: (item: T) => string): NameSample {
  return { names: list.slice(0, SUMMARY_NAMES).map(name), count: list.length };
}

function summarizeValue(value: unknown): ValueSummary {
  if (typeof value === 'undefined' || value === null) return { kind: 'unset' };
  if (typeof value === 'boolean') return { kind: 'boolean', value };
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'number', value };
  if (typeof value === 'string' && value.length <= 40) return { kind: 'text', value };
  if (Array.isArray(value)) return { kind: 'list', count: value.length };
  return { kind: 'changed' };
}

function describeList<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
  name: (item: T) => string,
  changedItem: (item: T, previous: T) => boolean
): ListChangeSummary {
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Set(after.map((item) => item.id));
  const kept = after.filter((item) => previous.has(item.id));
  return {
    total: after.length,
    added: names(after.filter((item) => !previous.has(item.id)), name),
    removed: names(before.filter((item) => !next.has(item.id)), name),
    changed: names(kept.filter((item) => {
      const prior = previous.get(item.id);
      return prior !== undefined && changedItem(item, prior);
    }), name),
    reordered: !equal(kept.map((item) => item.id), before.filter((item) => next.has(item.id)).map((item) => item.id))
  };
}

function getShortcutName(item: GroupedShortcutItem): string {
  return String(item.title || (shortcutStore.isShortcutFolder(item) ? '' : item.url) || '').slice(0, 60);
}

function describeShortcuts(base: WebDavState, side: WebDavState): ListChangeSummary {
  return describeList(base.shortcuts, side.shortcuts, getShortcutName,
    (item, previous) => !equal(item, previous) || side.icons[item.id] !== base.icons[item.id]);
}

function describeWallpapers(base: WebDavState, side: WebDavState): ListChangeSummary {
  const summary = describeList(base.wallpapers, side.wallpapers, (item) => String(item.name || '').slice(0, 60),
    (item, previous) => item.image !== previous.image || item.name !== previous.name);
  summary.selectionChanged = !equal(side.data[LOCAL_WALLPAPER_KEY], base.data[LOCAL_WALLPAPER_KEY]) ||
    !equal(side.data[WALLPAPER_KEY], base.data[WALLPAPER_KEY]);
  return summary;
}

// A folder color entry also carries the folder's creation time; only the
// color means anything to the person choosing a side.
function fieldValue(key: string, value: unknown): unknown {
  return key === settings.bookmarkFolderColorRefs.key && isObject(value) ? value.color : value;
}

// A field-merged record lists only the fields both sides changed apart.
function describeFields(key: string, previous: unknown, left: unknown, right: unknown): ConflictDescription[] {
  const before = asRecord(previous);
  const mine = asRecord(left);
  const theirs = asRecord(right);
  return fieldNames(previous, left, right).filter((field) => {
    return !equal(mine[field], theirs[field]) && !equal(mine[field], before[field]) && !equal(theirs[field], before[field]);
  }).map((field): ConflictDescription => ({ key, field, domain: 'preference', local: summarizeValue(fieldValue(key, mine[field])),
    remote: summarizeValue(fieldValue(key, theirs[field])) }));
}

// The operations the options page may ask the worker for.
const WEBDAV_OPERATIONS: readonly WebDavOperation[] = Object.freeze([
  'status', 'add', 'test', 'save', 'remove', 'enable', 'connect', 'sync', 'pause', 'browser',
  'schedule', 'recover', 'conflictDetails', 'restoreBackup', 'dismissSuggestion'
]);

// A requested operation; null when it names none.
function readWebDavOperation(value: unknown): WebDavOperation | null {
  return WEBDAV_OPERATIONS.find((operation) => operation === value) || null;
}

// Conflict descriptions as the worker sent them, read as untrusted; an
// entry that is not one is left out.
function readConflictDescriptions(value: unknown): ConflictDescription[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: ConflictDescription[] = [];
  value.forEach((entry: unknown) => {
    const item = readConflictDescription(entry);
    if (item) {
      items.push(item);
    }
  });
  return items;
}

function readConflictDescription(value: unknown): ConflictDescription | null {
  if (!value || typeof value !== 'object' || !('key' in value) || !('domain' in value) ||
      !('local' in value) || !('remote' in value) || typeof value.key !== 'string') {
    return null;
  }
  const { key, domain } = value;
  if ((domain === 'shortcuts' || domain === 'wallpapers') && key === domain) {
    const local = readListChangeSummary(value.local);
    const remote = readListChangeSummary(value.remote);
    if (!local || !remote) {
      return null;
    }
    return key === 'shortcuts'
      ? { key: 'shortcuts', domain: 'shortcuts', local, remote }
      : { key: 'wallpapers', domain: 'wallpapers', local, remote };
  }
  if (domain !== 'preference') {
    return null;
  }
  const local = readValueSummary(value.local);
  const remote = readValueSummary(value.remote);
  if (!local || !remote) {
    return null;
  }
  const field = 'field' in value && typeof value.field === 'string' ? value.field : undefined;
  return field === undefined
    ? { key, domain: 'preference', local, remote }
    : { key, field, domain: 'preference', local, remote };
}

function readNameSample(value: unknown): NameSample | null {
  if (!value || typeof value !== 'object' || !('names' in value) || !('count' in value) ||
      !Array.isArray(value.names) || typeof value.count !== 'number') {
    return null;
  }
  return {
    names: value.names.filter((name: unknown): name is string => typeof name === 'string'),
    count: value.count
  };
}

function readListChangeSummary(value: unknown): ListChangeSummary | null {
  if (!value || typeof value !== 'object' || !('total' in value) || typeof value.total !== 'number' ||
      !('added' in value) || !('removed' in value) || !('changed' in value)) {
    return null;
  }
  const added = readNameSample(value.added);
  const removed = readNameSample(value.removed);
  const changed = readNameSample(value.changed);
  if (!added || !removed || !changed) {
    return null;
  }
  const summary: ListChangeSummary = {
    total: value.total,
    added,
    removed,
    changed,
    reordered: 'reordered' in value && value.reordered === true
  };
  if ('selectionChanged' in value && typeof value.selectionChanged === 'boolean') {
    summary.selectionChanged = value.selectionChanged;
  }
  return summary;
}

function readValueSummary(value: unknown): ValueSummary | null {
  if (!value || typeof value !== 'object' || !('kind' in value)) {
    return null;
  }
  const kind = value.kind;
  const inner: unknown = 'value' in value ? value.value : undefined;
  if (kind === 'unset' || kind === 'changed') {
    return { kind };
  }
  if (kind === 'boolean' && typeof inner === 'boolean') {
    return { kind, value: inner };
  }
  if (kind === 'number' && typeof inner === 'number') {
    return { kind, value: inner };
  }
  if (kind === 'text' && typeof inner === 'string') {
    return { kind, value: inner };
  }
  if (kind === 'list' && 'count' in value && typeof value.count === 'number') {
    return { kind, count: value.count };
  }
  return null;
}

function describeConflict(base: WebDavState, local: WebDavState, remote: WebDavState, keys: readonly string[]): ConflictDescription[] {
  return [...new Set(keys)].flatMap((key): ConflictDescription | ConflictDescription[] => {
    if (key === 'shortcuts') return { key, domain: 'shortcuts', local: describeShortcuts(base, local), remote: describeShortcuts(base, remote) };
    if (key === 'wallpapers') return { key, domain: 'wallpapers', local: describeWallpapers(base, local), remote: describeWallpapers(base, remote) };
    if (fieldMergeable(key, base.data[key], local.data[key], remote.data[key])) {
      return describeFields(key, base.data[key], local.data[key], remote.data[key]);
    }
    return { key, domain: 'preference', local: summarizeValue(local.data[key]), remote: summarizeValue(remote.data[key]) };
  });
}

function sameShortcutState(
  left: Pick<ShortcutStateRead, 'groups' | 'items'>,
  right: Pick<ShortcutStateRead, 'groups' | 'items'>
): boolean {
  return equal({ groups: left.groups, items: left.items }, { groups: right.groups, items: right.items });
}

// Chrome keeps the legacy shortcut keys as they are: an older device still
// reads them. Only the grouped copy is written.
function planChromeBackup(values: StorageItems, existing: StorageItems, options?: ChromeBackupOptions | null): ChromeBackupPlan {
  const opts = options || {};
  const quota = opts.quota || 102400;
  const itemQuota = opts.itemQuota || 8192;
  const maxItems = opts.maxItems || 512;
  const keys = settings.BROWSER_SYNC_KEYS;
  const bytes = (key: string, value: unknown): number => byteLength(key) + byteLength(JSON.stringify(value));
  const totalBytes = (record: StorageItems): number =>
    Object.entries(record).reduce((sum, [name, value]) => sum + bytes(name, value), 0);
  // Include retained old values in the budget, including values that no
  // longer fit. A partial backup keeps their last successful Chrome copy.
  const projected: StorageItems = { ...existing };
  const remove = keys.filter((key) => !SHORTCUT_KEYS.includes(key) && !own(values, key) && own(existing, key));
  remove.forEach((key) => delete projected[key]);
  const hasShortcuts = SHORTCUT_KEYS.some((key) => own(values, key));
  if (hasShortcuts) SHORTCUT_SYNC_KEYS.forEach((key) => { projected[key] = []; });
  const payload: StorageItems = {};
  const skipped: string[] = [];
  for (const key of keys.filter((name) => !SHORTCUT_KEYS.includes(name))) {
    if (!own(values, key)) continue;
    const old = projected[key];
    projected[key] = values[key];
    if (bytes(key, values[key]) > itemQuota || totalBytes(projected) > quota || Object.keys(projected).length > maxItems) {
      if (typeof old === 'undefined') delete projected[key]; else projected[key] = old;
      skipped.push(key);
    } else if (!equal(existing[key], values[key])) payload[key] = values[key];
  }
  if (hasShortcuts) {
    const nonShortcutBytes = Object.entries(projected).filter(([key]) => !SHORTCUT_SYNC_KEYS.includes(key))
      .reduce((sum, [key, value]) => sum + bytes(key, value), 0);
    const state = readShortcutState(values, null);
    const fallback = shortcutStore.createShortcutStoragePlan(state, {
      maxItemBytes: Math.min(itemQuota, shortcutStore.DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES),
      maxTotalBytes: Math.max(0, quota - nonShortcutBytes)
    });
    Object.assign(projected, fallback.payload);
    const fits = Object.keys(projected).length <= maxItems && totalBytes(projected) <= quota;
    if (fits) {
      // All three chunks are updated together, including empty tail chunks.
      // Keeping a stale tail would resurrect removed shortcuts on a new device.
      const current = shortcutStore.readShortcutSyncValues(existing);
      if (current.source !== 'v2' || current.torn ||
          !sameShortcutState(shortcutStore.normalizeShortcutState(current), fallback.state)) {
        Object.assign(payload, fallback.payload);
      }
      if (fallback.overflowItems.length) skipped.push(...SHORTCUT_SYNC_KEYS);
    } else {
      skipped.push(...SHORTCUT_SYNC_KEYS);
      // A changed preference must not rely on removing chunks that cannot be
      // replaced. Replan without shortcut allocation under a full quota.
      SHORTCUT_SYNC_KEYS.forEach((key) => {
        if (own(existing, key)) projected[key] = existing[key]; else delete projected[key];
      });
      for (const key of Object.keys(payload).reverse()) {
        if (totalBytes(projected) <= quota) break;
        delete payload[key];
        skipped.push(key);
        if (own(existing, key)) projected[key] = existing[key]; else delete projected[key];
      }
    }
  }
  return { payload, remove, skipped, complete: skipped.length === 0 };
}

export {
  SHORTCUT_KEYS,
  SHORTCUT_SYNC_KEYS,
  FIELD_MERGE_KEYS,
  OVERFLOW_KEY,
  ICONS_KEY,
  WALLPAPER_KEY,
  LOCAL_WALLPAPER_KEY,
  LOCAL_PREFERENCE_KEYS,
  PREFERENCE_KEYS,
  GROUPED_STATE_VERSION,
  LEGACY_MAX_SHORTCUTS,
  MAX_SHORTCUTS,
  MAX_STATE_BYTES,
  MAX_ASSET_BYTES,
  KNOWN_KEYS,
  WebDavContractError,
  canonical,
  equal,
  sameContent,
  byteLength,
  readShortcutState,
  needsGroupedState,
  selectPreferences,
  validateState,
  adoptRemote,
  mergeStates,
  mergeInitialWallpapers,
  describeConflict,
  readConflictDescriptions,
  readWebDavOperation,
  WEBDAV_OPERATIONS,
  planChromeBackup
};
export type {
  ChromeBackupOptions,
  ChromeBackupPlan,
  ConflictDescription,
  ListChangeSummary,
  MergeResolution,
  MergeResult,
  NameSample,
  ValueSummary,
  WebDavAsset,
  WebDavAssetMime,
  WebDavErrorCode,
  WebDavState,
  WebDavWallpaper
};
