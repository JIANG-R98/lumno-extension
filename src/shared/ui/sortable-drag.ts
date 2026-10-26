import { closestHtmlElement } from '../dom-lookup';
// Pointer-driven reordering shared by Settings lists, chip rows and the search
// scope panel. The dragged item follows the pointer and its peers slide into
// the slots they would take, using transforms only, so a framework that owns
// the DOM (React) never sees a node move. The two peers beside the open slot
// lean apart to make room for it, as on the New Tab's bookmark bar. On drop
// the item glides into its slot, and then the host gets one
// `onReorder(item, fromIndex, toIndex, peers)` call and re-renders.
const DEFAULT_THRESHOLD_PX = 5;
const AUTO_SCROLL_EDGE_PX = 40;
const AUTO_SCROLL_MAX_STEP_PX = 14;
const MOTION_MS = 180;
const MOTION_EASE = 'cubic-bezier(0.2, 0, 0, 1)';
// How far the peers beside the open slot lean away from it: sideways in a
// row or grid, less in a column, whose rows sit closer together.
const GAP_LEAN_PX = 6;
const GAP_LEAN_COLUMN_PX = 3;
const SHIFT_TRANSITION = `transform ${MOTION_MS}ms ${MOTION_EASE}, translate ${MOTION_MS}ms ${MOTION_EASE}`;
// The dragged item's lift (its shadow, and the scale of a lifted tile) eases
// in and out; its position follows the pointer directly.
const LIFT_TRANSITION = ['box-shadow', 'filter', 'scale', 'background-color']
  .map((prop) => `${prop} ${MOTION_MS}ms ease`)
  .join(', ');
const SETTLE_TRANSITION = `transform ${MOTION_MS}ms ${MOTION_EASE}, ${LIFT_TRANSITION}`;
// Controls inside an item keep their own pointer behavior. An item that is
// itself a button (a panel tile) still drags.
const IGNORE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'a[href]',
  'button',
  '[role="button"]',
  '[contenteditable="true"]',
  '[data-sort-ignore]'
].join(',');

interface SortableDragOptions {
  // Which descendants of the container drag.
  itemSelector: string;
  // The items the dragged one moves among, in order (including itself).
  getPeers(item: HTMLElement): Array<HTMLElement | null | undefined>;
  // Return false to leave this press alone.
  canStart?(item: HTMLElement, event: PointerEvent): boolean;
  onStart?(item: HTMLElement, peers: HTMLElement[]): void;
  onReorder?(item: HTMLElement, fromIndex: number, toIndex: number, peers: HTMLElement[]): void;
  onEnd?(item: HTMLElement): void;
  // How far the pointer moves before a press becomes a drag.
  threshold?: number;
}

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

// A style property's value and priority before the drag.
type SavedStyle = [property: string, value: string, priority: string];

interface PendingDrag {
  item: HTMLElement;
  x: number;
  y: number;
  // Synthetic mouse events carry none.
  pointerId: number | undefined;
}

interface DragState {
  item: HTMLElement;
  peers: HTMLElement[];
  slots: Slot[];
  fromIndex: number;
  toIndex: number;
  scroller: Element | null;
  layout: 'column' | 'row' | 'grid';
  startPointer: Point;
  pointer: Point;
  bodyUserSelect: string;
  previous: SavedStyle[][];
  rendered?: boolean;
}

// A released item on its way into its slot; the drop lands once it is there.
interface Settling {
  state: DragState;
  commit: boolean;
  timer: number;
}

function isNode(value: EventTarget | null): value is Node {
  return value !== null && 'nodeType' in value && typeof value.nodeType === 'number';
}

// nodeType 1 is an element, in whichever window the node belongs to.
function isElement(value: EventTarget | null): value is Element {
  return isNode(value) && value.nodeType === 1;
}

function isScrollable(element: Element, win: Window): boolean {
  const style = win.getComputedStyle(element);
  return /(auto|scroll|overlay)/.test(style.overflowY) &&
    element.scrollHeight > element.clientHeight + 1;
}

