import {
  createReactRootController,
  type ReactRootController
} from '../shared/root-controller';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemePickerOptionModel {
  label: string;
  labelKey: string;
  mode: ThemeMode;
  previewSrc: string;
}

export interface ThemePickerRenderModel {
  activeMode: ThemeMode;
  options: ThemePickerOptionModel[];
}

export interface ThemePickerControllerOptions {
  onSelect(mode: ThemeMode, button: HTMLButtonElement): void;
}

export type ThemePickerController =
  ReactRootController<ThemePickerRenderModel>;

function ThemePicker({
  model,
  onSelect
}: {
  model: ThemePickerRenderModel;
  onSelect: ThemePickerControllerOptions['onSelect'];
}) {
  return (
    <>
      {model.options.map((option) => {
        const active = option.mode === model.activeMode;
        return (
          <button
            aria-pressed={active}
            className="_x_extension_theme_option_2024_unique_"
            data-active={active ? 'true' : 'false'}
            data-mode={option.mode}
            key={option.mode}
            onClick={(event) => onSelect(option.mode, event.currentTarget)}
            type="button"
          >
            <span
              className="_x_extension_theme_preview_2026_unique_"
              data-preview-mode={option.mode}
            >
              <img
                alt=""
                aria-hidden="true"
                className="_x_extension_theme_preview_img_2026_unique_"
                height="80"
                src={option.previewSrc}
                width="120"
              />
              <span
                aria-hidden="true"
                className="_x_extension_theme_check_2026_unique_"
              >
                <i aria-hidden="true" className="ri-icon ri-check-line" />
              </span>
            </span>
            <span
              className="_x_extension_theme_label_2026_unique_"
              data-i18n={option.labelKey}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function createThemePickerController(
  host: HTMLElement | null,
  options: ThemePickerControllerOptions
): ThemePickerController {
  if (host) {
    host.dataset.reactIsland = 'options-theme-picker';
  }
  return createReactRootController(
    host,
    (model: ThemePickerRenderModel) => (
      <ThemePicker model={model} onSelect={options.onSelect} />
    )
  );
}

export function createThemePickerApi() {
  return Object.freeze({
    implementation: 'react',
    createThemePickerController
  });
}
