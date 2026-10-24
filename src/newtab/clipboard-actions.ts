// @ts-nocheck
// Copying a bookmark's or a search result's URL to the clipboard (with
// the textarea fallback where the async clipboard is unavailable) and the
// page toast that confirms it.
function createClipboardActions(deps) {
  const {
    t
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function hideToast() {
    if (pageState.toastController && typeof pageState.toastController.hide === 'function') {
      pageState.toastController.hide();
    }
  }

  function showToast(message, isError, options) {
    if (pageState.toastController && typeof pageState.toastController.show === 'function') {
      pageState.toastController.show(message, Object.assign({}, options, {
        error: Boolean(isError)
      }));
    }
  }

  // A task that may run long: its loading Toast turns into the result in place.
  function beginToast(message) {
    if (pageState.toastController && typeof pageState.toastController.begin === 'function') {
      return pageState.toastController.begin(message);
    }
    return {
      update() {},
      done(result) { if (result) showToast(result, false); },
      fail(result) { if (result) showToast(result, true); },
      cancel() {}
    };
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

  function copyBookmarkUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
      showToast(t('bookmarks_copy_url_failed', 'Couldn’t copy the link. Try again.'), true);
      return Promise.resolve(false);
    }
    return copyTextToClipboard(value).then(() => {
      showToast(t('bookmarks_copy_url_success', 'Bookmark link copied'));
      return true;
    }).catch(() => {
      showToast(t('bookmarks_copy_url_failed', 'Couldn’t copy the link. Try again.'), true);
      return false;
    });
  }

  function copySearchResultUrl(url) {
    const value = String(url || '').trim();
    if (!value) {
      showToast(t('search_copy_url_failed', 'Couldn’t copy the result link. Try again.'), true);
      return Promise.resolve(false);
    }
    return copyTextToClipboard(value).then(() => {
      showToast(t('search_copy_url_success', 'Result link copied'));
      return true;
    }).catch(() => {
      showToast(t('search_copy_url_failed', 'Couldn’t copy the result link. Try again.'), true);
      return false;
    });
  }

  return {
    hideToast,
    showToast,
    beginToast,
    copyBookmarkUrl,
    copySearchResultUrl
  };
}

export { createClipboardActions };
