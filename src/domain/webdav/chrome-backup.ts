// Backing a WebDAV state up to browser sync within its limits.
import * as settings from '../settings';
import type { StorageItems } from '../storage-port';
import * as ShortcutConstants from '../shortcuts/constants';
import * as ShortcutNormalize from '../shortcuts/normalize';
import * as ShortcutStoragePlan from '../shortcuts/storage-plan';
import * as ShortcutSyncEncoding from '../shortcuts/sync-encoding';
import { sameShortcutState } from './conflicts';
import { SHORTCUT_KEYS, SHORTCUT_SYNC_KEYS, byteLength, equal, own, readShortcutState } from './state-base';
import type { ChromeBackupOptions, ChromeBackupPlan } from './types';

// Chrome keeps the legacy shortcut keys as they are: an older device still
// reads them. Only the grouped copy is written.
// chrome.storage.sync's limits, and the values it will hold after the
// backup. Retained old values count, including values that no longer fit:
// a partial backup keeps their last successful Chrome copy.
interface BackupBudget {
  quota: number;
  itemQuota: number;
  maxItems: number;
  projected: StorageItems;
}

function entryBytes(key: string, value: unknown): number {
  return byteLength(key) + byteLength(JSON.stringify(value));
}

function totalBytes(record: StorageItems): number {
  return Object.entries(record).reduce((sum, [name, value]) => sum + entryBytes(name, value), 0);
}

function restoreProjected(budget: BackupBudget, existing: StorageItems, key: string): void {
  if (own(existing, key)) budget.projected[key] = existing[key]; else delete budget.projected[key];
}

// Each changed preference that fits goes in; one that does not keeps its
// old copy and is skipped.
function planPreferenceBackup(values: StorageItems, existing: StorageItems, budget: BackupBudget, plan: ChromeBackupPlan): void {
  const { projected } = budget;
  for (const key of settings.BROWSER_SYNC_KEYS.filter((name) => !SHORTCUT_KEYS.includes(name))) {
    if (!own(values, key)) continue;
    const old = projected[key];
    projected[key] = values[key];
    if (entryBytes(key, values[key]) > budget.itemQuota || totalBytes(projected) > budget.quota ||
        Object.keys(projected).length > budget.maxItems) {
      if (typeof old === 'undefined') delete projected[key]; else projected[key] = old;
      plan.skipped.push(key);
    } else if (!equal(existing[key], values[key])) plan.payload[key] = values[key];
  }
}

// The shortcut chunks did not fit: they keep their old copy, and changed
// preferences are dropped from the end until the rest fits. A changed
// preference must not rely on removing chunks that cannot be replaced.
function keepOldShortcutChunks(existing: StorageItems, budget: BackupBudget, plan: ChromeBackupPlan): void {
  plan.skipped.push(...SHORTCUT_SYNC_KEYS);
  SHORTCUT_SYNC_KEYS.forEach((key) => restoreProjected(budget, existing, key));
  for (const key of Object.keys(plan.payload).reverse()) {
    if (totalBytes(budget.projected) <= budget.quota) break;
    delete plan.payload[key];
    plan.skipped.push(key);
    restoreProjected(budget, existing, key);
  }
}

// The shortcut chunks, planned in the room the preferences leave.
function planShortcutBackup(values: StorageItems, existing: StorageItems, budget: BackupBudget, plan: ChromeBackupPlan): void {
  const { projected } = budget;
  const nonShortcutBytes = Object.entries(projected).filter(([key]) => !SHORTCUT_SYNC_KEYS.includes(key))
    .reduce((sum, [key, value]) => sum + entryBytes(key, value), 0);
  const fallback = ShortcutStoragePlan.createShortcutStoragePlan(readShortcutState(values, null), {
    maxItemBytes: Math.min(budget.itemQuota, ShortcutConstants.DEFAULT_SHORTCUTS_SYNC_ITEM_BUDGET_BYTES),
    maxTotalBytes: Math.max(0, budget.quota - nonShortcutBytes)
  });
  Object.assign(projected, fallback.payload);
  if (Object.keys(projected).length > budget.maxItems || totalBytes(projected) > budget.quota) {
    keepOldShortcutChunks(existing, budget, plan);
    return;
  }
  // All three chunks are updated together, including empty tail chunks.
  // Keeping a stale tail would resurrect removed shortcuts on a new device.
  const current = ShortcutSyncEncoding.readShortcutSyncValues(existing);
  if (current.source !== 'v2' || current.torn ||
      !sameShortcutState(ShortcutNormalize.normalizeShortcutState(current), fallback.state)) {
    Object.assign(plan.payload, fallback.payload);
  }
  if (fallback.overflowItems.length) plan.skipped.push(...SHORTCUT_SYNC_KEYS);
}

function planChromeBackup(values: StorageItems, existing: StorageItems, options?: ChromeBackupOptions | null): ChromeBackupPlan {
  const opts = options || {};
  const budget: BackupBudget = {
    quota: opts.quota || 102400,
    itemQuota: opts.itemQuota || 8192,
    maxItems: opts.maxItems || 512,
    projected: { ...existing }
  };
  const remove = settings.BROWSER_SYNC_KEYS.filter((key) => !SHORTCUT_KEYS.includes(key) && !own(values, key) && own(existing, key));
  remove.forEach((key) => delete budget.projected[key]);
  const hasShortcuts = SHORTCUT_KEYS.some((key) => own(values, key));
  if (hasShortcuts) SHORTCUT_SYNC_KEYS.forEach((key) => { budget.projected[key] = []; });
  const plan: ChromeBackupPlan = { payload: {}, remove, skipped: [], complete: false };
  planPreferenceBackup(values, existing, budget, plan);
  if (hasShortcuts) {
    planShortcutBackup(values, existing, budget, plan);
  }
  plan.complete = plan.skipped.length === 0;
  return plan;
}

export {
  entryBytes,
  keepOldShortcutChunks,
  planChromeBackup,
  planPreferenceBackup,
  planShortcutBackup,
  restoreProjected,
  totalBytes
};
export type {
  BackupBudget
};
