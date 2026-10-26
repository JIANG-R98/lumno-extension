// The icons a page declares (HTML links, the web manifest, root files),
// scored so the best one is tried first.
import { isRecord, normalizePageUrl } from './persisted';
import type { IconCandidate, IconCandidateOptions } from './types';

function getHtmlAttributeValue(tag: string | undefined, name: string): string {
  if (!tag || !name) {
    return '';
  }
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = String(tag).match(pattern);
  return match ? String(match[2] || match[3] || match[4] || '').trim() : '';
}


// The largest square size in a sizes attribute ("16x16 32x32"); Infinity
// for "any".
function getLargestDeclaredSize(value: unknown): number {
  const sizes = String(value || '').trim().toLowerCase();
  if (!sizes) {
    return 0;
  }
  if (sizes.split(/\s+/).includes('any')) {
    return Number.POSITIVE_INFINITY;
  }
  const dimensions: string[] = sizes.match(/(\d+)\s*x\s*(\d+)/g) || [];
  return dimensions.reduce((largest: number, dimension) => {
    const parts = dimension.split('x').map((part) => Number(part));
    return Math.max(largest, Math.min(parts[0] || 0, parts[1] || 0));
  }, 0);
}

function getThemeScore(url: string, media: string, preferredTheme: unknown): number {
  const theme = String(preferredTheme || '').trim().toLowerCase();
  if (theme !== 'dark' && theme !== 'light') {
    return 0;
  }
  const haystack = `${String(url || '').toLowerCase()} ${String(media || '').toLowerCase()}`;
  const opposite = theme === 'dark' ? 'light' : 'dark';
  let score = 0;
  if (haystack.includes(theme)) {
    score += 80;
  }
  if (haystack.includes(opposite)) {
    score -= 120;
  }
  return score;
}

function scoreIconCandidate(candidate: Omit<IconCandidate, 'score'>): number {
  const declaredSize = Number(candidate.declaredSize || 0);
  let score = 0;
  if (candidate.vector) {
    score += 1200;
  } else if (declaredSize >= 256) {
    score += 1000;
  } else if (declaredSize >= 180) {
    score += 940;
  } else if (declaredSize >= 128) {
    score += 900;
  } else if (declaredSize >= 96) {
    score += 800;
  } else if (declaredSize >= 64) {
    score += 700;
  } else if (declaredSize >= 48) {
    score += 400;
  } else if (declaredSize > 0) {
    score += 100;
  } else {
    score += 520;
  }
  if (candidate.source === 'manifest') {
    score += 60;
  }
  if (candidate.source === 'apple-touch-icon') {
    score += 50;
  }
  if (candidate.purpose === 'any') {
    score += 20;
  }
  score += Number(candidate.themeScore || 0);
  return score;
}

function createCandidate(url: string, options?: IconCandidateOptions): IconCandidate | null {
  const normalizedUrl = normalizePageUrl(url);
  if (!normalizedUrl) {
    return null;
  }
  const settings = options || {};
  const candidate = {
    url: normalizedUrl,
    source: settings.source || 'icon',
    declaredSize: Number(settings.declaredSize || 0),
    vector: settings.vector === true,
    purpose: String(settings.purpose || ''),
    themeScore: Number(settings.themeScore || 0)
  };
  return { ...candidate, score: scoreIconCandidate(candidate) };
}

// The page URL relative links resolve against: its <base href>, or itself.
function getHtmlBaseUrl(html: string, pageUrl: string): string {
  const baseTag = (html.match(/<base\b[^>]*>/i) || [])[0];
  const baseHref = getHtmlAttributeValue(baseTag, 'href');
  if (!baseHref) {
    return pageUrl;
  }
  try {
    return new URL(baseHref, pageUrl).href;
  } catch (_error) {
    return pageUrl;
  }
}

function parseHtmlIconCandidates(html: unknown, pageUrl: unknown, preferredTheme?: unknown): IconCandidate[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!html || !normalizedPageUrl) {
    return [];
  }
  const text = String(html);
  const baseUrl = getHtmlBaseUrl(text, normalizedPageUrl);
  const candidates: IconCandidate[] = [];
  for (const tag of text.match(/<link\b[^>]*>/gi) || []) {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const href = getHtmlAttributeValue(tag, 'href');
    if (!href || (!rel.includes('icon') && !rel.includes('apple-touch-icon'))) {
      continue;
    }
    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(href, baseUrl).href;
    } catch (_error) {
      continue;
    }
    const type = getHtmlAttributeValue(tag, 'type').toLowerCase();
    const media = getHtmlAttributeValue(tag, 'media');
    const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
    const candidate = createCandidate(resolvedUrl, {
      source: rel.includes('apple-touch-icon') ? 'apple-touch-icon' : 'icon',
      declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(getHtmlAttributeValue(tag, 'sizes')),
      vector,
      themeScore: getThemeScore(resolvedUrl, media, preferredTheme)
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }
  return mergeCandidates(candidates);
}

