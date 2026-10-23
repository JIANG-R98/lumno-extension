// Bookmark grid paging: page slicing, pager buttons, grid height lock and
// animated page switches.
import * as LumnoNewtabCrossSurfaceDrag from '../cross-surface-drag.js';

function createBookmarkPager(deps) {
  const {
    isBookmarkTopbarMode,
    getBookmarkLimit,
    NEWTAB_BOOKMARKS_STORE,
    hideTopActionTooltip,
    getBookmarkGridColumnCount,
    renderBookmarks,
    updateBookmarkSectionPosition
  } = deps;

  // The page state object shared with newtab.js and the other modules.
  const pageState = deps.pageState;

  function getBookmarkPageCount() {
    if (isBookmarkTopbarMode()) {
      return 1;
    }
    const total = Array.isArray(pageState.bookmarkAllItems) ? pageState.bookmarkAllItems.length : 0;
    return Math.max(1, Math.ceil(total / getBookmarkLimit()));
  }

  function getBookmarkPageItems() {
    if (!Array.isArray(pageState.bookmarkAllItems) || pageState.bookmarkAllItems.length === 0) {
      return [];
    }
    if (isBookmarkTopbarMode()) {
      pageState.bookmarkCurrentPage = 0;
      return pageState.bookmarkAllItems.slice();
    }
    const pageCount = getBookmarkPageCount();
    pageState.bookmarkCurrentPage = Math.min(Math.max(0, pageState.bookmarkCurrentPage), pageCount - 1);
    return NEWTAB_BOOKMARKS_STORE.getBookmarkPageItems(
      pageState.bookmarkAllItems,
      pageState.bookmarkCurrentPage,
      getBookmarkLimit()
    );
  }

  function setBookmarkPagerButtonAvailability(button, available) {
    if (!button) {
      return;
    }
    const enabled = Boolean(available);
    button.removeAttribute('disabled');
    button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    button.tabIndex = enabled ? 0 : -1;
    if (!enabled && document.activeElement === button) {
      button.blur();
      hideTopActionTooltip();
    }
  }

  function updateBookmarkPagerState() {
    if (!pageState.bookmarkPagerPrevButton || !pageState.bookmarkPagerNextButton) {
      return;
    }
    const pageCount = getBookmarkPageCount();
    const atStart = pageState.bookmarkCurrentPage <= 0;
    const atEnd = pageState.bookmarkCurrentPage >= (pageCount - 1);
    setBookmarkPagerButtonAvailability(pageState.bookmarkPagerPrevButton, !atStart);
    setBookmarkPagerButtonAvailability(pageState.bookmarkPagerNextButton, !atEnd);
  }

  function updateBookmarkGridHeightLock() {
    if (!pageState.bookmarkGrid) {
      return;
    }
    if (pageState.bookmarkGrid.getAttribute('data-bookmark-empty-drop-surface') === 'true') {
      pageState.bookmarkGrid.style.setProperty(
        'min-height',
        `${isBookmarkTopbarMode() ? 44 : 64}px`
      );
      return;
    }
    if (isBookmarkTopbarMode()) {
      pageState.bookmarkGrid.style.removeProperty('min-height');
      return;
    }
    const total = Array.isArray(pageState.bookmarkAllItems) ? pageState.bookmarkAllItems.length : 0;
    const cols = getBookmarkGridColumnCount();
    const firstCard = pageState.bookmarkGrid.querySelector('.x-nt-bookmark-card');
    const cardHeight = firstCard ? firstCard.getBoundingClientRect().height : 51;
    const gridStyle = window.getComputedStyle(pageState.bookmarkGrid);
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 16;
    const isAtRoot = String(pageState.bookmarkCurrentFolderId || '') === String(pageState.bookmarkRootFolderId || '1');
    const pageLimit = getBookmarkLimit();
    let targetItemCount = 0;

    if (isAtRoot) {
      if (total <= pageLimit) {
        pageState.bookmarkGrid.style.removeProperty('min-height');
        return;
      }
      targetItemCount = pageLimit;
    } else {
      if (pageState.bookmarkRootTotalCount > pageLimit) {
        targetItemCount = pageLimit;
      } else {
        targetItemCount = Math.max(0, pageState.bookmarkRootVisibleCount);
      }
      if (targetItemCount <= 0) {
        if (total <= pageLimit) {
          pageState.bookmarkGrid.style.removeProperty('min-height');
          return;
        }
        targetItemCount = pageLimit;
      }
    }

    const rowsPerPage = Math.max(1, Math.ceil(targetItemCount / cols));
    const minHeight = (rowsPerPage * cardHeight) + ((rowsPerPage - 1) * rowGap);
    pageState.bookmarkGrid.style.setProperty('min-height', `${Math.ceil(minHeight)}px`);
  }

  // A page slide lasts PAGE_SLIDE_MS. Past PAGE_SLIDE_INTERRUPTIBLE_MS the new
  // page is ~97% of the way in, so the next turn may start from where its
  // cards are; a turn asked for before then waits for that point.
  const PAGE_SLIDE_MS = 520;
  const PAGE_SLIDE_INTERRUPTIBLE_MS = 260;
  const now = typeof deps.now === 'function' ? deps.now : () => performance.now();
  let pageSlide = null;
  let queuedPage = null;
  let queuedPageTimer = 0;

  function clearQueuedBookmarkPage() {
    if (queuedPageTimer) window.clearTimeout(queuedPageTimer);
    queuedPageTimer = 0;
    queuedPage = null;
  }

  function queueBookmarkPage(targetPage) {
    if (targetPage === pageState.bookmarkCurrentPage) {
      clearQueuedBookmarkPage();
      return;
    }
    queuedPage = targetPage;
    if (queuedPageTimer) return;
    const wait = Math.max(0, PAGE_SLIDE_INTERRUPTIBLE_MS - (now() - pageSlide.startedAt));
    queuedPageTimer = window.setTimeout(() => {
      const page = queuedPage;
      queuedPageTimer = 0;
      queuedPage = null;
      if (page !== null) switchBookmarkPage(page);
    }, wait);
  }

  // The horizontal offset an interrupted slide has left on a card.
  function readSlideOffset(element) {
    const transform = element ? window.getComputedStyle(element).transform : '';
    if (!transform || transform === 'none' || typeof DOMMatrixReadOnly !== 'function') return 0;
    return new DOMMatrixReadOnly(transform).m41 || 0;
  }

  function renderCurrentBookmarkPage() {
    clearQueuedBookmarkPage();
    if (pageSlide) pageSlide.finish();
    renderBookmarks(getBookmarkPageItems());
    updateBookmarkPagerState();
  }

  function switchBookmarkPageDuringDrag(nextPage) {
    const pageCount = getBookmarkPageCount();
    const targetPage = Math.min(Math.max(0, Number(nextPage) || 0), pageCount - 1);
    if (targetPage === pageState.bookmarkCurrentPage || pageState.bookmarkPageAnimating) {
      return false;
    }
    pageState.bookmarkCurrentPage = targetPage;
    renderCurrentBookmarkPage();
    updateBookmarkSectionPosition();
    return true;
  }

  function switchBookmarkPage(nextPage) {
    const pageCount = getBookmarkPageCount();
    const targetPage = Math.min(Math.max(0, Number(nextPage) || 0), pageCount - 1);
    if (pageSlide && now() - pageSlide.startedAt < PAGE_SLIDE_INTERRUPTIBLE_MS) {
      queueBookmarkPage(targetPage);
      return;
    }
    clearQueuedBookmarkPage();
    if (targetPage === pageState.bookmarkCurrentPage) {
      return;
    }
    const grid = pageState.bookmarkGrid;
    const crossSurfaceDrag = LumnoNewtabCrossSurfaceDrag;
    const motionDisabled = document.documentElement.getAttribute('data-lumno-motion-effects') === 'off';
    if (!grid || typeof grid.animate !== 'function' || motionDisabled ||
        (crossSurfaceDrag && crossSurfaceDrag.prefersReducedMotion(window))) {
      pageState.bookmarkCurrentPage = targetPage;
      renderCurrentBookmarkPage();
      updateBookmarkSectionPosition();
      return;
    }
    // Pick up from where an interrupted slide left the cards, so they never jump.
    const carry = pageSlide ? readSlideOffset(pageSlide.cards[0]) : 0;
    if (pageSlide) pageSlide.finish();
    const direction = targetPage > pageState.bookmarkCurrentPage ? 1 : -1;
    const gridStyle = window.getComputedStyle(grid);
    const distance = grid.getBoundingClientRect().width + (Number.parseFloat(gridStyle.columnGap) || 0);
    const outgoing = grid.cloneNode(true);
    outgoing.removeAttribute('id');
    outgoing.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    outgoing.setAttribute('aria-hidden', 'true');
    outgoing.inert = true;
    // The copied cards still name lenses that go with the cards React is about to replace, and a
    // missing filter voids a backdrop-filter, so they slide out with their blur alone. The marker
    // keeps the liquid surfaces from building lenses for a page that is leaving.
    outgoing.setAttribute('data-bookmark-page-outgoing', 'true');
    outgoing.querySelectorAll('*').forEach((element) => {
      if (element.style) element.style.removeProperty('--x-nt-glass-refraction');
    });
    Object.assign(outgoing.style, {
      position: 'absolute', inset: '0', width: '100%', display: 'grid',
      gridTemplateColumns: gridStyle.gridTemplateColumns,
      columnGap: gridStyle.columnGap, rowGap: gridStyle.rowGap,
      alignContent: 'start', pointerEvents: 'none'
    });
    pageState.bookmarkCurrentPage = targetPage;
    renderCurrentBookmarkPage();
    updateBookmarkSectionPosition();
    const incomingCards = Array.from(grid.children);
    // Clip only across the slide, so the cards' shadows above and below stay drawn.
    const previousOverflow = grid.style.getPropertyValue('overflow-x');
    const previousPriority = grid.style.getPropertyPriority('overflow-x');
    grid.style.setProperty('overflow-x', 'clip');
    grid.appendChild(outgoing);
    pageState.bookmarkPageAnimating = true;
    // Slide directly to the destination with a long, smooth deceleration.
    const timing = { duration: PAGE_SLIDE_MS, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' };
    const slideFrames = (from, to) => [
      { transform: `translateX(${from}px)`, offset: 0 },
      { transform: `translateX(${to}px)`, offset: 1 }
    ];
    const animations = [outgoing.animate(slideFrames(carry, -direction * distance), timing),
      ...incomingCards.map((card) => card.animate(slideFrames(direction * distance, 0), timing))];
    const startTime = animations[0].startTime;
    if (startTime !== null) animations.forEach((animation) => { animation.startTime = startTime; });
    const slide = {
      startedAt: now(),
      cards: incomingCards,
      finish() {
        if (pageSlide !== slide) return;
        pageSlide = null;
        animations.forEach((animation) => animation.cancel());
        outgoing.remove();
        if (previousOverflow) grid.style.setProperty('overflow-x', previousOverflow, previousPriority);
        else grid.style.removeProperty('overflow-x');
        pageState.bookmarkPageAnimating = false;
      }
    };
    pageSlide = slide;
    Promise.all(animations.map((animation) => animation.finished)).then(slide.finish).catch(slide.finish);
  }

  // Wheel and trackpad paging. A trackpad swipe arrives as a stream of events
  // (finger movement, then momentum) and turns one page; each mouse wheel
  // notch turns one page.
  const WHEEL_GESTURE_GAP_MS = 160;
  const WHEEL_TURN_DISTANCE_PX = 6;
  const WHEEL_REVERSE_MIN_PX = 4;
  const wheelGesture = { lastAt: -Infinity, horizontal: false, sign: 0, notched: false,
    total: 0, turned: false, peak: 0, floor: 0 };

  // Chrome reports a trackpad's wheelDelta as -3x its pixel delta; a mouse
  // notch is a multiple of 120 that does not follow that ratio.
  function isWheelNotch(event, horizontal) {
    if (event.deltaMode === 1 || event.deltaMode === 2) return true;
    const wheelDelta = Number(horizontal ? event.wheelDeltaX : event.wheelDeltaY) || 0;
    const delta = Number(horizontal ? event.deltaX : event.deltaY) || 0;
    return wheelDelta !== 0 && wheelDelta % 120 === 0 && Math.abs(wheelDelta + delta * 3) >= 1;
  }

  function handleBookmarkWheel(event) {
    if (!event || event.ctrlKey || getBookmarkPageCount() <= 1) {
      return;
    }
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerWidth : 1;
    const deltaX = (Number(event.deltaX) || 0) * unit;
    const deltaY = (Number(event.deltaY) || 0) * unit;
    if (!deltaX && !deltaY) {
      return;
    }
    event.preventDefault();
    const gesture = wheelGesture;
    const at = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : now();
    // A gesture keeps the axis it started on, so trackpad drift on the other
    // axis cannot split one swipe into two.
    const ongoing = at - gesture.lastAt <= WHEEL_GESTURE_GAP_MS;
    const horizontal = ongoing ? gesture.horizontal : Math.abs(deltaX) > Math.abs(deltaY);
    const delta = horizontal ? deltaX : deltaY;
    gesture.lastAt = at;
    if (!delta) {
      return;
    }
    const size = Math.abs(delta);
    const reversed = Math.sign(delta) !== gesture.sign && size >= WHEEL_REVERSE_MIN_PX;
    // Once a swipe has turned the page its momentum only slows down, so a
    // burst well above where it slowed to is a new swipe.
    const renewed = gesture.turned && !gesture.notched &&
      gesture.floor <= gesture.peak / 4 && size >= Math.max(16, gesture.floor * 3);
    if (!ongoing || reversed || renewed) {
      Object.assign(gesture, { horizontal, sign: Math.sign(delta), notched: isWheelNotch(event, horizontal),
        total: 0, turned: false, peak: 0, floor: 0 });
    } else if (Math.sign(delta) !== gesture.sign) {
      return;
    }
    gesture.total += size;
    if (size >= gesture.peak) {
      gesture.peak = size;
      gesture.floor = size;
    } else {
      gesture.floor = Math.min(gesture.floor, size);
    }
    if (!gesture.notched && (gesture.turned || gesture.total < WHEEL_TURN_DISTANCE_PX)) {
      return;
    }
    gesture.turned = true;
    const targetPage = pageState.bookmarkCurrentPage + gesture.sign;
    if (targetPage >= 0 && targetPage < getBookmarkPageCount()) {
      switchBookmarkPage(targetPage);
    }
  }

  return {
    getBookmarkPageCount,
    updateBookmarkPagerState,
    updateBookmarkGridHeightLock,
    renderCurrentBookmarkPage,
    switchBookmarkPageDuringDrag,
    switchBookmarkPage,
    handleBookmarkWheel
  };
}

export { createBookmarkPager };
