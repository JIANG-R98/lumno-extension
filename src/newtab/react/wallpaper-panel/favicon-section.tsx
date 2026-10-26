// The New Tab favicon section.
import { SectionTrigger } from './panel-controls';
import { ref } from './panel-primitives';
import { collapsible } from './panel-model';
import { FaviconTile } from './wallpaper-tiles';
import type { WallpaperPanelContext } from './use-wallpaper-panel';

export function FaviconSection({ panel }: { panel: WallpaperPanelContext }) {
  const {
    faviconExpanded,
    setFaviconExpanded,
    state,
    model,
    actions
  } = panel;
  return (
    <div className="x-nt-wallpaper-section">
      <div className="x-nt-favicon-group">
        <div className="x-nt-wallpaper-panel-header">
          <SectionTrigger
            bodyId="_x_extension_newtab_favicon_section_body_2026_unique_"
            expanded={faviconExpanded}
            onToggle={() => setFaviconExpanded(!faviconExpanded)}
            title={state.favicon.title}
            titleClassName="x-nt-favicon-title"
            titleRef="faviconTitle"
            triggerRef="faviconSectionTrigger"
          />
        </div>
        <div
          {...ref('faviconSectionBody')}
          {...collapsible(faviconExpanded)}
          className="x-nt-panel-section-body x-nt-panel-collapsible"
          id="_x_extension_newtab_favicon_section_body_2026_unique_"
        >
          <div
            {...ref('faviconOptions')}
            aria-label={state.favicon.title || undefined}
            className="x-nt-favicon-options"
            role="group"
          >
            {(model.favicons || []).map((item) => {
              const option = state.favicon.options.find((entry) => entry.id === item.id);
              return (
                <FaviconTile
                  item={item}
                  key={item.id}
                  label={option?.label || ''}
                  onSelect={() => actions.selectFavicon(item.id)}
                  selected={Boolean(option?.selected)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
