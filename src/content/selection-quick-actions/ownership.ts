// Which copy of this script owns the page's toolbar.
import { HOST_ID, RUNTIME_ID, RUNTIME_PRIORITY, RUNTIME_REVISION, RUNTIME_VERSION } from './constants';
import { cancelToolbarEntranceAnimation } from './motion';
import { providerStorageRuntime, state } from './state';
import { clearSelectionToast } from './toast';
import { isElementNode } from './types';

// What another copy of this script (another build of the extension, or
// an older version) wrote on its host; the stronger claim keeps the page.
function getRuntimeClaim(element: Element): { id: string; priority: number; version: number } | null {
  if (!(element instanceof HTMLElement) || element.id !== HOST_ID) {
    return null;
  }
  return {
    id: String(element.dataset.runtimeId || ''),
    priority: Number.parseInt(element.dataset.runtimePriority || '0', 10) || 0,
    version: Number.parseInt(element.dataset.runtimeVersion || '0', 10) || 0
  };
}

function compareRuntimeClaim(element: Element): number {
  const claim = getRuntimeClaim(element);
  if (!claim) {
    return -1;
  }
  if (claim.version !== RUNTIME_VERSION) {
    return claim.version - RUNTIME_VERSION;
  }
  if (claim.priority !== RUNTIME_PRIORITY) {
    return claim.priority - RUNTIME_PRIORITY;
  }
  return claim.id.localeCompare(RUNTIME_ID);
}

function clearOwnedSurface(): void {
  cancelToolbarEntranceAnimation();
  clearSelectionToast();
  if (state.surfaceResizeObserver) {
    state.surfaceResizeObserver.disconnect();
    state.surfaceResizeObserver = null;
  }
  if (state.selectionSurface && state.selectionSurface.host.isConnected) {
    state.selectionSurface.host.remove();
  }
  state.selectionSurface = null;
  state.currentCandidate = null;
}

function reconcileSurfaceOwnership(): boolean {
  if (!state.enabled) {
    return true;
  }
  const ownHost = state.selectionSurface ? state.selectionSurface.host : null;
  const candidates = Array.from(document.querySelectorAll(`[id="${HOST_ID}"]`));
  const strongerClaim = candidates.find((candidate) => (
    candidate !== ownHost && compareRuntimeClaim(candidate) > 0
  ));
  if (strongerClaim) {
    clearOwnedSurface();
    return false;
  }
  candidates.forEach((candidate) => {
    if (candidate !== ownHost) {
      candidate.remove();
    }
  });
  return true;
}

function mutationContainsSelectionHost(mutation: MutationRecord): boolean {
  return Array.from(mutation.addedNodes).some((node) => {
    if (!isElementNode(node)) {
      return false;
    }
    if (node.id === HOST_ID) {
      return true;
    }
    return Boolean(node.querySelector(`[id="${HOST_ID}"]`));
  });
}

function setOwnershipMonitoring(active: boolean): void {
  if (!active) {
    if (state.ownershipObserver) {
      state.ownershipObserver.disconnect();
      state.ownershipObserver = null;
    }
    return;
  }
  reconcileSurfaceOwnership();
  if (state.ownershipObserver || typeof MutationObserver !== 'function') {
    return;
  }
  state.ownershipObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutationContainsSelectionHost)) {
      reconcileSurfaceOwnership();
    }
  });
  state.ownershipObserver.observe(document.documentElement || document, {
    childList: true,
    subtree: true
  });
}

function getActiveStorageAreaName(): string {
  return providerStorageRuntime.getActiveAreaName();
}

function updateRuntimeDebugState(): void {
  if (state.selectionSurface) {
    writeRuntimeDebugState(state.selectionSurface.host);
  }
}

// The claim other copies compare against, and what a developer inspects.
function writeRuntimeDebugState(host: HTMLElement): void {
  host.dataset.runtimeRevision = RUNTIME_REVISION;
  host.dataset.runtimeVersion = String(RUNTIME_VERSION);
  host.dataset.runtimeId = RUNTIME_ID;
  host.dataset.runtimePriority = String(RUNTIME_PRIORITY);
  host.dataset.storageArea = getActiveStorageAreaName() || '';
}

export {
  clearOwnedSurface,
  compareRuntimeClaim,
  getActiveStorageAreaName,
  getRuntimeClaim,
  mutationContainsSelectionHost,
  reconcileSurfaceOwnership,
  setOwnershipMonitoring,
  updateRuntimeDebugState,
  writeRuntimeDebugState
};
