// Change handlers for the page's remaining selects and segmented controls.
import type * as Settings from '../domain/settings';
import type { NewtabGlassStyle } from '../domain/settings';
import type { BatchedStorageArea } from '../platform/settings-storage';

interface ControlEventsState {
  storageArea: BatchedStorageArea | null;
  currentNewtabTimeFont: string;
  currentNewtabGlassStyle: NewtabGlassStyle;
}

interface ControlEventsDeps {
  newtabWidthSelect: HTMLSelectElement | null;
  handleNewtabWidthSelection(value: string): void;
  // The page's own segment buttons, until each control's view replaces them.
  newtabWidthTabButtons: Element[];
  newtabTimeFontSelect: HTMLSelectElement | null;
  SETTINGS: Pick<typeof Settings,
    'NEWTAB_GLASS_STYLE_STORAGE_KEY' | 'NEWTAB_TIME_FONT_STORAGE_KEY' | 'getNewtabTimeFont' |
    'normalizeNewtabGlassStyle' | 'normalizeNewtabTimeFont'>;
  renderNewtabTimeFontWeightControl(value: unknown): void;
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY: string;
  refreshCustomSelects(): void;
  newtabGlassStyleSelect: HTMLSelectElement | null;
  syncNewtabGlassThemeVisibility(): void;
  recentModeSelect: HTMLSelectElement | null;
  handleRecentModeSelection(value: string): void;
  recentModeTabButtons: Element[];
  optionsState: ControlEventsState;
}

function createControlEvents(deps: ControlEventsDeps): void {
  const {
    newtabWidthSelect,
    handleNewtabWidthSelection,
    newtabWidthTabButtons,
    newtabTimeFontSelect,
    SETTINGS,
    renderNewtabTimeFontWeightControl,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    refreshCustomSelects,
    newtabGlassStyleSelect,
    syncNewtabGlassThemeVisibility,
    recentModeSelect,
    handleRecentModeSelection,
    recentModeTabButtons
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;


  if (newtabWidthSelect) {
    newtabWidthSelect.addEventListener('change', () => {
      handleNewtabWidthSelection(newtabWidthSelect.value);
    });
  }
  if (newtabWidthTabButtons.length > 0) {
    newtabWidthTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleNewtabWidthSelection(button.getAttribute('data-newtab-width') || '');
      });
    });
  }
  if (newtabTimeFontSelect) {
    // Each face opens at its own default weight, as in New Tab's panel.
    newtabTimeFontSelect.addEventListener('change', () => {
      const font = SETTINGS.normalizeNewtabTimeFont(newtabTimeFontSelect.value);
      const weight = SETTINGS.getNewtabTimeFont(font).defaultWeight;
      newtabTimeFontSelect.value = font;
      optionsState.currentNewtabTimeFont = font;
      renderNewtabTimeFontWeightControl(weight);
      const storageArea = optionsState.storageArea;
      if (storageArea) {
        storageArea.set({
          [SETTINGS.NEWTAB_TIME_FONT_STORAGE_KEY]: font,
          [NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: weight
        });
      }
      refreshCustomSelects();
    });
  }
  if (newtabGlassStyleSelect) {
    newtabGlassStyleSelect.addEventListener('change', () => {
      const style = SETTINGS.normalizeNewtabGlassStyle(newtabGlassStyleSelect.value);
      newtabGlassStyleSelect.value = style;
      optionsState.currentNewtabGlassStyle = style;
      syncNewtabGlassThemeVisibility();
      const storageArea = optionsState.storageArea;
      if (storageArea) {
        storageArea.set({ [SETTINGS.NEWTAB_GLASS_STYLE_STORAGE_KEY]: style });
      }
      refreshCustomSelects();
    });
  }
  if (recentModeSelect) {
    recentModeSelect.addEventListener('change', () => {
      handleRecentModeSelection(recentModeSelect.value);
    });
  }
  if (recentModeTabButtons.length > 0) {
    recentModeTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleRecentModeSelection(button.getAttribute('data-recent-mode') || '');
      });
    });
  }
}

export { createControlEvents };
export type { ControlEventsDeps, ControlEventsState };
