import {
  type CSSProperties,
  useEffect,
  useRef,
  useState
} from 'react';
import {
  createReactRootController,
  type ReactRootController
} from './root-controller';
import {
  RangeSlider
} from '../shared/range-slider';

export interface ToggleControlRenderModel {
  ariaLabel?: string;
  ariaLabelKey?: string;
  checked: boolean;
  disabled?: boolean;
  id: string;
}

export interface ToggleControlControllerOptions {
  kind: string;
  onChange(checked: boolean): void;
}

export type ToggleControlController =
  ReactRootController<ToggleControlRenderModel>;

export interface RangeSliderControlRenderModel {
  ariaLabel: string;
  disabled?: boolean;
  id: string;
  max: number;
  min: number;
  step: number;
  ticks: Array<{
    align?: 'start' | 'center' | 'end';
    label: string;
  }>;
  value: number;
  valueSuffix?: string;
}

export interface RangeSliderControlControllerOptions {
  kind: string;
  onInput(value: number): void;
}

export type RangeSliderControlController =
  ReactRootController<RangeSliderControlRenderModel>;

export interface RequiredCheckboxItemModel {
  checked: boolean;
  id: string;
  label: string;
  labelKey: string;
  value: string;
}

export interface RequiredCheckboxGroupRenderModel {
  items: RequiredCheckboxItemModel[];
}

export interface RequiredCheckboxGroupControllerOptions {
  kind: string;
  onChange(values: string[]): void;
}

export type RequiredCheckboxGroupController =
  ReactRootController<RequiredCheckboxGroupRenderModel>;

function ToggleControl({
  model,
  onChange
}: {
  model: ToggleControlRenderModel;
  onChange(checked: boolean): void;
}) {
  const [checked, setChecked] = useState(model.checked);

  useEffect(() => {
    setChecked(model.checked);
  }, [model.checked]);

  const ariaProps = model.ariaLabelKey
    ? { 'data-i18n-aria-label': model.ariaLabelKey }
    : {};

  return (
    <>
      <input
        {...ariaProps}
        aria-label={model.ariaLabel}
        checked={checked}
        disabled={model.disabled}
        id={model.id}
        onChange={(event) => {
          const next = event.currentTarget.checked;
          setChecked(next);
          onChange(next);
        }}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="_x_extension_switch_slider_2024_unique_"
      />
    </>
  );
}

function RequiredCheckboxGroup({
  model,
  onChange
}: {
  model: RequiredCheckboxGroupRenderModel;
  onChange(values: string[]): void;
}) {
  const serializedValues = model.items
    .filter((item) => item.checked)
    .map((item) => item.value)
    .join('\u0000');
  const [selected, setSelected] = useState(
    () => new Set(serializedValues ? serializedValues.split('\u0000') : [])
  );

  useEffect(() => {
    setSelected(new Set(serializedValues ? serializedValues.split('\u0000') : []));
  }, [serializedValues]);

  return (
    <>
      {model.items.map((item) => (
        <label className="_x_extension_checkbox_2026_unique_" key={item.value}>
          <input
            checked={selected.has(item.value)}
            data-search-result-source-type={item.value}
            id={item.id}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.currentTarget.checked) {
                next.add(item.value);
              } else {
                next.delete(item.value);
              }
              if (next.size === 0) {
                return;
              }
              setSelected(next);
              onChange(model.items
                .map((entry) => entry.value)
                .filter((value) => next.has(value)));
            }}
            type="checkbox"
          />
          <span data-i18n={item.labelKey}>{item.label}</span>
        </label>
      ))}
    </>
  );
}

function RangeSliderControl({
  model,
  onInput
}: {
  model: RangeSliderControlRenderModel;
  onInput(value: number): void;
}) {
  const [value, setValue] = useState(model.value);
  const valueRef = useRef(model.value);

  useEffect(() => {
    valueRef.current = model.value;
    setValue(model.value);
  }, [model.value]);

  const handleValueChange = (next: number) => {
    if (next === valueRef.current) {
      return;
    }
    valueRef.current = next;
    setValue(next);
    onInput(next);
  };
  const valueText = `${value}${model.valueSuffix || ''}`;
  return (
    <div className="_x_extension_range_slider_control_2026_unique_">
      <RangeSlider
        aria-label={model.ariaLabel}
        aria-valuetext={valueText}
        className="x-lumno-range-slider"
        disabled={model.disabled}
        id={model.id}
        inputClass="x-lumno-range-slider-input"
        max={model.max}
        min={model.min}
        onChange={(event) => {
          handleValueChange(Number(event.currentTarget.value));
        }}
        onInput={(event) => {
          handleValueChange(Number(event.currentTarget.value));
        }}
        step={model.step}
        style={{
          '--x-lumno-range-slider-percent': `${
            ((value - model.min) / (model.max - model.min)) * 100
          }%`
        } as CSSProperties}
        value={value}
      >
        <div
          aria-hidden="true"
          className="x-lumno-range-slider-scale"
          style={{
            '--x-lumno-range-slider-tick-count': String(model.ticks.length)
          } as CSSProperties}
        >
          {model.ticks.map((tick) => (
            <span
              className="x-lumno-range-slider-tick"
              data-align={tick.align || 'center'}
              key={`${tick.align || 'center'}-${tick.label}`}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </RangeSlider>
      <output
        aria-hidden="true"
        className="_x_extension_range_slider_value_2026_unique_"
        htmlFor={model.id}
      >
        {valueText}
      </output>
    </div>
  );
}

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
      <RequiredCheckboxGroup model={model} onChange={options.onChange} />
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
    createRangeSliderControlController,
    createRequiredCheckboxGroupController,
    createToggleControlController
  });
}
