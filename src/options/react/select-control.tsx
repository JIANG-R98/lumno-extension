import { useLayoutEffect, useState } from 'react';
import { SelectMenu } from '../../shared/react/select-menu';

export interface SelectControlItemModel {
  badge?: string;
  /** Renders the label in this family (the font picker previews faces). */
  fontFamily?: string;
  iconUrl?: string;
  label: string;
  labelKey: string;
  value: string;
}

export interface SelectControlRenderModel {
  disabled?: boolean;
  /** Shown when a searchable menu's filter matches nothing. */
  emptyLabel?: string;
  id: string;
  items: SelectControlItemModel[];
  /** Id of the setting title; names the trigger together with the current value. */
  labelledBy?: string;
  searchPlaceholder?: string;
  value: string;
}

export interface SelectControlOptions {
  /** Viewport space covered by sticky page chrome, so the menu never opens beneath it. */
  getViewportTopInset?(): number;
  onSelect(value: string): void;
  /** Adds a filter field for long lists such as installed fonts. */
  searchable?: boolean;
}

// Options settings use the shared select so they get the same keyboard model,
// semantics and placement as New Tab menus. The menu stays inside the host to
// inherit the settings panel theme.
function SelectControl({
  host,
  model,
  options
}: {
  host: HTMLElement;
  model: SelectControlRenderModel;
  options: SelectControlOptions;
}) {
  useLayoutEffect(() => {
    host.dataset.disabled = model.disabled ? 'true' : 'false';
  }, [host, model.disabled]);

  return (
    <SelectMenu
      config={{
        ariaLabelledBy: model.labelledBy,
        disabled: model.disabled,
        id: `${model.id}_control`,
        menuAlign: 'right',
        // Keep the trigger width as the minimum; longer translations expand the menu.
        menuMinWidth: '100%',
        menuPortal: false,
        menuWidth: 'content',
        emptyLabel: model.emptyLabel,
        // The settings page's text field, as in site search and the blacklist.
        searchInputClassName: '_x_extension_shortcut_input_2024_unique_',
        searchPlaceholder: model.searchPlaceholder,
        searchable: options.searchable,
        onValueChange(value) {
          if (value !== model.value) {
            options.onSelect(value);
          }
        },
        options: model.items.map((item) => ({
          badge: item.badge || undefined,
          fontFamily: item.fontFamily || undefined,
          iconUrl: item.iconUrl || undefined,
          label: item.label,
          value: item.value
        })),
        selectId: model.id,
        value: model.value
      }}
      documentObj={host.ownerDocument}
      getViewportTopInset={options.getViewportTopInset}
      host={host}
      windowObj={host.ownerDocument.defaultView || window}
    />
  );
}

// A select inside a React view, in the page's select frame, which also
// holds its menu.
export function SettingSelect({
  model,
  options
}: {
  model: SelectControlRenderModel;
  options: SelectControlOptions;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <div
      className="_x_extension_select_wrap_2024_unique_ _x_extension_custom_select_2024_unique_ _x_extension_select_wrap_auto_2024_unique_ _x_extension_select_align_right_2024_unique_"
      data-select={model.id}
      data-select-searchable={options.searchable ? 'true' : undefined}
      ref={setHost}
    >
      {host ? <SelectControl host={host} model={model} options={options} /> : null}
    </div>
  );
}
