import { useRef } from 'react';
import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ReactNode,
  Ref
} from 'react';

export interface RangeSliderProps
  extends Omit<ComponentPropsWithoutRef<'input'>, 'className' | 'type'> {
  children?: ReactNode;
  className?: string;
  inputClass?: string;
  /** Reference points (0-100) drawn as notches in the track; the ends are implied. */
  marks?: number[];
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
  ref?: Ref<HTMLButtonElement>;
}

export interface RangeSliderFieldProps
  extends Omit<RangeSliderProps, 'max'> {
  /** Renders the field as one row: label on the left, slider and value on the right. */
  label?: ReactNode;
  max: NonNullable<ComponentPropsWithoutRef<'input'>['max']>;
  resetButtonProps?: RangeSliderResetButtonProps;
  rowClassName?: string;
  valueInputProps: RangeSliderFieldValueInputProps;
}

// Pages size the value box through these custom properties.
const RANGE_SLIDER_VALUE_INPUT_STYLE: CSSProperties = {
  boxSizing: 'border-box',
  flex: '0 0 auto',
  height: 'var(--x-range-slider-value-height, 30px)',
  width: 'var(--x-range-slider-value-width, 52px)'
};

const joinClassNames = (...names: Array<string | false | null | undefined>) =>
  names.filter(Boolean).join(' ');

// Each mark is a 2px notch, placed where the thumb centre sits for that value.
export function getRangeSliderMarksBackground(marks: number[] | undefined) {
  const layers = (marks || [])
    .filter((mark) => Number.isFinite(mark) && mark > 0 && mark < 100)
    .map((mark) => {
      const center = `(var(--x-range-slider-thumb-size) / 2 + (100% - var(--x-range-slider-thumb-size)) * ${
        Math.round(mark * 100) / 10000
      })`;
      return `linear-gradient(90deg, transparent calc(${center} - 1px), var(--x-range-slider-mark-color) 0 calc(${center} + 1px), transparent 0)`;
    });
  return layers.length ? layers.join(', ') : undefined;
}

const RANGE_SLIDER_VALUE_INPUT_CLASS_NAMES = [
  '_x_extension_shortcut_input_2024_unique_',
  '_x_extension_range_slider_value_input_2026_unique_'
];

export function RangeSlider({
  children,
  className,
  inputClass,
  marks,
  style,
  ...inputProps
}: RangeSliderProps) {
  const marksBackground = getRangeSliderMarksBackground(marks);
  return (
    <div className={joinClassNames('x-range-slider', className)}>
      <input
        {...inputProps}
        className={joinClassNames('x-range-slider-input', inputClass)}
        style={marksBackground
          ? ({ ...style, '--x-range-slider-marks': marksBackground } as CSSProperties)
          : style}
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

/**
 * Reset is an affordance for a changed value, not a permanent control: callers keep
 * it `disabled` at the default, and the stylesheet hides it in that state. It never
 * takes space from the track: it trails the label in a labelled field, and otherwise
 * hangs in the gutter left of the track. A double-click on the slider triggers it too.
 */
export function RangeSliderField({
  children,
  label,
  max,
  min,
  onDoubleClick,
  resetButtonProps,
  rowClassName,
  step,
  valueInputProps,
  ...sliderProps
}: RangeSliderFieldProps) {
  const resetRef = useRef<HTMLButtonElement>(null);
  const resetButton = resetButtonProps ? (
    <RangeSliderResetButton
      {...resetButtonProps}
      className={joinClassNames('x-range-slider-reset', resetButtonProps.className)}
      ref={resetRef}
    />
  ) : null;
  const slider = (
    <RangeSlider
      {...sliderProps}
      max={max}
      min={min}
      onDoubleClick={(event) => {
        onDoubleClick?.(event);
        const reset = resetRef.current;
        if (!event.defaultPrevented && reset && !reset.disabled) {
          reset.click();
        }
      }}
      step={step}
    >
      {children}
      {label === undefined ? resetButton : null}
    </RangeSlider>
  );
  const valueInput = (
    <RangeSliderValueInput
      {...valueInputProps}
      min={min}
      sliderMax={max}
      step={step}
    />
  );
  if (label !== undefined) {
    return (
      <div className={joinClassNames('x-range-slider-field', rowClassName)}>
        <span className="x-range-slider-field-label">
          {label}
          {resetButton}
        </span>
        <div className="x-range-slider-field-controls">
          {slider}
          {valueInput}
        </div>
      </div>
    );
  }
  const controls = (
    <>
      {slider}
      {valueInput}
    </>
  );
  return rowClassName ? <div className={rowClassName}>{controls}</div> : controls;
}