function parseHtmlManifestUrls(html: unknown, pageUrl: unknown): string[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!html || !normalizedPageUrl) {
    return [];
  }
  const text = String(html);
  const baseUrl = getHtmlBaseUrl(text, normalizedPageUrl);
  const seen = new Set<string>();
  return (text.match(/<link\b[^>]*>/gi) || []).flatMap((tag) => {
    const rel = getHtmlAttributeValue(tag, 'rel').toLowerCase();
    const href = getHtmlAttributeValue(tag, 'href');
    if (!rel.split(/\s+/).includes('manifest') || !href) {
      return [];
    }
    try {
      const url = new URL(href, baseUrl).href;
      if (!normalizePageUrl(url) || seen.has(url)) {
        return [];
      }
      seen.add(url);
      return [url];
    } catch (_error) {
      return [];
    }
  });
}

function parseManifestIconCandidates(manifest: unknown, manifestUrl: unknown): IconCandidate[] {
  const source = isRecord(manifest) ? manifest : {};
  const icons: unknown[] = Array.isArray(source.icons) ? source.icons : [];
  return mergeCandidates(icons.flatMap((value) => {
    const icon = isRecord(value) ? value : {};
    const src = String(icon.src || '').trim();
    if (!src) {
      return [];
    }
    let resolvedUrl = '';
    try {
      resolvedUrl = new URL(src, String(manifestUrl)).href;
    } catch (_error) {
      return [];
    }
    const type = String(icon.type || '').toLowerCase();
    const vector = type.includes('svg') || /\.svg(?:[?#]|$)/i.test(resolvedUrl);
    const purposeTokens = String(icon.purpose || 'any').toLowerCase().split(/\s+/);
    const candidate = createCandidate(resolvedUrl, {
      source: 'manifest',
      declaredSize: vector ? Number.POSITIVE_INFINITY : getLargestDeclaredSize(icon.sizes),
      vector,
      purpose: purposeTokens.includes('any') ? 'any' : (purposeTokens[0] || '')
    });
    return candidate ? [candidate] : [];
  }));
}

// The addresses sites conventionally serve icons at.
function getRootIconCandidates(pageUrl: unknown): IconCandidate[] {
  const normalizedPageUrl = normalizePageUrl(pageUrl);
  if (!normalizedPageUrl) {
    return [];
  }
  const origin = new URL(normalizedPageUrl).origin;
  return [
    createCandidate(`${origin}/favicon.svg`, {
      source: 'root-svg',
      declaredSize: Number.POSITIVE_INFINITY,
      vector: true
    }),
    createCandidate(`${origin}/apple-touch-icon.png`, {
      source: 'apple-touch-icon',
      declaredSize: 180
    }),
    createCandidate(`${origin}/favicon-192.png`, {
      source: 'root',
      declaredSize: 192
    }),
    createCandidate(`${origin}/favicon.png`, { source: 'root' }),
    createCandidate(`${origin}/favicon.ico`, { source: 'root' })
  ].filter((candidate): candidate is IconCandidate => candidate !== null);
}

// One candidate per URL, the best scored, best first.
function mergeCandidates(candidates: ReadonlyArray<IconCandidate | null | undefined> | null | undefined): IconCandidate[] {
  const byUrl = new Map<string, IconCandidate>();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || !candidate.url) {
      continue;
    }
    const current = byUrl.get(candidate.url);
    if (!current || Number(candidate.score || 0) > Number(current.score || 0)) {
      byUrl.set(candidate.url, candidate);
    }
  }
  return Array.from(byUrl.values()).sort((left, right) =>
    Number(right.score || 0) - Number(left.score || 0));
}

export {
  createCandidate,
  getHtmlAttributeValue,
  getHtmlBaseUrl,
  getLargestDeclaredSize,
  getRootIconCandidates,
  getThemeScore,
  mergeCandidates,
  parseHtmlIconCandidates,
  parseHtmlManifestUrls,
  parseManifestIconCandidates,
  scoreIconCandidate
};
