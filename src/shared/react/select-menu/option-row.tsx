// One row of an open select menu, with the divider or group title above it.
import { Fragment } from 'react';
import { RemixIcon } from '../remix-icon';
import { getFontPreviewFamily, isValueOption } from './menu-options';
import type { SelectMenuOption } from './menu-options';

interface SelectOptionRowProps {
  option: SelectMenuOption;
  index: number;
  active: boolean;
  selectedValue: string;
  // The menu holds actions, radios or checkboxes, so its rows are menu items.
  usesMenuSemantics: boolean;
  id: string | undefined;
  onChoose(option: SelectMenuOption): void;
  onActiveChange(index: number): void;
}

function getRowRole(option: SelectMenuOption, usesMenuSemantics: boolean, radioItem: boolean): string {
  if (!usesMenuSemantics) {
    return 'option';
  }
  if (option.checkbox) {
    return 'menuitemcheckbox';
  }
  return radioItem ? 'menuitemradio' : 'menuitem';
}

function OptionIcon({ option }: { option: SelectMenuOption }) {
  if (option.iconUrl) {
    return (
      <img
        alt=""
        aria-hidden="true"
        className="_x_extension_select_option_icon_2026_unique_"
        src={option.iconUrl}
      />
    );
  }
  return option.iconName
    ? <RemixIcon className="_x_extension_select_option_icon_2026_unique_" name={option.iconName} size={16} />
    : null;
}

function RowHeading({ option, index, usesMenuSemantics }: { option: SelectMenuOption; index: number; usesMenuSemantics: boolean }) {
  return (
    <>
      {option.dividerBefore && index > 0 ? (
        <div
          aria-orientation={usesMenuSemantics ? 'horizontal' : undefined}
          className="_x_extension_select_divider_2026_unique_"
          role={usesMenuSemantics ? 'separator' : 'presentation'}
        />
      ) : null}
      {option.groupTitle ? (
        <div className="_x_extension_select_menu_title_2024_unique_" role="presentation">
          {option.groupTitle}
        </div>
      ) : null}
    </>
  );
}

// The row's ARIA and data attributes.
function readRowAttributes(option: SelectMenuOption, selectedValue: string, usesMenuSemantics: boolean) {
  const selected = isValueOption(option) && option.value === selectedValue;
  const radioItem = usesMenuSemantics && !option.checkbox && (!option.action || Boolean(option.radio));
  const checked = option.radio || option.checkbox ? option.checked === true : selected;
  const radioChecked = checked ? 'true' : 'false';
  return {
    'aria-checked': radioItem || option.checkbox ? checked : undefined,
    'aria-disabled': option.disabled ? ('true' as const) : undefined,
    'aria-selected': !usesMenuSemantics ? selected : undefined,
    'data-radio-checked': option.radio ? radioChecked : undefined,
    'data-selected': selected ? 'true' : 'false',
    role: getRowRole(option, usesMenuSemantics, radioItem)
  };
}

function SelectOptionRow({ option, index, active, selectedValue, usesMenuSemantics, id, onChoose, onActiveChange }: SelectOptionRowProps) {
  const trailingIconName = option.trailingIconName;
  return (
    <Fragment>
      <RowHeading index={index} option={option} usesMenuSemantics={usesMenuSemantics} />
      <div
        {...readRowAttributes(option, selectedValue, usesMenuSemantics)}
        className={`_x_extension_select_option_2024_unique_${option.radio ? ' _x_extension_select_option_radio_2026_unique_' : ''}`}
        data-active={active ? 'true' : undefined}
        id={id}
        data-value={option.value}
        onClick={() => onChoose(option)}
        onMouseEnter={() => onActiveChange(index)}
        onMouseLeave={() => onActiveChange(-1)}
      >
        {option.checkbox ? (
          <span aria-hidden="true" className="_x_extension_select_option_checkbox_2026_unique_" />
        ) : null}
        <OptionIcon option={option} />
        <span
          className="_x_extension_select_option_label_2026_unique_"
          style={option.fontFamily ? { fontFamily: getFontPreviewFamily(option.fontFamily) } : undefined}
        >
          {option.label}
        </span>
        {option.badge ? (
          <span className="_x_extension_select_option_badge_2026_unique_">{option.badge}</span>
        ) : null}
        {option.radio && trailingIconName ? (
          <span aria-hidden="true" className="_x_extension_select_option_check_2026_unique_">
            <RemixIcon name={trailingIconName} size={16} />
          </span>
        ) : null}
      </div>
    </Fragment>
  );
}

export { SelectOptionRow };
