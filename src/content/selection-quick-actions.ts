import * as ACTION_ICON_LIBRARY from '../domain/selection-action-icons';
import * as INTENT from '../domain/selection-intent';
import * as FeatureSettings from '../domain/settings/features';
import * as LocaleSettings from '../domain/settings/locale';
import * as LumnoSettingsStorage from '../platform/settings-storage';
import { getContextSettingsStore } from '../platform/settings-store';
import type { SelectionAction } from '../domain/selection-intent';
import type { LocaleMessage } from '../domain/messages';
import * as TOAST from '../shared/ui/toast';
import type { ToastController, ToastShowOptions, ToastStyleGate } from '../shared/ui/toast';
import * as LumnoMessaging from '../platform/messaging';
import { claimContentScript } from '../platform/content-registry';

type SelectionClassification = ReturnType<typeof INTENT.classifySelection>;

interface ViewportBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

// Where the selection sits in the viewport; inline is the end of its last
// line, where the entry button goes.
interface SelectionRect extends ViewportBounds {
  inline: ViewportBounds & { height: number };
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

// A selection in the page's text, with its ends to tell it from a new one.
interface DomSelectionSnapshot {
  sourceKind: 'dom';
  element: Element;
  text: string;
  rect: SelectionRect;
  anchorNode: Node | null;
  anchorOffset: number;
  focusNode: Node | null;
  focusOffset: number;
}

// A selection inside a text field, which the page's selection does not show.
interface TextControlSelectionSnapshot {
  sourceKind: 'text-control';
  element: TextControl;
  text: string;
  rect: SelectionRect;
  start: number;
  end: number;
}

type SelectionSnapshot = DomSelectionSnapshot | TextControlSelectionSnapshot;

// A selection worth offering actions for.
interface SelectionCandidate {
  classification: SelectionClassification;
  rect: SelectionRect;
  sourceKind: SelectionSnapshot['sourceKind'];
  snapshot: SelectionSnapshot;
}

interface PointerDownState {
  pointerId: number;
  // The selection when the button went down, to tell a new one apart.
  selection: SelectionSnapshot | null;
}

// The toolbar's elements, all made together in a closed shadow root.
interface SelectionSurface {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  surface: HTMLDivElement;
  material: HTMLSpanElement;
  mainButton: HTMLButtonElement;
  selectionLogo: HTMLImageElement;
  mainLabel: HTMLSpanElement;
  primaryDivider: HTMLSpanElement;
  contentViewport: HTMLDivElement;
  actionsViewport: HTMLDivElement;
  menu: HTMLDivElement;
}

// Widths the toolbar opens through, measured once it has its final size.
interface ToolbarGeometry {
  contentOffset: number;
  contentWidth: number;
  expandedWidth: number;
}

interface ColorRgba {
  a: number;
  b: number;
  g: number;
  r: number;
}

// How the page behind the entry button reads, for a button that stays visible.
type EntryContrastTone = 'dark' | 'light' | 'mixed';

interface IconDefinition {
  viewBox: string;
  path: string;
}

// A page listener the feature adds while it is on and removes when it is off.
interface PageListener {
  attach(): void;
  detach(): void;
}

function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isTextControlType(type: string): boolean {
  return ['text', 'search', 'url', 'tel', 'email'].includes(type.toLowerCase());
}

(function() {
  'use strict';

  if (!claimContentScript('selection-quick-actions')) {
    return;
  }

  const HOST_ID = '_x_extension_selection_quick_actions_host_2026_unique_';
  const DEVELOPMENT_EXTENSION_ID = 'kkcjcneagmlhpeaafngjdlpcfjakejgb';
  const RUNTIME_REVISION = 'selection-toolbar-v32';
  const RUNTIME_VERSION = 32;
  const RUNTIME_ID = chrome && chrome.runtime && chrome.runtime.id
    ? String(chrome.runtime.id)
    : '';
  const RUNTIME_PRIORITY = RUNTIME_ID === DEVELOPMENT_EXTENSION_ID ? 2 : 1;
  const TOAST_HOST_ID = '_x_extension_selection_quick_actions_toast_host_2026_unique_';
  const TOAST_STYLE_ID = '_x_extension_selection_quick_actions_toast_style_2026_unique_';
  const ENTRY_DELAY_MS = 320;
  const SELECTION_CHANGE_DELAY_MS = 80;
  const SELECTION_GESTURE_TIMEOUT_MS = 1600;
  const ENTRY_DISMISS_MS = 2200;
  const TOOLBAR_DISMISS_MS = 3600;
  const ACTION_SUCCESS_DISMISS_MS = 900;
  const ACTION_FAILURE_DISMISS_MS = 2200;
  const VIEWPORT_SAFE_MARGIN_PX = 12;
  const settingsStore = getContextSettingsStore(chrome);
  const settingsLoaded = settingsStore.include([FeatureSettings.selectionQuickActionsEnabled, LocaleSettings.language]);
  const providerStorageRuntime = LumnoSettingsStorage.createProviderStorageRuntime(chrome);

  let enabled = false;
  let languageMode = 'system';
  let localeMessages: Record<string, LocaleMessage> | null = null;
  let showTimer: number | null = null;
  let dismissTimer: number | null = null;
  let selectionActionHideTimer: number | null = null;
  let selectionChangeTimer: number | null = null;
  let gestureResetTimer: number | null = null;
  let requestSequence = 0;
  let pointerDownState: PointerDownState | null = null;
  let selectionGestureActive = false;
  let currentCandidate: SelectionCandidate | null = null;
  let selectionSurface: SelectionSurface | null = null;
  let toastHost: HTMLDivElement | null = null;
  let toastController: Readonly<ToastController> | null = null;
  let toastStyleGate: Readonly<ToastStyleGate> | null = null;
  let ownershipObserver: MutationObserver | null = null;
  let surfaceResizeObserver: ResizeObserver | null = null;
  let toolbarEntranceAnimations: Animation[] = [];
  // An animation frame, or a timeout where the fallback runs.
  let toolbarEntranceFrame: number | null = null;
  let toolbarEntranceCleanupTimer: number | null = null;
  let viewportRepositionFrame: number | null = null;
  let hostHorizontalAnchor: 'left' | 'right' = 'left';
  let attachedPageListeners: PageListener[] | null = null;

  const HOST_ISOLATION_STYLES = Object.freeze({
    all: 'initial',
    position: 'fixed',
    'z-index': '2147483647',
    'box-sizing': 'border-box',
    width: 'max-content',
    height: 'max-content',
    'min-width': '0',
    'min-height': '0',
    'max-width': 'none',
    'max-height': 'none',
    margin: '0',
    padding: '0',
    border: '0',
    outline: '0',
    bottom: 'auto',
    opacity: '1',
    visibility: 'visible',
    'pointer-events': 'auto',
    transform: 'none',
    translate: 'none',
    rotate: 'none',
    scale: 'none',
    filter: 'none',
    '-webkit-filter': 'none',
    perspective: 'none',
    clip: 'auto',
    'clip-path': 'none',
    '-webkit-clip-path': 'none',
    mask: 'none',
    '-webkit-mask': 'none',
    overflow: 'visible',
    isolation: 'isolate',
    'mix-blend-mode': 'normal',
    contain: 'layout style',
    'content-visibility': 'visible',
    'writing-mode': 'horizontal-tb',
    direction: 'ltr',
    zoom: '1',
    animation: 'none',
    transition: 'none'
  });

  const ACTION_COPY: Readonly<Record<SelectionAction, readonly [string, string]>> = Object.freeze({
    ask: ['selection_quick_action_ask', 'Answer'],
    translate: ['selection_quick_action_translate', 'Translate'],
    explain: ['selection_quick_action_explain', 'Explain'],
    summarize: ['selection_quick_action_summarize', 'Summarize'],
    search: ['selection_quick_action_search', 'Research'],
    calculate: ['selection_quick_action_calculate', 'Calculate']
  });
  const TOOLBAR_FALLBACK_ACTIONS: readonly SelectionAction[] = Object.freeze(['explain', 'search', 'translate'] as const);

  function createInlineIcon(definition: IconDefinition | undefined, className: string): SVGSVGElement | null {
    if (!definition || !definition.path) {
      return null;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add(...String(className).split(/\s+/).filter(Boolean));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('viewBox', definition.viewBox || '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', definition.path);
    svg.appendChild(path);
    return svg;
  }

  function buildActionIcon(action: SelectionAction): SVGSVGElement | null {
    const definitions = ACTION_ICON_LIBRARY.remix;
    return createInlineIcon(definitions[action] || definitions.ask, 'lumno-selection-action-icon');
  }

  function getMessage(key: string, fallback: string): string {
    const entry = localeMessages ? localeMessages[key] : undefined;
    if (entry && entry.message) {
      return entry.message;
    }
    try {
      const value = chrome.i18n && chrome.i18n.getMessage
        ? chrome.i18n.getMessage(key)
        : '';
      return value || fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function applyNoTranslate<T extends Element>(element: T): T {
    element.setAttribute('translate', 'no');
    element.setAttribute('lang', 'zxx');
    element.setAttribute('notranslate', '');
    element.setAttribute('data-no-translate', 'true');
    element.classList.add('notranslate');
    return element;
  }

  function applyNoTranslateDeep<T extends Element>(root: T): T {
    applyNoTranslate(root);
    root.querySelectorAll('*').forEach((element) => applyNoTranslate(element));
    return root;
  }

  function normalizeLocale(value: unknown): string {
    return LocaleSettings.localeToHtmlLang(value);
  }

  function getCurrentLocale(): string {
    if (languageMode && languageMode !== 'system') {
      return normalizeLocale(languageMode);
    }
    try {
      if (chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
        return normalizeLocale(chrome.i18n.getUILanguage());
      }
    } catch (_error) {
      // Fall through to navigator language.
    }
    return normalizeLocale(navigator.language || 'en');
  }

  function refreshLocaleMessages(): void {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'getLocaleMessages', locale: getCurrentLocale() }, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }
      localeMessages = response && response.messages ? response.messages : null;
      if (selectionSurface && !selectionSurface.menu.hidden && currentCandidate) {
        renderMenu();
      }
    });
  }

  function getActionLabel(action: SelectionAction): string {
    const copy = ACTION_COPY[action] || ACTION_COPY.ask;
    return getMessage(copy[0], copy[1]);
  }

  function clearTimers(): void {
    if (showTimer) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    clearSelectionActionHideTimer();
    if (selectionChangeTimer) {
      window.clearTimeout(selectionChangeTimer);
      selectionChangeTimer = null;
    }
  }

  function clearSelectionActionHideTimer(): void {
    if (!selectionActionHideTimer) {
      return;
    }
    window.clearTimeout(selectionActionHideTimer);
    selectionActionHideTimer = null;
  }

  function applyHostIsolationStyles(host: HTMLElement): void {
    Object.entries(HOST_ISOLATION_STYLES).forEach(([property, value]) => {
      host.style.setProperty(property, value, 'important');
    });
  }

  function setHostHidden(host: HTMLElement, hidden: boolean): void {
    applyHostIsolationStyles(host);
    host.hidden = hidden;
    host.style.setProperty('display', hidden ? 'none' : 'block', 'important');
  }

  function setHostPosition(host: HTMLElement, left: number, top: number): void {
    hostHorizontalAnchor = 'left';
    host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    host.style.setProperty('right', 'auto', 'important');
    host.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }

  function setHostRightPosition(host: HTMLElement, right: number, top: number): void {
    hostHorizontalAnchor = 'right';
    host.style.setProperty('left', 'auto', 'important');
    host.style.setProperty('right', `${Math.round(right)}px`, 'important');
    host.style.setProperty('top', `${Math.round(top)}px`, 'important');
  }

  function setHostColorScheme(host: HTMLElement, value: string): void {
    host.style.setProperty('color-scheme', value, 'important');
  }

  function clearSelectionToast(): void {
    if (toastController) {
      toastController.destroy();
    }
    if (toastStyleGate) {
      toastStyleGate.destroy();
    }
    if (toastHost && toastHost.isConnected) {
      toastHost.remove();
    }
    toastHost = null;
    toastController = null;
    toastStyleGate = null;
  }

  function ensureSelectionToast(): Readonly<ToastController> {
    if (toastHost && toastHost.isConnected && toastController) {
      return toastController;
    }
    clearSelectionToast();
    const staleHost = document.getElementById(TOAST_HOST_ID);
    if (staleHost) {
      staleHost.remove();
    }
    const newHost = document.createElement('div');
    toastHost = newHost;
    newHost.id = TOAST_HOST_ID;
    applyNoTranslate(newHost);
    const hostStyles = {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      'z-index': '2147483647',
      display: 'block',
      width: 'auto',
      height: 'auto',
      margin: '0',
      padding: '0',
      border: '0',
      opacity: '1',
      visibility: 'visible',
      'pointer-events': 'none',
      transform: 'none',
      filter: 'none',
      overflow: 'visible',
      isolation: 'isolate',
      contain: 'none'
    };
    Object.entries(hostStyles).forEach(([property, value]) => {
      newHost.style.setProperty(property, value, 'important');
    });

    const toastShadow = newHost.attachShadow({ mode: 'closed' });
    const stylesheet = document.createElement('link');
    stylesheet.id = TOAST_STYLE_ID;
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
    const toastElement = document.createElement('div');
    toastElement.className = 'x-lumno-toast';
    toastElement.setAttribute('data-show', 'false');
    toastElement.setAttribute('role', 'status');
    toastElement.setAttribute('aria-live', 'polite');
    toastElement.style.setProperty(
      '--x-lumno-toast-top',
      'max(24px, calc(env(safe-area-inset-top) + 12px))'
    );
    toastElement.style.setProperty('--x-lumno-toast-z-index', '2147483647');
    applyNoTranslate(toastElement);
    toastShadow.append(stylesheet, toastElement);
    (document.documentElement || document.body).appendChild(newHost);

    toastStyleGate = TOAST.createToastStyleGate(toastElement, {
      stylesheetElement: stylesheet,
      windowObj: window
    });
    const controller = TOAST.createToastController(toastElement, {
      duration: ACTION_FAILURE_DISMISS_MS,
      windowObj: window
    });
    toastController = controller;
    return controller;
  }

  function showSelectionToast(message: string, options?: ToastShowOptions): void {
    ensureSelectionToast().show(message, options || {});
  }

  function hideSelectionToast(): void {
    if (toastController) {
      toastController.hide();
    }
  }

  function getViewportBounds(): ViewportBounds {
    const visualViewport = window.visualViewport;
    const width = visualViewport && Number.isFinite(visualViewport.width)
      ? visualViewport.width
      : (window.innerWidth || document.documentElement.clientWidth || 0);
    const height = visualViewport && Number.isFinite(visualViewport.height)
      ? visualViewport.height
      : (window.innerHeight || document.documentElement.clientHeight || 0);
    const left = visualViewport && Number.isFinite(visualViewport.offsetLeft)
      ? visualViewport.offsetLeft
      : 0;
    const top = visualViewport && Number.isFinite(visualViewport.offsetTop)
      ? visualViewport.offsetTop
      : 0;
    return {
      bottom: top + Math.max(0, height),
      left,
      right: left + Math.max(0, width),
      top
    };
  }

  function getLayoutViewportWidth(): number {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }

  function clampToSafeAxis(value: number, minimum: number, maximum: number): number {
    const safeMaximum = Math.max(minimum, maximum);
    return Math.min(safeMaximum, Math.max(minimum, value));
  }

  function applySurfaceViewportLimit(surface: HTMLElement, viewport: ViewportBounds): void {
    const availableWidth = Math.max(
      0,
      viewport.right - viewport.left - VIEWPORT_SAFE_MARGIN_PX * 2
    );
    surface.style.maxWidth = `${Math.floor(availableWidth)}px`;
  }

  function clampVisibleSurfaceToViewport(): void {
    viewportRepositionFrame = null;
    if (!selectionSurface || selectionSurface.host.hidden) {
      return;
    }
    const { host, surface } = selectionSurface;
    const viewport = getViewportBounds();
    applySurfaceViewportLimit(surface, viewport);
    const bounds = surface.getBoundingClientRect();
    const safeLeft = viewport.left + VIEWPORT_SAFE_MARGIN_PX;
    const safeTop = viewport.top + VIEWPORT_SAFE_MARGIN_PX;
    const maximumLeft = viewport.right - bounds.width - VIEWPORT_SAFE_MARGIN_PX;
    const maximumTop = viewport.bottom - bounds.height - VIEWPORT_SAFE_MARGIN_PX;
    const currentTop = Number.parseFloat(host.style.top);
    const clampedTop = clampToSafeAxis(
      Number.isFinite(currentTop) ? currentTop : bounds.top,
      safeTop,
      maximumTop
    );
    if (hostHorizontalAnchor === 'right') {
      const layoutViewportWidth = getLayoutViewportWidth();
      const currentRightOffset = Number.parseFloat(host.style.right);
      const currentRightEdge = Number.isFinite(currentRightOffset)
        ? layoutViewportWidth - currentRightOffset
        : bounds.right;
      const rightEdge = clampToSafeAxis(
        currentRightEdge,
        safeLeft + bounds.width,
        viewport.right - VIEWPORT_SAFE_MARGIN_PX
      );
      setHostRightPosition(host, layoutViewportWidth - rightEdge, clampedTop);
      return;
    }
    const currentLeft = Number.parseFloat(host.style.left);
    setHostPosition(
      host,
      clampToSafeAxis(Number.isFinite(currentLeft) ? currentLeft : bounds.left, safeLeft, maximumLeft),
      clampedTop
    );
  }

  function scheduleViewportClamp(): void {
    if (!selectionSurface || selectionSurface.host.hidden) {
      return;
    }
    if (viewportRepositionFrame != null) {
      window.cancelAnimationFrame(viewportRepositionFrame);
    }
    viewportRepositionFrame = window.requestAnimationFrame(clampVisibleSurfaceToViewport);
  }

  function prefersReducedMotion(): boolean {
    try {
      return typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_error) {
      return false;
    }
  }

  function cancelToolbarEntranceAnimation(): void {
    if (toolbarEntranceFrame != null) {
      window.cancelAnimationFrame(toolbarEntranceFrame);
      window.clearTimeout(toolbarEntranceFrame);
      toolbarEntranceFrame = null;
    }
    if (toolbarEntranceCleanupTimer) {
      window.clearTimeout(toolbarEntranceCleanupTimer);
      toolbarEntranceCleanupTimer = null;
    }
    toolbarEntranceAnimations.forEach((animation) => {
      animation.cancel();
    });
    toolbarEntranceAnimations = [];
    if (selectionSurface) {
      const { surface, material, contentViewport, menu } = selectionSurface;
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
    toolbarEntranceFrame = window.setTimeout(() => {
      toolbarEntranceFrame = null;
      const live = selectionSurface;
      if (!live || live.menu.hidden || live.host.hidden) {
        cancelToolbarEntranceAnimation();
        return;
      }
      live.surface.dataset.toolbarEntranceState = 'to';
    }, 0);
  }

  function animateToolbarEntrance(originRect: DOMRect | null): void {
    cancelToolbarEntranceAnimation();
    if (!selectionSurface || !originRect) {
      return;
    }
    const scheduledSurface = selectionSurface.surface;
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
    toolbarEntranceFrame = runAfterLayout(() => {
      toolbarEntranceFrame = null;
      const live = selectionSurface;
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
      toolbarEntranceAnimations = [materialAnimation, contentRevealAnimation, toolbarContentAnimation];
      toolbarEntranceCleanupTimer = window.setTimeout(() => {
        toolbarEntranceCleanupTimer = null;
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
    if (viewportRepositionFrame != null) {
      window.cancelAnimationFrame(viewportRepositionFrame);
      viewportRepositionFrame = null;
    }
    currentCandidate = null;
    requestSequence += 1;
    if (!selectionSurface) {
      return;
    }
    selectionSurface.host.dataset.visible = 'false';
    if (!options || options.immediate !== false) {
      setHostHidden(selectionSurface.host, true);
    } else {
      window.setTimeout(() => {
        if (selectionSurface && selectionSurface.host.dataset.visible !== 'true') {
          setHostHidden(selectionSurface.host, true);
        }
      }, 160);
    }
  }

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
    if (surfaceResizeObserver) {
      surfaceResizeObserver.disconnect();
      surfaceResizeObserver = null;
    }
    if (selectionSurface && selectionSurface.host.isConnected) {
      selectionSurface.host.remove();
    }
    selectionSurface = null;
    currentCandidate = null;
  }

  function reconcileSurfaceOwnership(): boolean {
    if (!enabled) {
      return true;
    }
    const ownHost = selectionSurface ? selectionSurface.host : null;
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
      if (ownershipObserver) {
        ownershipObserver.disconnect();
        ownershipObserver = null;
      }
      return;
    }
    reconcileSurfaceOwnership();
    if (ownershipObserver || typeof MutationObserver !== 'function') {
      return;
    }
    ownershipObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationContainsSelectionHost)) {
        reconcileSurfaceOwnership();
      }
    });
    ownershipObserver.observe(document.documentElement || document, {
      childList: true,
      subtree: true
    });
  }

