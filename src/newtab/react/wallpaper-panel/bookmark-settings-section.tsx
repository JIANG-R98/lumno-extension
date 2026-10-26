// The bookmark settings section: view mode, grid rows and columns, folder
// icons, and the top bar's layout and surface. Its runtime
// (newtab/section-panel-settings.ts) hands it a model.
import { SectionTrigger, PanelSelect } from './panel-controls';
import {
  BOOKMARK_VIEW_MODE_SELECT_ID,
  BOOKMARK_TOPBAR_SURFACE_SELECT_ID,
  collapsible,
  type SectionSettingsModel
} from './panel-model';
import { ref, Switch, SegmentedChoice, PanelSlider } from './panel-primitives';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

const BODY_ID = '_x_extension_newtab_bookmarkSettings_body_2026_unique_';
const ROW_TABS = 'x-nt-wallpaper-tabs x-nt-row-tabs';

export function BookmarkSettingsSection({ panel, settings }: {
  panel: WallpaperPanelContext;
  settings: SectionSettingsModel;
}) {
  const { documentObj, registerSelect, sliderBubble } = panel;
  const { bookmark, actions } = settings;
  const open = bookmark.enabled && bookmark.expanded;
  return (
    <div {...ref('bookmarkSettingsSection')} className="x-nt-wallpaper-section">
      <div className="x-nt-wallpaper-panel-header">
        <SectionTrigger
          bodyId={BODY_ID}
          disabled={!bookmark.enabled}
          expanded={open}
          label={bookmark.title}
          onToggle={actions.toggleBookmarkExpanded}
          title={bookmark.title}
          titleRef="bookmarkSettingsTitle"
          triggerRef="bookmarkSettingsTrigger"
        />
        <Switch
          name="bookmarkSettingsToggle"
          onChange={actions.setBookmarkVisible}
          toggle={{ checked: bookmark.enabled, label: bookmark.title }}
        />
      </div>
      <div
        {...ref('bookmarkSettingsBody')}
        {...collapsible(open)}
        className="x-nt-panel-section-body x-nt-panel-collapsible"
        id={BODY_ID}
      >
        <div className="x-nt-appearance-setting-row">
          <span {...ref('bookmarkViewModeLabel')} className="x-nt-appearance-setting-title">
            {bookmark.viewModeLabel}
          </span>
          <PanelSelect
            documentObj={documentObj}
            hostRef="bookmarkViewModeSelectHost"
            id={BOOKMARK_VIEW_MODE_SELECT_ID}
            registerControls={registerSelect}
            select={bookmark.viewModeSelect}
          />
        </div>
        {/* Rows and columns shape the bookmark grid; the top bar has its own shape and background. */}
        <div
          {...ref('bookmarkGridSettings')}
          className="x-nt-panel-field-group x-nt-panel-collapsible"
          hidden={bookmark.topbarMode}
        >
          <div className="x-nt-overlay-control">
            <PanelSlider
              bubble={sliderBubble}
              labelRef="bookmarkRowsLabel"
              marks={[0, 300 / 7, 100]}
              name="bookmarkRowsSlider"
              onChange={actions.setBookmarkRows}
              slider={bookmark.rows}
            />
          </div>
          <div className="x-nt-overlay-control">
            <PanelSlider
              bubble={sliderBubble}
              labelRef="bookmarkColumnsLabel"
              marks={[0, 50, 100]}
              name="bookmarkColumnsSlider"
              onChange={actions.setBookmarkColumns}
              slider={bookmark.columns}
            />
          </div>
          <div className="x-nt-appearance-setting-row">
            <span {...ref('bookmarkFolderIconsTitle')} className="x-nt-appearance-setting-title">
              {bookmark.folderIconsTitle}
            </span>
            <Switch
              name="bookmarkFolderIconsToggle"
              onChange={actions.setBookmarkFolderIconsVisible}
              toggle={bookmark.folderIcons}
            />
          </div>
        </div>
        <div
          {...ref('bookmarkTopbarSettings')}
          className="x-nt-panel-field-group x-nt-panel-collapsible"
          hidden={!bookmark.topbarMode}
        >
          <div className="x-nt-appearance-setting-row">
            <span {...ref('bookmarkTopbarLayoutLabel')} className="x-nt-appearance-setting-title">
              {bookmark.topbarLayoutLabel}
            </span>
            <SegmentedChoice
              buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
              className={ROW_TABS}
              indicatorClassName="x-nt-wallpaper-tabs-indicator"
              indicatorRef="bookmarkTopbarLayoutIndicator"
              name="bookmarkTopbarLayoutTabs"
              onSelect={actions.setBookmarkTopbarLayout}
              role="group"
              segment={bookmark.topbarLayout}
              valueAttribute="data-bookmark-topbar-layout"
              visible={open && bookmark.topbarMode}
            />
          </div>
          <div className="x-nt-appearance-setting-row">
            <span {...ref('bookmarkTopbarSurfaceLabel')} className="x-nt-appearance-setting-title">
              {bookmark.topbarSurfaceLabel}
            </span>
            <PanelSelect
              documentObj={documentObj}
              hostRef="bookmarkTopbarSurfaceSelectHost"
              id={BOOKMARK_TOPBAR_SURFACE_SELECT_ID}
              registerControls={registerSelect}
              select={bookmark.topbarSurfaceSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
