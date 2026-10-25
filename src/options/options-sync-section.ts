// The browser sync card on the Account tab: its status line and last-sync
// tooltip, the note on how many New Tab shortcuts browser sync carries, the
// "sync now", export and import buttons, and moving settings that older
// versions kept only in chrome.storage.local into browser sync.
import * as LumnoNewtabShortcutsStore from '../domain/shortcuts-store';
import type * as Settings from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import { isHtmlTag } from '../shared/dom-guards';
import { downloadJsonFile } from './options-download';
import type { createSyncTransfer, SettingsImportPlan } from './options-sync-transfer';
import type { FormatTemplate, GetMessage, ToastTask } from './options-types';

interface SyncSectionElements {
  syncStatus: HTMLElement | null;
  syncStatusText: HTMLElement | null;
  syncNowButton: HTMLButtonElement | null;
  syncExportButton: HTMLButtonElement | null;
  syncImportButton: HTMLButtonElement | null;
  syncImportInput: HTMLInputElement | null;
  shortcutSyncSummary: HTMLElement | null;
}

interface SyncSectionChromeApi {
  runtime: { lastError?: { message?: string } | null };
  storage: { sync?: StorageAreaLike };
}

interface SyncSectionOptions {
  elements: SyncSectionElements;
  chromeApi: SyncSectionChromeApi;
  settings: Pick<typeof Settings, 'CHROME_SYNC_STORAGE_KEYS' | 'SYNC_META_STORAGE_KEY' |
    'NEWTAB_SHORTCUTS_V2_STORAGE_KEYS' | 'WEBDAV_STATUS_STORAGE_KEY'>;
  syncTransfer: ReturnType<typeof createSyncTransfer> | null;
  // The provider area.
  storageArea: StorageAreaLike | null;
  localStorageArea: StorageAreaLike | null;
  getActivePrimaryAreaName(): string;
  getMessage: GetMessage;
  formatTemplate: FormatTemplate;
  showToast(message: string, isError?: boolean): void;
  beginToast(message: string): ToastTask;
  showTooltipFor(target: HTMLElement): void;
  documentObj: Document;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function createSyncSection(options: SyncSectionOptions) {
  const {
    syncStatus,
    syncStatusText,
    syncNowButton,
    syncExportButton,
    syncImportButton,
    syncImportInput,
    shortcutSyncSummary
  } = options.elements;
  const {
    beginToast,
    formatTemplate,
    getActivePrimaryAreaName,
    getMessage,
    localStorageArea,
    showToast,
    showTooltipFor,
    storageArea,
    syncTransfer
  } = options;
  const chrome = options.chromeApi;
  const SETTINGS = options.settings;
  const SYNC_KEYS = SETTINGS.CHROME_SYNC_STORAGE_KEYS;
  const SYNC_META_STORAGE_KEY = SETTINGS.SYNC_META_STORAGE_KEY;
  const documentObj = options.documentObj;

  function setSyncButtonEnabled(button: HTMLButtonElement | null, enabled: boolean): void {
    if (!button) {
      return;
    }
    button.disabled = !enabled;
    button.setAttribute('data-disabled', enabled ? 'false' : 'true');
  }

  function formatSyncTime(timestamp: number | string): string {
    if (!timestamp) {
      return '';
    }
    try {
      return new Date(timestamp).toLocaleString();
    } catch (e) {
      return '';
    }
  }

  function updateSyncStatusText(statusKey: string, fallback: string, params?: Record<string, string | number>): void {
    if (!syncStatus) {
      return;
    }
    let statusStyle = '';
    let tooltipKey = 'sync_status_hint';
    if (statusKey === 'sync_status_ready' || statusKey === 'sync_status_done') {
      statusStyle = 'success';
      tooltipKey = 'sync_status_hint';
    } else if (statusKey === 'sync_status_failed' || statusKey === 'sync_status_failed_reason' || statusKey === 'sync_status_unavailable') {
      statusStyle = 'danger';
      tooltipKey = 'sync_status_unavailable_hint';
    }
    if (statusStyle) {
      syncStatus.setAttribute('data-status', statusStyle);
    } else {
      syncStatus.removeAttribute('data-status');
    }
    if (syncStatus.hasAttribute('data-i18n-tooltip')) {
      syncStatus.setAttribute('data-i18n-tooltip', tooltipKey);
    }
    syncStatus.setAttribute('data-tooltip', getMessage(tooltipKey, syncStatus.getAttribute('data-tooltip') || ''));
    const template = getMessage(statusKey, fallback);
    const target = syncStatusText || syncStatus;
    target.textContent = params ? formatTemplate(template, params) : template;
  }

  function updateSyncNowTooltip(timeText: string): void {
    if (!syncNowButton) {
      return;
    }
    if (!timeText) {
      syncNowButton.setAttribute('data-tooltip', getMessage('sync_tooltip_default', '手动同步'));
      return;
    }
    const template = getMessage('sync_tooltip_last_manual', '最近导入/手动同步 {time}');
    syncNowButton.setAttribute('data-tooltip', formatTemplate(template, { time: timeText }));
    if (syncNowButton.matches(':hover') || syncNowButton.matches(':focus')) {
      showTooltipFor(syncNowButton);
    }
  }

  // Says how many New Tab shortcuts browser sync carries and where the
  // rest are kept, since what does not fit stays on this device or goes
  // through WebDAV.
  let shortcutSyncSummaryRevision = 0;
  function refreshShortcutSyncSummary(): void {
    const store = LumnoNewtabShortcutsStore;
    if (!shortcutSyncSummary || !storageArea || getActivePrimaryAreaName() !== 'sync' ||
        !localStorageArea) {
      if (shortcutSyncSummary) shortcutSyncSummary.hidden = true;
      return;
    }
    const revision = ++shortcutSyncSummaryRevision;
    storageArea.get(store.SHORTCUT_STORAGE_KEYS.slice(), (values) => {
      localStorageArea.get([store.SHORTCUTS_LOCAL_OVERFLOW_KEY, SETTINGS.WEBDAV_STATUS_STORAGE_KEY], (local) => {
        if (revision !== shortcutSyncSummaryRevision) return;
        const summary = store.summarizeShortcutSync(values || {}, local && local[store.SHORTCUTS_LOCAL_OVERFLOW_KEY]);
        const webdavStatus = local ? local[SETTINGS.WEBDAV_STATUS_STORAGE_KEY] : undefined;
        const webdav = isRecord(webdavStatus) && webdavStatus.enabled === true;
        let text = '';
        if (summary.total <= 0) {
          text = '';
        } else if (summary.syncFailed) {
          text = formatTemplate(webdav
            ? getMessage('options_shortcut_sync_failed_webdav', 'Shortcuts couldn’t be saved to browser sync; all {count} sync through WebDAV for now.')
            : getMessage('options_shortcut_sync_failed_local', 'Shortcuts couldn’t be saved to browser sync; all {count} stay on this device for now.'),
          { count: summary.total });
        } else if (!summary.synced) {
          text = formatTemplate(webdav
            ? getMessage('options_shortcut_sync_none_webdav', 'Shortcuts: browser sync is full, so all {count} sync through WebDAV.')
            : getMessage('options_shortcut_sync_none_local', 'Shortcuts: browser sync is full, so all {count} stay on this device. Turn on WebDAV to sync them.'),
          { count: summary.total });
        } else if (!summary.localOnly) {
          text = formatTemplate(getMessage('options_shortcut_sync_all', 'Shortcuts: all {count} sync with the browser.'),
            { count: summary.total });
        } else {
          text = formatTemplate(webdav
            ? getMessage('options_shortcut_sync_split_webdav', 'Shortcuts: {synced} sync with the browser; the other {local} sync through WebDAV.')
            : getMessage('options_shortcut_sync_split_local', 'Shortcuts: {synced} sync with the browser; {local} exceed its sync space and stay on this device. Turn on WebDAV to sync them too.'),
          { synced: summary.synced, local: summary.localOnly });
        }
        shortcutSyncSummary.textContent = text;
        shortcutSyncSummary.hidden = !text;
      });
    });
  }

  function refreshSyncStatus(): void {
    refreshShortcutSyncSummary();
    if (!syncStatus) {
      return;
    }
    if (!storageArea) {
      updateSyncStatusText('sync_status_unavailable', '同步不可用');
      setSyncButtonEnabled(syncNowButton, false);
      setSyncButtonEnabled(syncExportButton, false);
      setSyncButtonEnabled(syncImportButton, false);
      return;
    }
    setSyncButtonEnabled(syncNowButton, true);
    setSyncButtonEnabled(syncExportButton, true);
    setSyncButtonEnabled(syncImportButton, true);
    updateSyncStatusText('sync_status_ready', '同步已开启');
    // The last-sync time describes the browser's own sync service.
    (chrome.storage.sync || storageArea).get([SYNC_META_STORAGE_KEY], (result) => {
      const meta = result ? result[SYNC_META_STORAGE_KEY] : null;
      const lastSyncAt = isRecord(meta) && (typeof meta.lastSyncAt === 'number' || typeof meta.lastSyncAt === 'string')
        ? meta.lastSyncAt
        : '';
      updateSyncNowTooltip(lastSyncAt ? formatSyncTime(lastSyncAt) : '');
    });
  }

  function migrateStorageIfNeeded(keys: string[]): void {
    if (!storageArea || !localStorageArea || getActivePrimaryAreaName() === 'local') {
      return;
    }
    localStorageArea.get(keys, (localItems) => {
      const localResult = localItems || {};
      const hasLocal = keys.some((key) => typeof localResult[key] !== 'undefined');
      if (!hasLocal) {
        return;
      }
      storageArea.get(keys, (syncItems) => {
        const syncResult = syncItems || {};
        const missingSyncValues: Record<string, unknown> = {};
        keys.forEach((key) => {
          if (typeof localResult[key] !== 'undefined' && typeof syncResult[key] === 'undefined') {
            missingSyncValues[key] = localResult[key];
          }
        });
        // Grouped shortcuts move only as a whole save, never chunk by chunk.
        const [shortcutsHeadKey] = SETTINGS.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS;
        SETTINGS.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS.forEach((key) => {
          if (!Object.prototype.hasOwnProperty.call(missingSyncValues, shortcutsHeadKey)) {
            delete missingSyncValues[key];
          } else if (typeof localResult[key] !== 'undefined') {
            missingSyncValues[key] = localResult[key];
          }
        });
        const missingKeys = Object.keys(missingSyncValues);
        if (missingKeys.length === 0) {
          return;
        }
        storageArea.get(missingKeys, (latestSyncItems) => {
          const latestSyncResult = latestSyncItems || {};
          const groupedKeys = SETTINGS.NEWTAB_SHORTCUTS_V2_STORAGE_KEYS;
          // The grouped save still moves whole while sync lacks its head,
          // replacing any stray chunk there; once sync has a head, none of it moves.
          const groupStillMissing = typeof latestSyncResult[shortcutsHeadKey] === 'undefined';
          const stillMissingSyncValues: Record<string, unknown> = {};
          missingKeys.forEach((key) => {
            const missing = groupedKeys.includes(key)
              ? groupStillMissing
              : typeof latestSyncResult[key] === 'undefined';
            if (missing) {
              stillMissingSyncValues[key] = missingSyncValues[key];
            }
          });
          if (Object.keys(stillMissingSyncValues).length > 0) {
            storageArea.set(stillMissingSyncValues);
          }
        });
      });
    });
  }

  // Wires the three buttons and the hidden file input.
  function bindControls(): void {
    const transfer = syncTransfer;
    if (!transfer) {
      return;
    }
    function getSyncFailureMessage(): string {
      const reason = chrome.runtime.lastError
        ? chrome.runtime.lastError.message
        : '';
      return formatTemplate(getMessage('sync_status_failed_reason', '同步失败：{reason}'), {
        reason: reason || getMessage('sync_status_failed', '同步失败')
      });
    }

    if (syncNowButton) {
      syncNowButton.addEventListener('click', () => {
        // Pushes the values browser sync already holds, stamped as a manual sync.
        const browserSyncArea = chrome.storage.sync;
        if (!browserSyncArea) {
          updateSyncStatusText('sync_status_unavailable', '同步不可用');
          return;
        }
        if (syncNowButton.getAttribute('aria-busy') === 'true') {
          return;
        }
        syncNowButton.setAttribute('aria-busy', 'true');
        browserSyncArea.get(SYNC_KEYS.slice(), (result) => {
          browserSyncArea.set(transfer.buildManualSyncPayload(result, Date.now()), () => {
            syncNowButton.removeAttribute('aria-busy');
            if (chrome.runtime.lastError) {
              showToast(getSyncFailureMessage(), true);
              return;
            }
            showToast(getMessage('sync_status_done', '同步完成'), false);
            updateSyncNowTooltip(formatSyncTime(Date.now()));
          });
        });
      });
    }

    if (syncExportButton) {
      syncExportButton.addEventListener('click', () => {
        if (!storageArea) {
          return;
        }
        storageArea.get(SYNC_KEYS.slice(), (result) => {
          downloadJsonFile(
            documentObj,
            `lumno-settings-${Date.now()}.json`,
            transfer.buildExportFile(result, new Date().toISOString())
          );
          showToast(getMessage('sync_export_done', '已导出配置'), false);
        });
      });
    }

    function readTextFile(file: File): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('file-read-failed'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsText(file);
      });
    }

