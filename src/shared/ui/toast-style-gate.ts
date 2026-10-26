// Keeps a Toast hidden and still until its stylesheet has loaded, so it
// does not flash unstyled or play its entry motion on page load.
import type { ToastWindow } from './toast-screen';

const TOAST_BOOTSTRAP_STYLES: Readonly<Record<string, string>> = Object.freeze({
  opacity: '0',
  'pointer-events': 'none',
  transform: 'translateX(-50%) translateY(-10px)',
  transition: 'none'
});

// The stylesheet the toast waits for before it may animate.
interface ToastStylesheet {
  sheet?: unknown;
  addEventListener?(type: 'load', listener: () => void): void;
  removeEventListener?(type: 'load', listener: () => void): void;
}

interface ToastStyleGateOptions {
  windowObj?: ToastWindow | null;
  stylesheetElement?: ToastStylesheet | null;
}

interface ToastStyleGate {
  destroy(): void;
  isReady(): boolean;
  markReady(): void;
}

function createToastStyleGate(
  toastElement: { style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'> } | null | undefined,
  options?: ToastStyleGateOptions | null
): Readonly<ToastStyleGate> {
  if (!toastElement) {
    return Object.freeze({
      destroy() {},
      isReady() { return false; },
      markReady() {}
    });
  }
  const element = toastElement;
  const config: ToastStyleGateOptions = options || {};
  const win: ToastWindow = config.windowObj || globalThis;
  const stylesheetElement = config.stylesheetElement || null;
  const requestFrame = (callback: () => void): number => (win.requestAnimationFrame
    ? win.requestAnimationFrame(callback)
    : win.setTimeout(callback, 16));
  const cancelFrame = (frameId: number): void => {
    if (win.cancelAnimationFrame) {
      win.cancelAnimationFrame(frameId);
    } else {
      win.clearTimeout(frameId);
    }
  };
  let ready = false;
  let destroyed = false;
  let frameA: number | null = null;
  let frameB: number | null = null;
  let listeningForLoad = false;

  Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
    element.style.setProperty(property, TOAST_BOOTSTRAP_STYLES[property]);
  });

  function stopListeningForLoad(): void {
    if (!listeningForLoad || !stylesheetElement || !stylesheetElement.removeEventListener) {
      return;
    }
    stylesheetElement.removeEventListener('load', markReady);
    listeningForLoad = false;
  }

  function releaseBootstrapStyles(): void {
    frameB = null;
    if (destroyed) {
      return;
    }
    Object.keys(TOAST_BOOTSTRAP_STYLES).forEach((property) => {
      element.style.removeProperty(property);
    });
  }

  function markReady(): void {
    if (destroyed || ready) {
      return;
    }
    ready = true;
    stopListeningForLoad();
    frameA = requestFrame(() => {
      frameA = null;
      if (destroyed) {
        return;
      }
      frameB = requestFrame(releaseBootstrapStyles);
    });
  }

  if (stylesheetElement && stylesheetElement.addEventListener) {
    stylesheetElement.addEventListener('load', markReady);
    listeningForLoad = true;
  }
  try {
    if (stylesheetElement && stylesheetElement.sheet) {
      markReady();
    }
  } catch (_error) {
    // Keep the bootstrap styles until the stylesheet emits its load event.
  }

  return Object.freeze({
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      stopListeningForLoad();
      if (frameA !== null) {
        cancelFrame(frameA);
        frameA = null;
      }
      if (frameB !== null) {
        cancelFrame(frameB);
        frameB = null;
      }
    },
    isReady() {
      return ready;
    },
    markReady
  });
}

export type { ToastStyleGate, ToastStyleGateOptions, ToastStylesheet };
export { createToastStyleGate };
