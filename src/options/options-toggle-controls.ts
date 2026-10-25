// The page's switches: registering each toggle with its React control,
// their checked state, the selection toolbar's provider row, settings a
// browser does not support, and the search result source checkboxes.
import type { SearchSourceType } from '../domain/search/types';
import type * as Settings from '../domain/settings';
import { isHtmlElement, isHtmlTag } from '../shared/dom-guards';
import * as LumnoCursorTooltip from '../shared/ui/cursor-tooltip';
import type { CursorTooltipController } from '../shared/ui/cursor-tooltip';
import type { TooltipController } from '../shared/ui/tooltip';
import type { createSearchSourceOrderController } from './options-search-source-order';
import * as LumnoOptionsToggleSettings from './options-toggle-settings';
import type { ToggleSettingsEntry } from './options-toggle-settings';
import type { GetMessage } from './options-types';
import type {
  createSettingsControlsApi,
  RequiredCheckboxItemModel,
  ToggleControlController,
  ToggleControlRenderModel
} from './react/settings-controls';

interface ToggleControlsState {
  searchSourceOrderController: Pick<ReturnType<typeof createSearchSourceOrderController>,
    'moveLocal' | 'sortLocalSourceTypes' | 'isLocalDefault' | 'resetLocal'>;
  // Made once the page has mounted its tooltips.
  tooltipController: Pick<TooltipController, 'hide'> | null;
}

interface ToggleControlsDeps {
  optionsSettingsControlsApi: Pick<ReturnType<typeof createSettingsControlsApi>,
    'createToggleControlController' | 'createRequiredCheckboxGroupController'>;
  tabSwitcherToggle: HTMLInputElement | null;
  // The rows under the tab switcher switch, open while it is on.
  tabSwitcherSubrows: HTMLElement | null;
  selectionQuickActionsToggle: HTMLInputElement | null;
  selectionQuickActionsProviderSelect: HTMLSelectElement | null;
  renderOptionsSelectControl(select: HTMLSelectElement): void;
  selectionQuickActionsSubrows: HTMLElement | null;
  selectionQuickActionsProviderRow: HTMLElement | null;
  selectionQuickActionsGroupToggle: HTMLInputElement | null;
  selectionQuickActionsGroupRow: HTMLElement | null;
  SETTINGS: typeof Settings;
  syncNewtabShortcutSubcontrolAvailability(): void;
  newtabOpenInNewTabToggles: HTMLInputElement[];
  getMessage: GetMessage;
  searchResultSourceTypeInputs: HTMLInputElement[];
  searchResultSourceTypeGroupHost: HTMLElement | null;
  searchResultSourceTypeResetButton: HTMLElement | null;
  // The keys each list shows right now, in order, for the move buttons.
  renderedSearchSourceKeys: Record<string, string[]>;
  normalizeSearchResultSourceTypes(value: unknown): SearchSourceType[];
  persistSearchResultSourceTypes(value: unknown): void;
  optionsState: ToggleControlsState;
}

interface ToggleControlRecord {
  controller: ToggleControlController;
  model: ToggleControlRenderModel;
}

// A search result source checkbox, as the page wrote it.
interface SourceTypeItem {
  checked: boolean;
  id: string;
  labelFallback: string;
  labelKey: string;
  value: string;
}

