// Small controls the appearance panel's sections are built from: section
// triggers, info buttons, switches, setting rows and selects.
import { type ReactNode, useState } from 'react';
import { ref, type TooltipActions, tooltipHandlers } from './panel-primitives';
import type { SelectMenuControls } from '../../../shared/react/select-menu';
import { type PanelSelectModel, type CuratedMixState, CURATED_MIX_SELECT_ID } from './panel-model';
import { SelectMenu } from '../../../shared/react/select-menu';
import { RemixIcon } from '../../../shared/react/remix-icon';

// Leading chevron + title form one disclosure hot area for every panel section.
export function SectionTrigger({
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
      >
        <RemixIcon name="ri-arrow-right-s-line" />
      </span>
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
  label,
  name,
  tooltip
}: {
  actions?: TooltipActions;
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
      type="button"
    >
      <RemixIcon name="ri-information-line" />
    </button>
  );
}

export function SettingRow({ children, title, titleRef }: { children: ReactNode; title: string; titleRef: string }) {
  return (
    <div className="x-nt-appearance-setting-row">
      <span {...ref(titleRef)} className="x-nt-appearance-setting-title">{title}</span>
      {children}
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
