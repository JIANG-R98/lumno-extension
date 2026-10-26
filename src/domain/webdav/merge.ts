// Merging two WebDAV states against the last one both shared.
import * as settings from '../settings';
import type { StorageItems } from '../storage-port';
import { KNOWN_KEYS, MAX_LINK_WALLPAPERS_BYTES, asRecord, byteLength, equal, fail, fieldMergeable, fieldNames, isObject, own, sideValue, writerKnows } from './state-base';
import type { MergeResolution, MergeResult, WebDavState } from './types';
import { isWebDavContractError, validateState } from './validation';

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

// The remote state as this device applies it: values for keys its writer
// never knew stay as they are here.
function adoptRemote(local: WebDavState, remote: WebDavState): WebDavState {
  const data = { ...remote.data };
  KNOWN_KEYS.forEach((key) => {
    if (!writerKnows(remote, key) && own(local.data, key)) data[key] = local.data[key];
  });
  return validateState({ ...remote, data, keys: KNOWN_KEYS });
}

export {
  adoptRemote,
  mergeInitialWallpapers,
  mergeStates
};
