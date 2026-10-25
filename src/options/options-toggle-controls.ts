// The page's switches: registering each toggle with its React control,
// their checked state, and settings a browser does not support.
import type * as Settings from '../domain/settings';
import { isHtmlElement, isHtmlTag } from '../shared/dom-guards';
import * as LumnoCursorTooltip from '../shared/ui/cursor-tooltip';
import type { CursorTooltipController } from '../shared/ui/cursor-tooltip';
import * as LumnoOptionsToggleSettings from './options-toggle-settings';
import type { ToggleSettingsEntry } from './options-toggle-settings';
import type { GetMessage } from './options-types';
import type {
  createSettingsControlsApi,
  ToggleControlController,
  ToggleControlRenderModel
} from './react/settings-controls';

interface ToggleControlsDeps {
  optionsSettingsControlsApi: Pick<ReturnType<typeof createSettingsControlsApi>, 'createToggleControlController'>;
  SETTINGS: typeof Settings;
  syncNewtabShortcutSubcontrolAvailability(): void;
  getMessage: GetMessage;
}

interface ToggleControlRecord {
  controller: ToggleControlController;
  model: ToggleControlRenderModel;
}

function createToggleControls(deps: ToggleControlsDeps) {
  const {
    optionsSettingsControlsApi,
    SETTINGS,
    syncNewtabShortcutSubcontrolAvailability,
    getMessage
  } = deps;

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

  const TOGGLE_SETTINGS = LumnoOptionsToggleSettings.getToggleSettings(SETTINGS, {
    newtabShortcutSubcontrols: syncNewtabShortcutSubcontrolAvailability
  });
  // Each switch's React view replaces its <input> in the document. The page
  // keeps working with the original element: the view reports clicks to it as
  // change events and re-renders from it, so look every control up once, now.
  const toggleSettingControls = new Map<ToggleSettingsEntry, HTMLInputElement | null>(
    TOGGLE_SETTINGS.map((entry) => {
      const control = document.getElementById(entry.inputId);
      return [entry, isHtmlTag(control, 'input') ? control : null];
    })
  );
  TOGGLE_SETTINGS.forEach((entry) => {
    const control = toggleSettingControls.get(entry);
    if (entry.kind && control) {
      registerOptionsToggleControl(control, entry.kind);
    }
  });

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

  return {
    setOptionsToggleState,
    TOGGLE_SETTINGS,
    toggleSettingControls
  };
}

export { createToggleControls };
export type { ToggleControlsDeps };
