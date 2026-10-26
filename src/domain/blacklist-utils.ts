type MatchMode = 'exact' | 'prefix' | 'suffix';

// A blacklist entry: a normalized host+path+query pattern and how it matches.
interface BlacklistRule {
  pattern: string;
  matchModes: MatchMode[];
}

const DEFAULT_MATCH_MODE: MatchMode = 'prefix';

function normalizeMatchModes(value: unknown, fallbackMode?: MatchMode | null): MatchMode[] {
  const source: unknown[] = Array.isArray(value) ? value : [value];
  const set = new Set<MatchMode>();
  source.forEach((item) => {
    const mode = String(item || '').trim().toLowerCase();
    if (mode === 'exact' || mode === 'prefix' || mode === 'suffix') {
      set.add(mode);
    }
  });
  if (set.has('exact')) {
    return ['exact'];
  }
  const next: MatchMode[] = [];
  if (set.has('prefix')) {
    next.push('prefix');
  }
  if (set.has('suffix')) {
    next.push('suffix');
  }
  if (next.length > 0) {
    return next;
  }
  if (!fallbackMode) {
    return [];
  }
  return [fallbackMode];
}

function normalizeUrlLikePattern(value: unknown): string {
  const withoutScheme = String(value || '').trim().replace(/^https?:\/\//i, '').trim();
  if (!withoutScheme) {
    return '';
  }
  try {
    const parsed = new URL(`https://${withoutScheme}`);
    if (!parsed.hostname) {
      return '';
    }
    parsed.hash = '';
    const host = String(parsed.host || '').toLowerCase();
    const path = String(parsed.pathname || '');
    const search = String(parsed.search || '');
    return `${host}${path}${search}`;
  } catch (error) {
    return '';
  }
}

function normalizeDomainPattern(value: unknown): string {
  const raw = String(value || '').trim().replace(/^https?:\/\//i, '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(`https://${raw}`);
    const hostname = String(parsed.hostname || '').toLowerCase();
    if (!hostname) {
      return '';
    }
    return hostname.startsWith('www.')
      ? hostname.slice(4)
      : hostname;
  } catch (error) {
    return '';
  }
}

function normalizePattern(value: unknown, matchModes: unknown, fallbackMode?: MatchMode | null): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const modes = normalizeMatchModes(matchModes, fallbackMode);
  if (modes.length === 1 && modes[0] === 'suffix') {
    return normalizeDomainPattern(raw);
  }
  return normalizeUrlLikePattern(raw);
}

function normalizeUrlForMatching(url: unknown): string {
  const raw = String(url || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return '';
    }
    parsed.hash = '';
    const host = String(parsed.host || '').toLowerCase();
    const path = String(parsed.pathname || '');
    const search = String(parsed.search || '');
    return `${host}${path}${search}`;
  } catch (error) {
    return '';
  }
}

function splitHostPathQuery(value: unknown): { host: string; path: string; search: string } | null {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return null;
  }
  const queryIndex = normalized.indexOf('?');
  const withoutQuery = queryIndex >= 0 ? normalized.slice(0, queryIndex) : normalized;
  const search = queryIndex >= 0 ? normalized.slice(queryIndex) : '';
  const slashIndex = withoutQuery.indexOf('/');
  const host = (slashIndex >= 0 ? withoutQuery.slice(0, slashIndex) : withoutQuery).toLowerCase();
  const path = slashIndex >= 0 ? withoutQuery.slice(slashIndex) : '/';
  if (!host) {
    return null;
  }
  return { host, path: path || '/', search };
}

function canToggleWwwHost(host: unknown): boolean {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized || normalized === 'localhost' || normalized.includes(':')) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return false;
  }
  return normalized.includes('.');
}

function toggleWwwHost(host: unknown): string {
  const normalized = String(host || '').trim().toLowerCase();
  if (!canToggleWwwHost(normalized)) {
    return '';
  }
  return normalized.startsWith('www.')
    ? normalized.slice(4)
    : `www.${normalized}`;
}

