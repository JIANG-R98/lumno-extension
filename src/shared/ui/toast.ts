// The Toast the in-page surfaces share, drawn straight into its element.
import { NOOP_CONTROLLER, ToastScreen } from './toast-screen';
import type { ToastController, ToastControllerOptions, ToastSurface, ToastTone } from './toast-screen';

// The toast element, or a test double; the optional members may be missing.
interface ToastElement {
  style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'>;
  textContent: string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
  replaceChildren?(...nodes: Array<Node | string>): void;
  ownerDocument?: Document | null;
}

function renderToast(element: ToastElement, text: string, tone: ToastTone): void {
  const doc = element.ownerDocument;
  if (tone === 'loading' && doc && element.replaceChildren) {
    const spinner = doc.createElement('span');
    spinner.className = 'x-lumno-toast-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    element.replaceChildren(spinner, doc.createTextNode(text));
  } else {
    element.textContent = text;
  }
  if (tone) {
    element.setAttribute('data-tone', tone);
  } else if (element.removeAttribute) {
    element.removeAttribute('data-tone');
  } else {
    element.setAttribute('data-tone', '');
  }
  element.setAttribute('data-show', 'true');
}

function createDomSurface(element: ToastElement): ToastSurface {
  return {
    render: (text, tone) => renderToast(element, text, tone),
    hide: () => element.setAttribute('data-show', 'false')
  };
}

function createToastController(
  toastElement: ToastElement | null | undefined,
  options?: ToastControllerOptions | null
): ToastController {
  return toastElement ? new ToastScreen(createDomSurface(toastElement), options) : NOOP_CONTROLLER;
}

export type { ToastElement };
export { createToastController };
