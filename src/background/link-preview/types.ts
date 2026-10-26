// The shapes the link preview modules share.
import type { HandlersFor, MessageSender } from '../message-router';
import type { LinkPreviewOrigin, LinkPreviewRetry, OkReply, PageAction } from '../../domain/messages';
import type { SettingsStore } from '../../platform/settings-store';

type Rule = chrome.declarativeNetRequest.Rule;
type HeaderInfo = chrome.declarativeNetRequest.HeaderInfo;
type RuleCondition = chrome.declarativeNetRequest.RuleCondition;
type UpdateRuleOptions = chrome.declarativeNetRequest.UpdateRuleOptions;

type LinkPreviewAction =
  | 'linkPreviewPrepare'
  | 'linkPreviewOpen'
  | 'linkPreviewCancel'
  | 'linkPreviewClose'
  | 'linkPreviewOpenInTab'
  | 'linkPreviewFrameBind'
  | 'linkPreviewFrameNavigating'
  | 'linkPreviewFrameCommitted'
  | 'linkPreviewFrameRefused';
type SurfaceAction = Extract<PageAction, `lumnoLinkPreview${string}`>;

// "prepared" (pressed), "opening" (clicked, show not yet answered) or "open"
// (the surface shows it).
type SessionState = 'prepared' | 'opening' | 'open';

// A timer from the injected timer functions; only they read it.
type TimerHandle = unknown;

interface PreviewSession {
  token: string;
  url: string;
  // The address the frame loads the link through.
  frameUrl: string;
  // Handed to the surface's frame, which passes it back to bind itself.
  frameSecret: string;
  // The preview frame, once bound; only that frame speaks for the preview.
  frameId: number | null;
  // The link's domains and those of the address the frame loads it through.
  linkDomains: string[];
  // The site of the page the frame shows now.
  committedDomain: string;
  // Where the frame's loading page was redirected to.
  redirectDomains: string[];
  redirectRequestId: string;
  // Allowed for the next try of a refused page.
  retryDomains: string[];
  retries: number;
  // Where the frame last went, tried again after a refusal.
  lastFrameUrl: string;
  // The screenshot of the page behind the preview, or '' without one; null
  // until a press asks for it.
  capture: Promise<string> | null;
  // Whether the surface is injected and loading the page.
  ready: Promise<boolean> | null;
  screenshotDelivered: Promise<boolean> | null;
  state: SessionState;
  expiryTimer: TimerHandle | null;
}

// What an open preview keeps in session storage across a suspended worker.
type SavedSession = Pick<PreviewSession,
  'token' | 'url' | 'frameUrl' | 'frameSecret' | 'frameId' | 'linkDomains' | 'committedDomain' |
  'redirectDomains' | 'retryDomains' | 'retries' | 'lastFrameUrl'>;

// The fields of a webRequest redirect the service reads.
type FrameRedirect = Pick<chrome.webRequest.OnBeforeRedirectDetails,
  'type' | 'tabId' | 'frameId' | 'requestId' | 'url' | 'redirectUrl'>;

interface PrepareOptions {
  // False for Shift held over the link: no screenshot yet.
  capture?: boolean;
}

interface FrameSession {
  tabId: number;
  session: PreviewSession;
}

interface LinkPreviewServiceOptions {
  chromeApi?: typeof chrome | null;
  // Where open previews are kept for a restarted worker; none keeps them in
  // memory only.
  settingsStore?: SettingsStore | null;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
  fetch?: typeof fetch;
}

interface LinkPreviewService {
  prepare(tab: chrome.tabs.Tab | null | undefined, url: unknown, prepareOptions?: PrepareOptions): PreviewSession | null;
  open(tab: chrome.tabs.Tab | null | undefined, url: unknown, origin: LinkPreviewOrigin | null): Promise<OkReply>;
  cancel(tabId: number): Promise<boolean>;
  discard(tabId: number, token: string): Promise<boolean>;
  openInTab(tab: chrome.tabs.Tab | null | undefined, url: unknown): Promise<boolean>;
  bindFrame(sender: MessageSender | null | undefined, secret: unknown): Promise<boolean>;
  noteFrameNavigation(sender: MessageSender | null | undefined, url: unknown): Promise<boolean>;
  noteFrameCommitted(sender: MessageSender | null | undefined): Promise<boolean>;
  retryRefusedFrame(tabId: number, token: string): Promise<LinkPreviewRetry>;
  handleFrameRedirect(details: FrameRedirect | null | undefined): Promise<boolean>;
  handleTabRemoved(tabId: number): Promise<boolean>;
  handleTabUpdated(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo | null | undefined): Promise<boolean>;
  reconcileRules(): Promise<void>;
  attach(): void;
  messageHandlers: HandlersFor<LinkPreviewAction>;
}


interface LinkPreviewContext {
  readonly config: LinkPreviewServiceOptions;
  readonly chromeApi: typeof chrome | null;
  readonly settingsStore: SettingsStore | null;
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly clearTimer: (timer: TimerHandle) => void;
  readonly fetchUrl: ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | null;
  readonly sessions: Map<number, PreviewSession>;
  tokenCounter: number;
  headerMatching: boolean;
  ruleQueue: Promise<unknown>;
  restored: Promise<void>;
  redirectListener: ((details: chrome.webRequest.OnBeforeRedirectDetails) => void) | null;
}

export type {
  FrameRedirect,
  FrameSession,
  HeaderInfo,
  LinkPreviewAction,
  LinkPreviewContext,
  LinkPreviewService,
  LinkPreviewServiceOptions,
  PrepareOptions,
  PreviewSession,
  Rule,
  RuleCondition,
  SavedSession,
  SessionState,
  SurfaceAction,
  TimerHandle,
  UpdateRuleOptions
};
