// The strategies for sending a prompt to an AI provider's chat page: which
// elements to look for, how long to wait and how to send, per provider. The
// worker picks one and the injected script (content/ai-prompt-submit.ts)
// follows it in the page.

// 'enter' sends with Enter first; '' clicks the send button first.
type SubmitMode = 'enter' | '';
// 'replace' writes a contenteditable composer's markup directly; '' types
// into it, which rich editors track.
type ContentEditableFillMode = 'replace' | '';
// 'none' leaves the typed text out of the input event, for editors that
// would insert it a second time.
type InputEventDataMode = 'none' | '';

interface PromptStrategyOptions {
  editorSelectors?: readonly string[];
  sendButtonSelectors?: readonly string[];
  buttonWaitAttempts?: number;
  editorWaitAttempts?: number;
  urlPrefillWaitAttempts?: number;
  enterDelayMs?: number;
  postEnterDelayMs?: number;
  postEnterButtonAttempts?: number;
  resendUntilClearedAttempts?: number;
  submitMode?: SubmitMode;
  contentEditableFillMode?: ContentEditableFillMode;
  inputEventDataMode?: InputEventDataMode;
  useNearbySendButton?: boolean;
  postEnterUseNearbySendButton?: boolean;
}

type EnterPromptStrategyOptions = Pick<PromptStrategyOptions,
  | 'sendButtonSelectors'
  | 'editorWaitAttempts'
  | 'postEnterButtonAttempts'
  | 'resendUntilClearedAttempts'
  | 'contentEditableFillMode'
  | 'inputEventDataMode'>;

// How the page script fills a provider's composer and sends the prompt.
interface PromptStrategy {
  editorSelectors: string[];
  sendButtonSelectors: string[];
  buttonWaitAttempts: number;
  editorWaitAttempts: number;
  // How long to wait for the page to fill the composer from its own URL.
  urlPrefillWaitAttempts: number;
  enterDelayMs: number;
  postEnterDelayMs: number;
  postEnterButtonAttempts: number;
  resendUntilClearedAttempts: number;
  submitMode: SubmitMode;
  contentEditableFillMode: ContentEditableFillMode;
  inputEventDataMode: InputEventDataMode;
  // Fall back to a button next to the composer when no selector matches.
  useNearbySendButton: boolean;
  postEnterUseNearbySendButton: boolean;
}

// A provider that takes the prompt from its URL alone.
interface UrlOnlyStrategy {
  urlOnly: true;
}

type SubmitStrategy = PromptStrategy | UrlOnlyStrategy;

// How the prompt went in: 'url', 'button', 'enter', 'enter-button',
// 'prefill-button' or 'prefill-enter'.
interface SubmitResult {
  ok: boolean;
  method?: string;
  reason?: string;
}

// What the injected script is asked to do: send the prompt with the
// strategy, if the page is still on the allowed origin.
interface AiPromptSubmitCommand {
  type: 'submit';
  allowedOrigin: string;
  prompt: string;
  strategy: PromptStrategy;
}

const GENERIC_PROMPT_EDITOR_SELECTORS: readonly string[] = Object.freeze([
  'textarea[placeholder*="发消息"]',
  'textarea[aria-label*="发消息"]',
  'textarea[placeholder*="输入"]',
  'textarea[aria-label*="输入"]',
  'textarea[placeholder*="消息"]',
  'textarea[aria-label*="消息"]',
  'textarea[placeholder*="Message"]',
  'textarea[aria-label*="Message"]',
  'textarea[placeholder*="message" i]',
  'textarea[aria-label*="message" i]',
  '[contenteditable="true"][data-placeholder*="发消息"]',
  '[contenteditable="true"][aria-label*="发消息"]',
  '[contenteditable="true"][data-placeholder*="输入"]',
  '[contenteditable="true"][aria-label*="输入"]',
  '[contenteditable="true"][data-placeholder*="消息"]',
  '[contenteditable="true"][aria-label*="消息"]',
  '[contenteditable="true"][data-placeholder*="Message"]',
  '[contenteditable="true"][aria-label*="Message"]',
  '[contenteditable="true"][role="textbox"]',
  '[role="textbox"][contenteditable="true"]',
  'div[contenteditable="true"]',
  'textarea'
]);

