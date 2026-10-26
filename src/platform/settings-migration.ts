// Runs the settings migrations this device has not run yet
// (domain/settings/migrations.ts) against its storage areas, and records
// the version it reached. A failed write leaves the version where it was,
// so the next start tries again.
import {
  getPendingSettingsMigrations,
  getSettingsMigrationReads,
  planSettingsMigrations
} from '../domain/settings/migrations';
import type { SettingsAreaPatch } from '../domain/settings/migrations';
import { settingsSchemaVersion } from '../domain/settings/sync-state';
import type { StorageAreaLike, StorageItems } from '../domain/storage-port';
import type { StorageChromeApi } from './settings-storage';
import { callStorage, isRecord } from './storage-call';

async function readArea(
  chromeApi: StorageChromeApi,
  area: StorageAreaLike | undefined,
  keys: string[]
): Promise<StorageItems> {
  if (!area || keys.length === 0) {
    return {};
  }
  const result = await callStorage(chromeApi, (done) => area.get(keys, done));
  return isRecord(result) ? result : {};
}

async function writeArea(
  chromeApi: StorageChromeApi,
  area: StorageAreaLike | undefined,
  patch: SettingsAreaPatch
): Promise<void> {
  if (!area) {
    return;
  }
  if (Object.keys(patch.set).length > 0) {
    await callStorage(chromeApi, (done) => area.set(patch.set, done));
  }
  const remove = area.remove;
  if (patch.remove.length > 0 && typeof remove === 'function') {
    await callStorage(chromeApi, (done) => remove.call(area, patch.remove, done));
  }
}

// Resolves with the schema version the device is at afterwards.
async function runSettingsMigrations(chromeApi: StorageChromeApi | null | undefined): Promise<number> {
  const storage = chromeApi && chromeApi.storage;
  const localArea = storage && storage.local;
  if (!chromeApi || !storage || !localArea) {
    return 0;
  }
  const syncArea = storage.sync;
  const stored = await readArea(chromeApi, localArea, [settingsSchemaVersion.key]);
  const version = settingsSchemaVersion.parse(stored[settingsSchemaVersion.key]);
  const pending = getPendingSettingsMigrations(version);
  if (pending.length === 0) {
    return version;
  }
  const reads = getSettingsMigrationReads(pending);
  const [syncValues, localValues] = await Promise.all([
    readArea(chromeApi, syncArea, reads.sync),
    readArea(chromeApi, localArea, reads.local)
  ]);
  const plan = planSettingsMigrations(version, { sync: syncValues, local: localValues });
  await writeArea(chromeApi, syncArea, plan.patch.sync);
  await writeArea(chromeApi, localArea, plan.patch.local);
  await callStorage(chromeApi, (done) => localArea.set({ [settingsSchemaVersion.key]: plan.version }, done));
  return plan.version;
}

export { runSettingsMigrations };
