import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode
} from 'react';

export interface RangeSliderProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'className' | 'type'> {
  children?: ReactNode;
  className?: string;
  inputClass?: string;
}

export interface RangeSliderValueInputProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'max' | 'type'> {
  sliderMax: NonNullable<ComponentPropsWithoutRef<'input'>['max']>;
}

export type RangeSliderFieldValueInputProps = Omit<
  RangeSliderValueInputProps,
  'min' | 'sliderMax' | 'step'
>;

export interface RangeSliderResetButtonProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'type'> {
  iconClassName?: string;
}

export interface RangeSliderFieldProps
  extends Omit<RangeSliderProps, 'max'> {
  max: NonNullable<ComponentPropsWithoutRef<'input'>['max']>;
  resetButtonProps?: RangeSliderResetButtonProps;
  rowClassName?: string;
  valueInputProps: RangeSliderFieldValueInputProps;
}

const RANGE_SLIDER_VALUE_INPUT_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  flex: '0 0 auto',
  height: 36,
  width: 56
};

const RANGE_SLIDER_VALUE_INPUT_CLASS_NAMES = [
  '_x_extension_shortcut_input_2024_unique_',
  '_x_extension_range_slider_value_input_2026_unique_'
];

export function RangeSlider({
  children,
  className,
  inputClass,
  ...inputProps
}: RangeSliderProps) {
  return (
    <div className={className}>
      <input
        {...inputProps}
        className={inputClass}
        type="range"
      />
      {children}
    </div>
  );
}

export function RangeSliderValueInput({
  className,
  sliderMax,
  style,
  ...inputProps
}: RangeSliderValueInputProps) {
  return (
    <input
      {...inputProps}
      className={[
        ...RANGE_SLIDER_VALUE_INPUT_CLASS_NAMES,
        className
      ].filter(Boolean).join(' ')}
      max={sliderMax}
      style={{
        ...RANGE_SLIDER_VALUE_INPUT_STYLE,
        ...style
      }}
      type="number"
    />
  );
}

export function RangeSliderResetButton({
  className,
  iconClassName,
  ...buttonProps
}: RangeSliderResetButtonProps) {
  return (
    <button
      {...buttonProps}
      className={[
        '_x_extension_shortcut_group_action_2024_unique_',
        '_x_extension_range_slider_reset_button_2026_unique_',
        className
      ].filter(Boolean).join(' ')}
      type="button"
    >
      <i
        aria-hidden="true"
        className={[
          'ri-icon',
          'ri-size-14',
          'ri-reset-left-line',
          iconClassName
        ].filter(Boolean).join(' ')}
      />
    </button>
  );
}

export function RangeSliderField({
  children,
  max,
  min,
  resetButtonProps,
  rowClassName,
  step,
  valueInputProps,
  ...sliderProps
}: RangeSliderFieldProps) {
  const field = (
    <>
      <RangeSlider
        {...sliderProps}
        max={max}
        min={min}
        step={step}
      >
        {children}
      </RangeSlider>
      {resetButtonProps ? (
        <RangeSliderResetButton {...resetButtonProps} />
      ) : null}
      <RangeSliderValueInput
        {...valueInputProps}
        min={min}
        sliderMax={max}
        step={step}
      />
    </>
  );
  return rowClassName ? <div className={rowClassName}>{field}</div> : field;
}
