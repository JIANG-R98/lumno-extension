import { useLayoutEffect, useRef, useState } from 'react';
import { RangeSliderField } from '../../shared/react/range-slider';

export interface RangeSliderControlRenderModel {
  ariaLabel: string;
  defaultValue?: number;
  disabled?: boolean;
  id: string;
  max: number;
  min: number;
  step: number;
  ticks: Array<{
    align?: 'start' | 'center' | 'end';
    label: string;
    percent?: number;
  }>;
  value: number;
  valueSuffix?: string;
  resetAriaLabel?: string;
  resetButtonId?: string;
  // Values a drag settles on when it comes within snapThreshold of them.
  snapPoints?: number[];
  snapThreshold?: number;
}

// A settings slider with its value field and an optional reset to its default.
export function RangeSliderControl({
  model,
  onInput
}: {
  model: RangeSliderControlRenderModel;
  onInput(value: number): void;
}) {
  const [value, setValue] = useState(model.value);
  const [draftValue, setDraftValue] = useState(String(model.value));
  const valueRef = useRef(model.value);
  // Same-render sync, as in ToggleControl.
  const [modelValue, setModelValue] = useState(model.value);
  if (!Object.is(modelValue, model.value)) {
    setModelValue(model.value);
    setValue(model.value);
    setDraftValue(String(model.value));
  }

  useLayoutEffect(() => {
    valueRef.current = model.value;
  }, [model.value]);

  const normalizeValue = (next: number) => {
    const min = Number(model.min);
    const max = Number(model.max);
    const step = Number(model.step) > 0 ? Number(model.step) : 1;
    if (!Number.isFinite(next)) {
      return valueRef.current;
    }
    const stepped = min + Math.round((next - min) / step) * step;
    return Math.min(max, Math.max(min, stepped));
  };
  const snapValue = (next: number) => {
    const threshold = Number(model.snapThreshold) > 0 ? Number(model.snapThreshold) : 0;
    const point = (model.snapPoints || []).find((candidate) => Math.abs(candidate - next) <= threshold);
    return Number.isFinite(point) ? Number(point) : next;
  };
  const handleValueChange = (next: number) => {
    const normalized = normalizeValue(next);
    setDraftValue(String(normalized));
    if (normalized === valueRef.current) {
      return;
    }
    valueRef.current = normalized;
    setValue(normalized);
    onInput(normalized);
  };
  const commitDraftValue = () => {
    const next = Number(draftValue);
    if (!draftValue.trim() || !Number.isFinite(next)) {
      setDraftValue(String(valueRef.current));
      return;
    }
    handleValueChange(next);
  };
  const valueText = `${value}${model.valueSuffix || ''}`;
  return (
    <div className="_x_extension_range_slider_control_2026_unique_">
      <RangeSliderField
        aria-label={model.ariaLabel}
        aria-valuetext={valueText}
        className="x-lumno-range-slider"
        disabled={model.disabled}
        id={model.id}
        inputClass="x-lumno-range-slider-input"
        max={model.max}
        min={model.min}
        resetButtonProps={Number.isFinite(model.defaultValue) && model.resetAriaLabel
          ? {
              'aria-label': model.resetAriaLabel,
              disabled: Boolean(model.disabled || value === model.defaultValue),
              id: model.resetButtonId,
              onClick: (event) => {
                handleValueChange(Number(model.defaultValue));
                event.currentTarget.blur();
              },
              title: model.resetAriaLabel
            }
          : undefined}
        onChange={(event) => {
          handleValueChange(snapValue(Number(event.currentTarget.value)));
        }}
        onInput={(event) => {
          handleValueChange(snapValue(Number(event.currentTarget.value)));
        }}
        step={model.step}
        style={{
          '--x-range-slider-percent': `${
            ((value - model.min) / (model.max - model.min)) * 100
          }%`
        }}
        value={value}
        valueInputProps={{
          'aria-label': model.ariaLabel,
          disabled: model.disabled,
          inputMode: 'numeric',
          onBlur: commitDraftValue,
          onChange: (event) => {
            setDraftValue(event.currentTarget.value);
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraftValue();
              event.currentTarget.blur();
            }
          },
          value: draftValue
        }}
        marks={model.ticks.map((tick, index) =>
          Number.isFinite(tick.percent)
            ? Number(tick.percent)
            : (index / Math.max(1, model.ticks.length - 1)) * 100
        )}
      />
    </div>
  );
}
