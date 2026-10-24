// @ts-nocheck
// The search shortcut reloads New Tab to take keyboard focus from the
// address bar (see input-focus.ts). This carries the page across that
// reload: the query, its search mode and the results on screen. A
// cross-document view transition keeps the old page's last frame on screen
// until the reloaded page shows the same search, so the reload never shows.
const STORAGE_KEY = 'lumno:newtab-focus-resume';
const MAX_AGE_MS = 5000;
// Never hold the old frame longer than this, whatever is still loading.
const MAX_HOLD_MS = 1200;
const VIEW_TRANSITION_STYLE_ATTRIBUTE = 'data-nt-focus-resume-transition';
// Both pages opt in. The old frame stays opaque over the new page until the
// transition is skipped, or until the hold runs out.
const OUTGOING_TRANSITION_CSS = '@view-transition { navigation: auto; }';
const INCOMING_TRANSITION_CSS = `${OUTGOING_TRANSITION_CSS}
@keyframes x-nt-focus-resume-hold { from, to { opacity: 1; } }
@keyframes x-nt-focus-resume-wait { from, to { opacity: 0; } }
::view-transition-group(root) { animation-duration: ${MAX_HOLD_MS}ms; }
::view-transition-old(root) { animation: x-nt-focus-resume-hold ${MAX_HOLD_MS}ms step-end both; }
::view-transition-new(root) { animation: x-nt-focus-resume-wait ${MAX_HOLD_MS}ms step-end both; }
html[data-nt-focus-resume-settling="true"] body *,
html[data-nt-focus-resume-settling="true"] body *::before,
html[data-nt-focus-resume-settling="true"] body *::after {
transition: none !important;
animation-duration: 0s !important;
animation-delay: 0s !important;
}`;

let heldTransition = null;

// Chrome reloads the same tab, so session storage carries the search.
// Firefox swaps in a new tab, which shares only local storage.
function getStorage() {
  try {
    return globalThis.location.protocol === 'moz-extension:' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch (_error) {
    return null;
  }
}

function readSnapshot(consume) {
  const storage = getStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    if (consume) {
      storage.removeItem(STORAGE_KEY);
    }
    const snapshot = JSON.parse(raw);
    const age = Date.now() - Number(snapshot && snapshot.savedAt);
    return age >= 0 && age <= MAX_AGE_MS ? snapshot : null;
  } catch (_error) {
    return null;
  }
}