const GENERIC_SEND_BUTTON_SELECTORS: readonly string[] = Object.freeze([
  'button[aria-label*="发送消息"]',
  'button[aria-label*="发送"]',
  'button[aria-label*="提交"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send" i]',
  'button[aria-label*="submit" i]'
]);

function uniqueSelectors(groups: ReadonlyArray<readonly string[] | undefined>): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  groups.forEach((group) => {
    (Array.isArray(group) ? group : []).forEach((selector) => {
      if (!selector || seen.has(selector)) {
        return;
      }
      seen.add(selector);
      items.push(selector);
    });
  });
  return items;
}

function strategySelectors(
  settings: PromptStrategyOptions,
  withGeneric: boolean
): Pick<PromptStrategy, 'editorSelectors' | 'sendButtonSelectors'> {
  return {
    editorSelectors: uniqueSelectors([settings.editorSelectors, withGeneric ? GENERIC_PROMPT_EDITOR_SELECTORS : undefined]),
    sendButtonSelectors: uniqueSelectors([settings.sendButtonSelectors, withGeneric ? GENERIC_SEND_BUTTON_SELECTORS : undefined])
  };
}

// The generic selectors follow the provider's own unless left out, which the
// injected script does with a strategy that already has them.
function createPromptStrategy(options?: PromptStrategyOptions | null, extras = { withGenericSelectors: true }): PromptStrategy {
  const settings = options && typeof options === 'object' ? options : {};
  return {
    ...strategySelectors(settings, extras.withGenericSelectors),
    buttonWaitAttempts: Math.max(0, Number(settings.buttonWaitAttempts) || 0),
    editorWaitAttempts: Math.max(1, Number(settings.editorWaitAttempts) || 12),
    urlPrefillWaitAttempts: Math.max(0, Number(settings.urlPrefillWaitAttempts) || 0),
    enterDelayMs: Math.max(0, Number(settings.enterDelayMs) || 0),
    postEnterDelayMs: Math.max(0, Number(settings.postEnterDelayMs) || 0),
    postEnterButtonAttempts: Math.max(0, Number(settings.postEnterButtonAttempts) || 0),
    resendUntilClearedAttempts: Math.max(0, Number(settings.resendUntilClearedAttempts) || 0),
    submitMode: settings.submitMode === 'enter' ? 'enter' : '',
    contentEditableFillMode: settings.contentEditableFillMode === 'replace' ? 'replace' : '',
    inputEventDataMode: settings.inputEventDataMode === 'none' ? 'none' : '',
    useNearbySendButton: Boolean(settings.useNearbySendButton),
    postEnterUseNearbySendButton: Boolean(settings.postEnterUseNearbySendButton)
  };
}

function createEnterPromptStrategy(
  editorSelectors: readonly string[],
  options?: EnterPromptStrategyOptions | null
): PromptStrategy {
  const settings = options && typeof options === 'object' ? options : {};
  return createPromptStrategy({
    editorSelectors,
    sendButtonSelectors: settings.sendButtonSelectors,
    buttonWaitAttempts: 0,
    editorWaitAttempts: settings.editorWaitAttempts || 24,
    enterDelayMs: 180,
    postEnterDelayMs: 320,
    postEnterButtonAttempts: settings.postEnterButtonAttempts || 8,
    resendUntilClearedAttempts: settings.resendUntilClearedAttempts,
    submitMode: 'enter',
    contentEditableFillMode: settings.contentEditableFillMode,
    inputEventDataMode: settings.inputEventDataMode,
    useNearbySendButton: true
  });
}

