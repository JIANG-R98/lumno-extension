// The page's switches: registering each toggle with its React control,
// their checked state, the selection toolbar's provider row, settings a
// browser does not support, and the search result source checkboxes.
import * as LumnoCursorTooltip from '../shared/ui/cursor-tooltip.js';
import * as LumnoOptionsToggleSettings from './options-toggle-settings.js';

function createToggleControls(deps) {
  const {
    optionsSettingsControlsApi,
    selectionQuickActionsToggle,
    selectionQuickActionsProviderSelect,
    renderOptionsSelectControl,
    selectionQuickActionsSubrows,
    selectionQuickActionsProviderRow,
    selectionQuickActionsGroupToggle,
    selectionQuickActionsGroupRow,
    SETTINGS,
    setFaviconBlacklistEditorEnabled,
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

  const optionsToggleControlRecords = new Map();
  const unsupportedSettingInputIds = new Set();
  function registerOptionsToggleControl(input, kind) {
    if (!input) {
      return null;
    }
    const host = input.closest('._x_extension_switch_2024_unique_');
    if (!host) {
      return null;
    }
    const model = {
      ariaLabel: input.getAttribute('aria-label') || undefined,
      ariaLabelKey: input.getAttribute('data-i18n-aria-label') || undefined,
      checked: Boolean(input.checked),
      disabled: Boolean(input.disabled),
      id: input.id
    };
    const controller = optionsSettingsControlsApi.createToggleControlController(host, {
      kind,
      onChange(next) {
        input.checked = Boolean(next);
        input.dispatchEvent(new Event('change'));
      }
    });
    const record = { controller, model };
    optionsToggleControlRecords.set(input, record);
    controller.render(model);
    return controller;
  }
  function setOptionsToggleState(input, checked, disabled) {
    if (!input) {
      return;
    }
    // Stays off without touching the synced value other browsers use.
    if (unsupportedSettingInputIds.has(input.id)) {
      checked = false;
      disabled = true;
    }
    input.checked = Boolean(checked);
    if (typeof disabled === 'boolean') {
      input.disabled = disabled;
    }
    const record = optionsToggleControlRecords.get(input);
    if (!record) {
      return;
    }
    record.model = Object.assign({}, record.model, {
      checked: Boolean(checked),
      disabled: Boolean(input.disabled)
    });
    record.controller.render(record.model);
  }

  // The sub-rows open and fold with the switch. The first sync only places
  // them (no motion while the page loads its settings); later ones animate.
  if (selectionQuickActionsSubrows) {
    selectionQuickActionsSubrows.addEventListener('transitionend', (event) => {
      if (event.target === selectionQuickActionsSubrows
        && event.propertyName === 'grid-template-rows'
        && selectionQuickActionsSubrows.getAttribute('data-expanded') === 'true') {
        selectionQuickActionsSubrows.setAttribute('data-settled', 'true');
      }
    });
  }
  let selectionQuickActionsSubrowsMotionQueued = false;
  function setSelectionQuickActionsSubrowsExpanded(expanded) {
    const wrap = selectionQuickActionsSubrows;
    if (!wrap) {
      return;
    }
    const next = expanded ? 'true' : 'false';
    if (wrap.getAttribute('data-expanded') !== next) {
      wrap.setAttribute('data-expanded', next);
      wrap.inert = !expanded;
      const instant = wrap.getAttribute('data-motion') === 'off'
        || getComputedStyle(wrap).transitionDuration.split(',').every((value) => parseFloat(value) === 0);
      wrap.setAttribute('data-settled', expanded && instant ? 'true' : 'false');
    }
    if (!selectionQuickActionsSubrowsMotionQueued && wrap.getAttribute('data-motion') === 'off') {
      selectionQuickActionsSubrowsMotionQueued = true;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wrap.removeAttribute('data-motion');
      }));
    }
  }

  function syncSelectionQuickActionsProviderAvailability() {
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
    faviconBlacklistEditor: setFaviconBlacklistEditorEnabled,
    newtabShortcutSubcontrols: syncNewtabShortcutSubcontrolAvailability,
    selectionQuickActionsAvailability: syncSelectionQuickActionsProviderAvailability
  });
  // Each switch's React view replaces its <input> in the document. The page
  // keeps working with the original element: the view reports clicks to it as
  // change events and re-renders from it, so look every control up once, now.
  const toggleSettingControls = new Map(TOGGLE_SETTINGS.map((entry) => [
    entry,
    document.getElementById(entry.inputId)
  ]));
  TOGGLE_SETTINGS.forEach((entry) => {
    if (entry.kind) {
      registerOptionsToggleControl(toggleSettingControls.get(entry), entry.kind);
    }
  });
  newtabOpenInNewTabToggles.forEach((input) => registerOptionsToggleControl(input, 'newtab-open-in-new-tab'));

  // Settings this browser cannot honor stay visible but disabled, with the
  // reason in a tooltip that follows the cursor: <div
  // data-browser-unsupported="firefox" data-unsupported-reason-key="...">.
  function markBrowserUnsupportedSettings() {
    const family = document.documentElement.getAttribute('data-browser-family');
    let reasonTooltip = null;
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
      reasonTooltip.bind(row, () => getMessage(reasonKey, ''));
      // The toggle's React view replaces its <input>; the label keeps the id.
      row.querySelectorAll('label[for]').forEach((label) => unsupportedSettingInputIds.add(label.htmlFor));
    });
    optionsToggleControlRecords.forEach((record, input) => {
      if (unsupportedSettingInputIds.has(input.id)) {
        setOptionsToggleState(input, false, true);
      }
    });
  }
  markBrowserUnsupportedSettings();

  const searchResultSourceTypeItems = searchResultSourceTypeInputs.map((input) => {
    const label = input.closest('label');
    const text = label ? label.querySelector('span[data-i18n]') : null;
    return {
      checked: Boolean(input.checked),
      id: input.id,
      labelFallback: text ? text.textContent : '',
      labelKey: text ? text.getAttribute('data-i18n') : '',
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
          let changedInput = null;
          searchResultSourceTypeInputs.forEach((input) => {
            const next = selected.has(input.getAttribute('data-search-result-source-type'));
            if (input.checked !== next && !changedInput) {
              changedInput = input;
            }
            input.checked = next;
          });
          if (changedInput) {
            changedInput.dispatchEvent(new Event('change'));
          }
        }
      }
    );
  function renderSearchResultSourceTypeControl(value) {
    if (!searchResultSourceTypeController) {
      return;
    }
    const selected = new Set(normalizeSearchResultSourceTypes(value));
    const values = optionsState.searchSourceOrderController.sortLocalSourceTypes(
      searchResultSourceTypeItems.map((item) => item.value)
    );
    renderedSearchSourceKeys.local = values;
    searchResultSourceTypeController.render({
      items: values.map((type) => searchResultSourceTypeItems.find((item) => item.value === type))
        .map((item) => Object.assign({}, item, {
          checked: selected.has(item.value),
          label: getMessage(item.labelKey, item.labelFallback)
        })),
      sortable: true
    });
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
      if (firstInput) {
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
