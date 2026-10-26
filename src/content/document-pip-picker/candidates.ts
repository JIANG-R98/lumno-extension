// Which elements under the pointer can be clipped, and which one to offer
// first.
import { ROOT_ID, TOAST_HOST_ID } from './constants';
import { isElementTarget } from './dom';
import { parseCssColor } from './theme';

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

export {
  containsBlockedMediaContent,
  getCandidateScore,
  getDefaultStackIndex,
  getElementArea,
  getElementFromPoint,
  getElementStack,
  hasPaintedSurface,
  isAllowedElement,
  isLikelyInteractiveContainer,
  isLikelyLeafNode,
  isLikelyToolbarLike,
  isOwnNode,
  isVisibleElement
};
