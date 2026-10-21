// The daily quote section: its source, custom quotes, font and position.
import { ref } from './panel-primitives';
import { SectionTrigger, InfoButton, StaticSwitch, SettingRow, PanelSelect } from './panel-controls';
import { QUOTE_POSITION_SELECT_ID, QUOTE_FONT_SELECT_ID } from './panel-model';
import { RangeSliderField } from '../../shared/range-slider';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function QuoteSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    arrowIcon,
    actions,
    infoIcon,
    state,
    documentObj,
    registerSelect,
    externalSelects,
    model
  } = panel;
  return (
    <div {...ref('quoteSection')} className="x-nt-wallpaper-section x-nt-quote-settings">
      <div className="x-nt-wallpaper-panel-header">
        <span className="x-nt-appearance-title-group">
          <SectionTrigger
            arrowIcon={arrowIcon}
            bodyId="_x_extension_newtab_quote_section_body_2026_unique_"
            expanded={false}
            titleRef="quoteTitle"
            triggerRef="quoteAccordionTrigger"
          />
          <InfoButton
            actions={actions}
            icon={infoIcon}
            name="quoteInfoButton"
            tooltip={state.quote.infoTooltip}
          />
        </span>
        <StaticSwitch name="quoteEnabledToggle" />
      </div>
      <div
        {...ref('quoteBody')}
        className="x-nt-quote-body x-nt-panel-collapsible"
        hidden
        id="_x_extension_newtab_quote_section_body_2026_unique_"
      >
        <div className="x-nt-appearance-setting-row">
          <span {...ref('quoteSourceLabel')} className="x-nt-appearance-setting-title" />
          <div
            {...ref('quoteSource')}
            className="x-nt-segmented-tabs x-nt-wallpaper-tabs x-nt-quote-tabs x-nt-row-tabs"
            role="group"
          >
            <span
              aria-hidden="true"
              className="x-nt-segmented-tabs-indicator x-nt-wallpaper-tabs-indicator"
            />
            {['hitokoto', 'custom'].map((provider) => (
              <button
                aria-pressed="false"
                className="x-nt-segmented-tab x-nt-wallpaper-tab"
                data-quote-provider={provider}
                key={provider}
                type="button"
              />
            ))}
          </div>
        </div>
        <div {...ref('quoteCustomBody')} className="x-nt-quote-custom-body" hidden>
          <div className="x-nt-appearance-setting-row x-nt-quote-library-row">
            <span className="x-nt-quote-library-info">
              <span className="x-nt-appearance-setting-title-group">
                <span className="x-nt-appearance-setting-title">{state.quote.library.title}</span>
                <InfoButton
                  actions={actions}
                  icon={infoIcon}
                  label={state.quote.library.title}
                  name="quoteImportInfoButton"
                  tooltip={state.quote.library.infoTooltip}
                />
              </span>
              <span
                {...ref('quoteImportStatus')}
                className="x-nt-quote-import-status"
                hidden
                role="status"
              />
            </span>
            <span className="x-nt-quote-library-actions">
              <span
                {...ref('quoteLibraryCount')}
                className="x-nt-quote-library-count"
                hidden
                tabIndex={0}
              >
                <i aria-hidden="true" className="ri-icon ri-size-14 ri-file-text-line" />
                <span {...ref('quoteLibraryCountText')} />
              </span>
              <button
                {...ref('quoteLibraryShuffleButton')}
                className="x-lumno-action-button x-lumno-action-button--secondary x-nt-quote-import-button"
                hidden
                type="button"
              >
                {state.quote.library.shuffleLabel}
              </button>
              <button
                {...ref('quoteImportButton')}
                className="x-lumno-action-button x-lumno-action-button--secondary x-nt-quote-import-button"
                type="button"
              />
            </span>
          </div>
          <input
            {...ref('quoteFileInput')}
            accept=".txt,.md,.markdown,text/markdown,text/plain"
            hidden
            type="file"
          />
        </div>
        <div className="x-nt-appearance-setting-row">
          <span {...ref('quoteCategoryLabel')} className="x-nt-appearance-setting-title" />
          <div
            {...ref('quoteCategory')}
            className="x-nt-segmented-tabs x-nt-wallpaper-tabs x-nt-quote-tabs x-nt-row-tabs"
            role="group"
          >
            <span
              {...ref('quoteCategoryIndicator')}
              aria-hidden="true"
              className="x-nt-segmented-tabs-indicator x-nt-wallpaper-tabs-indicator"
            />
            {['literature', 'poetry'].map((category) => (
              <button
                aria-pressed="false"
                className="x-nt-segmented-tab x-nt-wallpaper-tab"
                data-quote-category={category}
                key={category}
                type="button"
              />
            ))}
          </div>
        </div>
        <SettingRow titleRef="quotePositionLabel">
          <PanelSelect
            documentObj={documentObj}
            hostRef="quotePositionSelectHost"
            id={QUOTE_POSITION_SELECT_ID}
            registerControls={registerSelect}
            select={externalSelects.quotePosition}
          />
        </SettingRow>
        <SettingRow titleRef="quoteFontLabel">
          <PanelSelect
            documentObj={documentObj}
            hostRef="quoteFontSelectHost"
            id={QUOTE_FONT_SELECT_ID}
            registerControls={registerSelect}
            select={externalSelects.quoteFont}
          />
        </SettingRow>
        <div {...ref('quoteFontSizeRow')} className="x-nt-overlay-control x-nt-quote-font-size">
          <RangeSliderField
            label={<span {...ref('quoteFontSizeTitle')} className="x-nt-appearance-setting-title" />}
            {...ref('quoteFontSizeSlider')}
            className="x-nt-overlay-slider-wrap"
            inputClass="x-nt-overlay-slider"
            min={String(model.quoteFontSize?.min ?? 12)}
            max={String(model.quoteFontSize?.max ?? 24)}
            defaultValue={String(model.quoteFontSize?.defaultValue ?? 15)}
            step="1"
            rowClassName="x-nt-range-slider-row"
            valueInputProps={{
              ...ref('quoteFontSizeSliderValueInput'),
              defaultValue: String(model.quoteFontSize?.defaultValue ?? 15),
              inputMode: 'numeric'
            }}
          />
        </div>
      </div>
    </div>
  );
}