function findScrollParent(element: Element, win: Window): Element | null {
  let current = element.parentElement;
  while (current) {
    if (isScrollable(current, win)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

// Written as !important so surfaces whose items reset everything with
// `all: unset !important` (the search scope panel) still move.
const STYLE_PROPS = ['transform', 'translate', 'transition', 'z-index', 'position'];

function saveStyles(element: HTMLElement): SavedStyle[] {
  return STYLE_PROPS.map((prop): SavedStyle => [
    prop,
    element.style.getPropertyValue(prop),
    element.style.getPropertyPriority(prop)
  ]);
}

function restoreStyles(element: HTMLElement, saved: SavedStyle[]): void {
  saved.forEach(([prop, value, priority]) => {
    if (prop === 'transition') {
      return;
    }
    if (value) {
      element.style.setProperty(prop, value, priority);
    } else {
      element.style.removeProperty(prop);
    }
  });
}

function setImportant(element: HTMLElement, prop: string, value: string): void {
  if (value) {
    element.style.setProperty(prop, value, 'important');
  } else {
    element.style.removeProperty(prop);
  }
}

function isPresent<T>(value: T | null | undefined): value is T {
  return Boolean(value);
}

function toTranslate({ x, y }: Point): string {
  return x || y ? `translate(${x}px, ${y}px)` : '';
}

function prefersReducedMotion(win: Window): boolean {
  return typeof win.matchMedia === 'function' && win.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Makes the container's items draggable; returns the function that stops it.
function attach(container: HTMLElement | null | undefined, options: SortableDragOptions): () => void {
  const doc = container ? container.ownerDocument : null;
  const view = doc ? doc.defaultView : null;
  if (!container || !doc || !view) {
    return () => {};
  }
  const host = container;
  const page = doc;
  const win = view;
  const settings = options;
  const threshold = typeof settings.threshold === 'number' && Number.isFinite(settings.threshold)
    ? settings.threshold
    : DEFAULT_THRESHOLD_PX;
  let pending: PendingDrag | null = null;
  let drag: DragState | null = null;
  let settling: Settling | null = null;
  let frame = 0;

  function getScroll(scroller: Element | null): Point {
    return {
      x: win.scrollX + (scroller ? scroller.scrollLeft : 0),
      y: win.scrollY + (scroller ? scroller.scrollTop : 0)
    };
  }

  function findItem(target: EventTarget | null): HTMLElement | null {
    const element = isElement(target) ? target : (isNode(target) ? target.parentElement : null);
    const item = element ? closestHtmlElement(element, settings.itemSelector) : null;
    if (!element || !item || !host.contains(item)) {
      return null;
    }
    const control = element.closest(IGNORE_SELECTOR);
    if (control && control !== item && item.contains(control)) {
      return null;
    }
    return item;
  }

  function handlePointerDown(event: PointerEvent): void {
    if (drag || settling || event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const item = findItem(event.target);
    if (!item || (typeof settings.canStart === 'function' && !settings.canStart(item, event))) {
      return;
    }
    pending = { item, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    win.addEventListener('pointermove', handlePointerMove, true);
    win.addEventListener('pointerup', handlePointerUp, true);
    win.addEventListener('pointercancel', handlePointerCancel, true);
    win.addEventListener('keydown', handleKeyDown, true);
  }

  function begin(event: PointerEvent, start: PendingDrag): DragState | null {
    const item = start.item;
    const peers = typeof settings.getPeers === 'function'
      ? settings.getPeers(item).filter(isPresent)
      : [];
    const fromIndex = peers.indexOf(item);
    if (peers.length < 2 || fromIndex < 0) {
      return null;
    }
    const scroller = findScrollParent(item, win);
    const scroll = getScroll(scroller);
    const slots = peers.map((peer): Slot => {
      const rect = peer.getBoundingClientRect();
      return {
        left: rect.left + scroll.x,
        top: rect.top + scroll.y,
        width: rect.width,
        height: rect.height
      };
    });
    const sameLeft = slots.every((slot) => Math.abs(slot.left - slots[0].left) < 2);
    const sameTop = slots.every((slot) => Math.abs(slot.top - slots[0].top) < 2);
    const state: DragState = {
      item,
      peers,
      slots,
      fromIndex,
      toIndex: fromIndex,
      scroller,
      layout: sameLeft ? 'column' : (sameTop ? 'row' : 'grid'),
      startPointer: { x: start.x + scroll.x, y: start.y + scroll.y },
      pointer: { x: event.clientX, y: event.clientY },
      bodyUserSelect: page.body ? page.body.style.userSelect : '',
      previous: peers.map(saveStyles)
    };
    peers.forEach((peer) => {
      if (peer !== item) {
        setImportant(peer, 'transition', SHIFT_TRANSITION);
      }
    });
    setImportant(item, 'transition', LIFT_TRANSITION);
    setImportant(item, 'z-index', '20');
    if (win.getComputedStyle(item).position === 'static') {
      setImportant(item, 'position', 'relative');
    }
    item.setAttribute('data-sort-dragging', 'true');
    host.setAttribute('data-sort-active', 'true');
    if (page.body) {
      page.body.style.userSelect = 'none';
    }
    const selection = win.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    if (typeof settings.onStart === 'function') {
      settings.onStart(item, peers);
    }
    return state;
  }

  function getTargetIndex(state: DragState, center: Point): number {
    let best = state.fromIndex;
    let bestDistance = Infinity;
    state.slots.forEach((slot, index) => {
      const dx = slot.left + slot.width / 2 - center.x;
      const dy = slot.top + slot.height / 2 - center.y;
      const distance = state.layout === 'column'
        ? Math.abs(dy)
        : (state.layout === 'row' ? Math.abs(dx) : Math.hypot(dx, dy));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return best;
  }

  // Where peer `index` sits once the dragged item moves to `toIndex`.
  function getShift(state: DragState, index: number, toIndex: number): Point {
    const { fromIndex, slots, layout } = state;
    const moved = slots[fromIndex];
    if (layout === 'column' || layout === 'row') {
      const axisSize = layout === 'column' ? 'height' : 'width';
      const axisStart = layout === 'column' ? 'top' : 'left';
      const neighbor: Slot | undefined = slots[fromIndex + 1] || slots[fromIndex - 1];
      const gap = neighbor
        ? Math.max(0, Math.abs(neighbor[axisStart] - moved[axisStart]) -
          (neighbor[axisStart] > moved[axisStart] ? moved[axisSize] : neighbor[axisSize]))
        : 0;
      const step = moved[axisSize] + gap;
      let delta = 0;
      if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
        delta = -step;
      } else if (fromIndex > toIndex && index < fromIndex && index >= toIndex) {
        delta = step;
      }
      return layout === 'column' ? { x: 0, y: delta } : { x: delta, y: 0 };
    }
    let slotIndex = index;
    if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
      slotIndex = index - 1;
    } else if (fromIndex > toIndex && index < fromIndex && index >= toIndex) {
      slotIndex = index + 1;
    }
    return {
      x: slots[slotIndex].left - slots[index].left,
      y: slots[slotIndex].top - slots[index].top
    };
  }

  // Where the dragged item comes to rest in slot `toIndex`, from its own slot.
  function getRestingOffset(state: DragState, toIndex: number): Point {
    const { fromIndex, slots, layout } = state;
    const moved = slots[fromIndex];
    const target = slots[toIndex];
    if (layout === 'grid') {
      return { x: target.left - moved.left, y: target.top - moved.top };
    }
    const axisSize = layout === 'column' ? 'height' : 'width';
    const axisStart = layout === 'column' ? 'top' : 'left';
    // Moving later, its far edge lines up with the far edge of the slot.
    const start = toIndex > fromIndex
      ? target[axisStart] + target[axisSize] - moved[axisSize]
      : target[axisStart];
    const delta = start - moved[axisStart];
    return layout === 'column' ? { x: 0, y: delta } : { x: delta, y: 0 };
  }

  // Leans the peers that end up on either side of slot `toIndex` away from
  // it, and lets every other peer rest. In a grid, only those on its line.
  function leanAround(state: DragState, toIndex: number): void {
    const { item, peers, slots, layout } = state;
    const order = peers.filter((peer) => peer !== item);
    order.splice(toIndex, 0, item);
    const lean = layout === 'column' ? GAP_LEAN_COLUMN_PX : GAP_LEAN_PX;
    const onLine = (index: number) => layout !== 'grid' || Math.abs(slots[index].top - slots[toIndex].top) < 2;
    const leaning = new Map<HTMLElement, number>();
    if (toIndex > 0 && onLine(toIndex - 1)) {
      leaning.set(order[toIndex - 1], -lean);
    }
    if (toIndex < order.length - 1 && onLine(toIndex + 1)) {
      leaning.set(order[toIndex + 1], lean);
    }
    peers.forEach((peer) => {
      if (peer === item) {
        return;
      }
      const offset = leaning.get(peer) || 0;
      setImportant(peer, 'translate', !offset ? '' : (layout === 'column' ? `0px ${offset}px` : `${offset}px 0px`));
    });
  }

  function render(): void {
    const state = drag;
    if (!state) {
      return;
    }
    const scroll = getScroll(state.scroller);
    const dx = state.pointer.x + scroll.x - state.startPointer.x;
    const dy = state.pointer.y + scroll.y - state.startPointer.y;
    const moved = state.slots[state.fromIndex];
    const center = {
      x: moved.left + moved.width / 2 + dx,
      y: moved.top + moved.height / 2 + dy
    };
    const constrainedDx = state.layout === 'column' ? 0 : dx;
    const constrainedDy = state.layout === 'row' ? 0 : dy;
    setImportant(state.item, 'transform', `translate(${constrainedDx}px, ${constrainedDy}px)`);
    const toIndex = getTargetIndex(state, center);
    if (toIndex !== state.toIndex || !state.rendered) {
      state.toIndex = toIndex;
      state.rendered = true;
      state.peers.forEach((peer, index) => {
        if (peer === state.item) {
          return;
        }
        setImportant(peer, 'transform', toTranslate(getShift(state, index, toIndex)));
      });
      leanAround(state, toIndex);
    }
  }

  function autoScroll(): void {
    frame = 0;
    const state = drag;
    if (!state) {
      return;
    }
    const bounds = state.scroller
      ? state.scroller.getBoundingClientRect()
      : { top: 0, bottom: win.innerHeight };
    const { y } = state.pointer;
    let step = 0;
    if (y < bounds.top + AUTO_SCROLL_EDGE_PX) {
      step = -Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (bounds.top + AUTO_SCROLL_EDGE_PX - y) / AUTO_SCROLL_EDGE_PX));
    } else if (y > bounds.bottom - AUTO_SCROLL_EDGE_PX) {
      step = Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (y - bounds.bottom + AUTO_SCROLL_EDGE_PX) / AUTO_SCROLL_EDGE_PX));
    }
    if (step) {
      if (state.scroller) {
        state.scroller.scrollTop += step;
      } else {
        win.scrollBy(0, step);
      }
      render();
      frame = win.requestAnimationFrame(autoScroll);
    }
  }

  function handlePointerMove(event: PointerEvent): void {
    const start = pending;
    if (!start || (start.pointerId !== undefined && event.pointerId !== start.pointerId)) {
      return;
    }
    let state = drag;
    if (!state) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < threshold) {
        return;
      }
      state = begin(event, start);
      if (!state) {
        stop();
        return;
      }
      drag = state;
    }
    event.preventDefault();
    state.pointer = { x: event.clientX, y: event.clientY };
    render();
    if (!frame) {
      frame = win.requestAnimationFrame(autoScroll);
    }
  }

  function suppressNextClick(): void {
    const swallow = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    win.addEventListener('click', swallow, { capture: true, once: true });
    // The click that ends a drag fires right after pointerup; nothing later.
    win.setTimeout(() => win.removeEventListener('click', swallow, true), 0);
  }

  // Lets go of the dragged item: it glides into the slot it was dropped on
  // (its own when the drag is cancelled) and its peers settle, and then the
  // drop lands.
  function release(commit: boolean): void {
    const current = drag;
    stop();
    if (!current) {
      return;
    }
    const toIndex = commit ? current.toIndex : current.fromIndex;
    current.peers.forEach((peer, index) => {
      setImportant(peer, 'translate', '');
      if (peer !== current.item) {
        setImportant(peer, 'transform', toTranslate(getShift(current, index, toIndex)));
      }
    });
    setImportant(current.item, 'transition', SETTLE_TRANSITION);
    setImportant(current.item, 'transform', toTranslate(getRestingOffset(current, toIndex)));
    current.item.removeAttribute('data-sort-dragging');
    host.removeAttribute('data-sort-active');
    if (page.body) {
      page.body.style.userSelect = current.bodyUserSelect;
    }
    suppressNextClick();
    settling = { state: current, commit, timer: 0 };
    if (prefersReducedMotion(win)) {
      settle();
    } else {
      settling.timer = win.setTimeout(settle, MOTION_MS);
    }
  }

  function settle(): void {
    const done = settling;
    settling = null;
    if (!done) {
      return;
    }
    win.clearTimeout(done.timer);
    const current = done.state;
    current.peers.forEach((peer, index) => {
      const previous = current.previous[index];
      setImportant(peer, 'transition', 'none');
      restoreStyles(peer, previous);
      // Restore the author's transition after this frame so nothing animates
      // back from the drag offset.
      win.requestAnimationFrame(() => {
        const saved = previous.find(([prop]) => prop === 'transition');
        if (saved && saved[1]) {
          peer.style.setProperty('transition', saved[1], saved[2]);
        } else {
          peer.style.removeProperty('transition');
        }
      });
    });
    if (done.commit && current.toIndex !== current.fromIndex &&
        typeof settings.onReorder === 'function') {
      settings.onReorder(current.item, current.fromIndex, current.toIndex, current.peers);
    }
    if (typeof settings.onEnd === 'function') {
      settings.onEnd(current.item);
    }
  }

  function stop(): void {
    pending = null;
    win.removeEventListener('pointermove', handlePointerMove, true);
    win.removeEventListener('pointerup', handlePointerUp, true);
    win.removeEventListener('pointercancel', handlePointerCancel, true);
    win.removeEventListener('keydown', handleKeyDown, true);
    if (frame) {
      win.cancelAnimationFrame(frame);
      frame = 0;
    }
    drag = null;
  }

  function handlePointerUp(event: PointerEvent): void {
    const state = drag;
    if (!state) {
      stop();
      return;
    }
    state.pointer = { x: event.clientX, y: event.clientY };
    render();
    release(true);
  }

  function handlePointerCancel(): void {
    if (drag) {
      release(false);
    } else {
      stop();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      event.stopPropagation();
      release(false);
    }
  }

  // A favicon or link inside an item would otherwise start a native drag,
  // which cancels the pointer stream.
  function handleNativeDragStart(event: DragEvent): void {
    if (pending || drag) {
      event.preventDefault();
    }
  }

  host.addEventListener('pointerdown', handlePointerDown);
  host.addEventListener('dragstart', handleNativeDragStart);
  return function detach() {
    if (drag) {
      release(false);
    } else {
      stop();
    }
    settle();
    host.removeEventListener('pointerdown', handlePointerDown);
    host.removeEventListener('dragstart', handleNativeDragStart);
  };
}

export type { SortableDragOptions };
export { attach };
