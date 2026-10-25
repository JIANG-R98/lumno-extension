// Change handlers for the page's selects, segmented controls and toggles,
// and the buttons that open the browser's shortcut page or onboarding.
import type * as Settings from '../domain/settings';
import type { NewtabGlassStyle, NewtabOpenInNewTab, NewtabOpenInNewTabSurface } from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import * as LumnoMessaging from '../platform/messaging';
import type { BatchedStorageArea } from '../platform/settings-storage';
import type { GetMessage } from './options-types';

const NEWTAB_OPEN_IN_NEW_TAB_SURFACES: readonly NewtabOpenInNewTabSurface[] = ['search', 'shortcuts', 'bookmarks', 'recentSites'];

// The New Tab surface a switch is for, by its data attribute.
function readOpenInNewTabSurface(input: Element): NewtabOpenInNewTabSurface | null {
  const value = input.getAttribute('data-newtab-open-in-new-tab-surface');
  return NEWTAB_OPEN_IN_NEW_TAB_SURFACES.find((surface) => surface === value) || null;
}

interface ControlEventsState {
  storageArea: BatchedStorageArea | null;
  currentNewtabTimeFont: string;
  currentOverlayFontFamily: string;
  currentOverlayFontFallback: string;
  currentOverlayFontLabels: Record<string, string>;
  currentNewtabGlassStyle: NewtabGlassStyle;
}

interface ControlEventsDeps {
  languageSelect: HTMLSelectElement | null;
  applyLanguageMode(mode: string, options?: { persist?: boolean }): unknown;
  newtabWidthSelect: HTMLSelectElement | null;
  handleNewtabWidthSelection(value: string): void;
  // The page's own segment buttons, until each control's view replaces them.
  newtabWidthTabButtons: Element[];
  overlaySizeTabButtons: Element[];
  handleOverlaySizeSelection(value: string): void;
  overlayEnterAnimationTabButtons: Element[];
  handleOverlayEnterAnimationSelection(value: string): void;
  newtabTimeFontSelect: HTMLSelectElement | null;
  SETTINGS: Pick<typeof Settings,
    'NEWTAB_GLASS_STYLE_STORAGE_KEY' | 'NEWTAB_TIME_FONT_STORAGE_KEY' | 'getNewtabTimeFont' |
    'normalizeNewtabGlassStyle' | 'normalizeNewtabOpenInNewTab' | 'normalizeNewtabTimeFont' |
    'normalizeOverlayFontFamily' | 'normalizeOverlayFontLabels'>;
  renderNewtabTimeFontWeightControl(value: unknown): void;
  NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY: string;
  refreshCustomSelects(): void;
  overlayFontSelect: HTMLSelectElement | null;
  OVERLAY_FONT_FAMILY_STORAGE_KEY: string;
  overlayFontFallbackSelect: HTMLSelectElement | null;
  OVERLAY_FONT_FALLBACK_STORAGE_KEY: string;
  localStorageArea: StorageAreaLike | null;
  OVERLAY_FONT_LABELS_STORAGE_KEY: string;
  newtabGlassStyleSelect: HTMLSelectElement | null;
  syncNewtabGlassThemeVisibility(): void;
  recentModeSelect: HTMLSelectElement | null;
  handleRecentModeSelection(value: string): void;
  recentModeTabButtons: Element[];
  newtabOpenInNewTabToggles: HTMLInputElement[];
  setOptionsToggleState(input: HTMLInputElement | null, checked: boolean, disabled?: boolean): void;
  NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY: string;
  restrictedActionSelect: HTMLSelectElement | null;
  handleRestrictedActionSelection(value: string): void;
  restrictedActionTabButtons: Element[];
  showToast(message: string, isError?: boolean): void;
  getMessage: GetMessage;
  openShortcutsPageButton: HTMLElement | null;
  openOnboardingPageButton: HTMLElement | null;
  refreshOptionsSelectItems(select: HTMLSelectElement): void;
  renderOverlayFontMissingNotices(): void;
  optionsState: ControlEventsState;
}

