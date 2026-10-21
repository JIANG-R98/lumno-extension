const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

// Pages switch at once (reduced motion) unless `animated` is set, so each
// test counts page turns directly.
function fixture({ page = 3, pages = 8, animated = false } = {}) {
  const dom = new JSDOM('<div id="grid"></div>', { runScripts: 'outside-only' });
  const { window } = dom;
  const env = { clock: 0, timers: [] };
  window.Element.prototype.animate = () => ({ startTime: 0, finished: new Promise(() => {}), cancel() {} });
  window.setTimeout = (fn, ms) => env.timers.push({ fn, ms });
  window.clearTimeout = () => {};
  window.LumnoNewtabCrossSurfaceDrag = { prefersReducedMotion: () => !animated };
  window.eval(fs.readFileSync(require.resolve('../../src/newtab/bookmarks/bookmark-pager.js'), 'utf8'));
  const state = { bookmarkGrid: window.document.getElementById('grid'),
    bookmarkAllItems: Array.from({ length: pages }, (_, id) => ({ id })), bookmarkCurrentPage: page };
  const pager = window.LumnoNewtabBookmarkPager.createBookmarkPager({ pageState: state, now: () => env.clock,
    isBookmarkTopbarMode: () => false, getBookmarkLimit: () => 1,
    NEWTAB_BOOKMARKS_STORE: { getBookmarkPageItems: (items, index) => items.slice(index, index + 1) },
    hideTopActionTooltip() {}, getBookmarkGridColumnCount: () => 1, updateBookmarkSectionPosition() {},
    renderBookmarks() {} });
  let at = 1000;
  // Sends events 16ms apart (a trackpad's rate) unless one sets its own gap.
  const send = (...events) => events.map(({ gap = 16, ...event }) => {
    at += gap;
    env.clock = at;
    let prevented = false;
    pager.handleBookmarkWheel({ deltaX: 0, deltaY: 0, deltaMode: 0, timeStamp: at,
      preventDefault() { prevented = true; }, ...event });
    return prevented;
  });
  const swipe = (axis, deltas, first = {}) => deltas.map((delta, index) => ({
    [axis]: delta, [axis === 'deltaX' ? 'wheelDeltaX' : 'wheelDeltaY']: -3 * delta, ...(index === 0 ? first : {})
  }));
  return { state, env, send, swipe };
}

const flick = [2, 5, 12, 30, 40, 30, 20, 12, 8, 5, 3, 2, 1, 1];

let f = fixture();
assert(f.send(...f.swipe('deltaX', flick)).every(Boolean), 'swipe events never scroll the page');
assert.equal(f.state.bookmarkCurrentPage, 4, 'one swipe, accelerating then coasting on momentum, turns one page');

f = fixture();
f.send(...f.swipe('deltaX', flick.map(delta => -delta)));
assert.equal(f.state.bookmarkCurrentPage, 2, 'swiping the other way turns back');

f = fixture();
f.send(...f.swipe('deltaY', flick));
assert.equal(f.state.bookmarkCurrentPage, 4, 'vertical scrolling still turns pages');

f = fixture();
f.send(...f.swipe('deltaX', [1, 1, 1, 1, 1]));
assert.equal(f.state.bookmarkCurrentPage, 3);
f.send(...f.swipe('deltaX', [1, 1, 1]));
assert.equal(f.state.bookmarkCurrentPage, 4, 'a slow swipe turns once it has moved 6px');

f = fixture();
f.send(...f.swipe('deltaX', flick), ...f.swipe('deltaX', flick, { gap: 200 }));
assert.equal(f.state.bookmarkCurrentPage, 5, 'a pause ends the gesture, so the next swipe turns again');

f = fixture();
f.send(...f.swipe('deltaX', [...flick.slice(0, 10), 8, 20, 35, 20, 5]));
assert.equal(f.state.bookmarkCurrentPage, 5, 'a new swipe during momentum turns again');

f = fixture();
f.send(...f.swipe('deltaX', [30, 28, 26, 30, 27, 25]));
assert.equal(f.state.bookmarkCurrentPage, 4, 'momentum jitter is not a new swipe');

f = fixture();
f.send(...f.swipe('deltaX', [8, 12, 10, 6, 3]), ...f.swipe('deltaX', [-10, -20, -10]));
assert.equal(f.state.bookmarkCurrentPage, 3, 'reversing mid-gesture turns back');

f = fixture();
f.send({ deltaX: 6, deltaY: 1 }, { deltaX: 12, deltaY: 3 }, { deltaX: 1, deltaY: -3 },
  { deltaX: 2, deltaY: -2 }, { deltaX: 1, deltaY: 2 }, { deltaX: 1, deltaY: 0 });
assert.equal(f.state.bookmarkCurrentPage, 4, 'drift on the other axis does not split a swipe');

f = fixture();
f.send({ deltaX: -25, deltaY: 10 });
assert.equal(f.state.bookmarkCurrentPage, 2, 'diagonal input uses the dominant axis');

f = fixture();
f.send({ deltaY: 100, wheelDeltaY: -120 }, { deltaY: 100, wheelDeltaY: -120, gap: 40 },
  { deltaY: 100, wheelDeltaY: -120, gap: 40 });
assert.equal(f.state.bookmarkCurrentPage, 6, 'each mouse notch turns a page');
f.send({ deltaY: -4, wheelDeltaY: 120, gap: 300 });
assert.equal(f.state.bookmarkCurrentPage, 5, 'a small macOS mouse notch still turns a page');
f.send({ deltaY: 1, deltaMode: 1, gap: 300 }, { deltaX: -1, deltaMode: 2, gap: 300 });
assert.equal(f.state.bookmarkCurrentPage, 5, 'line and page units count as notches');

f = fixture();
assert.deepEqual(f.send({ deltaX: 20, ctrlKey: true }, { deltaX: 0, deltaY: 0 }), [false, false]);
assert.equal(f.state.bookmarkCurrentPage, 3, 'zoom gestures and empty events are left alone');

f = fixture({ page: 0 });
assert.deepEqual(f.send({ deltaX: -20 }), [true]);
assert.equal(f.state.bookmarkCurrentPage, 0, 'no turn past the first page');
f = fixture({ pages: 1, page: 0 });
assert.deepEqual(f.send({ deltaX: 20 }), [false], 'a single page lets the wheel through');

// With motion on, a new swipe during the slide's first half waits for its tail.
f = fixture({ animated: true });
f.send(...f.swipe('deltaX', flick.slice(0, 10)));
assert.equal(f.state.bookmarkCurrentPage, 4);
f.send(...f.swipe('deltaX', [8, 20]));
assert.equal(f.state.bookmarkCurrentPage, 4);
assert.equal(f.env.timers.length, 1, 'the second swipe is queued, not dropped');
f.env.clock += 1000;
f.env.timers.splice(0).forEach(timer => timer.fn());
assert.equal(f.state.bookmarkCurrentPage, 5);

console.log('Bookmark wheel tests passed: one page per swipe, momentum, renewed swipes, drift, reversal, notches, units, zoom and boundaries');
