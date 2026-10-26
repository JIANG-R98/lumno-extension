// Telling a finished selection from one still being made.
import * as INTENT from '../../domain/selection-intent';
import { renderCandidate } from './actions';
import { ENTRY_DELAY_MS, SELECTION_CHANGE_DELAY_MS, SELECTION_GESTURE_TIMEOUT_MS } from './constants';
import { getUnifiedSelectionSnapshot, isInsideCode, isSameSelection, isSelectionStillCurrent, isSensitiveElement } from './detection';
import { getCurrentLocale } from './locale';
import { hideSurface } from './motion';
import { state } from './state';
import type { SelectionCandidate, SelectionClassification, SelectionSnapshot } from './types';

function classifySelectionSnapshot(snapshot: SelectionSnapshot | null): SelectionClassification | null {
  if (!snapshot || !snapshot.text) {
    return null;
  }
  return INTENT.classifySelection(snapshot.text, {
    insideCode: isInsideCode(snapshot.element),
    pageLanguage: document.documentElement ? document.documentElement.lang : '',
    sensitive: isSensitiveElement(snapshot.element),
    uiLanguage: getCurrentLocale()
  });
}

function buildCandidateFromSnapshot(
  snapshot: SelectionSnapshot | null,
  classification: SelectionClassification | null
): SelectionCandidate | null {
  if (!snapshot || !snapshot.text) {
    return null;
  }
  const ownHost = state.selectionSurface ? state.selectionSurface.host : null;
  if (ownHost && (snapshot.element === ownHost || ownHost.contains(snapshot.element))) {
    return null;
  }
  const resolvedClassification = classification || classifySelectionSnapshot(snapshot);
  if (!resolvedClassification || resolvedClassification.suppressed || resolvedClassification.triggerable !== true) {
    return null;
  }
  return {
    classification: resolvedClassification,
    rect: snapshot.rect,
    sourceKind: snapshot.sourceKind,
    snapshot
  };
}

function evaluateSelection(snapshot?: SelectionSnapshot | null): void {
  hideSurface();
  const resolvedSnapshot = snapshot || getUnifiedSelectionSnapshot(document.activeElement);
  const classification = classifySelectionSnapshot(resolvedSnapshot);
  if (!state.enabled) {
    return;
  }
  const candidate = buildCandidateFromSnapshot(resolvedSnapshot, classification);
  if (!candidate) {
    return;
  }
  const sequence = ++state.requestSequence;
  state.currentCandidate = candidate;
  state.showTimer = window.setTimeout(() => {
    state.showTimer = null;
    if (sequence !== state.requestSequence || !state.enabled || !isSelectionStillCurrent(candidate)) {
      return;
    }
    renderCandidate(candidate);
  }, ENTRY_DELAY_MS);
}

function resetSelectionGesture(): void {
  state.selectionGestureActive = false;
  if (state.gestureResetTimer) {
    window.clearTimeout(state.gestureResetTimer);
    state.gestureResetTimer = null;
  }
}

function scheduleSelectionGestureReset(): void {
  if (state.gestureResetTimer) {
    window.clearTimeout(state.gestureResetTimer);
  }
  state.gestureResetTimer = window.setTimeout(() => {
    state.gestureResetTimer = null;
    if (state.pointerDownState) {
      scheduleSelectionGestureReset();
      return;
    }
    state.selectionGestureActive = false;
  }, SELECTION_GESTURE_TIMEOUT_MS);
}

function armSelectionGesture(): void {
  state.selectionGestureActive = true;
  scheduleSelectionGestureReset();
}

function cancelSelectionGesture(): void {
  state.pointerDownState = null;
  resetSelectionGesture();
  hideSurface();
}

