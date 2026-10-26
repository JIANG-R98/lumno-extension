// The picker's copy in the reader's language, and extension URLs.

function applyNoTranslate<T extends Element>(element: T): T {
  element.setAttribute('translate', 'no');
  element.setAttribute('lang', 'zxx');
  element.setAttribute('notranslate', '');
  element.setAttribute('data-no-translate', 'true');
  element.classList.add('notranslate');
  return element;
}

function getMessage(name: string, fallback: string): string {
  try {
    if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
      const value = chrome.i18n.getMessage(name);
      if (value) {
        return value;
      }
    }
  } catch (_error) {
    // Ignore i18n failures in page context.
  }
  return fallback;
}

function getRuntimeUrl(path: string): string {
  try {
    if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
      return chrome.runtime.getURL(path);
    }
  } catch (_error) {
    // Ignore runtime URL failures.
  }
  return path;
}

export {
  applyNoTranslate,
  getMessage,
  getRuntimeUrl
};
