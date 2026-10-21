(function(root) {
  // The overlay toast, and copying a result's URL to the clipboard.
  function createCopyActions(deps) {
    const {
      overlayToastController,
      t
    } = deps;

    function hideOverlayToast() {
      overlayToastController.hide();
    }

    function showOverlayToast(message, isError, options) {
      overlayToastController.show(message, Object.assign({}, options, {
        error: Boolean(isError)
      }));
    }

    function fallbackCopyText(text) {
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
      } catch (error) {
        copied = false;
      }
      textarea.remove();
      if (activeElement && typeof activeElement.focus === 'function') {
        activeElement.focus({ preventScroll: true });
      }
      return copied;
    }

    function copyTextToClipboard(text) {
      const value = String(text || '');
      const clipboard = window.navigator && window.navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        return Promise.resolve(clipboard.writeText(value)).catch((error) => {
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

    function copySearchResultUrl(url) {
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

  root.LumnoOverlayPanelCopyActions = { createCopyActions };
})(globalThis);
