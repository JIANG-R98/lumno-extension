// Hosts whose icons are never fetched directly: local network and
// intranet hosts, and URLs whose request would reveal them.
import { getFaviconPageSearchParam, getPageUrlFromFaviconProxyUrl } from './canonical';
import type { FaviconHostPolicy, FaviconHostPolicyOptions } from './types';
import { isBrowserInternalPageUrl, isFaviconProxyUrl, isSafeVirtualFaviconRequestUrl } from './url-kinds';

function isLocalHostName(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'host.docker.internal';
}

// A shortened IPv4 address such as 127.1, which browsers expand.
function isShortIpv4(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(host) &&
    host.split('.').map((part) => Number(part)).every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

// Loopback, private, link-local and shared address space.
function isPrivateIpv4(parts: readonly number[]): boolean {
  const [first, second] = parts;
  return first === 0 || first === 10 || first === 127 ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 100 && second >= 64 && second <= 127);
}

function isLocalIpv6(ipv6: string): boolean {
  return ipv6 === '::1' || ipv6 === '0:0:0:0:0:0:0:1' || ipv6 === '::' ||
    /^fe[89ab][0-9a-f]*:/i.test(ipv6) || /^[fd][0-9a-f]{1,3}:/i.test(ipv6);
}

function isLocalNetworkHost(hostname: unknown): boolean {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return false;
  }
  if (isLocalHostName(host) || isShortIpv4(host)) {
    return true;
  }
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    const parts = host.split('.').map((part) => Number(part));
    return !parts.some((part) => Number.isNaN(part) || part < 0 || part > 255) && isPrivateIpv4(parts);
  }
  const ipv6 = host.split('%')[0];
  if (isLocalIpv6(ipv6)) {
    return true;
  }
  const mappedIpv4 = ipv6.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return Boolean(mappedIpv4 && mappedIpv4[1]) && isLocalNetworkHost(mappedIpv4 ? mappedIpv4[1] : '');
}

function isSuspiciousLocalFaviconHost(hostname: unknown): boolean {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) {
    return false;
  }
  const ipv6 = host.split('%')[0];
  if (host.includes(':') || ipv6.includes(':')) {
    return false;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){0,3}$/.test(host)) {
    return false;
  }
  if (!host.includes('.')) {
    return /^[a-z0-9-]+$/i.test(host);
  }
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) {
    return false;
  }
  const suffix = labels[labels.length - 1];
  return [
    'internal',
    'intern',
    'test',
    'localdev',
    'lan',
    'home',
    'corp',
    'localdomain'
  ].includes(suffix);
}

// No host is blocked outright by default; callers pass their own rule.
function shouldBlockFaviconForHost(_hostname: unknown): boolean {
  return false;
}

function shouldAvoidDirectFaviconForHost(hostname: unknown): boolean {
  return isLocalNetworkHost(hostname) || isSuspiciousLocalFaviconHost(hostname);
}

function getFaviconHostPolicy(hostname: unknown, options?: FaviconHostPolicyOptions | null): FaviconHostPolicy {
  const config = options || {};
  const shouldBlockHost = typeof config.shouldBlockFaviconForHost === 'function'
    ? config.shouldBlockFaviconForHost
    : shouldBlockFaviconForHost;
  const shouldAvoidDirectHost = typeof config.shouldAvoidDirectFaviconForHost === 'function'
    ? config.shouldAvoidDirectFaviconForHost
    : shouldAvoidDirectFaviconForHost;
  const host = String(hostname || '').trim();
  if (!host) {
    return { hardBlocked: false, avoidDirect: false };
  }
  return {
    hardBlocked: Boolean(shouldBlockHost(host)),
    avoidDirect: Boolean(shouldAvoidDirectHost(host))
  };
}

function shouldBlockDirectFaviconHost(hostname: unknown, options?: FaviconHostPolicyOptions | null): boolean {
  const policy = getFaviconHostPolicy(hostname, options);
  return policy.hardBlocked || policy.avoidDirect;
}

function isAllowedFaviconProxyRequestUrl(url: unknown): boolean {
  const raw = String(url || '').trim();
  return Boolean(raw && (isSafeVirtualFaviconRequestUrl(raw) || isFaviconProxyUrl(raw)));
}

// The host a URL names, also when it does not parse as a URL.
function getFaviconUrlHostCandidate(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) {
    return '';
  }
  const decodedRaw = (() => {
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  })();
  const withoutScheme = decodedRaw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = withoutScheme.split(/[/?#]/)[0] || '';
  const hostCandidateRaw = authority.includes('@') ? authority.split('@').pop() : authority;
  const value = String(hostCandidateRaw || '').trim().toLowerCase();
  if (!value) {
    return '';
  }
  if (value.startsWith('[')) {
    const endBracket = value.indexOf(']');
    if (endBracket > 1) {
      return value.slice(1, endBracket);
    }
  }
  return value.replace(/^\[|\]$/g, '').split(':')[0];
}

function getFaviconUrlPolicy(url: unknown, options?: FaviconHostPolicyOptions | null): FaviconHostPolicy {
  const raw = String(url || '').trim();
  const config = options || {};
  const allowProxyAvoidDirect = config.allowProxyAvoidDirect !== false;
  if (!raw) {
    return { hardBlocked: false, avoidDirect: false };
  }
  if (isBrowserInternalPageUrl(raw)) {
    return { hardBlocked: false, avoidDirect: false };
  }
  const canonicalProxyPage = getPageUrlFromFaviconProxyUrl(raw);
  let hostCandidate = '';
  if (canonicalProxyPage) {
    hostCandidate = getFaviconUrlHostCandidate(canonicalProxyPage);
  } else {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { hardBlocked: false, avoidDirect: false };
      }
      const nestedPageUrl = getFaviconPageSearchParam(parsed);
      if (nestedPageUrl && nestedPageUrl !== raw) {
        const nestedPolicy = getFaviconUrlPolicy(nestedPageUrl, config);
        if (nestedPolicy.hardBlocked || nestedPolicy.avoidDirect) {
          return nestedPolicy;
        }
      }
      hostCandidate = parsed.hostname;
    } catch (e) {
      hostCandidate = getFaviconUrlHostCandidate(raw);
    }
  }
  const hostPolicy = getFaviconHostPolicy(hostCandidate, config);
  if (canonicalProxyPage && allowProxyAvoidDirect) {
    return {
      hardBlocked: hostPolicy.hardBlocked,
      avoidDirect: false
    };
  }
  return hostPolicy;
}

function isFaviconUrlPolicyBlocked(url: unknown, options?: FaviconHostPolicyOptions | null): boolean {
  const policy = getFaviconUrlPolicy(url, options);
  return policy.hardBlocked || policy.avoidDirect;
}

function isBlockedLocalFaviconUrl(url: unknown): boolean {
  const raw = String(url || '').trim();
  if (!raw) {
    return false;
  }
  return isFaviconUrlPolicyBlocked(raw);
}

export {
  getFaviconHostPolicy,
  getFaviconUrlHostCandidate,
  getFaviconUrlPolicy,
  isAllowedFaviconProxyRequestUrl,
  isBlockedLocalFaviconUrl,
  isFaviconUrlPolicyBlocked,
  isLocalNetworkHost,
  isSuspiciousLocalFaviconHost,
  shouldAvoidDirectFaviconForHost,
  shouldBlockDirectFaviconHost,
  shouldBlockFaviconForHost
};
