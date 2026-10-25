export const DEFAULT_FOLDER_COLOR = '#5393FF';
export const MAX_SAVED_FOLDER_COLORS = 8;

export function normalizeSavedFolderColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const item of value) {
    const color = parseFolderColor(item);
    if (color && !colors.includes(color)) colors.push(color);
    if (colors.length === MAX_SAVED_FOLDER_COLORS) break;
  }
  return colors;
}

export function parseFolderColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const hex = text.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const expanded = hex[1].length === 3
      ? hex[1].split('').map((digit) => digit + digit).join('') : hex[1];
    return `#${expanded.toUpperCase()}`;
  }
  const rgb = text.match(/^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*\))?$/i);
  if (!rgb || text.toLowerCase().startsWith('rgb(') !== text.endsWith(')')) return null;
  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel > 255)) return null;
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function folderColorToRgb(color: string): string {
  return `rgb(${folderColorToChannels(color).join(', ')})`;
}

// A color's red, green and blue channels, as the picker's fields show them.
export type FolderColorChannels = [string, string, string];

export function folderColorToChannels(color: string): FolderColorChannels {
  const hex = parseFolderColor(color) || DEFAULT_FOLDER_COLOR;
  const channel = (offset: number) => String(parseInt(hex.slice(offset, offset + 2), 16));
  return [channel(1), channel(3), channel(5)];
}

// The channels with the one at `index` replaced.
export function withFolderColorChannel(channels: FolderColorChannels, index: number, value: string): FolderColorChannels {
  return [
    index === 0 ? value : channels[0],
    index === 1 ? value : channels[1],
    index === 2 ? value : channels[2]
  ];
}
