// Height motion for the Options panel. When a setting shows or hides rows,
// the panel animates from its old height to its new one, and the focused
// control (usually the switch just clicked) stays where it was on screen:
// the page scrolls by however far it moved, and a transparent reserve below
// the panel keeps the browser from clamping that scroll near the bottom.
const HEIGHT_ANIMATION_DURATION_MS = 280;
const HEIGHT_ANIMATION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

interface PanelHeightAnimatorOptions {
  // The element whose height animates.
  panel: HTMLElement;
  // The element whose --settings-focus-anchor-reserve keeps room below the panel.
  reserveHost: HTMLElement;
  documentObj: Document;
  windowObj: Window;
}

// What a layout change reports: false when nothing changed.
type LayoutMutation = () => boolean;

// animate(mutateLayout) runs mutateLayout and animates the resulting height
// change; cancel() stops it.
function createPanelHeightAnimator(options: PanelHeightAnimatorOptions) {
  const panel = options.panel;
  const reserveHost = options.reserveHost;
  const documentObj = options.documentObj;
  const windowObj = options.windowObj;
  let heightAnimation: Animation | null = null;
  let reservedAnchor: Element | null = null;
  let focusAnchorReserve = 0;

  function getFocusedPanelAnchor(): Element | null {
    const activeElement = documentObj.activeElement;
    if (!activeElement || activeElement === documentObj.body || !panel.contains(activeElement)) {
      return null;
    }
    const rect = activeElement.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 ? activeElement : null;
  }

  function setFocusAnchorReserve(anchor: Element | null, reserve: number): void {
    const nextReserve = Number.isFinite(reserve) ? Math.max(0, Math.ceil(reserve)) : 0;
    reservedAnchor = nextReserve > 0 ? anchor : null;
    focusAnchorReserve = nextReserve;
    if (nextReserve > 0) {
      reserveHost.style.setProperty('--settings-focus-anchor-reserve', `${nextReserve}px`);
      return;
    }
    reserveHost.style.removeProperty('--settings-focus-anchor-reserve');
  }

  function clearFocusAnchorReserve(): void {
    setFocusAnchorReserve(null, 0);
  }

  function releaseFocusAnchorReserve(event: Event): void {
    const anchor = reservedAnchor;
    const target = event.target;
    if (!anchor || !target || target === anchor || event.composedPath().includes(anchor)) {
      return;
    }
    clearFocusAnchorReserve();
  }

  function primeFocusAnchorReserve(anchor: Element | null, beforeHeight: number): void {
    if (!anchor) {
      return;
    }
    setFocusAnchorReserve(
      anchor,
      Math.max(focusAnchorReserve, Number.isFinite(beforeHeight) ? beforeHeight : 0)
    );
  }

  function stabilizeFocusAnchor(anchor: Element | null, focusTop: number | null, minimumHeightReduction: number): void {
    if (!anchor || focusTop === null || !Number.isFinite(focusTop) || !anchor.isConnected) {
      clearFocusAnchorReserve();
      return;
    }
    const heightReduction = Number.isFinite(minimumHeightReduction)
      ? Math.max(0, minimumHeightReduction)
      : 0;
    for (let pass = 0; pass < 2; pass += 1) {
      const nextFocusTop = anchor.getBoundingClientRect().top;
      const focusOffset = nextFocusTop - focusTop;
      if (Number.isFinite(focusOffset) && Math.abs(focusOffset) > 0.5) {
        windowObj.scrollBy(0, focusOffset);
      }
      const baseDocumentHeight = Math.max(
        0,
        documentObj.documentElement.scrollHeight - focusAnchorReserve - heightReduction
      );
      const requiredReserve = Math.max(
        0,
        windowObj.scrollY + windowObj.innerHeight - baseDocumentHeight + 2
      );
      setFocusAnchorReserve(anchor, requiredReserve);
    }
  }

  function cancel(): void {
    const animation = heightAnimation;
    heightAnimation = null;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
    }
    panel.style.removeProperty('height');
    panel.removeAttribute('data-height-animating');
    clearFocusAnchorReserve();
  }

  function shouldAnimate(): boolean {
    if (!documentObj.documentElement ||
        documentObj.documentElement.getAttribute('data-lumno-options-ready') !== 'true' ||
        typeof panel.animate !== 'function') {
      return false;
    }
    if (typeof panel.getClientRects === 'function' && panel.getClientRects().length === 0) {
      return false;
    }
    return !(typeof windowObj.matchMedia === 'function' &&
      windowObj.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function animate(mutateLayout: LayoutMutation): boolean {
    const animationInProgress = Boolean(heightAnimation);
    const previousFocusAnchor = reservedAnchor;
    const previousFocusAnchorReserve = focusAnchorReserve;
    const beforeHeight = panel.getBoundingClientRect().height;
    const focusAnchor = getFocusedPanelAnchor();
    const focusTop = focusAnchor ? focusAnchor.getBoundingClientRect().top : null;
    primeFocusAnchorReserve(focusAnchor, beforeHeight);
    panel.setAttribute('data-height-animating', 'true');

    const layoutChanged = mutateLayout();
    if (!layoutChanged) {
      setFocusAnchorReserve(previousFocusAnchor, previousFocusAnchorReserve);
      if (!animationInProgress) {
        panel.removeAttribute('data-height-animating');
      }
      return false;
    }

    if (heightAnimation) {
      const previousAnimation = heightAnimation;
      heightAnimation = null;
      previousAnimation.onfinish = null;
      previousAnimation.cancel();
    }
    panel.style.removeProperty('height');
    const afterHeight = panel.getBoundingClientRect().height;
    const canAnimateHeight = shouldAnimate() &&
      Number.isFinite(beforeHeight) && Number.isFinite(afterHeight) &&
      Math.abs(afterHeight - beforeHeight) >= 0.5;

    stabilizeFocusAnchor(
      focusAnchor,
      focusTop,
      canAnimateHeight ? Math.max(0, afterHeight - beforeHeight) : 0
    );

    if (!canAnimateHeight) {
      panel.removeAttribute('data-height-animating');
      return true;
    }

    panel.style.height = `${afterHeight}px`;
    const animation = panel.animate(
      [
        { height: `${beforeHeight}px` },
        { height: `${afterHeight}px` }
      ],
      {
        duration: HEIGHT_ANIMATION_DURATION_MS,
        easing: HEIGHT_ANIMATION_EASING,
        fill: 'both'
      }
    );
    heightAnimation = animation;
    animation.onfinish = () => {
      if (heightAnimation !== animation) {
        return;
      }
      heightAnimation = null;
      animation.onfinish = null;
      animation.cancel();
      panel.style.removeProperty('height');
      panel.removeAttribute('data-height-animating');
      stabilizeFocusAnchor(focusAnchor, focusTop, 0);
    };
    return true;
  }

  // A click or focus anywhere else ends the reserve kept for the anchor.
  documentObj.addEventListener('pointerdown', releaseFocusAnchorReserve, true);
  documentObj.addEventListener('focusin', releaseFocusAnchorReserve, true);

  return Object.freeze({ animate, cancel });
}

export { createPanelHeightAnimator };
export type { LayoutMutation, PanelHeightAnimatorOptions };
