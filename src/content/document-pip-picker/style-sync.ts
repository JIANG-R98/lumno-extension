// Keeps the clip window's style sheets and root attributes in step with
// the page.
import { PIP_STYLE_ANCHOR_ID } from './constants';
import type { ClipSession, StyleSheetEntry } from './types';

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

export {
  copyRootAttributes,
  createPiPStyleNode,
  ensurePiPDocumentBase,
  ensurePiPStyleAnchor,
  getPageStyleSheets,
  getStyleSheetEntries,
  getStyleSheetRuleCount,
  getStyleSheetSignature,
  syncPiPRootAttributes,
  syncPiPStyleSheets
};