  function getActiveStorageAreaName(): string {
    return providerStorageRuntime.getActiveAreaName();
  }

  function updateRuntimeDebugState(): void {
    if (selectionSurface) {
      writeRuntimeDebugState(selectionSurface.host);
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

  function isInsideCode(element: Element): boolean {
    return Boolean(element.closest('code, pre, samp, kbd, .highlight, .syntax-highlight'));
  }

  function isSensitiveElement(element: Element | null): boolean {
    if (!element) {
      return false;
    }
    return Boolean(element.closest(
      'input[type="password"], [autocomplete="current-password"], [autocomplete="new-password"], [autocomplete^="cc-"], [data-sensitive="true"]'
    ));
  }

  function isTextControl(element: Element | null): element is TextControl {
    if (element instanceof HTMLTextAreaElement) {
      return true;
    }
    return element instanceof HTMLInputElement && isTextControlType(element.type || 'text');
  }

  function getRangeElement(range: Range): Element | null {
    const node = range.commonAncestorContainer;
    if (isElementNode(node)) {
      return node;
    }
    if (node.parentElement) {
      return node.parentElement;
    }
    const root = node.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  function getUsableClientRects(range: Range): DOMRect[] {
    if (typeof range.getClientRects !== 'function') {
      return [];
    }
    return Array.from(range.getClientRects()).filter((item) => (
      item && Number.isFinite(item.left) && Number.isFinite(item.right) &&
      Number.isFinite(item.top) && Number.isFinite(item.bottom) &&
      item.width > 0 && item.height > 0
    ));
  }

  function getRangeRect(range: Range): SelectionRect | null {
    const clientRects = getUsableClientRects(range);
    let rect = range.getBoundingClientRect();
    if ((!rect || rect.width <= 0 || rect.height <= 0) && clientRects.length > 0) {
      rect = clientRects[clientRects.length - 1];
    }
    if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.bottom)) {
      return null;
    }
    const inlineRect = clientRects.length > 0
      ? clientRects[clientRects.length - 1]
      : rect;
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      inline: {
        bottom: inlineRect.bottom,
        left: inlineRect.left,
        right: inlineRect.right,
        top: inlineRect.top,
        height: inlineRect.height
      }
    };
  }