function scheduleSelectionChangeEvaluation(): void {
  if (!state.enabled || !state.selectionGestureActive || state.pointerDownState) {
    return;
  }
  if (state.selectionChangeTimer) {
    window.clearTimeout(state.selectionChangeTimer);
  }
  state.selectionChangeTimer = window.setTimeout(() => {
    state.selectionChangeTimer = null;
    if (!state.enabled || !state.selectionGestureActive || state.pointerDownState || state.currentCandidate) {
      return;
    }
    const snapshot = getUnifiedSelectionSnapshot(document.activeElement);
    if (!snapshot || !snapshot.text) {
      return;
    }
    evaluateSelection(snapshot);
  }, SELECTION_CHANGE_DELAY_MS);
}

// Whether the event passed through the toolbar's own host.
function isFromOwnSurface(event: Event): boolean {
  return state.selectionSurface !== null && event.composedPath().includes(state.selectionSurface.host);
}

function handlePointerUp(event: PointerEvent): void {
  const pointerDown = state.pointerDownState;
  state.pointerDownState = null;
  if (event.button !== 0 || !state.enabled ||
      event.isPrimary === false ||
      !pointerDown ||
      (pointerDown.pointerId != null && event.pointerId != null && pointerDown.pointerId !== event.pointerId) ||
      isFromOwnSurface(event)) {
    return;
  }
  armSelectionGesture();
  const snapshot = getUnifiedSelectionSnapshot(event.target, event);
  const selectionChanged = !isSameSelection(pointerDown.selection, snapshot);
  const isMultiClick = Number(event.detail) >= 2;
  if (!snapshot || !snapshot.text) {
    scheduleSelectionChangeEvaluation();
    return;
  }
  if (!selectionChanged && !isMultiClick) {
    return;
  }
  evaluateSelection(snapshot);
}

function handlePointerDown(event: PointerEvent): void {
  state.pointerDownState = null;
  if (event.button !== 0 || !state.enabled ||
      event.isPrimary === false ||
      isFromOwnSurface(event)) {
    return;
  }
  state.pointerDownState = {
    pointerId: event.pointerId,
    selection: getUnifiedSelectionSnapshot(event.target, event)
  };
  hideSurface();
  armSelectionGesture();
}

function handleSelectionChange(): void {
  const snapshot = getUnifiedSelectionSnapshot(document.activeElement);
  if (state.currentCandidate && snapshot && !isSameSelection(state.currentCandidate.snapshot, snapshot)) {
    hideSurface();
  }
  if (!snapshot || !snapshot.text || !state.enabled ||
      !state.selectionGestureActive || state.pointerDownState || state.currentCandidate) {
    return;
  }
  scheduleSelectionChangeEvaluation();
}

function handlePointerCancel(): void {
  const pointerDown = state.pointerDownState;
  state.pointerDownState = null;
  const snapshot = getUnifiedSelectionSnapshot(document.activeElement);
  if (state.enabled && state.selectionGestureActive && snapshot && snapshot.text &&
      (!pointerDown || !isSameSelection(pointerDown.selection, snapshot))) {
    scheduleSelectionChangeEvaluation();
  }
}

function handleSelectStart(event: Event): void {
  if (!state.enabled || isFromOwnSurface(event)) {
    return;
  }
  armSelectionGesture();
}

function handleWindowBlur(event: FocusEvent): void {
  if (event.target !== window) {
    return;
  }
  cancelSelectionGesture();
}

function handleKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelSelectionGesture();
    return;
  }
  if (event.shiftKey || ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'a')) {
    armSelectionGesture();
  }
}

export {
  armSelectionGesture,
  buildCandidateFromSnapshot,
  cancelSelectionGesture,
  classifySelectionSnapshot,
  evaluateSelection,
  handleKeyDown,
  handlePointerCancel,
  handlePointerDown,
  handlePointerUp,
  handleSelectStart,
  handleSelectionChange,
  handleWindowBlur,
  isFromOwnSurface,
  resetSelectionGesture,
  scheduleSelectionChangeEvaluation,
  scheduleSelectionGestureReset
};
