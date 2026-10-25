// The log of recent failures behind the diagnostics export, kept in
// chrome.storage.local on this device. The worker records into it; the
// options page reads it when the person exports diagnostics.
import {
  DIAGNOSTIC_ERRORS_STORAGE_KEY,
  appendDiagnosticError,
  readDiagnosticErrors
} from '../domain/diagnostics';
import type { DiagnosticError } from '../domain/diagnostics';
import type { StorageAreaLike } from '../domain/storage-port';
import { callStorage, isRecord } from './storage-call';
import type { StorageChromeApi } from './settings-storage';

interface DiagnosticsLogOptions {
  chromeApi: StorageChromeApi | null | undefined;
  area: StorageAreaLike | null | undefined;
  now?: () => number;
}

interface DiagnosticsLog {
  // Never rejects: a log that cannot be written must not add a failure.
  record(context: string, failure: unknown): Promise<void>;
  read(): Promise<DiagnosticError[]>;
}

function createDiagnosticsLog(options: DiagnosticsLogOptions): Readonly<DiagnosticsLog> {
  const { chromeApi, area } = options;
  const now = options.now || Date.now;
  // Writes run one after another, so two failures in a row both land.
  let pending: Promise<void> = Promise.resolve();

  async function readStored(): Promise<unknown> {
    if (!area) {
      return undefined;
    }
    const items = await callStorage(chromeApi, (done) => area.get([DIAGNOSTIC_ERRORS_STORAGE_KEY], done));
    return isRecord(items) ? items[DIAGNOSTIC_ERRORS_STORAGE_KEY] : undefined;
  }

  function record(context: string, failure: unknown): Promise<void> {
    const at = now();
    pending = pending.then(async () => {
      if (!area) {
        return;
      }
      const errors = appendDiagnosticError(await readStored(), context, failure, at);
      await callStorage(chromeApi, (done) => area.set({ [DIAGNOSTIC_ERRORS_STORAGE_KEY]: errors }, done));
    }).catch(() => {});
    return pending;
  }

  async function read(): Promise<DiagnosticError[]> {
    await pending;
    return readDiagnosticErrors(await readStored());
  }

  return Object.freeze({ record, read });
}

export { createDiagnosticsLog };
export type { DiagnosticsLog, DiagnosticsLogOptions };
