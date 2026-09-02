import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';

export interface InfoButtonRenderModel {
  className?: string;
  label?: string;
  tooltip: string;
  tooltipKey?: string;
}

export type InfoButtonController = ReactRootController<InfoButtonRenderModel>;

export function InfoButton({
  className = '',
  label,
  tooltip,
  tooltipKey
}: InfoButtonRenderModel) {
  const classes = [
    '_x_extension_info_button_2026_unique_',
    '_x_extension_tooltip_host_2026_unique_',
    className
  ].filter(Boolean).join(' ');

  return (
    <span
      aria-label={label || tooltip}
      className={classes}
      data-i18n-tooltip={tooltipKey || undefined}
      data-tooltip={tooltip}
      role="img"
      tabIndex={0}
    >
      <i
        aria-hidden="true"
        className="ri-icon ri-size-14 ri-information-line"
      />
    </span>
  );
}

export function createInfoButtonController(
  host: HTMLElement | null
): InfoButtonController {
  if (host) {
    host.dataset.reactIsland = 'options-info-button';
  }
  return createReactRootController(
    host,
    (model: InfoButtonRenderModel) => <InfoButton {...model} />
  );
}

export function createInfoButtonApi() {
  return Object.freeze({
    implementation: 'react',
    createInfoButtonController
  });
}
