// Comparing two URLs of one site: which numbers changed, and whether an
// identifier before them ties both to one work.

interface NumberChange {
  from: number;
  to: number;
}

interface QueryEntry {
  key: string;
  value: string;
}

// How one path segment or query value changed: not at all (with the work
// ids it holds), in its numbers only, or in a way that says nothing.
type UnitComparison =
  | { kind: 'same'; anchors: number }
  | { kind: 'numeric'; changes: NumberChange[]; anchorsBeforeChange: number }
  | { kind: 'opaque' };

type UrlComparison =
  | { kind: 'same' }
  | { kind: 'opaque' }
  | { kind: 'structure-mismatch' }
  | {
    kind: 'numeric';
    // A work id comes before the first changed number.
    anchored: boolean;
    firstChange: NumberChange;
    step: number;
  };

// Query parameters that carry sharing, tracking or playback offsets rather
// than which episode is shown.
const NOISE_QUERY_KEYS: ReadonlySet<string> = new Set([
  'spm_id_from', 'vd_source', 'from_spmid', 'share_source', 'share_medium',
  'share_plat', 'share_session_id', 'share_tag', 'share_from', 'unique_k',
  'fbclid', 'gclid', 'si', 't'
]);
const PAGE_SUFFIX_SEPARATORS: ReadonlySet<string> = new Set(['_', '-']);
const MAX_CHANGED_NUMBERS = 2;

function parseUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch (_error) {
    return null;
  }
}

function getSiteKey(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, '');
}

// Hash routes (#/… or #!/…) are pages in single-page apps; other hashes are anchors.
function getPathSegments(url: URL): string[] {
  const segments = url.pathname.split('/').filter(Boolean);
  const hash = url.hash || '';
  const routeMatch = hash.match(/^#!?\/(.*)$/);
  if (routeMatch) {
    routeMatch[1].split(/[/?]/).filter(Boolean).forEach((segment) => {
      segments.push(segment);
    });
  }
  return segments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch (_error) {
      return segment;
    }
  });
}

function getQueryEntries(url: URL): QueryEntry[] {
  const entries: QueryEntry[] = [];
  url.searchParams.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (NOISE_QUERY_KEYS.has(normalizedKey) || normalizedKey.startsWith('utm_')) {
      return;
    }
    if (!entries.some((entry) => entry.key === normalizedKey)) {
      entries.push({ key: normalizedKey, value });
    }
  });
  return entries;
}

function tokenize(value: unknown): string[] {
  return String(value || '').match(/\d+|\D+/g) || [];
}

function isDigits(token: string): boolean {
  return /^\d+$/.test(token);
}

// A token or unit that names the work rather than the episode: a number of
// three or more digits, or a mixed letter-and-digit id such as a BV id.
function isIdentifier(value: unknown): boolean {
  const text = String(value || '');
  if (/^\d{3,}$/.test(text)) return true;
  return text.length >= 6 && /\d/.test(text) && /[a-z]/i.test(text);
}

// Compares one path segment or query value. Returns the changed numbers in
// order, or marks the change as opaque when the shapes differ.
// Tokens that line up one to one: equal, or numbers that changed.
function compareAlignedTokens(beforeTokens: readonly string[], afterTokens: readonly string[]): UnitComparison {
  const changes: NumberChange[] = [];
  let anchorsBeforeChange = 0;
  for (let index = 0; index < beforeTokens.length; index += 1) {
    const a = beforeTokens[index];
    const b = afterTokens[index];
    if (a === b) {
      if (!changes.length && isIdentifier(a)) anchorsBeforeChange += 1;
      continue;
    }
    if (!isDigits(a) || !isDigits(b)) {
      return { kind: 'opaque' };
    }
    changes.push({ from: Number(a), to: Number(b) });
  }
  return { kind: 'numeric', changes, anchorsBeforeChange };
}

// A page suffix such as 72035.html → 72035_2.html.
function comparePageSuffix(beforeTokens: readonly string[], afterTokens: readonly string[]): UnitComparison {
  const reversed = beforeTokens.length >= afterTokens.length;
  const shorter = reversed ? afterTokens : beforeTokens;
  const longer = reversed ? beforeTokens : afterTokens;
  if (longer.length !== shorter.length + 2) {
    return { kind: 'opaque' };
  }
  for (let index = 0; index <= shorter.length; index += 1) {
    const inserted = longer.slice(index, index + 2);
    const rest = longer.slice(0, index).concat(longer.slice(index + 2));
    if (rest.join('\u0000') === shorter.join('\u0000') &&
        PAGE_SUFFIX_SEPARATORS.has(inserted[0]) && isDigits(inserted[1])) {
      const page = Number(inserted[1]);
      return {
        kind: 'numeric',
        changes: [reversed ? { from: page, to: 1 } : { from: 1, to: page }],
        anchorsBeforeChange: shorter.slice(0, index).filter(isIdentifier).length
      };
    }
  }
  return { kind: 'opaque' };
}

function compareUnit(before: string, after: string): UnitComparison {
  if (before === after) {
    return { kind: 'same', anchors: tokenize(before).filter(isIdentifier).length +
      (isIdentifier(before) && !isDigits(before) ? 1 : 0) };
  }
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  return beforeTokens.length === afterTokens.length
    ? compareAlignedTokens(beforeTokens, afterTokens)
    : comparePageSuffix(beforeTokens, afterTokens);
}

