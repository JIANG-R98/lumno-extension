import { closestHtmlElement } from '../dom-lookup';
import { getGapNeighbours, getRestingOffset, getShift, getTargetIndex, measureSlots, readLayout } from './sortable-geometry';
import type { Point, Slot, SortLayout } from './sortable-geometry';
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
  layout: SortLayout;
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

// Leans the peers that end up on either side of slot `toIndex` away from
// it, and lets every other peer rest.
function leanAround(state: DragState, toIndex: number): void {
  const { item, peers, slots, layout } = state;
  const lean = layout === 'column' ? GAP_LEAN_COLUMN_PX : GAP_LEAN_PX;
  const neighbours = getGapNeighbours(slots, layout, state.fromIndex, toIndex);
  peers.forEach((peer, index) => {
    if (peer === item) {
      return;
    }
    const offset = (neighbours.get(index) || 0) * lean;
    setImportant(peer, 'translate', !offset ? '' : (layout === 'column' ? `0px ${offset}px` : `${offset}px 0px`));
  });
}

// Lifts the dragged item above its peers and lets them slide; returns the
// styles to put back.
function liftForDrag(item: HTMLElement, peers: readonly HTMLElement[], win: Window): SavedStyle[][] {
  const previous = peers.map(saveStyles);
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
  return previous;
}

// Puts the peers' styles back; their own transition returns after this
// frame so nothing animates back from the drag offset.
function settleAfterDrag(peers: readonly HTMLElement[], previous: SavedStyle[][], win: Window): void {
  peers.forEach((peer, index) => {
    const saved = previous[index];
    setImportant(peer, 'transition', 'none');
    restoreStyles(peer, saved);
    win.requestAnimationFrame(() => {
      const transition = saved.find(([prop]) => prop === 'transition');
      if (transition && transition[1]) {
        peer.style.setProperty('transition', transition[1], transition[2]);
      } else {
        peer.style.removeProperty('transition');
      }
    });
  });
}

// How far to scroll this frame while the pointer is near the top or the
// bottom edge.
function readAutoScrollStep(y: number, bounds: { top: number; bottom: number }): number {
  if (y < bounds.top + AUTO_SCROLL_EDGE_PX) {
    return -Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (bounds.top + AUTO_SCROLL_EDGE_PX - y) / AUTO_SCROLL_EDGE_PX));
  }
  if (y > bounds.bottom - AUTO_SCROLL_EDGE_PX) {
    return Math.ceil(AUTO_SCROLL_MAX_STEP_PX * Math.min(1, (y - bounds.bottom + AUTO_SCROLL_EDGE_PX) / AUTO_SCROLL_EDGE_PX));
  }
  return 0;
}

// One container's drag: a press waiting to become a drag, then the drag
// with its peers, and the frame that scrolls near the edges.
class SortableDrag {
  private pending: PendingDrag | null = null;
  private drag: DragState | null = null;
  private settling: Settling | null = null;
  private frame = 0;
  private readonly host: HTMLElement;
  private readonly page: Document;
  private readonly win: Window;
  private readonly settings: SortableDragOptions;
  private readonly threshold: number;

  constructor(host: HTMLElement, page: Document, win: Window, settings: SortableDragOptions) {
    this.host = host;
    this.page = page;
    this.win = win;
    this.settings = settings;
    this.threshold = typeof settings.threshold === 'number' && Number.isFinite(settings.threshold)
      ? settings.threshold
      : DEFAULT_THRESHOLD_PX;
  }

  detach(): void {
    if (this.drag) {
      this.release(false);
    } else {
      this.stop();
    }
    this.settle();
    this.host.removeEventListener('pointerdown', this.handlePointerDown);
    this.host.removeEventListener('dragstart', this.handleNativeDragStart);
  }

