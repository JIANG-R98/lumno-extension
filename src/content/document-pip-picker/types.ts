// The shapes the page clip picker's modules share.
import type { ToastController } from '../../shared/ui/toast-screen';
import type { ToastStyleGate } from '../../shared/ui/toast-style-gate';

type Rgba = [number, number, number, number];

// The colors the picker and the floating window take from the picked area,
// so both sit naturally on the page.
interface VisualTheme {
  pageBackground: string;
  hudBackground: string;
  hudBorder: string;
  buttonBackground: string;
  secondaryButtonBackground: string;
  buttonText: string;
  buttonShadow: string;
  cardShadow: string;
  highlightBorder: string;
  highlightBackground: string;
  highlightShadow: string;
  isDark: boolean;
}

interface ClipLayout {
  // Room around a floating card, so its edges do not touch the window frame.
  gutter: number;
  width: number;
  height: number;
}

// The floating window's bottom bar, which tucks itself away a moment after
// the pointer leaves.
interface PiPDock {
  element: HTMLDivElement;
  // Stops the dock and its timers; the window may already be gone.
  destroy(): void;
}

// An open clip: the picked element, its copy in the floating window, and
// what keeps the copy current.
interface ClipSession {
  element: Element;
  pipWindow: Window;
  pipDocument: Document;
  // The scroll box around the copy.
  pipContent: HTMLDivElement;
  // Where the copy hangs, under shallow copies of the element's ancestors.
  pipContentMount: HTMLElement;
  pipElementClone: Element | null;
  styleSignature: string;
  documentObserver: MutationObserver;
  contentObserver: MutationObserver;
  resizeObserver: ResizeObserver | null;
  contentSyncTimer: number | null;
  documentSyncTimer: number | null;
  dock: PiPDock;
  onMainPageHide: () => void;
}

interface PickerState {
  // The user is picking an element.
  active: boolean;
  root: HTMLDivElement | null;
  highlight: HTMLDivElement | null;
  currentTarget: Element | null;
  // The element under the pointer and its ancestors that can be clipped,
  // innermost first; the wheel and arrow keys move along it.
  currentStack: Element[];
  currentStackIndex: number;
  currentTheme: VisualTheme | null;
  session: ClipSession | null;
  teardownSelection: (() => void) | null;
  toastHost: HTMLDivElement | null;
  toastElement: HTMLDivElement | null;
  toastController: Readonly<ToastController> | null;
  toastStyleGate: Readonly<ToastStyleGate> | null;
  opening: boolean;
  // The picture-in-picture ownership this page holds, if any.
  ownerToken: string;
  runtimeMessageHandlerBound: boolean;
}

type SupportReason = 'ok' | 'not-top-level' | 'not-secure-context' | 'api-unavailable' | 'blocked-by-policy';

type StyleSheetEntry =
  | { kind: 'link'; key: string; href: string; media: string }
  | { kind: 'style'; key: string; cssText: string; media: string };

type OpenResult =
  | { ok: true }
  | { ok: false; reason: string; errorName?: string; errorMessage?: string };

type ToastKind = 'info' | 'error';

export type {
  ClipLayout,
  ClipSession,
  OpenResult,
  PiPDock,
  PickerState,
  Rgba,
  StyleSheetEntry,
  SupportReason,
  ToastKind,
  VisualTheme
};