// Walks the URL in reading order: path segments, then query parameters.
// The first path segment is usually an account or channel name, so it
// never counts as a work id (github.com/<user>/<repo>/issues/<n>).
function comparePathUnits(beforeSegments: readonly string[], afterSegments: readonly string[]): UnitComparison[] {
  return beforeSegments.map((segment, index) => {
    const unit = compareUnit(segment, afterSegments[index]);
    if (index === 0) {
      if (unit.kind === 'same') unit.anchors = 0;
      if (unit.kind === 'numeric') unit.anchorsBeforeChange = 0;
    }
    return unit;
  });
}

// The query parameters compared by name, or null when one side has a
// parameter the other cannot default.
function compareQueryUnits(before: URL, after: URL): UnitComparison[] | null {
  const beforeQuery = getQueryEntries(before);
  const afterQuery = getQueryEntries(after);
  const keys = beforeQuery.map((entry) => entry.key);
  afterQuery.forEach((entry) => {
    if (!keys.includes(entry.key)) keys.push(entry.key);
  });
  const units: UnitComparison[] = [];
  for (const key of keys) {
    const a = beforeQuery.find((entry) => entry.key === key);
    const b = afterQuery.find((entry) => entry.key === key);
    if (a && b) {
      units.push(compareUnit(a.value, b.value));
      continue;
    }
    // A numeric parameter that only one side has defaults to 1 (?p=2 vs none).
    const present = a || b;
    if (!present || !isDigits(present.value)) {
      return null;
    }
    units.push({
      kind: 'numeric',
      changes: [a ? { from: Number(a.value), to: 1 } : { from: 1, to: Number(present.value) }],
      anchorsBeforeChange: 0
    });
  }
  return units;
}

// The URL's units together: the first number that changed, and the
// identifiers before it that tie both pages to one work.
function summarizeUnits(units: readonly UnitComparison[]): UrlComparison {
  let anchorsBeforeFirstChange = 0;
  let firstChange: NumberChange | null = null;
  let changedNumbers = 0;
  let opaqueUnits = 0;
  for (const unit of units) {
    if (unit.kind === 'same') {
      if (!firstChange && !opaqueUnits) anchorsBeforeFirstChange += unit.anchors;
      continue;
    }
    if (unit.kind === 'opaque') {
      opaqueUnits += 1;
      continue;
    }
    if (!firstChange && !opaqueUnits) {
      anchorsBeforeFirstChange += unit.anchorsBeforeChange;
      firstChange = unit.changes[0];
    }
    changedNumbers += unit.changes.length;
  }
  if (opaqueUnits) {
    return { kind: opaqueUnits === 1 && !changedNumbers ? 'opaque' : 'structure-mismatch' };
  }
  if (!firstChange) {
    return { kind: 'same' };
  }
  return {
    kind: 'numeric',
    anchored: anchorsBeforeFirstChange > 0 && changedNumbers <= MAX_CHANGED_NUMBERS,
    firstChange,
    step: Math.abs(firstChange.to - firstChange.from)
  };
}

function compareUrls(before: URL, after: URL): UrlComparison {
  const beforeSegments = getPathSegments(before);
  const afterSegments = getPathSegments(after);
  if (beforeSegments.length !== afterSegments.length) {
    return { kind: 'structure-mismatch' };
  }
  const queryUnits = compareQueryUnits(before, after);
  if (!queryUnits) {
    return { kind: 'structure-mismatch' };
  }
  return summarizeUnits([...comparePathUnits(beforeSegments, afterSegments), ...queryUnits]);
}

// Path words that suggest episodes and chapters, or pages whose numbered
// neighbours are unrelated (issues, threads, products, search results).
const SERIES_PATH_WORDS: ReadonlySet<string> = new Set([
  'play', 'player', 'vodplay', 'watch', 'video', 'videos', 'vod', 'bangumi', 'anime',
  'episode', 'episodes', 'chapter', 'chapters', 'read', 'reader', 'novel', 'novels',
  'book', 'books', 'manga', 'comic', 'comics', 'drama', 'series', 'show', 'shows'
]);
const UNRELATED_PATH_WORDS: ReadonlySet<string> = new Set([
  'issue', 'issues', 'pull', 'pulls', 'commit', 'commits', 'blob', 'tree', 'wiki',
  't', 'thread', 'threads', 'topic', 'topics', 'post', 'posts', 'forum', 'forums',
  'discussion', 'discussions', 'question', 'questions', 'answer', 'answers',
  'item', 'items', 'product', 'products', 'goods', 'search', 'tag', 'tags',
  'user', 'users', 'u', 'profile', 'people', 'status', 'statuses'
]);

function getPathWords(url: URL): Set<string> {
  const words = new Set<string>();
  getPathSegments(url).forEach((segment) => {
    segment.toLowerCase().split(/[^a-z]+/).filter(Boolean).forEach((word) => words.add(word));
  });
  return words;
}

function hasPathWord(url: URL, wordSet: ReadonlySet<string>): boolean {
  for (const word of getPathWords(url)) {
    if (wordSet.has(word)) return true;
  }
  return false;
}

export {
  MAX_CHANGED_NUMBERS,
  NOISE_QUERY_KEYS,
  PAGE_SUFFIX_SEPARATORS,
  SERIES_PATH_WORDS,
  UNRELATED_PATH_WORDS,
  compareAlignedTokens,
  comparePageSuffix,
  comparePathUnits,
  compareQueryUnits,
  compareUnit,
  compareUrls,
  getPathSegments,
  getPathWords,
  getQueryEntries,
  getSiteKey,
  hasPathWord,
  isDigits,
  isIdentifier,
  parseUrl,
  summarizeUnits,
  tokenize
};
export type {
  NumberChange,
  QueryEntry,
  UnitComparison,
  UrlComparison
};
