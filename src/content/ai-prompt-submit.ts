// Sends a prompt to an AI provider's chat page: fills its composer and
// presses its send button or Enter, by the strategy the worker chose
// (domain/ai-prompt-strategy.ts). The worker loads this module in the
// provider's tab (src/platform/injection.ts) and calls run() for each prompt.
import { readAiPromptSubmitCommand } from '../domain/ai-prompt-strategy';
import type { SubmitResult } from '../domain/ai-prompt-strategy';
import { submitPrompt } from './ai-prompt-submit/send';

function run(command: unknown): Promise<SubmitResult> {
  const request = readAiPromptSubmitCommand(command);
  if (!request) {
    return Promise.resolve({ ok: false, reason: 'invalid-command' });
  }
  if (!window.location || window.location.origin !== request.allowedOrigin) {
    return Promise.resolve({ ok: false, reason: 'unexpected-document-origin' });
  }
  const prompt = String(request.prompt || '').trim();
  if (!prompt) {
    return Promise.resolve({ ok: false, reason: 'empty-prompt' });
  }
  return submitPrompt({ prompt, strategy: request.strategy });
}

export { run };
