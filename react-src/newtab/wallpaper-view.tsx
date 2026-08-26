import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { CSSProperties, ReactNode } from 'react';
import {
  RangeSliderField
} from '../shared/range-slider';

type WallpaperItem = {
  id: string;
  path?: string;
  thumbnailUrl: string;
};

type FaviconItem = {
  id: string;
  inlineSvg?: string;
  previewUrl?: string;
};

type TopContentItem = {
  label: string;
  value: 'brand' | 'time' | 'off';
};

type EffectInkToneItem = {
  fallback: string;
  tone: 'dark' | 'light';
};

const DEFAULT_EFFECT_INK_TONES: EffectInkToneItem[] = [
  { tone: 'dark', fallback: 'Dark' },
  { tone: 'light', fallback: 'Light' }
];

const ref = (name: string) => ({ 'data-wallpaper-ref': name });

function SegmentedTabs({
  ariaHidden,
  ariaLabel,
  children,
  className,
  dataVisible,
  indicatorClassName,
  indicatorRef,
  name,
  role
}: {
  ariaHidden?: boolean | 'false' | 'true';
  ariaLabel?: string;
  children: ReactNode;
  className: string;
  dataVisible?: 'false' | 'true';
  indicatorClassName: string;
  indicatorRef: string;
  name: string;
  role: 'group' | 'tablist';
}) {
  return (
    <div
      {...ref(name)}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      className={`x-nt-segmented-tabs ${className}`}
      data-visible={dataVisible}
      role={role}
    >
      <span
        {...ref(indicatorRef)}
        aria-hidden="true"
        className={`x-nt-segmented-tabs-indicator ${indicatorClassName}`}
      />
      {children}
    </div>
  );
}

function Switch({
  ariaLabel,
  name
}: {
  ariaLabel?: string;
  name: string;
}) {
  return (
    <label className="x-nt-wallpaper-switch">
      <input
        {...ref(name)}
        aria-label={ariaLabel}
        role="switch"
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="x-nt-wallpaper-switch-slider"
      />
    </label>
  );
}

type RangeSliderTick = {
  align?: string;
  key?: string;
  label: string;
  percent?: number;
  searchKey?: string;
};

function Scale({
  className = '',
  ticks
}: {
  className?: string;
  ticks: RangeSliderTick[];
}) {
  return (
    <div
      aria-hidden="true"
      className={`x-nt-overlay-scale${className ? ` ${className}` : ''}`}
    >
      {ticks.map((tick, index) => (
        <span
          className={`x-nt-overlay-tick${
            tick.searchKey ? ' x-nt-search-width-tick' : ''
          }`}
          data-align={tick.align || 'center'}
          data-overlay-tick={tick.key}
          data-search-width-tick={tick.searchKey}
          key={tick.key || tick.searchKey || index}
          style={
            typeof tick.percent === 'number'
              ? ({
                  '--x-nt-overlay-tick-percent': `${tick.percent}%`,
                  '--x-nt-search-width-tick-percent': `${tick.percent}%`
                } as CSSProperties)
              : undefined
          }
        >
          {tick.label}
        </span>
      ))}
    </div>
  );
}

function SliderControl({
  controlClass = 'x-nt-effect-slider-control',
  controlRef,
  labelClass = 'x-nt-effect-slider-label',
  labelRef,
  sliderClass = 'x-nt-overlay-slider x-nt-effect-slider',
  sliderRef,
  ticks,
  visible = true,
  wrapClass = 'x-nt-overlay-slider-wrap x-nt-effect-slider-wrap'
}: {
  controlClass?: string;
  controlRef: string;
  labelClass?: string;
  labelRef: string;
  sliderClass?: string;
  sliderRef: string;
  ticks: RangeSliderTick[];
  visible?: boolean;
  wrapClass?: string;
}) {
  return (
    <div
      {...ref(controlRef)}
      aria-hidden={visible ? 'false' : 'true'}
      className={controlClass}
      data-visible={visible ? 'true' : 'false'}
    >
      <div className="x-nt-overlay-control-header">
        <span {...ref(labelRef)} className={labelClass} />
      </div>
      <RangeSliderField
        {...ref(sliderRef)}
        className={wrapClass}
        inputClass={sliderClass}
        max="100"
        min="0"
        rowClassName="x-nt-range-slider-row"
        step="1"
        valueInputProps={{
          ...ref(`${sliderRef}ValueInput`),
          'aria-label': 'Slider value',
          defaultValue: '50',
          inputMode: 'numeric'
        }}
      >
        <Scale ticks={ticks} />
      </RangeSliderField>
    </div>
  );
}

