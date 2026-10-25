import type { ShortcutRule } from './messages';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The rules of assets/data/shortcut-rules.json; malformed entries are left out.
function readShortcutRules(data: unknown): ShortcutRule[] {
  const items: unknown[] = isRecord(data) && Array.isArray(data.items) ? data.items : [];
  return items.filter(isRecord).map((item): ShortcutRule => ({
    ...(typeof item.type === 'string' ? { type: item.type } : {}),
    ...(Array.isArray(item.keys) ? { keys: item.keys.filter((key): key is string => typeof key === 'string') } : {}),
    ...(typeof item.path === 'string' ? { path: item.path } : {}),
    ...(typeof item.url === 'string' ? { url: item.url } : {}),
    ...(typeof item.searchSourceType === 'string' ? { searchSourceType: item.searchSourceType } : {})
  }));
}

export { readShortcutRules };