const STRATEGIES: Readonly<Record<string, SubmitStrategy>> = Object.freeze({
  geminiPrompt: createPromptStrategy({
    editorSelectors: [
      '.ql-editor[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][role="textbox"][aria-label*="Gemini"]',
      '[contenteditable="true"][role="textbox"][aria-label*="gemini"]',
      '[contenteditable="true"][data-placeholder*="Gemini"]',
      '[contenteditable="true"][data-placeholder*="gemini"]',
      'rich-textarea .ql-editor[contenteditable="true"]',
      'textarea[aria-label*="Gemini"]',
      'textarea[aria-label*="gemini"]',
      'div[role="textbox"][contenteditable="true"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[aria-label="发送"]',
      'button[aria-label="Send"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="提交"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]'
    ],
    buttonWaitAttempts: 24,
    postEnterDelayMs: 320,
    postEnterButtonAttempts: 12,
    postEnterUseNearbySendButton: true
  }),
  chatgptPrompt: createPromptStrategy({
    editorSelectors: [
      'textarea[aria-label*="ChatGPT"]',
      'textarea[placeholder*="ChatGPT"]',
      '[contenteditable="true"][aria-label*="ChatGPT"]',
      '[contenteditable="true"][data-placeholder*="ChatGPT"]',
      'div[role="textbox"][contenteditable="true"]',
      '[contenteditable="true"][role="textbox"]',
      'textarea'
    ],
    sendButtonSelectors: [
      'button[aria-label="发送提示"]',
      'button[aria-label="Send prompt"]',
      'button[data-testid="send-button"]',
      'button[aria-label*="发送"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send" i]',
      'button[aria-label*="submit" i]'
    ],
    buttonWaitAttempts: 24,
    // ChatGPT fills the composer from ?q= itself (next to the ?hints=search
    // pill). Rewriting its editor races that prefill and can send the pill alone.
    urlPrefillWaitAttempts: 20
  }),
  doubaoPrompt: createEnterPromptStrategy([
    'textarea[placeholder*="发消息"]',
    'textarea[aria-label*="发消息"]',
    '[contenteditable="true"][data-placeholder*="发消息"]',
    '[contenteditable="true"][aria-label*="发消息"]'
  ]),
  yuanbaoPrompt: createPromptStrategy({
    editorSelectors: [
      'textarea[placeholder*="腾讯元宝"]',
      'textarea[aria-label*="腾讯元宝"]',
      '[contenteditable="true"][data-placeholder*="腾讯元宝"]',
      '[contenteditable="true"][aria-label*="腾讯元宝"]',
      'textarea[placeholder*="元宝"]',
      'textarea[aria-label*="元宝"]',
      '[contenteditable="true"][data-placeholder*="元宝"]',
      '[contenteditable="true"][aria-label*="元宝"]',
      'textarea[placeholder*="有问题"]',
      'textarea[aria-label*="有问题"]',
      '[contenteditable="true"][data-placeholder*="有问题"]',
      '[contenteditable="true"][aria-label*="有问题"]'
    ],
    sendButtonSelectors: [
      '#yuanbao-send-btn',
      'a[id*="send" i]',
      'a[class*="send" i]',
      '[role="button"][id*="send" i]',
      '[role="button"][class*="send" i]',
      'button[id*="send" i]',
      'button[class*="send" i]'
    ],
    buttonWaitAttempts: 12,
    editorWaitAttempts: 36,
    enterDelayMs: 180,
    contentEditableFillMode: 'replace',
    inputEventDataMode: 'none',
    useNearbySendButton: true,
    postEnterButtonAttempts: 12
  }),
  minimaxPrompt: createEnterPromptStrategy([
    'textarea[placeholder*="MiniMax"]',
    'textarea[aria-label*="MiniMax"]',
    '[contenteditable="true"][data-placeholder*="MiniMax"]',
    '[contenteditable="true"][aria-label*="MiniMax"]',
    'textarea[placeholder*="Minimax"]',
    'textarea[aria-label*="Minimax"]',
    '[contenteditable="true"][data-placeholder*="Minimax"]',
    '[contenteditable="true"][aria-label*="Minimax"]'
  ]),
  deepseekPrompt: createEnterPromptStrategy([
    'textarea[placeholder*="DeepSeek"]',
    'textarea[aria-label*="DeepSeek"]',
    '[contenteditable="true"][data-placeholder*="DeepSeek"]',
    '[contenteditable="true"][aria-label*="DeepSeek"]',
    'textarea[placeholder*="deepseek" i]',
    'textarea[aria-label*="deepseek" i]',
    '[contenteditable="true"][data-placeholder*="deepseek" i]',
    '[contenteditable="true"][aria-label*="deepseek" i]'
  ]),
  kimiPrompt: createEnterPromptStrategy([
    '.chat-input-editor[contenteditable="true"]',
    '[data-lexical-editor="true"][contenteditable="true"]',
    'textarea[placeholder*="Kimi"]',
    'textarea[aria-label*="Kimi"]',
    '[contenteditable="true"][data-placeholder*="Kimi"]',
    '[contenteditable="true"][aria-label*="Kimi"]',
    'textarea[placeholder*="kimi" i]',
    'textarea[aria-label*="kimi" i]',
    '[contenteditable="true"][data-placeholder*="kimi" i]',
    '[contenteditable="true"][aria-label*="kimi" i]'
  ], {
    editorWaitAttempts: 48,
    inputEventDataMode: 'none'
  }),
  // copilot.com/chat is Microsoft's merged work-and-life Copilot; its composer
  // is a Lexical editor.
  copilotPrompt: createPromptStrategy({
    editorSelectors: [
      '#m365-chat-editor-target-element[contenteditable="true"]',
      '[data-lexical-editor="true"][aria-label*="Copilot"]',
      'textarea#userInput',
      'textarea[placeholder*="Copilot"]',
      'textarea[aria-label*="Copilot"]',
      '[contenteditable="true"][aria-label*="Copilot"]',
      '[contenteditable="true"][data-placeholder*="Copilot"]'
    ],
    sendButtonSelectors: [
      'button.fai-SendButton',
      'button[type="submit"][aria-label="Send"]',
      'button[data-testid="submit-button"]',
      'button[aria-label="Submit message"]',
      'button[aria-label="提交消息"]',
      'button[title="Submit message"]'
    ],
    buttonWaitAttempts: 24,
    editorWaitAttempts: 36
  }),
  // grok.com/?q= only prefills behind a "Send this message?" confirmation, so
  // type into the composer instead.
  grokPrompt: createEnterPromptStrategy([
    '.query-bar-editor[contenteditable="true"]',
    '.tiptap.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][aria-label*="Grok"]',
    'textarea[aria-label*="Grok"]',
    'textarea[placeholder*="Grok"]'
  ], {
    editorWaitAttempts: 36
  }),
  qwenChatPrompt: createEnterPromptStrategy([
    'textarea.message-input-textarea',
    '.message-input-container-area textarea',
    'textarea[placeholder*="Qwen"]',
    'textarea[aria-label*="Qwen"]'
  ], {
    sendButtonSelectors: [
      'button.send-button',
      '.chat-prompt-send-button button'
    ],
    // Qwen Chat ignores send clicks for about a second after its composer
    // appears, which is exactly when a freshly opened tab gets here.
    resendUntilClearedAttempts: 12,
    editorWaitAttempts: 36
  }),
  aiStudioPrompt: createPromptStrategy({
    editorSelectors: [
      'ms-prompt-input-wrapper textarea',
      'ms-chunk-input textarea',
      'ms-autosize-textarea textarea',
      'textarea[aria-label*="prompt" i]',
      'textarea[placeholder*="prompt" i]',
      'textarea[aria-label*="提示"]',
      'textarea[placeholder*="提示"]'
    ],
    sendButtonSelectors: [
      'ms-run-button button',
      'button.run-button',
      'button[aria-label="Run"]',
      'button[aria-label*="Run" i]',
      'button[aria-label="运行"]',
      'button[aria-label*="运行"]'
    ],
    buttonWaitAttempts: 24,
    editorWaitAttempts: 48
  }),
  qianwenQuery: {
    urlOnly: true
  }
});

