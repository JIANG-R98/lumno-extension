import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';

export interface SettingsNavigationItemModel {
  iconClass: string;
  key: string;
  label: string;
  labelKey: string;
}

export interface SettingsNavigationRenderModel {
  activeKey: string;
  items: SettingsNavigationItemModel[];
}

export interface SettingsNavigationControllerOptions {
  onSelect(key: string): void;
}

export type SettingsNavigationController =
  ReactRootController<SettingsNavigationRenderModel>;

function SettingsNavigation({
  model,
  onSelect
}: {
  model: SettingsNavigationRenderModel;
  onSelect(key: string): void;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className="_x_extension_tabs_indicator_2024_unique_"
      />
      {model.items.map((item) => {
        const active = item.key === model.activeKey;
        return (
          <button
            aria-current={active ? 'page' : undefined}
            aria-pressed={active}
            className="_x_extension_settings_tab_button_2024_unique_"
            data-active={active ? 'true' : 'false'}
            data-tab={item.key}
            key={item.key}
            onClick={() => onSelect(item.key)}
            type="button"
          >
            <i
              aria-hidden="true"
              className={`_x_extension_tab_icon_2024_unique_ ${item.iconClass}`}
            />
            <span data-i18n={item.labelKey}>{item.label}</span>
          </button>
        );
      })}
    </>
  );
}

export function createSettingsNavigationController(
  host: HTMLElement | null,
  options: SettingsNavigationControllerOptions
): SettingsNavigationController {
  if (host) {
    host.dataset.reactIsland = 'options-settings-navigation';
  }
  return createReactRootController(
    host,
    (model: SettingsNavigationRenderModel) => (
      <SettingsNavigation model={model} onSelect={options.onSelect} />
    )
  );
}

export function createSettingsNavigationApi() {
  return Object.freeze({
    implementation: 'react',
    createSettingsNavigationController
  });
}
