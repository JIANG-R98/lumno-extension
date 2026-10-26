// Reading this device's preferences, shortcuts and wallpapers into a state
// to merge.
import type { StorageItems } from '../../domain/storage-port';
import type { WebDavState } from '../../domain/webdav-contract';
import { LOCAL_DATA_CODES } from './constants';
import { collectMedia } from './media';
import { errorCode, hasFolderRef, readStateVersion } from './records';
import { fail, session, storage } from './runtime';
import type { Captured, ConnectionContext } from './types';

function pickLocalPreferences(ctx: ConnectionContext, values: StorageItems): StorageItems {
  return Object.fromEntries(ctx.contract.LOCAL_PREFERENCE_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(values, key)).map((key) => [key, values[key]]));
}


function capture(ctx: ConnectionContext, recovering = false): Promise<Captured> {
  return ctx.withLocalWrite(async () => {
    if (!recovering && ctx.opts.hasPendingApply && await ctx.opts.hasPendingApply()) fail(ctx, 'interrupted-apply');
    return captureInternal(ctx);
  });
}

async function captureInternal(ctx: ConnectionContext): Promise<Captured> {
  await ctx.runtime.ready;
  // Unknown mode means the settings could be read from the wrong area;
  // uploading that copy would replace the real ones on other devices.
  if (ctx.runtime.isModeKnown && !ctx.runtime.isModeKnown()) fail(ctx, 'local-storage-failed');
  const capturedGeneration = ctx.generation;
  const local = await storage(ctx, ctx.localPrefsArea, 'get', ctx.watchedKeys);
  const values = ctx.runtime.isActiveAreaName('local') ? local : await storage(ctx, ctx.chromeFallbackArea, 'get', [...ctx.settings.BROWSER_SYNC_KEYS]);
  const shortcutState = ctx.contract.readShortcutState(values, ctx.runtime.isActiveAreaName('sync') ? local[ctx.contract.OVERFLOW_KEY] : null);
  // Another device's browser sync save has only partly arrived.
  if (shortcutState.torn) fail(ctx, 'local-changed');
  const list = shortcutState.items;
  const regular = list.filter((item) => item.type !== 'folder' || hasFolderRef(item));
  const ids = new Set(regular.map((item) => item.id));
  // The oldest format that holds this state, so older devices keep reading it.
  const baseVersion = readStateVersion((await session(ctx)).base);
  const version = baseVersion >= ctx.contract.GROUPED_STATE_VERSION || ctx.contract.needsGroupedState(shortcutState.groups, regular)
    ? ctx.contract.GROUPED_STATE_VERSION
    : regular.some((item) => item.type === 'folder') || baseVersion === 2 ? 2 : 1;
  const state: WebDavState = { version, data: ctx.contract.selectPreferences({ ...values, ...pickLocalPreferences(ctx, local) }),
    groups: shortcutState.groups, shortcuts: regular, icons: {}, wallpapers: [], assets: {}, keys: [...ctx.contract.KNOWN_KEYS] };
  // This device's own data failing the contract must not read as a bad
  // remote copy, so its codes carry a local- prefix.
  try {
    const { validated, records } = await collectMedia(ctx, state, local, ids);
    if (capturedGeneration !== ctx.generation) fail(ctx, 'local-changed');
    return { state: validated, values, local, records, folders: list.filter((item) => item.type === 'folder' && !hasFolderRef(item)),
      shortcutOrder: list.map((item) => item.id), shortcutMigratedAt: shortcutState.migratedAt || 0,
      generation: capturedGeneration };
  } catch (cause) {
    const code = errorCode(cause);
    if (LOCAL_DATA_CODES.includes(code)) fail(ctx, `local-${code}`);
    throw cause;
  }
}

export {
  capture,
  captureInternal,
  pickLocalPreferences
};
