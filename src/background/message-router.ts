// Builds one action -> handler registry from any number of handler maps
// ({ actionName(request, sender, sendResponse) { ... } }). Feature areas can
// keep their handlers together; an action registered by two maps throws.
import type { BackgroundAction, BackgroundMessages, BackgroundReply } from '../domain/messages';

// A request as it arrives: the action is known, every other field is
// unchecked input the handler narrows (content scripts send from inside web
// pages).
type IncomingRequest<A extends BackgroundAction> = { action: A } & {
  [K in keyof BackgroundMessages[A]['request']]?: unknown;
};

// What a handler answers with: its action's reply, or a rejection.
type RejectionReply = { ok: false; reason?: string };

type MessageSender = chrome.runtime.MessageSender;

// Returns true while it will still call sendResponse.
type BackgroundHandler<A extends BackgroundAction> = (
  request: IncomingRequest<A>,
  sender: MessageSender,
  sendResponse: (reply: BackgroundReply<A> | RejectionReply) => void
) => boolean | void;

type BackgroundHandlerMap = { [A in BackgroundAction]?: BackgroundHandler<A> };

// The handler map of a feature area: one handler for each of its actions.
type HandlersFor<A extends BackgroundAction> = { readonly [K in A]: BackgroundHandler<K> };

// A request for any one action.
type AnyIncomingRequest = { [A in BackgroundAction]: IncomingRequest<A> }[BackgroundAction];

interface BackgroundRouter {
  has(action: unknown): boolean;
  actions(): string[];
  // Hands a request for a registered action to its handler.
  route(request: AnyIncomingRequest, sender: MessageSender, sendResponse: (reply: unknown) => void): boolean | void;
  // Whether the message names a registered action.
  accepts(message: Record<string, unknown>): message is AnyIncomingRequest;
}

// A guard for one action's arguments when a web page context sends it.
type ArgumentGuard = (request: Record<string, unknown>, sender: MessageSender) => boolean;

interface SenderPolicyOptions {
  // chrome.runtime.getURL(''): senders under it are extension pages.
  extensionBaseUrl?: string;
  // Actions the in-page surfaces may send.
  pageActions?: readonly string[];
  pageArgumentGuards?: Partial<Record<BackgroundAction, ArgumentGuard>>;
}

interface SenderVerdict {
  ok: boolean;
  reason?: 'sender-not-allowed' | 'argument-not-allowed';
}

interface SenderPolicy {
  isExtensionPageSender(sender: MessageSender | null | undefined): boolean;
  check(action: string, request: Record<string, unknown>, sender: MessageSender): SenderVerdict;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// A handler map's own keys are its actions.
function isMappedAction(map: BackgroundHandlerMap, key: string): key is BackgroundAction {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function copyHandler<A extends BackgroundAction>(target: BackgroundHandlerMap, source: BackgroundHandlerMap, action: A): void {
  target[action] = source[action];
}

function invoke<A extends BackgroundAction>(
  handlers: BackgroundHandlerMap,
  request: IncomingRequest<A>,
  sender: MessageSender,
  sendResponse: (reply: unknown) => void
): boolean | void {
  const handler = handlers[request.action];
  return handler ? handler(request, sender, sendResponse) : undefined;
}

function createRouter(...handlerMaps: Array<BackgroundHandlerMap | null | undefined>): Readonly<BackgroundRouter> {
  const handlers: BackgroundHandlerMap = {};
  handlerMaps.forEach((handlerMap) => {
    const source = handlerMap || {};
    Object.keys(source).forEach((action) => {
      if (!action.trim() || !isMappedAction(source, action)) {
        return;
      }
      if (typeof source[action] !== 'function') {
        throw new Error(`Background message handler is not a function: ${action}`);
      }
      if (isMappedAction(handlers, action)) {
        throw new Error(`Duplicate background message action: ${action}`);
      }
      copyHandler(handlers, source, action);
    });
  });
  function accepts(message: Record<string, unknown>): message is AnyIncomingRequest {
    return typeof message.action === 'string' && isMappedAction(handlers, message.action);
  }
  return Object.freeze({
    has(action: unknown): boolean {
      return isMappedAction(handlers, String(action || ''));
    },
    actions(): string[] {
      return Object.keys(handlers);
    },
    route(request: AnyIncomingRequest, sender: MessageSender, sendResponse: (reply: unknown) => void): boolean | void {
      return invoke(handlers, request, sender, sendResponse);
    },
    accepts
  });
}

// Who may send which action. Content scripts and the injected overlay run
// inside web pages, so a message from there is treated as coming from the
// page: only actions those surfaces use are accepted, and their arguments
// must pass the action's guard. Extension pages may send every action.
function createSenderPolicy(options?: SenderPolicyOptions | null): Readonly<SenderPolicy> {
  const config = options || {};
  const extensionBaseUrl = String(config.extensionBaseUrl || '');
  const pageActions = new Set((config.pageActions || []).map((action) => String(action)));
  const pageArgumentGuards: Partial<Record<string, ArgumentGuard>> = config.pageArgumentGuards || {};

  function isExtensionPageSender(sender: MessageSender | null | undefined): boolean {
    const url = sender && typeof sender.url === 'string' ? sender.url : '';
    return Boolean(extensionBaseUrl && url.startsWith(extensionBaseUrl));
  }

  function check(action: string, request: Record<string, unknown>, sender: MessageSender): SenderVerdict {
    const name = String(action || '');
    if (isExtensionPageSender(sender)) {
      return { ok: true };
    }
    if (!pageActions.has(name)) {
      return { ok: false, reason: 'sender-not-allowed' };
    }
    const guard = pageArgumentGuards[name];
    if (typeof guard === 'function' && guard(request, sender) !== true) {
      return { ok: false, reason: 'argument-not-allowed' };
    }
    return { ok: true };
  }

  return Object.freeze({
    isExtensionPageSender,
    check
  });
}

function sendRejectedResponse(sendResponse: ((reply: unknown) => void) | null | undefined, reason?: string): undefined {
  if (typeof sendResponse === 'function') {
    sendResponse(reason ? { ok: false, reason } : { ok: false });
  }
  return undefined;
}

// Hands a runtime message to its action's handler once the sender may send
// it; anything else is answered { ok: false }.
function dispatch(
  router: BackgroundRouter | null | undefined,
  request: unknown,
  sender: MessageSender,
  sendResponse: (reply: unknown) => void,
  senderPolicy?: SenderPolicy | null
): boolean | void {
  const message = isRecord(request) ? request : null;
  if (!router || !message || !router.accepts(message)) {
    return sendRejectedResponse(sendResponse);
  }
  if (senderPolicy) {
    const verdict = senderPolicy.check(message.action, message, sender);
    if (!verdict.ok) {
      return sendRejectedResponse(sendResponse, verdict.reason);
    }
  }
  return router.route(message, sender, sendResponse);
}

export { createRouter, createSenderPolicy, dispatch };
export type {
  AnyIncomingRequest,
  ArgumentGuard,
  BackgroundHandler,
  BackgroundHandlerMap,
  BackgroundRouter,
  HandlersFor,
  IncomingRequest,
  MessageSender,
  RejectionReply,
  SenderPolicy,
  SenderPolicyOptions,
  SenderVerdict
};
