// The recent settings section: the recent mode and row count.
import { ToggleSection, SettingRow, StaticRowTabs } from './panel-controls';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function RecentSettingsSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    arrowIcon
  } = panel;
  return (
    <ToggleSection arrowIcon={arrowIcon} name="recentSettings">
      <SettingRow titleRef="recentModeLabel">
        <StaticRowTabs attribute="data-recent-mode" name="recentMode" values={['latest', 'most']} />
      </SettingRow>
      <SettingRow titleRef="recentRowsLabel">
        <StaticRowTabs attribute="data-recent-rows" labeled name="recentRows" values={['1', '2']} />
      </SettingRow>
    </ToggleSection>
  );
}
