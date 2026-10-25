// Small controls the appearance panel's sections are built from: section
// triggers, info buttons, switches, toggle sections, setting rows, row tabs,
// count sliders and selects.
import { type ReactNode, useState } from 'react';
import { ref, type TooltipActions, tooltipHandlers } from './panel-primitives';
import { RangeSliderField } from '../../../shared/react/range-slider';
import type { SelectMenuControls } from '../../../shared/react/select-menu';
import { type PanelSelectModel, type CuratedMixState, CURATED_MIX_SELECT_ID } from './panel-model';
import { SelectMenu } from '../select-menu';
import { innerHtml } from '../../../shared/react/inner-html';

// Leading chevron + title form one disclosure hot area for every panel section.
export function SectionTrigger({
  arrowIcon,
  bodyId,
  disabled,
  expanded,
  id,
  label,
  onToggle,
  title,
  titleClassName = '',
  titleRef,
  triggerRef
}: {
  arrowIcon: string;
  bodyId: string;
  disabled?: boolean;
  expanded: boolean;
  id?: string;
  label?: string;
  onToggle?(): void;
  title?: string;
  titleClassName?: string;
  titleRef: string;
  triggerRef: string;
}) {
  return (
    <button
      {...ref(triggerRef)}
      aria-controls={bodyId}
      aria-disabled={disabled === undefined ? undefined : (disabled ? 'true' : 'false')}
      aria-expanded={expanded ? 'true' : 'false'}
      aria-label={label || undefined}
      className="x-nt-section-trigger"
      disabled={disabled}
      id={id}
      onClick={onToggle}
      type="button"
    >
      <span
        aria-hidden="true"
        className="x-nt-section-chevron"
        dangerouslySetInnerHTML={innerHtml(arrowIcon)}
      />
      <span
        {...ref(titleRef)}
        className={`x-nt-wallpaper-panel-title${titleClassName ? ` ${titleClassName}` : ''}`}
      >
        {title}
      </span>
    </button>
  );
}

export function InfoButton({
  actions,
  icon,
  label,
  name,
  tooltip
}: {
  actions?: TooltipActions;
  icon: string;
  label?: string;
  name: string;
  tooltip?: string;
}) {
  return (
    <button
      {...ref(name)}
      {...(actions ? tooltipHandlers(actions, tooltip) : {})}
      aria-label={label || undefined}
      className="x-nt-appearance-info-button"
      dangerouslySetInnerHTML={innerHtml(icon)}
      type="button"
    />
  );
}

// Sections whose content another runtime fills keep uncontrolled switches.
export function StaticSwitch({ ariaLabel, name }: { ariaLabel?: string; name: string }) {
  return (
    <label className="x-nt-wallpaper-switch">
      <input {...ref(name)} aria-label={ariaLabel} role="switch" type="checkbox" />
      <span aria-hidden="true" className="x-nt-wallpaper-switch-slider" />
    </label>
  );
}

// A section whose header switch turns the page section on or off; the body ships
// collapsed and is filled in by its own runtime.
export function ToggleSection({
  arrowIcon,
  children,
  name
}: {
  arrowIcon: string;
  children: ReactNode;
  name: string;
}) {
  const bodyId = `_x_extension_newtab_${name}_body_2026_unique_`;
  return (
    <div {...ref(`${name}Section`)} className="x-nt-wallpaper-section">
      <div className="x-nt-wallpaper-panel-header">
        <SectionTrigger
          arrowIcon={arrowIcon}
          bodyId={bodyId}
          expanded={false}
          titleRef={`${name}Title`}
          triggerRef={`${name}Trigger`}
        />
        <StaticSwitch name={`${name}Toggle`} />
      </div>
      <div
        {...ref(`${name}Body`)}
        className="x-nt-panel-section-body x-nt-panel-collapsible"
        hidden
        id={bodyId}
      >
        {children}
      </div>
    </div>
  );
}

export function SettingRow({ children, titleRef }: { children: ReactNode; titleRef: string }) {
  return (
    <div className="x-nt-appearance-setting-row">
      <span {...ref(titleRef)} className="x-nt-appearance-setting-title" />
      {children}
    </div>
  );
}

