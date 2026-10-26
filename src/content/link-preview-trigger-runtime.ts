// What the link preview trigger shares: its listeners and their cleanup
// once the extension goes away, messages to the worker, and whether the
// preview is turned on.
import type { BackgroundAction, BackgroundReply, BackgroundRequest } from '../domain/messages';
import * as LumnoMessaging from '../platform/messaging';
import type { ListenerTarget } from '../platform/page-navigation';
import { linkPreviewEnabled } from '../domain/settings/features';
import { getContextSettingsStore } from '../platform/settings-store';

interface PrepareOptions {
  // Shift held over the link, before any press.
  hover?: boolean;
}

// What happens to a Shift+click on a link.
interface PreviewHandlers {
  // The click opens the link in this frame (inside the preview itself).
  navigatesHere: boolean;
  // Shift held over a link prepares it before the press.
  prewarmsOnHover: boolean;
  prepare(href: string, prepareOptions?: PrepareOptions): void;
  // The press ended away from the link it prepared.
  cancel(): void;
  open(href: string, event: MouseEvent): void;
}

interface HoverPrewarm {
  // The press takes the hover's preparation over.
  release(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// nodeType 1 is an element.
function isElement(value: EventTarget | null | undefined): value is Element {
  return Boolean(value) && typeof value === 'object' && value !== null &&
    'nodeType' in value && value.nodeType === 1;
}

const PREVIEW_FRAME_NAME = 'lumno-link-preview';

const cleanups: Array<() => void> = [];
function cleanup(): void {
  cleanups.splice(0).forEach((run) => run());
}

// A tab left open across an extension reload or update keeps this script
// from the old extension running next to the one injected after it, in a
// separate isolated world the new one cannot reach through window. Its
// listeners come first and would keep claiming presses whose messages no
// longer reach the background, so the first event it sees after its
// extension went away removes them all and is left alone.
function isExtensionAlive(): boolean {
  try {
    return Boolean(chrome.runtime && chrome.runtime.id);
  } catch (_error) {
    return false;
  }
}

function guard<E>(listener: (event: E) => void): (event: E) => void {
  return (event) => {
    if (!isExtensionAlive()) {
      cleanup();
      return;
    }
    listener(event);
  };
}

function listenWindow<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: boolean
): void {
  const guarded = guard(listener);
  window.addEventListener(type, guarded, options);
  cleanups.push(() => window.removeEventListener(type, guarded, options));
}

function listenDocument<K extends keyof DocumentEventMap>(type: K, listener: (event: DocumentEventMap[K]) => void): void {
  const guarded = guard(listener);
  document.addEventListener(type, guarded);
  cleanups.push(() => document.removeEventListener(type, guarded));
}

function listenTarget(target: ListenerTarget, type: string, listener: (event: Event) => void): void {
  const guarded = guard(listener);
  target.addEventListener(type, guarded);
  cleanups.push(() => target.removeEventListener(type, guarded));
}

function isPreviewFrame(): boolean {
  try {
    return window.top !== window && window.name === PREVIEW_FRAME_NAME;
  } catch (_error) {
    return false;
  }
}

function send<A extends BackgroundAction>(
  message: BackgroundRequest<A>,
  callback?: (response: BackgroundReply<A> | undefined) => void
): void {
  try {
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, message, (response) => {
      void (chrome.runtime && chrome.runtime.lastError);
      if (typeof callback === 'function') {
        callback(response);
      }
    });
  } catch (_error) {
    // Ignore an extension context invalidated during reload or navigation.
  }
}

let triggerEnabled = true;

function followEnabledSetting(): void {
  if (typeof chrome === 'undefined' || !chrome || !chrome.storage) {
    return;
  }
  const settingsStore = getContextSettingsStore(chrome);
  const apply = (): void => {
    triggerEnabled = settingsStore.get(linkPreviewEnabled);
  };
  void settingsStore.include(linkPreviewEnabled).then(apply);
  cleanups.push(settingsStore.subscribe(linkPreviewEnabled, apply));
}

export {
  PREVIEW_FRAME_NAME,
  cleanup,
  cleanups,
  followEnabledSetting,
  guard,
  isElement,
  isExtensionAlive,
  isPreviewFrame,
  isRecord,
  listenDocument,
  listenTarget,
  listenWindow,
  send,
  triggerEnabled
};
export type {
  HoverPrewarm,
  PrepareOptions,
  PreviewHandlers
};