  function getDomSelectionSnapshot(): DomSelectionSnapshot | null {
    if (typeof window.getSelection !== 'function') {
      return null;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount <= 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const element = getRangeElement(range);
    const rect = getRangeRect(range);
    if (isSensitiveElement(element)) {
      return null;
    }
    const text = INTENT.normalizeText(selection.toString());
    if (!element || !rect || !text) {
      return null;
    }
    return {
      sourceKind: 'dom',
      element,
      text,
      rect,
      anchorNode: selection.anchorNode,
      anchorOffset: selection.anchorOffset,
      focusNode: selection.focusNode,
      focusOffset: selection.focusOffset
    };
  }

  function getTextControlSelectionSnapshot(
    element: Element | null,
    point?: { clientX: number } | null
  ): TextControlSelectionSnapshot | null {
    if (!isTextControl(element) || isSensitiveElement(element)) {
      return null;
    }
    const start = Number(element.selectionStart);
    const end = Number(element.selectionEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
      return null;
    }
    const text = INTENT.normalizeText(String(element.value || '').slice(start, end));
    if (!text) {
      return null;
    }
    const bounds = element.getBoundingClientRect();
    const pointerX = point && Number.isFinite(point.clientX)
      ? point.clientX
      : bounds.right;
    const x = Math.min(bounds.right, Math.max(bounds.left, pointerX));
    return {
      sourceKind: 'text-control',
      element,
      text,
      rect: {
        bottom: bounds.bottom,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        inline: {
          bottom: bounds.bottom,
          height: bounds.height,
          left: x,
          right: x,
          top: bounds.top
        }
      },
      start,
      end
    };
  }

  function getTargetElement(target: EventTarget | null): Element | null {
    if (!(target instanceof Node)) {
      return null;
    }
    return isElementNode(target) ? target : target.parentElement;
  }

  // The selection in the page or in a text field, whichever the user made;
  // a text field under the pointer comes first.
  function getUnifiedSelectionSnapshot(
    target: EventTarget | null,
    point?: { clientX: number }
  ): SelectionSnapshot | null {
    const targetElement = getTargetElement(target);
    const targetControl = targetElement ? targetElement.closest('input, textarea') : null;
    const activeControl = isTextControl(document.activeElement)
      ? document.activeElement
      : null;
    if (targetControl && point) {
      const pointedControlSnapshot = getTextControlSelectionSnapshot(targetControl, point);
      if (pointedControlSnapshot) {
        return pointedControlSnapshot;
      }
    }
    return getDomSelectionSnapshot() ||
      getTextControlSelectionSnapshot(targetControl || activeControl, point);
  }

  function isSameSelection(left: SelectionSnapshot | null, right: SelectionSnapshot | null): boolean {
    if (!left || !right) {
      return false;
    }
    if (left.element !== right.element || left.text !== right.text) {
      return false;
    }
    if (left.sourceKind === 'text-control' && right.sourceKind === 'text-control') {
      return left.start === right.start && left.end === right.end;
    }
    if (left.sourceKind === 'dom' && right.sourceKind === 'dom') {
      return left.anchorNode === right.anchorNode &&
        left.anchorOffset === right.anchorOffset &&
        left.focusNode === right.focusNode &&
        left.focusOffset === right.focusOffset;
    }
    return false;
  }

  function isSelectionStillCurrent(candidate: SelectionCandidate): boolean {
    const liveSnapshot = getUnifiedSelectionSnapshot(candidate.snapshot.element);
    if (!liveSnapshot) {
      return true;
    }
    return isSameSelection(candidate.snapshot, liveSnapshot);
  }

  function parseCssColor(value: string): ColorRgba | null {
    const match = String(value || '').match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i
    );
    if (!match) {
      return null;
    }
    return {
      a: match[4] == null ? 1 : Math.max(0, Math.min(1, Number(match[4]))),
      b: Math.max(0, Math.min(255, Number(match[3]))),
      g: Math.max(0, Math.min(255, Number(match[2]))),
      r: Math.max(0, Math.min(255, Number(match[1])))
    };
  }

