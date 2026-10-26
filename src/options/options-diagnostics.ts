// "Export diagnostics" in the Feedback & support section: saves the file
// described in domain/diagnostics.ts, for the person to attach to a report.
import { buildDiagnosticsReport } from '../domain/diagnostics';
import type { Setting } from '../domain/settings/define';
import { diagnosticErrors } from '../domain/settings/sync-state';
import type { SettingsStore } from '../platform/settings-store';
import { downloadJsonFile } from './options-download';

interface DiagnosticsExportOptions {
  settingsStore: Pick<SettingsStore, 'include' | 'isRead' | 'getStored'>;
  // The settings the file may show (the registry's DIAGNOSTIC_SETTINGS).
  settings: readonly Setting<unknown>[];
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
  const store = options.settingsStore;

  // Rejects when storage could not be read, so the page can say the export
  // failed instead of saving a file without the settings.
  async function readSettings(): Promise<void> {
    await store.include([...options.settings, diagnosticErrors]);
    const unread = options.settings.find((setting) => !store.isRead(setting));
    if (unread) {
      throw new Error(`${unread.key} could not be read`);
    }
  }

  async function exportReport(): Promise<void> {
    await readSettings();
    const exportedAt = now();
    const navigatorObj = options.navigatorObj;
    const report = buildDiagnosticsReport({
      generatedAt: new Date(exportedAt).toISOString(),
      version: options.getVersion(),
      userAgent: navigatorObj ? navigatorObj.userAgent : '',
      language: navigatorObj ? navigatorObj.language : '',
      primaryArea: options.getPrimaryAreaName(),
      settings: options.settings
        .filter((setting) => setting.diagnostics !== 'omit')
        .map((setting) => ({
          key: setting.key,
          diagnostics: setting.diagnostics === 'shape' ? 'shape' : 'value',
          stored: store.getStored(setting)
        })),
      errors: store.getStored(diagnosticErrors)
    });
    downloadJsonFile(options.documentObj, `lumno-diagnostics-${exportedAt}.json`, report);
  }

  return Object.freeze({ exportReport });
}

export { createDiagnosticsExport };
export type { DiagnosticsExport, DiagnosticsExportOptions };
