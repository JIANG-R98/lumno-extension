import type { createFolderColorPicker } from './folder-color-picker';

// The folder icon module belongs to the page bundle, which the page starts
// after its React islands; it is read when the page first asks for it.
function getFolderIcons() {
  return (globalThis as typeof globalThis & {
    LumnoNewtabBookmarkFolderIcon: {
      DEFAULT_FOLDER_COLOR: string;
      FOLDER_COLORS_STORAGE_KEY: string;
      normalizeFolderColorMap(value: unknown): Record<string, string>;
    };
  }).LumnoNewtabBookmarkFolderIcon;
}

export function createFolderColorPickerApi() {
  return Object.freeze({
    get DEFAULT_FOLDER_COLOR() {
      return getFolderIcons().DEFAULT_FOLDER_COLOR;
    },
    get FOLDER_COLORS_STORAGE_KEY() {
      return getFolderIcons().FOLDER_COLORS_STORAGE_KEY;
    },
    normalizeFolderColorMap(value: unknown) {
      return getFolderIcons().normalizeFolderColorMap(value);
    },
    async createFolderColorPicker(options: Parameters<typeof createFolderColorPicker>[0]) {
      const picker = await import('./folder-color-picker');
      return picker.createFolderColorPicker(options);
    }
  });
}
