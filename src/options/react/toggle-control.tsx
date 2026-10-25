import { useState } from 'react';

// A switch's state, as the page sets it.
export interface ToggleControlRenderModel {
  ariaLabel?: string;
  ariaLabelKey?: string;
  checked: boolean;
  disabled?: boolean;
  id: string;
}

// The checkbox of a switch row; the row's label frames it as a switch.
export function ToggleControl({
  model,
  onChange
}: {
  model: ToggleControlRenderModel;
  onChange(checked: boolean): void;
}) {
  const [checked, setChecked] = useState(model.checked);
  // Follow the page's value in the same render. An effect would land a frame
  // or more later, so a stored value applied at startup would first paint the
  // HTML default and then slide the switch over.
  const [modelChecked, setModelChecked] = useState(model.checked);
  if (modelChecked !== model.checked) {
    setModelChecked(model.checked);
    setChecked(model.checked);
  }

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
