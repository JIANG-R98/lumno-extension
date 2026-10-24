// The bookmark settings section: view mode, grid rows and columns, folder
// icons, and the top bar's layout and surface.
import {
  ToggleSection,
  SettingRow,
  PanelSelect,
  StaticCountSlider,
  StaticSwitch,
  StaticRowTabs
} from './panel-controls';
import { BOOKMARK_VIEW_MODE_SELECT_ID, BOOKMARK_TOPBAR_SURFACE_SELECT_ID } from './panel-model';
import { ref } from './panel-primitives';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function BookmarkSettingsSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    arrowIcon,
    documentObj,
    registerSelect,
    externalSelects
  } = panel;
  return (
    <ToggleSection arrowIcon={arrowIcon} name="bookmarkSettings">
      <SettingRow titleRef="bookmarkViewModeLabel">
        <PanelSelect
          documentObj={documentObj}
          hostRef="bookmarkViewModeSelectHost"
          id={BOOKMARK_VIEW_MODE_SELECT_ID}
          registerControls={registerSelect}
          select={externalSelects.bookmarkViewMode}
        />
      </SettingRow>
      {/* Rows and columns shape the bookmark grid; the top bar has its own shape and background. */}
      <div {...ref('bookmarkGridSettings')} className="x-nt-panel-field-group x-nt-panel-collapsible">
        <StaticCountSlider defaultValue="2" marks={[0, 300 / 7, 100]} max="8" min="1" name="bookmarkRows" />
        <StaticCountSlider defaultValue="6" marks={[0, 50, 100]} max="8" min="4" name="bookmarkColumns" />
        <SettingRow titleRef="bookmarkFolderIconsTitle">
          <StaticSwitch name="bookmarkFolderIconsToggle" />
        </SettingRow>
      </div>
      <div {...ref('bookmarkTopbarSettings')} className="x-nt-panel-field-group x-nt-panel-collapsible" hidden>
        <SettingRow titleRef="bookmarkTopbarLayoutLabel">
          <StaticRowTabs attribute="data-bookmark-topbar-layout" name="bookmarkTopbarLayout" values={['docked', 'floating']} />
        </SettingRow>
        <SettingRow titleRef="bookmarkTopbarSurfaceLabel">
          <PanelSelect
            documentObj={documentObj}
            hostRef="bookmarkTopbarSurfaceSelectHost"
            id={BOOKMARK_TOPBAR_SURFACE_SELECT_ID}
            registerControls={registerSelect}
            select={externalSelects.bookmarkTopbarSurface}
          />
        </SettingRow>
      </div>
    </ToggleSection>
  );
}
