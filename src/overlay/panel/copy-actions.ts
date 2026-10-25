import type { ToastController, ToastShowOptions } from '../../shared/ui/toast';
import type { Translate } from './types';

interface CopyActionsDeps {
  overlayToastController: Pick<ToastController, 'show' | 'hide'>;
  t: Translate;
}

// HTML, SVG and MathML elements have focus(); other elements do not.
function isFocusable(element: Element): element is Element & HTMLOrSVGElement {
  return 'focus' in element && typeof element.focus === 'function';
}

// The overlay toast, and copying a result's URL to the clipboard.
function createCopyActions(deps: CopyActionsDeps) {
  const {
    overlayToastController,
    t
  } = deps;

  function hideOverlayToast(): void {
    overlayToastController.hide();
  }

  function showOverlayToast(message: string, isError?: boolean, options?: ToastShowOptions): void {
    overlayToastController.show(message, Object.assign({}, options, {
      error: Boolean(isError)
    }));
  }

  // Copies through a hidden text field where the Clipboard API is refused.
  function fallbackCopyText(text: string): boolean {
    if (!document || !document.body || typeof document.execCommand !== 'function') {
      return false;
    }
    const activeElement = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = String(text || '');
    textarea.setAttribute('readonly', '');
    textarea.style.setProperty('position', 'fixed');
    textarea.style.setProperty('left', '-9999px');
    textarea.style.setProperty('top', '0');
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_error) {
      copied = false;
    }
    textarea.remove();
    if (activeElement && isFocusable(activeElement)) {
      activeElement.focus({ preventScroll: true });
    }
    return copied;
  }

  function copyTextToClipboard(text: string): Promise<void | boolean> {
    const value = String(text || '');
    const clipboard = window.navigator && window.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      return Promise.resolve(clipboard.writeText(value)).catch((error: unknown) => {
        if (fallbackCopyText(value)) {
          return true;
        }
        throw error;
      });
    }
    return fallbackCopyText(value)
      ? Promise.resolve(true)
      : Promise.reject(new Error('clipboard-write-failed'));
  }

  // Copies a result's address and says whether it worked; true on success.
  function copySearchResultUrl(url: string): Promise<boolean> {
    const value = String(url || '').trim();
    if (!value) {
      showOverlayToast(t(
        'search_copy_url_failed',
        'Couldn’t copy the result link. Try again.'
      ), true);
      return Promise.resolve(false);
    }
    return copyTextToClipboard(value).then(() => {
      showOverlayToast(t(
        'search_copy_url_success',
        'Result link copied'
      ));
      return true;
    }).catch(() => {
      showOverlayToast(t(
        'search_copy_url_failed',
        'Couldn’t copy the result link. Try again.'
      ), true);
      return false;
    });
  }

  return {
    hideOverlayToast,
    showOverlayToast,
    copySearchResultUrl
  };
}

export { createCopyActions };
export type { CopyActionsDeps };
