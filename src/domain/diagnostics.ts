// The diagnostics file a person can export from the options page and attach
// to a report: the extension version, the browser, the settings and the
// worker's recent failures. Nothing leaves the device unless they export it.
// Each setting is shown as its definition says (Setting.diagnostics): a
// "value" keeps only its switches, numbers and option-like names, with
// longer text, addresses and every list of entries (shortcuts, sites,
// words) reduced to their type and size; a "shape" is only ever its type
// and size. Failure messages lose web and email addresses.

const MAX_DIAGNOSTIC_ERRORS = 50;
const MAX_MESSAGE_LENGTH = 300;
const MAX_CONTEXT_LENGTH = 120;
// How deep a setting value is shown before it is summarized.
const MAX_SETTING_DEPTH = 2;
const MAX_SETTING_LIST_LENGTH = 20;
// The largest time a Date can hold.
const MAX_TIME = 8.64e15;

// One failure the worker recorded; repeats of the last one raise its count.
interface DiagnosticError {
  // Milliseconds since the epoch of the latest occurrence.
  at: number;
  // What the worker was doing, e.g. "Failed to restore pinned tabs."
  context: string;
  name: string;
  message: string;
  count: number;
}

// A setting value as the file shows it.
type DiagnosticValue =
  | null
  | boolean
  | number
  | string
  | DiagnosticValue[]
  | { [key: string]: DiagnosticValue }
  | DiagnosticSummary;

// What replaces a value that could hold personal content.
interface DiagnosticSummary {
  redacted: 'text' | 'list' | 'object' | 'other';
  length?: number;
}

interface DiagnosticsReportError {
  time: string;
  context: string;
  name: string;
  message: string;
  count: number;
}

interface DiagnosticsReport {
  format: 'lumno-diagnostics';
  formatVersion: 1;
  generatedAt: string;
  extension: { version: string };
  browser: { userAgent: string; language: string };
  // The storage area that holds the settings: 'sync' or 'local'.
  storage: { primaryArea: string };
  settings: Record<string, DiagnosticValue>;
  recentErrors: DiagnosticsReportError[];
}

interface DiagnosticSettingInput {
  key: string;
  diagnostics: 'value' | 'shape';
  // As stored; undefined when nothing is.
  stored: unknown;
}

interface DiagnosticsReportInput {
  generatedAt: string;
  version: string;
  userAgent: string;
  language: string;
  primaryArea: string;
  // The stored settings the file may show, each with how much of it shows.
  settings: readonly DiagnosticSettingInput[];
  // The stored error log, read as untrusted.
  errors: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// Option names and identifiers such as "dark", "zh_CN" or "auto-fit". Dots
// are left out so that host names count as free text.
function isOptionName(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,40}$/.test(value);
}

function isSwitchOrNumber(value: unknown): boolean {
  return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

// Keeps the path of the extension's own files, which says where a failure
// came from; any other address keeps only its scheme.
function redactUrl(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!match) {
    return url;
  }
  const scheme = match[1].toLowerCase();
  if (scheme === 'chrome-extension' || scheme === 'moz-extension') {
    return `${scheme}://.../${match[3].replace(/^\/+/, '')}`;
  }
  return `${scheme}://...`;
}

// A failure message or context without addresses, on one line.
function redactText(text: string, maxLength: number): string {
  const redacted = text
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()]+/gi, redactUrl)
    .replace(/[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g, '...@...')
    .replace(/\s+/g, ' ')
    .trim();
  return truncate(redacted, maxLength);
}

// The name and message of anything a promise rejected with or code threw.
function describeFailure(failure: unknown): { name: string; message: string } {
  if (typeof failure === 'string') {
    return { name: 'Error', message: redactText(failure, MAX_MESSAGE_LENGTH) };
  }
  if (isRecord(failure)) {
    const name = typeof failure.name === 'string' && failure.name ? failure.name : 'Error';
    const message = typeof failure.message === 'string' ? failure.message : '';
    return { name: redactText(name, MAX_CONTEXT_LENGTH), message: redactText(message, MAX_MESSAGE_LENGTH) };
  }
  return { name: typeof failure, message: '' };
}

function readDiagnosticError(value: unknown): DiagnosticError | null {
  if (!isRecord(value)) {
    return null;
  }
  const { at, context, name, message, count } = value;
  if (typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > MAX_TIME ||
      typeof context !== 'string' || typeof name !== 'string' || typeof message !== 'string') {
    return null;
  }
  return {
    at,
    context: truncate(context, MAX_CONTEXT_LENGTH),
    name: truncate(name, MAX_CONTEXT_LENGTH),
    message: truncate(message, MAX_MESSAGE_LENGTH),
    count: typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 1
  };
}

