// The shared Toast at the top of the screen, inside the switcher's shadow
// root so it lives and goes with the switcher.
import * as TOAST from '../ui/toast';

interface SwitcherToast {
  element: HTMLDivElement;
  show(message: string, isError: boolean): void;
  destroy(): void;
}

function createSwitcherToast(shadow: ShadowRoot | HTMLElement): SwitcherToast {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
  const element = document.createElement('div');
  element.className = 'x-lumno-toast';
  element.setAttribute('data-show', 'false');
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
  element.style.setProperty('--x-lumno-toast-z-index', '2147483647');
  shadow.append(stylesheet, element);
  const styleGate = TOAST.createToastStyleGate(element, {
    stylesheetElement: stylesheet,
    windowObj: window
  });
  const controller = TOAST.createToastController(element, { windowObj: window });
  return {
    element,
    show(message: string, isError: boolean): void {
      element.setAttribute('role', isError ? 'alert' : 'status');
      element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
      controller.show(message, { error: Boolean(isError) });
    },
    destroy() {
      styleGate.destroy();
      controller.destroy();
    }
  };
}

export type { SwitcherToast };
export { createSwitcherToast };
