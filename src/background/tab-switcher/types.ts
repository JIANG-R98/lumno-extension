// What the recent-tab switcher's background modules share: the tab shape
// they read, the host element's id and a few helpers.
import type { SwitcherFields } from '../recent-tab-switcher';

// A tab as the switcher's helpers read it: a browser tab, a tab from the
// recent list with its thumbnail fields, or a payload item.
interface SwitcherTab extends Partial<SwitcherFields> {
  id?: number;
  windowId?: number | null;
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  incognito?: boolean;
  active?: boolean;
  pinned?: boolean;
  status?: chrome.tabs.Tab['status'];
  discarded?: boolean;
}

// How a host message is delivered and read: by message, or failing that by
// running scriptFunc in the page.
interface HostMessageOptions<T, A extends unknown[]> {
  scriptFunc: (...args: A) => unknown;
  scriptArgs: A;
  normalizeResponse: (response: unknown) => T | null;
  normalizeScriptResults: (results: unknown) => T | null;
  fallbackValue: T;
}

interface ThumbnailPriority {
  url: string;
  status: string;
  reason: string;
  markedAt: number;
}

interface CaptureRequest {
  tabId: number;
  windowId: number;
  reason: string;
  captureReason: string;
  requestedAt: number;
}

type CaptureResult = { ok: true; dataUrl: string } | { ok: false; reason: string };

// A switcher being opened in a window; a second press meanwhile is ignored.
interface SwitcherOpening {
  key: string;
  tabId: number | null;
  windowId: number | null;
  source: string;
  startedAt: number;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface InjectContext {
  currentTabId: number;
  selectedIndex: number;
  shortcut: string;
  // Opened by the reverse command, on the oldest tab.
  reverse: boolean;
  source: string;
  onOpenComplete: (ok: boolean, reason: string) => void;
}

// The keys bound to the switcher commands; reverse is '' while unbound.
interface TabSwitcherShortcuts {
  forward: string;
  reverse: string;
}

interface SwitchResult {
  ok: boolean;
  tabId?: number;
  windowId?: number | null;
  reason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const TAB_SWITCHER_HOST_ID = '_x_extension_tab_switcher_host_2026_unique_';

// How many recent tabs the switcher lists.
const TAB_SWITCHER_LIMIT = 5;

export { TAB_SWITCHER_HOST_ID, TAB_SWITCHER_LIMIT, getErrorMessage, isRecord };
export type {
  CaptureRequest,
  CaptureResult,
  HostMessageOptions,
  InjectContext,
  SwitchResult,
  SwitcherOpening,
  SwitcherTab,
  TabSwitcherShortcuts,
  ThumbnailPriority
};
