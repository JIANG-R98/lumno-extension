// Where the switcher sits on the page: mounted above modal dialogs and
// fullscreen elements, centered in the visual viewport, and sized the same
// at any page or pinch zoom.
import { queryHtmlTags } from '../dom-lookup';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// Closing sits where the platform puts window controls: top-left on macOS,
// top-right on Windows.
function getCloseButtonPlacement(): 'left' | 'right' {
  const nav = window.navigator;
  const userAgentData: unknown = nav ? Reflect.get(nav, 'userAgentData') : null;
  const candidates = [
    isRecord(userAgentData) ? userAgentData.platform : '',
    nav ? nav.platform : '',
    nav ? nav.userAgent : ''
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const value = String(candidates[i] || '').toLowerCase();
    if (/(mac|iphone|ipad|ipod)/.test(value)) {
      return 'left';
    }
    if (/win/.test(value)) {
      return 'right';
    }
  }
  return 'left';
}

function isModalDialog(element: Element): boolean {
  try {
    return element.matches(':modal');
  } catch (_error) {
    return false;
  }
}

// Focus stays trapped in the topmost modal, so prefer the one holding it.
function findTopModalDialog(doc: Document): HTMLDialogElement | null {
  const active = doc.activeElement;
  const focusedDialog = active ? active.closest('dialog') : null;
  if (focusedDialog && isModalDialog(focusedDialog)) {
    return focusedDialog;
  }
  const dialogs = queryHtmlTags(doc, 'dialog[open]', 'dialog').filter(isModalDialog);
  return dialogs.length ? dialogs[dialogs.length - 1] : null;
}

// Modal dialogs and fullscreen elements live in the browser's top layer,
// above any z-index (X's image viewer is a modal dialog). Mounting inside the
// modal keeps the switcher from being inert; the host then joins the top
// layer itself as a popover.
function getSwitcherMountParent(doc: Document): Element {
  const modalDialog = findTopModalDialog(doc);
  const fullscreenElement = doc.fullscreenElement || null;
  if (modalDialog && (!fullscreenElement || fullscreenElement.contains(modalDialog))) {
    return modalDialog;
  }
  return fullscreenElement || doc.documentElement || doc.body;
}

function showSwitcherHostInTopLayer(host: HTMLElement): void {
  if (!host.hasAttribute('popover')) {
    return;
  }
  try {
    host.showPopover();
  } catch (_error) {
    // Keep the fixed-position fallback visible if top-layer promotion fails.
    host.removeAttribute('popover');
  }
}

function readFinite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// The visual viewport's size and offset, or the window's without one.
function readViewport(win: Window): { width: number; height: number; left: number; top: number } {
  const visual = win.visualViewport || null;
  const width = visual ? readFinite(visual.width) : null;
  const height = visual ? readFinite(visual.height) : null;
  return {
    width: width ?? (readFinite(win.innerWidth) || 0),
    height: height ?? (readFinite(win.innerHeight) || 0),
    left: (visual ? readFinite(visual.offsetLeft) : null) || 0,
    top: (visual ? readFinite(visual.offsetTop) : null) || 0
  };
}

function getVisualViewportScale(win: Window): number {
  const scale = win.visualViewport ? readFinite(win.visualViewport.scale) : null;
  return scale !== null && scale > 0 ? scale : 1;
}

// Larger screens get slightly larger cards.
function getViewportComfortScale(win: Window): number {
  const { width, height } = readViewport(win);
  if (width >= 1440 && height >= 820) {
    return 1.08;
  }
  if (width >= 1180 && height >= 700) {
    return 1.045;
  }
  return 1;
}

// Centers the panel in the visual viewport, which pinch zoom moves.
function applyViewportPlacement(panel: HTMLElement, win: Window): void {
  const viewport = readViewport(win);
  const centerLeft = Math.max(0, viewport.left) + Math.max(0, viewport.width) / 2;
  const centerTop = Math.max(0, viewport.top) + Math.max(0, viewport.height) / 2;
  panel.style.setProperty('--x-tab-switcher-center-left', `${Math.round(centerLeft)}px`);
  panel.style.setProperty('--x-tab-switcher-center-top', `${Math.round(centerTop)}px`);
}

// Keeps the panel's size at any page or pinch zoom.
function applyZoomCompensation(panel: HTMLElement, tabZoomFactor: unknown, win: Window): void {
  const combinedScale = Number(tabZoomFactor) * getVisualViewportScale(win);
  const baseVisibleScale = Number.isFinite(combinedScale) && combinedScale > 0 && combinedScale !== 1
    ? Math.max(0.35, Math.min(4, 1 / combinedScale))
    : 1;
  const visibleScale = Math.max(0.35, Math.min(4, baseVisibleScale * getViewportComfortScale(win)));
  panel.style.setProperty('--x-tab-switcher-visible-scale', String(Math.round(visibleScale * 1000) / 1000));
}

// Places and sizes the panel for the viewport as it is now.
function placeSwitcherPanel(panel: HTMLElement, tabZoomFactor: unknown, win: Window): void {
  applyViewportPlacement(panel, win);
  applyZoomCompensation(panel, tabZoomFactor, win);
}

export { getCloseButtonPlacement, getSwitcherMountParent, placeSwitcherPanel, showSwitcherHostInTopLayer };
