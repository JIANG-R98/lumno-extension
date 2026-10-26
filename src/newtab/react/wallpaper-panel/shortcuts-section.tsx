// The shortcuts section: showing shortcuts, the add tile, dock
// magnification, and the grid's columns, size and gap.
import { ref, Switch, PanelSlider } from './panel-primitives';
import { SectionTrigger } from './panel-controls';
import { collapsible, controlVisibility } from './panel-model';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function ShortcutsSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    shortcuts,
    shortcutsOpen,
    setShortcutsExpanded,
    shortcutsExpanded,
    actions,
    shortcutControlsDisabled,
    sliderBubble,
    marks
  } = panel;
  return (
    <div className="x-nt-wallpaper-section">
      <div
        {...ref('shortcutsAccordion')}
        className="x-nt-shortcuts-accordion"
        data-enabled={shortcuts.enabled ? 'true' : 'false'}
        data-expanded={shortcutsOpen ? 'true' : 'false'}
      >
        <div className="x-nt-wallpaper-panel-header x-nt-shortcuts-accordion-row">
          <SectionTrigger
            bodyId="_x_extension_newtab_shortcuts_settings_2026_unique_"
            disabled={!shortcuts.enabled}
            expanded={shortcutsOpen}
            id="_x_extension_newtab_shortcuts_accordion_trigger_2026_unique_"
            label={shortcuts.title}
            onToggle={() => {
              if (shortcuts.enabled) setShortcutsExpanded(!shortcutsExpanded);
            }}
            title={shortcuts.title}
            titleRef="shortcutsTitle"
            triggerRef="shortcutsAccordionTrigger"
          />
          <Switch
            name="shortcutsToggle"
            onChange={(checked) => {
              if (checked) setShortcutsExpanded(true);
              actions.setShortcutsVisible(checked);
            }}
            toggle={shortcuts.toggle}
          />
        </div>
        <div
          {...ref('shortcutsDetails')}
          {...collapsible(shortcutsOpen)}
          aria-labelledby="_x_extension_newtab_shortcuts_accordion_trigger_2026_unique_"
          className="x-nt-shortcuts-accordion-details x-nt-panel-collapsible"
          id="_x_extension_newtab_shortcuts_settings_2026_unique_"
          role="region"
        >
          <div className="x-nt-shortcuts-accordion-details-inner">
            <div className="x-nt-appearance-setting-row">
              <span {...ref('shortcutAddTitle')} className="x-nt-appearance-setting-title">
                {shortcuts.add.title}
              </span>
              <Switch
                name="shortcutAddToggle"
                onChange={actions.setShortcutAddVisible}
                toggle={{ ...shortcuts.add.toggle, disabled: shortcutControlsDisabled }}
              />
            </div>
            <div className="x-nt-appearance-setting-row">
              <span {...ref('shortcutDockMagnificationTitle')} className="x-nt-appearance-setting-title">
                {shortcuts.dock.title}
              </span>
              <Switch
                name="shortcutDockMagnificationToggle"
                onChange={actions.setShortcutDockMagnification}
                toggle={{ ...shortcuts.dock.toggle, disabled: shortcutControlsDisabled }}
              />
            </div>
            <div
              {...ref('shortcutColumnsControl')}
              {...controlVisibility(shortcutsOpen)}
              className="x-nt-overlay-control x-nt-shortcut-columns-control"
            >
              <PanelSlider
                bubble={sliderBubble}
                className="x-nt-overlay-slider-wrap x-nt-shortcut-columns-slider-wrap"
                inputClass="x-nt-overlay-slider x-nt-shortcut-columns-slider"
                labelRef="shortcutColumnsLabel"
                marks={marks.shortcutColumns}
                name="shortcutColumnsSlider"
                onChange={actions.setShortcutColumns}
                slider={{ ...shortcuts.columns, disabled: shortcutControlsDisabled }}
              />
            </div>
            <div
              {...ref('shortcutSizeControl')}
              {...controlVisibility(shortcutsOpen)}
              className="x-nt-overlay-control x-nt-shortcut-size-control"
            >
              <PanelSlider
                bubble={sliderBubble}
                className="x-nt-overlay-slider-wrap x-nt-shortcut-size-slider-wrap"
                inputClass="x-nt-overlay-slider x-nt-shortcut-size-slider"
                labelRef="shortcutSizeLabel"
                marks={marks.shortcutSize}
                name="shortcutSizeSlider"
                onChange={actions.setShortcutSize}
                reset={{
                  label: shortcuts.size.resetLabel,
                  name: 'shortcutSizeResetButton',
                  onReset: actions.resetShortcutSize,
                  visible: shortcuts.size.resetVisible
                }}
                slider={{ ...shortcuts.size, disabled: shortcutControlsDisabled }}
              />
            </div>
            <div
              {...ref('shortcutGapControl')}
              {...controlVisibility(shortcutsOpen)}
              className="x-nt-overlay-control x-nt-shortcut-gap-control"
            >
              <PanelSlider
                bubble={sliderBubble}
                className="x-nt-overlay-slider-wrap x-nt-shortcut-gap-slider-wrap"
                inputClass="x-nt-overlay-slider x-nt-shortcut-gap-slider"
                labelRef="shortcutGapLabel"
                marks={marks.shortcutGap}
                name="shortcutGapSlider"
                onChange={actions.setShortcutGap}
                reset={{
                  label: shortcuts.gap.resetLabel,
                  name: 'shortcutGapResetButton',
                  onReset: actions.resetShortcutGap,
                  visible: shortcuts.gap.resetVisible
                }}
                slider={{ ...shortcuts.gap, disabled: shortcutControlsDisabled }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
