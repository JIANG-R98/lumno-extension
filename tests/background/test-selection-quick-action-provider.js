const assert = require('assert');
const providerResolver = require('../../src/background/selection-quick-action-provider.ts');

function isInteractive(provider) {
  return Boolean(provider && provider.action === 'openAndSubmit' && provider.submitStrategy);
}

const chatGpt = {
  key: 'gpt',
  action: 'openAndSubmit',
  submitStrategy: 'chatgptPrompt'
};
const gemini = {
  key: 'gm',
  action: 'openAndSubmit',
  submitStrategy: 'geminiPrompt'
};

assert.strictEqual(
  providerResolver.resolveSelectionQuickActionProvider(
    [gemini],
    [chatGpt, gemini],
    'gpt',
    isInteractive
  ),
  chatGpt,
  'the selection-specific provider should remain available when it is hidden from general search sources'
);

assert.strictEqual(
  providerResolver.resolveSelectionQuickActionProvider(
    [],
    [chatGpt, gemini],
    'gm',
    isInteractive
  ),
  gemini,
  'selection actions should fall back to bundled AI providers when all AI search sources are disabled'
);

assert.strictEqual(
  providerResolver.resolveSelectionQuickActionProvider(
    [],
    [chatGpt],
    'missing-provider',
    isInteractive
  ),
  chatGpt,
  'an unavailable preference should fall back to bundled ChatGPT'
);

console.log('selection quick action provider tests passed');
