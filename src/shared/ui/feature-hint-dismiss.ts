// Where each feature hint remembers that it was dismissed: this session,
// this device, or every synced device.
import type { SettingFamily } from '../../domain/settings/define';
import {
  featureHintDismissedEverywhere,
  featureHintDismissedOnDevice,
  featureHintDismissedThisSession
} from '../../domain/settings/features';
import { getContextSettingsStore } from '../../platform/settings-store';
import type { SettingsStore } from '../../platform/settings-store';
import { getDomIdPart, getFeatureHint } from './feature-hint-catalog';
import type { FeatureHintChromeApi, FeatureHintDismissStorage, FeatureHintReference } from './feature-hint-catalog';

// The dismissals, by where they are remembered.
const DISMISS_FAMILIES: readonly SettingFamily<boolean>[] = [
  featureHintDismissedEverywhere,
  featureHintDismissedOnDevice,
  featureHintDismissedThisSession
];

function getFeatureHintStorageId(definition: FeatureHintReference): string {
  const hint = getFeatureHint(definition);
  const idPart = getDomIdPart(hint ? hint.id : '');
  const versionPart = getDomIdPart(hint && hint.introducedIn ? hint.introducedIn : 'unversioned');
  return `${idPart}_${versionPart}`;
}

function getFeatureHintDismissKey(definition: FeatureHintReference, storageType: FeatureHintDismissStorage): string {
  const family = storageType === 'sync'
    ? featureHintDismissedEverywhere
    : (storageType === 'local' ? featureHintDismissedOnDevice : featureHintDismissedThisSession);
  return family.keyFor(getFeatureHintStorageId(definition));
}

function getFeatureHintSessionDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'session');
}

function getFeatureHintLocalDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'local');
}

function getFeatureHintSyncDismissKey(definition: FeatureHintReference): string {
  return getFeatureHintDismissKey(definition, 'sync');
}

function getDismissStore(chromeApi: FeatureHintChromeApi | null): SettingsStore | null {
  return chromeApi && chromeApi.storage ? getContextSettingsStore(chromeApi) : null;
}

// The family a dismissal key belongs to, with the hint's id in it.
function readDismissKey(key: string): { family: SettingFamily<boolean>; id: string } | null {
  for (const family of DISMISS_FAMILIES) {
    const id = family.idOf(key);
    if (id) {
      return { family, id };
    }
  }
  return null;
}

async function readDismissed(store: SettingsStore, family: SettingFamily<boolean>, id: string): Promise<boolean> {
  const member = family.member(id);
  await store.include(member);
  return store.get(member);
}

async function getStoredDismissed(chromeApi: FeatureHintChromeApi | null, key: string): Promise<boolean> {
  const store = getDismissStore(chromeApi);
  const target = readDismissKey(key);
  if (!store || !target) {
    return false;
  }
  if (await readDismissed(store, target.family, target.id)) {
    return true;
  }
  // Older versions kept dismissals meant for every browser on the device.
  if (target.family !== featureHintDismissedEverywhere ||
      !await readDismissed(store, featureHintDismissedOnDevice, target.id)) {
    return false;
  }
  setStoredDismissed(chromeApi, key);
  return true;
}

function setStoredDismissed(chromeApi: FeatureHintChromeApi | null, key: string): void {
  const store = getDismissStore(chromeApi);
  const target = readDismissKey(key);
  if (!store || !target) {
    return;
  }
  // Storage errors should not block the visible in-page dismissal.
  store.set(target.family.member(target.id), true).catch(() => {});
}

export {
  DISMISS_FAMILIES,
  getDismissStore,
  getFeatureHintDismissKey,
  getFeatureHintLocalDismissKey,
  getFeatureHintSessionDismissKey,
  getFeatureHintStorageId,
  getFeatureHintSyncDismissKey,
  getStoredDismissed,
  readDismissKey,
  readDismissed,
  setStoredDismissed
};