function saveSnapshot(snapshot) {
  const storage = getStorage();
  if (!storage || !snapshot) {
    return false;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (_error) {
    return false;
  }
}

function addTransitionStyle(cssText) {
  const head = document.head || document.documentElement;
  if (!head || document.querySelector(`style[${VIEW_TRANSITION_STYLE_ATTRIBUTE}]`)) {
    return;
  }
  const style = document.createElement('style');
  style.setAttribute(VIEW_TRANSITION_STYLE_ATTRIBUTE, 'true');
  style.textContent = cssText;
  head.appendChild(style);
}

// Runs in the head of the reloaded page, before its first frame. Marks the
// load as a resume and keeps the old frame up while the page rebuilds.
function prepareResumeLoad() {
  const documentElement = document.documentElement;
  if (!documentElement || !readSnapshot(false)) {
    return false;
  }
  documentElement.setAttribute('data-nt-focus-resume', 'true');
  documentElement.setAttribute('data-nt-focus-route-pending', 'true');
  // The page rebuilds out of sight, so it shows up settled: no entry fades
  // or opening results.
  documentElement.setAttribute('data-nt-focus-resume-settling', 'true');
  addTransitionStyle(INCOMING_TRANSITION_CSS);
  globalThis.addEventListener('pagereveal', (event) => {
    heldTransition = event && event.viewTransition ? event.viewTransition : null;
  }, { once: true });
  return true;
}

function createFocusResume(deps) {
  const {
    getSiteSearchSnapshotId,
    findSiteSearchBySnapshotId,
    activateSiteSearch,
    activateLocalSearchScope,
    restoreSearchModeQuery,
    showSuggestionSnapshot,
    focusSearchInputPreservingScroll
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function captureSearch() {
    const input = pageState.inputParts && pageState.inputParts.input;
    const value = input ? String(input.value || '') : '';
    // Inline autocomplete writes its completion into the input; keep what
    // the user typed.
    const typed = String(pageState.latestRawQuery || '');
    return {
      savedAt: Date.now(),
      rawQuery: typed && value.startsWith(typed) ? typed : value,
      siteSearchId: pageState.siteSearchState ? getSiteSearchSnapshotId(pageState.siteSearchState) : '',
      localSourceType: pageState.localSearchScopeState ? pageState.localSearchScopeState.sourceType : '',
      suggestions: Array.isArray(pageState.lastSuggestionResponse) ? pageState.lastSuggestionResponse : [],
      selectedIndex: Number.isInteger(pageState.selectedIndex) ? pageState.selectedIndex : -1
    };
  }

  // Called right before the focus reload.
  function prepareFocusReload() {
    const saved = saveSnapshot(captureSearch());
    if (saved) {
      addTransitionStyle(OUTGOING_TRANSITION_CSS);
    }
    return saved;
  }

  function restoreSearch(snapshot) {
    const input = pageState.inputParts && pageState.inputParts.input;
    if (!input) {
      return;
    }
    // Each mode clears the input, so the mode goes first.
    if (snapshot.localSourceType) {
      activateLocalSearchScope({ sourceType: snapshot.localSourceType }, { preserveResults: true });
    } else if (snapshot.siteSearchId) {
      const provider = findSiteSearchBySnapshotId(snapshot.siteSearchId);
      if (provider) {
        activateSiteSearch(provider, { preserveResults: true, animatePrefix: false });
      }
    }
    const rawQuery = String(snapshot.rawQuery || '');
    let rendered = Promise.resolve();
    if (rawQuery) {
      restoreSearchModeQuery(rawQuery);
      rendered = showSuggestionSnapshot(
        Array.isArray(snapshot.suggestions) ? snapshot.suggestions : [],
        rawQuery.trim(),
        Number.isInteger(snapshot.selectedIndex) ? snapshot.selectedIndex : -1
      );
    }
    // The shortcut selects the query, as it does when the page has focus.
    try {
      input.select();
    } catch (_error) {
      // Ignore selection failures.
    }
    return rendered;
  }

  function nextFrame() {
    return new Promise((resolve) => {
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(() => resolve());
      } else {
        globalThis.setTimeout(resolve, 16);
      }
    });
  }

  function whenPageReady() {
    return new Promise((resolve) => {
      const body = document.body;
      if (!body || body.getAttribute('data-nt-ready') === '1' || typeof globalThis.MutationObserver !== 'function') {
        resolve();
        return;
      }
      const observer = new globalThis.MutationObserver(() => {
        if (body.getAttribute('data-nt-ready') === '1') {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(body, { attributes: true, attributeFilter: ['data-nt-ready'] });
    });
  }

  function reveal() {
    const documentElement = document.documentElement;
    if (!documentElement || documentElement.getAttribute('data-nt-focus-route-pending') !== 'true') {
      return;
    }
    documentElement.removeAttribute('data-nt-focus-route-pending');
    if (heldTransition && typeof heldTransition.skipTransition === 'function') {
      heldTransition.skipTransition();
    }
    heldTransition = null;
    if (globalThis.performance && typeof globalThis.performance.mark === 'function') {
      globalThis.performance.mark('lumno-newtab-milestone-focus-resume-visible');
    }
    // A hidden input cannot take focus, so focus waits for the reveal.
    focusSearchInputPreservingScroll();
    nextFrame().then(nextFrame).then(() => {
      documentElement.removeAttribute('data-nt-focus-resume-settling');
    });
  }

  // providersReady resolves once the site search providers can be looked up.
  function resume(providersReady) {
    const documentElement = document.documentElement;
    if (!documentElement || documentElement.getAttribute('data-nt-focus-resume') !== 'true') {
      return Promise.resolve(false);
    }
    const snapshot = readSnapshot(true);
    const holdTimer = globalThis.setTimeout(reveal, MAX_HOLD_MS);
    // Restore after the providers load: their search modes are looked up
    // by id, and the page re-requests results for the current query once
    // aggregate searches arrive, which would replace the saved results.
    const restored = Promise.resolve(providersReady).catch(() => {}).then(() => {
      return snapshot ? restoreSearch(snapshot) : null;
    }).catch((error) => {
      console.warn('[Lumno] Failed to restore the search after the focus reload.', error);
    });
    // One more frame lets layout that waits for a frame (the results'
    // position) land before the reveal.
    return Promise.all([restored, whenPageReady()]).then(nextFrame).then(() => {
      globalThis.clearTimeout(holdTimer);
      reveal();
      return Boolean(snapshot);
    });
  }

  return {
    prepareFocusReload,
    resume
  };
}

export { prepareResumeLoad, createFocusResume };