  function compositeBackground(front: ColorRgba, back: ColorRgba): ColorRgba {
    const alpha = front.a + back.a * (1 - front.a);
    if (alpha <= 0) {
      return { a: 0, b: 0, g: 0, r: 0 };
    }
    const backWeight = back.a * (1 - front.a);
    return {
      a: alpha,
      b: (front.b * front.a + back.b * backWeight) / alpha,
      g: (front.g * front.a + back.g * backWeight) / alpha,
      r: (front.r * front.a + back.r * backWeight) / alpha
    };
  }

  function getRelativeLuminance(color: ColorRgba): number {
    const channel = (value: number): number => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(color.r) +
      0.7152 * channel(color.g) +
      0.0722 * channel(color.b);
  }

  function resolveEntryContrastTone(element: Element): EntryContrastTone {
    let current: Element | null = element;
    let composite: ColorRgba = { a: 0, b: 0, g: 0, r: 0 };
    let complexBackdrop = false;
    while (current && composite.a < 0.98) {
      try {
        const computed = window.getComputedStyle(current);
        const background = parseCssColor(computed.backgroundColor);
        if (background && background.a > 0) {
          composite = compositeBackground(composite, background);
        }
        if (computed.backgroundImage && computed.backgroundImage !== 'none') {
          complexBackdrop = true;
        }
      } catch (_error) {
        // Keep the neutral fallback when a hostile page blocks style inspection.
      }
      current = current.parentElement;
    }
    if (composite.a < 1) {
      composite = compositeBackground(composite, { a: 1, b: 255, g: 255, r: 255 });
    }
    const luminance = getRelativeLuminance(composite);
    if (complexBackdrop && luminance >= 0.34 && luminance <= 0.78) {
      return 'mixed';
    }
    if (luminance < 0.42) {
      return 'dark';
    }
    if (luminance > 0.72) {
      return 'light';
    }
    return 'mixed';
  }

