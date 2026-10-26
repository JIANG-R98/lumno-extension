// A feature hint in the 'auto' align mode marks itself multiline when its
// text wraps or its row breaks, so its content aligns to the top instead of
// the middle. It measures again whenever one of its parts resizes.
import type { FeatureHintViewController } from '../../types/view-apis';
import type { FeatureHintAlignMode, FeatureHintWindow } from './feature-hint-catalog';

interface FeatureHintAlignment {
  alignMode: FeatureHintAlignMode;
  windowObj: FeatureHintWindow | null;
  view: FeatureHintViewController;
  hasLink: boolean;
  actionButtons: HTMLButtonElement[];
  frame: number;
  observer: ResizeObserver | null;
}

type ComputeStyle = (target: Element) => CSSStyleDeclaration;

function getCssNumber(style: CSSStyleDeclaration, property: string): number {
  const value = Number.parseFloat(style.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

function readContentBox(rect: DOMRect, style: CSSStyleDeclaration): { width: number; height: number } {
  return {
    height: rect.height -
      getCssNumber(style, 'padding-top') -
      getCssNumber(style, 'padding-bottom') -
      getCssNumber(style, 'border-top-width') -
      getCssNumber(style, 'border-bottom-width'),
    width: rect.width -
      getCssNumber(style, 'padding-left') -
      getCssNumber(style, 'padding-right') -
      getCssNumber(style, 'border-left-width') -
      getCssNumber(style, 'border-right-width')
  };
}

// The engagement notice reads as one sentence; it is multiline once the
// sentence, with room for its actions' hover margins, no longer fits.
function isSentenceWrapped(
  alignment: FeatureHintAlignment,
  sentence: Element,
  computeStyle: ComputeStyle,
  contentWidth: number
): boolean {
  const element = alignment.view.element;
  const elementStyle = computeStyle(element);
  const sentenceWidth = Array.from(sentence.children).reduce((width, item) => {
    const itemStyle = computeStyle(item);
    const currentInlineMargin = getCssNumber(itemStyle, 'margin-left') + getCssNumber(itemStyle, 'margin-right');
    const reservedHoverMargin = getCssNumber(itemStyle, '--x-lumno-engagement-action-hover-margin') * 2;
    return width + item.getBoundingClientRect().width + Math.max(currentInlineMargin, reservedHoverMargin);
  }, 0);
  const inlineGap = getCssNumber(elementStyle, 'column-gap') || getCssNumber(elementStyle, 'gap');
  const requiredInlineWidth = alignment.view.badge.getBoundingClientRect().width + inlineGap + sentenceWidth;
  return requiredInlineWidth > contentWidth + 1;
}

function isRowWrapped(alignment: FeatureHintAlignment, computeStyle: ComputeStyle, contentHeight: number): boolean {
  const { view, hasLink, actionButtons } = alignment;
  const textStyle = computeStyle(view.text);
  const textRect = view.text.getBoundingClientRect();
  const linkHeight = hasLink && view.linkButton ? view.linkButton.getBoundingClientRect().height : 0;
  const actionHeight = actionButtons.reduce((height, actionButton) => (
    Math.max(height, actionButton.getBoundingClientRect().height || 0)
  ), 0);
  const lineHeight = getCssNumber(textStyle, 'line-height') ||
    ((getCssNumber(textStyle, 'font-size') || 12) * 1.45);
  const maxChildHeight = Math.max(textRect.height, view.badge.getBoundingClientRect().height, linkHeight, actionHeight);
  const textWrapped = textRect.height > lineHeight * 1.35;
  return textWrapped || contentHeight > maxChildHeight + 6;
}

function updateContentAlignment(alignment: FeatureHintAlignment): void {
  alignment.frame = 0;
  const windowObj = alignment.windowObj;
  if (alignment.alignMode !== 'auto' || !windowObj || typeof windowObj.getComputedStyle !== 'function') {
    return;
  }
  const readStyle = windowObj.getComputedStyle;
  const computeStyle: ComputeStyle = (target) => Reflect.apply(readStyle, windowObj, [target]);
  const element = alignment.view.element;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }
  const content = readContentBox(rect, computeStyle(element));
  const sentence = element.classList.contains('x-lumno-feature-hint--engagement-notice')
    ? element.querySelector('.x-lumno-feature-hint__sentence')
    : null;
  const multiline = sentence
    ? isSentenceWrapped(alignment, sentence, computeStyle, content.width)
    : isRowWrapped(alignment, computeStyle, content.height);
  element.setAttribute('data-multiline', multiline ? 'true' : 'false');
}

function scheduleContentAlignmentUpdate(alignment: FeatureHintAlignment): void {
  if (alignment.alignMode !== 'auto') {
    return;
  }
  const windowObj = alignment.windowObj;
  if (!windowObj || typeof windowObj.requestAnimationFrame !== 'function') {
    updateContentAlignment(alignment);
    return;
  }
  if (alignment.frame) {
    return;
  }
  alignment.frame = Reflect.apply(windowObj.requestAnimationFrame, windowObj, [() => updateContentAlignment(alignment)]);
}

function createFeatureHintAlignment(
  alignMode: FeatureHintAlignMode,
  windowObj: FeatureHintWindow | null,
  view: FeatureHintViewController,
  hasLink: boolean
): FeatureHintAlignment {
  const actionButtons = Array.isArray(view.actionButtons) ? view.actionButtons : [];
  const alignment: FeatureHintAlignment = { alignMode, windowObj, view, hasLink, actionButtons, frame: 0, observer: null };
  if (alignMode === 'auto' && windowObj && typeof windowObj.ResizeObserver === 'function') {
    const observer = new windowObj.ResizeObserver(() => scheduleContentAlignmentUpdate(alignment));
    observer.observe(view.element);
    observer.observe(view.text);
    if (hasLink && view.linkButton) {
      observer.observe(view.linkButton);
    }
    actionButtons.forEach((actionButton) => {
      observer.observe(actionButton);
    });
    alignment.observer = observer;
  }
  return alignment;
}

function disconnectAlignmentObserver(alignment: FeatureHintAlignment): void {
  if (!alignment.observer) {
    return;
  }
  alignment.observer.disconnect();
  alignment.observer = null;
}

function destroyAlignment(alignment: FeatureHintAlignment): void {
  disconnectAlignmentObserver(alignment);
  const windowObj = alignment.windowObj;
  if (alignment.frame && windowObj && typeof windowObj.cancelAnimationFrame === 'function') {
    Reflect.apply(windowObj.cancelAnimationFrame, windowObj, [alignment.frame]);
    alignment.frame = 0;
  }
}

export type { FeatureHintAlignment };
export {
  createFeatureHintAlignment,
  destroyAlignment,
  disconnectAlignmentObserver,
  scheduleContentAlignmentUpdate
};
