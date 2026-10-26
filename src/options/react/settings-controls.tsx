import { createAppearanceTabController } from './appearance-tab';
import { createGeneralTabController } from './general-tab';
import { createSettingToggleRowsController } from './setting-rows';
import { lazyInstance } from '../../shared/lazy-instance';

// The settings sections and tabs the page draws with React.
export function createSettingsControlsApi() {
  return Object.freeze({
    implementation: 'react',
    createAppearanceTabController,
    createGeneralTabController,
    createSettingToggleRowsController
  });
}

// The one instance a page or injected script draws through, made on first use.
export const getSettingsControlsApi = lazyInstance(createSettingsControlsApi);
