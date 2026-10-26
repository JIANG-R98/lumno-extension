// Where each setting lives: the extension's storage areas (preferences
// through the provider, which follows the user's choice between browser
// sync and this device), and the page's own web storage for page and tab
// values.
import type { SettingArea } from '../domain/settings/define';
import type { StorageAreaLike, StorageChangeEventLike } from '../domain/storage-port';
import { createProviderStorageRuntime } from './provider-storage';
import type { ProviderStorageRuntime, StorageAreaFacade, StorageChromeApi } from './settings-storage';

type StoreArea = Exclude<SettingArea, 'page' | 'tab'>;

// The window storage page and tab values live in.
interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface SettingsStoreWindow {
  localStorage?: WebStorageLike | null;
  sessionStorage?: WebStorageLike | null;
}

interface SettingsStoreChromeApi extends StorageChromeApi {
  storage?: StorageChromeApi['storage'] & { session?: StorageAreaLike };
}

function isStoreArea(area: SettingArea): area is StoreArea {
  return area !== 'page' && area !== 'tab';
}

function readWebStorage(storage: WebStorageLike | null | undefined, key: string): unknown {
  try {
    const value = storage ? storage.getItem(key) : null;
    return value === null ? undefined : value;
  } catch (_error) {
    // Blocked or unavailable storage reads as nothing stored.
    return undefined;
  }
}

function writeWebStorage(storage: WebStorageLike | null | undefined, key: string, value: unknown): void {
  try {
    if (!storage) return;
    if (value === undefined) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch (_error) {
    // A copy that cannot be kept only costs the next page its fast path.
  }
}

class SettingsAreas {
  readonly chromeApi: SettingsStoreChromeApi | null;
  private readonly storage: SettingsStoreChromeApi['storage'] | null;
  private readonly windowObj: SettingsStoreWindow | null;
  // Made with the first preference the store meets.
  private provider: ProviderStorageRuntime | null = null;

  constructor(chromeApi: SettingsStoreChromeApi | null, windowObj: SettingsStoreWindow | null) {
    this.chromeApi = chromeApi;
    this.storage = chromeApi && chromeApi.storage ? chromeApi.storage : null;
    this.windowObj = windowObj;
  }

  get onChanged(): StorageChangeEventLike | null | undefined {
    return this.storage ? this.storage.onChanged : null;
  }

  // Whether preferences are in use yet; a change of the user's choice
  // between browser sync and this device moves them.
  hasPreferences(): boolean {
    return Boolean(this.provider);
  }

  preferences(): ProviderStorageRuntime {
    if (!this.provider) this.provider = createProviderStorageRuntime(this.chromeApi);
    return this.provider;
  }

  areaFor(area: StoreArea): StorageAreaLike | StorageAreaFacade | null {
    const storage = this.storage;
    if (!storage) return null;
    if (area === 'preferences') return this.preferences().area;
    if (area === 'browserSync') return storage.sync || null;
    if (area === 'session') return storage.session || storage.local || null;
    return storage.local || null;
  }

  webStorageFor(area: 'page' | 'tab'): WebStorageLike | null {
    if (!this.windowObj) return null;
    return (area === 'tab' ? this.windowObj.sessionStorage : this.windowObj.localStorage) || null;
  }

  // Whether a change in `areaName` reaches settings of `area`.
  matches(area: StoreArea, areaName: string): boolean {
    if (area === 'preferences') return Boolean(this.provider && this.provider.isActiveAreaName(areaName));
    if (area === 'browserSync') return areaName === 'sync';
    if (area === 'session') return areaName === (this.storage && this.storage.session ? 'session' : 'local');
    return areaName === 'local';
  }
}

export type { SettingsStoreChromeApi, SettingsStoreWindow, StoreArea, WebStorageLike };
export { SettingsAreas, isStoreArea, readWebStorage, writeWebStorage };
