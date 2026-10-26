// The declarativeNetRequest rules that let the preview frame a site that
// refuses framing, and the URL checks they rely on.
import { FRAME_ANCESTORS_CSP, FRAME_BLOCKING_HEADERS, FRAME_OPTIONS_HEADER, NO_TAB_ID, PREVIEWABLE_URL_PATTERN, WORKER_RULE_ID } from './constants';
import type { HeaderInfo, PreviewSession, Rule, RuleCondition } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}


// A secret the surface hands to its own frame (see bindFrame); the page under
// the preview never sees it.
function createFrameSecret(): string {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  }
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

function isPreviewableUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length <= 8192 && PREVIEWABLE_URL_PATTERN.test(url);
}

// The domain a rule names for an address: its host without "www.", which
// declarativeNetRequest also matches on every subdomain.
function readUrlDomain(url: unknown): string {
  if (!isPreviewableUrl(url)) {
    return '';
  }
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname.includes(':') || hostname.includes('[')) {
      return '';
    }
    return hostname.replace(/^www\./, '');
  } catch (_error) {
    return '';
  }
}

// A preview's domains: the link's (and the address the frame loads it
// through), the page the frame shows now, those the frame's loading page was
// redirected to, and those a refused page was allowed for its next try.
function sessionDomains(session: PreviewSession): string[] {
  const domains = new Set(session.linkDomains);
  if (session.committedDomain) {
    domains.add(session.committedDomain);
  }
  session.redirectDomains.forEach((domain) => domains.add(domain));
  session.retryDomains.forEach((domain) => domains.add(domain));
  return Array.from(domains).sort();
}

// The same address apart from its fragment, which never reaches the network.
function isSameAddress(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    left.hash = '';
    right.hash = '';
    return left.href === right.href;
  } catch (_error) {
    return false;
  }
}

function readDomainList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((domain): domain is string => typeof domain === 'string' && domain !== '')
    : [];
}

// Session rules accept a tab condition and outlive a suspended worker, which
// finds a tab's rules again by the tab in their condition. Their ids are
// handed out from the ones free: tab ids run past a billion, so an id made
// from one could leave the 32-bit range rules allow.
function findTabRuleIds(rules: readonly Rule[], tabId: number): number[] {
  return rules
    .filter((rule) => rule.id !== WORKER_RULE_ID && rule.condition && Array.isArray(rule.condition.tabIds) &&
      rule.condition.tabIds.includes(tabId))
    .map((rule) => rule.id);
}

function allocateRuleIds(rules: readonly Rule[], count: number): number[] {
  const used = new Set(rules.map((rule) => rule.id).concat(WORKER_RULE_ID));
  const ids: number[] = [];
  for (let id = 1; ids.length < count; id += 1) {
    if (!used.has(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function buildRemoveHeadersRule(
  id: number,
  tabId: number,
  domains: readonly string[],
  headers: readonly string[],
  responseHeaders?: HeaderInfo[]
): Rule {
  const condition: RuleCondition = { tabIds: [tabId], requestDomains: domains.slice(), resourceTypes: ['sub_frame'] };
  if (responseHeaders) {
    condition.responseHeaders = responseHeaders;
  }
  return {
    id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: headers.map((header) => ({ header, operation: 'remove' }))
    },
    condition
  };
}

// With matchHeaders false (Chrome before 128), one rule drops both headers.
function buildFrameHeaderRules(
  tabId: number,
  ids: readonly number[],
  domains: readonly string[],
  matchHeaders = true
): Rule[] {
  if (!matchHeaders) {
    return [buildRemoveHeadersRule(ids[0], tabId, domains, FRAME_BLOCKING_HEADERS)];
  }
  return [
    buildRemoveHeadersRule(ids[0], tabId, domains, ['x-frame-options'], [FRAME_OPTIONS_HEADER]),
    buildRemoveHeadersRule(ids[1], tabId, domains, ['content-security-policy'], [FRAME_ANCESTORS_CSP])
  ];
}

function buildWorkerHeaderRule(domains: readonly string[]): Rule {
  return {
    id: WORKER_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'x-frame-options', operation: 'remove' }]
    },
    condition: {
      tabIds: [NO_TAB_ID],
      requestDomains: domains.slice(),
      resourceTypes: ['sub_frame', 'xmlhttprequest', 'other']
    }
  };
}

export {
  allocateRuleIds,
  buildFrameHeaderRules,
  buildRemoveHeadersRule,
  buildWorkerHeaderRule,
  createFrameSecret,
  findTabRuleIds,
  isPreviewableUrl,
  isRecord,
  isSameAddress,
  readDomainList,
  readUrlDomain,
  sessionDomains
};