function WallpaperTile({
  checkIcon,
  item
}: {
  checkIcon: string;
  item: WallpaperItem;
}) {
  return (
    <button
      aria-pressed="false"
      className="x-nt-wallpaper-tile"
      data-selected="false"
      data-wallpaper-id={item.id}
      data-wallpaper-path={item.path}
      type="button"
    >
      <span className="x-nt-wallpaper-thumb">
        <img
          alt=""
          decoding="async"
          draggable={false}
          loading="lazy"
          src={item.thumbnailUrl}
        />
      </span>
      <span
        className="x-nt-wallpaper-check"
        dangerouslySetInnerHTML={{
          __html: checkIcon
        }}
      />
    </button>
  );
}

function FaviconTile({
  checkIcon,
  item
}: {
  checkIcon: string;
  item: FaviconItem;
}) {
  return (
    <button
      aria-pressed="false"
      className="x-nt-wallpaper-tile x-nt-favicon-option"
      data-newtab-favicon-id={item.id}
      data-selected="false"
      type="button"
    >
      <span className="x-nt-wallpaper-thumb x-nt-favicon-thumb">
        {item.inlineSvg ? (
          <span
            aria-hidden="true"
            className="x-nt-favicon-image x-nt-favicon-svg-preview"
            dangerouslySetInnerHTML={{ __html: item.inlineSvg }}
          />
        ) : (
          <img
            alt=""
            className="x-nt-favicon-image"
            draggable={false}
            src={item.previewUrl}
          />
        )}
      </span>
      <span
        className="x-nt-wallpaper-check"
        dangerouslySetInnerHTML={{ __html: checkIcon }}
      />
    </button>
  );
}