function createToggleControls(deps: ToggleControlsDeps) {
  const {
    optionsSettingsControlsApi,
    tabSwitcherToggle,
    tabSwitcherSubrows,
    selectionQuickActionsToggle,
    selectionQuickActionsProviderSelect,
    renderOptionsSelectControl,
    selectionQuickActionsSubrows,
    selectionQuickActionsProviderRow,
    selectionQuickActionsGroupToggle,
    selectionQuickActionsGroupRow,
    SETTINGS,
    syncNewtabShortcutSubcontrolAvailability,
    newtabOpenInNewTabToggles,
    getMessage,
    searchResultSourceTypeInputs,
    searchResultSourceTypeGroupHost,
    searchResultSourceTypeResetButton,
    renderedSearchSourceKeys,
    normalizeSearchResultSourceTypes,
    persistSearchResultSourceTypes
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  const optionsToggleControlRecords = new Map<HTMLInputElement, ToggleControlRecord>();
  const unsupportedSettingInputIds = new Set<string>();
  function registerOptionsToggleControl(input: HTMLInputElement | null, kind: string): ToggleControlController | null {
    if (!input) {
      return null;
    }
    const host = input.closest('._x_extension_switch_2024_unique_');
    if (!isHtmlElement(host)) {
      return null;
    }
    const model: ToggleControlRenderModel = {
      ariaLabel: input.getAttribute('aria-label') || undefined,
      ariaLabelKey: input.getAttribute('data-i18n-aria-label') || undefined,
      checked: input.checked,
      disabled: input.disabled,
      id: input.id
    };
    const controller = optionsSettingsControlsApi.createToggleControlController(host, {
      kind,
      onChange(next) {
        input.checked = next;
        input.dispatchEvent(new Event('change'));
      }
    });
    const record = { controller, model };
    optionsToggleControlRecords.set(input, record);
    controller.render(model);
    return controller;
  }
  function setOptionsToggleState(input: HTMLInputElement | null, checked: boolean, disabled?: boolean): void {
    if (!input) {
      return;
    }
    // Stays off without touching the synced value other browsers use.
    const unsupported = unsupportedSettingInputIds.has(input.id);
    const nextChecked = unsupported ? false : checked;
    const nextDisabled = unsupported ? true : disabled;
    input.checked = nextChecked;
    if (typeof nextDisabled === 'boolean') {
      input.disabled = nextDisabled;
    }
    const record = optionsToggleControlRecords.get(input);
    if (!record) {
      return;
    }
    record.model = {
      ...record.model,
      checked: nextChecked,
      disabled: input.disabled
    };
    record.controller.render(record.model);
  }

  // Sub-rows open and fold with their switch. The first sync only places
  // them (no motion while the page loads its settings); later ones animate.
  function createSubrowsReveal(wrap: HTMLElement | null): (expanded: boolean) => void {
    if (!wrap) {
      return () => {};
    }
    wrap.addEventListener('transitionend', (event) => {
      if (event.target === wrap
        && event.propertyName === 'grid-template-rows'
        && wrap.getAttribute('data-expanded') === 'true') {
        wrap.setAttribute('data-settled', 'true');
      }
    });
    let motionQueued = false;
    return function setExpanded(expanded: boolean): void {
      const next = expanded ? 'true' : 'false';
      if (wrap.getAttribute('data-expanded') !== next) {
        wrap.setAttribute('data-expanded', next);
        wrap.inert = !expanded;
        const instant = wrap.getAttribute('data-motion') === 'off'
          || getComputedStyle(wrap).transitionDuration.split(',').every((value) => parseFloat(value) === 0);
        wrap.setAttribute('data-settled', expanded && instant ? 'true' : 'false');
      }
      if (!motionQueued && wrap.getAttribute('data-motion') === 'off') {
        motionQueued = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          wrap.removeAttribute('data-motion');
        }));
      }
    };
  }
  const setSelectionQuickActionsSubrowsExpanded = createSubrowsReveal(selectionQuickActionsSubrows);
  const setTabSwitcherSubrowsExpanded = createSubrowsReveal(tabSwitcherSubrows);

  function syncTabSwitcherSubrows(): void {
    setTabSwitcherSubrowsExpanded(Boolean(tabSwitcherToggle && tabSwitcherToggle.checked));
  }

  function syncSelectionQuickActionsProviderAvailability(): void {
    const disabled = Boolean(selectionQuickActionsToggle && !selectionQuickActionsToggle.checked);
    setSelectionQuickActionsSubrowsExpanded(!disabled);
    if (selectionQuickActionsProviderSelect) {
      selectionQuickActionsProviderSelect.disabled = disabled;
      renderOptionsSelectControl(selectionQuickActionsProviderSelect);
    }
    if (selectionQuickActionsProviderRow) {
      selectionQuickActionsProviderRow.setAttribute('data-disabled', disabled ? 'true' : 'false');
      selectionQuickActionsProviderRow.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
    if (selectionQuickActionsGroupToggle) {
      setOptionsToggleState(
        selectionQuickActionsGroupToggle,
        selectionQuickActionsGroupToggle.checked,
        disabled
      );
    }
    if (selectionQuickActionsGroupRow) {
      selectionQuickActionsGroupRow.setAttribute('data-disabled', disabled ? 'true' : 'false');
      selectionQuickActionsGroupRow.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
  }
  const TOGGLE_SETTINGS = LumnoOptionsToggleSettings.getToggleSettings(SETTINGS, {
    newtabShortcutSubcontrols: syncNewtabShortcutSubcontrolAvailability,
    selectionQuickActionsAvailability: syncSelectionQuickActionsProviderAvailability,
    tabSwitcherSubrows: syncTabSwitcherSubrows
  });
  // Each switch's React view replaces its <input> in the document. The page
  // keeps working with the original element: the view reports clicks to it as
  // change events and re-renders from it, so look every control up once, now.
  const toggleSettingControls = new Map<ToggleSettingsEntry, HTMLInputElement | HTMLSelectElement | null>(
    TOGGLE_SETTINGS.map((entry) => {
      const control = document.getElementById(entry.inputId);
      return [entry, isHtmlTag(control, 'input') || isHtmlTag(control, 'select') ? control : null];
    })
  );
  TOGGLE_SETTINGS.forEach((entry) => {
    const control = toggleSettingControls.get(entry);
    if (entry.kind && isHtmlTag(control, 'input')) {
      registerOptionsToggleControl(control, entry.kind);
    }
  });
  newtabOpenInNewTabToggles.forEach((input) => registerOptionsToggleControl(input, 'newtab-open-in-new-tab'));

  // Settings this browser cannot honor stay visible but disabled, with the
  // reason in a tooltip that follows the cursor: <div
  // data-browser-unsupported="firefox" data-unsupported-reason-key="...">.
  function markBrowserUnsupportedSettings(): void {
    const family = document.documentElement.getAttribute('data-browser-family');
    let reasonTooltip: CursorTooltipController | null = null;
    document.querySelectorAll('[data-browser-unsupported]').forEach((row) => {
      if (row.getAttribute('data-browser-unsupported') !== family) {
        return;
      }
      row.setAttribute('data-unsupported', 'true');
      row.setAttribute('aria-disabled', 'true');
      reasonTooltip = reasonTooltip || LumnoCursorTooltip.createController({
        documentObj: document,
        windowObj: window,
        id: '_x_extension_options_unsupported_cursor_tooltip_2026_unique_',
        appendTo: document.body,
        maxWidth: 360,
        offsetX: 14,
        offsetY: 16
      });
      const reasonKey = row.getAttribute('data-unsupported-reason-key') || '';
      if (isHtmlElement(row)) {
        reasonTooltip.bind(row, () => getMessage(reasonKey, ''));
      }
      // The toggle's React view replaces its <input>; the label keeps the id.
      row.querySelectorAll('label[for]').forEach((label) => {
        if (isHtmlTag(label, 'label')) {
          unsupportedSettingInputIds.add(label.htmlFor);
        }
      });
    });
    optionsToggleControlRecords.forEach((record, input) => {
      if (unsupportedSettingInputIds.has(input.id)) {
        setOptionsToggleState(input, false, true);
      }
    });
  }
  markBrowserUnsupportedSettings();

  const searchResultSourceTypeItems: SourceTypeItem[] = searchResultSourceTypeInputs.map((input) => {
    const label = input.closest('label');
    const text = label ? label.querySelector('span[data-i18n]') : null;
    return {
      checked: input.checked,
      id: input.id,
      labelFallback: text ? text.textContent || '' : '',
      labelKey: text ? text.getAttribute('data-i18n') || '' : '',
      value: input.getAttribute('data-search-result-source-type') || ''
    };
  }).filter((item) => item.value);
  const searchResultSourceTypeController =
    optionsSettingsControlsApi.createRequiredCheckboxGroupController(
      searchResultSourceTypeGroupHost,
      {
        kind: 'search-result-sources',
        onMove: (fromIndex, toIndex) => optionsState.searchSourceOrderController.moveLocal(
          renderedSearchSourceKeys.local || [],
          fromIndex,
          toIndex
        ),
        onChange(values) {
          const selected = new Set(values);
          let changedInput: HTMLInputElement | null = null;
          for (const input of searchResultSourceTypeInputs) {
            const next = selected.has(input.getAttribute('data-search-result-source-type') || '');
            if (input.checked !== next && !changedInput) {
              changedInput = input;
            }
            input.checked = next;
          }
          if (changedInput) {
            changedInput.dispatchEvent(new Event('change'));
          }
        }
      }
    );
  function renderSearchResultSourceTypeControl(value: unknown): void {
    const selected = new Set<string>(normalizeSearchResultSourceTypes(value));
    const values = optionsState.searchSourceOrderController.sortLocalSourceTypes(
      searchResultSourceTypeItems.map((item) => item.value)
    );
    renderedSearchSourceKeys.local = values;
    const items: RequiredCheckboxItemModel[] = [];
    values.forEach((type) => {
      const item = searchResultSourceTypeItems.find((entry) => entry.value === type);
      if (item) {
        items.push({
          checked: selected.has(item.value),
          id: item.id,
          label: getMessage(item.labelKey, item.labelFallback),
          labelKey: item.labelKey,
          value: item.value
        });
      }
    });
    searchResultSourceTypeController.render({ items, sortable: true });
    if (searchResultSourceTypeResetButton) {
      searchResultSourceTypeResetButton.hidden = selected.size >= searchResultSourceTypeItems.length &&
        optionsState.searchSourceOrderController.isLocalDefault();
    }
  }

  // Reset beside the title shows while the types differ from their defaults:
  // every type back on and in its usual order (the order step can be undone).
  if (searchResultSourceTypeResetButton) {
    searchResultSourceTypeResetButton.addEventListener('click', () => {
      optionsState.searchSourceOrderController.resetLocal();
      persistSearchResultSourceTypes(searchResultSourceTypeItems.map((item) => item.value));
      // The button hides itself, so its tooltip and focus move on.
      if (optionsState.tooltipController) {
        optionsState.tooltipController.hide();
      }
      const firstInput = searchResultSourceTypeGroupHost &&
        searchResultSourceTypeGroupHost.querySelector('input[type="checkbox"]');
      if (isHtmlElement(firstInput)) {
        firstInput.focus({ preventScroll: true });
      }
    });
  }

  return {
    registerOptionsToggleControl,
    setOptionsToggleState,
    syncSelectionQuickActionsProviderAvailability,
    TOGGLE_SETTINGS,
    toggleSettingControls,
    searchResultSourceTypeItems,
    searchResultSourceTypeController,
    renderSearchResultSourceTypeControl
  };
}

export { createToggleControls };
export type { SourceTypeItem, ToggleControlsDeps, ToggleControlsState };
