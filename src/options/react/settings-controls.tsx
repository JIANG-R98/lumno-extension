import {
  createReactRootController,
  type ReactRootController
} from './root-controller';
import { RangeSliderControl, type RangeSliderControlRenderModel } from './range-slider-control';
import {
  RequiredCheckboxGroup,
  type RequiredCheckboxGroupRenderModel,
  type RequiredCheckboxItemModel
} from './required-checkbox-group';
import { ToggleControl, type ToggleControlRenderModel } from './toggle-control';
import { createSettingToggleRowsController } from './setting-rows';
import { createSettingsSectionController } from './settings-rows-view';
import { createGeneralShortcutsSectionController } from './general-shortcuts-section';

export type { RangeSliderControlRenderModel, RequiredCheckboxGroupRenderModel, RequiredCheckboxItemModel, ToggleControlRenderModel };

export interface ToggleControlControllerOptions {
  kind: string;
  onChange(checked: boolean): void;
}

export type ToggleControlController =
  ReactRootController<ToggleControlRenderModel>;

export interface RangeSliderControlControllerOptions {
  kind: string;
  onInput(value: number): void;
}

export type RangeSliderControlController =
  ReactRootController<RangeSliderControlRenderModel>;

export interface RequiredCheckboxGroupControllerOptions {
  kind: string;
  onChange(values: string[]): void;
  onMove?(fromIndex: number, toIndex: number): void;
}

export type RequiredCheckboxGroupController =
  ReactRootController<RequiredCheckboxGroupRenderModel>;

export function createToggleControlController(
  host: HTMLElement | null,
  options: ToggleControlControllerOptions
): ToggleControlController {
  if (host) {
    host.dataset.reactIsland = 'options-toggle-control';
    host.dataset.toggleKind = options.kind;
  }
  return createReactRootController(
    host,
    (model: ToggleControlRenderModel) => (
      <ToggleControl model={model} onChange={options.onChange} />
    )
  );
}

export function createRequiredCheckboxGroupController(
  host: HTMLElement | null,
  options: RequiredCheckboxGroupControllerOptions
): RequiredCheckboxGroupController {
  if (host) {
    host.dataset.reactIsland = 'options-required-checkbox-group';
    host.dataset.checkboxGroupKind = options.kind;
  }
  return createReactRootController(
    host,
    (model: RequiredCheckboxGroupRenderModel) => (
      <RequiredCheckboxGroup
        model={model}
        onChange={options.onChange}
        onMove={options.onMove}
      />
    )
  );
}

export function createRangeSliderControlController(
  host: HTMLElement | null,
  options: RangeSliderControlControllerOptions
): RangeSliderControlController {
  if (host) {
    host.dataset.reactIsland = 'options-range-slider-control';
    host.dataset.rangeSliderKind = options.kind;
  }
  return createReactRootController(
    host,
    (model: RangeSliderControlRenderModel) => (
      <RangeSliderControl model={model} onInput={options.onInput} />
    )
  );
}

export function createSettingsControlsApi() {
  return Object.freeze({
    implementation: 'react',
    createGeneralShortcutsSectionController,
    createRangeSliderControlController,
    createRequiredCheckboxGroupController,
    createSettingToggleRowsController,
    createSettingsSectionController,
    createToggleControlController
  });
}
