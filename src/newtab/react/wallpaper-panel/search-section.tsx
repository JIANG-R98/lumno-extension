// The search section: search width and the top content (wordmark or clock)
// with the clock's font, weight, size, opacity, ink, seconds and 12-hour
// settings.
import { SectionTrigger, InfoButton, PanelSelect } from './panel-controls';
import { ref, PanelSlider, Switch, SegmentedChoice } from './panel-primitives';
import { collapsible, controlVisibility, TIME_FONT_SELECT_ID } from './panel-model';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function SearchSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    searchExpanded,
    setSearchExpanded,
    state,
    sliderBubble,
    marks,
    actions,
    documentObj,
    registerSelect
  } = panel;
  return (
    <div className="x-nt-wallpaper-section x-nt-search-section">
      <div className="x-nt-wallpaper-panel-header">
        <SectionTrigger
          bodyId="_x_extension_newtab_search_section_body_2026_unique_"
          expanded={searchExpanded}
          onToggle={() => setSearchExpanded(!searchExpanded)}
          title={state.search.title}
          titleRef="searchSectionTitle"
          triggerRef="searchSectionTrigger"
        />
      </div>
      <div
        {...ref('searchSectionBody')}
        {...collapsible(searchExpanded)}
        className="x-nt-panel-section-body x-nt-panel-collapsible"
        id="_x_extension_newtab_search_section_body_2026_unique_"
      >
        <div
          {...ref('searchWidthControl')}
          {...controlVisibility(true)}
          className="x-nt-overlay-control x-nt-search-width-control"
        >
          <PanelSlider
            bubble={sliderBubble}
            className="x-nt-overlay-slider-wrap x-nt-search-width-slider-wrap"
            inputClass="x-nt-overlay-slider x-nt-search-width-slider"
            labelRef="searchWidthLabel"
            marks={marks.searchWidth}
            name="searchWidthSlider"
            onChange={actions.setSearchWidth}
            slider={state.search.width}
          />
        </div>
        <div className="x-nt-appearance-setting-row">
          <span className="x-nt-appearance-setting-title-group">
            <span {...ref('inputAutoFocusTitle')} className="x-nt-appearance-setting-title">
              {state.search.autoFocus.title}
            </span>
            <InfoButton
              actions={actions}
              label={state.search.autoFocus.infoLabel}
              name="inputAutoFocusInfoButton"
              tooltip={state.search.autoFocus.infoTooltip}
            />
          </span>
          <Switch
            name="inputAutoFocusToggle"
            onChange={actions.setInputAutoFocus}
            toggle={state.search.autoFocus.toggle}
          />
        </div>
        <div className="x-nt-appearance-setting-row x-nt-top-content-header">
          <div {...ref('topContentTitle')} className="x-nt-appearance-setting-title">
            {state.search.topContent.title}
          </div>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab x-nt-top-content-tab"
            className="x-nt-wallpaper-tabs x-nt-top-content-tabs"
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="topContentTabsIndicator"
            name="topContentTabs"
            onSelect={actions.selectTopContent}
            refFor={(value) => ({ brand: 'topContentBrandTab', time: 'topContentTimeTab', off: 'topContentOffTab' })[value]}
            role="group"
            segment={state.search.topContent.tabs}
            valueAttribute="data-newtab-top-content"
            visible={state.open && searchExpanded}
          />
        </div>
        <div
          {...ref('topContentFontRow')}
          {...collapsible(state.search.timeFont.visible)}
          className="x-nt-top-content-font-row x-nt-panel-collapsible"
        >
          <span {...ref('topContentFontTitle')} className="x-nt-top-content-seconds-title">
            {state.search.timeFont.title}
          </span>
          <PanelSelect
            documentObj={documentObj}
            hostRef="timeFontSelectHost"
            id={TIME_FONT_SELECT_ID}
            registerControls={registerSelect}
            select={{
              ariaLabel: state.search.timeFont.ariaLabel,
              onChange: actions.setTimeFont,
              options: state.search.timeFont.options,
              value: state.search.timeFont.value
            }}
          />
        </div>
        <div
          {...ref('topContentWeightControl')}
          {...collapsible(state.search.timeWeight.visible)}
          className="x-nt-time-weight-control x-nt-panel-collapsible"
        >
          <PanelSlider
            bubble={sliderBubble}
            className="x-nt-overlay-slider-wrap x-nt-time-weight-slider-wrap"
            inputClass="x-nt-overlay-slider x-nt-time-weight-slider"
            labelRef="topContentWeightTitle"
            marks={marks.timeWeight}
            name="topContentWeightSlider"
            onChange={actions.setTimeFontWeight}
            reset={{
              label: state.search.timeWeight.resetLabel,
              name: 'topContentWeightResetButton',
              onReset: actions.resetTimeFontWeight,
              visible: state.search.timeWeight.resetVisible
            }}
            slider={state.search.timeWeight}
          />
        </div>
        <div
          {...ref('topContentSizeControl')}
          {...collapsible(state.search.timeSize.visible)}
          className="x-nt-time-weight-control x-nt-time-size-control x-nt-panel-collapsible"
        >
          <PanelSlider
            bubble={sliderBubble}
            className="x-nt-overlay-slider-wrap x-nt-time-weight-slider-wrap"
            inputClass="x-nt-overlay-slider x-nt-time-size-slider"
            labelRef="topContentSizeTitle"
            marks={marks.timeSize}
            name="topContentSizeSlider"
            onChange={actions.setTimeFontSize}
            reset={{
              label: state.search.timeSize.resetLabel,
              name: 'topContentSizeResetButton',
              onReset: actions.resetTimeFontSize,
              visible: state.search.timeSize.resetVisible
            }}
            slider={state.search.timeSize}
          />
        </div>
        <div
          {...ref('topContentOpacityControl')}
          {...collapsible(state.search.timeOpacity.visible)}
          className="x-nt-time-weight-control x-nt-time-opacity-control x-nt-panel-collapsible"
        >
          <PanelSlider
            bubble={sliderBubble}
            className="x-nt-overlay-slider-wrap x-nt-time-weight-slider-wrap"
            inputClass="x-nt-overlay-slider x-nt-time-opacity-slider"
            labelRef="topContentOpacityTitle"
            name="topContentOpacitySlider"
            onChange={actions.setTimeOpacity}
            reset={{
              label: state.search.timeOpacity.resetLabel,
              name: 'topContentOpacityResetButton',
              onReset: actions.resetTimeOpacity,
              visible: state.search.timeOpacity.resetVisible
            }}
            slider={state.search.timeOpacity}
          />
        </div>
        <div
          {...ref('topContentInkRow')}
          {...collapsible(state.search.timeInk.visible)}
          className="x-nt-top-content-font-row x-nt-panel-collapsible"
        >
          <span {...ref('topContentInkTitle')} className="x-nt-top-content-seconds-title">
            {state.search.timeInk.title}
          </span>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
            className="x-nt-wallpaper-tabs x-nt-row-tabs"
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="topContentInkIndicator"
            name="topContentInkTabs"
            onSelect={actions.selectTimeInk}
            role="group"
            segment={state.search.timeInk.tabs}
            valueAttribute="data-newtab-time-ink"
            visible={state.open && searchExpanded && state.search.timeInk.visible}
          />
        </div>
        <div
          {...ref('topContentSecondsRow')}
          {...collapsible(state.search.seconds.visible)}
          className="x-nt-top-content-seconds-row x-nt-panel-collapsible"
        >
          <span {...ref('topContentSecondsTitle')} className="x-nt-top-content-seconds-title">
            {state.search.seconds.title}
          </span>
          <Switch
            name="topContentSecondsToggle"
            onChange={actions.setTimeSecondsVisible}
            toggle={state.search.seconds.toggle}
          />
        </div>
        <div
          {...ref('topContentTwelveHourRow')}
          {...collapsible(state.search.twelveHour.visible)}
          className="x-nt-top-content-seconds-row x-nt-panel-collapsible"
        >
          <span {...ref('topContentTwelveHourTitle')} className="x-nt-top-content-seconds-title">
            {state.search.twelveHour.title}
          </span>
          <Switch
            name="topContentTwelveHourToggle"
            onChange={actions.setTime12Hour}
            toggle={state.search.twelveHour.toggle}
          />
        </div>
      </div>
    </div>
  );
}