const STRATEGY_ALLOWED_ORIGINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  geminiPrompt: Object.freeze(['https://gemini.google.com']),
  chatgptPrompt: Object.freeze(['https://chatgpt.com']),
  doubaoPrompt: Object.freeze(['https://www.doubao.com']),
  qianwenQuery: Object.freeze(['https://www.qianwen.com']),
  yuanbaoPrompt: Object.freeze(['https://yuanbao.tencent.com']),
  minimaxPrompt: Object.freeze(['https://chat.minimax.io']),
  deepseekPrompt: Object.freeze(['https://chat.deepseek.com']),
  kimiPrompt: Object.freeze(['https://www.kimi.com']),
  copilotPrompt: Object.freeze(['https://copilot.com']),
  grokPrompt: Object.freeze(['https://grok.com']),
  qwenChatPrompt: Object.freeze(['https://chat.qwen.ai']),
  aiStudioPrompt: Object.freeze(['https://aistudio.google.com'])
});

// Own entries only: a name such as "constructor" names no strategy.
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

function isUrlOnlyStrategy(strategy: SubmitStrategy): strategy is UrlOnlyStrategy {
  return 'urlOnly' in strategy && strategy.urlOnly === true;
}

// A copy of the named strategy, or null for an unknown name.
function getStrategyConfig(strategyName: unknown): SubmitStrategy | null {
  const config = lookup(STRATEGIES, String(strategyName || '').trim());
  if (!config) {
    return null;
  }
  if (isUrlOnlyStrategy(config)) {
    return { urlOnly: true };
  }
  return {
    ...config,
    editorSelectors: config.editorSelectors.slice(),
    sendButtonSelectors: config.sendButtonSelectors.slice()
  };
}

