import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import type { SelectMenuControls } from '../shared/select-menu';
import { LinkButton } from '../shared/link-button';
import { ref } from './wallpaper-panel/panel-primitives';
import {
  SELECT_IDS,
  SELECT_HOST_REFS,
  type WallpaperPanelModel,
  type PanelSelectModel,
  type ExternalSelectKey,
  type WallpaperPanelState
} from './wallpaper-panel/panel-model';
import { useWallpaperPanel, type WallpaperPanelProps } from './wallpaper-panel/use-wallpaper-panel';
import { ThemeSection } from './wallpaper-panel/theme-section';
import { StyleSection } from './wallpaper-panel/style-section';
import { SearchSection } from './wallpaper-panel/search-section';
import { ShortcutsSection } from './wallpaper-panel/shortcuts-section';
import { BookmarkSettingsSection } from './wallpaper-panel/bookmark-settings-section';
import { RecentSettingsSection } from './wallpaper-panel/recent-settings-section';
import { QuoteSection } from './wallpaper-panel/quote-section';
import { WallpaperSection } from './wallpaper-panel/wallpaper-section';
import { FaviconSection } from './wallpaper-panel/favicon-section';
export { EFFECT_SLIDER_KEYS } from './wallpaper-panel/panel-model';
export type { WallpaperSourceTab, WallpaperMode, ThemeScope, TopContentMode, TimeInk, GlassTheme, EffectSliderKey, WallpaperPanelModel, TileState, OnlineTileState, SelectedSourceState, DailyState, PanelSelectModel, CuratedMixState, WallpaperPanelActions, WallpaperPanelState } from './wallpaper-panel/panel-model';

function WallpaperPanel(props: WallpaperPanelProps) {
  const panel = useWallpaperPanel(props);
  const {
    state,
    sliderBubble,
    actions,
    model,
    bubbleNode
  } = panel;
  return (
    <>
      <div
        {...ref('panel')}
        aria-label={state.panelLabel || undefined}
        aria-modal="false"
        className="x-nt-wallpaper-panel"
        data-open={state.open ? 'true' : 'false'}
        onScrollCapture={() => {
          sliderBubble.hide(null, true);
          actions.hideTooltip();
        }}
        role="dialog"
      >
        <div className="x-nt-appearance-header">
          <div {...ref('appearanceTitle')} className="x-nt-wallpaper-panel-title">
            {state.header.title}
          </div>
          <LinkButton
            {...ref('moreSettingsLink')}
            aria-label={state.header.moreSettingsLabel || undefined}
            className="x-nt-appearance-more-settings"
            href={state.header.moreSettingsUrl}
            labelProps={{
              ...ref('moreSettingsText'),
              className: 'x-nt-appearance-more-settings-text'
            }}
          >
            {state.header.moreSettingsLabel}
          </LinkButton>
        </div>
        <div className="x-nt-wallpaper-panel-scroll">
          <ThemeSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <StyleSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <SearchSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <ShortcutsSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <BookmarkSettingsSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <RecentSettingsSection panel={panel} />
          <div {...ref('quoteDivider')} className="x-nt-panel-divider" />
          <QuoteSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <WallpaperSection panel={panel} />
          <div className="x-nt-panel-divider" />
          <FaviconSection panel={panel} />
        </div>
        <p className="x-nt-appearance-help-footer">
          <span {...ref('helpFooterPrompt')} className="x-nt-appearance-help-footer-prompt">
            {state.header.helpPrompt}
          </span>
          <LinkButton
            {...ref('helpFooterLink')}
            className="x-nt-appearance-help-footer-link"
            external
            href={state.header.helpUrl}
            labelProps={ref('helpFooterText')}
          >
            {state.header.helpText}
          </LinkButton>
        </p>
      </div>
      <button
        {...ref('button')}
        aria-expanded={state.open ? 'true' : 'false'}
        aria-haspopup="dialog"
        aria-label={state.button.label || undefined}
        aria-pressed={state.button.active ? 'true' : 'false'}
        className="x-nt-wallpaper-button"
        data-active={state.button.active ? 'true' : 'false'}
        data-open={state.open ? 'true' : 'false'}
        dangerouslySetInnerHTML={{
          __html: String(model.icons?.wallpaper || '')
        }}
        onBlur={() => actions.hideTooltip()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          actions.hideTooltip();
          actions.togglePanel();
        }}
        onFocus={(event) => actions.showButtonTooltip(event.currentTarget)}
        onMouseEnter={(event) => actions.showButtonTooltip(event.currentTarget)}
        onMouseLeave={() => actions.hideTooltip()}
        type="button"
      />
      {bubbleNode}
    </>
  );
}

