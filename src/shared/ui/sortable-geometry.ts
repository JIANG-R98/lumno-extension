// Where the items of a sortable list sit, which slot the dragged item is
// over, and how far each peer slides to make room for it.

interface Point {
  x: number;
  y: number;
}

interface Slot {
  left: number;
  top: number;
  width: number;
  height: number;
}

// A column moves on the vertical axis, a row on the horizontal one; a grid
// in both.
type SortLayout = 'column' | 'row' | 'grid';

// The items' boxes in page coordinates (scroll included).
function measureSlots(items: readonly HTMLElement[], scroll: Point): Slot[] {
  return items.map((item): Slot => {
    const rect = item.getBoundingClientRect();
    return { left: rect.left + scroll.x, top: rect.top + scroll.y, width: rect.width, height: rect.height };
  });
}

function readLayout(slots: readonly Slot[]): SortLayout {
  if (slots.every((slot) => Math.abs(slot.left - slots[0].left) < 2)) {
    return 'column';
  }
  return slots.every((slot) => Math.abs(slot.top - slots[0].top) < 2) ? 'row' : 'grid';
}

// The slot whose center is nearest the dragged item's, along the layout's axis.
function getTargetIndex(slots: readonly Slot[], layout: SortLayout, fromIndex: number, center: Point): number {
  let best = fromIndex;
  let bestDistance = Infinity;
  slots.forEach((slot, index) => {
    const dx = slot.left + slot.width / 2 - center.x;
    const dy = slot.top + slot.height / 2 - center.y;
    const distance = layout === 'column' ? Math.abs(dy) : (layout === 'row' ? Math.abs(dx) : Math.hypot(dx, dy));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

// -1 or 1 when the peer at `index` steps back or forward to make room for
// an item moving from `fromIndex` to `toIndex`; 0 when it stays.
function getStep(index: number, fromIndex: number, toIndex: number): number {
  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    return -1;
  }
  if (fromIndex > toIndex && index < fromIndex && index >= toIndex) {
    return 1;
  }
  return 0;
}

// A column or row: peers slide by the moved item's size and the gap.
function getAxisShift(slots: readonly Slot[], layout: 'column' | 'row', fromIndex: number, step: number): Point {
  const moved = slots[fromIndex];
  const axisSize = layout === 'column' ? 'height' : 'width';
  const axisStart = layout === 'column' ? 'top' : 'left';
  const neighbor: Slot | undefined = slots[fromIndex + 1] || slots[fromIndex - 1];
  const gap = neighbor
    ? Math.max(0, Math.abs(neighbor[axisStart] - moved[axisStart]) -
      (neighbor[axisStart] > moved[axisStart] ? moved[axisSize] : neighbor[axisSize]))
    : 0;
  const delta = step * (moved[axisSize] + gap);
  return layout === 'column' ? { x: 0, y: delta } : { x: delta, y: 0 };
}

// Where peer `index` sits once the dragged item moves to `toIndex`.
function getShift(slots: readonly Slot[], layout: SortLayout, fromIndex: number, index: number, toIndex: number): Point {
  const step = getStep(index, fromIndex, toIndex);
  if (layout !== 'grid') {
    return getAxisShift(slots, layout, fromIndex, step);
  }
  const slotIndex = index + step;
  return { x: slots[slotIndex].left - slots[index].left, y: slots[slotIndex].top - slots[index].top };
}

export type { Point, Slot, SortLayout };
export { getShift, getTargetIndex, measureSlots, readLayout };
