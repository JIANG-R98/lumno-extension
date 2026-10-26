// Writing the prompt into a composer, reading it back, and pressing Enter.
import type { PromptStrategy } from '../../domain/ai-prompt-strategy';
import type { ComposerElement } from './composer-query';

// The prompt and how to send it.
interface Submission {
  prompt: string;
  strategy: PromptStrategy;
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function isTextControl(element: Element): element is HTMLTextAreaElement | HTMLInputElement {
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
}

function dispatchInput(element: Element, submission: Submission): void {
  if (typeof InputEvent === 'function') {
    const withoutData = submission.strategy.inputEventDataMode === 'none';
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      data: withoutData ? null : submission.prompt,
      inputType: withoutData ? 'insertReplacementText' : 'insertText'
    }));
  } else {
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function setNativeValue(editor: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype = editor instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor && typeof descriptor.set === 'function') {
    descriptor.set.call(editor, value);
    return;
  }
  editor.value = value;
}

function setContentEditablePrompt(editor: Element, prompt: string): void {
  const paragraph = editor.ownerDocument.createElement('p');
  paragraph.textContent = prompt;
  editor.replaceChildren(paragraph);
}

// Rich editors such as Lexical pad their text with zero-width marks.
function readContentText(editor: ComposerElement): string {
  return String(editor.innerText || editor.textContent || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
}

// Types the prompt the way a person would, which rich editors track.
async function typeIntoContentEditable(editor: ComposerElement, prompt: string): Promise<void> {
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  if (typeof document.execCommand === 'function') {
    document.execCommand('insertText', false, prompt);
  }
  // Lexical (Copilot) applies the insert on its next update rather than
  // synchronously; overwriting it through innerHTML would desync it.
  for (let settle = 0; settle < 6 && readContentText(editor) !== prompt; settle += 1) {
    await sleep(50);
  }
  if (readContentText(editor) !== prompt) {
    setContentEditablePrompt(editor, prompt);
  }
}

// Writes the prompt into the editor; true once the editor shows it.
async function setPrompt(editor: ComposerElement, submission: Submission): Promise<boolean> {
  const { prompt } = submission;
  editor.focus();
  if (isTextControl(editor)) {
    setNativeValue(editor, prompt);
    dispatchInput(editor, submission);
    return String(editor.value || '').trim() === prompt;
  }
  if (submission.strategy.contentEditableFillMode === 'replace') {
    setContentEditablePrompt(editor, prompt);
  } else {
    await typeIntoContentEditable(editor, prompt);
  }
  dispatchInput(editor, submission);
  return readContentText(editor) === prompt;
}

function getEditorText(editor: ComposerElement | null): string {
  if (!editor) {
    return '';
  }
  return isTextControl(editor) ? String(editor.value || '').trim() : readContentText(editor);
}

function normalizeWhitespace(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// The page filled the composer from its own URL.
function hasUrlPrefill(editor: ComposerElement, prompt: string): boolean {
  const normalizedPrompt = normalizeWhitespace(prompt);
  return Boolean(normalizedPrompt) && normalizeWhitespace(getEditorText(editor)).includes(normalizedPrompt);
}

// Some editors insert the prompt twice; keep one copy.
function collapseDuplicatePrompt(editor: ComposerElement, prompt: string): boolean {
  const currentText = getEditorText(editor);
  if (!currentText || currentText === prompt) {
    return false;
  }
  const remainder = currentText.split(prompt).join('').trim();
  if (remainder || currentText.split(prompt).length - 1 < 2) {
    return false;
  }
  if (isTextControl(editor)) {
    setNativeValue(editor, prompt);
  } else {
    setContentEditablePrompt(editor, prompt);
  }
  editor.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function pressEnter(editor: Element): void {
  ['keydown', 'keypress', 'keyup'].forEach((type) => {
    const event = new KeyboardEvent(type, {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
      composed: true
    });
    const legacyFields: Array<[string, number]> = [
      ['keyCode', 13],
      ['which', 13],
      ['charCode', type === 'keypress' ? 13 : 0]
    ];
    legacyFields.forEach(([name, value]) => {
      try {
        Object.defineProperty(event, name, { get: () => value });
      } catch (_error) {
        // Some engines expose these fields as non-configurable.
      }
    });
    editor.dispatchEvent(event);
  });
}

export { collapseDuplicatePrompt, getEditorText, hasUrlPrefill, pressEnter, setPrompt, sleep };
export type { Submission };