  // Stylesheet for the toolbar's closed shadow root.
  const SELECTION_SURFACE_STYLES = `
      :host {
        all: initial;
        position: fixed;
        z-index: 2147483647;
        display: block;
        box-sizing: border-box;
        width: max-content;
        height: max-content;
        margin: 0;
        padding: 0;
        border: 0;
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: none;
        filter: none;
        overflow: visible;
        isolation: isolate;
        mix-blend-mode: normal;
        contain: layout style;
        color-scheme: light dark;
        font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      :host([hidden]) { display: none; }
      :host::before,
      :host::after {
        content: none !important;
        display: none !important;
      }
      .lumno-selection-surface {
        --lumno-selection-surface-radius: 13px;
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0;
        height: 38px;
        padding: 3px;
        border: 1px solid transparent;
        border-radius: var(--lumno-selection-surface-radius);
        background: transparent;
        color: light-dark(#18181b, #e7e8eb);
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        box-shadow: none;
        opacity: 0;
        transform: translateY(-3px) scale(0.96);
        transition: opacity 140ms ease, transform 160ms ease;
        box-sizing: border-box;
        overflow: visible;
        contain: layout style;
      }
      .lumno-selection-material {
        position: absolute;
        inset: 0 auto 0 0;
        z-index: 0;
        width: 100%;
        box-sizing: border-box;
        overflow: hidden;
        border: 1px solid light-dark(rgba(15, 23, 42, 0.12), rgba(255, 255, 255, 0.13));
        border-radius: inherit;
        background: light-dark(rgba(244, 245, 247, 0.94), rgba(26, 27, 31, 0.92));
        -webkit-backdrop-filter: blur(14px) saturate(130%);
        backdrop-filter: blur(14px) saturate(130%);
        box-shadow:
          inset 0 0 0 1px light-dark(rgba(255, 255, 255, 0.3), transparent),
          0 8px 24px light-dark(rgba(15, 23, 42, 0.14), rgba(0, 0, 0, 0.38)),
          0 2px 6px light-dark(rgba(15, 23, 42, 0.08), rgba(0, 0, 0, 0.24));
        pointer-events: none;
      }
      .lumno-selection-material::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: calc(var(--lumno-selection-surface-radius) - 1px);
        background:
          radial-gradient(125% 165% at 50% -38%, light-dark(rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.16)) 0%, transparent 72%),
          radial-gradient(115% 145% at 50% 138%, light-dark(rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.08)) 0%, transparent 78%);
        pointer-events: none;
      }
      .lumno-selection-surface > * {
        position: relative;
        z-index: 1;
      }
      .lumno-selection-surface > .lumno-selection-material {
        position: absolute;
        z-index: 0;
      }
      .lumno-selection-surface[data-icon-only="true"] {
        height: auto;
        padding: 0;
        border: 0;
        background: transparent;
        box-shadow: none;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
        overflow: visible;
      }
      .lumno-selection-surface[data-icon-only="true"] .lumno-selection-material { display: none; }
      .lumno-selection-surface[data-icon-only="true"] .lumno-selection-content {
        flex: 0 0 auto;
        overflow: visible;
      }
      .lumno-selection-surface[data-icon-only="false"] {
        padding-inline-end: 1px;
      }
      :host([data-visible="true"]) .lumno-selection-surface {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      button {
        appearance: none;
        border: 0;
        margin: 0;
        padding: 0 8px;
        min-height: 30px;
        border-radius: 9px;
        corner-shape: superellipse(1.25);
        background: transparent;
        color: inherit;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        font: 400 12px/1.2 "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        white-space: nowrap;
        cursor: pointer;
      }
      button:hover, button:focus-visible {
        background: light-dark(rgba(15, 23, 42, 0.065), rgba(255, 255, 255, 0.1));
        outline: none;
      }
      button:focus-visible {
        box-shadow: inset 0 0 0 1px light-dark(rgba(15, 23, 42, 0.2), rgba(255, 255, 255, 0.28));
      }
      button:disabled { opacity: 0.56; cursor: default; }
      .lumno-selection-main[data-icon-only="true"] {
        position: relative;
        width: 18px;
        min-height: 18px;
        padding: 0;
        border-radius: 5px;
        background: rgba(250, 250, 250, 0.76);
        -webkit-backdrop-filter: blur(10px) saturate(150%);
        backdrop-filter: blur(10px) saturate(150%);
        opacity: 0;
        transform: translateY(2px) scale(0.9);
        transition: background 120ms ease, backdrop-filter 120ms ease,
          opacity 160ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .lumno-selection-main[data-icon-only="true"]::before {
        content: "";
        position: absolute;
        inset: -5px;
      }
      .lumno-selection-main[data-icon-only="true"] .lumno-selection-label { display: none; }
      .lumno-selection-main[data-icon-only="false"] {
        width: 30px;
        min-height: 30px;
        padding: 0;
      }
      .lumno-selection-main[data-icon-only="false"] .lumno-selection-label { display: none; }
      .lumno-selection-main[data-icon-only="false"],
      .lumno-selection-primary-divider,
      .lumno-selection-toolbar {
        flex: 0 0 auto;
      }
      .lumno-selection-logo { width: 17px; height: 17px; display: block; }
      .lumno-selection-main[data-icon-only="true"] .lumno-selection-logo {
        width: 12px;
        height: 12px;
        filter: brightness(0.28) contrast(1.18);
        opacity: 0.9;
      }
      .lumno-selection-surface[data-icon-only="true"] .lumno-selection-main {
        transition: background 120ms ease, backdrop-filter 120ms ease,
          opacity 160ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .lumno-selection-surface[data-icon-only="true"] .lumno-selection-main:hover {
        background: rgba(255, 255, 255, 0.94);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
        backdrop-filter: blur(10px) saturate(140%);
      }
      .lumno-selection-surface[data-icon-only="true"] .lumno-selection-main:focus-visible {
        background: rgba(255, 255, 255, 0.94);
        box-shadow: none;
      }
      :host([data-visible="true"]) .lumno-selection-main[data-icon-only="true"] {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      :host([data-entry-contrast="dark"]) .lumno-selection-main[data-icon-only="true"] {
        background: rgba(19, 22, 28, 0.32);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.09), 0 1px 3px rgba(0, 0, 0, 0.18);
      }
      :host([data-entry-contrast="dark"]) .lumno-selection-main[data-icon-only="true"] .lumno-selection-logo {
        filter: brightness(1.45) contrast(0.88) drop-shadow(0 0 1px rgba(0, 0, 0, 0.2));
        opacity: 0.84;
      }
      :host([data-entry-contrast="mixed"]) .lumno-selection-main[data-icon-only="true"] {
        background: rgba(250, 250, 250, 0.3);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 1px 3px rgba(0, 0, 0, 0.14);
      }
      :host([data-entry-contrast="mixed"]) .lumno-selection-main[data-icon-only="true"] .lumno-selection-logo {
        filter: brightness(0.62) contrast(1.05) drop-shadow(0 0 1px rgba(255, 255, 255, 0.72));
        opacity: 0.86;
      }
      .lumno-selection-content {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        flex: 0 1 auto;
        min-width: 0;
        border-radius: 2px;
        overflow: hidden;
      }
      .lumno-selection-toolbar {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        transform-origin: left center;
        gap: 0;
      }
      .lumno-selection-primary-divider {
        display: block;
        width: 1px;
        height: 18px;
        margin-inline: 3px;
        background: light-dark(rgba(15, 23, 42, 0.12), rgba(255, 255, 255, 0.16));
        pointer-events: none;
      }
      .lumno-selection-actions-viewport {
        display: flex;
        align-items: center;
        flex: 0 1 auto;
        min-width: 0;
        justify-content: flex-end;
        overflow: hidden;
      }
      .lumno-selection-toolbar:focus {
        outline: none;
      }
      .lumno-selection-toolbar button {
        position: relative;
      }
      .lumno-selection-toolbar button + button {
        margin-inline-start: 7px;
      }
      .lumno-selection-toolbar button + button::before {
        content: "";
        position: absolute;
        inset-inline-start: -4px;
        top: 50%;
        width: 1px;
        height: 18px;
        background: light-dark(rgba(15, 23, 42, 0.12), rgba(255, 255, 255, 0.16));
        transform: translateY(-50%);
        pointer-events: none;
      }
      .lumno-selection-toolbar:hover button:focus-visible:not(:hover) {
        background: transparent;
        box-shadow: none;
      }
      .lumno-selection-toolbar[hidden],
      .lumno-selection-main[hidden],
      .lumno-selection-primary-divider[hidden],
      .lumno-selection-actions-viewport[hidden] { display: none; }
      .lumno-selection-action-icon {
        width: 16px;
        height: 16px;
        flex: 0 0 auto;
        display: block;
        color: currentColor;
      }
      .lumno-selection-action-label {
        display: block;
        overflow: hidden;
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-material {
        transition: width 240ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="from"] .lumno-selection-material {
        width: 0;
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="to"] .lumno-selection-material {
        width: var(--lumno-toolbar-expanded-width);
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-content {
        transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1) 20ms;
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="from"] .lumno-selection-content {
        width: 0;
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="to"] .lumno-selection-content {
        width: var(--lumno-toolbar-content-width);
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-toolbar {
        transition:
          transform 280ms cubic-bezier(0.22, 1, 0.36, 1) 30ms,
          opacity 180ms ease-out 50ms;
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="from"] .lumno-selection-toolbar {
        opacity: 0.72;
        transform: translateX(calc(-1 * var(--lumno-toolbar-content-offset)));
      }
      .lumno-selection-surface[data-toolbar-entrance-mode="fallback"][data-toolbar-entrance-state="to"] .lumno-selection-toolbar {
        opacity: 1;
        transform: translateX(0);
      }
      @supports (corner-shape: superellipse(1.25)) {
        .lumno-selection-surface,
        .lumno-selection-material,
        .lumno-selection-material::before {
          corner-shape: superellipse(1.25);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .lumno-selection-surface,
        .lumno-selection-main[data-icon-only="true"] {
          transition: none;
        }
        .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-material,
        .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-content,
        .lumno-selection-surface[data-toolbar-entrance-mode="fallback"] .lumno-selection-toolbar {
          transition: none;
        }
      }
    `;

