// Picking an element on the page.
import type { DocumentPipPickerReply } from '../../types/content-apis';
import { isOwnNode } from './candidates';
import { getMessage } from './locale';
import { applyPickerTheme, ensurePickerUi, selectTargetFromStack, setHighlight, updateCurrentTargetFromPointer } from './picker-ui';
import { openDocumentPiP, restoreSession } from './session';
import { state } from './state';
import { getDocumentPiPSupportState, getSupportFailureMessage, hasActiveVideoPiP, releaseDocumentPipOwnership } from './support';
import { getPickerTheme } from './theme';
import { hideToast, showToast, showVideoPiPConflictToast } from './toast';

function stopSelection(options?: { clearHighlight?: boolean }): void {
  state.active = false;
  state.currentTarget = null;
  state.currentStack = [];
  state.currentStackIndex = 0;
  state.currentTheme = null;
  state.opening = false;
  if (state.teardownSelection) {
    state.teardownSelection();
    state.teardownSelection = null;
  }
  hideToast();
  if (!options || options.clearHighlight !== false) {
    setHighlight(null);
  }
}

async function confirmCurrentTarget(): Promise<void> {
  if (!state.active || state.opening) {
    return;
  }
  const target = state.currentTarget;
  if (!target) {
    return;
  }
  state.opening = true;
  stopSelection({});
  try {
    const result = await openDocumentPiP(target, startSelection);
    if (!result.ok) {
      releaseDocumentPipOwnership();
      setHighlight(null);
    }
  } catch (_error) {
    releaseDocumentPipOwnership();
    setHighlight(null);
    showToast(
      getMessage(
        'document_pip_picker_open_failed',
        'Failed to open the floating content window. Try a different area'
      ),
      'error'
    );
  }
}

function handlePickerMouseMove(event: MouseEvent): void {
  if (!state.active) {
    return;
  }
  updateCurrentTargetFromPointer(event);
}

// The wheel moves along the stack: down to a wider ancestor, up to a
// narrower one.
function handlePickerWheel(event: WheelEvent): void {
  if (!state.active || !state.currentStack.length) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const delta = Math.sign(event.deltaY || 0);
  if (delta === 0) {
    return;
  }
  selectTargetFromStack(state.currentStackIndex + (delta > 0 ? 1 : -1));
}

function claimKey(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

function handlePickerKeyDown(event: KeyboardEvent): void {
  if (!state.active) {
    return;
  }
  if (event.key === 'Escape') {
    claimKey(event);
    stopSelection({});
    showToast(
      getMessage('document_pip_picker_cancelled', 'Content selection closed'),
      'info'
    );
    return;
  }
  if ((event.key === '[' || event.key === 'ArrowUp') && state.currentStack.length) {
    claimKey(event);
    selectTargetFromStack(state.currentStackIndex + 1);
    return;
  }
  if ((event.key === ']' || event.key === 'ArrowDown') && state.currentStack.length) {
    claimKey(event);
    selectTargetFromStack(state.currentStackIndex - 1);
    return;
  }
  if ((event.key === 'Enter' || event.key === 'NumpadEnter') && state.currentTarget) {
    claimKey(event);
    void confirmCurrentTarget();
  }
}

async function handlePickerClick(event: MouseEvent): Promise<void> {
  if (!state.active) {
    return;
  }
  if (isOwnNode(event.target)) {
    return;
  }
  if (!state.currentTarget) {
    updateCurrentTargetFromPointer(event);
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  await confirmCurrentTarget();
}

// Keeps the page from reacting to presses while the user picks.
function blockPagePointerEvent(event: Event): void {
  if (!state.active) {
    return;
  }
  if (isOwnNode(event.target)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function addPickerListeners(): void {
  window.addEventListener('mousemove', handlePickerMouseMove, true);
  window.addEventListener('wheel', handlePickerWheel, { capture: true, passive: false });
  window.addEventListener('keydown', handlePickerKeyDown, true);
  window.addEventListener('pointerdown', blockPagePointerEvent, true);
  window.addEventListener('mousedown', blockPagePointerEvent, true);
  window.addEventListener('mouseup', blockPagePointerEvent, true);
  window.addEventListener('click', handlePickerClick, true);
}

function removePickerListeners(): void {
  window.removeEventListener('mousemove', handlePickerMouseMove, true);
  window.removeEventListener('wheel', handlePickerWheel, true);
  window.removeEventListener('keydown', handlePickerKeyDown, true);
  window.removeEventListener('pointerdown', blockPagePointerEvent, true);
  window.removeEventListener('mousedown', blockPagePointerEvent, true);
  window.removeEventListener('mouseup', blockPagePointerEvent, true);
  window.removeEventListener('click', handlePickerClick, true);
}

function startSelection(): DocumentPipPickerReply {
  const support = getDocumentPiPSupportState();
  if (!support.supported) {
    showToast(
      getSupportFailureMessage(support.reason),
      'error'
    );
    return { ok: false, state: 'unsupported', reason: support.reason };
  }
  if (state.active) {
    return { ok: true, state: 'already-active' };
  }
  if (hasActiveVideoPiP()) {
    showVideoPiPConflictToast();
    return { ok: false, state: 'blocked-by-video-pip' };
  }
  ensurePickerUi();
  applyPickerTheme(getPickerTheme(null));
  state.active = true;

  addPickerListeners();
  state.teardownSelection = removePickerListeners;

  showToast(
    getMessage(
      'document_pip_picker_started',
      'Hover to select, press Enter to float. Scroll to change scope, or press Esc to cancel'
    ),
    'info',
    { persistent: true }
  );
  return { ok: true, state: 'started' };
}

function toggle(): DocumentPipPickerReply {
  if (state.session) {
    restoreSession({ closeWindow: true });
    showToast(
      getMessage('document_pip_picker_closed', 'Floating content window closed'),
      'info'
    );
    return { ok: true, state: 'closed' };
  }
  if (state.active) {
    stopSelection({});
    showToast(
      getMessage('document_pip_picker_cancelled', 'Content selection closed'),
      'info'
    );
    return { ok: true, state: 'cancelled' };
  }
  return startSelection();
}

export {
  confirmCurrentTarget,
  startSelection,
  stopSelection,
  toggle
};
