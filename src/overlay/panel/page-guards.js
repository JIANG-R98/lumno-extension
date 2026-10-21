// Keeps the host page out of the panel: no page translation inside it,
// and no other extension decorating its input.
function createPageGuards(deps) {
  const {
    overlayAntiTranslateGuard
  } = deps;

  // The panel state object shared with search-panel.js and the other modules.
  const overlayState = deps.overlayState;

  function applyOverlayInputExtensionIsolation(input) {
    if (!input || typeof input.setAttribute !== 'function') {
      return;
    }
    const exclusionAttributes = {
      'data-1p-ignore': 'true',
      'data-op-ignore': 'true',
      'data-lpignore': 'true',
      'data-bwignore': 'true',
      'data-form-type': 'other',
      'data-gramm': 'false',
      'data-lt-active': 'false',
      'spellcheck': 'false',
      'writingsuggestions': 'false'
    };
    Object.entries(exclusionAttributes).forEach(([name, value]) => {
      input.setAttribute(name, value);
    });
  }

  function applyNoTranslate(element) {
    if (!element || !element.setAttribute) {
      return element;
    }
    element.setAttribute('translate', 'no');
    element.setAttribute('lang', 'zxx');
    element.setAttribute('notranslate', '');
    element.setAttribute('data-no-translate', 'true');
    if (element.classList) {
      element.classList.add('notranslate');
    }
    return element;
  }

  function applyNoTranslateDeep(root) {
    if (!root || typeof root !== 'object') {
      return root;
    }
    applyNoTranslate(root);
    if (!root.querySelectorAll) {
      return root;
    }
    root.querySelectorAll('*').forEach((element) => {
      applyNoTranslate(element);
    });
    return root;
  }

  function restoreProtectedNode(node) {
    return false;
  }

  function restoreProtectedAncestors(node, root) {
    return false;
  }

  function stopOverlayAntiTranslateObserver() {
    overlayAntiTranslateGuard.stop();
  }

  function pauseOverlayAntiTranslateObserverForScroll() {
    overlayAntiTranslateGuard.pauseForScroll();
  }

  function pauseOverlayAntiTranslateObserverForMutationBurst() {
    overlayAntiTranslateGuard.pauseForMutationBurst();
  }

  function startOverlayAntiTranslateObserver(root) {
    overlayAntiTranslateGuard.start(root);
  }

  return {
    applyOverlayInputExtensionIsolation,
    applyNoTranslate,
    applyNoTranslateDeep,
    restoreProtectedNode,
    restoreProtectedAncestors,
    stopOverlayAntiTranslateObserver,
    pauseOverlayAntiTranslateObserverForScroll,
    pauseOverlayAntiTranslateObserverForMutationBurst,
    startOverlayAntiTranslateObserver
  };
}

export { createPageGuards };
