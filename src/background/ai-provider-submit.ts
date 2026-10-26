// Sends a prompt to an AI provider's chat page: fills its composer in the
// tab and presses its send button or Enter, each provider by its own
// strategy (which elements to look for, how long to wait, how to send).
import { getStrategyConfig, isAllowedStrategyOrigin, isUrlOnlyStrategy } from '../domain/ai-prompt-strategy';
import type { SubmitResult } from '../domain/ai-prompt-strategy';
import { createInjectedAppRun } from '../platform/injection';

type TabLookup = { ok: true; tab: chrome.tabs.Tab } | { ok: false; reason: string };

function getHttpOrigin(urlValue: unknown): string {
  try {
    const url = new URL(String(urlValue || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return '';
    }
    return url.origin;
  } catch (_error) {
    return '';
  }
}

function getCurrentTab(chromeApi: typeof chrome, tabId: number): Promise<TabLookup> {
  return new Promise((resolve) => {
    if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.get !== 'function') {
      resolve({ ok: false, reason: 'tab-query-unavailable' });
      return;
    }
    chromeApi.tabs.get(tabId, (tab) => {
      const runtimeError = chromeApi.runtime && chromeApi.runtime.lastError;
      if (runtimeError) {
        resolve({ ok: false, reason: runtimeError.message || 'tab-unavailable' });
        return;
      }
      resolve(tab && typeof tab === 'object'
        ? { ok: true, tab }
        : { ok: false, reason: 'tab-unavailable' });
    });
  });
}

async function submitPromptInTab(
  chromeApi: typeof chrome,
  tabId: number,
  prompt: unknown,
  strategyName: unknown,
  expectedUrl: unknown
): Promise<SubmitResult> {
  const promptText = String(prompt || '').trim();
  const config = getStrategyConfig(strategyName);
  if (!promptText) {
    return { ok: false, reason: 'empty-prompt' };
  }
  if (!config) {
    return { ok: false, reason: 'unknown-submit-strategy' };
  }
  const expectedOrigin = getHttpOrigin(expectedUrl);
  if (!expectedOrigin) {
    return { ok: false, reason: 'invalid-expected-origin' };
  }
  if (!isAllowedStrategyOrigin(strategyName, expectedOrigin)) {
    return { ok: false, reason: 'unapproved-submit-origin' };
  }
  if (isUrlOnlyStrategy(config)) {
    return { ok: true, method: 'url' };
  }
  const currentTab = await getCurrentTab(chromeApi, tabId);
  if (currentTab.ok === false) {
    return { ok: false, reason: currentTab.reason };
  }
  if (getHttpOrigin(currentTab.tab.url) !== expectedOrigin) {
    return { ok: false, reason: 'unexpected-tab-origin' };
  }
  return new Promise((resolve) => {
    chromeApi.scripting.executeScript(createInjectedAppRun(chromeApi.runtime, { tabId }, ['ai-prompt-submit'], {
      type: 'submit',
      allowedOrigin: expectedOrigin,
      prompt: promptText,
      strategy: config
    }), (results) => {
      const lastError = chromeApi.runtime && chromeApi.runtime.lastError;
      if (lastError) {
        resolve({ ok: false, reason: lastError.message || 'execute-script-failed' });
        return;
      }
      const result = Array.isArray(results) && results[0] ? results[0].result : null;
      resolve(isSubmitResult(result) ? result : { ok: false, reason: 'empty-script-result' });
    });
  });
}

function isSubmitResult(value: unknown): value is SubmitResult {
  return Boolean(value) && typeof value === 'object' && typeof Reflect.get(Object(value), 'ok') === 'boolean';
}

export { getHttpOrigin, submitPromptInTab };
