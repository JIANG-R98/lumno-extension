// The link a press points at: anchors, shown URLs in posts, and which
// addresses a preview can show.
import { isElement, isRecord, triggerEnabled } from './link-preview-trigger-runtime';

function isPreviewGesture(event: MouseEvent): boolean {
  return triggerEnabled &&
    Boolean(event) &&
    event.isTrusted === true &&
    event.button === 0 &&
    event.shiftKey === true &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;
}

function readAnchorHref(element: EventTarget | null | undefined): string {
  if (!isElement(element)) {
    return '';
  }
  const tagName = String(element.tagName || '').toLowerCase();
  if (tagName !== 'a' && tagName !== 'area') {
    return '';
  }
  const href: unknown = Reflect.get(element, 'href');
  if (typeof href === 'string') {
    return href;
  }
  // SVG <a> exposes an SVGAnimatedString.
  const baseVal: unknown = isRecord(href) ? href.baseVal : null;
  if (typeof baseVal === 'string') {
    try {
      return new URL(baseVal, document.baseURI).href;
    } catch (_error) {
      return '';
    }
  }
  return '';
}

function isContentEditable(element: Element): boolean {
  return element instanceof HTMLElement && element.isContentEditable;
}

// The link under the press, also inside open shadow roots.
function findPreviewTarget(event: MouseEvent): string {
  return findPreviewTargetInPath(event.composedPath());
}

// The path an event at this node would take, for a node kept from an
// earlier event (composedPath is empty once dispatch ends).
function readNodePath(node: Node): EventTarget[] {
  const path: EventTarget[] = [];
  let current: Node | null = node;
  while (current) {
    path.push(current);
    const slot: HTMLSlotElement | null = current instanceof Element ? current.assignedSlot : null;
    current = slot || current.parentNode || (current instanceof ShadowRoot ? current.host : null);
  }
  return path;
}

function findPreviewTargetInPath(path: readonly EventTarget[]): string {
  for (const element of path) {
    if (element === window || element === document) {
      break;
    }
    if (!isElement(element)) {
      continue;
    }
    const href = readAnchorHref(element);
    if (!href) {
      const shownUrl = isClickable(element) ? readShownUrl(element) : '';
      if (shownUrl) {
        return shownUrl;
      }
      continue;
    }
    if (element.hasAttribute('download') || isContentEditable(element)) {
      return '';
    }
    if (isPreviewableHref(href)) {
      return href;
    }
    // A link that runs script (href="#", "javascript:") but shows an
    // address opens that address.
    return readShownUrl(element);
  }
  return findPostLink(path);
}

// Many sites show an address in a post or comment as text that opens on a
// click through script (often window.open, which a held Shift turns into
// a new window). Such text is taken as the link when it is clickable and
// is nothing but the address; plain text keeps Shift+click for selecting.
function isClickable(element: Element): boolean {
  if (isContentEditable(element)) {
    return false;
  }
  if (element.getAttribute('role') === 'link' || element.hasAttribute('onclick')) {
    return true;
  }
  try {
    return getComputedStyle(element).cursor === 'pointer';
  } catch (_error) {
    return false;
  }
}

// With its scheme or www., so a clickable file name (README.md) is not
// taken for an address.
const SHOWN_URL_PATTERN = /^(https?:\/\/|www\.)([a-z0-9-]+\.)+[a-z][a-z0-9-]+(:\d+)?([/?#]\S*)?$/i;
function readShownUrl(element: Element): string {
  const text = String(element.textContent || '').trim();
  if (!text || text.length > 2048 || !SHOWN_URL_PATTERN.test(text)) {
    return '';
  }
  try {
    const href = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).href;
    return isPreviewableHref(href) ? href : '';
  } catch (_error) {
    return '';
  }
}

// X draws a post as an <article> that opens on a click anywhere in it,
// with no link around it; its timestamp is the post's own link. A press
// on the post's buttons (reply, like, its menu), a field or a video stays
// theirs, and the post a page is about has nothing to preview.
const POST_HOST_PATTERN = /(^|\.)(x|twitter)\.com$/i;
const POST_CONTROL_SELECTOR = 'button, [role="button"], input, textarea, select, video, [contenteditable="true"]';
function findPostLink(path: readonly EventTarget[]): string {
  if (!POST_HOST_PATTERN.test(location.hostname)) {
    return '';
  }
  for (const element of path) {
    if (!isElement(element)) {
      continue;
    }
    if (element.matches(POST_CONTROL_SELECTOR)) {
      return '';
    }
    if (!element.matches('article[data-testid="tweet"]')) {
      continue;
    }
    const time = element.querySelector('a[href*="/status/"] time');
    const href = time ? readAnchorHref(time.closest('a')) : '';
    if (!href || !isPreviewableHref(href) || new URL(href).pathname === location.pathname) {
      return '';
    }
    return href;
  }
  return '';
}

function isPreviewableHref(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch (_error) {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  // A jump within this document has nothing to preview.
  const here = new URL(location.href);
  return !(url.hash && url.origin === here.origin &&
    url.pathname === here.pathname && url.search === here.search);
}

export {
  POST_CONTROL_SELECTOR,
  POST_HOST_PATTERN,
  SHOWN_URL_PATTERN,
  findPostLink,
  findPreviewTarget,
  findPreviewTargetInPath,
  isClickable,
  isContentEditable,
  isPreviewGesture,
  isPreviewableHref,
  readAnchorHref,
  readNodePath,
  readShownUrl
};
