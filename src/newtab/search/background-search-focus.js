(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoNewtabBackgroundSearchFocus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function shouldFocusSearchFromPointer(event, backgroundTargets) {
    if (!event || event.defaultPrevented || !event.target || !Array.isArray(backgroundTargets)) {
      return false;
    }
    return backgroundTargets.some((target) => Boolean(target) && event.target === target);
  }

  function createBackgroundFocusHandler(options) {
    const config = options || {};
    if (typeof config.getBackgroundTargets !== 'function' || typeof config.focusSearch !== 'function') {
      throw new Error('Background search focus requires target and focus callbacks.');
    }
    let focusedFromTarget = null;
    return function handleBackgroundPointerFocus(event) {
      // The mousedown that follows a focusing pointerdown would blur the input
      // again (its default action on a non-focusable background), leaving no caret.
      if (event && event.type === 'mousedown') {
        const keepFocus = Boolean(focusedFromTarget) && event.target === focusedFromTarget;
        focusedFromTarget = null;
        if (keepFocus) {
          event.preventDefault();
        }
        return keepFocus;
      }
      focusedFromTarget = null;
      if (!shouldFocusSearchFromPointer(event, config.getBackgroundTargets())) {
        return false;
      }
      const searchValue = typeof config.getSearchValue === 'function'
        ? String(config.getSearchValue() || '')
        : '';
      if (searchValue) {
        if (typeof config.dismissSearchResults === 'function') {
          config.dismissSearchResults();
        }
        return true;
      }
      if (config.focusSearch() !== false) {
        focusedFromTarget = event.target;
      }
      return true;
    };
  }

  return Object.freeze({
    createBackgroundFocusHandler,
    shouldFocusSearchFromPointer
  });
});
