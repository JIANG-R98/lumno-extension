export const MODE_ADD = 'add';
export const MODE_EDIT = 'edit';
export const DEFAULT_CLOSE_DELAY_MS = 180;
export const DEFAULT_ID_PREFIX = '_x_extension_newtab_shortcut_dialog_2026_unique_';

export type ShortcutDialogMode = typeof MODE_ADD | typeof MODE_EDIT;

export interface ShortcutRecord {
  id?: string;
  title?: string;
  url?: string;
  iconDataUrl?: string;
  iconSource?: 'service' | 'favicon-is' | 'cache' | 'custom' | 'builtin';
}

export function normalizeMode(
  mode: unknown,
  shortcut?: ShortcutRecord | null
): ShortcutDialogMode {
  return mode === MODE_EDIT && shortcut ? MODE_EDIT : MODE_ADD;
}

export function clampEnterOffset(value: unknown, limit: unknown = 28): number {
  const raw = Number(value);
  const max = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : 28;
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(-max, Math.min(max, raw));
}

export function getEnterOffset(sourceCenter: unknown, targetCenter: unknown): number {
  const delta = Number(sourceCenter) - Number(targetCenter);
  if (!Number.isFinite(delta) || Math.abs(delta) < 4) {
    return 0;
  }
  const offset = clampEnterOffset(delta * 0.12, 28);
  if (Math.abs(offset) < 6) {
    return delta < 0 ? -6 : 6;
  }
  return offset;
}
