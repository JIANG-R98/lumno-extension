// The toolbar's elements, made once per page, and where they sit.
import { HOST_ID, VIEWPORT_SAFE_MARGIN_PX } from './constants';
import { applyNoTranslate, applyNoTranslateDeep, setHostHidden, setHostPosition } from './host';
import { getMessage } from './locale';
import { reconcileSurfaceOwnership, updateRuntimeDebugState, writeRuntimeDebugState } from './ownership';
import { state } from './state';
import { SELECTION_SURFACE_STYLES } from './surface-styles';
import type { SelectionRect, SelectionSurface } from './types';
import { applySurfaceViewportLimit, clampToSafeAxis, getViewportBounds, scheduleViewportClamp } from './viewport';

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
    state.surfaceResizeObserver = new window.ResizeObserver(scheduleViewportClamp);
    state.surfaceResizeObserver.observe(surface);
  }
}

// The toolbar, made and added to the page when missing; null while
// another copy of this script holds the page.
function ensureSurface(bindInteractions: (ui: SelectionSurface) => void): SelectionSurface | null {
  if (state.selectionSurface && state.selectionSurface.host.isConnected) {
    updateRuntimeDebugState();
    return state.selectionSurface;
  }
  if (!reconcileSurfaceOwnership()) {
    return null;
  }
  const ui = createSurface();
  state.selectionSurface = ui;
  ui.shadow.appendChild(ui.surface);
  (document.documentElement || document.body).appendChild(ui.host);
  observeSurfaceSize(ui.surface);
  bindInteractions(ui);
  return ui;
}

// Inline puts the entry button at the end of the selection; panel opens
// the toolbar where the entry button was.
function positionSurface(rect: SelectionRect, placement: 'inline' | 'panel', anchorRect?: DOMRect | null): void {
  if (!state.selectionSurface) {
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
      state.selectionSurface.host,
      initialViewport.left + VIEWPORT_SAFE_MARGIN_PX,
      initialViewport.top + VIEWPORT_SAFE_MARGIN_PX
    );
  }
  window.requestAnimationFrame(() => {
    if (!state.selectionSurface || state.selectionSurface.host.hidden) {
      return;
    }
    const { host, surface } = state.selectionSurface;
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

export {
  createMainButton,
  createSurface,
  createSurfaceHost,
  createSurfaceStyle,
  createToolbar,
  ensureSurface,
  observeSurfaceSize,
  positionSurface
};
