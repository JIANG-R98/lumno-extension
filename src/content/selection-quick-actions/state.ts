// What the toolbar keeps while the page is open: its settings, timers,
// the current selection and the elements it made.
import * as LumnoSettingsStorage from '../../platform/settings-storage';
import { getContextSettingsStore } from '../../platform/settings-store';
import type { LocaleMessage } from '../../domain/messages';
import type { ToastController, ToastStyleGate } from '../../shared/ui/toast';
import type { PageListener, PointerDownState, SelectionCandidate, SelectionSurface } from './types';

const settingsStore = getContextSettingsStore(chrome);

const providerStorageRuntime = LumnoSettingsStorage.createProviderStorageRuntime(chrome);

interface SelectionToolbarState {
  enabled: boolean;
  languageMode: string;
  localeMessages: Record<string, LocaleMessage> | null;
  showTimer: number | null;
  dismissTimer: number | null;
  selectionActionHideTimer: number | null;
  selectionChangeTimer: number | null;
  gestureResetTimer: number | null;
  requestSequence: number;
  pointerDownState: PointerDownState | null;
  selectionGestureActive: boolean;
  currentCandidate: SelectionCandidate | null;
  selectionSurface: SelectionSurface | null;
  toastHost: HTMLDivElement | null;
  toastController: Readonly<ToastController> | null;
  toastStyleGate: Readonly<ToastStyleGate> | null;
  ownershipObserver: MutationObserver | null;
  surfaceResizeObserver: ResizeObserver | null;
  toolbarEntranceAnimations: Animation[];
  // An animation frame, or a timeout where the fallback runs.
  toolbarEntranceFrame: number | null;
  toolbarEntranceCleanupTimer: number | null;
  viewportRepositionFrame: number | null;
  hostHorizontalAnchor: 'left' | 'right';
  attachedPageListeners: PageListener[] | null;
}

const state: SelectionToolbarState = {
  enabled: false,
  languageMode: 'system',
  localeMessages: null,
  showTimer: null,
  dismissTimer: null,
  selectionActionHideTimer: null,
  selectionChangeTimer: null,
  gestureResetTimer: null,
  requestSequence: 0,
  pointerDownState: null,
  selectionGestureActive: false,
  currentCandidate: null,
  selectionSurface: null,
  toastHost: null,
  toastController: null,
  toastStyleGate: null,
  ownershipObserver: null,
  surfaceResizeObserver: null,
  toolbarEntranceAnimations: [],
  toolbarEntranceFrame: null,
  toolbarEntranceCleanupTimer: null,
  viewportRepositionFrame: null,
  hostHorizontalAnchor: 'left',
  attachedPageListeners: null
};

export {
  providerStorageRuntime,
  settingsStore,
  state
};
export type {
  SelectionToolbarState
};
