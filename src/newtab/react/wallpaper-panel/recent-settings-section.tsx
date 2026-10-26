// The site card settings section: which sites the cards show and how many
// rows. Its runtime (newtab/section-panel-settings.ts) hands it a model.
import { SectionTrigger } from './panel-controls';
import { collapsible, type SectionSettingsModel } from './panel-model';
import { ref, Switch, SegmentedChoice } from './panel-primitives';

const BODY_ID = '_x_extension_newtab_recentSettings_body_2026_unique_';
const ROW_TABS = 'x-nt-wallpaper-tabs x-nt-row-tabs';

export function RecentSettingsSection({ settings }: {
  settings: SectionSettingsModel;
}) {
  const { recent, actions } = settings;
  const open = recent.enabled && recent.expanded;
  return (
    <div {...ref('recentSettingsSection')} className="x-nt-wallpaper-section">
      <div className="x-nt-wallpaper-panel-header">
        <SectionTrigger
          bodyId={BODY_ID}
          disabled={!recent.enabled}
          expanded={open}
          label={recent.title}
          onToggle={actions.toggleRecentExpanded}
          title={recent.title}
          titleRef="recentSettingsTitle"
          triggerRef="recentSettingsTrigger"
        />
        <Switch
          name="recentSettingsToggle"
          onChange={actions.setRecentVisible}
          toggle={{ checked: recent.enabled, label: recent.title }}
        />
      </div>
      <div
        {...ref('recentSettingsBody')}
        {...collapsible(open)}
        className="x-nt-panel-section-body x-nt-panel-collapsible"
        id={BODY_ID}
      >
        <div className="x-nt-appearance-setting-row">
          <span {...ref('recentModeLabel')} className="x-nt-appearance-setting-title">{recent.modeLabel}</span>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
            className={ROW_TABS}
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="recentModeIndicator"
            name="recentModeTabs"
            onSelect={actions.setRecentMode}
            role="group"
            segment={recent.mode}
            valueAttribute="data-recent-mode"
            visible={open}
          />
        </div>
        <div className="x-nt-appearance-setting-row">
          <span {...ref('recentRowsLabel')} className="x-nt-appearance-setting-title">{recent.rowsLabel}</span>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
            className={ROW_TABS}
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="recentRowsIndicator"
            name="recentRowsTabs"
            onSelect={actions.setRecentRows}
            role="group"
            segment={recent.rows}
            valueAttribute="data-recent-rows"
            visible={open}
          />
        </div>
      </div>
    </div>
  );
}
