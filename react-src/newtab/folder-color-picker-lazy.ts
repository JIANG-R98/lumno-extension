import type { createFolderColorPicker } from './folder-color-picker';

export function createFolderColorPickerApi() {
  return Object.freeze({
    async createFolderColorPicker(options: Parameters<typeof createFolderColorPicker>[0]) {
      const picker = await import('./folder-color-picker');
      return picker.createFolderColorPicker(options);
    }
  });
}
