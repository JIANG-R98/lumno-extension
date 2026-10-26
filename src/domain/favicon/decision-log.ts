// The debug log of why a favicon candidate was used or skipped.
import { getCanonicalPageUrlForFavicon } from './canonical';
import type { FaviconDecisionDetails, FaviconDecisionLogger, FaviconDecisionLoggerOptions } from './types';
import { isChromeMonogramFaviconUrl, isFaviconProxyUrl } from './url-kinds';

function getFaviconDecisionHostname(pageUrl: unknown, candidateUrl: unknown): string {
  const values = [pageUrl, getCanonicalPageUrlForFavicon(candidateUrl), candidateUrl];
  for (let index = 0; index < values.length; index += 1) {
    try {
      const parsed = new URL(String(values[index] || '').trim());
      if (parsed.hostname) {
        return String(parsed.hostname).toLowerCase();
      }
    } catch (e) {
      // Try the next redaction-safe source.
    }
  }
  return '';
}

function getFaviconCandidateKind(url: unknown, providedKind: unknown): string {
  const explicitKind = String(providedKind || '').trim().toLowerCase();
  if (explicitKind) {
    return explicitKind;
  }
  const raw = String(url || '').trim();
  if (/^chrome-extension:\/\/[^/]+\/_favicon\//i.test(raw)) {
    return 'browser-cache';
  }
  if (isChromeMonogramFaviconUrl(raw)) {
    return 'browser-favicon';
  }
  if (isFaviconProxyUrl(raw)) {
    return 'third-party-proxy';
  }
  if (/^https?:\/\//i.test(raw)) {
    return 'direct';
  }
  return 'other';
}

function createFaviconDecisionLogger(options?: FaviconDecisionLoggerOptions | null): FaviconDecisionLogger {
  const config = options || {};
  const surface = String(config.surface || 'unknown').trim() || 'unknown';
  const consoleObj = config.consoleObj || (typeof console !== 'undefined' ? console : null);
  const seen = new Set();
  return function logFaviconDecision(candidateUrl: unknown, reason: unknown, details?: FaviconDecisionDetails): boolean {
    const decisionReason = String(reason || '').trim();
    if (!decisionReason || !consoleObj || typeof consoleObj.debug !== 'function') {
      return false;
    }
    const metadata = details || {};
    const hostname = getFaviconDecisionHostname(metadata.pageUrl, candidateUrl);
    const candidateKind = getFaviconCandidateKind(candidateUrl, metadata.candidateKind);
    const key = `${surface}|${hostname}|${decisionReason}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    consoleObj.debug('[Lumno][favicon]', {
      surface,
      candidateKind,
      hostname,
      decision: 'blocked',
      reason: decisionReason
    });
    return true;
  };
}

export {
  createFaviconDecisionLogger,
  getFaviconCandidateKind,
  getFaviconDecisionHostname
};
