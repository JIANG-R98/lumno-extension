'use strict';

// Lets a test wait for a JSDOM page the way it would have moved on on an idle
// machine. settle(ms) waits ms, then also for every timer and animation frame
// the page had due by then, and for its DOM to stop changing. On a busy
// machine timers fire late, so a fixed wait can end while the page is still
// halfway through what an idle machine finishes in that time; this wait does
// not.
//
// Each timer and frame is due at the time an idle machine would run it: one
// that fires late schedules its own from when it was due, not from when it
// ran. While settle(ms) waits past ms for the page to catch up, the page's time
// stands at ms: what it schedules counts from there, and timers and frames due
// after ms are held back until the wait is over, then run as many
// milliseconds later as they were due after ms. The page's clock then skips
// the extra wait, so a timer whose native callback only runs after the wait
// still fires when the page's own time reaches it. So the extra waiting on a
// busy machine does not reach into the page's own time windows (a double-press
// window, a hover delay, a toast's lifetime), and a test sees the states it
// would see on an idle machine. Outside settle() the page's clock runs at real
// speed, so tests that wait on their own still line up with it. The extra wait
// is capped, so a page that never goes quiet still moves on.

const QUIET_MS = 10;
const POLL_MS = 5;
const MAX_EXTRA_WAIT_MS = 2000;
// waitFor() measures its timeout in the page's time; a page that stalls
// still gives up after this much real time.
const MAX_REAL_WAIT_MS = 30000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function trackPageTimers(window) {
  // Pending timers and frames by key, with the time each is due.
  const due = new Map();
  const timerKeys = new Map();
  const frameKeys = new Map();
  let nextKey = 1;
  // The time the timer or frame callback running right now was due.
  let runningDueAt = null;
  let lastMutationAt = 0;
  // While a settle() waits past its time, what comes due after that time waits
  // in `held` until it is over.
  const settleTargets = [];
  let heldAfter = Infinity;
  let held = [];
  // Real time the page's clock has skipped: the extra waits of past settles.
  let skipped = 0;
  const pageClock = () => Date.now() - skipped;
  const now = () => (runningDueAt !== null ? runningDueAt : Math.min(pageClock(), heldAfter));

  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeRequestFrame = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : null;
  const nativeCancelFrame = nativeRequestFrame ? window.cancelAnimationFrame.bind(window) : null;

  // Runs a due timer or frame unless it was cancelled, holds it back, or
  // waits again when the page's clock has not reached it yet.
  function fire(key, dueAt, run, rearm) {
    if (!due.has(key)) {
      return;
    }
    if (dueAt > heldAfter) {
      held.push({ dueAt, rearm });
      return;
    }
    if (dueAt > pageClock()) {
      rearm(dueAt - pageClock());
      return;
    }
    due.delete(key);
    const previous = runningDueAt;
    runningDueAt = dueAt;
    try {
      run();
    } finally {
      runningDueAt = previous;
    }
  }

  window.setTimeout = function(callback, ms, ...args) {
    if (typeof callback !== 'function') {
      return nativeSetTimeout(callback, ms, ...args);
    }
    const dueAt = now() + Math.max(0, Number(ms) || 0);
    const key = `timer:${nextKey++}`;
    // The id stays mapped until the callback runs, so clearTimeout still
    // cancels a timer that was held back or waits again.
    const run = () => {
      timerKeys.delete(id);
      callback(...args);
    };
    const attempt = () => fire(key, dueAt, run, (after) => nativeSetTimeout(attempt, after));
    const id = nativeSetTimeout(attempt, ms);
    due.set(key, dueAt);
    timerKeys.set(id, key);
    return id;
  };
  window.clearTimeout = function(id) {
    const key = timerKeys.get(id);
    if (key) {
      due.delete(key);
      timerKeys.delete(id);
    }
    return nativeClearTimeout(id);
  };

  if (nativeRequestFrame) {
    window.requestAnimationFrame = function(callback) {
      const dueAt = now() + 16;
      const key = `frame:${nextKey++}`;
      const run = (time) => {
        frameKeys.delete(id);
        callback(time);
      };
      const attempt = (time) => fire(key, dueAt, () => run(time), () => nativeRequestFrame(attempt));
      const id = nativeRequestFrame(attempt);
      due.set(key, dueAt);
      frameKeys.set(id, key);
      return id;
    };
    window.cancelAnimationFrame = function(id) {
      const key = frameKeys.get(id);
      if (key) {
        due.delete(key);
        frameKeys.delete(id);
      }
      return nativeCancelFrame(id);
    };
  }

  // A closed window drops its timers without running them.
  const nativeClose = window.close.bind(window);
  window.close = function() {
    due.clear();
    held = [];
    return nativeClose();
  };

  new window.MutationObserver(() => {
    lastMutationAt = Date.now();
  }).observe(window.document, { subtree: true, childList: true, attributes: true, characterData: true });

  const hasDueBy = (target) => {
    for (const dueAt of due.values()) {
      if (dueAt <= target) return true;
    }
    return false;
  };

  async function settle(ms) {
    const wait = ms === undefined ? 30 : ms;
    const target = pageClock() + wait;
    settleTargets.push(target);
    heldAfter = Math.max(...settleTargets);
    try {
      await delay(wait);
      const deadline = Date.now() + MAX_EXTRA_WAIT_MS;
      while (Date.now() < deadline &&
          (hasDueBy(target) || Date.now() - lastMutationAt < QUIET_MS)) {
        await delay(POLL_MS);
      }
    } finally {
      const stoppedAt = heldAfter;
      settleTargets.splice(settleTargets.indexOf(target), 1);
      heldAfter = settleTargets.length ? Math.max(...settleTargets) : Infinity;
      if (!settleTargets.length) {
        skipped += Math.max(0, pageClock() - stoppedAt);
      }
      const release = held.filter((entry) => entry.dueAt <= heldAfter);
      held = held.filter((entry) => entry.dueAt > heldAfter);
      release.forEach((entry) => entry.rearm(Math.max(0, entry.dueAt - now())));
    }
  }

  // Polls condition() between settles until it is truthy or timeoutMs of the
  // page's time have passed, then checks once more, and returns its value.
  async function waitFor(condition, timeoutMs) {
    const deadline = pageClock() + timeoutMs;
    const realDeadline = Date.now() + Math.max(timeoutMs, MAX_REAL_WAIT_MS);
    while (pageClock() < deadline && Date.now() < realDeadline) {
      const value = condition();
      if (value) return value;
      await settle(10);
    }
    return condition();
  }

  return { settle, waitFor };
}

module.exports = { trackPageTimers };
