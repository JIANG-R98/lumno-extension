import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from 'react';

export interface OnboardingAction {
  actionId: string;
  browserOnly?: string;
  label: string;
  icon?: string;
  tooltip?: string;
  tooltipMaxWidth?: number;
}

export interface ActionButtonsModel {
  primary?: OnboardingAction | null;
  secondary?: OnboardingAction | null;
  ghost?: OnboardingAction | null;
}

export interface ActionButtonsHandlers {
  onAction(actionId: string, event: MouseEvent): void;
  onShowTooltip(button: HTMLButtonElement): void;
  onHideTooltip(): void;
}

interface ActionButtonProps {
  action: OnboardingAction;
  kind: 'primary' | 'secondary' | 'ghost';
  options: ActionButtonsHandlers;
}

function ActionButton({
  action,
  kind,
  options
}: ActionButtonProps) {
  const iconClass = String(action.icon || '').trim();
  const tooltip = String(action.tooltip || '').trim();
  const tooltipMaxWidth = Number(action.tooltipMaxWidth);
  const handleAction = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    options.onHideTooltip();
    options.onAction(String(action.actionId || ''), event.nativeEvent);
  };
  const handleShowTooltip = (
    event: ReactMouseEvent<HTMLButtonElement> |
      ReactFocusEvent<HTMLButtonElement>
  ): void => {
    if (tooltip) {
      options.onShowTooltip(event.currentTarget);
    }
  };
  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void => {
    if (event.key === 'Escape') {
      options.onHideTooltip();
      event.currentTarget.blur();
    }
  };

  return (
    <button
      aria-label={String(action.label || '')}
      className={`onboarding-action-button onboarding-action-button--${kind}`}
      data-action={String(action.actionId || '')}
      data-browser-only={action.browserOnly || undefined}
      data-tooltip={tooltip || undefined}
      data-tooltip-max-width={
        Number.isFinite(tooltipMaxWidth) && tooltipMaxWidth > 0
          ? String(tooltipMaxWidth)
          : undefined
      }
      onBlur={options.onHideTooltip}
      onClick={handleAction}
      onFocus={handleShowTooltip}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleShowTooltip}
      onMouseLeave={options.onHideTooltip}
      type="button"
    >
      <span>{String(action.label || '')}</span>
      {iconClass ? (
        <i
          aria-hidden="true"
          className={`ri-icon ri-size-14 ${iconClass}`}
        />
      ) : null}
    </button>
  );
}

// The slide's buttons: next, back, and one more action.
export function ActionButtons({ actions, handlers }: { actions: ActionButtonsModel; handlers: ActionButtonsHandlers }) {
  const primary = actions.primary || null;
  const secondary = actions.secondary || null;
  const ghost = actions.ghost || null;
  const visible = Boolean(primary || secondary || ghost);
  return (
    <div aria-label="Onboarding actions" className="onboarding-copy-actions" data-visible={visible ? 'true' : 'false'} hidden={!visible}>
      {primary ? <ActionButton action={primary} kind="primary" options={handlers} /> : null}
      {secondary ? <ActionButton action={secondary} kind="secondary" options={handlers} /> : null}
      {ghost ? <ActionButton action={ghost} kind="ghost" options={handlers} /> : null}
    </div>
  );
}
