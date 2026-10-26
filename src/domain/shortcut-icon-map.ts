// The custom shortcut icons as stored: 128 px PNG data URLs keyed by
// shortcut id, in chrome.storage.local.

// Icon images by shortcut id.
type ShortcutIconMap = Record<string, string>;

const MAX_STORED_DATA_URL_LENGTH = 160 * 1024;
const MAX_OUTPUT_BYTES = 96 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeShortcutId(value: unknown): string {
  return String(value || '').trim();
}

function getDataUrlByteLength(value: unknown): number {
  const match = /^data:[^;,]+;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(String(value || '').trim());
  if (!match) return 0;
  const encoded = match[1];
  const padding = encoded.endsWith('==') ? 2 : (encoded.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
}

function normalizeIconDataUrl(value: unknown): string {
  const dataUrl = String(value || '').trim();
  if (!dataUrl.startsWith('data:image/png;base64,') ||
      dataUrl.length > MAX_STORED_DATA_URL_LENGTH ||
      getDataUrlByteLength(dataUrl) > MAX_OUTPUT_BYTES) {
    return '';
  }
  return dataUrl;
}

function normalizeIconMap(value: unknown): ShortcutIconMap {
  const source = isRecord(value) && !Array.isArray(value) ? value : {};
  const normalized: ShortcutIconMap = {};
  Object.keys(source).forEach((rawId) => {
    const shortcutId = normalizeShortcutId(rawId);
    const dataUrl = normalizeIconDataUrl(source[rawId]);
    if (shortcutId && dataUrl) {
      normalized[shortcutId] = dataUrl;
    }
  });
  return normalized;
}

export {
  MAX_OUTPUT_BYTES,
  getDataUrlByteLength,
  normalizeIconDataUrl,
  normalizeIconMap,
  normalizeShortcutId
};
export type { ShortcutIconMap };