function WallpaperPanel({ model }: { model: Record<string, any> }) {
  const defaultTicks: RangeSliderTick[] = [
    { align: 'start', label: '0' },
    { key: 'default', label: 'Default' },
    { align: 'end', label: '100%' }
  ];
  const checkIcon = String(model.icons?.check || '');
  const topContentOptions: TopContentItem[] = Array.isArray(model.topContentOptions)
    ? model.topContentOptions
    : [
        { value: 'brand', label: 'Brand' },
        { value: 'time', label: 'Time' },
        { value: 'off', label: 'Hide' }
      ];
  const timeFontWeightMin = Number(model.timeFontWeight?.min) || 300;
  const timeFontWeightMax = Number(model.timeFontWeight?.max) || 800;
  const timeFontWeightDefault = Number(model.timeFontWeight?.defaultValue) || 320;
  const timeFontWeightTicks: RangeSliderTick[] = [
    { align: 'start', label: String(timeFontWeightMin) },
    {
      label: String(Math.round((timeFontWeightMin + timeFontWeightMax) / 2))
    },
    { align: 'end', label: String(timeFontWeightMax) }
  ];
  const effectInkTones: EffectInkToneItem[] = Array.isArray(model.effectInkTones)
    ? model.effectInkTones
    : DEFAULT_EFFECT_INK_TONES;
  const shortcutColumnsMin = Number(model.shortcutColumns?.min) || 4;
  const shortcutColumnsMax = Math.max(
    shortcutColumnsMin,
    Number(model.shortcutColumns?.max) || 16
  );
  const shortcutColumnsDefault = Math.min(
    shortcutColumnsMax,
    Math.max(
      shortcutColumnsMin,
      Number(model.shortcutColumns?.defaultValue) || 10
    )
  );
  const shortcutColumnTicks: RangeSliderTick[] = Array.isArray(
    model.shortcutColumns?.ticks
  )
    ? model.shortcutColumns.ticks
    : [
        { align: 'start', label: '4', percent: 0 },
        { label: '8', percent: 100 / 3 },
        { label: '12', percent: 200 / 3 },
        { align: 'end', label: '16', percent: 100 }
      ];
  const shortcutSizeMin = Number(model.shortcutSize?.min) || 48;
  const shortcutSizeMax = Math.max(
    shortcutSizeMin,
    Number(model.shortcutSize?.max) || 80
  );
  const shortcutSizeDefault = Math.min(
    shortcutSizeMax,
    Math.max(shortcutSizeMin, Number(model.shortcutSize?.defaultValue) || 64)
  );
  const shortcutSizeTicks: RangeSliderTick[] = Array.isArray(
    model.shortcutSize?.ticks
  )
    ? model.shortcutSize.ticks
    : [
        { align: 'start', label: '48', percent: 0 },
        { label: '64', percent: 50 },
        { align: 'end', label: '80', percent: 100 }
      ];
  const shortcutGapMin = Number.isFinite(Number(model.shortcutGap?.min))
    ? Number(model.shortcutGap.min)
    : 0;
  const shortcutGapMax = Math.max(
    shortcutGapMin,
    Number(model.shortcutGap?.max) || 24
  );
  const shortcutGapModelValue = Number(model.shortcutGap?.defaultValue);
  const shortcutGapDefault = Math.min(
    shortcutGapMax,
    Math.max(
      shortcutGapMin,
      Number.isFinite(shortcutGapModelValue) ? shortcutGapModelValue : 4
    )
  );
  const shortcutGapTicks: RangeSliderTick[] = Array.isArray(
    model.shortcutGap?.ticks
  )
    ? model.shortcutGap.ticks
    : [
        { align: 'start', label: '0', percent: 0 },
        { label: '8', percent: 100 / 3 },
        { label: '16', percent: 200 / 3 },
        { align: 'end', label: '24', percent: 100 }
      ];
  return (
    <>
      <div
        {...ref('panel')}
        aria-modal="false"
        className="x-nt-wallpaper-panel"
        data-open="false"
        role="dialog"
      >
        <div className="x-nt-appearance-header">
          <div className="x-nt-appearance-title-group">
            <div
              {...ref('appearanceTitle')}
              className="x-nt-wallpaper-panel-title"
            />
            <button
              {...ref('appearanceInfoButton')}
              className="x-nt-appearance-info-button"
              dangerouslySetInnerHTML={{
                __html: String(model.icons?.help || '')
              }}
              type="button"
            />
          </div>
          <div
            {...ref('appearanceScopeTabs')}
            className="x-nt-appearance-scope-tabs"
            role="group"
          >
            {['global', 'home'].map((scope) => (
              <button
                aria-pressed="false"
                className="x-nt-appearance-scope-tab"
                data-selected="false"
                data-theme-scope={scope}
                key={scope}
                type="button"
              >
                {scope === 'home' ? 'New Tab' : 'Global'}
              </button>
            ))}
          </div>
        </div>
        <div className="x-nt-wallpaper-panel-scroll">
          <div className="x-nt-appearance-section">
            <div
              {...ref('appearanceOptions')}
              className="x-nt-appearance-options"
            >
              {model.appearanceOptions.map(
                (item: { imageUrl: string; mode: string }) => (
                  <button
                    aria-pressed="false"
                    className="x-nt-appearance-option"
                    data-selected="false"
                    data-theme-mode={item.mode}
                    key={item.mode}
                    type="button"
                  >
                    <span className="x-nt-appearance-option-content">
                      <span className="x-nt-appearance-preview">
                        <img alt="" draggable={false} src={item.imageUrl} />
                        <span
                          className="x-nt-appearance-check"
                          dangerouslySetInnerHTML={{ __html: checkIcon }}
                        />
                      </span>
                      <span className="x-nt-appearance-label" />
                    </span>
                  </button>
                )
              )}
            </div>
            <div
              {...ref('searchWidthControl')}
              aria-hidden="true"
              className="x-nt-overlay-control x-nt-search-width-control"
              data-visible="false"
            >
              <div className="x-nt-overlay-control-header">
                <span
                  {...ref('searchWidthLabel')}
                  className="x-nt-overlay-label"
                />
              </div>
              <RangeSliderField
                {...ref('searchWidthSlider')}
                className="x-nt-overlay-slider-wrap x-nt-search-width-slider-wrap"
                data-value-suffix=" px"
                inputClass="x-nt-overlay-slider x-nt-search-width-slider"
                max={String(model.searchWidth.max)}
                min={String(model.searchWidth.min)}
                rowClassName="x-nt-range-slider-row"
                step="1"
                valueInputProps={{
                  ...ref('searchWidthSliderValueInput'),
                  'aria-label': 'Search box width value',
                  defaultValue: String(model.searchWidth.min),
                  inputMode: 'numeric'
                }}
              >
                <Scale
                  className="x-nt-search-width-scale"
                  ticks={model.searchWidth.ticks}
                />
              </RangeSliderField>
              <div className="x-nt-appearance-setting-row">
                <span className="x-nt-appearance-setting-title-group">
                  <span
                    {...ref('inputAutoFocusTitle')}
                    className="x-nt-appearance-setting-title"
                  />
                  <button
                    {...ref('inputAutoFocusInfoButton')}
                    className="x-nt-appearance-info-button"
                    dangerouslySetInnerHTML={{
                      __html: String(model.icons?.info || '')
                    }}
                    type="button"
                  />
                </span>
                <Switch
                  ariaLabel="Automatically focus the search input"
                  name="inputAutoFocusToggle"
                />
              </div>
              <div
                {...ref('shortcutsAccordion')}
                className="x-nt-shortcuts-accordion"
                data-expanded="false"
                data-enabled="true"
              >
                <div className="x-nt-appearance-setting-row x-nt-shortcuts-accordion-row">
                  <button
                    {...ref('shortcutsAccordionTrigger')}
                    aria-controls="_x_extension_newtab_shortcuts_settings_2026_unique_"
                    aria-expanded="false"
                    className="x-nt-shortcuts-accordion-trigger"
                    id="_x_extension_newtab_shortcuts_accordion_trigger_2026_unique_"
                    type="button"
                  >
                    <span className="x-nt-appearance-setting-title-group">
                      <span
                        {...ref('shortcutsTitle')}
                        className="x-nt-appearance-setting-title"
                      />
                      <span
                        aria-hidden="true"
                        className="x-nt-shortcuts-accordion-icon"
                        dangerouslySetInnerHTML={{
                          __html: String(model.icons?.arrow || '')
                        }}
                      />
                    </span>
                  </button>
                  <Switch
                    ariaLabel="Shortcuts"
                    name="shortcutsToggle"
                  />
                </div>
                <div
                  {...ref('shortcutsDetails')}
                  aria-hidden="true"
                  aria-labelledby="_x_extension_newtab_shortcuts_accordion_trigger_2026_unique_"
                  className="x-nt-shortcuts-accordion-details"
                  data-visible="false"
                  hidden
                  id="_x_extension_newtab_shortcuts_settings_2026_unique_"
                  role="region"
                >
                  <div className="x-nt-shortcuts-accordion-details-inner">
                    <div className="x-nt-appearance-setting-row">
                      <span
                        {...ref('shortcutAddTitle')}
                        className="x-nt-appearance-setting-title"
                      />
                      <Switch
                        ariaLabel="Show “+”"
                        name="shortcutAddToggle"
                      />
                    </div>
                    <div className="x-nt-appearance-setting-row">
                      <span
                        {...ref('shortcutDockMagnificationTitle')}
                        className="x-nt-appearance-setting-title"
                      />
                      <Switch
                        ariaLabel="macOS Dock-style magnification"
                        name="shortcutDockMagnificationToggle"
                      />
                    </div>
                    <div
                      {...ref('shortcutColumnsControl')}
                      aria-hidden="true"
                      className="x-nt-overlay-control x-nt-shortcut-columns-control"
                      data-visible="false"
                    >
                      <div className="x-nt-overlay-control-header">
                        <span
                          {...ref('shortcutColumnsLabel')}
                          className="x-nt-overlay-label"
                        />
                      </div>
                      <RangeSliderField
                        {...ref('shortcutColumnsSlider')}
                        className="x-nt-overlay-slider-wrap x-nt-shortcut-columns-slider-wrap"
                        defaultValue={String(shortcutColumnsDefault)}
                        inputClass="x-nt-overlay-slider x-nt-shortcut-columns-slider"
                        max={String(shortcutColumnsMax)}
                        min={String(shortcutColumnsMin)}
                        rowClassName="x-nt-range-slider-row"
                        step="1"
                        valueInputProps={{
                          ...ref('shortcutColumnsSliderValueInput'),
                          'aria-label': 'Shortcuts per row value',
                          defaultValue: String(shortcutColumnsDefault),
                          inputMode: 'numeric'
                        }}
                      >
                        <Scale
                          className="x-nt-shortcut-columns-scale x-nt-shortcut-layout-scale"
                          ticks={shortcutColumnTicks}
                        />
                      </RangeSliderField>
                    </div>
                    <div
                      {...ref('shortcutSizeControl')}
                      aria-hidden="true"
                      className="x-nt-overlay-control x-nt-shortcut-size-control"
                      data-visible="false"
                    >
                      <div className="x-nt-overlay-control-header">
                        <span
                          {...ref('shortcutSizeLabel')}
                          className="x-nt-overlay-label"
                        />
                      </div>
                      <RangeSliderField
                        {...ref('shortcutSizeSlider')}
                        className="x-nt-overlay-slider-wrap x-nt-shortcut-size-slider-wrap"
                        data-value-suffix=" px"
                        defaultValue={String(shortcutSizeDefault)}
                        inputClass="x-nt-overlay-slider x-nt-shortcut-size-slider"
                        max={String(shortcutSizeMax)}
                        min={String(shortcutSizeMin)}
                        resetButtonProps={{
                          ...ref('shortcutSizeResetButton'),
                          'aria-label': 'Reset shortcut size',
                          disabled: true,
                          title: 'Reset shortcut size'
                        }}
                        rowClassName="x-nt-range-slider-row"
                        step="1"
                        valueInputProps={{
                          ...ref('shortcutSizeSliderValueInput'),
                          'aria-label': 'Shortcut size value',
                          defaultValue: String(shortcutSizeDefault),
                          inputMode: 'numeric'
                        }}
                      >
                        <Scale
                          className="x-nt-shortcut-layout-scale"
                          ticks={shortcutSizeTicks}
                        />
                      </RangeSliderField>
                    </div>
                    <div
                      {...ref('shortcutGapControl')}
                      aria-hidden="true"
                      className="x-nt-overlay-control x-nt-shortcut-gap-control"
                      data-visible="false"
                    >
                      <div className="x-nt-overlay-control-header">
                        <span
                          {...ref('shortcutGapLabel')}
                          className="x-nt-overlay-label"
                        />
                      </div>
                      <RangeSliderField
                        {...ref('shortcutGapSlider')}
                        className="x-nt-overlay-slider-wrap x-nt-shortcut-gap-slider-wrap"
                        data-value-suffix=" px"
                        defaultValue={String(shortcutGapDefault)}
                        inputClass="x-nt-overlay-slider x-nt-shortcut-gap-slider"
                        max={String(shortcutGapMax)}
                        min={String(shortcutGapMin)}
                        resetButtonProps={{
                          ...ref('shortcutGapResetButton'),
                          'aria-label': 'Reset shortcut spacing',
                          disabled: true,
                          title: 'Reset shortcut spacing'
                        }}
                        rowClassName="x-nt-range-slider-row"
                        step="1"
                        valueInputProps={{
                          ...ref('shortcutGapSliderValueInput'),
                          'aria-label': 'Shortcut spacing value',
                          defaultValue: String(shortcutGapDefault),
                          inputMode: 'numeric'
                        }}
                      >
                        <Scale
                          className="x-nt-shortcut-layout-scale"
                          ticks={shortcutGapTicks}
                        />
                      </RangeSliderField>
                    </div>
                  </div>
                </div>
              </div>
              <a
                {...ref('moreSettingsLink')}
                className="x-nt-appearance-more-settings"
                href={model.moreSettingsUrl}
              >
                <span
                  {...ref('moreSettingsText')}
                  className="x-nt-appearance-more-settings-text"
                />
                <span
                  aria-hidden="true"
                  className="x-nt-appearance-more-settings-icon"
                  dangerouslySetInnerHTML={{
                    __html: String(model.icons?.arrow || '')
                  }}
                />
              </a>
            </div>
          </div>
          <div className="x-nt-panel-divider" />
          <div className="x-nt-wallpaper-section">
            <div
              {...ref('panelHeader')}
              className="x-nt-wallpaper-panel-header"
            >
              <div
                {...ref('panelTitle')}
                className="x-nt-wallpaper-panel-title"
              />
              <Switch name="enabledToggle" />
            </div>
            <input
              {...ref('customInput')}
              accept="image/*"
              className="x-nt-wallpaper-file-input"
              tabIndex={-1}
              type="file"
            />
            <div
              {...ref('body')}
              aria-hidden="false"
              className="x-nt-wallpaper-body"
              data-active-tab={model.activeTab || 'built-in'}
              data-visible="true"
            >
              <div className="x-nt-wallpaper-mode-sync">
                <span
                  {...ref('modeSyncTitle')}
                  className="x-nt-wallpaper-mode-sync-title"
                />
                <Switch name="modeSyncToggle" />
              </div>
              <div className="x-nt-wallpaper-tab-group">
                <SegmentedTabs
                  ariaHidden="true"
                  className="x-nt-wallpaper-tabs x-nt-wallpaper-mode-tabs"
                  dataVisible="false"
                  indicatorClassName="x-nt-wallpaper-tabs-indicator x-nt-wallpaper-mode-tabs-indicator"
                  indicatorRef="modeTabsIndicator"
                  name="modeTabs"
                  role="tablist"
                >
                  {['light', 'dark'].map((mode) => (
                    <button
                      {...ref(mode === 'light' ? 'lightModeTab' : 'darkModeTab')}
                      aria-selected="false"
                      className="x-nt-segmented-tab x-nt-wallpaper-tab x-nt-wallpaper-mode-tab"
                      data-active="false"
                      data-wallpaper-mode={mode}
                      key={mode}
                      role="tab"
                      type="button"
                    >
                      {mode === 'light' ? 'Light' : 'Dark'}
                    </button>
                  ))}
                </SegmentedTabs>
                <div
                  {...ref('modeHint')}
                  aria-hidden="true"
                  className="x-nt-wallpaper-mode-hint"
                  data-visible="false"
                />
                <SegmentedTabs
                  className="x-nt-wallpaper-tabs"
                  indicatorClassName="x-nt-wallpaper-tabs-indicator"
                  indicatorRef="tabsIndicator"
                  name="tabs"
                  role="tablist"
                >
                  {['built-in', 'local'].map((tab) => (
                    <button
                      {...ref(tab === 'built-in' ? 'builtInTab' : 'localTab')}
                      aria-selected="false"
                      className="x-nt-segmented-tab x-nt-wallpaper-tab"
                      data-active="false"
                      data-wallpaper-tab={tab}
                      key={tab}
                      role="tab"
                      type="button"
                    >
                      {tab === 'built-in' ? 'Built-in' : 'Local'}
                    </button>
                  ))}
                </SegmentedTabs>
              </div>
              <div
                {...ref('builtInGrid')}
                className="x-nt-wallpaper-grid x-nt-wallpaper-grid--built-in"
                data-wallpaper-panel="built-in"
                role="tabpanel"
              >
                {model.wallpapers.map((item: WallpaperItem) => (
                  <WallpaperTile
                    checkIcon={checkIcon}
                    item={item}
                    key={item.id}
                  />
                ))}
              </div>
              <div
                {...ref('localGrid')}
                className="x-nt-wallpaper-grid x-nt-wallpaper-grid--local"
                data-wallpaper-panel="local"
                role="tabpanel"
              >
                <div
                  {...ref('uploadTile')}
                  aria-pressed="false"
                  className="x-nt-wallpaper-tile x-nt-wallpaper-upload-tile"
                  data-loading="false"
                  data-selected="false"
                  data-upload="true"
                  role="button"
                  tabIndex={0}
                >
                  <span className="x-nt-wallpaper-thumb x-nt-wallpaper-upload-thumb">
                    <span
                      className="x-nt-wallpaper-upload-placeholder"
                      dangerouslySetInnerHTML={{
                        __html: String(model.icons?.add || '')
                      }}
                    />
                  </span>
                </div>
                <span
                  {...ref('customItemsHost')}
                  data-wallpaper-custom-items=""
                  style={{ display: 'contents' }}
                />
              </div>
              <div className="x-nt-effect-control">
                <SliderControl
                  controlClass="x-nt-overlay-control x-nt-overlay-control--effect"
                  controlRef="overlayControl"
                  labelClass="x-nt-overlay-label"
                  labelRef="overlayLabel"
                  sliderClass="x-nt-overlay-slider"
                  sliderRef="overlaySlider"
                  ticks={[
                    {
                      align: 'start',
                      key: 'transparent',
                      label: 'Transparent'
                    },
                    { key: 'default', label: 'Default' },
                    { align: 'end', key: 'cover', label: 'Cover' }
                  ]}
                  wrapClass="x-nt-overlay-slider-wrap"
                />
                <div className="x-nt-overlay-control-header x-nt-effect-control-header">
                  <span
                    {...ref('effectLabel')}
                    className="x-nt-effect-label"
                  />
                </div>
                <SegmentedTabs
                  className="x-nt-effect-options"
                  indicatorClassName="x-nt-effect-indicator"
                  indicatorRef="effectTabsIndicator"
                  name="effectOptions"
                  role="tablist"
                >
                  {model.effectTypes.map(
                    (item: { fallback: string; type: string }) => (
                      <button
                        aria-pressed="false"
                        className="x-nt-segmented-tab x-nt-effect-option"
                        data-active="false"
                        data-selected="false"
                        data-wallpaper-effect-type={item.type}
                        key={item.type}
                        type="button"
                      >
                        {item.fallback}
                      </button>
                    )
                  )}
                </SegmentedTabs>
                <div
                  {...ref('effectInkToneControl')}
                  aria-hidden="true"
                  className="x-nt-effect-slider-control x-nt-effect-ink-tone-control"
                  data-visible="false"
                >
                  <SegmentedTabs
                    className="x-nt-effect-options x-nt-effect-ink-tone-options"
                    indicatorClassName="x-nt-effect-indicator"
                    indicatorRef="effectInkToneIndicator"
                    name="effectInkToneOptions"
                    role="group"
                  >
                    {effectInkTones.map(
                      (item) => (
                        <button
                          aria-pressed="false"
                          className="x-nt-segmented-tab x-nt-effect-option x-nt-effect-ink-tone-option"
                          data-active="false"
                          data-wallpaper-effect-ink-tone={item.tone}
                          key={item.tone}
                          type="button"
                        >
                          {item.fallback}
                        </button>
                      )
                    )}
                  </SegmentedTabs>
                </div>
                <SliderControl
                  controlRef="effectStrengthControl"
                  labelRef="effectStrengthLabel"
                  sliderRef="effectStrengthSlider"
                  ticks={defaultTicks}
                />
                <SliderControl
                  controlRef="effectSizeControl"
                  labelRef="effectSizeLabel"
                  sliderRef="effectSizeSlider"
                  ticks={defaultTicks}
                />
                <SliderControl
                  controlRef="effectSpacingControl"
                  labelRef="effectSpacingLabel"
                  sliderRef="effectSpacingSlider"
                  ticks={defaultTicks}
                />
              </div>
            </div>
          </div>
          <div className="x-nt-panel-divider" />
          <div className="x-nt-wallpaper-section">
            <div className="x-nt-wallpaper-panel-header x-nt-top-content-header">
              <div
                {...ref('topContentTitle')}
                className="x-nt-wallpaper-panel-title"
              />
              <SegmentedTabs
                ariaLabel="Content above the search bar"
                className="x-nt-wallpaper-tabs x-nt-top-content-tabs"
                indicatorClassName="x-nt-wallpaper-tabs-indicator"
                indicatorRef="topContentTabsIndicator"
                name="topContentTabs"
                role="group"
              >
                {topContentOptions.map((item) => (
                  <button
                    {...ref(
                      item.value === 'brand'
                        ? 'topContentBrandTab'
                        : item.value === 'time'
                          ? 'topContentTimeTab'
                          : 'topContentOffTab'
                    )}
                    aria-pressed={item.value === 'brand'}
                    className="x-nt-segmented-tab x-nt-wallpaper-tab x-nt-top-content-tab"
                    data-active={item.value === 'brand' ? 'true' : 'false'}
                    data-newtab-top-content={item.value}
                    key={item.value}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </SegmentedTabs>
            </div>
            <div
              {...ref('topContentWeightControl')}
              aria-hidden="true"
              className="x-nt-time-weight-control"
              data-visible="false"
              hidden
            >
              <div className="x-nt-overlay-control-header">
                <span {...ref('topContentWeightTitle')}>Time font weight</span>
              </div>
              <RangeSliderField
                {...ref('topContentWeightSlider')}
                className="x-nt-overlay-slider-wrap x-nt-time-weight-slider-wrap"
                inputClass="x-nt-overlay-slider x-nt-time-weight-slider"
                max={String(timeFontWeightMax)}
                min={String(timeFontWeightMin)}
                rowClassName="x-nt-range-slider-row"
                step="1"
                defaultValue={String(timeFontWeightDefault)}
                valueInputProps={{
                  ...ref('topContentWeightSliderValueInput'),
                  'aria-label': 'Time font weight value',
                  defaultValue: String(timeFontWeightDefault),
                  inputMode: 'numeric'
                }}
              >
                <Scale ticks={timeFontWeightTicks} />
              </RangeSliderField>
            </div>
            <div
              {...ref('topContentSecondsRow')}
              aria-hidden="true"
              className="x-nt-top-content-seconds-row"
              data-visible="false"
              hidden
            >
              <span
                {...ref('topContentSecondsTitle')}
                className="x-nt-top-content-seconds-title"
              >
                Show seconds
              </span>
              <Switch
                ariaLabel="Show seconds"
                name="topContentSecondsToggle"
              />
            </div>
            <div className="x-nt-favicon-group">
              <div
                {...ref('faviconTitle')}
                className="x-nt-wallpaper-panel-title x-nt-favicon-title"
              />
              <div
                {...ref('faviconOptions')}
                className="x-nt-favicon-options"
                role="group"
              >
                {model.favicons.map((item: FaviconItem) => (
                  <FaviconTile
                    checkIcon={checkIcon}
                    item={item}
                    key={item.id}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <button
        {...ref('button')}
        aria-expanded="false"
        aria-haspopup="dialog"
        className="x-nt-wallpaper-button"
        data-active="false"
        data-open="false"
        dangerouslySetInnerHTML={{
          __html: String(model.icons?.wallpaper || '')
        }}
        type="button"
      />
    </>
  );
}

function CustomWallpapers({
  checkIcon,
  deleteIcon,
  items
}: {
  checkIcon: string;
  deleteIcon: string;
  items: WallpaperItem[];
}) {
  return (
    <>
      {items.map((item) => (
        <div
          aria-pressed="false"
          className="x-nt-wallpaper-tile x-nt-wallpaper-custom-tile"
          data-custom-wallpaper="true"
          data-selected="false"
          data-wallpaper-id={item.id}
          key={item.id}
          role="button"
          tabIndex={0}
        >
          <span className="x-nt-wallpaper-thumb">
            <img
              alt=""
              className="x-nt-wallpaper-custom-image"
              decoding="async"
              draggable={false}
              loading="lazy"
              src={item.thumbnailUrl}
            />
          </span>
          <span
            className="x-nt-wallpaper-check"
            dangerouslySetInnerHTML={{ __html: checkIcon }}
          />
          <button
            className="x-nt-wallpaper-delete-button"
            dangerouslySetInnerHTML={{ __html: deleteIcon }}
            type="button"
          />
        </div>
      ))}
    </>
  );
}

export interface WallpaperViewController {
  button: HTMLButtonElement;
  control: HTMLDivElement;
  destroy(): void;
  getRefs(): Record<string, HTMLElement>;
  panel: HTMLDivElement;
  renderCustomWallpapers(items: WallpaperItem[]): HTMLElement[];
}

export function createWallpaperViewController(
  config: Record<string, any>
): WallpaperViewController {
  const documentObj: Document = config.documentObj || document;
  const model = config.model || {};
  const control = documentObj.createElement('div');
  control.className = 'x-nt-wallpaper-control';
  control.dataset.panelOpen = 'false';
  control.dataset.reactIsland = 'newtab-wallpaper';
  const root: Root = createRoot(control);
  flushSync(() => root.render(<WallpaperPanel model={model} />));
  const panel = control.querySelector<HTMLDivElement>(
    '[data-wallpaper-ref="panel"]'
  );
  const button = control.querySelector<HTMLButtonElement>(
    '[data-wallpaper-ref="button"]'
  );
  const customItemsHost = control.querySelector<HTMLElement>(
    '[data-wallpaper-ref="customItemsHost"]'
  );
  if (!panel || !button || !customItemsHost) {
    flushSync(() => root.unmount());
    throw new Error('Lumno React wallpaper view did not mount.');
  }
  const customRoot: Root = createRoot(customItemsHost);
  let destroyed = false;
  const getRefs = () => {
    const refs: Record<string, HTMLElement> = {};
    control
      .querySelectorAll<HTMLElement>('[data-wallpaper-ref]')
      .forEach((element) => {
        const name = element.dataset.wallpaperRef;
        if (name) {
          refs[name] = element;
        }
      });
    return refs;
  };
  const controller: WallpaperViewController = {
    button,
    control,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => customRoot.unmount());
      flushSync(() => root.unmount());
    },
    getRefs,
    panel,
    renderCustomWallpapers(items: WallpaperItem[]) {
      if (destroyed) {
        return [];
      }
      flushSync(() =>
        customRoot.render(
          <CustomWallpapers
            checkIcon={String(model.icons?.check || '')}
            deleteIcon={String(model.icons?.delete || '')}
            items={Array.isArray(items) ? items : []}
          />
        )
      );
      return Array.from(
        customItemsHost.querySelectorAll<HTMLElement>(
          '.x-nt-wallpaper-custom-tile'
        )
      );
    }
  };
  return Object.freeze(controller);
}

export function createWallpaperViewApi() {
  return Object.freeze({
    implementation: 'react',
    createController: createWallpaperViewController
  });
}
