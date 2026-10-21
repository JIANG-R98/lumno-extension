(function(root) {
  // The overlay's place on the page: the context token that tells this
  // session's panel from a stale one, the mount host and its visibility, wheel
  // isolation, telling the background about loading and closing, and removing
  // the panel.
  function createPanelSession(deps) {
    const {
      pauseOverlayAntiTranslateObserverForScroll,
      clearOverlayEnterAnimationFrames,
      clearOverlayPanelEnterCleanup,
      cancelPendingOverlaySuggestionRequests,
      stopOverlayAntiTranslateObserver,
      overlayShell,
      stopOverlayPageThemeObserver,
      overlayLifecycle
    } = deps;

    // The panel state object shared with search-panel.js and the other modules.
    const overlayState = deps.overlayState;

    const OVERLAY_CONTEXT_TOKEN_KEY = '__lumnoOverlayContextToken2026';
    const OVERLAY_CONTEXT_TOKEN_ATTRIBUTE = 'data-lumno-overlay-context-token';

    function stopOverlayViewportSizeSync() {
      overlayState.overlayViewportSizeSync.stop();
    }

    function getOrCreateOverlayContextToken() {
      try {
        const storedToken = window[OVERLAY_CONTEXT_TOKEN_KEY];
        if (typeof storedToken === 'string' && storedToken) {
          return storedToken;
        }
      } catch (e) {
        // Fall through to a fresh token when the isolated world cannot persist it.
      }
      const nextToken = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
      try {
        window[OVERLAY_CONTEXT_TOKEN_KEY] = nextToken;
      } catch (e) {
        // The returned token is still useful for this invocation.
      }
      return nextToken;
    }

    function getOverlayMountHost(overlayElement) {
      if (!overlayElement) {
        return null;
      }
      if (overlayElement._lumnoOverlayHost) {
        return overlayElement._lumnoOverlayHost;
      }
      try {
        if (typeof overlayElement.getRootNode === 'function') {
          const root = overlayElement.getRootNode();
          if (root && root.host) {
            return root.host;
          }
        }
      } catch (e) {
        // Fall back to removing the element itself.
      }
      return overlayElement;
    }

    function getOverlayElementContextToken(element) {
      if (!element || typeof element.getAttribute !== 'function') {
        return '';
      }
      return String(element.getAttribute(OVERLAY_CONTEXT_TOKEN_ATTRIBUTE) || '').trim();
    }

    function setOverlayStoredContextToken(overlayElement) {
      const mountHost = getOverlayMountHost(overlayElement);
      [overlayElement, mountHost].forEach((element) => {
        if (element && typeof element.setAttribute === 'function') {
          element.setAttribute(OVERLAY_CONTEXT_TOKEN_ATTRIBUTE, overlayState.overlayContextToken);
        }
      });
    }

    function getOverlayStoredContextToken(overlayElement) {
      return getOverlayElementContextToken(overlayElement) ||
        getOverlayElementContextToken(getOverlayMountHost(overlayElement));
    }

    function setOverlayMountVisibility(mountHost, hidden) {
      if (!mountHost || !mountHost.style || typeof mountHost.style.setProperty !== 'function') {
        return;
      }
      if (hidden) {
        mountHost.setAttribute('data-lumno-overlay-mount-hidden', 'true');
        mountHost.style.setProperty('visibility', 'hidden', 'important');
        return;
      }
      mountHost.removeAttribute('data-lumno-overlay-mount-hidden');
      if (typeof mountHost.style.removeProperty === 'function') {
        mountHost.style.removeProperty('visibility');
      }
    }

    function isStaleOverlay(overlayElement) {
      const storedToken = getOverlayStoredContextToken(overlayElement);
      return storedToken !== overlayState.overlayContextToken;
    }

    function isScrollableOverflowValue(value) {
      return value === 'auto' || value === 'scroll' || value === 'overlay';
    }

    function canScrollByWheelDelta(scrollPosition, viewportSize, scrollSize, delta) {
      if (!delta) {
        return false;
      }
      const maxScroll = Math.max(0, scrollSize - viewportSize);
      if (maxScroll <= 0) {
        return false;
      }
      if (delta < 0) {
        return scrollPosition > 0;
      }
      return scrollPosition < maxScroll - 1;
    }

    function canScrollElementWithWheel(element, event) {
      if (!element || element.nodeType !== 1 || !event) {
        return false;
      }
      const doc = element.ownerDocument || document;
      if (element === doc.body || element === doc.documentElement) {
        return false;
      }
      const win = doc.defaultView || window;
      const style = win && typeof win.getComputedStyle === 'function'
        ? win.getComputedStyle(element)
        : null;
      if (!style) {
        return false;
      }
      const deltaY = Number(event.deltaY) || 0;
      const deltaX = Number(event.deltaX) || 0;
      const scrollHeight = Number(element.scrollHeight) || 0;
      const clientHeight = Number(element.clientHeight) || 0;
      const scrollWidth = Number(element.scrollWidth) || 0;
      const clientWidth = Number(element.clientWidth) || 0;
      const canScrollY = isScrollableOverflowValue(style.overflowY) &&
        scrollHeight > clientHeight + 1 &&
        canScrollByWheelDelta(Number(element.scrollTop) || 0, clientHeight, scrollHeight, deltaY);
      const canScrollX = isScrollableOverflowValue(style.overflowX) &&
        scrollWidth > clientWidth + 1 &&
        canScrollByWheelDelta(Number(element.scrollLeft) || 0, clientWidth, scrollWidth, deltaX);
      return canScrollY || canScrollX;
    }

    function findOverlayWheelScrollableElement(event, overlayElement) {
      if (!event || !overlayElement) {
        return null;
      }
      const path = typeof event.composedPath === 'function'
        ? event.composedPath()
        : [];
      for (const node of path) {
        if (node === overlayElement) {
          break;
        }
        if (canScrollElementWithWheel(node, event)) {
          return node;
        }
      }
      let current = event.target && event.target.nodeType === 1
        ? event.target
        : event.target && event.target.parentElement
          ? event.target.parentElement
          : null;
      while (current && current !== overlayElement) {
        if (canScrollElementWithWheel(current, event)) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    }

    function createOverlayWheelIsolationHandler(overlayElement) {
      return function(event) {
        if (!event || !overlayElement || !overlayElement.isConnected) {
          return;
        }
        const path = typeof event.composedPath === 'function'
          ? event.composedPath()
          : [];
        const target = event.target;
        const isInsideOverlay = (target && overlayElement.contains(target)) || path.includes(overlayElement);
        if (!isInsideOverlay) {
          return;
        }
        event.stopPropagation();
        pauseOverlayAntiTranslateObserverForScroll();
        if (findOverlayWheelScrollableElement(event, overlayElement)) {
          return;
        }
        event.preventDefault();
      };
    }

    function notifyOverlayClosed() {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        return;
      }
      try {
        chrome.runtime.sendMessage({ action: 'notifyOverlayClosed' }, () => {
          void chrome.runtime.lastError;
        });
      } catch (error) {
        // The document may already be unloading.
      }
    }

    function isOverlayInputFocused(input) {
      if (!input) {
        return false;
      }
      if (document.activeElement === input) {
        return true;
      }
      const root = typeof input.getRootNode === 'function' ? input.getRootNode() : null;
      return Boolean(root && root.activeElement === input);
    }

    function notifyOverlayLoadingSession(input) {
      if (overlayState.suppressOverlayLoadingSessionNotification || !overlayState.loadingSessionTrackingActive || !input ||
          !chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        return;
      }
      const inputValue = typeof input.value === 'string' ? input.value : '';
      const inputLength = inputValue.length;
      const rawSelectionStart = Number(input.selectionStart);
      const selectionStart = Number.isFinite(rawSelectionStart)
        ? Math.max(0, Math.min(inputLength, Math.trunc(rawSelectionStart)))
        : inputLength;
      const rawSelectionEnd = Number(input.selectionEnd);
      const selectionEnd = Number.isFinite(rawSelectionEnd)
        ? Math.max(selectionStart, Math.min(inputLength, Math.trunc(rawSelectionEnd)))
        : selectionStart;
      try {
        chrome.runtime.sendMessage({
          action: 'updateOverlayLoadingSession',
          session: {
            inputValue,
            selectionStart,
            selectionEnd,
            selectionDirection: input.selectionDirection === 'backward' ||
              input.selectionDirection === 'forward'
              ? input.selectionDirection
              : 'none',
            focused: isOverlayInputFocused(input)
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            return;
          }
          if (response && response.tracked === false) {
            overlayState.loadingSessionTrackingActive = false;
          }
        });
      } catch (error) {
        // The loading Document can be replaced between the input event and delivery.
      }
    }

    // Tears down this invocation's overlay session: DOM, page listeners,
    // storage listeners and every controller registered for the session.
    function removeOverlay(overlayElement, options) {
      const removalOptions = options && typeof options === 'object' ? options : {};
      window._x_extension_search_overlay_open_2026_unique_ = false;
      if (removalOptions.preserveLoadingIntent !== true) {
        notifyOverlayClosed();
      }
      clearOverlayEnterAnimationFrames();
      clearOverlayPanelEnterCleanup();
      cancelPendingOverlaySuggestionRequests();
      if (overlayState.overlayRevealGate && typeof overlayState.overlayRevealGate.cancel === 'function') {
        overlayState.overlayRevealGate.cancel();
        overlayState.overlayRevealGate = null;
      }
      stopOverlayViewportSizeSync();
      overlayState.overlayNoticeLayer.stop();
      stopOverlayAntiTranslateObserver();
      // Session cleanups stop the mount connection guard, so they must run
      // before the host leaves the document or the guard would re-attach it.
      overlayState.overlaySessionCleanups.run();
      if (overlayElement) {
        if (overlayState.overlayWheelIsolationHandler) {
          overlayElement.removeEventListener('wheel', overlayState.overlayWheelIsolationHandler, true);
        }
        if (overlayState.overlaySuggestionsView && typeof overlayState.overlaySuggestionsView.destroy === 'function') {
          overlayState.overlaySuggestionsView.destroy();
        }
        const mountHost = getOverlayMountHost(overlayElement);
        overlayShell.destroyOverlayMount(mountHost);
        if (mountHost) {
          mountHost.remove();
        }
      }
      overlayState.overlayWheelIsolationHandler = null;
      overlayState.overlaySuggestionsView = null;
      // Also remove the scrollbar style
      const scrollbarStyle = document.getElementById('_x_extension_scrollbar_style_2024_unique_');
      if (scrollbarStyle) {
        scrollbarStyle.remove();
      }
      const overlayThemeStyle = document.getElementById('_x_extension_overlay_theme_style_2024_unique_');
      if (overlayThemeStyle) {
        overlayThemeStyle.remove();
      }
      if (overlayState.clickOutsideHandler) {
        document.removeEventListener('click', overlayState.clickOutsideHandler);
        overlayState.clickOutsideHandler = null;
      }
      overlayState.storageChangeListeners.clear();
      if (overlayState.overlayThemeMediaListener) {
        overlayState.overlayMediaQuery.removeEventListener('change', overlayState.overlayThemeMediaListener);
        overlayState.overlayThemeMediaListener = null;
      }
      overlayState.overlayThemeListenerAttached = false;
      if (overlayState.overlayScrollPauseHandler) {
        window.removeEventListener('scroll', overlayState.overlayScrollPauseHandler, true);
        window.removeEventListener('wheel', overlayState.overlayScrollPauseHandler, true);
        window.removeEventListener('touchmove', overlayState.overlayScrollPauseHandler, true);
        overlayState.overlayScrollPauseHandler = null;
      }
      stopOverlayPageThemeObserver();
      if (overlayState.inputModeController) {
        overlayState.inputModeController.destroy();
        overlayState.inputModeController = null;
      }
      if (overlayState.inputHistoryController && typeof overlayState.inputHistoryController.destroy === 'function') {
        overlayState.inputHistoryController.destroy();
      }
      overlayState.inputHistoryController = null;
      [overlayState.overlayUpdateNoticeController, overlayState.overlayEngagementNoticeController].forEach((controller) => {
        if (!controller || typeof controller.destroy !== 'function') {
          return;
        }
        if (controller.element && controller.element.parentNode) {
          controller.element.parentNode.removeChild(controller.element);
        }
        controller.destroy();
      });
      overlayState.overlayUpdateNoticeController = null;
      overlayState.overlayEngagementNoticeController = null;
    }

    function destroyExistingOverlaySession(overlayElement, options) {
      const mountHost = getOverlayMountHost(overlayElement);
      const destroyed = mountHost
        ? overlayLifecycle.requestSessionDestroy(mountHost, options)
        : !(overlayElement && overlayElement.isConnected);
      if (destroyed) {
        window._x_extension_search_overlay_open_2026_unique_ = false;
        return;
      }
      // An overlay from a runtime that predates session teardown: remove its
      // DOM at least, as before.
      removeOverlay(overlayElement, options);
    }

    return {
      getOrCreateOverlayContextToken,
      getOverlayMountHost,
      setOverlayStoredContextToken,
      setOverlayMountVisibility,
      isStaleOverlay,
      createOverlayWheelIsolationHandler,
      notifyOverlayLoadingSession,
      removeOverlay,
      destroyExistingOverlaySession
    };
  }

  root.LumnoOverlayPanelPanelSession = { createPanelSession };
})(globalThis);
