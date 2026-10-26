import type { createFolderColorPicker } from './folder-color-picker';
import { lazyInstance } from '../../shared/lazy-instance';

export function createFolderColorPickerApi() {
  return Object.freeze({
    async createFolderColorPicker(options: Parameters<typeof createFolderColorPicker>[0]) {
      const picker = await import('./folder-color-picker');
      return picker.createFolderColorPicker(options);
    }
  });
}

// The one instance a page or injected script draws through, made on first use.
export const getFolderColorPickerApi = lazyInstance(createFolderColorPickerApi);
