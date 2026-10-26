// A row's utility button (copy the link, remove from history), shown on
// hover in the row's theme when the row is selected or a brand's, and in a
// neutral color otherwise.
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { RemixIcon } from '../../remix-icon';
import type { RemixIconName } from '../../../ui/remix-icon';
import { setSurfaceStyle, surfaceClass } from './surface-options';
import type { NormalizedOptions, Suggestion, SuggestionElement } from './types';

function isTopSite(suggestion: Suggestion): boolean {
  return Boolean(suggestion.type === 'topSite' || suggestion.isTopSite);
}

function canDeleteHistory(suggestion: Suggestion): boolean {
  return Boolean(suggestion.url && (suggestion.type === 'history' || isTopSite(suggestion)));
}

// Whether the button takes the row's theme: the row is selected (or is the
// top row with nothing selected), or hovered with a brand theme.
function usesRowTheme(options: NormalizedOptions, item: SuggestionElement): boolean {
  const theme = item._xTheme || options.defaultTheme;
  const itemIndex = options.items.indexOf(item);
  const selectedIndex = options.getSelectedIndex();
  return !item._xSimpleMode && (
    itemIndex === selectedIndex ||
    (selectedIndex === -1 && Boolean(item._xIsAutocompleteTop)) ||
    (Boolean(item._xIsHovering) && Boolean(theme?._xIsBrand))
  );
}

function applyUtilityHover(options: NormalizedOptions, item: SuggestionElement, button: HTMLButtonElement): void {
  const theme = item._xTheme || options.defaultTheme;
  const useTheme = usesRowTheme(options, item);
  const hover = useTheme ? options.getHoverColors(theme) : options.getNeutralHoverActionColors();
  const color = useTheme ? options.getThemeForMode(theme).buttonText || '' : ('text' in hover ? hover.text || '' : '');
  button.style.removeProperty('transform');
  setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-bg', hover.bg || '');
  setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-border', hover.border || '');
  setSurfaceStyle(options, button, '--x-nt-suggestion-utility-hover-color', color);
  button.setAttribute('data-hover', 'true');
}

function releasePress(event: ReactPointerEvent<HTMLButtonElement>): void {
  event.currentTarget.style.setProperty('transform', 'none');
}

function SuggestionUtilityAction({
  options,
  itemRef,
  slotRef,
  buttonRef,
  leading = false,
  tooltip,
  iconName,
  onActivate
}: {
  options: NormalizedOptions;
  itemRef: RefObject<SuggestionElement | null>;
  slotRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  leading?: boolean;
  tooltip: string;
  iconName: RemixIconName;
  onActivate: () => void;
}) {
  const applyHover = (): void => {
    const item = itemRef.current;
    const button = buttonRef.current;
    if (!item || !button) {
      return;
    }
    options.showTopActionTooltip(button, tooltip);
    applyUtilityHover(options, item, button);
  };

  const reset = (): void => {
    options.hideTopActionTooltip();
    buttonRef.current?.removeAttribute('data-hover');
    buttonRef.current?.style.removeProperty('transform');
  };

  return (
    <div
      ref={slotRef}
      className={surfaceClass(options, 'x-nt-suggestion-utility-slot')}
      data-leading={leading ? 'true' : undefined}
      data-visible="false"
    >
      <button
        ref={buttonRef}
        type="button"
        className={surfaceClass(options, 'x-nt-suggestion-utility-button')}
        data-visible="false"
        aria-label={tooltip}
        onMouseEnter={applyHover}
        onMouseLeave={reset}
        onFocus={applyHover}
        onBlur={reset}
        onPointerUp={releasePress}
        onPointerCancel={releasePress}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          reset();
          onActivate();
        }}
      >
        <RemixIcon name={iconName} />
      </button>
    </div>
  );
}

export { SuggestionUtilityAction, canDeleteHistory, isTopSite };
