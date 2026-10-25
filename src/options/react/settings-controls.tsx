import { createAppearanceGlobalSectionController } from './appearance-global-section';
import { createAppearanceNewtabLayoutSectionController } from './appearance-newtab-layout-section';
import { createAppearanceOverlaySectionController } from './appearance-overlay-section';
import { createDailyQuoteSectionController } from './daily-quote-section';
import { createGeneralTabController } from './general-tab';
import { createSettingToggleRowsController } from './setting-rows';
import { createSettingsSectionController } from './settings-rows-view';

// The settings sections and tabs the page draws with React.
export function createSettingsControlsApi() {
  return Object.freeze({
    implementation: 'react',
    createAppearanceGlobalSectionController,
    createAppearanceNewtabLayoutSectionController,
    createAppearanceOverlaySectionController,
    createDailyQuoteSectionController,
    createGeneralTabController,
    createSettingToggleRowsController,
    createSettingsSectionController
  });
}
