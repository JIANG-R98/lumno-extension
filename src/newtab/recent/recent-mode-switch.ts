// The recent section's heading doubles as its display mode switch. At rest it reads as the
// current mode's name; pointed at, focused or tapped it widens into a segmented control
// with the other modes to its right, so the current name never moves under the pointer.
import { isElementNode } from '../../shared/dom-guards';
import type { Translate } from '../newtab-types';

const HOVER_EXPAND_DELAY_MS = 100;
const HOVER_COLLAPSE_DELAY_MS = 200;
// Matches the option width transition in styles/sections.css; the options are reordered once a
// collapse has finished so the next expansion again starts from the current mode.
const COLLAPSE_SETTLE_MS = 240;

// A display mode and the message key of its name.
interface RecentModeOption {
  value: string;
  labelKey: string;
  fallback: string;
}

interface RecentModeSwitchDeps {
  documentObj: Document;
  windowObj: Window;
  t: Translate;
  getValue(): string;
  onChange(value: string): void;
  options: readonly RecentModeOption[];
}

interface RecentModeSwitch {
  control: HTMLDivElement;
  // Shows the current mode and the page language.
  update(): void;
}

function createRecentModeSwitch(deps: RecentModeSwitchDeps): RecentModeSwitch {
  const {
    documentObj,
    windowObj,
    t,
    getValue,
    onChange,
    options
  } = deps;

  const control = documentObj.createElement('div');
  control.className = 'x-nt-recent-mode-switch';
  control.setAttribute('role', 'radiogroup');
  control.setAttribute('data-expanded', 'false');
  const indicator = documentObj.createElement('span');
  indicator.className = 'x-nt-recent-mode-switch-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  control.appendChild(indicator);

  const buttons = options.map((option) => {
    const button = documentObj.createElement('button');
    button.type = 'button';
    button.className = 'x-nt-recent-mode-switch-option';
    button.setAttribute('role', 'radio');
    button.setAttribute('data-value', option.value);
    const label = documentObj.createElement('span');
    label.className = 'x-nt-recent-mode-switch-label';
    button.appendChild(label);
    control.appendChild(button);
    return { option, button, label };
  });

  let expanded = false;
  let expandedByHover = false;
  let pointerInside = false;
  let expandTimer = 0;
  let collapseTimer = 0;
  let settleTimer = 0;

  const isMouse = (event: PointerEvent): boolean => event.pointerType === 'mouse';
  const hasKeyboardFocus = (): boolean => {
    const active = documentObj.activeElement;
    return Boolean(active && control.contains(active) && active.matches(':focus-visible'));
  };
  const getCurrentValue = (): string => {
    const value = getValue();
    return buttons.some((entry) => entry.option.value === value) ? value : options[0].value;
  };

  function clearHoverTimers(): void {
    windowObj.clearTimeout(expandTimer);
    windowObj.clearTimeout(collapseTimer);
    expandTimer = 0;
    collapseTimer = 0;
  }

  // Options collapse to no width, so each one is given its label's natural width to grow to.
  // A collapsed option has no padding either, so the padding is read from the switch.
  function measureOptionWidths(): void {
    const padX = parseFloat(windowObj.getComputedStyle(control)
      .getPropertyValue('--x-nt-recent-mode-pad-x')) || 0;
    buttons.forEach(({ button, label }) => {
      const width = Math.ceil(label.getBoundingClientRect().width + padX * 2);
      button.style.setProperty('--x-nt-recent-mode-option-width', `${width}px`);
    });
  }

  const getOptionWidth = (entry: { button: HTMLButtonElement }): number =>
    parseFloat(entry.button.style.getPropertyValue('--x-nt-recent-mode-option-width')) ||
    entry.button.offsetWidth;

  // `buttons` follows the DOM order, and every option is at full width while expanded.
  function placeIndicator(): void {
    const activeIndex = buttons.findIndex((entry) => entry.button.getAttribute('aria-checked') === 'true');
    if (activeIndex < 0) {
      return;
    }
    const left = buttons.slice(0, activeIndex).reduce((sum, entry) => sum + getOptionWidth(entry), 0);
    indicator.style.width = `${getOptionWidth(buttons[activeIndex])}px`;
    indicator.style.transform = `translateX(${left}px)`;
  }

  // The current mode leads, the rest keep their listed order behind it.
  function orderOptions(value: string): void {
    const ordered = [
      ...buttons.filter((entry) => entry.option.value === value),
      ...buttons.filter((entry) => entry.option.value !== value)
    ];
    ordered.forEach(({ button }) => control.appendChild(button));
    buttons.splice(0, buttons.length, ...ordered);
  }

  function setExpanded(next: boolean): void {
    if (expanded === next) {
      return;
    }
    expanded = next;
    windowObj.clearTimeout(settleTimer);
    settleTimer = 0;
    if (next) {
      measureOptionWidths();
      placeIndicator();
      control.setAttribute('data-expanded', 'true');
      return;
    }
    expandedByHover = false;
    control.setAttribute('data-expanded', 'false');
    settleTimer = windowObj.setTimeout(() => {
      settleTimer = 0;
      if (!expanded) {
        snapToCurrent();
      }
    }, COLLAPSE_SETTLE_MS);
  }

  // Applies an order change without animating it; only called while collapsed, where the
  // other options are hidden and the move cannot be seen.
  function snapToCurrent(): void {
    const value = getCurrentValue();
    if (buttons[0] && buttons[0].option.value === value) {
      return;
    }
    control.setAttribute('data-instant', 'true');
    orderOptions(value);
    placeIndicator();
    void control.offsetWidth;
    control.removeAttribute('data-instant');
  }

  function select(value: string | null, { focus = false }: { focus?: boolean } = {}): void {
    const entry = buttons.find((item) => item.option.value === value);
    if (!entry) {
      return;
    }
    if (focus) {
      entry.button.focus();
    }
    if (entry.option.value !== getCurrentValue()) {
      onChange(entry.option.value);
    }
    update();
  }

  function update(): void {
    const value = getCurrentValue();
    const title = t('display_mode_title', 'Display mode');
    control.setAttribute('aria-label', title);
    buttons.forEach(({ option, button, label }) => {
      const checked = option.value === value;
      label.textContent = t(option.labelKey, option.fallback);
      button.setAttribute('aria-checked', checked ? 'true' : 'false');
      button.tabIndex = checked ? 0 : -1;
    });
    if (expanded) {
      measureOptionWidths();
      placeIndicator();
      return;
    }
    if (!settleTimer) {
      snapToCurrent();
    }
  }

  control.addEventListener('pointerenter', (event) => {
    if (!isMouse(event)) {
      return;
    }
    pointerInside = true;
    clearHoverTimers();
    if (expanded) {
      return;
    }
    expandTimer = windowObj.setTimeout(() => {
      expandTimer = 0;
      expandedByHover = true;
      setExpanded(true);
    }, HOVER_EXPAND_DELAY_MS);
  });
  control.addEventListener('pointerleave', (event) => {
    if (!isMouse(event)) {
      return;
    }
    pointerInside = false;
    clearHoverTimers();
    if (!expanded || !expandedByHover || hasKeyboardFocus()) {
      return;
    }
    collapseTimer = windowObj.setTimeout(() => {
      collapseTimer = 0;
      setExpanded(false);
    }, HOVER_COLLAPSE_DELAY_MS);
  });

  control.addEventListener('click', (event) => {
    const button = isElementNode(event.target)
      ? event.target.closest('.x-nt-recent-mode-switch-option')
      : null;
    if (!button || !control.contains(button)) {
      return;
    }
    // A tap, or a click quicker than the hover delay, on the collapsed heading only reveals
    // the other modes.
    if (!expanded) {
      clearHoverTimers();
      setExpanded(true);
      expandedByHover = pointerInside;
      return;
    }
    select(button.getAttribute('data-value'));
  });

  control.addEventListener('keydown', (event) => {
    const key = event.key;
    if (key === 'Escape' && expanded) {
      event.preventDefault();
      setExpanded(false);
      return;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' &&
      key !== 'Home' && key !== 'End') {
      return;
    }
    event.preventDefault();
    setExpanded(true);
    const index = buttons.findIndex((entry) => entry.option.value === getCurrentValue());
    let nextIndex = index;
    if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = buttons.length - 1;
    } else {
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      nextIndex = (index + step + buttons.length) % buttons.length;
    }
    select(buttons[nextIndex].option.value, { focus: true });
  });

  // Keyboard focus reveals the modes like hover does; a mouse click's focus does not.
  control.addEventListener('focusin', () => {
    if (hasKeyboardFocus()) {
      clearHoverTimers();
      setExpanded(true);
    }
  });
  control.addEventListener('focusout', (event) => {
    if (isElementNode(event.relatedTarget) && control.contains(event.relatedTarget)) {
      return;
    }
    if (!pointerInside) {
      setExpanded(false);
    }
  });

  // A touch expansion stays until the next touch lands outside the switch.
  documentObj.addEventListener('pointerdown', (event) => {
    if (expanded && !expandedByHover && !(isElementNode(event.target) && control.contains(event.target))) {
      setExpanded(false);
    }
  }, true);

  update();

  return { control, update };
}

export { createRecentModeSwitch };
export type { RecentModeOption, RecentModeSwitch, RecentModeSwitchDeps };
