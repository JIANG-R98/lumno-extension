// The daily quote section: its source, custom quotes, category, position,
// font and size. Its runtime (newtab/top-content/quotes.ts) hands it a model.
import { useRef } from 'react';
import { ref, Switch, SegmentedChoice, PanelSlider, tooltipHandlers } from './panel-primitives';
import { SectionTrigger, InfoButton, SettingRow, PanelSelect } from './panel-controls';
import { QUOTE_POSITION_SELECT_ID, QUOTE_FONT_SELECT_ID, collapsible, type QuoteSettingsModel } from './panel-model';
import type { WallpaperPanelContext } from './use-wallpaper-panel';
import { RemixIcon } from '../../../shared/react/remix-icon';

const BODY_ID = '_x_extension_newtab_quote_section_body_2026_unique_';
const QUOTE_TABS = 'x-nt-wallpaper-tabs x-nt-quote-tabs x-nt-row-tabs';

export function QuoteSection({ panel, settings }: { panel: WallpaperPanelContext; settings: QuoteSettingsModel }) {
  const { actions: panelActions, documentObj, registerSelect, sliderBubble } = panel;
  const { quote, actions } = settings;
  const fileInput = useRef<HTMLInputElement>(null);
  const open = quote.enabled && quote.expanded;
  const library = quote.library;
  return (
    <div {...ref('quoteSection')} className="x-nt-wallpaper-section x-nt-quote-settings">
      <div className="x-nt-wallpaper-panel-header">
        <span className="x-nt-appearance-title-group">
          <SectionTrigger
            bodyId={BODY_ID}
            disabled={!quote.enabled}
            expanded={open}
            onToggle={actions.toggleExpanded}
            title={quote.title}
            titleRef="quoteTitle"
            triggerRef="quoteAccordionTrigger"
          />
          <InfoButton
            actions={panelActions}
            label={quote.infoTooltip}
            name="quoteInfoButton"
            tooltip={quote.infoTooltip}
          />
        </span>
        <Switch
          name="quoteEnabledToggle"
          onChange={actions.setEnabled}
          toggle={{ checked: quote.enabled, label: quote.title }}
        />
      </div>
      <div
        {...ref('quoteBody')}
        {...collapsible(open)}
        className="x-nt-quote-body x-nt-panel-collapsible"
        id={BODY_ID}
      >
        <div className="x-nt-appearance-setting-row">
          <span {...ref('quoteSourceLabel')} className="x-nt-appearance-setting-title">{quote.sourceLabel}</span>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
            className={QUOTE_TABS}
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="quoteSourceIndicator"
            name="quoteSource"
            onSelect={library.importing ? () => undefined : actions.setProvider}
            role="group"
            segment={quote.source}
            valueAttribute="data-quote-provider"
            visible={open}
          />
        </div>
        <div {...ref('quoteCustomBody')} className="x-nt-quote-custom-body" hidden={!quote.customMode}>
          <div className="x-nt-appearance-setting-row x-nt-quote-library-row">
            <span className="x-nt-quote-library-info">
              <span className="x-nt-appearance-setting-title-group">
                <span className="x-nt-appearance-setting-title">{library.title}</span>
                <InfoButton
                  actions={panelActions}
                  label={library.title}
                  name="quoteImportInfoButton"
                  tooltip={library.infoTooltip}
                />
              </span>
              <span
                {...ref('quoteImportStatus')}
                className="x-nt-quote-import-status"
                data-error={library.status && library.status.error ? 'true' : 'false'}
                hidden={!library.status}
                role={library.status && library.status.error ? 'alert' : 'status'}
              >
                {library.status ? library.status.text : ''}
              </span>
            </span>
            <span className="x-nt-quote-library-actions">
              <span
                {...ref('quoteLibraryCount')}
                {...tooltipHandlers(panelActions, library.count ? library.count.filename : '')}
                aria-label={library.count ? library.count.label : undefined}
                className="x-nt-quote-library-count"
                hidden={!library.count}
                tabIndex={0}
              >
                <RemixIcon name="ri-file-text-line" />
                <span {...ref('quoteLibraryCountText')}>{library.count ? library.count.text : ''}</span>
              </span>
              <button
                {...ref('quoteLibraryShuffleButton')}
                className="x-lumno-action-button x-lumno-action-button--secondary x-nt-quote-import-button"
                disabled={library.importing}
                hidden={!library.shuffleVisible}
                onClick={actions.shuffleLibrary}
                type="button"
              >
                {library.shuffleLabel}
              </button>
              <button
                {...ref('quoteImportButton')}
                className="x-lumno-action-button x-lumno-action-button--secondary x-nt-quote-import-button"
                disabled={library.importing}
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                {library.importLabel}
              </button>
            </span>
          </div>
          <input
            {...ref('quoteFileInput')}
            accept=".txt,.md,.markdown,text/markdown,text/plain"
            hidden
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files && input.files[0];
              input.value = '';
              if (file) actions.importFile(file);
            }}
            ref={fileInput}
            type="file"
          />
        </div>
        <div className="x-nt-appearance-setting-row" hidden={quote.customMode}>
          <span {...ref('quoteCategoryLabel')} className="x-nt-appearance-setting-title">{quote.categoryLabel}</span>
          <SegmentedChoice
            buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab"
            className={QUOTE_TABS}
            indicatorClassName="x-nt-wallpaper-tabs-indicator"
            indicatorRef="quoteCategoryIndicator"
            name="quoteCategory"
            onSelect={actions.setCategory}
            role="group"
            segment={quote.category}
            valueAttribute="data-quote-category"
            visible={open && !quote.customMode}
          />
        </div>
        <SettingRow titleRef="quotePositionLabel" title={quote.positionLabel}>
          <PanelSelect
            documentObj={documentObj}
            hostRef="quotePositionSelectHost"
            id={QUOTE_POSITION_SELECT_ID}
            registerControls={registerSelect}
            select={quote.positionSelect}
          />
        </SettingRow>
        <SettingRow titleRef="quoteFontLabel" title={quote.fontLabel}>
          <PanelSelect
            documentObj={documentObj}
            hostRef="quoteFontSelectHost"
            id={QUOTE_FONT_SELECT_ID}
            registerControls={registerSelect}
            select={quote.fontSelect}
          />
        </SettingRow>
        <div {...ref('quoteFontSizeRow')} className="x-nt-overlay-control x-nt-quote-font-size">
          <PanelSlider
            bubble={sliderBubble}
            labelRef="quoteFontSizeTitle"
            name="quoteFontSizeSlider"
            onChange={actions.setFontSize}
            slider={quote.fontSize}
          />
        </div>
      </div>
    </div>
  );
}
