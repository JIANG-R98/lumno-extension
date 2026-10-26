// The Toast of the extension's own pages, drawn by React.
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { NOOP_CONTROLLER, ToastScreen } from '../ui/toast-screen';
import type { ToastController, ToastControllerOptions, ToastSurface } from '../ui/toast-screen';

function createReactSurface(host: HTMLElement): ToastSurface {
  const reactRoot = createRoot(host);
  host.setAttribute('data-react-island', 'toast');
  return {
    render(text, tone) {
      flushSync(() => {
        reactRoot.render(
          tone === 'loading' ? (
            <>
              <span aria-hidden="true" className="x-lumno-toast-spinner" />
              {text}
            </>
          ) : (
            text
          )
        );
      });
      if (tone) {
        host.setAttribute('data-tone', tone);
      } else {
        host.removeAttribute('data-tone');
      }
      host.setAttribute('data-show', 'true');
    },
    hide() {
      host.setAttribute('data-show', 'false');
    },
    destroy() {
      flushSync(() => {
        reactRoot.unmount();
      });
    }
  };
}

export function createToastController(
  toastElement: HTMLElement | null,
  options?: ToastControllerOptions | null
): ToastController {
  return toastElement ? new ToastScreen(createReactSurface(toastElement), options) : NOOP_CONTROLLER;
}
