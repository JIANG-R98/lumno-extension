// The shortcut store functions as one object, for the modules that take the
// store as an option so tests can give them another.
import * as ShortcutConstants from './constants';
import * as ShortcutNormalize from './normalize';
import * as ShortcutStoragePlan from './storage-plan';
import * as ShortcutSyncEncoding from './sync-encoding';

const SHORTCUTS_STORE_API = Object.freeze({
  ...ShortcutConstants,
  ...ShortcutNormalize,
  ...ShortcutSyncEncoding,
  ...ShortcutStoragePlan
});

type ShortcutsStoreApi = typeof SHORTCUTS_STORE_API;

export { SHORTCUTS_STORE_API };
export type { ShortcutsStoreApi };
