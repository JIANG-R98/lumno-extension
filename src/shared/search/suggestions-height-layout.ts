const HEIGHT_LAYOUT_ATTRIBUTES = Object.freeze([
  'data-height-clipped',
  'data-input-height-locked',
  'data-resizing'
]);
const HEIGHT_LAYOUT_PROPERTIES = Object.freeze([
  'flex',
  'height',
  'overflow',
  'overflow-x',
  'overflow-y',
  'padding-top',
  'padding-bottom',
  'transition',
  'will-change'
]);

// The suggestions container, or a test double with the members used here.
interface HeightLayoutTarget {
  style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>;
  removeAttribute(name: string): void;
}

// Drops the height animation state so the list takes its natural height at
// once; false when there is no container to change.
function applyNaturalSuggestionsHeightLayout(container: HeightLayoutTarget | null | undefined): boolean {
  if (!container) {
    return false;
  }
  HEIGHT_LAYOUT_ATTRIBUTES.forEach((attribute) => {
    container.removeAttribute(attribute);
  });
  HEIGHT_LAYOUT_PROPERTIES.forEach((property) => {
    container.style.removeProperty(property);
  });
  container.style.setProperty('transition', 'none', 'important');
  return true;
}

// While a query's search engine suggestions are on their way, the list
// keeps the height it has: its rows change, but it does not shrink to the
// local rows and grow back on every key (#120). The query's full answer, a
// collapse or a timeout lets it go; the list can always grow.
interface HeldHeight {
  value: string;
  timer: number;
}

type HoldTimers = Pick<Window, 'setTimeout' | 'clearTimeout'>;

const DEFAULT_MAX_HOLD_MS = 1000;
const heldHeights = new WeakMap<HTMLElement, HeldHeight>();

function holdSuggestionsHeight(
  container: HTMLElement | null | undefined,
  timers: HoldTimers,
  maxHoldMs: number = DEFAULT_MAX_HOLD_MS
): boolean {
  if (!container) {
    return false;
  }
  releaseSuggestionsHeight(container, timers);
  const height = container.offsetHeight;
  if (!(height > 0)) {
    return false;
  }
  const value = `${height}px`;
  container.style.setProperty('min-height', value);
  const timer = timers.setTimeout(() => {
    releaseSuggestionsHeight(container, timers);
  }, maxHoldMs);
  heldHeights.set(container, { value, timer });
  return true;
}

// Leaves a min-height someone else set since (a collapse's 0px) alone.
function releaseSuggestionsHeight(container: HTMLElement | null | undefined, timers: HoldTimers): boolean {
  const held = container ? heldHeights.get(container) : undefined;
  if (!container || !held) {
    return false;
  }
  heldHeights.delete(container);
  timers.clearTimeout(held.timer);
  if (container.style.getPropertyValue('min-height') === held.value) {
    container.style.removeProperty('min-height');
  }
  return true;
}

export type { HeightLayoutTarget, HoldTimers };
export { applyNaturalSuggestionsHeightLayout, holdSuggestionsHeight, releaseSuggestionsHeight };
