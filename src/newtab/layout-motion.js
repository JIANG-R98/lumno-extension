// Eases the page's blocks into place when a layout pass moves them. Every
// pass reports in through `commit()`, which compares where each block now
// sits with where the last pass left it and plays the difference as a
// translate from the old spot to the new one. Showing or hiding a block,
// or switching a mode that changes its height, then moves the blocks that
// stay instead of letting them jump.
//
// Blocks are measured in document coordinates with their scrolled
// ancestors' offsets added back, so scrolling a container is not a move,
// and without the offset this module is playing, so a pass during a move
// picks up from where the block is drawn.
//
// Each target names the element to measure and the one to move (`mover`,
// itself by default). Targets sharing a mover move only when they all
// shifted alike: the bottom dock moves as a whole when its sections slide
// together, since its scroller clips a section moved on its own past the
// dock's new edge.
const LAYOUT_MOTION_DURATION_MS = 340;
const LAYOUT_MOTION_EASING = 'cubic-bezier(0.65, 0, 0.35, 1)';
const MIN_SHIFT_PX = 0.5;
const SHARED_SHIFT_TOLERANCE_PX = 1;

function parseTranslate(value) {
  if (!value || value === 'none') {
    return { x: 0, y: 0 };
  }
  const parts = String(value).trim().split(/\s+/);
  const x = Number.parseFloat(parts[0]);
  const y = Number.parseFloat(parts[1]);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0
  };
}

// Shifts that may move one mover: all alike, or none.
function resolveSharedShift(shifts) {
  if (!shifts || shifts.length === 0) {
    return null;
  }
  const first = shifts[0];
  const shared = shifts.every((shift) => (
    Math.abs(shift.x - first.x) <= SHARED_SHIFT_TOLERANCE_PX &&
    Math.abs(shift.y - first.y) <= SHARED_SHIFT_TOLERANCE_PX
  ));
  if (!shared || (Math.abs(first.x) < MIN_SHIFT_PX && Math.abs(first.y) < MIN_SHIFT_PX)) {
    return null;
  }
  return first;
}

function createLayoutMotion(options) {
  const config = options || {};
  const documentObj = config.documentObj || document;
  const windowObj = config.windowObj || window;
  const getTargets = typeof config.getTargets === 'function' ? config.getTargets : () => [];
  const canAnimate = typeof config.canAnimate === 'function' ? config.canAnimate : () => true;
  const animations = new Map();
  let lastPositions = new Map();
  let lastViewport = null;

  function getViewport() {
    return {
      width: Math.max(0, Number(windowObj.innerWidth) || 0),
      height: Math.max(0, Number(windowObj.innerHeight) || 0)
    };
  }

  function getPlayingOffset(mover) {
    if (!animations.has(mover) || typeof windowObj.getComputedStyle !== 'function') {
      return { x: 0, y: 0 };
    }
    return parseTranslate(windowObj.getComputedStyle(mover).translate);
  }

  function getAncestorScroll(element) {
    const body = documentObj.body;
    let x = 0;
    let y = 0;
    for (let node = element.parentElement; node && node !== body; node = node.parentElement) {
      x += Number(node.scrollLeft) || 0;
      y += Number(node.scrollTop) || 0;
    }
    return { x, y };
  }

  function measure() {
    const positions = new Map();
    const scrollX = Number(windowObj.scrollX) || 0;
    const scrollY = Number(windowObj.scrollY) || 0;
    getTargets().forEach((target) => {
      const element = target && target.element;
      if (!element || !element.isConnected || typeof element.getBoundingClientRect !== 'function') {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
          (rect.width <= 0 && rect.height <= 0)) {
        return;
      }
      const mover = target.mover || element;
      const offset = getPlayingOffset(mover);
      const scroll = getAncestorScroll(element);
      // Blocks sit centered across the page, so their center is where they
      // are: a block that only grows or shrinks around it has not moved.
      positions.set(target.key, {
        element,
        mover,
        x: rect.left + (rect.width / 2) + scrollX + scroll.x - offset.x,
        top: rect.top + scrollY + scroll.y - offset.y
      });
    });
    return positions;
  }

  function play(mover, shift) {
    if (typeof mover.animate !== 'function') {
      return;
    }
    const offset = getPlayingOffset(mover);
    cancel(mover);
    const fromX = offset.x + shift.x;
    const fromY = offset.y + shift.y;
    if (Math.abs(fromX) < MIN_SHIFT_PX && Math.abs(fromY) < MIN_SHIFT_PX) {
      return;
    }
    const animation = mover.animate(
      [
        { translate: `${fromX}px ${fromY}px` },
        { translate: '0px 0px' }
      ],
      {
        duration: LAYOUT_MOTION_DURATION_MS,
        easing: LAYOUT_MOTION_EASING,
        fill: 'both'
      }
    );
    animations.set(mover, animation);
    const release = () => {
      if (animations.get(mover) === animation) {
        animations.delete(mover);
      }
    };
    animation.oncancel = release;
    animation.onfinish = () => {
      release();
      animation.cancel();
    };
  }

  function cancel(mover) {
    const animation = animations.get(mover);
    if (!animation) {
      return;
    }
    animations.delete(mover);
    animation.cancel();
  }

  function cancelAll() {
    Array.from(animations.keys()).forEach(cancel);
  }

  // Records where every block now sits and, when the page may animate and
  // the viewport is the one the last pass saw, moves the blocks that
  // shifted from where they were.
  function commit() {
    const viewport = getViewport();
    const positions = measure();
    const sameViewport = Boolean(lastViewport) &&
      lastViewport.width === viewport.width &&
      lastViewport.height === viewport.height;
    if (sameViewport && canAnimate()) {
      const shiftsByMover = new Map();
      positions.forEach((position, key) => {
        const previous = lastPositions.get(key);
        if (!previous || previous.element !== position.element || previous.mover !== position.mover) {
          return;
        }
        const shifts = shiftsByMover.get(position.mover) || [];
        shifts.push({ x: previous.x - position.x, y: previous.top - position.top });
        shiftsByMover.set(position.mover, shifts);
      });
      shiftsByMover.forEach((shifts, mover) => {
        const shift = resolveSharedShift(shifts);
        if (shift) {
          play(mover, shift);
        }
      });
    } else if (!sameViewport) {
      cancelAll();
    }
    lastPositions = positions;
    lastViewport = viewport;
  }

  return { commit, cancelAll };
}

export {
  LAYOUT_MOTION_DURATION_MS,
  LAYOUT_MOTION_EASING,
  createLayoutMotion,
  parseTranslate,
  resolveSharedShift
};
