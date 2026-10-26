// Applying a merged state to this device, and mirroring it into Chrome sync.
import type { StorageItems } from '../../domain/storage-port';
import type { WebDavState } from '../../domain/webdav-contract';
import type { WallpaperRecordInput } from '../../shared/wallpaper-local-store';
import { capture, pickLocalPreferences } from './capture';
import { getAsset, toDataUrl } from './media';
import { isRecord, isRecorded, readSession, unrefTimer } from './records';
import { fail, report, setStatus, storage } from './runtime';
import type { Captured, ChromePreparation, ConnectionContext, MirrorResult, Session } from './types';
import type { WebDavClient } from '../webdav-client/types';

// This device's local-only folder shortcuts go back where they were; the
// rest of the list beyond the browser sync budget goes to the overflow record.
function preferencePayload(ctx: ConnectionContext, state: WebDavState, captured: Captured, maxTotalBytes: number): StorageItems {
  const list = [...state.shortcuts];
  for (const folder of captured.folders) {
    const index = (captured.shortcutOrder || []).indexOf(folder.id);
    list.splice(index < 0 ? list.length : Math.min(index, list.length), 0, folder);
  }
  if (list.length > ctx.contract.MAX_SHORTCUTS) fail(ctx, 'shortcut-capacity');
  if (new Set(list.map((item) => item.id)).size !== list.length) fail(ctx, 'shortcut-id-conflict');
  const plan = ctx.shortcuts.createShortcutStoragePlan({ groups: state.groups, items: list,
    migratedAt: captured.shortcutMigratedAt }, { maxTotalBytes });
  return { ...state.data, ...plan.payload, [ctx.contract.OVERFLOW_KEY]: plan.overflowRecord };
}

async function prepareChrome(ctx: ConnectionContext, state: WebDavState, captured: Captured): Promise<ChromePreparation> {
  const existing = await storage(ctx, ctx.chromeFallbackArea || ctx.localPrefsArea, 'get', null);
  const maxTotalBytes = ctx.chromeFallbackArea ? ctx.shortcuts.getShortcutSyncBudget({
    ...ctx.shortcuts.measureShortcutSyncUsage(existing), quotaBytes: ctx.chromeFallbackArea.QUOTA_BYTES
  }) : Number.MAX_SAFE_INTEGER;
  const payload = preferencePayload(ctx, state, captured, maxTotalBytes);
  const synced: StorageItems = Object.fromEntries(ctx.settings.BROWSER_SYNC_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(payload, key)).map((key) => [key, payload[key]]));
  // The legacy shortcut keys stay for devices that still read them.
  const remove = ctx.settings.BROWSER_SYNC_KEYS.filter((key) => !ctx.shortcuts.LEGACY_SHORTCUTS_CHUNK_KEYS.includes(key) &&
    Object.prototype.hasOwnProperty.call(existing, key) && !Object.prototype.hasOwnProperty.call(synced, key));
  const projected: StorageItems = { ...existing, ...synced };
  remove.forEach((key) => delete projected[key]);
  const entries = Object.entries(projected);
  const size = (key: string, value: unknown): number => ctx.contract.byteLength(key) + ctx.contract.byteLength(JSON.stringify(value));
  const area = ctx.chromeFallbackArea;
  if (area && (entries.length > (area.MAX_ITEMS || 512) ||
      entries.some(([key, value]) => size(key, value) > (area.QUOTA_BYTES_PER_ITEM || 8192)) ||
      entries.reduce((sum, [key, value]) => sum + size(key, value), 0) > (area.QUOTA_BYTES || 102400))) fail(ctx, 'chrome-capacity');
  return { payload, synced, remove };
}

function ownWriteKey(areaName: string, key: string): string {
  return `${areaName}\n${key}`;
}

// Only values that really change fire an event; an expectation for an
// unchanged one would swallow a later identical edit by the person.
async function expectOwnWrites(ctx: ConnectionContext, area: chrome.storage.StorageArea, areaName: 'sync' | 'local', values: StorageItems): Promise<void> {
  if (ctx.ownWritesTimer) { clearTimeout(ctx.ownWritesTimer); ctx.ownWritesTimer = null; }
  const current = await storage(ctx, area, 'get', Object.keys(values));
  Object.entries(values).forEach(([key, value]) => {
    if (ctx.contract.canonical(value) !== ctx.contract.canonical(current[key])) ctx.ownWrites.set(ownWriteKey(areaName, key), ctx.contract.canonical(value));
  });
}

