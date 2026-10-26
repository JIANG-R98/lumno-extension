// The wallpaper section: per-mode wallpapers, the source tabs (built-in,
// daily, curated, Bing, local and links) with their tiles, the overlay and
// the effect controls.
import type { ChangeEvent } from 'react';
import { ref, Switch, SegmentedChoice, tooltipHandlers, PanelSlider } from './panel-primitives';
import { SectionTrigger, CuratedMixSelect, PanelSelect } from './panel-controls';
import {
  controlVisibility,
  collapsible,
  type WallpaperSourceTab,
  sourceTabId,
  sourcePanelId,
  SOURCE_TAB_REFS,
  EFFECT_SELECT_ID,
  EFFECT_SLIDER_KEYS,
  EFFECT_SLIDER_REFS
} from './panel-model';
import {
  WallpaperTile,
  activateOnKey,
  CustomWallpaperTile,
  DailyRow,
  OnlineTiles,
  SelectedSource
} from './wallpaper-tiles';
import type { WallpaperPanelContext } from './use-wallpaper-panel';
import { isNode } from '../../../shared/dom-guards';
import { RemixIcon } from '../../../shared/react/remix-icon';

export function WallpaperSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    wallpaper,
    wallpaperOpen,
    setWallpaperExpanded,
    wallpaperExpanded,
    actions,
    fileInput,
    state,
    sourceTabPanel,
    local,
    openFilePicker,
    showUploadTooltip,
    urlInput,
    urlDraft,
    setUrlDraft,
    bing,
    curated,
    documentObj,
    registerSelect,
    sliderBubble,
    effect
  } = panel;
  return (
    <div className="x-nt-wallpaper-section">
      <div {...ref('panelHeader')} className="x-nt-wallpaper-panel-header">
        <SectionTrigger
          bodyId="_x_extension_newtab_wallpaper_body_2026_unique_"
          disabled={!wallpaper.enabled}
          expanded={wallpaperOpen}
          label={wallpaper.title}
          onToggle={() => {
            if (wallpaper.enabled) setWallpaperExpanded(!wallpaperExpanded);
          }}
          title={wallpaper.title}
          titleRef="panelTitle"
          triggerRef="wallpaperAccordionTrigger"
        />
        <Switch
          name="enabledToggle"
          onChange={(checked) => {
            if (checked) setWallpaperExpanded(true);
            actions.setWallpaperEnabled(checked);
          }}
          toggle={wallpaper.toggle}
        />
      </div>
      <input
        {...ref('customInput')}
        accept="image/*"
        className="x-nt-wallpaper-file-input"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          const file = event.currentTarget.files ? event.currentTarget.files[0] : null;
          // Reset so choosing the same file again still reports a change.
          event.currentTarget.value = '';
          if (file) actions.importWallpaperFile(file);
        }}
        ref={fileInput}
        tabIndex={-1}
        type="file"
      />
      <div
        {...ref('body')}
        {...controlVisibility(wallpaperOpen)}
        className="x-nt-wallpaper-body x-nt-panel-collapsible"
        data-active-tab={wallpaper.activeTab}
        id="_x_extension_newtab_wallpaper_body_2026_unique_"
      >
        <div className="x-nt-wallpaper-mode-sync">
          <span {...ref('modeSyncTitle')} className="x-nt-wallpaper-mode-sync-title">
            {wallpaper.modeSync.title}
          </span>
          <Switch name="modeSyncToggle" onChange={actions.setModeSync} toggle={wallpaper.modeSync.toggle} />
        </div>
        <div className="x-nt-wallpaper-tab-group">
          <div
            {...ref('modeRow')}
            {...collapsible(wallpaper.mode.visible)}
            className="x-nt-appearance-setting-row x-nt-wallpaper-mode-row x-nt-panel-collapsible"
          >
            <span {...ref('modeLabel')} className="x-nt-appearance-setting-title">{wallpaper.mode.label}</span>
            <SegmentedChoice
              buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab x-nt-wallpaper-mode-tab"
              className="x-nt-wallpaper-tabs x-nt-wallpaper-mode-tabs x-nt-row-tabs"
              indicatorClassName="x-nt-wallpaper-tabs-indicator x-nt-wallpaper-mode-tabs-indicator"
              indicatorRef="modeTabsIndicator"
              name="modeTabs"
              onSelect={actions.selectWallpaperMode}
              refFor={(mode) => (mode === 'light' ? 'lightModeTab' : 'darkModeTab')}
              role="tablist"
              segment={wallpaper.mode.tabs}
              valueAttribute="data-wallpaper-mode"
              visible={state.open && wallpaperOpen && wallpaper.mode.visible}
            />
          </div>
          <div className="x-nt-appearance-setting-row">
            <span {...ref('sourceLabel')} className="x-nt-appearance-setting-title">{wallpaper.source.label}</span>
            <SegmentedChoice<WallpaperSourceTab>
              buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
              className="x-nt-wallpaper-tabs x-nt-row-tabs"
              idFor={sourceTabId}
              indicatorClassName="x-nt-wallpaper-tabs-indicator"
              indicatorRef="tabsIndicator"
              name="tabs"
              onSelect={actions.selectSourceTab}
              panelIdFor={sourcePanelId}
              refFor={(tab) => SOURCE_TAB_REFS[tab]}
              role="tablist"
              segment={wallpaper.source.tabs}
              valueAttribute="data-wallpaper-tab"
              visible={state.open && wallpaperOpen}
            />
          </div>
        </div>
        <div
          {...ref('builtInGrid')}
          {...sourceTabPanel('built-in')}
          aria-label={wallpaper.builtIn.label || undefined}
          className="x-nt-wallpaper-grid x-nt-wallpaper-grid--built-in"
        >
          {wallpaper.builtIn.tiles.map((tile) => (
            <WallpaperTile
              key={tile.id}
              onPrime={() => actions.primeWallpaper(tile.id)}
              onSelect={() => actions.selectWallpaper(tile.id)}
              tile={tile}
            />
          ))}
        </div>
        <div
          {...ref('localGrid')}
          {...sourceTabPanel('local')}
          aria-label={local.label || undefined}
          className="x-nt-wallpaper-grid x-nt-wallpaper-grid--local"
        >
          <div
            {...ref('uploadTile')}
            aria-busy={local.upload.loading ? 'true' : 'false'}
            aria-disabled={local.upload.loading ? 'true' : 'false'}
            aria-label={local.upload.label || undefined}
            aria-pressed="false"
            className="x-nt-wallpaper-tile x-nt-wallpaper-upload-tile"
            data-loading={local.upload.loading ? 'true' : 'false'}
            data-selected="false"
            data-upload="true"
            onBlur={(event) => {
              const next = isNode(event.relatedTarget) ? event.relatedTarget : null;
              if (!next || !event.currentTarget.contains(next)) actions.hideTooltip();
            }}
            onClick={openFilePicker}
            onFocus={showUploadTooltip}
            onKeyDown={activateOnKey(openFilePicker)}
            onMouseEnter={showUploadTooltip}
            onMouseLeave={() => actions.hideTooltip()}
            role="button"
            tabIndex={0}
          >
            <span className="x-nt-wallpaper-thumb x-nt-wallpaper-upload-thumb">
              <span
                className="x-nt-wallpaper-upload-placeholder"
              >
                <RemixIcon name="ri-add-large-line" />
              </span>
            </span>
          </div>
          <div
            {...ref('urlTile')}
            {...tooltipHandlers(actions, local.url.tileLabel)}
            aria-controls="_x_extension_newtab_wallpaper_url_form_2026_unique_"
            aria-disabled={local.url.disabled ? 'true' : 'false'}
            aria-expanded={local.url.open ? 'true' : 'false'}
            aria-label={local.url.tileLabel || undefined}
            className="x-nt-wallpaper-tile x-nt-wallpaper-upload-tile x-nt-wallpaper-url-tile"
            data-selected="false"
            onClick={actions.toggleUrlForm}
            onKeyDown={activateOnKey(actions.toggleUrlForm)}
            role="button"
            tabIndex={0}
          >
            <span className="x-nt-wallpaper-thumb x-nt-wallpaper-upload-thumb">
              <span
                className="x-nt-wallpaper-upload-placeholder"
              >
                <RemixIcon name="ri-link" />
              </span>
            </span>
          </div>
          {local.tiles.map((tile) => (
            <CustomWallpaperTile
              actions={actions}
              deleteLabel={local.deleteLabel}
              key={tile.id}
              tile={tile}
            />
          ))}
        </div>
        <form
          {...ref('urlForm')}
          className="x-nt-wallpaper-url-form x-nt-panel-collapsible"
          hidden={!local.url.open}
          id="_x_extension_newtab_wallpaper_url_form_2026_unique_"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            actions.submitWallpaperUrl(urlInput.current ? urlInput.current.value : urlDraft);
          }}
        >
          <input
            {...ref('urlInput')}
            aria-invalid={local.url.invalid ? 'true' : undefined}
            aria-label={local.url.inputLabel || undefined}
            autoComplete="off"
            className="_x_extension_shortcut_input_2024_unique_ x-nt-wallpaper-url-input"
            disabled={local.url.disabled}
            inputMode="url"
            onChange={(event) => {
              setUrlDraft(event.currentTarget.value);
              if (local.url.invalid) actions.clearUrlInvalid();
            }}
            placeholder={local.url.placeholder || undefined}
            ref={urlInput}
            spellCheck={false}
            type="url"
            value={urlDraft}
          />
          <button
            {...ref('urlSubmit')}
            className="x-lumno-action-button x-lumno-action-button--secondary x-nt-wallpaper-url-submit"
            disabled={local.url.disabled}
            type="submit"
          >
            {local.url.submitLabel}
          </button>
        </form>
        <div {...ref('bingPanel')} {...sourceTabPanel('bing')} aria-label={bing.label || undefined} className="x-nt-bing-panel">
          <DailyRow
            actions={actions}
            daily={{ ...bing.daily, toggle: { ...bing.daily.toggle, disabled: bing.daily.busy } }}
            name="bing"
            onToggle={actions.setBingDaily}
          />
          <div className="x-nt-bing-recent">
            <div className="x-nt-overlay-control-header">
              <span {...ref('bingRecentLabel')} className="x-nt-appearance-setting-title">{bing.recentLabel}</span>
              <button
                {...ref('bingRefresh')}
                {...tooltipHandlers(actions, bing.refresh.label)}
                aria-busy={bing.refresh.busy ? 'true' : 'false'}
                aria-label={bing.refresh.label || undefined}
                className="x-nt-panel-icon-button x-nt-bing-refresh"
                disabled={bing.refresh.disabled}
                onClick={actions.refreshBing}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="x-nt-bing-refresh-glyph x-lumno-busy-spin"
                >
                  <RemixIcon name="ri-refresh-line" />
                </span>
              </button>
            </div>
            <div
              {...ref('bingItemsHost')}
              aria-busy={bing.busy ? 'true' : 'false'}
              className="x-nt-wallpaper-grid x-nt-wallpaper-grid--bing"
              data-loading={bing.loading ? 'true' : 'false'}
            >
              <OnlineTiles
                actions={actions}
                name="bing"
                onSelect={actions.selectBingWallpaper}
                tiles={bing.tiles}
              />
            </div>
            <div {...ref('bingStatus')} aria-live="polite" className="x-nt-bing-status" role="status">
              {bing.status}
            </div>
            <SelectedSource name="bing" source={bing.selected} />
          </div>
        </div>
        <div {...ref('curatedPanel')} {...sourceTabPanel('curated')} aria-label={curated.label || undefined} className="x-nt-curated-panel">
          <DailyRow
            actions={actions}
            daily={curated.daily}
            name="curated"
            onToggle={actions.setCuratedDaily}
          />
          <div className="x-nt-appearance-setting-row">
            <span {...ref('curatedCategoryLabel')} className="x-nt-appearance-setting-title">
              {curated.category.label}
            </span>
            <SegmentedChoice
              buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
              className="x-nt-wallpaper-tabs x-nt-row-tabs"
              indicatorClassName="x-nt-wallpaper-tabs-indicator"
              indicatorRef="curatedCategoryIndicator"
              name="curatedCategoryTabs"
              onSelect={actions.selectCuratedCategory}
              role="group"
              segment={curated.category.tabs}
              valueAttribute="data-curated-category"
              visible={state.open && wallpaperOpen && wallpaper.activeTab === 'curated'}
            />
          </div>
          <div className="x-nt-bing-recent">
            <div className="x-nt-overlay-control-header">
              <span {...ref('curatedListLabel')} className="x-nt-appearance-setting-title">{curated.listLabel}</span>
              {curated.mix?.visible ? (
                <CuratedMixSelect
                  documentObj={documentObj}
                  mix={curated.mix}
                  onCheckedChange={actions.setCuratedMixCategory}
                  registerControls={registerSelect}
                />
              ) : null}
              <button
                {...ref('curatedRefresh')}
                {...tooltipHandlers(actions, curated.refreshLabel)}
                aria-label={curated.refreshLabel || undefined}
                className="x-nt-panel-icon-button x-nt-bing-refresh"
                onClick={actions.showMoreCurated}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="x-nt-bing-refresh-glyph"
                >
                  <RemixIcon name="ri-refresh-line" />
                </span>
              </button>
            </div>
            <div {...ref('curatedItemsHost')} className="x-nt-wallpaper-grid x-nt-wallpaper-grid--curated">
              <OnlineTiles
                actions={actions}
                name="curated"
                onSelect={actions.selectCuratedWallpaper}
                tiles={curated.tiles}
              />
            </div>
            <SelectedSource name="curated" source={curated.selected} />
          </div>
        </div>
        <div className="x-nt-panel-divider x-nt-panel-divider--inset" />
        <div className="x-nt-effect-control">
          <div
            {...ref('overlayControl')}
            {...controlVisibility(true)}
            className="x-nt-overlay-control x-nt-overlay-control--effect"
          >
            <PanelSlider
              bubble={sliderBubble}
              labelClass="x-nt-appearance-setting-title x-nt-effect-slider-label"
              labelRef="overlayLabel"
              marks={[50]}
              name="overlaySlider"
              onChange={actions.setOverlay}
              slider={wallpaper.overlay}
            />
          </div>
          <div className="x-nt-appearance-setting-row x-nt-effect-control-header">
            <span {...ref('effectLabel')} className="x-nt-appearance-setting-title x-nt-effect-label">
              {effect.label}
            </span>
            <PanelSelect
              documentObj={documentObj}
              hostRef="effectSelectHost"
              id={EFFECT_SELECT_ID}
              registerControls={registerSelect}
              select={{ ...effect.select, onChange: actions.selectEffect }}
            />
          </div>
          <div
            {...ref('effectInkToneControl')}
            {...collapsible(effect.inkTone.visible)}
            className="x-nt-effect-slider-control x-nt-effect-ink-tone-control x-nt-panel-collapsible"
          >
            <div className="x-nt-appearance-setting-row">
              <span {...ref('effectInkToneLabel')} className="x-nt-appearance-setting-title">
                {effect.inkTone.label}
              </span>
              <SegmentedChoice
                buttonClassName="x-nt-segmented-tab x-nt-effect-option x-nt-effect-ink-tone-option"
                className="x-nt-effect-options x-nt-effect-ink-tone-options x-nt-row-tabs"
                indicatorClassName="x-nt-effect-indicator"
                indicatorRef="effectInkToneIndicator"
                name="effectInkToneOptions"
                onSelect={actions.selectInkTone}
                role="group"
                segment={effect.inkTone.tabs}
                valueAttribute="data-wallpaper-effect-ink-tone"
                visible={state.open && wallpaperOpen && effect.inkTone.visible}
              />
            </div>
          </div>
          {EFFECT_SLIDER_KEYS.map((key) => {
            const entry = effect.sliders[key];
            const refName = EFFECT_SLIDER_REFS[key];
            return (
              <div
                {...ref(`${refName}Control`)}
                {...collapsible(entry.visible)}
                className="x-nt-effect-slider-control x-nt-panel-collapsible"
                key={key}
              >
                <PanelSlider
                  bubble={sliderBubble}
                  className="x-nt-overlay-slider-wrap x-nt-effect-slider-wrap"
                  inputClass="x-nt-overlay-slider x-nt-effect-slider"
                  labelClass="x-nt-appearance-setting-title x-nt-effect-slider-label"
                  labelRef={`${refName}Label`}
                  marks={[50]}
                  name={`${refName}Slider`}
                  onChange={(value, change) => actions.setEffectParameter(key, value, change)}
                  slider={entry}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
