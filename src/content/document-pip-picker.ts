import type { BackgroundAction, BackgroundReply, BackgroundRequest, OkReply } from '../domain/messages';
import * as TOAST from '../shared/ui/toast';
import type { ToastController, ToastStyleGate } from '../shared/ui/toast';
import * as LumnoMessaging from '../platform/messaging';
import { allowsPictureInPicture, readDocumentPictureInPicture } from '../platform/document-picture-in-picture';
import type { DocumentPipPickerApi, DocumentPipPickerReply } from '../types/content-apis';

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

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// By node type rather than instanceof Element, which fails for nodes of the
// floating window: it is a realm of its own.
function isElementTarget(target: EventTarget | null): target is Element {
  return target !== null && 'nodeType' in target && target.nodeType === 1;
}

// An HTML element of the given tag, matched by name for the same reason.
function isHtmlTag<K extends keyof HTMLElementTagNameMap>(element: Element, tag: K): element is HTMLElementTagNameMap[K] {
  return element.namespaceURI === HTML_NAMESPACE && element.localName === tag;
}

// HTML and SVG elements have an inline style.
function hasInlineStyle(element: Element): element is Element & ElementCSSInlineStyle {
  return 'style' in element && isRecord(element.style);
}

function readErrorText(error: unknown, field: 'name' | 'message'): string {
  if (!isRecord(error)) {
    return '';
  }
  const value = error[field];
  return value ? String(value) : '';
}

