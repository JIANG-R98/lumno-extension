// The panel's entry motion: when to skip it, the start and reveal
// transforms, and playing, tracking and cleaning up the enter animation.
import * as LumnoSettingsStorage from '../../platform/settings-storage';

interface EntryMotionState {
  motionEffectsEnabled: boolean;
  // 'fade', or the default elastic motion.
  overlayEnterAnimation: string;
  overlayOpenTabsDefaultVisibleLoaded: boolean;
  overlayOpenTabsDefaultVisible: boolean;
}

// The frame tracker from lifecycle.ts, as far as the entry motion uses it.
interface EnterFrameTracker {
  runEnterAnimation(element: HTMLElement, callback: () => void): void;
  clear(): void;
}

interface EntryMotionDeps {
  // When the user asked for the panel, for the entry motion's budget.
  initialOverlayOpenStartedAt: number;
  overlayFrameTracker: EnterFrameTracker;
  overlayState: EntryMotionState;
}

interface EnterMotion {
  opacityDurationMs: number;
  panelDelayMs: number;
  panelDurationMs: number;
  panelEasing: string;
}

function createEntryMotion(deps: EntryMotionDeps) {
  const {
    initialOverlayOpenStartedAt,
    overlayFrameTracker
  } = deps;

  // The panel state object shared with search-panel.ts and the other modules.
  const overlayState = deps.overlayState;

  let overlayEnterCleanupElement: HTMLElement | null = null;
  let overlayEnterCleanupTimer: number | null = null;
  let overlayEnterTransitionEndHandler: ((event: TransitionEvent) => void) | null = null;
  let overlayEnterAnimations: Animation[] = [];
  let overlayEnterAnimationRevision = 0;
  const OVERLAY_STARTUP_ENTRY_MOTION_BUDGET_MS = 280;
  const OVERLAY_ENTER_MOTION: Readonly<Record<'elastic' | 'fade', EnterMotion>> = Object.freeze({
    elastic: Object.freeze({
      opacityDurationMs: 130,
      panelDelayMs: 0,
      panelDurationMs: 210,
      panelEasing: 'cubic-bezier(0.18, 1.32, 0.32, 1)'
    }),
    fade: Object.freeze({
      opacityDurationMs: 220,
      panelDelayMs: 0,
      panelDurationMs: 340,
      panelEasing: 'cubic-bezier(0.2, 1, 0.36, 1)'
    })
  });
  const OVERLAY_ELASTIC_ENTRY_SCALE_START = 0.88;
  const OVERLAY_ELASTIC_OPEN_TABS_ENTRY_SCALE_START = 0.94;
  const OVERLAY_ENTER_CLEANUP_BUFFER_MS = 80;

  function shouldSkipOverlayEntryMotion(): boolean {
    return LumnoSettingsStorage.shouldSkipEntryMotion(window, overlayState.motionEffectsEnabled);
  }

  function shouldSkipOverlayEntryMotionForSlowStartup(): boolean {
    return Date.now() - initialOverlayOpenStartedAt > OVERLAY_STARTUP_ENTRY_MOTION_BUDGET_MS;
  }

  function getOverlayEnterAnimationRevealTransform(): string {
    if (overlayState.overlayEnterAnimation === 'fade') {
      return 'translateX(-50%) translateY(0) scale(var(--x-ov-visible-scale, 1)) scale(1)';
    }
    return 'translateX(-50%) translateY(0) scale(var(--x-ov-visible-scale, 1)) scaleX(1)';
  }

  function getOverlayElasticEntryScaleStart(): number {
    return overlayState.overlayOpenTabsDefaultVisibleLoaded && overlayState.overlayOpenTabsDefaultVisible
      ? OVERLAY_ELASTIC_OPEN_TABS_ENTRY_SCALE_START
      : OVERLAY_ELASTIC_ENTRY_SCALE_START;
  }

  function getOverlayEnterAnimationStartTransform(): string {
    if (overlayState.overlayEnterAnimation === 'fade') {
      return 'translateX(-50%) translateY(16px) scale(var(--x-ov-visible-scale, 1)) scale(0.985)';
    }
    return `translateX(-50%) translateY(12px) scale(var(--x-ov-visible-scale, 1)) scaleX(var(--x-lumno-search-entry-scale-start, ${getOverlayElasticEntryScaleStart()}))`;
  }

  function getOverlayEnterAnimationDeltaTransform(): string {
    if (overlayState.overlayEnterAnimation === 'fade') {
      return 'translateY(16px) scale(0.985)';
    }
    return `translateY(12px) scaleX(${getOverlayElasticEntryScaleStart()})`;
  }

  function getOverlayEnterMotion(): EnterMotion {
    const name = overlayState.overlayEnterAnimation;
    return name === 'fade' || name === 'elastic'
      ? OVERLAY_ENTER_MOTION[name]
      : OVERLAY_ENTER_MOTION.elastic;
  }

  function clearOverlayPanelEnterCleanup(): void {
    overlayEnterAnimationRevision += 1;
    if (overlayEnterCleanupTimer !== null) {
      window.clearTimeout(overlayEnterCleanupTimer);
      overlayEnterCleanupTimer = null;
    }
    if (overlayEnterCleanupElement && overlayEnterTransitionEndHandler) {
      overlayEnterCleanupElement.removeEventListener(
        'transitionend',
        overlayEnterTransitionEndHandler
      );
    }
    overlayEnterAnimations.forEach((animation) => {
      try {
        animation.cancel();
      } catch (_error) {
        // A finished animation may already have released its effect.
      }
    });
    overlayEnterAnimations = [];
    overlayEnterCleanupElement = null;
    overlayEnterTransitionEndHandler = null;
  }

  // Settles the panel in its final place; a revision from an older entry
  // is ignored.
  function finishOverlayPanelEnterAnimation(overlayElement: HTMLElement | null, animationRevision?: number): void {
    if (!overlayElement ||
        (animationRevision && animationRevision !== overlayEnterAnimationRevision)) {
      return;
    }
    clearOverlayPanelEnterCleanup();
    overlayElement.style.setProperty('opacity', '1', 'important');
    overlayElement.style.setProperty(
      'transform',
      getOverlayEnterAnimationRevealTransform(),
      'important'
    );
    overlayElement.setAttribute('data-lumno-overlay-entry', 'done');
    overlayElement.style.removeProperty('transition');
    overlayElement.style.setProperty('will-change', 'auto', 'important');
    overlayElement.style.removeProperty('--x-lumno-search-entry-scale-start');
    overlayElement.style.removeProperty('--x-lumno-search-entry-duration');
    overlayElement.style.removeProperty('--x-lumno-search-entry-delay');
  }

  function trackOverlayPanelEnterAnimation(overlayElement: HTMLElement, animations: Animation[]): number {
    const animationRevision = overlayEnterAnimationRevision;
    overlayElement.setAttribute('data-lumno-overlay-entry', 'running');
    overlayEnterCleanupElement = overlayElement;
    overlayEnterAnimations = animations.slice();
    const primaryAnimation = overlayEnterAnimations[0] || null;
    if (primaryAnimation) {
      primaryAnimation.onfinish = () => {
        finishOverlayPanelEnterAnimation(overlayElement, animationRevision);
      };
    } else {
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target !== overlayElement || event.propertyName !== 'transform') {
          return;
        }
        finishOverlayPanelEnterAnimation(overlayElement, animationRevision);
      };
      overlayEnterTransitionEndHandler = onTransitionEnd;
      overlayElement.addEventListener('transitionend', onTransitionEnd);
    }
    const motion = getOverlayEnterMotion();
    const cleanupDelayMs = motion.panelDelayMs +
      motion.panelDurationMs + OVERLAY_ENTER_CLEANUP_BUFFER_MS;
    overlayEnterCleanupTimer = window.setTimeout(() => {
      overlayEnterCleanupTimer = null;
      finishOverlayPanelEnterAnimation(overlayElement, animationRevision);
    }, cleanupDelayMs);
    return animationRevision;
  }

  function applyOverlayEnterAnimationInitialState(overlayElement: HTMLElement | null): void {
    if (!overlayElement) {
      return;
    }
    clearOverlayPanelEnterCleanup();
    const motion = getOverlayEnterMotion();
    overlayElement.setAttribute('data-lumno-overlay-entry', 'prepared');
    overlayElement.style.setProperty('opacity', '0', 'important');
    overlayElement.style.setProperty('transition', 'none', 'important');
    overlayElement.style.setProperty('will-change', 'transform, opacity', 'important');
    if (overlayState.overlayEnterAnimation !== 'fade') {
      overlayElement.style.setProperty(
        '--x-lumno-search-entry-scale-start',
        String(getOverlayElasticEntryScaleStart())
      );
    }
    overlayElement.style.setProperty('--x-lumno-search-entry-duration', `${motion.panelDurationMs}ms`);
    overlayElement.style.setProperty('--x-lumno-search-entry-delay', `${motion.panelDelayMs}ms`);
    overlayElement.style.setProperty(
      'transform',
      getOverlayEnterAnimationStartTransform(),
      'important'
    );
  }

  // Plays the entry with Web Animations, or a CSS transition where the
  // document refuses them; false when there is no panel.
  function playOverlayPanelEnterAnimation(overlayElement: HTMLElement | null, revealTransform: string): boolean {
    if (!overlayElement) {
      return false;
    }
    clearOverlayPanelEnterCleanup();
    const motion = getOverlayEnterMotion();
    const startTransform = getOverlayEnterAnimationStartTransform();
    const deltaTransform = getOverlayEnterAnimationDeltaTransform();
    overlayElement.style.setProperty('transition', 'none', 'important');
    if (typeof overlayElement.animate === 'function') {
      let transformAnimation: Animation | null = null;
      let opacityAnimation: Animation | null = null;
      try {
        // WAAPI animation values sit below author !important declarations.
        // The shell reset stays at normal priority inside Shadow DOM, so only
        // the two animated longhands need their protected priority released.
        overlayElement.style.setProperty('will-change', 'transform, opacity', 'important');
        overlayElement.style.setProperty('opacity', '1');
        overlayElement.style.setProperty('transform', revealTransform);
        transformAnimation = overlayElement.animate([
          { transform: deltaTransform },
          { transform: 'none' }
        ], {
          composite: 'add',
          delay: motion.panelDelayMs,
          duration: motion.panelDurationMs,
          easing: motion.panelEasing,
          fill: 'backwards'
        });
        opacityAnimation = overlayElement.animate([
          { opacity: 0 },
          { opacity: 1 }
        ], {
          duration: motion.opacityDurationMs,
          easing: 'ease-out',
          fill: 'backwards'
        });
        trackOverlayPanelEnterAnimation(
          overlayElement,
          [transformAnimation, opacityAnimation]
        );
        return true;
      } catch (_error) {
        [transformAnimation, opacityAnimation].forEach((animation) => {
          if (animation) {
            try {
              animation.cancel();
            } catch (_cancelError) {
              // Continue into the CSS fallback with a clean protected state.
            }
          }
        });
        // Fall through to the CSS transition path for restricted documents.
      }
    }
    overlayElement.style.setProperty('opacity', '0', 'important');
    overlayElement.style.setProperty('transform', startTransform, 'important');
    overlayElement.style.setProperty(
      'transition',
      `transform ${motion.panelDurationMs}ms ${motion.panelEasing} ${motion.panelDelayMs}ms, opacity ${motion.opacityDurationMs}ms ease-out`,
      'important'
    );
    trackOverlayPanelEnterAnimation(overlayElement, []);
    overlayFrameTracker.runEnterAnimation(overlayElement, () => {
      overlayElement.style.setProperty('opacity', '1', 'important');
      overlayElement.style.setProperty('transform', revealTransform, 'important');
    });
    return true;
  }
  function clearOverlayEnterAnimationFrames(): void {
    overlayFrameTracker.clear();
  }

  return {
    shouldSkipOverlayEntryMotion,
    shouldSkipOverlayEntryMotionForSlowStartup,
    getOverlayEnterAnimationRevealTransform,
    clearOverlayPanelEnterCleanup,
    finishOverlayPanelEnterAnimation,
    applyOverlayEnterAnimationInitialState,
    playOverlayPanelEnterAnimation,
    clearOverlayEnterAnimationFrames
  };
}

export { createEntryMotion };
export type { EnterFrameTracker, EntryMotionDeps, EntryMotionState };
