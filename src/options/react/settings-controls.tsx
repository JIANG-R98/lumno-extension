import { createAppearanceTabController } from './appearance-tab';
import { createGeneralTabController } from './general-tab';
import { createSettingToggleRowsController } from './setting-rows';

// The settings sections and tabs the page draws with React.
export function createSettingsControlsApi() {
  return Object.freeze({
    implementation: 'react',
    createAppearanceTabController,
    createGeneralTabController,
    createSettingToggleRowsController
  });
}
