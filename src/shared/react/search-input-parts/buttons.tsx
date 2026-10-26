// The field's own buttons: the search icon (a scope action when the surface
// makes it one), the settings icon at its end, and the clear button.
import { useLayoutEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { RemixIcon } from '../remix-icon';
import type { RemixIconSpec } from '../../ui/remix-icon';
import { CLASSES, noTranslateProps, useButtonTooltip, useHoverActive } from './chrome';
import type { SearchInputTooltip } from './chrome';

// The search icon at the field's start as a button that opens the scope
// panel.
interface SearchScopeAction {
  enabled: boolean;
  label: string;
  onActivate(): void;
}

interface ClearActionConfig {
  ariaLabel?: string;
  icon?: RemixIconSpec;
  id: string;
  styleOverrides?: Record<string, string>;
}

const CLEAR_ICON: RemixIconSpec = { name: 'ri-close-line', size: 16 };

function RightIcon({ id, label, tooltip }: {
  id: string;
  label: string;
  tooltip: SearchInputTooltip | null;
}) {
  const hover = useHoverActive();
  const ref = useButtonTooltip<HTMLButtonElement>(tooltip, label);
  return (
    <button
      {...noTranslateProps()}
      {...hover.handlers}
      aria-label={label}
      className={CLASSES.rightIcon}
      data-hover-active={hover.active ? 'true' : 'false'}
      data-tooltip={label}
      id={id}
      onClick={(event) => {
        hover.handlers.onMouseLeave();
        if (tooltip) {
          tooltip.hide();
        }
        event.currentTarget.blur();
      }}
      ref={ref}
      type="button"
    >
      <RemixIcon className="_x_extension_svg_2024_unique_" name="ri-settings-line" size={16} />
    </button>
  );
}

// Shown only while the field has text; clearing keeps focus, and the
// caret, in the field.
function ClearAction({ action, label, visible, inputRef, tooltip }: {
  action: ClearActionConfig;
  label: string;
  visible: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  tooltip: SearchInputTooltip | null;
}) {
  const hover = useHoverActive();
  const ref = useButtonTooltip<HTMLButtonElement>(tooltip, label);
  return (
    <button
      {...noTranslateProps()}
      {...hover.handlers}
      aria-label={label}
      className={CLASSES.clearAction}
      data-hover-active={hover.active && visible ? 'true' : undefined}
      data-tooltip={label}
      hidden={!visible}
      id={action.id}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (tooltip) {
          tooltip.hide();
        }
        const input = inputRef.current;
        if (!input) {
          return;
        }
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
      }}
      onMouseDown={(event) => event.preventDefault()}
      ref={ref}
      type="button"
    >
      <RemixIcon {...(action.icon || CLEAR_ICON)} />
    </button>
  );
}

type ScopeEvent = ReactMouseEvent<HTMLDivElement> | ReactKeyboardEvent<HTMLDivElement>;

// The attributes and listeners that make the icon a scope action button;
// none while it is a plain icon.
function readScopeButtonProps(action: SearchScopeAction | null, hover: boolean, setHover: (hover: boolean) => void,
  activate: (event: ScopeEvent) => void) {
  if (!action) {
    return {};
  }
  const enabled = action.enabled;
  const end = () => setHover(false);
  const start = () => setHover(true);
  return {
    'aria-disabled': enabled ? 'false' : 'true',
    'aria-label': action.label,
    'data-hover-active': hover && enabled ? 'true' : 'false',
    'data-search-scope-action': 'true',
    'data-tooltip': enabled ? action.label : undefined,
    onBlur: end,
    onClick: activate,
    onFocus: start,
    onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        activate(event);
      }
    },
    onMouseEnter: start,
    onMouseLeave: end,
    onPointerCancel: end,
    onPointerUp: end,
    role: 'button',
    tabIndex: enabled ? 0 : -1
  } as const;
}

// A disabled action gives its focus up.
function useBlurWhenDisabled(enabled: boolean, iconRef: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const icon = iconRef.current;
    if (!enabled && icon) {
      const root = icon.getRootNode();
      const focused = 'activeElement' in root ? root.activeElement : null;
      if (focused === icon) {
        icon.blur();
      }
    }
  }, [enabled, iconRef]);
}

// The search icon; while the surface makes it a scope action, a button
// that opens the scope panel. It stays one element either way, since the
// input mode controller holds it.
function ScopeIcon({ id, action, tooltip }: {
  id: string;
  action: SearchScopeAction | null;
  tooltip: SearchInputTooltip | null;
}) {
  const [hover, setHover] = useState(false);
  const enabled = Boolean(action && action.enabled);
  // A disabled action has nothing to say.
  const iconRef = useButtonTooltip<HTMLDivElement>(action ? tooltip : null, enabled && action ? action.label : '');
  useBlurWhenDisabled(enabled, iconRef);
  const activate = (event: ScopeEvent): void => {
    if (!action || !action.enabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setHover(false);
    tooltip?.hide();
    action.onActivate();
    event.currentTarget.blur();
  };
  return (
    <div
      {...noTranslateProps()}
      {...readScopeButtonProps(action, hover, setHover, activate)}
      className={CLASSES.icon}
      id={id}
      ref={iconRef}
    >
      <RemixIcon className="_x_extension_svg_2024_unique_" name="ri-search-line" size={16} />
    </div>
  );
}

export type { ClearActionConfig, SearchScopeAction };
export { ClearAction, RightIcon, ScopeIcon };
