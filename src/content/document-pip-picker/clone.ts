// The copy of the picked element in the clip window, kept current with the
// page.
import { CONTEXT_LAYOUT_RESET, PIP_SYNC_DELAY_MS } from './constants';
import { hasInlineStyle, isHtmlTag } from './dom';
import { syncPiPRootAttributes, syncPiPStyleSheets } from './style-sync';
import type { ClipSession } from './types';

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
// pixels) from one element onto its copy.
function copyPropertyState(sourceNode: Element, cloneNode: Element): void {
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
    copyCanvasPixels(sourceNode, cloneNode);
  }
}

function copyCanvasPixels(sourceNode: HTMLCanvasElement, cloneNode: HTMLCanvasElement): void {
  try {
    const context = cloneNode.getContext('2d');
    if (context) {
      context.drawImage(sourceNode, 0, 0);
    }
  } catch (_error) {
    // Ignore canvas copies that are blocked by browser security.
  }
}

// Writes the element's resolved URL onto its copy, so relative links and
// lazy images still work in the clip window.
function copyResolvedUrl(sourceNode: Element, cloneNode: Element): void {
  if (isHtmlTag(sourceNode, 'img')) {
    copyUrlAttribute(sourceNode, cloneNode, 'src', sourceNode.currentSrc || sourceNode.src);
  } else if (isHtmlTag(sourceNode, 'source') || isHtmlTag(sourceNode, 'track') || isHtmlTag(sourceNode, 'script')) {
    copyUrlAttribute(sourceNode, cloneNode, 'src', sourceNode.src);
  } else if (isHtmlTag(sourceNode, 'a') || isHtmlTag(sourceNode, 'area')) {
    copyUrlAttribute(sourceNode, cloneNode, 'href', sourceNode.href);
  }
}

// Copies property state and resolved URLs onto the copy, element by element.
function syncCloneRuntimeState(sourceRoot: Element, cloneRoot: Element): void {
  const sourceNodes = getElementTree(sourceRoot);
  const cloneNodes = getElementTree(cloneRoot);
  const count = Math.min(sourceNodes.length, cloneNodes.length);
  for (let index = 0; index < count; index += 1) {
    copyPropertyState(sourceNodes[index], cloneNodes[index]);
    copyResolvedUrl(sourceNodes[index], cloneNodes[index]);
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

export {
  buildPiPContextChain,
  buildPiPElementClone,
  cloneContextNodeShallow,
  copyUrlAttribute,
  getElementTree,
  normalizeClipRoot,
  refreshPiPContent,
  schedulePiPContentRefresh,
  schedulePiPDocumentSync,
  syncCloneRuntimeState
};