  function createSurfaceHost(): { host: HTMLDivElement; shadow: ShadowRoot } {
    const host = document.createElement('div');
    host.id = HOST_ID;
    applyNoTranslate(host);
    setHostHidden(host, true);
    host.dataset.visible = 'false';
    writeRuntimeDebugState(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    return { host, shadow };
  }

  function createSurfaceStyle(): HTMLStyleElement {
    const style = document.createElement('style');
    style.textContent = SELECTION_SURFACE_STYLES;
    return style;
  }

  function createMainButton(): { mainButton: HTMLButtonElement; selectionLogo: HTMLImageElement; mainLabel: HTMLSpanElement } {
    const mainButton = document.createElement('button');
    mainButton.type = 'button';
    mainButton.className = 'lumno-selection-main';
    const logo = document.createElement('img');
    logo.className = 'lumno-selection-logo';
    logo.alt = '';
    logo.src = chrome.runtime.getURL('assets/images/lumno-selection-mark.svg');
    const mainLabel = document.createElement('span');
    mainLabel.className = 'lumno-selection-label';
    mainButton.append(logo);
    mainButton.append(mainLabel);
    mainButton.setAttribute('aria-controls', 'lumno-selection-toolbar');
    mainButton.setAttribute('aria-expanded', 'false');
    return { mainButton, selectionLogo: logo, mainLabel };
  }

  function createToolbar(): { primaryDivider: HTMLSpanElement; actionsViewport: HTMLDivElement; menu: HTMLDivElement } {
    const primaryDivider = document.createElement('span');
    primaryDivider.className = 'lumno-selection-primary-divider';
    primaryDivider.hidden = true;
    primaryDivider.setAttribute('aria-hidden', 'true');

    const actionsViewport = document.createElement('div');
    actionsViewport.className = 'lumno-selection-actions-viewport';
    actionsViewport.hidden = true;

    const menu = document.createElement('div');
    menu.id = 'lumno-selection-toolbar';
    menu.className = 'lumno-selection-toolbar';
    menu.tabIndex = -1;
    menu.hidden = true;
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', getMessage('selection_quick_action_open_menu', '使用 Lumno 处理所选文字'));
    actionsViewport.append(menu);
    return { primaryDivider, actionsViewport, menu };
  }

  function createSurface(): SelectionSurface {
    const { host, shadow } = createSurfaceHost();
    shadow.appendChild(createSurfaceStyle());

    const surface = document.createElement('div');
    surface.className = 'lumno-selection-surface';
    surface.setAttribute('role', 'group');

    const material = document.createElement('span');
    material.className = 'lumno-selection-material';
    material.setAttribute('aria-hidden', 'true');

    const { mainButton, selectionLogo, mainLabel } = createMainButton();
    const { primaryDivider, actionsViewport, menu } = createToolbar();

    const contentViewport = document.createElement('div');
    contentViewport.className = 'lumno-selection-content';
    contentViewport.append(actionsViewport, primaryDivider, mainButton);

    surface.append(material, contentViewport);
    applyNoTranslateDeep(surface);
    return {
      host,
      shadow,
      surface,
      material,
      mainButton,
      selectionLogo,
      mainLabel,
      primaryDivider,
      contentViewport,
      actionsViewport,
      menu
    };
  }

  function observeSurfaceSize(surface: HTMLElement): void {
    if (typeof window.ResizeObserver === 'function') {
      surfaceResizeObserver = new window.ResizeObserver(scheduleViewportClamp);
      surfaceResizeObserver.observe(surface);
    }
  }

  function bindSurfaceInteractions(ui: SelectionSurface): void {
    const { surface, mainButton, menu } = ui;
    surface.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    surface.addEventListener('pointerenter', () => {
      if (dismissTimer) {
        window.clearTimeout(dismissTimer);
        dismissTimer = null;
      }
    });
    surface.addEventListener('pointerleave', () => {
      if (currentCandidate) {
        scheduleDismiss(!menu.hidden ? TOOLBAR_DISMISS_MS : ENTRY_DISMISS_MS);
      }
    });
    mainButton.addEventListener('click', () => {
      if (!currentCandidate) {
        return;
      }
      if (surface.dataset.iconOnly === 'true') {
        renderMenu();
        return;
      }
      openLabsSettings();
    });
  }

  // The toolbar, made and added to the page when missing; null while
  // another copy of this script holds the page.
  function ensureSurface(): SelectionSurface | null {
    if (selectionSurface && selectionSurface.host.isConnected) {
      updateRuntimeDebugState();
      return selectionSurface;
    }
    if (!reconcileSurfaceOwnership()) {
      return null;
    }
    const ui = createSurface();
    selectionSurface = ui;
    ui.shadow.appendChild(ui.surface);
    (document.documentElement || document.body).appendChild(ui.host);
    observeSurfaceSize(ui.surface);
    bindSurfaceInteractions(ui);
    return ui;
  }

  // Inline puts the entry button at the end of the selection; panel opens
  // the toolbar where the entry button was.
  function positionSurface(rect: SelectionRect, placement: 'inline' | 'panel', anchorRect?: DOMRect | null): void {
    if (!selectionSurface) {
      return;
    }
    const isInline = placement === 'inline';
    const panelAnchor = placement === 'panel' && anchorRect &&
      Number.isFinite(anchorRect.left) && Number.isFinite(anchorRect.top)
      ? anchorRect
      : null;
    if (!panelAnchor) {
      const initialViewport = getViewportBounds();
      setHostPosition(
        selectionSurface.host,
        initialViewport.left + VIEWPORT_SAFE_MARGIN_PX,
        initialViewport.top + VIEWPORT_SAFE_MARGIN_PX
      );
    }
    window.requestAnimationFrame(() => {
      if (!selectionSurface || selectionSurface.host.hidden) {
        return;
      }
      const { host, surface } = selectionSurface;
      const viewport = getViewportBounds();
      applySurfaceViewportLimit(surface, viewport);
      const bounds = surface.getBoundingClientRect();
      const safeLeft = viewport.left + VIEWPORT_SAFE_MARGIN_PX;
      const safeTop = viewport.top + VIEWPORT_SAFE_MARGIN_PX;
      const safeRight = viewport.right - VIEWPORT_SAFE_MARGIN_PX;
      const safeBottom = viewport.bottom - VIEWPORT_SAFE_MARGIN_PX;
      const maximumLeft = safeRight - bounds.width;
      const maximumTop = safeBottom - bounds.height;
      if (panelAnchor) {
        const anchorHeight = Number.isFinite(panelAnchor.height) && panelAnchor.height > 0
          ? panelAnchor.height
          : 18;
        const anchorCenterY = panelAnchor.top + anchorHeight / 2;
        const preferredLeft = panelAnchor.left;
        const left = clampToSafeAxis(
          preferredLeft,
          safeLeft,
          maximumLeft
        );
        const top = clampToSafeAxis(
          anchorCenterY - bounds.height / 2,
          safeTop,
          maximumTop
        );
        setHostPosition(host, left, top);
        return;
      }
      if (isInline) {
        const anchor = rect.inline;
        const gap = 2;
        let left = anchor.right + gap;
        const topOffset = Math.max(4, Math.min(7, bounds.height * 0.4));
        let top = anchor.top - topOffset;
        const fitsRight = left + bounds.width <= safeRight;
        if (!fitsRight) {
          const leftCandidate = anchor.left - bounds.width - gap;
          if (leftCandidate >= safeLeft) {
            left = leftCandidate;
          } else {
            left = clampToSafeAxis(
              anchor.right - bounds.width,
              safeLeft,
              maximumLeft
            );
            top = anchor.bottom + gap;
          }
        }
        left = clampToSafeAxis(left, safeLeft, maximumLeft);
        top = clampToSafeAxis(top, safeTop, maximumTop);
        setHostPosition(host, left, top);
        return;
      }
      const left = clampToSafeAxis(
        rect.right - Math.min(32, bounds.width / 2),
        safeLeft,
        maximumLeft
      );
      const fitsBelow = rect.bottom + bounds.height + VIEWPORT_SAFE_MARGIN_PX <= safeBottom;
      const preferredTop = fitsBelow
        ? rect.bottom + VIEWPORT_SAFE_MARGIN_PX
        : rect.top - bounds.height - VIEWPORT_SAFE_MARGIN_PX;
      const top = clampToSafeAxis(preferredTop, safeTop, maximumTop);
      setHostPosition(host, left, top);
    });
  }

  function updateSelectionMark(): void {
    if (selectionSurface) {
      selectionSurface.selectionLogo.src = chrome.runtime.getURL('assets/images/lumno-selection-mark.svg');
      selectionSurface.host.dataset.selectionMark = 'lumno';
      writeRuntimeDebugState(selectionSurface.host);
    }
  }

  function scheduleDismiss(delay: number): void {
    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
    }
    dismissTimer = window.setTimeout(() => hideSurface({ immediate: false }), delay);
  }

