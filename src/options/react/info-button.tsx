import { useId } from 'react';
import { RemixIcon } from '../../shared/react/remix-icon';
import type { RemixIconName } from '../../shared/ui/remix-icon';

export interface InfoButtonRenderModel {
  className?: string;
  iconName?: RemixIconName;
  label?: string;
  tooltip: string;
  tooltipKey?: string;
}

export function InfoButton({
  className = '',
  iconName = 'ri-information-line',
  label,
  tooltip,
  tooltipKey
}: InfoButtonRenderModel) {
  const descriptionId = useId();
  const classes = [
    '_x_extension_info_button_2026_unique_',
    '_x_extension_tooltip_host_2026_unique_',
    className
  ].filter(Boolean).join(' ');
  // The floating tooltip is drawn from data-tooltip; screen readers get the
  // same text as the name, or as a description when a separate label names it.
  const describesTooltip = Boolean(label) && label !== tooltip;

  return (
    <button
      aria-describedby={describesTooltip ? descriptionId : undefined}
      aria-label={label || tooltip}
      className={classes}
      data-i18n-tooltip={tooltipKey || undefined}
      data-tooltip={tooltip}
      type="button"
    >
      <RemixIcon name={iconName} />
      {describesTooltip ? <span hidden id={descriptionId}>{tooltip}</span> : null}
    </button>
  );
}