// Segmented choice another runtime labels and selects.
export function StaticRowTabs({
  attribute,
  labeled = false,
  name,
  values
}: {
  attribute: `data-${string}`;
  labeled?: boolean;
  name: string;
  values: string[];
}) {
  return (
    <div {...ref(`${name}Tabs`)} className="x-nt-segmented-tabs x-nt-wallpaper-tabs x-nt-row-tabs" role="group">
      <span
        {...ref(`${name}Indicator`)}
        aria-hidden="true"
        className="x-nt-segmented-tabs-indicator x-nt-wallpaper-tabs-indicator"
      />
      {values.map((value) => (
        <button
          {...{ [attribute]: value }}
          aria-pressed="false"
          className="x-nt-segmented-tab x-nt-wallpaper-tab"
          data-active="false"
          key={value}
          type="button"
        >
          {labeled ? value : null}
        </button>
      ))}
    </div>
  );
}

// Whole-number slider another runtime drives.
export function StaticCountSlider({
  defaultValue,
  marks,
  max,
  min,
  name
}: {
  defaultValue: string;
  marks: number[];
  max: string;
  min: string;
  name: string;
}) {
  return (
    <div className="x-nt-overlay-control">
      <RangeSliderField
        label={<span {...ref(`${name}Label`)} className="x-nt-appearance-setting-title" />}
        {...ref(`${name}Slider`)}
        className="x-nt-overlay-slider-wrap"
        defaultValue={defaultValue}
        inputClass="x-nt-overlay-slider"
        max={max}
        min={min}
        rowClassName="x-nt-range-slider-row"
        step="1"
        valueInputProps={{
          ...ref(`${name}SliderValueInput`),
          defaultValue,
          inputMode: 'numeric'
        }}
        marks={marks}
      />
    </div>
  );
}

export function PanelSelect({
  documentObj,
  hostRef,
  id,
  registerControls,
  select
}: {
  documentObj: Document;
  hostRef: string;
  id: string;
  registerControls(id: string, controls: SelectMenuControls): void;
  select: PanelSelectModel | null | undefined;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <div
      {...ref(hostRef)}
      className="_x_extension_select_wrap_2024_unique_ _x_extension_custom_select_2024_unique_ x-nt-row-select"
      ref={setHost}
    >
      {host && select ? (
        <SelectMenu
          config={{
            id,
            selectId: `${id}-select`,
            ariaLabel: select.ariaLabel,
            options: select.options,
            value: select.value,
            menuAlign: 'left',
            menuPortal: true,
            menuPortalZIndex: 10020,
            menuWidth: 'trigger',
            onValueChange: select.onChange
          }}
          documentObj={documentObj}
          host={host}
          registerControls={(controls) => registerControls(id, controls)}
          windowObj={documentObj.defaultView || window}
        />
      ) : null}
    </div>
  );
}

// A quiet text trigger in the photo list's header; each category toggles without closing the menu.
export function CuratedMixSelect({
  documentObj,
  mix,
  onCheckedChange,
  registerControls
}: {
  documentObj: Document;
  mix: CuratedMixState;
  onCheckedChange(value: string, checked: boolean): void;
  registerControls(id: string, controls: SelectMenuControls): void;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <div
      {...ref('curatedMixSelectHost')}
      className="_x_extension_select_wrap_2024_unique_ _x_extension_custom_select_2024_unique_ x-nt-curated-mix-select"
      ref={setHost}
    >
      {host ? (
        <SelectMenu
          config={{
            id: CURATED_MIX_SELECT_ID,
            ariaLabel: mix.ariaLabel,
            options: mix.options,
            triggerLabel: mix.label,
            menuAlign: 'right',
            menuPortal: true,
            menuPortalZIndex: 10020,
            menuWidth: 'content',
            onCheckedChange
          }}
          documentObj={documentObj}
          host={host}
          registerControls={(controls) => registerControls(CURATED_MIX_SELECT_ID, controls)}
          windowObj={documentObj.defaultView || window}
        />
      ) : null}
    </div>
  );
}