export interface WallpaperViewController {
  button: HTMLButtonElement;
  closeOpenSelect(options?: { restoreFocus?: boolean }): boolean;
  containsSelectMenuTarget(target: Node | null): boolean;
  control: HTMLDivElement;
  destroy(): void;
  /** Moves focus to a rendered element, by its data-wallpaper-ref name. */
  focus(name: string): void;
  /** Elements by data-wallpaper-ref, for the sections other runtimes fill in. */
  getRefs(): Record<string, HTMLElement>;
  panel: HTMLDivElement;
  /** Renders the panel from new state; the DOM is up to date when this returns. */
  render(state: WallpaperPanelState): void;
  renderBookmarkTopbarSurfaceSelect(select: PanelSelectModel): void;
  renderBookmarkViewModeSelect(select: PanelSelectModel): void;
  renderQuotePositionSelect(select: PanelSelectModel): void;
  renderQuoteFontSelect(select: PanelSelectModel): void;
}

export function createWallpaperViewController(
  config: { documentObj?: Document; model?: WallpaperPanelModel; state: WallpaperPanelState }
): WallpaperViewController {
  const documentObj: Document = config.documentObj || document;
  const model = config.model || {};
  let state = config.state;
  const externalSelects: Partial<Record<ExternalSelectKey, PanelSelectModel>> = {};
  const selectControls = new Map<string, SelectMenuControls>();
  const registerSelect = (id: string, controls: SelectMenuControls) => {
    selectControls.set(id, controls);
  };
  const control = documentObj.createElement('div');
  control.className = 'x-nt-wallpaper-control';
  control.dataset.reactIsland = 'newtab-wallpaper';
  const root: Root = createRoot(control);
  let destroyed = false;
  const renderRoot = () => {
    control.dataset.panelOpen = state.open ? 'true' : 'false';
    flushSync(() => root.render(
      <WallpaperPanel
        documentObj={documentObj}
        externalSelects={{ ...externalSelects }}
        model={model}
        registerSelect={registerSelect}
        state={state}
      />
    ));
  };
  renderRoot();
  const panel = control.querySelector<HTMLDivElement>('[data-wallpaper-ref="panel"]');
  const button = control.querySelector<HTMLButtonElement>('[data-wallpaper-ref="button"]');
  if (!panel || !button) {
    flushSync(() => root.unmount());
    throw new Error('Lumno React wallpaper view did not mount.');
  }
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
  const renderExternalSelect = (key: ExternalSelectKey, select: PanelSelectModel) => {
    if (destroyed) return;
    externalSelects[key] = select;
    renderRoot();
  };
  const controller: WallpaperViewController = {
    button,
    control,
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flushSync(() => root.unmount());
    },
    focus(name: string) {
      const element = control.querySelector<HTMLElement>(`[data-wallpaper-ref="${name}"]`);
      element?.focus();
    },
    getRefs,
    panel,
    render(nextState: WallpaperPanelState) {
      if (destroyed) return;
      state = nextState;
      renderRoot();
    },
    closeOpenSelect(options?: { restoreFocus?: boolean }) {
      const openId = SELECT_IDS.find((id) => selectControls.get(id)?.isOpen());
      if (!openId) {
        return false;
      }
      flushSync(() => selectControls.get(openId)?.setOpen(false));
      if (options?.restoreFocus) {
        control.querySelector<HTMLElement>(`[data-wallpaper-ref="${SELECT_HOST_REFS[openId]}"] button`)?.focus();
      }
      return true;
    },
    // The menus are portaled to the body but still belong to the panel.
    containsSelectMenuTarget(target: Node | null) {
      return Boolean(target && SELECT_IDS.some((id) => documentObj
        .querySelector(`[data-react-select-owner="${id}"]`)?.contains(target)));
    },
    renderQuotePositionSelect(select: PanelSelectModel) {
      renderExternalSelect('quotePosition', select);
    },
    renderQuoteFontSelect(select: PanelSelectModel) {
      renderExternalSelect('quoteFont', select);
    },
    renderBookmarkViewModeSelect(select: PanelSelectModel) {
      renderExternalSelect('bookmarkViewMode', select);
    },
    renderBookmarkTopbarSurfaceSelect(select: PanelSelectModel) {
      renderExternalSelect('bookmarkTopbarSurface', select);
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