    function applySyncImport(area: StorageAreaLike, plan: SettingsImportPlan, toastTask: ToastTask): void {
      area.set(plan.payload, () => {
        if (chrome.runtime.lastError) {
          toastTask.fail(getSyncFailureMessage());
          return;
        }
        const finishImport = (): void => {
          toastTask.done(getMessage('sync_import_done', '导入完成'));
          refreshSyncStatus();
        };
        if (!plan.keysToClear.length || !area.remove) {
          finishImport();
          return;
        }
        area.remove(plan.keysToClear, finishImport);
      });
    }

    if (syncImportButton && syncImportInput) {
      syncImportButton.addEventListener('click', () => {
        syncImportInput.click();
      });
      syncImportInput.addEventListener('change', (event) => {
        const input = event.target;
        const file = isHtmlTag(input, 'input') && input.files ? input.files[0] : null;
        if (!file) {
          return;
        }
        const toastTask = beginToast(getMessage('sync_importing', '正在导入配置…'));
        const failInvalid = () => toastTask.fail(getMessage('sync_import_invalid', '配置文件无效'));
        readTextFile(file).then((text) => {
          const data = transfer.parseImportFile(text);
          const plan = data ? transfer.buildImportPlan(data, Date.now()) : null;
          if (!plan) {
            failInvalid();
          } else if (storageArea) {
            applySyncImport(storageArea, plan, toastTask);
          } else {
            toastTask.cancel();
          }
        }, failInvalid).finally(() => {
          syncImportInput.value = '';
        });
      });
    }
  }

  return Object.freeze({
    bindControls,
    migrateStorageIfNeeded,
    refreshShortcutSyncSummary,
    refreshSyncStatus,
    updateSyncStatusText
  });
}

export { createSyncSection };
export type { SyncSectionChromeApi, SyncSectionElements, SyncSectionOptions };
