// The page's Navigation API (window.navigation, Chrome 102), which the DOM
// types here do not have yet: only the parts the link preview scripts use,
// read from the page as untrusted.

interface ListenerTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface PageNavigation extends ListenerTarget {
  readonly canGoBack: boolean;
  back?(): { committed?: Promise<unknown>; finished?: Promise<unknown> };
}

// A 'navigate' event; the destination and flags may be missing elsewhere.
interface NavigateEventLike extends Event {
  readonly navigationType: string;
  readonly destination?: { readonly sameDocument?: boolean; readonly url?: string } | null;
  readonly downloadRequest?: string | null;
  readonly userInitiated?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isPageNavigation(value: unknown): value is PageNavigation {
  return isRecord(value) && typeof value.canGoBack === 'boolean' &&
    typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function';
}

// window.navigation where the browser has it.
function readPageNavigation(windowObj: Window): PageNavigation | null {
  const navigation: unknown = Reflect.get(windowObj, 'navigation');
  return isPageNavigation(navigation) ? navigation : null;
}

function isNavigateEvent(event: Event): event is NavigateEventLike {
  return 'navigationType' in event && typeof event.navigationType === 'string';
}

export { isNavigateEvent, readPageNavigation };
export type { ListenerTarget, NavigateEventLike, PageNavigation };
