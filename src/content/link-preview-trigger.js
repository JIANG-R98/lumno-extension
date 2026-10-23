(function() {
  // Runs in every frame. In an ordinary frame it turns Shift+click on a link
  // into a link preview (see src/background/link-preview.js). Inside the
  // preview's own frame it tells the preview surface that a real page loaded
  // there (a page refused for framing shows Chrome's error page, where no
  // content script runs) and passes Escape up so the preview can close.
  const RUNTIME_KEY = '_x_extension_link_preview_trigger_2026_unique_';
  const PREVIEW_FRAME_NAME = 'lumno-link-preview';
  const PREVIEW_MESSAGE_SOURCE = 'lumno-link-preview-frame';
  const previousRuntime = window[RUNTIME_KEY];
  if (previousRuntime && typeof previousRuntime.cleanup === 'function') {
    try {
      previousRuntime.cleanup();
    } catch (error) {
      // A listener from the previous extension context may already be invalid.
    }
  }

  const cleanups = [];
  function listen(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    cleanups.push(() => target.removeEventListener(type, listener, options));
  }

  function isPreviewFrame() {
    try {
      return window.top !== window && window.name === PREVIEW_FRAME_NAME;
    } catch (error) {
      return false;
    }
  }

  function send(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        void (chrome.runtime && chrome.runtime.lastError);
        if (typeof callback === 'function') {
          callback(response);
        }
      });
    } catch (error) {
      // Ignore an extension context invalidated during reload or navigation.
    }
  }

  function isPreviewGesture(event) {
    return Boolean(event) &&
      event.isTrusted === true &&
      event.button === 0 &&
      event.shiftKey === true &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey;
  }

  function readAnchorHref(element) {
    if (!element || typeof element.getAttribute !== 'function') {
      return '';
    }
    const tagName = String(element.tagName || '').toLowerCase();
    if (tagName !== 'a' && tagName !== 'area') {
      return '';
    }
    const href = element.href;
    if (typeof href === 'string') {
      return href;
    }
    // SVG <a> exposes an SVGAnimatedString.
    if (href && typeof href.baseVal === 'string') {
      try {
        return new URL(href.baseVal, document.baseURI).href;
      } catch (error) {
        return '';
      }
    }
    return '';
  }

  // The link under the press, also inside open shadow roots.
  function findPreviewTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const element of path) {
      if (element === window || element === document) {
        break;
      }
      const href = readAnchorHref(element);
      if (!href) {
        continue;
      }
      if (element.hasAttribute('download') || element.isContentEditable) {
        return '';
      }
      return isPreviewableHref(href) ? href : '';
    }
    return '';
  }

  function isPreviewableHref(href) {
    let url;
    try {
      url = new URL(href);
    } catch (error) {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    // A jump within this document has nothing to preview.
    const here = new URL(location.href);
    return !(url.hash && url.origin === here.origin &&
      url.pathname === here.pathname && url.search === here.search);
  }

  function setupTrigger() {
    let pressedHref = '';
    listen(window, 'mousedown', (event) => {
      pressedHref = isPreviewGesture(event) ? findPreviewTarget(event) : '';
      if (!pressedHref) {
        return;
      }
      // Shift+mousedown would extend the text selection to the link.
      event.preventDefault();
      send({ action: 'linkPreviewPrepare', url: pressedHref });
    }, true);
    // Capture phase, so the page's own click handlers see the default already
    // prevented: routers skip a prevented click instead of navigating, and
    // Chrome's Shift+click new window never opens.
    listen(window, 'click', (event) => {
      const href = isPreviewGesture(event) ? findPreviewTarget(event) : '';
      const wasPressed = href && href === pressedHref;
      pressedHref = '';
      if (!wasPressed) {
        return;
      }
      event.preventDefault();
      send({
        action: 'linkPreviewOpen',
        url: href,
        origin: { x: event.clientX, y: event.clientY }
      });
    }, true);
  }

  function postToPreviewSurface(message) {
    try {
      window.parent.postMessage(Object.assign({ source: PREVIEW_MESSAGE_SOURCE }, message), '*');
    } catch (error) {
      // The parent may be gone while this frame unloads.
    }
  }

  function setupPreviewFrame() {
    const reportLocation = () => {
      postToPreviewSurface({ type: 'alive', url: location.href });
    };
    reportLocation();
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      listen(window.navigation, 'navigatesuccess', reportLocation);
    }
    listen(window, 'keydown', (event) => {
      if (event.key === 'Escape' && event.isTrusted && !event.defaultPrevented) {
        postToPreviewSurface({ type: 'escape' });
      }
    });
  }

  if (isPreviewFrame()) {
    setupPreviewFrame();
  } else {
    setupTrigger();
  }

  window[RUNTIME_KEY] = {
    cleanup() {
      cleanups.splice(0).forEach((cleanup) => cleanup());
    }
  };
})();