// Events may arrive after the write's callback; nothing written means
// nothing to wait for.
function expireOwnWrites(ctx: ConnectionContext, wrote: boolean): void {
  if (ctx.ownWritesTimer) clearTimeout(ctx.ownWritesTimer);
  ctx.ownWritesTimer = null;
  if (!wrote) { ctx.ownWrites.clear(); return; }
  ctx.ownWritesTimer = setTimeout(() => { ctx.ownWrites.clear(); ctx.ownWritesTimer = null; }, 2000);
  unrefTimer(ctx.ownWritesTimer);
}

function isOwnWrite(ctx: ConnectionContext, areaName: string, key: string, change: { newValue?: unknown }): boolean {
  const id = ownWriteKey(areaName, key);
  if (!ctx.ownWrites.has(id)) return false;
  const expected = ctx.ownWrites.get(id) === ctx.contract.canonical(change.newValue);
  ctx.ownWrites.delete(id);
  return expected;
}

async function apply(
  ctx: ConnectionContext,
  state: WebDavState,
  captured: Captured,
  client: WebDavClient | null,
  activate: boolean,
  nextSession: Session
): Promise<void> {
  const { payload, synced, remove } = await prepareChrome(ctx, state, captured);
  const icons: Record<string, unknown> = {};
  const folderIds = new Set(captured.folders.map((item) => item.id));
  const localIcons = captured.local[ctx.contract.ICONS_KEY];
  Object.entries(isRecord(localIcons) ? localIcons : {}).forEach(([id, data]) => { if (folderIds.has(id)) icons[id] = data; });
  for (const [id, digest] of Object.entries(state.icons)) icons[id] = toDataUrl(await getAsset(ctx, digest, state.assets[digest], client), 'image/png');
  const wallpapers: WallpaperRecordInput[] = [];
  for (const wallpaper of state.wallpapers) {
    const image = await getAsset(ctx, wallpaper.image, state.assets[wallpaper.image], client);
    const thumbnail = await getAsset(ctx, wallpaper.thumbnail, state.assets[wallpaper.thumbnail], client);
    wallpapers.push({ id: wallpaper.id, key: wallpaper.id, name: wallpaper.name, width: wallpaper.width,
      height: wallpaper.height, updatedAt: wallpaper.updatedAt, imageDataUrl: toDataUrl(image, 'image/webp'),
      thumbnailDataUrl: toDataUrl(thumbnail, 'image/webp') });
  }
  return ctx.withLocalWrite(async () => {
    if (captured.generation !== ctx.generation) fail(ctx, 'local-changed');
    const removed = ctx.contract.LOCAL_PREFERENCE_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(captured.local, key) && !Object.prototype.hasOwnProperty.call(state.data, key));
    const localValues: StorageItems = {
      ...pickLocalPreferences(ctx, payload),
      [ctx.contract.OVERFLOW_KEY]: payload[ctx.contract.OVERFLOW_KEY], [ctx.contract.ICONS_KEY]: icons,
      [ctx.settings.assetRevision.key]: ctx.cryptoApi.randomUUID(),
      ...(ctx.runtime.isActiveAreaName('local') && ctx.chromeFallbackArea ? { [ctx.settings.localPrimary.key]: false } : {}) };
    let wrote = false;
    try {
      await expectOwnWrites(ctx, ctx.chromeFallbackArea || ctx.localPrefsArea, ctx.chromeFallbackArea ? 'sync' : 'local',
        { ...Object.fromEntries(remove.map((key) => [key, undefined])), ...synced });
      await expectOwnWrites(ctx, ctx.localPrefsArea, 'local', { ...Object.fromEntries(removed.map((key) => [key, undefined])), ...localValues });
      if (captured.generation !== ctx.generation) fail(ctx, 'local-changed');
      // Stage the complete operation before changing either local store. Chrome
      // may terminate the worker between the media transaction and preferences.
      await ctx.privateStore.put('pendingApply', { state, captured, activate, nextSession });
      await ctx.wallpaperStore.replaceAll(wallpapers);
      if (captured.generation !== ctx.generation) fail(ctx, 'local-changed');
      wrote = true;
      if (remove.length) await storage(ctx, ctx.chromeFallbackArea || ctx.localPrefsArea, 'remove', remove);
      await storage(ctx, ctx.chromeFallbackArea || ctx.localPrefsArea, 'set', synced);
      if (removed.length) await storage(ctx, ctx.localPrefsArea, 'remove', removed);
      await storage(ctx, ctx.localPrefsArea, 'set', localValues);
    } finally { expireOwnWrites(ctx, wrote); }
    // Credentials and the merge baseline belong to the same server and must
    // commit atomically; separate records could pair a new server with an old base.
    await ctx.privateStore.put('session', nextSession);
    await ctx.privateStore.put('pendingApply', null);
    await ctx.privateStore.put('recoveryBlocked', false);
  });
}

