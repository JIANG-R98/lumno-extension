// Where each search engine's suggestion service answers, and how its answer
// is read. Answers are read as untrusted: anything of another shape reads as
// no suggestions.

type SuggestionResponseKind = 'json' | 'text';

interface SuggestionSource {
  kind: SuggestionResponseKind;
  url(query: string): string;
  // The suggestions in what the service answered.
  read(response: unknown): unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

// The JSON inside a JSONP callback, as `callback({...})`.
function parseJsonpPayload(text: string): unknown {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start + 1, end));
  } catch (_error) {
    return null;
  }
}

// The outermost JSON array in a text.
function extractJsonArray(text: string): unknown {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_error) {
    return null;
  }
}

// The values of a list field of an answer.
function readField(list: unknown, field: string): unknown[] {
  return Array.isArray(list) ? list.map((item: unknown) => (isRecord(item) ? item[field] : null)).filter(Boolean) : [];
}

// The OpenSearch shape, [query, [suggestions...]].
function readSecondList(data: unknown): unknown[] | null {
  return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : null;
}

const readOpenSearch = (response: unknown): unknown[] => readSecondList(response) || [];

const readShenmaField = (response: unknown): unknown[] => (isRecord(response) ? readField(response.r, 'w') : []);

function readYahoo(response: unknown): unknown[] {
  const text = typeof response === 'string' ? response : '';
  const data = parseJsonpPayload(text) || extractJsonArray(text);
  if (Array.isArray(data)) {
    const second = readSecondList(data);
    if (second) {
      return second;
    }
    if (data[0] && Array.isArray(data[0])) {
      return data[0];
    }
  }
  const gossip = isRecord(data) ? data.gossip : null;
  return isRecord(gossip) && Array.isArray(gossip.results) ? readField(gossip.results, 'key') : [];
}

const encode = encodeURIComponent;

const SUGGESTION_SOURCES: Readonly<Record<string, SuggestionSource>> = Object.freeze({
  google: { kind: 'json', url: (query) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${encode(query)}`, read: readOpenSearch },
  bing: { kind: 'json', url: (query) => `https://api.bing.com/osjson.aspx?query=${encode(query)}`, read: readOpenSearch },
  baidu: {
    kind: 'json',
    url: (query) => `https://www.baidu.com/sugrec?ie=utf-8&json=1&prod=pc&wd=${encode(query)}`,
    read: (response) => (isRecord(response) ? readField(response.g, 'q') : [])
  },
  sogou: {
    kind: 'text',
    url: (query) => `https://sor.html5.qq.com/api/getsug?m=searxng&key=${encode(query)}`,
    read: (response) => readSecondList(extractJsonArray(typeof response === 'string' ? response : '')) || []
  },
  duckduckgo: {
    kind: 'json',
    url: (query) => `https://duckduckgo.com/ac/?type=list&q=${encode(query)}`,
    read: (response) => (Array.isArray(response) ? readSecondList(response) || readField(response, 'phrase') : [])
  },
  yandex: { kind: 'json', url: (query) => `https://suggest.yandex.com/suggest-ff.cgi?part=${encode(query)}`, read: readOpenSearch },
  quark: { kind: 'json', url: (query) => `https://sugs.m.sm.cn/web?q=${encode(query)}`, read: readShenmaField },
  shenma: { kind: 'json', url: (query) => `https://sugs.m.sm.cn/web?q=${encode(query)}`, read: readShenmaField },
  yahoo: {
    kind: 'text',
    url: (query) => `https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=sd1&command=${encode(query)}`,
    read: readYahoo
  }
});

// The suggestion service of an engine; null for an engine without one.
function getSuggestionSource(engineId: string): SuggestionSource | null {
  return Object.prototype.hasOwnProperty.call(SUGGESTION_SOURCES, engineId) ? SUGGESTION_SOURCES[engineId] : null;
}

export { extractJsonArray, getSuggestionSource, parseJsonpPayload, readField, readSecondList };
export type { SuggestionResponseKind, SuggestionSource };
