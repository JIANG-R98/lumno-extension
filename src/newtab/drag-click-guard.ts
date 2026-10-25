// Releasing a dragged shortcut, bookmark or group title also fires a click
// on whatever is under the pointer, which would open the site or toggle
// the folder the drag just dropped. One policy for every drag on the page:
//
//   After a drag is released, the single pointer click that follows is
//   swallowed, wherever it lands, if it comes within DRAG_CLICK_GUARD_MS.
//   A new press before that click ends the guard, so a deliberate next
//   click still works; keyboard activations always pass.
//
// A drag canceled while the pointer is still held (Escape) waits for that
// pointer's release first, then guards the same way.
const DRAG_CLICK_GUARD_MS = 420;

interface DragClickGuardOptions {
  windowObj?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
  now?: () => number;
  guardMs?: number;
}

function createDragClickGuard(options?: DragClickGuardOptions) {
  const opts = options || {};
  const windowObj = opts.windowObj || (typeof window !== 'undefined' ? window : null);
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const guardMs = opts.guardMs !== undefined && Number.isFinite(opts.guardMs) ? opts.guardMs : DRAG_CLICK_GUARD_MS;
  let armedUntil = 0;
  let waitingPointerId: number | null = null;
  let listening = false;

  // Enter or Space on a focused control also fires a click, with no
  // press count and no pointer type; a release that fired no click (its
  // target was removed) must not swallow that.
  function isPointerClick(event: MouseEvent): boolean {
    return Number(event.detail) > 0 ||
      ('pointerType' in event && typeof event.pointerType === 'string' && event.pointerType !== '');
  }

  function handleClick(event: MouseEvent): void {
    if (!armedUntil || !isPointerClick(event)) {
      return;
    }
    const active = now() <= armedUntil;
    disarm();
    if (active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  }

  function handlePointerDown(): void {
    // The held pointer of a canceled drag is already down; any press is new.
    disarm();
  }

  function handleRelease(event: PointerEvent | null): void {
    if (waitingPointerId === null || (event && event.pointerId !== waitingPointerId)) {
      return;
    }
    waitingPointerId = null;
    armedUntil = now() + guardMs;
  }

  function listen(): void {
    if (listening || !windowObj || typeof windowObj.addEventListener !== 'function') {
      return;
    }
    listening = true;
    // The window sees the click before any page listener, React's included.
    windowObj.addEventListener('click', handleClick, true);
    windowObj.addEventListener('pointerdown', handlePointerDown, true);
    windowObj.addEventListener('pointerup', handleRelease, true);
    windowObj.addEventListener('pointercancel', handleRelease, true);
  }

  function unlisten(): void {
    if (!listening || !windowObj) {
      return;
    }
    listening = false;
    windowObj.removeEventListener('click', handleClick, true);
    windowObj.removeEventListener('pointerdown', handlePointerDown, true);
    windowObj.removeEventListener('pointerup', handleRelease, true);
    windowObj.removeEventListener('pointercancel', handleRelease, true);
  }

  function disarm(): void {
    armedUntil = 0;
    waitingPointerId = null;
    unlisten();
  }

  // The drag ended with its pointer's release.
  function armAfterRelease(): void {
    waitingPointerId = null;
    armedUntil = now() + guardMs;
    listen();
  }

  // The drag ended while `pointerId` is still held down.
  function armUntilRelease(pointerId: number): void {
    armedUntil = 0;
    waitingPointerId = pointerId;
    listen();
  }

  // `release` is the pointer event that ended the drag, or null when the
  // drag was canceled without one.
  function armAfterDrag(release: Event | null | undefined, pointerId: number): void {
    if (release) {
      armAfterRelease();
    } else {
      armUntilRelease(pointerId);
    }
  }

  function isArmed(): boolean {
    return waitingPointerId !== null || (armedUntil > 0 && now() <= armedUntil);
  }

  return {
    armAfterDrag,
    armAfterRelease,
    armUntilRelease,
    isArmed,
    disarm
  };
}

type DragClickGuard = ReturnType<typeof createDragClickGuard>;

let sharedGuard: DragClickGuard | null = null;
function getDragClickGuard(): DragClickGuard {
  if (!sharedGuard) {
    sharedGuard = createDragClickGuard();
  }
  return sharedGuard;
}

export { DRAG_CLICK_GUARD_MS, createDragClickGuard, getDragClickGuard };
export type { DragClickGuard };
