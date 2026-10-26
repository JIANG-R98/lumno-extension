// While a page element is fullscreen (a video player), the browser keeps
// Escape to itself and leaves fullscreen, so an overlay shown above it only
// closes on the second press. Locking Escape with the Keyboard Lock API hands
// the key to the page instead; leaving fullscreen then takes a long press.
// Only Chromium browsers have the API; elsewhere nothing changes. A window
// that is merely fullscreen (macOS green button) never kept Escape, so the
// lock is taken only while an element is fullscreen.

// navigator.keyboard, which the DOM typings do not have yet.
interface KeyboardLockApi {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

function isKeyboardLockApi(value: unknown): value is KeyboardLockApi {
  return typeof value === 'object' && value !== null &&
    'lock' in value && typeof value.lock === 'function' &&
    'unlock' in value && typeof value.unlock === 'function';
}

function getKeyboardLockApi(win: Window): KeyboardLockApi | null {
  const keyboard: unknown = win.navigator ? Reflect.get(win.navigator, 'keyboard') : null;
  return isKeyboardLockApi(keyboard) ? keyboard : null;
}

// Releasing the lock also drops one the page took itself (a cloud gaming
// site); the overlay is rarely open over such a page, and a page that needs
// its lock back takes it again on its next fullscreen.
function createFullscreenEscapeLock(win?: Window | null) {
  const targetWindow = win || window;
  const doc = targetWindow.document;
  const keyboard = getKeyboardLockApi(targetWindow);
  let active = false;
  let locked = false;

  function lock(): void {
    if (!keyboard || locked) {
      return;
    }
    locked = true;
    try {
      // Rejected in a frame, or when the browser refuses the lock.
      keyboard.lock(['Escape']).catch(() => {});
    } catch (_error) {
      locked = false;
    }
  }

  function unlock(): void {
    if (!keyboard || !locked) {
      return;
    }
    locked = false;
    try {
      keyboard.unlock();
    } catch (_error) {
      // Nothing is left to release.
    }
  }

  function sync(): void {
    if (active && doc && doc.fullscreenElement) {
      lock();
    } else {
      unlock();
    }
  }

  function start(): void {
    if (active || !keyboard) {
      return;
    }
    active = true;
    targetWindow.addEventListener('fullscreenchange', sync);
    sync();
  }

  function stop(): void {
    if (!active) {
      return;
    }
    active = false;
    targetWindow.removeEventListener('fullscreenchange', sync);
    unlock();
  }

  return Object.freeze({
    start,
    stop
  });
}

export { createFullscreenEscapeLock };