  function renderCandidate(candidate: SelectionCandidate): void {
    cancelToolbarEntranceAnimation();
    const ui = ensureSurface();
    if (!ui) {
      return;
    }
    const { host, surface, mainButton, mainLabel, primaryDivider, actionsViewport, menu } = ui;
    currentCandidate = candidate;
    const action = candidate.classification.action;
    const label = getActionLabel(action);
    setHostHidden(host, false);
    host.dataset.iconSet = 'remix';
    const entryContrast = resolveEntryContrastTone(candidate.snapshot.element);
    host.dataset.entryContrast = entryContrast;
    setHostColorScheme(host, entryContrast === 'mixed' ? 'light dark' : entryContrast);
    host.dataset.visible = 'false';
    surface.dataset.iconOnly = 'true';
    delete surface.dataset.toolbarEntranceMode;
    updateSelectionMark();
    mainButton.hidden = false;
    mainButton.disabled = false;
    mainButton.dataset.iconOnly = 'true';
    mainButton.setAttribute('aria-label', getMessage('selection_quick_action_open_menu', '使用 Lumno 处理所选文字'));
    mainButton.setAttribute('aria-expanded', 'false');
    mainLabel.textContent = label;
    primaryDivider.hidden = true;
    actionsViewport.hidden = true;
    menu.hidden = true;
    menu.replaceChildren();
    positionSurface(candidate.rect, 'inline');
    const renderedCandidate = currentCandidate;
    window.requestAnimationFrame(() => {
      if (selectionSurface && currentCandidate === renderedCandidate) {
        selectionSurface.host.dataset.visible = 'true';
      }
    });
    scheduleDismiss(ENTRY_DISMISS_MS);
  }

