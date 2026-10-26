// The theme section: light, dark or system, for New Tab or everywhere.
import { SectionTrigger, InfoButton } from './panel-controls';
import { SegmentedChoice, ref } from './panel-primitives';
import { collapsible } from './panel-model';
import type { WallpaperPanelContext } from './use-wallpaper-panel';
import { RemixIcon } from '../../../shared/react/remix-icon';

export function ThemeSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    themeExpanded,
    setThemeExpanded,
    state,
    actions,
    model,
  } = panel;
  return (
    <div className="x-nt-appearance-section">
      <div className="x-nt-wallpaper-panel-header">
        <div className="x-nt-appearance-title-group">
          <SectionTrigger
            bodyId="_x_extension_newtab_theme_section_body_2026_unique_"
            expanded={themeExpanded}
            onToggle={() => setThemeExpanded(!themeExpanded)}
            title={state.theme.title}
            titleRef="themeSectionTitle"
            triggerRef="themeSectionTrigger"
          />
          <InfoButton
            actions={actions}
            label={state.theme.infoLabel}
            name="appearanceInfoButton"
            tooltip={state.theme.infoTooltip}
          />
        </div>
        <SegmentedChoice
          buttonClassName="x-nt-segmented-tab x-nt-wallpaper-tab x-nt-appearance-scope-tab"
          className="x-nt-wallpaper-tabs x-nt-appearance-scope-tabs"
          indicatorClassName="x-nt-wallpaper-tabs-indicator"
          indicatorRef="appearanceScopeTabsIndicator"
          name="appearanceScopeTabs"
          onSelect={actions.selectThemeScope}
          role="group"
          segment={state.theme.scope}
          valueAttribute="data-theme-scope"
          visible={state.open}
        />
      </div>
      <div
        {...ref('themeSectionBody')}
        {...collapsible(themeExpanded)}
        className="x-nt-panel-section-body x-nt-panel-collapsible"
        id="_x_extension_newtab_theme_section_body_2026_unique_"
      >
        <div {...ref('appearanceOptions')} className="x-nt-appearance-options">
          {(model.appearanceOptions || []).map((item) => {
            const option = state.theme.modes.find((mode) => mode.mode === item.mode);
            return (
              <button
                aria-label={option?.ariaLabel || undefined}
                aria-pressed={option?.selected ? 'true' : 'false'}
                className="x-nt-appearance-option"
                data-selected={option?.selected ? 'true' : 'false'}
                data-theme-mode={item.mode}
                key={item.mode}
                onClick={() => actions.selectThemeMode(item.mode)}
                type="button"
              >
                <span className="x-nt-appearance-option-content">
                  <span className="x-nt-appearance-preview">
                    <img alt="" draggable={false} src={option?.imageUrl} />
                    {option?.badgeUrl ? (
                      <img
                        alt=""
                        className="x-nt-appearance-badge"
                        draggable={false}
                        src={option.badgeUrl}
                      />
                    ) : null}
                    <span
                      className="x-nt-appearance-check"
                    >
                      <RemixIcon name="ri-check-line" size={16} />
                    </span>
                  </span>
                  <span className="x-nt-appearance-label">{option?.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