function getEquivalentPatterns(pattern: string): string[] {
  const parts = splitHostPathQuery(pattern);
  if (!parts) {
    return [];
  }
  const toggledHost = toggleWwwHost(parts.host);
  if (!toggledHost || toggledHost === parts.host) {
    return [];
  }
  return [`${toggledHost}${parts.path}${parts.search}`];
}

function buildRuleKey(rule: { pattern?: unknown; matchModes?: unknown } | null | undefined, fallbackMode?: MatchMode | null): string {
  if (!rule || !rule.pattern) {
    return '';
  }
  const modes = normalizeMatchModes(rule.matchModes, fallbackMode);
  return `${String(rule.pattern)}::${modes.join('|')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// Stored entries: rule objects, or bare pattern strings from older versions.
function normalizeItems(items: unknown, fallbackMode?: MatchMode | null): BlacklistRule[] {
  if (!Array.isArray(items)) {
    return [];
  }
  const entries: unknown[] = items;
  const normalized: BlacklistRule[] = [];
  const seen = new Set<string>();
  entries.forEach((entry) => {
    const rule = isRecord(entry) ? entry : null;
    const matchModes = normalizeMatchModes(
      rule && rule.matchModes ? rule.matchModes : [DEFAULT_MATCH_MODE],
      fallbackMode === undefined ? DEFAULT_MATCH_MODE : fallbackMode
    );
    const pattern = normalizePattern(
      rule && rule.pattern ? rule.pattern : entry,
      matchModes,
      fallbackMode === undefined ? DEFAULT_MATCH_MODE : fallbackMode
    );
    const key = buildRuleKey({ pattern: pattern, matchModes: matchModes }, fallbackMode);
    if (!pattern || !key || seen.has(key)) {
      return;
    }
    seen.add(key);
    normalized.push({
      pattern: pattern,
      matchModes: matchModes
    });
  });
  return normalized;
}

function matchesExact(pattern: string, target: string): boolean {
  return target === pattern || getEquivalentPatterns(pattern).includes(target);
}

function matchesPrefix(pattern: string, target: string): boolean {
  return target.startsWith(pattern) || getEquivalentPatterns(pattern).some((alternate) => target.startsWith(alternate));
}

// The target's host is the site or one of its subdomains.
function matchesSite(pattern: string, target: string): boolean {
  const sitePattern = normalizeDomainPattern(pattern);
  if (!sitePattern) {
    return false;
  }
  const targetParts = splitHostPathQuery(target);
  const targetHost = targetParts ? String(targetParts.host || '').toLowerCase() : '';
  return targetHost === sitePattern || targetHost.endsWith(`.${sitePattern}`);
}

function isRuleMatch(rule: BlacklistRule | null | undefined, url: unknown): boolean {
  if (!rule || !rule.pattern) {
    return false;
  }
  const target = normalizeUrlForMatching(url);
  if (!target) {
    return false;
  }
  const modes = normalizeMatchModes(rule.matchModes, null);
  return (modes.includes('exact') && matchesExact(rule.pattern, target)) ||
    (modes.includes('prefix') && matchesPrefix(rule.pattern, target)) ||
    (modes.includes('suffix') && matchesSite(rule.pattern, target));
}

// Takes rules normalizeItems produced.
function isUrlBlocked(url: unknown, items: readonly BlacklistRule[] | null | undefined): boolean {
  const rules = items || [];
  return rules.some((rule) => isRuleMatch(rule, url));
}

function getPatternInputValue(rule: { pattern?: unknown } | null | undefined): string {
  if (!rule || !rule.pattern) {
    return '';
  }
  return String(rule.pattern);
}

export {
  DEFAULT_MATCH_MODE,
  normalizeMatchModes,
  normalizePattern,
  normalizeItems,
  normalizeUrlForMatching,
  buildRuleKey,
  isRuleMatch,
  isUrlBlocked,
  getPatternInputValue
};
export type { BlacklistRule, MatchMode };
