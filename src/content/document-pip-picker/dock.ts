// The clip window's frame: its layout, scaffold and bottom dock.
import { createPipDockView } from '../../shared/react/pip-dock-view';
import { hasPaintedSurface } from './candidates';
import { PIP_CARD_GUTTER, PIP_DOCK_CLEARANCE, PIP_MAX_HEIGHT, PIP_MAX_WIDTH, PIP_MIN_HEIGHT, PIP_MIN_WIDTH } from './constants';
import { getMessage, getRuntimeUrl } from './locale';
import { ensurePiPDocumentBase, ensurePiPStyleAnchor } from './style-sync';
import type { ClipLayout, PiPDock, VisualTheme } from './types';


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
  // Closes the clip window.
  onClose: () => void;
  // Starts picking again once the window has closed.
  onReselect: () => void;
}): PiPDock | null {
  const { pipDocument, shell, visualTheme, onClose, onReselect } = pipContext;
  const host = pipDocument.createElement('div');
  shell.appendChild(host);
  const view = createPipDockView(host, {
    onClose,
    onReselect() {
      onClose();
      window.requestAnimationFrame(onReselect);
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

export {
  createPiPDock,
  createPiPScaffold,
  ensurePiPDockAssets,
  getClipLayout,
  hasFloatingSurface
};