// A pending apply staged by an older version holds fields this one drops.
function samePendingState(ctx: ConnectionContext, state: WebDavState, pendingState: unknown): boolean {
  try { return ctx.contract.equal(state, ctx.contract.validateState(pendingState)); } catch (_cause) { return false; }
}

async function recoverPendingApply(ctx: ConnectionContext): Promise<void> {
  const pending = await ctx.privateStore.get('pendingApply');
  if (!isRecord(pending)) return;
  const nextSession = readSession(pending.nextSession);
  const captured = await capture(ctx, true);
  if (samePendingState(ctx, captured.state, pending.state) && (!ctx.chromeFallbackArea || ctx.runtime.isActiveAreaName('sync'))) {
    await ctx.privateStore.put('session', nextSession);
    await ctx.privateStore.put('recoveryBlocked', false);
    await setStatus(ctx, { state: nextSession.config && nextSession.config.enabled ? 'ready' : 'paused', error: null });
  } else {
    // Preserve edits made after the interruption. A partial application is
    // never uploaded automatically; its complete previous copy is recoverable.
    await ctx.privateStore.put('replacementBackup', { captured: pending.captured, savedAt: Date.now() });
    await ctx.privateStore.put('replacementBackupMeta', { savedAt: Date.now() });
    await ctx.privateStore.put('session', { config: nextSession.config ? { ...nextSession.config, enabled: false } : null, base: null });
    await ctx.privateStore.put('recoveryBlocked', true);
    await setStatus(ctx, { state: 'error', enabled: false, error: 'interrupted-apply' });
  }
  await ctx.privateStore.put('pendingApply', null);
}

function mirrorChrome(ctx: ConnectionContext): Promise<MirrorResult> { return ctx.withLocalWrite(() => mirrorChromeInternal(ctx)); }

async function mirrorChromeInternal(ctx: ConnectionContext): Promise<MirrorResult> {
  if (!ctx.chromeFallbackArea || !ctx.runtime.isActiveAreaName('local')) return { complete: false, skipped: [] };
  const values = await storage(ctx, ctx.localPrefsArea, 'get', [...ctx.settings.BROWSER_SYNC_KEYS]);
  const existing = await storage(ctx, ctx.chromeFallbackArea, 'get', null);
  const plan = ctx.contract.planChromeBackup(values, existing, { quota: ctx.chromeFallbackArea.QUOTA_BYTES,
    itemQuota: ctx.chromeFallbackArea.QUOTA_BYTES_PER_ITEM, maxItems: ctx.chromeFallbackArea.MAX_ITEMS });
  // Only migrate an older local-primary installation when its full
  // preferences fit. Never replace Chrome with a partial WebDAV backup.
  // The card names the condition; it persists until the settings shrink.
  if (!plan.complete) {
    await setStatus(ctx, { chromeBackup: 'incomplete', chromeSkipped: plan.skipped.length });
    throw Object.assign(ctx.clientApi.error('chrome-capacity'), { recorded: true });
  }
  try {
    if (plan.remove.length) await storage(ctx, ctx.chromeFallbackArea, 'remove', plan.remove);
    if (Object.keys(plan.payload).length) await storage(ctx, ctx.chromeFallbackArea, 'set', plan.payload);
    await storage(ctx, ctx.localPrefsArea, 'set', { [ctx.settings.localPrimary.key]: false });
    await setStatus(ctx, { chromeBackup: 'complete', chromeSkipped: 0 });
  } catch (cause) {
    report(ctx, 'Could not write the browser sync backup.', cause);
    await setStatus(ctx, { chromeBackup: 'failed' });
    throw Object.assign(ctx.clientApi.error('chrome-capacity'), { recorded: true });
  }
  return plan;
}

// The browser-sync backup of an older local-primary installation is a
// standing condition of this device, not part of a WebDAV round: its
// failure is recorded for the card and never stops the round itself.
async function mirrorReporting(ctx: ConnectionContext): Promise<void> {
  try { await mirrorChrome(ctx); }
  catch (cause) { if (!isRecorded(cause)) report(ctx, 'Could not back up settings to browser sync.', cause); }
}

export {
  apply,
  expectOwnWrites,
  expireOwnWrites,
  isOwnWrite,
  mirrorChrome,
  mirrorChromeInternal,
  mirrorReporting,
  ownWriteKey,
  preferencePayload,
  prepareChrome,
  recoverPendingApply,
  samePendingState
};