(function() {
  if (window.__lumnoDocumentPiPPicker2026) {
    return;
  }

  const STATE_FLAG = '__lumno_document_pip_active_2026__';
  const ROOT_ID = '__lumno_document_pip_picker_root_2026__';
  const TOAST_HOST_ID = '__lumno_document_pip_toast_2026__';
  const HIGHLIGHT_ID = '__lumno_document_pip_highlight_2026__';
  const PICKER_HIGHLIGHT_PADDING = 4;
  const PIP_DOCK_CLEARANCE = 56;
  const PIP_CARD_GUTTER = 12;
  const PIP_MIN_WIDTH = 320;
  const PIP_MAX_WIDTH = 1200;
  const PIP_MIN_HEIGHT = 180;
  const PIP_MAX_HEIGHT = 900;
  const PIP_SYNC_DELAY_MS = 80;
  const PIP_STYLE_ANCHOR_ID = '__lumno_pip_style_anchor_2026__';
  const PICKER_Z_INDEX = '2147483646';
  const CONTEXT_LAYOUT_RESET: ReadonlyArray<readonly [string, string]> = [
    ['display', 'block'],
    ['position', 'static'],
    ['float', 'none'],
    ['width', 'auto'],
    ['min-width', '0'],
    ['max-width', 'none'],
    ['height', 'auto'],
    ['min-height', '0'],
    ['max-height', 'none'],
    ['margin', '0'],
    ['padding', '0'],
    ['border', '0'],
    ['box-shadow', 'none'],
    ['overflow', 'visible'],
    ['transform', 'none'],
    ['contain', 'none']
  ];
  const state: PickerState = {
    active: false,
    root: null,
    highlight: null,
    currentTarget: null,
    currentStack: [],
    currentStackIndex: 0,
    currentTheme: null,
    session: null,
    teardownSelection: null,
    toastHost: null,
    toastElement: null,
    toastController: null,
    toastStyleGate: null,
    opening: false,
    ownerToken: '',
    runtimeMessageHandlerBound: false
  };

  function applyNoTranslate<T extends Element>(element: T): T {
    element.setAttribute('translate', 'no');
    element.setAttribute('lang', 'zxx');
    element.setAttribute('notranslate', '');
    element.setAttribute('data-no-translate', 'true');
    element.classList.add('notranslate');
    return element;
  }

  function getMessage(name: string, fallback: string): string {
    try {
      if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
        const value = chrome.i18n.getMessage(name);
        if (value) {
          return value;
        }
      }
    } catch (_error) {
      // Ignore i18n failures in page context.
    }
    return fallback;
  }

  function getRuntimeUrl(path: string): string {
    try {
      if (chrome && chrome.runtime && typeof chrome.runtime.getURL === 'function') {
        return chrome.runtime.getURL(path);
      }
    } catch (_error) {
      // Ignore runtime URL failures.
    }
    return path;
  }

  function getDocumentPiPSupportState(): { supported: boolean; reason: SupportReason } {
    if (window.top !== window.self) {
      return { supported: false, reason: 'not-top-level' };
    }
    if (!window.isSecureContext) {
      return { supported: false, reason: 'not-secure-context' };
    }
    if (!readDocumentPictureInPicture(window)) {
      return { supported: false, reason: 'api-unavailable' };
    }
    if (!allowsPictureInPicture(document)) {
      return { supported: false, reason: 'blocked-by-policy' };
    }
    return { supported: true, reason: 'ok' };
  }

  function getSupportFailureMessage(reason: SupportReason): string {
    if (reason === 'blocked-by-policy') {
      return getMessage(
        'document_pip_picker_unsupported_policy',
        'This website disables Picture-in-Picture via site policy.'
      );
    }
    if (reason === 'not-top-level') {
      return getMessage(
        'document_pip_picker_unsupported_iframe',
        'Document Picture-in-Picture only works in the top-level page.'
      );
    }
    if (reason === 'not-secure-context') {
      return getMessage(
        'document_pip_picker_unsupported_insecure',
        'Document Picture-in-Picture requires HTTPS.'
      );
    }
    return getMessage(
      'document_pip_picker_unsupported',
      'This page does not support Document Picture-in-Picture.'
    );
  }

  function getOpenFailureMessage(error: unknown): string {
    const name = readErrorText(error, 'name');
    if (name === 'NotAllowedError') {
      return getMessage(
        'document_pip_picker_open_failed_not_allowed',
        'The website or browser blocked opening Document Picture-in-Picture.'
      );
    }
    if (name === 'NotSupportedError') {
      return getMessage(
        'document_pip_picker_open_failed_not_supported',
        'This selection cannot be opened in Document Picture-in-Picture on this page.'
      );
    }
    if (name === 'InvalidStateError') {
      return getMessage(
        'document_pip_picker_open_failed_invalid_state',
        'A floating window is already open or the page state changed. Try again.'
      );
    }
    if (name === 'SecurityError') {
      return getMessage(
        'document_pip_picker_open_failed_security',
        'The browser blocked this action for security reasons on this page.'
      );
    }
    return getMessage(
      'document_pip_picker_open_failed',
      'Failed to open the floating content window. Try a different area'
    );
  }

  function hasActiveVideoPiP(): boolean {
    return Boolean(document.pictureInPictureElement);
  }

  // Resolves with the reply, or with { ok: false, reason } on any failure.
  function sendRuntimeMessage<A extends BackgroundAction>(
    message: BackgroundRequest<A>
  ): Promise<BackgroundReply<A> | OkReply> {
    return new Promise((resolve) => {
      if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        resolve({ ok: false, reason: 'no-runtime-sendMessage' });
        return;
      }
      try {
        LumnoMessaging.sendBackgroundMessage(chrome.runtime, message, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            resolve({
              ok: false,
              reason: chrome.runtime.lastError.message || 'runtime-lastError'
            });
            return;
          }
          resolve(response && typeof response === 'object'
            ? response
            : { ok: false, reason: 'empty-response' });
        });
      } catch (error) {
        resolve({ ok: false, reason: String(error) });
      }
    });
  }

  async function requestDocumentPipOwnership(): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
    const response = await sendRuntimeMessage({
      action: 'pipRequestOwnership',
      kind: 'document'
    });
    if (response.ok && 'granted' in response && response.granted && response.token) {
      state.ownerToken = String(response.token);
      return { ok: true, granted: true };
    }
    return {
      ok: false,
      granted: false,
      reason: response && response.reason ? String(response.reason) : 'ownership-denied'
    };
  }

  function releaseDocumentPipOwnership(): void {
    const token = state.ownerToken;
    state.ownerToken = '';
    if (!token) {
      return;
    }
    sendRuntimeMessage({
      action: 'pipReleaseOwnership',
      token: token
    }).catch(() => {});
  }

  function showVideoPiPConflictToast(): void {
    ensurePickerUi();
    applyPickerTheme(getPickerTheme(null));
    showToast(
      getMessage(
        'document_pip_picker_conflict_video_pip',
        'A video PiP is already active. Close it before starting content clipping.'
      ),
      'error'
    );
  }

  function isOwnNode(target: EventTarget | null): boolean {
    return isElementTarget(target) && Boolean(target.closest(`#${ROOT_ID}, #${TOAST_HOST_ID}`));
  }

  function getElementFromPoint(event: MouseEvent): Element | null {
    if (typeof document.elementFromPoint !== 'function') {
      return null;
    }
    const element = document.elementFromPoint(event.clientX, event.clientY);
    return element && !isOwnNode(element) ? element : null;
  }

  function isVisibleElement(element: Element): boolean {
    if (!element.isConnected) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function isAllowedElement(element: Element): boolean {
    if (!element.isConnected || isOwnNode(element)) {
      return false;
    }
    const tagName = String(element.tagName || '').toUpperCase();
    if (!tagName) {
      return false;
    }
    if ([
      'HTML',
      'BODY',
      'HEAD',
      'SCRIPT',
      'STYLE',
      'LINK',
      'META',
      'NOSCRIPT',
      'TITLE',
      'SOURCE',
      'TRACK',
      'BR',
      'IFRAME',
      'FRAME',
      'OBJECT',
      'EMBED'
    ].includes(tagName)) {
      return false;
    }
    return isVisibleElement(element);
  }

  function containsBlockedMediaContent(element: Element): boolean {
    const tagName = String(element.tagName || '').toUpperCase();
    if (tagName === 'VIDEO' || tagName === 'AUDIO' || tagName === 'IFRAME') {
      return true;
    }
    try {
      return Boolean(element.querySelector('video, audio, iframe'));
    } catch (_error) {
      return true;
    }
  }

  function getElementStack(element: Element): Element[] {
    const stack: Element[] = [];
    let current: Element | null = element;
    while (current) {
      if (isAllowedElement(current)) {
        stack.push(current);
      }
      if (current === document.body) {
        break;
      }
      current = current.parentElement;
    }
    return stack.slice(0, 8);
  }

  function getElementArea(element: Element): number {
    const rect = element.getBoundingClientRect();
    return Math.max(0, Math.round((Number(rect.width) || 0) * (Number(rect.height) || 0)));
  }

  function hasPaintedSurface(element: Element): boolean {
    const style = window.getComputedStyle(element);
    const backgroundColor = parseCssColor(style.backgroundColor);
    return Boolean((backgroundColor && backgroundColor[3] > 0.04) || style.backgroundImage !== 'none');
  }

  function isLikelyLeafNode(element: Element): boolean {
    const childElements = Array.from(element.children).filter((child) => isVisibleElement(child));
    return childElements.length === 0;
  }

  function isLikelyToolbarLike(element: Element): boolean {
    const tagName = String(element.tagName || '').toLowerCase();
    const role = String(element.getAttribute('role') || '').toLowerCase();
    const classText = String(element.className || '').toLowerCase();
    if (tagName === 'nav' || tagName === 'header' || role === 'toolbar' || role === 'menubar' || role === 'navigation') {
      return true;
    }
    return /(toolbar|topbar|navbar|nav-|actions|action-bar|menu-bar|header-actions)/.test(classText);
  }

  function isLikelyInteractiveContainer(element: Element): boolean {
    if (isLikelyToolbarLike(element)) {
      return true;
    }
    if (element.matches('button, a, input, select, textarea, summary, label')) {
      return true;
    }
    return Boolean(element.querySelector('button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [aria-haspopup="true"]'));
  }

  function getCandidateScore(element: Element): number {
    const area = getElementArea(element);
    const paintedBoost = hasPaintedSurface(element) ? 1400000 : 0;
    const semanticBoost = element.matches('article, section, main, aside, dialog, [role="dialog"], [role="region"], [role="article"]') ? 1200000 : 0;
    const containerBoost = !isLikelyLeafNode(element) ? 400000 : 0;
    const toolbarPenalty = isLikelyToolbarLike(element) ? -550000 : 0;
    const tinyPenalty = area < 22000 ? -700000 : 0;
    const giantPenalty = area > Math.max(window.innerWidth * window.innerHeight * 0.82, 900000) ? -350000 : 0;
    const interactivePenalty = isLikelyInteractiveContainer(element) && !hasPaintedSurface(element) ? -180000 : 0;
    return area + paintedBoost + semanticBoost + containerBoost + toolbarPenalty + tinyPenalty + giantPenalty + interactivePenalty;
  }

  function getDefaultStackIndex(stack: Element[]): number {
    if (stack.length === 0) {
      return 0;
    }
    let bestIndex = 0;
    let bestScore = -Infinity;
    stack.forEach((element, index) => {
      const score = getCandidateScore(element);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function clampChannel(value: string | number): number {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function clampAlpha(value: string | number): number {
    return Math.max(0, Math.min(1, Number(value)));
  }

  function parseCssColor(value: string): Rgba | null {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'transparent' || raw === 'initial' || raw === 'inherit') {
      return null;
    }
    const rgbaMatch = raw.match(/^rgba?\(([^)]+)\)$/);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(',').map((item) => item.trim());
      if (parts.length < 3) {
        return null;
      }
      return [
        clampChannel(parts[0]),
        clampChannel(parts[1]),
        clampChannel(parts[2]),
        parts.length > 3 ? clampAlpha(parts[3]) : 1
      ];
    }
    const hexMatch = raw.match(/^#([0-9a-f]{3,8})$/i);
    if (!hexMatch) {
      return null;
    }
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const chars = hex.split('');
      return [
        parseInt(chars[0] + chars[0], 16),
        parseInt(chars[1] + chars[1], 16),
        parseInt(chars[2] + chars[2], 16),
        hex.length === 4 ? clampAlpha(parseInt(chars[3] + chars[3], 16) / 255) : 1
      ];
    }
    if (hex.length === 6 || hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        hex.length === 8 ? clampAlpha(parseInt(hex.slice(6, 8), 16) / 255) : 1
      ];
    }
    return null;
  }

  function rgbToCss(color: Rgba, alphaOverride?: number): string {
    const alpha = alphaOverride == null ? color[3] : alphaOverride;
    if (alpha >= 0.999) {
      return `rgb(${clampChannel(color[0])}, ${clampChannel(color[1])}, ${clampChannel(color[2])})`;
    }
    return `rgba(${clampChannel(color[0])}, ${clampChannel(color[1])}, ${clampChannel(color[2])}, ${clampAlpha(alpha).toFixed(3).replace(/0+$/,'').replace(/\.$/,'')})`;
  }

  function getLuminance(color: Rgba): number {
    const normalize = (channel: number): number => {
      const value = clampChannel(channel) / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * normalize(color[0]) + 0.7152 * normalize(color[1]) + 0.0722 * normalize(color[2]);
  }

  function findNearestPaintedElement(element: Element): Element {
    let current: Element | null = element;
    while (current) {
      const style = window.getComputedStyle(current);
      const backgroundColor = parseCssColor(style.backgroundColor);
      if ((backgroundColor && backgroundColor[3] > 0.04) || style.backgroundImage !== 'none') {
        return current;
      }
      current = current.parentElement;
    }
    return document.body || document.documentElement;
  }

  function getVisualTheme(element: Element): VisualTheme {
    const surfaceElement = findNearestPaintedElement(element);
    const pageElement = document.body || document.documentElement;
    const surfaceStyle = window.getComputedStyle(surfaceElement);
    const pageStyle = window.getComputedStyle(pageElement);
    const surfaceColor: Rgba = parseCssColor(surfaceStyle.backgroundColor) ||
      parseCssColor(pageStyle.backgroundColor) ||
      [255, 255, 255, 1];
    const pageColor = parseCssColor(pageStyle.backgroundColor) || surfaceColor;
    const isDark = getLuminance(surfaceColor) < 0.45;
    return {
      pageBackground: rgbToCss(pageColor),
      hudBackground: rgbToCss(surfaceColor, isDark ? 0.86 : 0.9),
      hudBorder: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)',
      buttonBackground: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.08)',
      secondaryButtonBackground: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.05)',
      buttonText: isDark ? '#f8fafc' : '#0f172a',
      buttonShadow: isDark
        ? 'inset 0 0 0 1px rgba(255,255,255,0.1)'
        : 'inset 0 0 0 1px rgba(255,255,255,0.46)',
      cardShadow: isDark ? '0 22px 60px rgba(0, 0, 0, 0.34)' : '0 22px 60px rgba(15, 23, 42, 0.14)',
      highlightBorder: isDark ? 'rgba(147, 197, 253, 0.92)' : 'rgba(37, 99, 235, 0.72)',
      highlightBackground: isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(37, 99, 235, 0.10)',
      highlightShadow: isDark
        ? '0 0 0 1px rgba(255,255,255,0.12), 0 20px 60px rgba(0, 0, 0, 0.28)'
        : '0 0 0 1px rgba(255,255,255,0.55), 0 20px 60px rgba(15, 23, 42, 0.18)',
      isDark
    };
  }

  function getPickerTheme(element: Element | null): VisualTheme {
    return getVisualTheme(element || document.body || document.documentElement);
  }

  // Returns the highlight box, adding the picker's layer when it is missing.
  function ensurePickerUi(): HTMLDivElement {
    if (state.root && state.root.isConnected && state.highlight) {
      return state.highlight;
    }
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    applyNoTranslate(root);
    root.style.cssText = [
      'position: fixed',
      'inset: 0',
      'pointer-events: none',
      `z-index: ${PICKER_Z_INDEX}`,
      'font-family: "Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ].join(';');

    const highlight = document.createElement('div');
    highlight.id = HIGHLIGHT_ID;
    applyNoTranslate(highlight);
    highlight.style.cssText = [
      'position: fixed',
      'left: 0',
      'top: 0',
      'width: 0',
      'height: 0',
      'border: 3px dashed rgba(37, 99, 235, 0.72)',
      'border-radius: 10px',
      'background: rgba(37, 99, 235, 0.10)',
      'box-shadow: 0 0 0 1px rgba(255,255,255,0.55), 0 20px 60px rgba(15, 23, 42, 0.18)',
      'transform: translate3d(0, 0, 0)',
      'transition: width 80ms ease, height 80ms ease, transform 80ms ease, opacity 80ms ease',
      'opacity: 0'
    ].join(';');

    root.appendChild(highlight);
    document.documentElement.appendChild(root);

    state.root = root;
    state.highlight = highlight;
    return highlight;
  }

  function applyPickerTheme(resolvedTheme: VisualTheme): void {
    state.currentTheme = resolvedTheme;
    if (state.highlight) {
      state.highlight.style.borderColor = resolvedTheme.highlightBorder;
      state.highlight.style.borderStyle = 'dashed';
      state.highlight.style.background = resolvedTheme.highlightBackground;
      state.highlight.style.boxShadow = resolvedTheme.highlightShadow;
    }
    if (state.toastElement) {
      if (resolvedTheme.isDark) {
        state.toastElement.setAttribute('data-theme', 'dark');
      } else {
        state.toastElement.removeAttribute('data-theme');
      }
    }
  }

  function setHighlight(element: Element | null): void {
    const highlight = ensurePickerUi();
    applyPickerTheme(getPickerTheme(element));
    if (!element) {
      highlight.style.opacity = '0';
      return;
    }
    const rect = element.getBoundingClientRect();
    const viewportWidth = Math.max(1, Number(window.innerWidth || document.documentElement.clientWidth || 0));
    const viewportHeight = Math.max(1, Number(window.innerHeight || document.documentElement.clientHeight || 0));
    const left = Math.max(0, Math.round(rect.left) - PICKER_HIGHLIGHT_PADDING);
    const top = Math.max(0, Math.round(rect.top) - PICKER_HIGHLIGHT_PADDING);
    const right = Math.min(viewportWidth, Math.round(rect.right) + PICKER_HIGHLIGHT_PADDING);
    const bottom = Math.min(viewportHeight, Math.round(rect.bottom) + PICKER_HIGHLIGHT_PADDING);
    highlight.style.opacity = '1';
    highlight.style.width = `${Math.max(0, right - left)}px`;
    highlight.style.height = `${Math.max(0, bottom - top)}px`;
    highlight.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function clearToast(): void {
    if (state.toastController) {
      state.toastController.destroy();
    }
    if (state.toastStyleGate) {
      state.toastStyleGate.destroy();
    }
    if (state.toastHost && state.toastHost.isConnected) {
      state.toastHost.remove();
    }
    state.toastHost = null;
    state.toastElement = null;
    state.toastController = null;
    state.toastStyleGate = null;
  }

  // The shared Toast, in its own shadow root so page styles cannot reach it and
  // outside the aria-hidden picker root so screen readers still hear it.
  function ensureToast(): { element: HTMLDivElement; controller: Readonly<ToastController> } | null {
    if (state.toastHost && state.toastHost.isConnected && state.toastElement && state.toastController) {
      return { element: state.toastElement, controller: state.toastController };
    }
    clearToast();
    if (!document.documentElement) {
      return null;
    }
    const staleHost = document.getElementById(TOAST_HOST_ID);
    if (staleHost) {
      staleHost.remove();
    }
    const toastHost = document.createElement('div');
    toastHost.id = TOAST_HOST_ID;
    applyNoTranslate(toastHost);
    toastHost.style.cssText = [
      'all: initial',
      'position: fixed',
      'inset: 0',
      `z-index: ${PICKER_Z_INDEX}`,
      'display: block',
      'pointer-events: none'
    ].map((rule) => `${rule} !important`).join(';');
    const toastShadow = toastHost.attachShadow({ mode: 'closed' });
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = chrome.runtime.getURL('src/shared/ui/toast.css');
    const toastElement = document.createElement('div');
    toastElement.className = 'x-lumno-toast';
    toastElement.setAttribute('data-show', 'false');
    toastElement.setAttribute('role', 'status');
    toastElement.setAttribute('aria-live', 'polite');
    toastElement.style.setProperty('--x-lumno-toast-top', 'max(24px, calc(env(safe-area-inset-top) + 12px))');
    toastElement.style.setProperty('--x-lumno-toast-z-index', PICKER_Z_INDEX);
    applyNoTranslate(toastElement);
    toastShadow.append(stylesheet, toastElement);
    document.documentElement.appendChild(toastHost);

    state.toastHost = toastHost;
    state.toastElement = toastElement;
    state.toastStyleGate = TOAST.createToastStyleGate(toastElement, {
      stylesheetElement: stylesheet,
      windowObj: window
    });
    const controller = TOAST.createToastController(toastElement, { windowObj: window });
    state.toastController = controller;
    return { element: toastElement, controller };
  }

  function hideToast(): void {
    if (state.toastController) {
      state.toastController.hide();
    }
  }

  function showToast(message: string, kind: ToastKind, options?: { persistent?: boolean }): void {
    const toast = ensureToast();
    if (!toast) {
      return;
    }
    applyPickerTheme(state.currentTheme || getPickerTheme(state.currentTarget));
    const errorToast = kind === 'error';
    toast.element.setAttribute('role', errorToast ? 'alert' : 'status');
    toast.element.setAttribute('aria-live', errorToast ? 'assertive' : 'polite');
    toast.controller.show(message, {
      error: errorToast,
      duration: options && options.persistent ? 0 : undefined
    });
  }

  function selectTargetFromStack(index: number): void {
    const nextIndex = Math.max(0, Math.min(index, state.currentStack.length - 1));
    state.currentStackIndex = nextIndex;
    state.currentTarget = state.currentStack[nextIndex] || null;
    setHighlight(state.currentTarget);
  }

  function updateCurrentTargetFromPointer(event: MouseEvent): void {
    const element = getElementFromPoint(event);
    if (!element) {
      state.currentStack = [];
      state.currentStackIndex = 0;
      state.currentTarget = null;
      setHighlight(null);
      return;
    }
    const stack = getElementStack(element);
    if (!stack.length) {
      state.currentStack = [];
      state.currentStackIndex = 0;
      state.currentTarget = null;
      setHighlight(null);
      return;
    }
    const previous = state.currentTarget;
    state.currentStack = stack;
    let nextIndex = 0;
    if (previous) {
      const matchedIndex = stack.indexOf(previous);
      if (matchedIndex >= 0) {
        nextIndex = matchedIndex;
      } else {
        nextIndex = getDefaultStackIndex(stack);
      }
    } else {
      nextIndex = getDefaultStackIndex(stack);
    }
    selectTargetFromStack(nextIndex);
  }

  function getPageStyleSheets(): CSSStyleSheet[] {
    const sheets = Array.from(document.styleSheets);
    // Some engines and test DOMs have no adopted stylesheets.
    const adopted = Array.isArray(document.adoptedStyleSheets) ? document.adoptedStyleSheets : [];
    return sheets.concat(adopted).filter((styleSheet) => !styleSheet.disabled);
  }

  function getStyleSheetRuleCount(styleSheet: CSSStyleSheet): number {
    try {
      return styleSheet.cssRules ? styleSheet.cssRules.length : -1;
    } catch (_error) {
      return -1;
    }
  }

  // Cheap enough to run on every page change: rule counts catch CSS-in-JS
  // libraries that insert rules without touching the DOM.
  function getStyleSheetSignature(): string {
    return getPageStyleSheets().map((styleSheet) => {
      const ownerNode = styleSheet.ownerNode;
      const textLength = ownerNode && ownerNode.textContent ? ownerNode.textContent.length : 0;
      const media = styleSheet.media ? styleSheet.media.mediaText : '';
      return `${styleSheet.href || 'inline'}#${getStyleSheetRuleCount(styleSheet)}#${textLength}#${media}`;
    }).join('|');
  }

  function getStyleSheetEntries(): StyleSheetEntry[] {
    return getPageStyleSheets().map((styleSheet): StyleSheetEntry => {
      const ownerNode = styleSheet.ownerNode;
      const media = styleSheet.media ? styleSheet.media.mediaText : '';
      if (ownerNode instanceof HTMLLinkElement && ownerNode.href) {
        return { kind: 'link', key: `link|${ownerNode.href}|${media}`, href: ownerNode.href, media: media };
      }
      let cssText = '';
      try {
        cssText = Array.from(styleSheet.cssRules || []).map((rule) => rule.cssText).join('\n');
      } catch (_error) {
        cssText = ownerNode && ownerNode.textContent ? ownerNode.textContent : '';
      }
      return { kind: 'style', key: `style|${media}|${cssText}`, cssText: cssText, media: media };
    });
  }

  function createPiPStyleNode(pipDocument: Document, entry: StyleSheetEntry): HTMLLinkElement | HTMLStyleElement {
    let node: HTMLLinkElement | HTMLStyleElement;
    if (entry.kind === 'link') {
      const link = pipDocument.createElement('link');
      link.rel = 'stylesheet';
      link.href = entry.href;
      node = link;
    } else {
      const style = pipDocument.createElement('style');
      style.textContent = entry.cssText;
      node = style;
    }
    node.setAttribute('data-lumno-pip-sheet', '1');
    node.setAttribute('data-lumno-pip-key', entry.key);
    if (entry.media) {
      node.setAttribute('media', entry.media);
    }
    return node;
  }

  // Page stylesheets go in front of this marker and the dock's own styles
  // after it, so page rules never restyle the dock.
  function ensurePiPStyleAnchor(pipDocument: Document): HTMLElement {
    let anchor = pipDocument.getElementById(PIP_STYLE_ANCHOR_ID);
    if (!anchor) {
      anchor = pipDocument.createElement('meta');
      anchor.id = PIP_STYLE_ANCHOR_ID;
      pipDocument.head.appendChild(anchor);
    }
    return anchor;
  }

  function syncPiPStyleSheets(session: ClipSession): void {
    const pipDocument = session.pipDocument;
    if (!pipDocument.head) {
      return;
    }
    const signature = getStyleSheetSignature();
    if (signature === session.styleSignature) {
      return;
    }
    session.styleSignature = signature;
    const head = pipDocument.head;
    const anchor = ensurePiPStyleAnchor(pipDocument);
    // Reuse nodes that are still wanted, so unchanged stylesheets never reload
    // and the floating content does not flash while the page restyles itself.
    const reusable = new Map<string, Element>();
    Array.from(head.querySelectorAll('[data-lumno-pip-sheet="1"]')).forEach((node) => {
      reusable.set(node.getAttribute('data-lumno-pip-key') || '', node);
    });
    const nodes = getStyleSheetEntries().map((entry): Element => {
      const existing = reusable.get(entry.key);
      if (existing) {
        reusable.delete(entry.key);
        return existing;
      }
      return createPiPStyleNode(pipDocument, entry);
    });
    let reference: Element = anchor;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      if (nodes[index].nextSibling !== reference) {
        head.insertBefore(nodes[index], reference);
      }
      reference = nodes[index];
    }
    reusable.forEach((node) => node.remove());
  }

  function copyRootAttributes(source: Element | null, target: Element | null, names: readonly string[]): void {
    if (!source || !target) {
      return;
    }
    Array.from(target.attributes).forEach((attr) => {
      if (/^data-/.test(attr.name) && !source.hasAttribute(attr.name)) {
        target.removeAttribute(attr.name);
      }
    });
    Array.from(source.attributes).forEach((attr) => {
      if (/^data-/.test(attr.name) || names.includes(attr.name)) {
        target.setAttribute(attr.name, attr.value);
      }
    });
    target.className = source.className;
  }

  // Theme switches usually live on <html> or <body> (class, data-theme, CSS
  // variables in the style attribute); the PiP document follows them.
  function syncPiPRootAttributes(session: ClipSession): void {
    const pipDocument = session.pipDocument;
    if (!pipDocument.documentElement) {
      return;
    }
    copyRootAttributes(document.documentElement, pipDocument.documentElement, ['style', 'lang', 'dir']);
    copyRootAttributes(document.body, pipDocument.body, ['lang', 'dir']);
  }

  function ensurePiPDocumentBase(pipDocument: Document): void {
    if (!pipDocument.head) {
      return;
    }
    const existing = pipDocument.getElementById('__lumno_pip_base_2026__');
    const base = existing || pipDocument.createElement('base');
    if (!existing) {
      base.id = '__lumno_pip_base_2026__';
      pipDocument.head.insertBefore(base, pipDocument.head.firstChild || null);
    }
    base.setAttribute('href', document.baseURI || window.location.href);
  }

  function cloneContextNodeShallow(sourceNode: Element, pipDocument: Document): HTMLElement | null {
    const tagName = String(sourceNode.tagName || '').toLowerCase();
    if (!tagName) {
      return null;
    }
    const clone = pipDocument.createElement(tagName);
    if (sourceNode.id) {
      clone.id = sourceNode.id;
    }
    if (sourceNode.className && typeof sourceNode.className === 'string') {
      clone.className = sourceNode.className;
    }
    Array.from(sourceNode.attributes).forEach((attr) => {
      if (!attr || !attr.name) {
        return;
      }
      const name = attr.name;
      if (name === 'id' || name === 'class') {
        return;
      }
      if (
        name === 'style' ||
        name === 'role' ||
        name === 'dir' ||
        name === 'lang' ||
        name.startsWith('data-') ||
        name.startsWith('aria-')
      ) {
        clone.setAttribute(name, attr.value);
      }
    });
    // Ancestors stay only so the page's selectors, fonts and colors still
    // match; their page layout (grid columns, fixed heights, scroll boxes)
    // would squeeze the clip into a column of the small window.
    CONTEXT_LAYOUT_RESET.forEach(([property, value]) => {
      clone.style.setProperty(property, value, 'important');
    });
    return clone;
  }

  function buildPiPContextChain(element: Element, pipDocument: Document): { root: HTMLDivElement; mountPoint: HTMLElement } {
    const root = pipDocument.createElement('div');
    root.setAttribute('data-lumno-pip-context-root', '1');
    root.style.cssText = [
      'position: relative',
      'width: 100%',
      'height: auto',
      'box-sizing: border-box'
    ].join(';');

    const ancestors: Element[] = [];
    let current = element.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
      ancestors.push(current);
      current = current.parentElement;
    }
    ancestors.reverse();

    let mountPoint: HTMLElement = root;
    ancestors.forEach((ancestor) => {
      const clonedAncestor = cloneContextNodeShallow(ancestor, pipDocument);
      if (!clonedAncestor) {
        return;
      }
      mountPoint.appendChild(clonedAncestor);
      mountPoint = clonedAncestor;
    });

    return {
      root: root,
      mountPoint: mountPoint
    };
  }

  function ensurePiPDockAssets(pipDocument: Document): void {
    if (!pipDocument.head) {
      return;
    }
    // The PiP window holds a clone of the host page, so remixicon.css and its
    // "[class^=ri-] { font-family: remixicon !important }" rule would restyle
    // the cloned page's own icons. Only the icon face is declared, under a
    // Lumno-only family name, and the dock's two glyphs are named below.
    if (!pipDocument.getElementById('__lumno_pip_icon_font_face_2026__')) {
      const fontUrl = String(getRuntimeUrl('assets/remixicon/fonts/remixicon.woff2'))
        .replace(/["\\\n\r\f]/g, '\\$&');
      const fontFace = pipDocument.createElement('style');
      fontFace.id = '__lumno_pip_icon_font_face_2026__';
      fontFace.textContent = [
        '@font-face {',
        '  font-family: "lumno-remixicon";',
        `  src: url("${fontUrl}") format("woff2");`,
        '  font-display: swap;',
        '}'
      ].join('\n');
      pipDocument.head.appendChild(fontFace);
    }
    if (!pipDocument.getElementById('__lumno_pip_dock_style_2026__')) {
      const style = pipDocument.createElement('style');
      style.id = '__lumno_pip_dock_style_2026__';
      style.textContent = `
        .lumno-pip-dock-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 0;
          border-radius: 999px;
          width: 36px;
          min-width: 36px;
          height: 36px;
          padding: 0;
          font: inherit;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.2;
          cursor: pointer;
          transition: background-color 150ms ease, opacity 150ms ease;
          transform: none;
          opacity: 0.96;
          white-space: nowrap;
        }
        .lumno-pip-dock-btn:hover,
        .lumno-pip-dock-btn:focus-visible {
          transform: none;
          opacity: 1;
          outline: none;
        }
        [data-lumno-pip-dock="1"]:not([data-expanded="true"]) .lumno-pip-dock-btn {
          opacity: 0;
        }
        .lumno-pip-dock-btn > * {
          cursor: inherit;
          pointer-events: none;
        }
        .lumno-pip-dock-btn .ri-icon {
          font-family: "lumno-remixicon" !important;
          font-style: normal;
          -webkit-font-smoothing: antialiased;
          font-size: 15px;
          line-height: 1;
          transform: none;
          transition: transform 150ms ease;
        }
        .lumno-pip-dock-btn:hover .ri-icon,
        .lumno-pip-dock-btn:focus-visible .ri-icon {
          transform: scale(1.03);
        }
        .lumno-pip-dock-btn .ri-close-line::before {
          content: "\\eb99";
        }
        .lumno-pip-dock-btn .ri-focus-3-line::before {
          content: "\\ed4c";
        }
        .lumno-pip-dock-btn .lumno-pip-dock-label {
          display: inline-block;
          max-width: 0;
          overflow: hidden;
          transition: max-width 160ms ease, opacity 160ms ease, margin 160ms ease;
          opacity: 0;
          margin-left: 0;
        }
        [data-lumno-pip-dock="1"]:hover .lumno-pip-dock-btn .lumno-pip-dock-label,
        [data-lumno-pip-dock="1"]:focus-within .lumno-pip-dock-btn .lumno-pip-dock-label {
          max-width: 88px;
          opacity: 1;
          margin-left: 2px;
        }
        [data-lumno-pip-dock="1"]:hover .lumno-pip-dock-btn,
        [data-lumno-pip-dock="1"]:focus-within .lumno-pip-dock-btn {
          width: auto;
          padding: 9px 12px;
        }
      `;
      pipDocument.head.appendChild(style);
    }
  }

  function getElementTree(root: Element): Element[] {
    return [root].concat(Array.from(root.querySelectorAll('*')));
  }

  // Writes the page's resolved URL into the copy, which has no base of the
  // page's own to resolve a relative one against.
  function copyUrlAttribute(sourceNode: Element, cloneNode: Element, attrName: string, resolved: string): void {
    const raw = sourceNode.getAttribute(attrName);
    if (!raw || /^\s*(#|data:|blob:|javascript:)/i.test(raw)) {
      return;
    }
    if (resolved) {
      cloneNode.setAttribute(attrName, resolved);
    }
  }

  // Copies what lives only in properties (form values, open details, canvas
  // pixels) and resolved URLs onto the copy, element by element.
  function syncCloneRuntimeState(sourceRoot: Element, cloneRoot: Element): void {
    const sourceNodes = getElementTree(sourceRoot);
    const cloneNodes = getElementTree(cloneRoot);
    const count = Math.min(sourceNodes.length, cloneNodes.length);
    for (let index = 0; index < count; index += 1) {
      const sourceNode = sourceNodes[index];
      const cloneNode = cloneNodes[index];
      if (isHtmlTag(sourceNode, 'input') && isHtmlTag(cloneNode, 'input')) {
        cloneNode.value = sourceNode.value;
        cloneNode.checked = sourceNode.checked;
        cloneNode.indeterminate = sourceNode.indeterminate;
      } else if (isHtmlTag(sourceNode, 'textarea') && isHtmlTag(cloneNode, 'textarea')) {
        cloneNode.value = sourceNode.value;
        cloneNode.textContent = sourceNode.value;
      } else if (isHtmlTag(sourceNode, 'select') && isHtmlTag(cloneNode, 'select')) {
        const cloneOptions = cloneNode.options;
        cloneNode.selectedIndex = sourceNode.selectedIndex;
        Array.from(sourceNode.options).forEach((sourceOption, optionIndex) => {
          const cloneOption = cloneOptions[optionIndex];
          if (cloneOption) {
            cloneOption.selected = sourceOption.selected;
          }
        });
      } else if (isHtmlTag(sourceNode, 'option') && isHtmlTag(cloneNode, 'option')) {
        cloneNode.selected = sourceNode.selected;
      } else if (isHtmlTag(sourceNode, 'details') && isHtmlTag(cloneNode, 'details')) {
        cloneNode.open = sourceNode.open;
      } else if (isHtmlTag(sourceNode, 'canvas') && isHtmlTag(cloneNode, 'canvas')) {
        try {
          const context = cloneNode.getContext('2d');
          if (context) {
            context.drawImage(sourceNode, 0, 0);
          }
        } catch (_error) {
          // Ignore canvas copies that are blocked by browser security.
        }
      }

      if (isHtmlTag(sourceNode, 'img')) {
        copyUrlAttribute(sourceNode, cloneNode, 'src', sourceNode.currentSrc || sourceNode.src);
      } else if (isHtmlTag(sourceNode, 'source') || isHtmlTag(sourceNode, 'track') || isHtmlTag(sourceNode, 'script')) {
        copyUrlAttribute(sourceNode, cloneNode, 'src', sourceNode.src);
      } else if (isHtmlTag(sourceNode, 'a') || isHtmlTag(sourceNode, 'area')) {
        copyUrlAttribute(sourceNode, cloneNode, 'href', sourceNode.href);
      }
    }
  }

  // The clip keeps its own look, but page-level placement (sticky headers,
  // fixed panels, outer margins) has no meaning in the floating window.
  function normalizeClipRoot(clone: Element, element: Element): void {
    if (!hasInlineStyle(clone)) {
      return;
    }
    const computed = window.getComputedStyle(element);
    if (['fixed', 'sticky', 'absolute'].includes(computed.position)) {
      clone.style.setProperty('position', 'relative', 'important');
      ['top', 'right', 'bottom', 'left'].forEach((side) => {
        clone.style.setProperty(side, 'auto', 'important');
      });
    }
    clone.style.setProperty('margin', '0', 'important');
  }

  function buildPiPElementClone(element: Element, pipDocument: Document): Element {
    const clone = pipDocument.importNode(element, true);
    syncCloneRuntimeState(element, clone);
    normalizeClipRoot(clone, element);
    return clone;
  }

  function refreshPiPContent(session: ClipSession): void {
    if (session.pipWindow.closed) {
      return;
    }
    syncPiPStyleSheets(session);
    const clone = buildPiPElementClone(session.element, session.pipDocument);
    const scrollHost = session.pipContent;
    const scrollTop = scrollHost.scrollTop;
    const scrollLeft = scrollHost.scrollLeft;
    if (session.pipElementClone && session.pipElementClone.parentNode === session.pipContentMount) {
      session.pipContentMount.replaceChild(clone, session.pipElementClone);
    } else {
      session.pipContentMount.replaceChildren(clone);
    }
    session.pipElementClone = clone;
    scrollHost.scrollTop = scrollTop;
    scrollHost.scrollLeft = scrollLeft;
  }

  function schedulePiPContentRefresh(session: ClipSession): void {
    if (session.contentSyncTimer != null) {
      return;
    }
    session.contentSyncTimer = window.setTimeout(() => {
      session.contentSyncTimer = null;
      refreshPiPContent(session);
    }, PIP_SYNC_DELAY_MS);
  }

  function schedulePiPDocumentSync(session: ClipSession): void {
    if (session.documentSyncTimer != null) {
      return;
    }
    session.documentSyncTimer = window.setTimeout(() => {
      session.documentSyncTimer = null;
      if (session.pipWindow.closed) {
        return;
      }
      syncPiPRootAttributes(session);
      syncPiPStyleSheets(session);
    }, PIP_SYNC_DELAY_MS);
  }

  function hasFloatingSurface(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return hasPaintedSurface(element) &&
      (style.boxShadow !== 'none' || (parseFloat(style.borderTopLeftRadius) || 0) > 0);
  }

  function getClipLayout(element: Element): ClipLayout {
    const rect = element.getBoundingClientRect();
    // Cards with rounded corners or shadows get a little room so their edges
    // do not touch the window frame; flat regions use the whole window.
    const gutter = hasFloatingSurface(element) ? PIP_CARD_GUTTER : 0;
    const width = Math.round(rect.width || 520) + gutter * 2;
    const height = Math.round(rect.height || 360) + gutter * 2 + PIP_DOCK_CLEARANCE;
    return {
      gutter: gutter,
      width: Math.max(PIP_MIN_WIDTH, Math.min(PIP_MAX_WIDTH, width)),
      height: Math.max(PIP_MIN_HEIGHT, Math.min(PIP_MAX_HEIGHT, height))
    };
  }

  function createPiPScaffold(
    pipWindow: Window,
    visualTheme: VisualTheme,
    layout: ClipLayout
  ): { shell: HTMLDivElement; content: HTMLDivElement } {
    const pipDocument = pipWindow.document;
    ensurePiPDocumentBase(pipDocument);
    ensurePiPStyleAnchor(pipDocument);
    ensurePiPDockAssets(pipDocument);
    pipDocument.title = document.title || 'Lumno PiP';
    pipDocument.body.replaceChildren();
    pipDocument.body.style.cssText = [
      'margin: 0 !important',
      'padding: 0 !important',
      `background: ${visualTheme.pageBackground}`
    ].join(';');

    // The scroll box is ours, so page rules on <html>/<body> such as
    // overflow: hidden (for an open modal) cannot freeze the clip.
    const shell = pipDocument.createElement('div');
    shell.style.cssText = [
      'position: fixed',
      'inset: 0',
      `background: ${visualTheme.pageBackground}`,
      'box-sizing: border-box'
    ].join(';');

    const content = pipDocument.createElement('div');
    content.style.cssText = [
      'height: 100%',
      'overflow: auto',
      `padding: ${layout.gutter}px ${layout.gutter}px ${layout.gutter + PIP_DOCK_CLEARANCE}px`,
      'box-sizing: border-box'
    ].join(';');

    shell.appendChild(content);
    pipDocument.body.appendChild(shell);

    return {
      shell: shell,
      content: content
    };
  }

  function createPiPDock(pipContext: {
    pipDocument: Document;
    shell: HTMLDivElement;
    visualTheme: VisualTheme;
  }): PiPDock | null {
    const { pipDocument, shell, visualTheme } = pipContext;
    const viewApi = globalThis.LumnoPipDockView;
    if (!viewApi) {
      return null;
    }
    const host = pipDocument.createElement('div');
    shell.appendChild(host);
    const view = viewApi.createPipDockView(host, {
      onClose() {
        restoreSession({ closeWindow: true });
      },
      onReselect() {
        restoreSession({ closeWindow: true });
        window.requestAnimationFrame(() => {
          startSelection();
        });
      }
    });
    view.render({
      theme: {
        hudBackground: visualTheme.hudBackground,
        hudBorder: visualTheme.hudBorder,
        cardShadow: visualTheme.cardShadow,
        buttonBackground: visualTheme.buttonBackground,
        buttonText: visualTheme.buttonText,
        buttonShadow: visualTheme.buttonShadow,
        secondaryButtonBackground: visualTheme.secondaryButtonBackground
      },
      labels: {
        reselect: getMessage('document_pip_picker_button_reselect', 'Reselect'),
        close: getMessage('document_pip_picker_button_close', 'Close')
      }
    });
    return { element: host, destroy: view.destroy };
  }

  function restoreSession(options?: { closeWindow?: boolean }): boolean {
    const session = state.session;
    if (!session) {
      releaseDocumentPipOwnership();
      return false;
    }
    state.session = null;
    Reflect.set(window, STATE_FLAG, false);

    [session.documentObserver, session.contentObserver, session.resizeObserver].forEach((observer) => {
      if (observer) {
        observer.disconnect();
      }
    });
    [session.contentSyncTimer, session.documentSyncTimer].forEach((timer) => {
      if (timer != null) {
        window.clearTimeout(timer);
      }
    });
    session.contentSyncTimer = null;
    session.documentSyncTimer = null;
    window.removeEventListener('pagehide', session.onMainPageHide, true);
    try {
      session.dock.destroy();
    } catch (_error) {
      // The window may be gone already.
    }

    if (!options || options.closeWindow !== false) {
      try {
        if (!session.pipWindow.closed) {
          session.pipWindow.close();
        }
      } catch (_error) {
        // Ignore close failures.
      }
    }
    setHighlight(null);
    releaseDocumentPipOwnership();
    return true;
  }

  function getPiPLinkUrl(link: Element): URL | null {
    const rawHref = link.getAttribute('href') || '';
    try {
      return new URL(rawHref, document.baseURI || window.location.href);
    } catch (_error) {
      return null;
    }
  }

  // The clip is a copy without the page's scripts, so following a link inside
  // the small window would replace the clip itself. Links open as tabs next
  // to the page instead, and in-page anchors scroll the clip.
  function handlePiPLinkClick(event: MouseEvent, session: ClipSession): void {
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    const target = event.target;
    const link = isElementTarget(target) ? target.closest('a[href], area[href]') : null;
    if (!link) {
      return;
    }
    event.preventDefault();
    const url = getPiPLinkUrl(link);
    if (!url) {
      return;
    }
    const pageUrl = new URL(window.location.href);
    if (url.origin === pageUrl.origin && url.pathname === pageUrl.pathname &&
        url.search === pageUrl.search) {
      // href="#" is usually a script-driven button; it has nothing to open.
      if (!url.hash) {
        return;
      }
      let anchorTarget: HTMLElement | null = null;
      try {
        anchorTarget = session.pipDocument.getElementById(decodeURIComponent(url.hash.slice(1)));
      } catch (_error) {
        anchorTarget = null;
      }
      if (anchorTarget) {
        anchorTarget.scrollIntoView({ block: 'start' });
      }
      return;
    }
    if (!/^(https?|mailto|tel):$/.test(url.protocol)) {
      return;
    }
    void sendRuntimeMessage({
      action: 'createTab',
      url: url.href,
      disposition: event.metaKey || event.ctrlKey ? 'backgroundTab' : 'newTab'
    });
  }

  function attachPiPDocumentHandlers(session: ClipSession): void {
    const pipDocument = session.pipDocument;
    pipDocument.addEventListener('click', (event) => {
      handlePiPLinkClick(event, session);
    });
    pipDocument.addEventListener('submit', (event) => {
      event.preventDefault();
    }, true);
  }

  async function openDocumentPiP(element: Element): Promise<OpenResult> {
    if (!isAllowedElement(element) || containsBlockedMediaContent(element)) {
      showToast(
        getMessage(
          'document_pip_picker_invalid',
          'This element cannot be opened in the floating window.'
        ),
        'error'
      );
      return { ok: false, reason: 'invalid-element' };
    }

    if (hasActiveVideoPiP()) {
      showVideoPiPConflictToast();
      return { ok: false, reason: 'video-pip-active' };
    }

    const pictureInPicture = readDocumentPictureInPicture(window);
    if (!pictureInPicture) {
      showToast(getSupportFailureMessage('api-unavailable'), 'error');
      return { ok: false, reason: 'api-unavailable' };
    }

    const visualTheme = getVisualTheme(element);
    const layout = getClipLayout(element);
    let pipWindow: Window;
    try {
      // Browsers only open PiP while the click's user activation is fresh, so
      // the window comes first; slow work like waking the background service
      // worker must not run before it.
      pipWindow = await pictureInPicture.requestWindow({
        width: layout.width,
        height: layout.height
      });
    } catch (error) {
      showToast(getOpenFailureMessage(error), 'error');
      return {
        ok: false,
        reason: 'request-window-failed',
        errorName: readErrorText(error, 'name'),
        errorMessage: readErrorText(error, 'message')
      };
    }

    let session: ClipSession | null = null;
    try {
      const pipDocument = pipWindow.document;
      const { shell, content } = createPiPScaffold(pipWindow, visualTheme, layout);
      const dock = createPiPDock({
        pipDocument,
        shell,
        visualTheme
      });
      if (!dock) {
        throw new Error('The clip window dock could not be drawn.');
      }
      const contextChain = buildPiPContextChain(element, pipDocument);
      content.appendChild(contextChain.root);

      const opened: ClipSession = {
        element: element,
        pipWindow: pipWindow,
        pipDocument: pipDocument,
        pipContent: content,
        pipContentMount: contextChain.mountPoint,
        pipElementClone: null,
        styleSignature: '',
        documentObserver: new MutationObserver(() => {
          schedulePiPDocumentSync(opened);
        }),
        contentObserver: new MutationObserver(() => {
          schedulePiPContentRefresh(opened);
        }),
        resizeObserver: typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
            schedulePiPContentRefresh(opened);
          })
          : null,
        contentSyncTimer: null,
        documentSyncTimer: null,
        dock: dock,
        onMainPageHide: () => {
          if (state.session === opened) {
            restoreSession({ closeWindow: true });
          }
        }
      };
      session = opened;

      opened.documentObserver.observe(document.documentElement, { attributes: true });
      if (document.body) {
        opened.documentObserver.observe(document.body, { attributes: true });
      }
      if (document.head) {
        opened.documentObserver.observe(document.head, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }

      opened.contentObserver.observe(element, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });

      if (opened.resizeObserver) {
        opened.resizeObserver.observe(element);
      }

      pipWindow.addEventListener('pagehide', () => {
        if (state.session === opened) {
          restoreSession({ closeWindow: false });
        }
      }, { once: true });
      window.addEventListener('pagehide', opened.onMainPageHide, true);
      attachPiPDocumentHandlers(opened);

      state.session = opened;
      syncPiPRootAttributes(opened);
      refreshPiPContent(opened);
      Reflect.set(window, STATE_FLAG, true);

    } catch (error) {
      if (session && state.session === session) {
        restoreSession({ closeWindow: true });
      } else {
        pipWindow.close();
      }
      throw error;
    }

    // Opening the window already closed any other PiP; claiming ownership
    // lets Lumno in other tabs drop their stale sessions.
    await requestDocumentPipOwnership();
    if (state.session !== session) {
      releaseDocumentPipOwnership();
    }
    return { ok: true };
  }

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
      const result = await openDocumentPiP(target);
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

    const onMouseMove = (event: MouseEvent): void => {
      if (!state.active) {
        return;
      }
      updateCurrentTargetFromPointer(event);
    };

    const onWheel = (event: WheelEvent): void => {
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
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (!state.active) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        stopSelection({});
        showToast(
          getMessage('document_pip_picker_cancelled', 'Content selection closed'),
          'info'
        );
        return;
      }
      if ((event.key === '[' || event.key === 'ArrowUp') && state.currentStack.length) {
        event.preventDefault();
        event.stopPropagation();
        selectTargetFromStack(state.currentStackIndex + 1);
        return;
      }
      if ((event.key === ']' || event.key === 'ArrowDown') && state.currentStack.length) {
        event.preventDefault();
        event.stopPropagation();
        selectTargetFromStack(state.currentStackIndex - 1);
        return;
      }
      if ((event.key === 'Enter' || event.key === 'NumpadEnter') && state.currentTarget) {
        event.preventDefault();
        event.stopPropagation();
        void confirmCurrentTarget();
      }
    };

    const onClick = async (event: MouseEvent): Promise<void> => {
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
    };

    const onPointerBlockingEvent = (event: Event): void => {
      if (!state.active) {
        return;
      }
      if (isOwnNode(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerBlockingEvent, true);
    window.addEventListener('mousedown', onPointerBlockingEvent, true);
    window.addEventListener('mouseup', onPointerBlockingEvent, true);
    window.addEventListener('click', onClick, true);

    state.teardownSelection = () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerBlockingEvent, true);
      window.removeEventListener('mousedown', onPointerBlockingEvent, true);
      window.removeEventListener('mouseup', onPointerBlockingEvent, true);
      window.removeEventListener('click', onClick, true);
    };

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

  function bindRuntimeMessageListener(): void {
    if (state.runtimeMessageHandlerBound) {
      return;
    }
    if (!chrome || !chrome.runtime || !chrome.runtime.onMessage ||
        typeof chrome.runtime.onMessage.addListener !== 'function') {
      return;
    }
    // Another tab took picture-in-picture over.
    chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: OkReply) => void) => {
      if (!isRecord(message) || message.action !== 'lumno:pip-force-surrender') {
        return false;
      }
      if (state.active) {
        stopSelection({});
      }
      restoreSession({ closeWindow: true });
      sendResponse({ ok: true });
      return true;
    });
    state.runtimeMessageHandlerBound = true;
  }

  bindRuntimeMessageListener();

  const pickerApi: Readonly<DocumentPipPickerApi> = {
    toggle: toggle,
    restore: () => restoreSession({ closeWindow: true }),
    notifyVideoPiPConflict: () => {
      if (state.active) {
        stopSelection({});
      }
      showVideoPiPConflictToast();
      return { ok: false, state: 'blocked-by-video-pip' };
    }
  };
  window.__lumnoDocumentPiPPicker2026 = pickerApi;
})();
