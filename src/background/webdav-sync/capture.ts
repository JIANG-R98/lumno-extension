// Reading this device's preferences, shortcuts and wallpapers into a state
// to merge.
import type { StorageItems } from '../../domain/storage-port';
import { LOCAL_DATA_CODES } from './constants';
import { collectMedia } from './media';
import { errorCode, hasFolderRef, readStateVersion } from './records';
import { fail, session, storage } from './runtime';
import type { Captured } from './types';
import type { Connection } from './connection';
import type { WebDavState } from '../../domain/webdav/types';
import { GROUPED_STATE_VERSION, KNOWN_KEYS, LOCAL_PREFERENCE_KEYS, OVERFLOW_KEY, needsGroupedState, readShortcutState, selectPreferences } from '../../domain/webdav/state-base';
import * as LumnoSettings from '../../domain/settings';

function pickLocalPreferences(conn: Connection, values: StorageItems): StorageItems {
  return Object.fromEntries(LOCAL_PREFERENCE_KEYS
    .filter((key) => Object.prototype.hasOwnProperty.call(values, key)).map((key) => [key, values[key]]));
}


function capture(conn: Connection, recovering = false): Promise<Captured> {
  return conn.ports.withLocalWrite(async () => {
    if (!recovering && conn.ports.hasPendingApply && await conn.ports.hasPendingApply()) fail(conn, 'interrupted-apply');
    return captureInternal(conn);
  });
}

async function captureInternal(conn: Connection): Promise<Captured> {
  await conn.ports.runtime.ready;
  // Unknown mode means the settings could be read from the wrong area;
  // uploading that copy would replace the real ones on other devices.
  if (conn.ports.runtime.isModeKnown && !conn.ports.runtime.isModeKnown()) fail(conn, 'local-storage-failed');
  const capturedGeneration = conn.edits.generation;
  const local = await storage(conn, conn.ports.localArea, 'get', conn.ports.watchedKeys);
  const values = conn.ports.runtime.isActiveAreaName('local') ? local : await storage(conn, conn.ports.syncArea, 'get', [...LumnoSettings.BROWSER_SYNC_KEYS]);
  const shortcutState = readShortcutState(values, conn.ports.runtime.isActiveAreaName('sync') ? local[OVERFLOW_KEY] : null);
  // Another device's browser sync save has only partly arrived.
  if (shortcutState.torn) fail(conn, 'local-changed');
  const list = shortcutState.items;
  const regular = list.filter((item) => item.type !== 'folder' || hasFolderRef(item));
  const ids = new Set(regular.map((item) => item.id));
  // The oldest format that holds this state, so older devices keep reading it.
  const baseVersion = readStateVersion((await session(conn)).base);
  const version = baseVersion >= GROUPED_STATE_VERSION || needsGroupedState(shortcutState.groups, regular)
    ? GROUPED_STATE_VERSION
    : regular.some((item) => item.type === 'folder') || baseVersion === 2 ? 2 : 1;
  const state: WebDavState = { version, data: selectPreferences({ ...values, ...pickLocalPreferences(conn, local) }),
    groups: shortcutState.groups, shortcuts: regular, icons: {}, wallpapers: [], assets: {}, keys: [...KNOWN_KEYS] };
  // This device's own data failing the contract must not read as a bad
  // remote copy, so its codes carry a local- prefix.
  try {
    const { validated, records } = await collectMedia(conn, state, local, ids);
    if (capturedGeneration !== conn.edits.generation) fail(conn, 'local-changed');
    return { state: validated, values, local, records, folders: list.filter((item) => item.type === 'folder' && !hasFolderRef(item)),
      shortcutOrder: list.map((item) => item.id), shortcutMigratedAt: shortcutState.migratedAt || 0,
      generation: capturedGeneration };
  } catch (cause) {
    const code = errorCode(cause);
    if (LOCAL_DATA_CODES.includes(code)) fail(conn, `local-${code}`);
    throw cause;
  }
}

export {
  capture,
  captureInternal,
  pickLocalPreferences
};
