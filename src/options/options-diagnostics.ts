// "Export diagnostics" in the Feedback & support section: saves the file
// described in domain/diagnostics.ts, for the person to attach to a report.
import { buildDiagnosticsReport } from '../domain/diagnostics';
import type { StorageAreaLike } from '../domain/storage-port';
import { createDiagnosticsLog } from '../platform/diagnostics-log';
import type { StorageChromeApi } from '../platform/settings-storage';
import { callStorage, isRecord } from '../platform/storage-call';
import { downloadJsonFile } from './options-download';

interface DiagnosticsExportOptions {
  chromeApi: StorageChromeApi | null | undefined;
  // The area the settings live in once storage is set up, and
  // chrome.storage.local for the log.
  getSettingsArea(): StorageAreaLike | null | undefined;
  localArea: StorageAreaLike | null | undefined;
  settingKeys: readonly string[];
  getPrimaryAreaName(): string;
  getVersion(): string;
  navigatorObj: { userAgent: string; language: string } | null | undefined;
  documentObj: Document;
  now?: () => number;
}

interface DiagnosticsExport {
  exportReport(): Promise<void>;
}

function createDiagnosticsExport(options: DiagnosticsExportOptions): Readonly<DiagnosticsExport> {
  const now = options.now || Date.now;
  const diagnosticsLog = createDiagnosticsLog({ chromeApi: options.chromeApi, area: options.localArea });

  async function readSettings(): Promise<Record<string, unknown>> {
    const area = options.getSettingsArea();
    if (!area) {
      return {};
    }
    const items = await callStorage(options.chromeApi, (done) => area.get([...options.settingKeys], done));
    return isRecord(items) ? items : {};
  }

  async function exportReport(): Promise<void> {
    const [settings, errors] = await Promise.all([readSettings(), diagnosticsLog.read()]);
    const exportedAt = now();
    const navigatorObj = options.navigatorObj;
    const report = buildDiagnosticsReport({
      generatedAt: new Date(exportedAt).toISOString(),
      version: options.getVersion(),
      userAgent: navigatorObj ? navigatorObj.userAgent : '',
      language: navigatorObj ? navigatorObj.language : '',
      primaryArea: options.getPrimaryAreaName(),
      settings,
      settingKeys: options.settingKeys,
      errors
    });
    downloadJsonFile(options.documentObj, `lumno-diagnostics-${exportedAt}.json`, report);
  }

  return Object.freeze({ exportReport });
}

export { createDiagnosticsExport };
export type { DiagnosticsExport, DiagnosticsExportOptions };