function getAllowedStrategyOrigins(strategyName: unknown): string[] {
  const origins = lookup(STRATEGY_ALLOWED_ORIGINS, String(strategyName || '').trim());
  return origins ? origins.slice() : [];
}

function isAllowedStrategyOrigin(strategyName: unknown, origin: unknown): boolean {
  const normalizedOrigin = String(origin || '').trim();
  return Boolean(
    normalizedOrigin &&
    getAllowedStrategyOrigins(strategyName).includes(normalizedOrigin)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The command as the injected script reads it: it arrives from another
// world, so the strategy is rebuilt from what it carries.
function readAiPromptSubmitCommand(value: unknown): AiPromptSubmitCommand | null {
  if (!isRecord(value) || value.type !== 'submit' || typeof value.allowedOrigin !== 'string' ||
      typeof value.prompt !== 'string') {
    return null;
  }
  const strategy: PromptStrategyOptions = isRecord(value.strategy) ? value.strategy : {};
  return {
    type: 'submit',
    allowedOrigin: value.allowedOrigin,
    prompt: value.prompt,
    strategy: createPromptStrategy({
      ...strategy,
      editorSelectors: readSelectors(strategy.editorSelectors),
      sendButtonSelectors: readSelectors(strategy.sendButtonSelectors)
    }, { withGenericSelectors: false })
  };
}

function readSelectors(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export {
  getAllowedStrategyOrigins,
  getStrategyConfig,
  isAllowedStrategyOrigin,
  isUrlOnlyStrategy,
  lookup,
  readAiPromptSubmitCommand
};
export type {
  AiPromptSubmitCommand,
  PromptStrategy,
  SubmitResult,
  SubmitStrategy
};