function createControlEvents(deps: ControlEventsDeps) {
  const {
    languageSelect,
    applyLanguageMode,
    newtabWidthSelect,
    handleNewtabWidthSelection,
    newtabWidthTabButtons,
    overlaySizeTabButtons,
    handleOverlaySizeSelection,
    overlayEnterAnimationTabButtons,
    handleOverlayEnterAnimationSelection,
    newtabTimeFontSelect,
    SETTINGS,
    renderNewtabTimeFontWeightControl,
    NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
    refreshCustomSelects,
    overlayFontSelect,
    OVERLAY_FONT_FAMILY_STORAGE_KEY,
    overlayFontFallbackSelect,
    OVERLAY_FONT_FALLBACK_STORAGE_KEY,
    localStorageArea,
    OVERLAY_FONT_LABELS_STORAGE_KEY,
    newtabGlassStyleSelect,
    syncNewtabGlassThemeVisibility,
    recentModeSelect,
    handleRecentModeSelection,
    recentModeTabButtons,
    newtabOpenInNewTabToggles,
    setOptionsToggleState,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY,
    restrictedActionSelect,
    handleRestrictedActionSelection,
    restrictedActionTabButtons,
    showToast,
    getMessage,
    openShortcutsPageButton,
    openOnboardingPageButton,
    refreshOptionsSelectItems,
    renderOverlayFontMissingNotices
  } = deps;

  // The page state object shared with options.js and the other modules.
  const optionsState = deps.optionsState;

  if (languageSelect) {
    languageSelect.addEventListener('change', () => {
      const next = languageSelect.value || 'system';
      applyLanguageMode(next, { persist: true });
    });
  }

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
  if (overlaySizeTabButtons.length > 0) {
    overlaySizeTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleOverlaySizeSelection(button.getAttribute('data-overlay-size') || '');
      });
    });
  }
  if (overlayEnterAnimationTabButtons.length > 0) {
    overlayEnterAnimationTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleOverlayEnterAnimationSelection(button.getAttribute('data-overlay-enter-animation') || '');
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
  // Both font rows persist a family, with its display name beside it, and
  // rebuild their menu list afterwards.
  const fontRows: Array<[HTMLSelectElement | null, string, (family: string) => void]> = [
    [overlayFontSelect, OVERLAY_FONT_FAMILY_STORAGE_KEY, (family) => { optionsState.currentOverlayFontFamily = family; }],
    [overlayFontFallbackSelect, OVERLAY_FONT_FALLBACK_STORAGE_KEY,
      (family) => { optionsState.currentOverlayFontFallback = family; }]
  ];
  fontRows.forEach(([select, key, remember]) => {
    if (!select) {
      return;
    }
    select.addEventListener('change', () => {
      const family = SETTINGS.normalizeOverlayFontFamily(select.value);
      const chosenOption = select.selectedOptions[0];
      select.value = family;
      remember(family);
      optionsState.currentOverlayFontLabels = SETTINGS.normalizeOverlayFontLabels(
        family && chosenOption
          ? { ...optionsState.currentOverlayFontLabels, [family]: chosenOption.textContent || family }
          : optionsState.currentOverlayFontLabels,
        [optionsState.currentOverlayFontFamily, optionsState.currentOverlayFontFallback]
      );
      if (localStorageArea) {
        localStorageArea.set({ [key]: family, [OVERLAY_FONT_LABELS_STORAGE_KEY]: optionsState.currentOverlayFontLabels });
      }
      refreshOptionsSelectItems(select);
      renderOverlayFontMissingNotices();
    });
  });
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
  function setNewtabOpenInNewTabState(value: unknown): void {
    const normalized: NewtabOpenInNewTab = SETTINGS.normalizeNewtabOpenInNewTab(value);
    newtabOpenInNewTabToggles.forEach((input) => {
      const surface = readOpenInNewTabSurface(input);
      setOptionsToggleState(input, surface ? normalized[surface] : false);
    });
  }
  newtabOpenInNewTabToggles.forEach((input) => {
    input.addEventListener('change', () => {
      const next: Partial<NewtabOpenInNewTab> = {};
      newtabOpenInNewTabToggles.forEach((item) => {
        const surface = readOpenInNewTabSurface(item);
        if (surface) {
          next[surface] = item.checked;
        }
      });
      const normalized = SETTINGS.normalizeNewtabOpenInNewTab(next);
      setNewtabOpenInNewTabState(normalized);
      const storageArea = optionsState.storageArea;
      if (!storageArea) {
        return;
      }
      storageArea.set({ [NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY]: normalized });
    });
  });

  if (restrictedActionSelect) {
    restrictedActionSelect.addEventListener('change', () => {
      handleRestrictedActionSelection(restrictedActionSelect.value);
    });
  }
  if (restrictedActionTabButtons.length > 0) {
    restrictedActionTabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        handleRestrictedActionSelection(button.getAttribute('data-restricted-action') || '');
      });
    });
  }

  function openExtensionShortcutsPage(): void {
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'openExtensionShortcutsPage' }, (response) => {
      if (chrome.runtime.lastError) {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        return;
      }
      if (!response || response.ok === false) {
        showToast(getMessage('toast_error', '操作失败，请重试。'), true);
      }
    });
  }
  if (openShortcutsPageButton) {
    openShortcutsPageButton.addEventListener('click', openExtensionShortcutsPage);
  }
  if (openOnboardingPageButton) {
    openOnboardingPageButton.addEventListener('click', () => {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'openOnboardingPage' }, (response) => {
        if (chrome.runtime.lastError) {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          return;
        }
        if (!response || response.ok === false) {
          showToast(getMessage('toast_error', '操作失败，请重试。'), true);
        }
      });
    });
  }

  return {
    setNewtabOpenInNewTabState
  };
}

export { createControlEvents };
export type { ControlEventsDeps, ControlEventsState };
