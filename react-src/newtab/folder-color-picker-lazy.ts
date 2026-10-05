import type { createFolderColorPicker } from './folder-color-picker';

export function createFolderColorPickerApi() {
  const icons = (globalThis as typeof globalThis & {
    LumnoNewtabBookmarkFolderIcon: {
      DEFAULT_FOLDER_COLOR: string;
      FOLDER_COLORS_STORAGE_KEY: string;
      normalizeFolderColorMap(value: unknown): Record<string, string>;
    };
  }).LumnoNewtabBookmarkFolderIcon;
  return Object.freeze({
    DEFAULT_FOLDER_COLOR: icons.DEFAULT_FOLDER_COLOR,
    FOLDER_COLORS_STORAGE_KEY: icons.FOLDER_COLORS_STORAGE_KEY,
    normalizeFolderColorMap: icons.normalizeFolderColorMap,
    async createFolderColorPicker(options: Parameters<typeof createFolderColorPicker>[0]) {
      const picker = await import('./folder-color-picker');
      return picker.createFolderColorPicker(options);
    }
  });
}