  function buildMenuAction(action: SelectionAction): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.intent = action;
    const icon = buildActionIcon(action);
    const label = document.createElement('span');
    label.className = 'lumno-selection-action-label';
    label.textContent = getActionLabel(action);
    if (icon) {
      button.appendChild(icon);
    }
    button.appendChild(label);
    button.addEventListener('click', () => sendSelectionAction(action));
    return button;
  }

  function getToolbarActions(primary: SelectionAction): SelectionAction[] {
    return [primary, ...TOOLBAR_FALLBACK_ACTIONS]
      .filter((action, index, actions) => actions.indexOf(action) === index)
      .slice(0, 3);
  }

  function openLabsSettings(): void {
    try {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'openOptionsPage',
        hash: 'labs'
      });
    } catch (_error) {
      // The entry disappears even if an extension update interrupts navigation.
    }
    hideSurface();
  }

  function renderMenu(): void {
    const ui = selectionSurface;
    if (!currentCandidate || !ui) {
      return;
    }
    const { host, surface, mainButton, primaryDivider, actionsViewport, menu } = ui;
    const originRect = surface.dataset.iconOnly === 'true'
      ? mainButton.getBoundingClientRect()
      : null;
    const primary = currentCandidate.classification.action;
    const actions = getToolbarActions(primary);
    const actionButtons = actions.map(buildMenuAction);
    surface.dataset.iconOnly = 'false';
    mainButton.hidden = false;
    mainButton.dataset.iconOnly = 'false';
    mainButton.setAttribute('aria-label', getMessage('settings_tab_labs', '实验室功能'));
    mainButton.setAttribute('aria-expanded', 'true');
    menu.replaceChildren(...actionButtons);
    applyNoTranslateDeep(menu);
    host.dataset.iconSet = 'remix';
    primaryDivider.hidden = false;
    actionsViewport.hidden = false;
    menu.hidden = false;
    positionSurface(currentCandidate.rect, 'panel', originRect);
    menu.focus({ preventScroll: true });
    animateToolbarEntrance(originRect);
    scheduleDismiss(TOOLBAR_DISMISS_MS);
  }

  function renderSendingStatus(): void {
    if (!selectionSurface || !currentCandidate) {
      return;
    }
    cancelToolbarEntranceAnimation();
    selectionSurface.host.dataset.visible = 'false';
    setHostHidden(selectionSurface.host, true);
    showSelectionToast(
      getMessage('selection_quick_action_sending', '正在后台打开…'),
      { duration: ACTION_SUCCESS_DISMISS_MS }
    );
  }

  function renderFailureStatus(): void {
    if (selectionSurface) {
      selectionSurface.host.dataset.visible = 'false';
      setHostHidden(selectionSurface.host, true);
    }
    showSelectionToast(
      getMessage('selection_quick_action_failed', '发送失败，请重试。'),
      { error: true, duration: ACTION_FAILURE_DISMISS_MS }
    );
    scheduleDismiss(ACTION_FAILURE_DISMISS_MS);
  }

  function sendSelectionAction(action: SelectionAction): void {
    const candidate = currentCandidate;
    if (!candidate || !isSelectionStillCurrent(candidate)) {
      hideSurface();
      return;
    }
    const sequence = ++requestSequence;
    renderSendingStatus();
    clearSelectionActionHideTimer();
    const hideTimer = window.setTimeout(() => {
      if (selectionActionHideTimer !== hideTimer) {
        return;
      }
      selectionActionHideTimer = null;
      if (sequence === requestSequence && currentCandidate === candidate) {
        hideSurface({ immediate: false });
      }
    }, ACTION_SUCCESS_DISMISS_MS);
    selectionActionHideTimer = hideTimer;
    const renderCurrentFailure = (): void => {
      if (sequence !== requestSequence || currentCandidate !== candidate) {
        return;
      }
      clearSelectionActionHideTimer();
      renderFailureStatus();
    };
    try {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
        action: 'runSelectionQuickAction',
        intent: action,
        locale: getCurrentLocale(),
        text: candidate.classification.text
      }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          renderCurrentFailure();
          return;
        }
        if (!response || response.ok === false) {
          renderCurrentFailure();
        }
      });
    } catch (_error) {
      renderCurrentFailure();
    }
  }

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
    const ownHost = selectionSurface ? selectionSurface.host : null;
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
    if (!enabled) {
      return;
    }
    const candidate = buildCandidateFromSnapshot(resolvedSnapshot, classification);
    if (!candidate) {
      return;
    }
    const sequence = ++requestSequence;
    currentCandidate = candidate;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      if (sequence !== requestSequence || !enabled || !isSelectionStillCurrent(candidate)) {
        return;
      }
      renderCandidate(candidate);
    }, ENTRY_DELAY_MS);
  }

  function resetSelectionGesture(): void {
    selectionGestureActive = false;
    if (gestureResetTimer) {
      window.clearTimeout(gestureResetTimer);
      gestureResetTimer = null;
    }
  }

  function scheduleSelectionGestureReset(): void {
    if (gestureResetTimer) {
      window.clearTimeout(gestureResetTimer);
    }
    gestureResetTimer = window.setTimeout(() => {
      gestureResetTimer = null;
      if (pointerDownState) {
        scheduleSelectionGestureReset();
        return;
      }
      selectionGestureActive = false;
    }, SELECTION_GESTURE_TIMEOUT_MS);
  }

  function armSelectionGesture(): void {
    selectionGestureActive = true;
    scheduleSelectionGestureReset();
  }

  function cancelSelectionGesture(): void {
    pointerDownState = null;
    resetSelectionGesture();
    hideSurface();
  }

  function scheduleSelectionChangeEvaluation(): void {
    if (!enabled || !selectionGestureActive || pointerDownState) {
      return;
    }
    if (selectionChangeTimer) {
      window.clearTimeout(selectionChangeTimer);
    }
    selectionChangeTimer = window.setTimeout(() => {
      selectionChangeTimer = null;
      if (!enabled || !selectionGestureActive || pointerDownState || currentCandidate) {
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
    return selectionSurface !== null && event.composedPath().includes(selectionSurface.host);
  }

  function handlePointerUp(event: PointerEvent): void {
    const pointerDown = pointerDownState;
    pointerDownState = null;
    if (event.button !== 0 || !enabled ||
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
    pointerDownState = null;
    if (event.button !== 0 || !enabled ||
        event.isPrimary === false ||
        isFromOwnSurface(event)) {
      return;
    }
    pointerDownState = {
      pointerId: event.pointerId,
      selection: getUnifiedSelectionSnapshot(event.target, event)
    };
    hideSurface();
    armSelectionGesture();
  }

  function handleSelectionChange(): void {
    const snapshot = getUnifiedSelectionSnapshot(document.activeElement);
    if (currentCandidate && snapshot && !isSameSelection(currentCandidate.snapshot, snapshot)) {
      hideSurface();
    }
    if (!snapshot || !snapshot.text || !enabled ||
        !selectionGestureActive || pointerDownState || currentCandidate) {
      return;
    }
    scheduleSelectionChangeEvaluation();
  }

  function handlePointerCancel(): void {
    const pointerDown = pointerDownState;
    pointerDownState = null;
    const snapshot = getUnifiedSelectionSnapshot(document.activeElement);
    if (enabled && selectionGestureActive && snapshot && snapshot.text &&
        (!pointerDown || !isSameSelection(pointerDown.selection, snapshot))) {
      scheduleSelectionChangeEvaluation();
    }
  }

  function handleSelectStart(event: Event): void {
    if (!enabled || isFromOwnSurface(event)) {
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
    if (active && !attachedPageListeners) {
      attachedPageListeners = getPageListeners();
      attachedPageListeners.forEach((listener) => listener.attach());
    } else if (!active && attachedPageListeners) {
      attachedPageListeners.forEach((listener) => listener.detach());
      attachedPageListeners = null;
    }
  }

  function setFeatureActive(active: boolean): void {
    setPageListenersActive(active);
    setOwnershipMonitoring(active);
  }

  function applySettings(): void {
    enabled = settingsStore.get(FeatureSettings.selectionQuickActionsEnabled);
    languageMode = settingsStore.get(LocaleSettings.language);
    refreshLocaleMessages();
    if (!enabled) {
      cancelSelectionGesture();
      clearOwnedSurface();
    }
    setFeatureActive(enabled);
    if (currentCandidate && selectionSurface && !selectionSurface.host.hidden) {
      updateSelectionMark();
    } else {
      updateRuntimeDebugState();
    }
  }

  settingsStore.subscribe([FeatureSettings.selectionQuickActionsEnabled, LocaleSettings.language], applySettings);
  void settingsLoaded.then(applySettings);
})();