  readonly handlePointerDown = (event: PointerEvent): void => {
    const { settings, win } = this;
    if (this.drag || this.settling || event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const item = this.findItem(event.target);
    if (!item || (typeof settings.canStart === 'function' && !settings.canStart(item, event))) {
      return;
    }
    this.pending = { item, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    win.addEventListener('pointermove', this.handlePointerMove, true);
    win.addEventListener('pointerup', this.handlePointerUp, true);
    win.addEventListener('pointercancel', this.handlePointerCancel, true);
    win.addEventListener('keydown', this.handleKeyDown, true);
  };

  // A favicon or link inside an item would otherwise start a native drag,
  // which cancels the pointer stream.
  readonly handleNativeDragStart = (event: DragEvent): void => {
    if (this.pending || this.drag) {
      event.preventDefault();
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const start = this.pending;
    if (!start || (start.pointerId !== undefined && event.pointerId !== start.pointerId)) {
      return;
    }
    let state = this.drag;
    if (!state) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < this.threshold) {
        return;
      }
      state = this.begin(event, start);
      if (!state) {
        this.stop();
        return;
      }
      this.drag = state;
    }
    event.preventDefault();
    state.pointer = { x: event.clientX, y: event.clientY };
    this.render();
    if (!this.frame) {
      this.frame = this.win.requestAnimationFrame(this.autoScroll);
    }
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const state = this.drag;
    if (!state) {
      this.stop();
      return;
    }
    state.pointer = { x: event.clientX, y: event.clientY };
    this.render();
    this.release(true);
  };

  private readonly handlePointerCancel = (): void => {
    if (this.drag) {
      this.release(false);
    } else {
      this.stop();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.drag) {
      event.preventDefault();
      event.stopPropagation();
      this.release(false);
    }
  };

  private readonly autoScroll = (): void => {
    this.frame = 0;
    const state = this.drag;
    if (!state) {
      return;
    }
    const bounds = state.scroller ? state.scroller.getBoundingClientRect() : { top: 0, bottom: this.win.innerHeight };
    const step = readAutoScrollStep(state.pointer.y, bounds);
    if (!step) {
      return;
    }
    if (state.scroller) {
      state.scroller.scrollTop += step;
    } else {
      this.win.scrollBy(0, step);
    }
    this.render();
    this.frame = this.win.requestAnimationFrame(this.autoScroll);
  };

  private getScroll(scroller: Element | null): Point {
    return {
      x: this.win.scrollX + (scroller ? scroller.scrollLeft : 0),
      y: this.win.scrollY + (scroller ? scroller.scrollTop : 0)
    };
  }

  private findItem(target: EventTarget | null): HTMLElement | null {
    const element = isElement(target) ? target : (isNode(target) ? target.parentElement : null);
    const item = element ? closestHtmlElement(element, this.settings.itemSelector) : null;
    if (!element || !item || !this.host.contains(item)) {
      return null;
    }
    const control = element.closest(IGNORE_SELECTOR);
    return control && control !== item && item.contains(control) ? null : item;
  }

  private begin(event: PointerEvent, start: PendingDrag): DragState | null {
    const { settings, page, win } = this;
    const item = start.item;
    const peers = typeof settings.getPeers === 'function' ? settings.getPeers(item).filter(isPresent) : [];
    const fromIndex = peers.indexOf(item);
    if (peers.length < 2 || fromIndex < 0) {
      return null;
    }
    const scroller = findScrollParent(item, win);
    const scroll = this.getScroll(scroller);
    const slots = measureSlots(peers, scroll);
    const state: DragState = {
      item,
      peers,
      slots,
      fromIndex,
      toIndex: fromIndex,
      scroller,
      layout: readLayout(slots),
      startPointer: { x: start.x + scroll.x, y: start.y + scroll.y },
      pointer: { x: event.clientX, y: event.clientY },
      bodyUserSelect: page.body ? page.body.style.userSelect : '',
      previous: liftForDrag(item, peers, win)
    };
    item.setAttribute('data-sort-dragging', 'true');
    this.host.setAttribute('data-sort-active', 'true');
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

  private render(): void {
    const state = this.drag;
    if (!state) {
      return;
    }
    const scroll = this.getScroll(state.scroller);
    const dx = state.pointer.x + scroll.x - state.startPointer.x;
    const dy = state.pointer.y + scroll.y - state.startPointer.y;
    const moved = state.slots[state.fromIndex];
    const center = { x: moved.left + moved.width / 2 + dx, y: moved.top + moved.height / 2 + dy };
    setImportant(state.item, 'transform', `translate(${state.layout === 'column' ? 0 : dx}px, ${state.layout === 'row' ? 0 : dy}px)`);
    const toIndex = getTargetIndex(state.slots, state.layout, state.fromIndex, center);
    if (toIndex === state.toIndex && state.rendered) {
      return;
    }
    state.toIndex = toIndex;
    state.rendered = true;
    state.peers.forEach((peer, index) => {
      if (peer !== state.item) {
        setImportant(peer, 'transform', toTranslate(getShift(state.slots, state.layout, state.fromIndex, index, toIndex)));
      }
    });
    leanAround(state, toIndex);
  }

  private suppressNextClick(): void {
    const win = this.win;
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
  private release(commit: boolean): void {
    const current = this.drag;
    this.stop();
    if (!current) {
      return;
    }
    const toIndex = commit ? current.toIndex : current.fromIndex;
    const { slots, layout, fromIndex } = current;
    current.peers.forEach((peer, index) => {
      setImportant(peer, 'translate', '');
      if (peer !== current.item) {
        setImportant(peer, 'transform', toTranslate(getShift(slots, layout, fromIndex, index, toIndex)));
      }
    });
    setImportant(current.item, 'transition', SETTLE_TRANSITION);
    setImportant(current.item, 'transform', toTranslate(getRestingOffset(slots, layout, fromIndex, toIndex)));
    current.item.removeAttribute('data-sort-dragging');
    this.host.removeAttribute('data-sort-active');
    if (this.page.body) {
      this.page.body.style.userSelect = current.bodyUserSelect;
    }
    this.suppressNextClick();
    this.settling = { state: current, commit, timer: 0 };
    if (prefersReducedMotion(this.win)) {
      this.settle();
    } else {
      this.settling.timer = this.win.setTimeout(this.settle, MOTION_MS);
    }
  }

  // The released item is in its slot: the peers' styles go back and the
  // drop lands.
  private readonly settle = (): void => {
    const done = this.settling;
    const { settings } = this;
    this.settling = null;
    if (!done) {
      return;
    }
    this.win.clearTimeout(done.timer);
    const current = done.state;
    settleAfterDrag(current.peers, current.previous, this.win);
    if (done.commit && current.toIndex !== current.fromIndex && typeof settings.onReorder === 'function') {
      settings.onReorder(current.item, current.fromIndex, current.toIndex, current.peers);
    }
    if (typeof settings.onEnd === 'function') {
      settings.onEnd(current.item);
    }
  };

  private stop(): void {
    const win = this.win;
    this.pending = null;
    win.removeEventListener('pointermove', this.handlePointerMove, true);
    win.removeEventListener('pointerup', this.handlePointerUp, true);
    win.removeEventListener('pointercancel', this.handlePointerCancel, true);
    win.removeEventListener('keydown', this.handleKeyDown, true);
    if (this.frame) {
      win.cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.drag = null;
  }
}

// Makes the container's items draggable; returns the function that stops it.
function attach(container: HTMLElement | null | undefined, options: SortableDragOptions): () => void {
  const doc = container ? container.ownerDocument : null;
  const view = doc ? doc.defaultView : null;
  if (!container || !doc || !view) {
    return () => {};
  }
  const drag = new SortableDrag(container, doc, view, options);
  container.addEventListener('pointerdown', drag.handlePointerDown);
  container.addEventListener('dragstart', drag.handleNativeDragStart);
  return () => drag.detach();
}

export type { SortableDragOptions };
export { attach };
