// Finding an AI provider's composer and its send button in the page.
import type { PromptStrategy } from '../../domain/ai-prompt-strategy';

// What the script uses of an editor or a button.
interface ComposerElement extends Element {
  focus(): void;
  click(): void;
  innerText?: string;
}

interface ComposerButtonCandidate {
  button: ComposerElement;
  score: number;
}

function isComposerElement(element: Element): element is ComposerElement {
  return 'focus' in element && typeof element.focus === 'function' &&
    'click' in element && typeof element.click === 'function';
}

function isVisible(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isActionableButton(element: ComposerElement): boolean {
  if (!isVisible(element) || ('disabled' in element && element.disabled)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  const ariaDisabled = String(element.getAttribute('aria-disabled') || '').toLowerCase();
  const className = String(element.className || '').toLowerCase();
  return (
    ariaDisabled !== 'true' &&
    !className.includes('disabled') &&
    style.pointerEvents !== 'none' &&
    style.visibility !== 'hidden' &&
    style.display !== 'none' &&
    Number(style.opacity || '1') > 0.2
  );
}

// A page may answer a selector it cannot parse with an error.
function queryWithin(container: Document | Element, selector: string): ComposerElement[] {
  try {
    return Array.from(container.querySelectorAll(selector)).filter(isComposerElement);
  } catch (_error) {
    return [];
  }
}

function findEditor(strategy: PromptStrategy): ComposerElement | null {
  for (const selector of strategy.editorSelectors) {
    const editor = queryWithin(document, selector).find(isVisible);
    if (editor) {
      return editor;
    }
  }
  return null;
}

// A small button next to the composer's bottom right corner.
function scoreComposerButton(button: ComposerElement, editorRect: DOMRect, depth: number): number | null {
  if (!isActionableButton(button)) {
    return null;
  }
  const rect = button.getBoundingClientRect();
  const isLikelyComposerButton = (
    rect.width <= 80 &&
    rect.height <= 80 &&
    rect.bottom >= editorRect.top - 24 &&
    rect.top <= editorRect.bottom + 72 &&
    rect.right >= editorRect.left
  );
  if (!isLikelyComposerButton) {
    return null;
  }
  const horizontal = Math.abs(rect.right - editorRect.right);
  const vertical = Math.abs(rect.bottom - editorRect.bottom);
  const sidePenalty = rect.left < editorRect.left ? 160 : 0;
  return horizontal + vertical + sidePenalty + depth * 8;
}

function findNearbySendButton(editor: ComposerElement | null, shouldUseNearby: boolean): ComposerElement | null {
  if (!shouldUseNearby || !editor) {
    return null;
  }
  const editorRect = editor.getBoundingClientRect();
  const candidates: ComposerButtonCandidate[] = [];
  let root = editor.parentElement;
  for (let depth = 0; root && depth < 8; depth += 1, root = root.parentElement) {
    queryWithin(root, 'button,[role="button"]').forEach((button) => {
      const score = scoreComposerButton(button, editorRect, depth);
      if (score !== null) {
        candidates.push({ button, score });
      }
    });
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.length > 0 ? candidates[0].button : null;
}

function findSendButton(strategy: PromptStrategy, editor: ComposerElement | null, useNearby: boolean): ComposerElement | null {
  for (const selector of strategy.sendButtonSelectors) {
    const button = queryWithin(document, selector).find(isVisible);
    if (button) {
      return button;
    }
  }
  return findNearbySendButton(editor, useNearby);
}

// Clicks the send button once it can be pressed; false when it never could.
function clickSendButton(strategy: PromptStrategy, editor: ComposerElement | null, useNearby: boolean): boolean {
  const sendButton = findSendButton(strategy, editor, useNearby);
  if (sendButton && isActionableButton(sendButton)) {
    sendButton.click();
    return true;
  }
  return false;
}

export { clickSendButton, findEditor };
export type { ComposerElement };
