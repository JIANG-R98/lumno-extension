// The toolbar's entrance and hiding.
import { clearTimers, setHostHidden } from './host';
import { state } from './state';
import { hideSelectionToast } from './toast';
import type { ToolbarGeometry } from './types';

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_error) {
    return false;
  }
}

function cancelToolbarEntranceAnimation(): void {
  if (state.toolbarEntranceFrame != null) {
    window.cancelAnimationFrame(state.toolbarEntranceFrame);
    window.clearTimeout(state.toolbarEntranceFrame);
    state.toolbarEntranceFrame = null;
  }
  if (state.toolbarEntranceCleanupTimer) {
    window.clearTimeout(state.toolbarEntranceCleanupTimer);
    state.toolbarEntranceCleanupTimer = null;
  }
  state.toolbarEntranceAnimations.forEach((animation) => {
    animation.cancel();
  });
  state.toolbarEntranceAnimations = [];
  if (state.selectionSurface) {
    const { surface, material, contentViewport, menu } = state.selectionSurface;
    delete surface.dataset.toolbarEntranceState;
    surface.style.removeProperty('--lumno-entry-width');
    surface.style.removeProperty('--lumno-toolbar-expanded-width');
    surface.style.removeProperty('--lumno-toolbar-content-width');
    surface.style.removeProperty('--lumno-toolbar-content-offset');
    surface.style.removeProperty('will-change');
    material.style.removeProperty('will-change');
    contentViewport.style.removeProperty('will-change');
    menu.style.removeProperty('will-change');
  }
}

function runToolbarEntranceFallback(surface: HTMLElement, geometry: ToolbarGeometry): void {
  surface.dataset.toolbarEntranceMode = 'fallback';
  surface.style.setProperty('--lumno-toolbar-expanded-width', `${geometry.expandedWidth}px`);
  surface.style.setProperty('--lumno-toolbar-content-width', `${geometry.contentWidth}px`);
  surface.style.setProperty('--lumno-toolbar-content-offset', `${geometry.contentOffset}px`);
  surface.dataset.toolbarEntranceState = 'from';
  void surface.offsetWidth;
  state.toolbarEntranceFrame = window.setTimeout(() => {
    state.toolbarEntranceFrame = null;
    const live = state.selectionSurface;
    if (!live || live.menu.hidden || live.host.hidden) {
      cancelToolbarEntranceAnimation();
      return;
    }
    live.surface.dataset.toolbarEntranceState = 'to';
  }, 0);
}

function animateToolbarEntrance(originRect: DOMRect | null): void {
  cancelToolbarEntranceAnimation();
  if (!state.selectionSurface || !originRect) {
    return;
  }
  const scheduledSurface = state.selectionSurface.surface;
  if (prefersReducedMotion()) {
    scheduledSurface.dataset.toolbarEntranceMode = 'reduced-motion';
    return;
  }
  scheduledSurface.dataset.toolbarEntranceMode = 'scheduled';
  // Engines without Web Animations get the CSS transition fallback.
  const useWebAnimations = typeof scheduledSurface.animate === 'function';
  const runAfterLayout = useWebAnimations
    ? (callback: () => void): number => window.requestAnimationFrame(callback)
    : (callback: () => void): number => window.setTimeout(callback, 0);
  state.toolbarEntranceFrame = runAfterLayout(() => {
    state.toolbarEntranceFrame = null;
    const live = state.selectionSurface;
    if (!live || live.menu.hidden || live.host.hidden) {
      return;
    }
    const { surface, material, contentViewport, menu } = live;
    const destinationRect = surface.getBoundingClientRect();
    if (destinationRect.width <= 0 || destinationRect.height <= 0) {
      surface.dataset.toolbarEntranceMode = 'invalid-destination';
      return;
    }
    const geometry: ToolbarGeometry = {
      contentOffset: Math.max(6, Math.min(10, destinationRect.width * 0.04)),
      contentWidth: Math.max(0, (() => {
        const contentRect = contentViewport.getBoundingClientRect();
        return contentRect.width > 0 ? contentRect.width : destinationRect.width - 8;
      })()),
      expandedWidth: destinationRect.width
    };
    if (!useWebAnimations) {
      runToolbarEntranceFallback(surface, geometry);
      return;
    }
    surface.dataset.toolbarEntranceMode = 'web-animations';
    material.style.willChange = 'width';
    contentViewport.style.willChange = 'width';
    menu.style.willChange = 'transform, opacity';
    const materialAnimation = material.animate([
      { width: '0px' },
      { width: `${destinationRect.width}px` }
    ], {
      duration: 240,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both'
    });
    const contentRevealAnimation = contentViewport.animate([
      { width: '0px' },
      { width: `${geometry.contentWidth}px` }
    ], {
      duration: 260,
      delay: 20,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both'
    });
    const toolbarContentAnimation = menu.animate([
      { transform: `translateX(-${geometry.contentOffset}px)`, opacity: 0.72 },
      { transform: 'translateX(0px)', opacity: 1 }
    ], {
      duration: 280,
      delay: 30,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      fill: 'both'
    });
    state.toolbarEntranceAnimations = [materialAnimation, contentRevealAnimation, toolbarContentAnimation];
    state.toolbarEntranceCleanupTimer = window.setTimeout(() => {
      state.toolbarEntranceCleanupTimer = null;
      material.style.removeProperty('will-change');
      contentViewport.style.removeProperty('will-change');
      menu.style.removeProperty('will-change');
    }, 420);
  });
}

function hideSurface(options?: { immediate?: boolean }): void {
  cancelToolbarEntranceAnimation();
  clearTimers();
  hideSelectionToast();
  if (state.viewportRepositionFrame != null) {
    window.cancelAnimationFrame(state.viewportRepositionFrame);
    state.viewportRepositionFrame = null;
  }
  state.currentCandidate = null;
  state.requestSequence += 1;
  if (!state.selectionSurface) {
    return;
  }
  state.selectionSurface.host.dataset.visible = 'false';
  if (!options || options.immediate !== false) {
    setHostHidden(state.selectionSurface.host, true);
  } else {
    window.setTimeout(() => {
      if (state.selectionSurface && state.selectionSurface.host.dataset.visible !== 'true') {
        setHostHidden(state.selectionSurface.host, true);
      }
    }, 160);
  }
}

export {
  animateToolbarEntrance,
  cancelToolbarEntranceAnimation,
  hideSurface,
  prefersReducedMotion,
  runToolbarEntranceFallback
};
