// The options a select menu offers, and how the menu reads them: filtering,
// keyboard steps over enabled options, and the lengths and font previews
// its styles take.
import type { RemixIconName } from '../../ui/remix-icon';

interface SelectMenuOption {
  action?: string;
  /** Short tag after the label in the menu (for example "Beta"); not shown on the trigger. */
  badge?: string;
  /** Toggles `checked` through `onCheckedChange` and keeps the menu open, for picking several values. */
  checkbox?: boolean;
  checked?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  /** Renders the label in this family, so a font picker previews each face. */
  fontFamily?: string;
  groupTitle?: string;
  iconName?: RemixIconName;
  /** Image icon (for example a site tile); takes precedence over `iconName`. */
  iconUrl?: string;
  label: string;
  radio?: boolean;
  /** Icon after a radio choice's label (for example an eyedropper); checked or not. */
  trailingIconName?: RemixIconName;
  value: string;
}

function filterOptions(
  options: SelectMenuOption[],
  query: string
): SelectMenuOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return options;
  }
  return options.filter((option) =>
    option.label.toLowerCase().includes(needle) ||
    option.value.toLowerCase().includes(needle)
  );
}

// Quoted so families such as "3270 Nerd Font" parse; a face the device lacks
// falls back to the menu's own stack rather than the browser default.
function getFontPreviewFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '\\$&')}", var(--lumno-font-sans, sans-serif)`;
}

// Options that pick the menu's value, not actions or checkboxes.
function isValueOption(option: SelectMenuOption): boolean {
  return !option.action && !option.checkbox;
}

// The next enabled option from `currentIndex` in the direction of `delta`,
// wrapping around; -1 starts before the first.
function findNextEnabledOptionIndex(
  options: SelectMenuOption[],
  currentIndex: number,
  delta: number
): number {
  if (!options.length) {
    return currentIndex;
  }
  const startIndex = currentIndex < 0
    ? (delta > 0 ? -1 : 0)
    : currentIndex;
  for (let step = 1; step <= options.length; step += 1) {
    const nextIndex = (
      startIndex + (delta * step) + options.length
    ) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }
  return currentIndex;
}

function toCssLength(value: number | string | undefined, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }
  const text = String(value ?? '').trim();
  return text || fallback;
}

export type { SelectMenuOption };
export { filterOptions, findNextEnabledOptionIndex, getFontPreviewFamily, isValueOption, toCssLength };
