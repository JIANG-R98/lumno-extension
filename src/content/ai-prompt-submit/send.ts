// Sending the prompt: through a composer the page filled from its URL, or
// by writing it in and pressing the send button or Enter.
import type { SubmitResult } from '../../domain/ai-prompt-strategy';
import { clickSendButton, findEditor } from './composer-query';
import type { ComposerElement } from './composer-query';
import { collapseDuplicatePrompt, getEditorText, hasUrlPrefill, pressEnter, setPrompt, sleep } from './composer-text';
import type { Submission } from './composer-text';

async function waitForUrlPrefill(submission: Submission): Promise<ComposerElement | null> {
  const { strategy, prompt } = submission;
  for (let attempt = 0; attempt < strategy.urlPrefillWaitAttempts; attempt += 1) {
    const editor = findEditor(strategy);
    if (editor && hasUrlPrefill(editor, prompt)) {
      // Let the page finish applying the prefill before sending.
      await sleep(200);
      const settledEditor = findEditor(strategy);
      if (settledEditor && hasUrlPrefill(settledEditor, prompt)) {
        return settledEditor;
      }
    }
    await sleep(250);
  }
  return null;
}

// Some composers ignore a send click until the page settles. While the
// prompt still sits in the editor, the send has not happened: click again.
async function resendWhileUnsent(editor: ComposerElement, submission: Submission): Promise<void> {
  const { strategy, prompt } = submission;
  for (let attempt = 0; attempt < strategy.resendUntilClearedAttempts; attempt += 1) {
    await sleep(500);
    const currentEditor = findEditor(strategy) || editor;
    if (getEditorText(currentEditor) !== prompt) {
      return;
    }
    clickSendButton(strategy, currentEditor, true);
  }
}

async function sendPrefilled(editor: ComposerElement, submission: Submission): Promise<SubmitResult> {
  const { strategy } = submission;
  for (let sendAttempt = 0; sendAttempt < Math.max(1, strategy.buttonWaitAttempts); sendAttempt += 1) {
    if (clickSendButton(strategy, editor, strategy.useNearbySendButton)) {
      return { ok: true, method: 'prefill-button' };
    }
    await sleep(sendAttempt < 4 ? 150 : 250);
  }
  pressEnter(editor);
  return { ok: true, method: 'prefill-enter' };
}

// Waits for the send button and clicks it; false when it never came.
async function sendWithButton(editor: ComposerElement, submission: Submission): Promise<boolean> {
  const { strategy } = submission;
  for (let sendAttempt = 0; sendAttempt < strategy.buttonWaitAttempts; sendAttempt += 1) {
    if (clickSendButton(strategy, editor, strategy.useNearbySendButton)) {
      await resendWhileUnsent(editor, submission);
      return true;
    }
    await sleep(sendAttempt < 4 ? 150 : 250);
  }
  return false;
}

// Presses Enter; when the prompt is still there afterwards, looks for the
// send button instead.
async function sendWithEnter(editor: ComposerElement, submission: Submission): Promise<SubmitResult> {
  const { strategy, prompt } = submission;
  if (strategy.enterDelayMs > 0) {
    await sleep(strategy.enterDelayMs);
  }
  if (collapseDuplicatePrompt(editor, prompt)) {
    await sleep(80);
  }
  pressEnter(editor);
  if (strategy.postEnterDelayMs > 0) {
    await sleep(strategy.postEnterDelayMs);
  }
  if (getEditorText(editor) !== prompt) {
    return { ok: true, method: 'enter' };
  }
  const useNearby = strategy.useNearbySendButton || strategy.postEnterUseNearbySendButton;
  for (let attempt = 0; attempt < Math.max(1, strategy.postEnterButtonAttempts); attempt += 1) {
    if (clickSendButton(strategy, editor, useNearby)) {
      await resendWhileUnsent(editor, submission);
      return { ok: true, method: 'enter-button' };
    }
    if (attempt + 1 < strategy.postEnterButtonAttempts) {
      await sleep(180);
    }
  }
  return { ok: true, method: 'enter' };
}

async function submitPrompt(submission: Submission): Promise<SubmitResult> {
  const { strategy } = submission;
  const prefilledEditor = strategy.urlPrefillWaitAttempts > 0 ? await waitForUrlPrefill(submission) : null;
  if (prefilledEditor) {
    return sendPrefilled(prefilledEditor, submission);
  }
  for (let attempt = 0; attempt < strategy.editorWaitAttempts; attempt += 1) {
    const editor = findEditor(strategy);
    if (!editor) {
      await sleep(400);
      continue;
    }
    if (!await setPrompt(editor, submission)) {
      await sleep(250);
      continue;
    }
    if (strategy.submitMode !== 'enter' && await sendWithButton(editor, submission)) {
      return { ok: true, method: 'button' };
    }
    return sendWithEnter(editor, submission);
  }
  return { ok: false, reason: 'editor-not-found' };
}

export { submitPrompt };
