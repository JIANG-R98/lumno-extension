// The recent section's heading doubles as its display mode switch. At rest it
// reads as the current mode's name; pointed at, focused or tapped it widens
// into a segmented control with the other modes to its right, so the current
// name never moves under the pointer.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export interface RecentModeOption {
  value: string;
  label: string;
}

export interface RecentModeSwitchModel {
  title: string;
  value: string;
  options: readonly RecentModeOption[];
  onChange(value: string): void;
}

const HOVER_EXPAND_DELAY_MS = 100;
const HOVER_COLLAPSE_DELAY_MS = 200;
// Matches the option width transition in styles/sections.css; the options are
// reordered once a collapse has finished, so the next expansion again starts
// from the current mode.
const COLLAPSE_SETTLE_MS = 240;

// The current mode leads; the rest keep their listed order behind it.
function orderFor(options: readonly RecentModeOption[], value: string): string[] {
  return [
    ...options.filter((option) => option.value === value),
    ...options.filter((option) => option.value !== value)
  ].map((option) => option.value);
}

function isNode(value: EventTarget | null): value is Node {
  return value !== null && 'nodeType' in value;
}

export function RecentModeSwitch({ model }: { model: RecentModeSwitchModel }) {
  const { options } = model;
  const value = options.some((option) => option.value === model.value) ? model.value : options[0].value;
  const [expanded, setExpandedState] = useState(false);
  const [order, setOrder] = useState(() => orderFor(options, value));
  const controlRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const labels = useRef(new Map<string, HTMLSpanElement>());
  const expandedRef = useRef(false);
  const expandedByHover = useRef(false);
  const pointerInside = useRef(false);
  const timers = useRef({ expand: 0, collapse: 0, settle: 0 });
  // An order change made while collapsed snaps into place without animating.
  const snapPending = useRef(false);

  const ordered = order
    .map((optionValue) => options.find((option) => option.value === optionValue))
    .filter((option): option is RecentModeOption => Boolean(option));
  // Options added since the order was set go last.
  options.forEach((option) => {
    if (!ordered.includes(option)) ordered.push(option);
  });

  const clearHoverTimers = (): void => {
    window.clearTimeout(timers.current.expand);
    window.clearTimeout(timers.current.collapse);
    timers.current.expand = 0;
    timers.current.collapse = 0;
  };

  const snapToCurrent = (): void => {
    const next = orderFor(options, value);
    if (next[0] !== order[0] || next.length !== order.length) {
      snapPending.current = true;
      setOrder(next);
    }
  };

  const setExpanded = (next: boolean): void => {
    if (expandedRef.current === next) {
      return;
    }
    expandedRef.current = next;
    window.clearTimeout(timers.current.settle);
    timers.current.settle = 0;
    setExpandedState(next);
    if (next) {
      return;
    }
    expandedByHover.current = false;
    timers.current.settle = window.setTimeout(() => {
      timers.current.settle = 0;
      if (!expandedRef.current) {
        latest.current.snapToCurrent();
      }
    }, COLLAPSE_SETTLE_MS);
  };
  // The latest handlers, for timers and the document listener set up earlier.
  const latest = useRef({ snapToCurrent, setExpanded });
  latest.current = { snapToCurrent, setExpanded };

  // A collapsed switch shows the current mode first at once; an expanded one
  // keeps its order until it collapses.
  useEffect(() => {
    if (!expandedRef.current && !timers.current.settle) {
      snapToCurrent();
    }
  });

  // Options collapse to no width, so each one is given its label's natural
  // width to grow to; a collapsed option has no padding either, so the padding
  // is read from the switch. The indicator then sits under the current mode.
  useLayoutEffect(() => {
    const control = controlRef.current;
    const indicator = indicatorRef.current;
    if (!control || !indicator) {
      return;
    }
    const snapping = snapPending.current;
    snapPending.current = false;
    if (snapping) {
      control.setAttribute('data-instant', 'true');
    }
    if (expanded) {
      const padX = parseFloat(window.getComputedStyle(control).getPropertyValue('--x-nt-recent-mode-pad-x')) || 0;
      ordered.forEach((option) => {
        const button = buttons.current.get(option.value);
        const label = labels.current.get(option.value);
        if (button && label) {
          const width = Math.ceil(label.getBoundingClientRect().width + padX * 2);
          button.style.setProperty('--x-nt-recent-mode-option-width', `${width}px`);
        }
      });
    }
    const widthOf = (optionValue: string): number => {
      const button = buttons.current.get(optionValue);
      return button
        ? parseFloat(button.style.getPropertyValue('--x-nt-recent-mode-option-width')) || button.offsetWidth
        : 0;
    };
    const activeIndex = ordered.findIndex((option) => option.value === value);
    if (activeIndex >= 0) {
      const left = ordered.slice(0, activeIndex).reduce((sum, option) => sum + widthOf(option.value), 0);
      indicator.style.width = `${widthOf(value)}px`;
      indicator.style.transform = `translateX(${left}px)`;
    }
    if (snapping) {
      void control.offsetWidth;
      control.removeAttribute('data-instant');
    }
  });

  // A touch expansion stays until the next touch lands outside the switch.
  useEffect(() => {
    const control = controlRef.current;
    if (!control) {
      return undefined;
    }
    const doc = control.ownerDocument;
    const onPointerDown = (event: PointerEvent): void => {
      if (expandedRef.current && !expandedByHover.current &&
          !(isNode(event.target) && control.contains(event.target))) {
        latest.current.setExpanded(false);
      }
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    const pending = timers.current;
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      window.clearTimeout(pending.expand);
      window.clearTimeout(pending.collapse);
      window.clearTimeout(pending.settle);
    };
  }, []);

  const hasKeyboardFocus = (): boolean => {
    const control = controlRef.current;
    const active = control ? control.ownerDocument.activeElement : null;
    return Boolean(control && active && control.contains(active) && active.matches(':focus-visible'));
  };

  const select = (optionValue: string, focus: boolean): void => {
    const button = buttons.current.get(optionValue);
    if (focus && button) {
      button.focus();
    }
    if (optionValue !== value) {
      model.onChange(optionValue);
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const key = event.key;
    if (key === 'Escape' && expandedRef.current) {
      event.preventDefault();
      setExpanded(false);
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      return;
    }
    event.preventDefault();
    setExpanded(true);
    const index = ordered.findIndex((option) => option.value === value);
    let nextIndex = index;
    if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = ordered.length - 1;
    } else {
      const step = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
      nextIndex = (index + step + ordered.length) % ordered.length;
    }
    select(ordered[nextIndex].value, true);
  };

  return (
    <div
      aria-label={model.title}
      className="x-nt-recent-mode-switch"
      data-expanded={expanded ? 'true' : 'false'}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (isNode(next) && event.currentTarget.contains(next)) {
          return;
        }
        if (!pointerInside.current) {
          setExpanded(false);
        }
      }}
      onFocus={() => {
        // Keyboard focus reveals the modes like hover does; a click's focus does not.
        if (hasKeyboardFocus()) {
          clearHoverTimers();
          setExpanded(true);
        }
      }}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => {
        if (event.pointerType !== 'mouse') {
          return;
        }
        pointerInside.current = true;
        clearHoverTimers();
        if (expandedRef.current) {
          return;
        }
        timers.current.expand = window.setTimeout(() => {
          timers.current.expand = 0;
          expandedByHover.current = true;
          latest.current.setExpanded(true);
        }, HOVER_EXPAND_DELAY_MS);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'mouse') {
          return;
        }
        pointerInside.current = false;
        clearHoverTimers();
        if (!expandedRef.current || !expandedByHover.current || hasKeyboardFocus()) {
          return;
        }
        timers.current.collapse = window.setTimeout(() => {
          timers.current.collapse = 0;
          latest.current.setExpanded(false);
        }, HOVER_COLLAPSE_DELAY_MS);
      }}
      ref={controlRef}
      role="radiogroup"
    >
      <span aria-hidden="true" className="x-nt-recent-mode-switch-indicator" ref={indicatorRef} />
      {ordered.map((option) => {
        const checked = option.value === value;
        return (
          <button
            aria-checked={checked ? 'true' : 'false'}
            className="x-nt-recent-mode-switch-option"
            data-value={option.value}
            key={option.value}
            onClick={() => {
              // A tap, or a click quicker than the hover delay, on the collapsed
              // heading only reveals the other modes.
              if (!expandedRef.current) {
                clearHoverTimers();
                setExpanded(true);
                expandedByHover.current = pointerInside.current;
                return;
              }
              select(option.value, false);
            }}
            ref={(button) => {
              if (button) buttons.current.set(option.value, button);
              else buttons.current.delete(option.value);
            }}
            role="radio"
            tabIndex={checked ? 0 : -1}
            type="button"
          >
            <span
              className="x-nt-recent-mode-switch-label"
              ref={(label) => {
                if (label) labels.current.set(option.value, label);
                else labels.current.delete(option.value);
              }}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
