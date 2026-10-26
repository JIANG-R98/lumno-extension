// The page listeners, present only while the feature is on.
import { cancelSelectionGesture, handleKeyDown, handlePointerCancel, handlePointerDown, handlePointerUp, handleSelectStart, handleSelectionChange, handleWindowBlur } from './gesture';
import { setOwnershipMonitoring } from './ownership';
import { state } from './state';
import type { PageListener } from './types';
import { scheduleViewportClamp } from './viewport';

// Page listeners exist only while the feature is enabled, so a disabled
// feature costs nothing on selectionchange, scroll, resize and the rest.
// The storage listener below stays attached so the feature can turn back on.
function listenDocument<K extends keyof DocumentEventMap>(
  type: K,
  listener: (event: DocumentEventMap[K]) => void
): PageListener {
  return {
    attach: () => document.addEventListener(type, listener, true),
    detach: () => document.removeEventListener(type, listener, true)
  };
}

function listenWindow<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void
): PageListener {
  return {
    attach: () => window.addEventListener(type, listener, true),
    detach: () => window.removeEventListener(type, listener, true)
  };
}

function listenVisualViewport<K extends keyof VisualViewportEventMap>(
  visualViewport: VisualViewport,
  type: K,
  listener: (event: VisualViewportEventMap[K]) => void
): PageListener {
  return {
    attach: () => visualViewport.addEventListener(type, listener, false),
    detach: () => visualViewport.removeEventListener(type, listener, false)
  };
}

function getPageListeners(): PageListener[] {
  const listeners = [
    listenDocument('pointerup', handlePointerUp),
    listenDocument('pointerdown', handlePointerDown),
    listenDocument('pointercancel', handlePointerCancel),
    listenDocument('selectstart', handleSelectStart),
    listenDocument('selectionchange', handleSelectionChange),
    listenDocument('copy', cancelSelectionGesture),
    listenDocument('scroll', cancelSelectionGesture),
    listenDocument('keydown', handleKeyDown),
    listenWindow('blur', handleWindowBlur),
    listenWindow('resize', scheduleViewportClamp),
    listenWindow('orientationchange', scheduleViewportClamp)
  ];
  if (window.visualViewport) {
    listeners.push(
      listenVisualViewport(window.visualViewport, 'resize', scheduleViewportClamp),
      listenVisualViewport(window.visualViewport, 'scroll', scheduleViewportClamp)
    );
  }
  return listeners;
}

function setPageListenersActive(active: boolean): void {
  if (active && !state.attachedPageListeners) {
    state.attachedPageListeners = getPageListeners();
    state.attachedPageListeners.forEach((listener) => listener.attach());
  } else if (!active && state.attachedPageListeners) {
    state.attachedPageListeners.forEach((listener) => listener.detach());
    state.attachedPageListeners = null;
  }
}

function setFeatureActive(active: boolean): void {
  setPageListenersActive(active);
  setOwnershipMonitoring(active);
}

export {
  getPageListeners,
  listenDocument,
  listenVisualViewport,
  listenWindow,
  setFeatureActive,
  setPageListenersActive
};
