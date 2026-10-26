// Link preview limits, rule ids and the headers that block framing.
import type { HeaderInfo } from './types';

// X-Frame-Options and CSP frame-ancestors are the two ways a page refuses to
// be framed (a page that sends both is judged by frame-ancestors). While a
// tab's preview is open, its subframes from the previewed site lose
// X-Frame-Options, and lose their CSP only where it has frame-ancestors:
// declarativeNetRequest drops a whole header, never part of one, and the
// rest of a CSP (the limits on script and style that guard against injected
// script) is worth keeping. Chrome before 128 cannot match on a response
// header; there the CSP always goes.
//
// The rules reach the previewed site's domains only (see sessionDomains), so
// the page under the preview, or a page shown in it, cannot use the
// preview to frame any other site that refuses framing.
const FRAME_BLOCKING_HEADERS: readonly string[] = Object.freeze(['x-frame-options', 'content-security-policy']);
const FRAME_ANCESTORS_CSP: Readonly<HeaderInfo> = Object.freeze({ header: 'content-security-policy', values: ['*frame-ancestors*'] });
// Chrome settles a rule with no response header condition when the request
// starts, and one with such a condition when the response arrives. The
// X-Frame-Options rule matches on its own header so that a domain allowed
// while the request is underway (see handleFrameRedirect) still counts.
const FRAME_OPTIONS_HEADER: Readonly<HeaderInfo> = Object.freeze({ header: 'x-frame-options' });
// A site with a service worker answers the frame from the worker, and the
// worker's own request belongs to no tab (tab id -1), so the tab's rule never
// sees it. While previews are open, such requests to the previewed sites'
// domains lose X-Frame-Options alone: a worker may cache what it fetched and
// later serve it to the site's own tabs, where a removed CSP would stay
// removed. A page a worker builds from its cache keeps its headers and is
// still refused (X's posts load through another address for that; see
// link-preview-frame-url.ts).
const WORKER_RULE_ID = 1;
const NO_TAB_ID = -1;
// A press the page kept for itself (it handled the click) never opens; its
// rule and screenshot are dropped after this long.
const PREPARED_TTL_MS = 4000;
const CAPTURE_JPEG_QUALITY = 82;
const PREVIEWABLE_URL_PATTERN = /^https?:\/\//i;
// A refused page in the preview is tried again with the domains of the
// address it went to (and of where that address redirects) allowed; a
// preview gets this many such tries.
const MAX_REFUSED_RETRIES = 6;
const RESOLVE_TIMEOUT_MS = 5000;

export {
  CAPTURE_JPEG_QUALITY,
  FRAME_ANCESTORS_CSP,
  FRAME_BLOCKING_HEADERS,
  FRAME_OPTIONS_HEADER,
  MAX_REFUSED_RETRIES,
  NO_TAB_ID,
  PREPARED_TTL_MS,
  PREVIEWABLE_URL_PATTERN,
  RESOLVE_TIMEOUT_MS,
  WORKER_RULE_ID
};
