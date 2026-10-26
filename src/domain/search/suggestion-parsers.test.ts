import { describe, expect, it } from 'vitest';
import { extractJsonArray, getSuggestionSource, parseJsonpPayload } from './suggestion-parsers';

describe('search engine suggestion parsers', () => {
  it('reads the OpenSearch answer of Google, Bing and Yandex', () => {
    ['google', 'bing', 'yandex'].forEach((engine) => {
      expect(getSuggestionSource(engine)?.read(['lum', ['lumno', 'lumen']])).toEqual(['lumno', 'lumen']);
    });
  });

  it('reads the fields Baidu, DuckDuckGo and Shenma answer with', () => {
    expect(getSuggestionSource('baidu')?.read({ g: [{ q: 'a' }, { q: 'b' }, {}] })).toEqual(['a', 'b']);
    expect(getSuggestionSource('duckduckgo')?.read([{ phrase: 'x' }])).toEqual(['x']);
    expect(getSuggestionSource('shenma')?.read({ r: [{ w: 'y' }] })).toEqual(['y']);
  });

  it('reads Sogou and Yahoo from text', () => {
    expect(getSuggestionSource('sogou')?.read('window.sug = ["q", ["s1", "s2"]];')).toEqual(['s1', 's2']);
    expect(getSuggestionSource('yahoo')?.read('cb({"gossip":{"results":[{"key":"k1"}]}})')).toEqual(['k1']);
    expect(getSuggestionSource('yahoo')?.read('[["first", "second"]]')).toEqual(['first', 'second']);
  });

  it('reads another shape as no suggestions, and knows no source for other engines', () => {
    expect(getSuggestionSource('google')?.read({ not: 'a list' })).toEqual([]);
    expect(getSuggestionSource('baidu')?.read(null)).toEqual([]);
    expect(getSuggestionSource('unknown')).toBeNull();
    expect(getSuggestionSource('toString')).toBeNull();
    expect(parseJsonpPayload('no callback')).toBeNull();
    expect(extractJsonArray('[broken')).toBeNull();
  });
});
