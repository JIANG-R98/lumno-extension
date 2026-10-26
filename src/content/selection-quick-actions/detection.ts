// Reading the selection: in the page or a text field, where it sits, and
// what lies behind it.
import * as INTENT from '../../domain/selection-intent';
import { isElementNode, isTextControlType } from './types';
import type { ColorRgba, DomSelectionSnapshot, EntryContrastTone, SelectionCandidate, SelectionRect, SelectionSnapshot, TextControl, TextControlSelectionSnapshot } from './types';

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

export {
  compositeBackground,
  getDomSelectionSnapshot,
  getRangeElement,
  getRangeRect,
  getRelativeLuminance,
  getTargetElement,
  getTextControlSelectionSnapshot,
  getUnifiedSelectionSnapshot,
  getUsableClientRects,
  isInsideCode,
  isSameSelection,
  isSelectionStillCurrent,
  isSensitiveElement,
  isTextControl,
  parseCssColor,
  resolveEntryContrastTone
};
