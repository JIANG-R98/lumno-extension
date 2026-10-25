// Change handlers for the page's remaining selects and segmented controls.

interface ControlEventsDeps {
  recentModeSelect: HTMLSelectElement | null;
  handleRecentModeSelection(value: string): void;
  // The page's own segment buttons, until each control's view replaces them.
  recentModeTabButtons: Element[];
}

function createControlEvents(deps: ControlEventsDeps): void {
  const { recentModeSelect, handleRecentModeSelection, recentModeTabButtons } = deps;

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
export type { ControlEventsDeps };