// The stored log, oldest first; entries that are not well formed are dropped.
function readDiagnosticErrors(stored: unknown): DiagnosticError[] {
  if (!Array.isArray(stored)) {
    return [];
  }
  const errors: DiagnosticError[] = [];
  stored.forEach((value: unknown) => {
    const entry = readDiagnosticError(value);
    if (entry) {
      errors.push(entry);
    }
  });
  return errors.slice(-MAX_DIAGNOSTIC_ERRORS);
}

// The log with one more failure: a repeat of the latest entry raises its
// count, anything else is added and the oldest entries fall off.
function appendDiagnosticError(stored: unknown, context: string, failure: unknown, at: number): DiagnosticError[] {
  const errors = readDiagnosticErrors(stored);
  const { name, message } = describeFailure(failure);
  const entry: DiagnosticError = { at, context: redactText(context, MAX_CONTEXT_LENGTH), name, message, count: 1 };
  const latest = errors.length > 0 ? errors[errors.length - 1] : null;
  if (latest && latest.context === entry.context && latest.name === entry.name && latest.message === entry.message) {
    errors[errors.length - 1] = { ...latest, at, count: latest.count + 1 };
    return errors;
  }
  errors.push(entry);
  return errors.slice(-MAX_DIAGNOSTIC_ERRORS);
}

// A setting value as the file shows it: switches, numbers and option names
// as they are, and small objects of those a level or two deep; lists only
// when they hold switches and numbers; any other value as its type and size.
function summarizeList(value: readonly unknown[], depth: number): DiagnosticValue {
  if (depth >= MAX_SETTING_DEPTH || value.length > MAX_SETTING_LIST_LENGTH || !value.every(isSwitchOrNumber)) {
    return { redacted: 'list', length: value.length };
  }
  return value.map((item: unknown) => summarizeSettingValue(item, depth + 1));
}

function summarizeRecord(value: Record<string, unknown>, depth: number): DiagnosticValue {
  const keys = Object.keys(value);
  if (depth >= MAX_SETTING_DEPTH || keys.length > MAX_SETTING_LIST_LENGTH || !keys.every(isOptionName)) {
    return { redacted: 'object', length: keys.length };
  }
  const summary: { [key: string]: DiagnosticValue } = {};
  keys.forEach((key) => {
    summary[key] = summarizeSettingValue(value[key], depth + 1);
  });
  return summary;
}

function summarizeSettingValue(value: unknown, depth = 0): DiagnosticValue {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : { redacted: 'other' };
  }
  if (typeof value === 'string') {
    return value === '' || isOptionName(value) ? value : { redacted: 'text', length: value.length };
  }
  if (Array.isArray(value)) {
    return summarizeList(value, depth);
  }
  return isRecord(value) ? summarizeRecord(value, depth) : { redacted: 'other' };
}

// A value as only its type and size.
function summarizeSettingShape(value: unknown): DiagnosticValue {
  if (value === null) {
    return null;
  }
  if (typeof value === 'string') {
    return { redacted: 'text', length: value.length };
  }
  if (Array.isArray(value)) {
    return { redacted: 'list', length: value.length };
  }
  if (isRecord(value)) {
    return { redacted: 'object', length: Object.keys(value).length };
  }
  return { redacted: 'other' };
}

function buildDiagnosticsReport(input: DiagnosticsReportInput): DiagnosticsReport {
  const settings: Record<string, DiagnosticValue> = {};
  input.settings.forEach((setting) => {
    if (typeof setting.stored !== 'undefined') {
      settings[setting.key] = setting.diagnostics === 'shape'
        ? summarizeSettingShape(setting.stored)
        : summarizeSettingValue(setting.stored);
    }
  });
  return {
    format: 'lumno-diagnostics',
    formatVersion: 1,
    generatedAt: input.generatedAt,
    extension: { version: input.version },
    browser: { userAgent: input.userAgent, language: input.language },
    storage: { primaryArea: input.primaryArea },
    settings,
    recentErrors: readDiagnosticErrors(input.errors).map((entry) => ({
      time: new Date(entry.at).toISOString(),
      context: entry.context,
      name: entry.name,
      message: entry.message,
      count: entry.count
    }))
  };
}

export {
  MAX_DIAGNOSTIC_ERRORS,
  appendDiagnosticError,
  buildDiagnosticsReport,
  readDiagnosticErrors,
  redactText,
  summarizeSettingValue
};
export type {
  DiagnosticSettingInput,
  DiagnosticError,
  DiagnosticSummary,
  DiagnosticValue,
  DiagnosticsReport,
  DiagnosticsReportError,
  DiagnosticsReportInput
};
