// The page's selects: their React controls and items.
import { isElementNode, isHtmlElement } from '../shared/dom-guards';
import type { GetMessage } from './options-types';
import type { SelectControlController } from './react/select-control';

interface SelectControlsDeps {
  tabsRow: Element | null;
  getMessage: GetMessage;
}

// A select's option, as its menu shows it.
interface SelectItem {
  badge: string;
  fallback: string;
  iconUrl: string;
  labelKey: string;
  value: string;
}

interface SelectControlRecord {
  controller: SelectControlController;
  items: SelectItem[];
  labelledBy: string;
  select: HTMLSelectElement;
}

function createSelectControls(deps: SelectControlsDeps) {
  const { tabsRow, getMessage } = deps;

  const optionsSelectControlApi = globalThis.LumnoOptionsSelectControl;
  // The settings tabs stay pinned at the top; a menu that flips upward must clear them.
  function getMenuViewportTopInset(): number {
    const tabsRect = tabsRow ? tabsRow.getBoundingClientRect() : null;
    return tabsRect ? Math.max(0, tabsRect.bottom + 8) : 8;
  }
  const optionsSelectControlRecords = new Map<HTMLSelectElement, SelectControlRecord>();
  function readOptionsSelectItems(select: HTMLSelectElement): SelectItem[] {
    return Array.from(select.options).map((option) => {
      const iconPath = option.getAttribute('data-icon-path') || '';
      return {
        badge: option.getAttribute('data-badge') || '',
        fallback: option.textContent || option.value,
        iconUrl: iconPath ? chrome.runtime.getURL(iconPath) : '',
        labelKey: option.getAttribute('data-i18n') || '',
        value: option.value
      };
    });
  }
  function registerOptionsSelectControl(select: HTMLSelectElement | null, kind: string): SelectControlRecord | null {
    if (!select || !optionsSelectControlApi) {
      return null;
    }
    const host = select.closest('._x_extension_custom_select_2024_unique_');
    if (!isHtmlElement(host)) {
      return null;
    }
    const items = readOptionsSelectItems(select);
    // The setting title plus the current value name the trigger for assistive tech.
    const title = host.closest('._x_extension_setting_row_2024_unique_')
      ?.querySelector('._x_extension_setting_title_2024_unique_');
    if (isElementNode(title) && !title.id) {
      title.id = `${select.id}_title`;
    }
    const controller = optionsSelectControlApi.createSelectControlController(host, {
      getViewportTopInset: getMenuViewportTopInset,
      kind,
      onSelect(next) {
        select.value = next;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    const record: SelectControlRecord = {
      controller,
      items,
      labelledBy: title ? title.id : '',
      select
    };
    optionsSelectControlRecords.set(select, record);
    return record;
  }
  function renderOptionsSelectControl(select: HTMLSelectElement): void {
    const record = optionsSelectControlRecords.get(select);
    if (!record) {
      return;
    }
    record.controller.render({
      disabled: select.disabled,
      id: select.id,
      labelledBy: record.labelledBy || undefined,
      items: record.items.map((item) => ({
        badge: item.badge,
        iconUrl: item.iconUrl,
        label: item.labelKey ? getMessage(item.labelKey, item.fallback) : item.fallback,
        labelKey: item.labelKey,
        value: item.value
      })),
      value: select.value
    });
  }
  function setOptionsSelectState(select: HTMLSelectElement | null, value: unknown): void {
    if (!select) {
      return;
    }
    select.value = String(value);
    renderOptionsSelectControl(select);
  }
  return {
    getMenuViewportTopInset,
    optionsSelectControlRecords,
    registerOptionsSelectControl,
    renderOptionsSelectControl,
    setOptionsSelectState
  };
}

export { createSelectControls };
export type { SelectControlRecord, SelectControlsDeps, SelectItem };
