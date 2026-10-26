// The search text index: the word, digit, Han and kana units of a title
// with their readings, built once and matched against many queries.
import type { SearchTextIndex, SearchTextIndexOptions, SearchUnitKind } from '../types';
import { SEARCH_HAN_PATTERN, SEARCH_LETTER_ALTERNATES, SEARCH_WORD_CHARACTERS_PATTERN, SEARCH_WORD_PART_PATTERN, foldSearchCharacter, normalizeSearchHanReadings } from './text-normalize';

// A run of letters of the scripts that write words apart, before it is
// split into words: per letter, where it starts and ends in the source and
// its second spelling.
interface WordRun {
  text: string;
  starts: number[];
  ends: number[];
  alternates: string[];
  // Each letter is one source character.
  simple: boolean;
  hasAlternate: boolean;
}

const SEARCH_UNIT_WORD: SearchUnitKind = 'w';
const SEARCH_UNIT_DIGIT: SearchUnitKind = 'd';
const SEARCH_UNIT_HAN: SearchUnitKind = 'h';
const SEARCH_UNIT_CHAR: SearchUnitKind = 'c';

// Hiragana (katakana fold to it), except の, which Chinese titles borrow.
function isSearchKanaCode(code: number): boolean {
  return (code >= 0x3041 && code <= 0x3096 && code !== 0x306e) || (code >= 0x30f7 && code <= 0x30fa);
}

// A title as the sequence of units a query spells: words of the scripts
// that write words apart (split at camel case and digits), digit runs, and
// single characters. A Han character carries its pinyin readings, every
// reading of a polyphone. Marks stay with the letter they sit on. Units
// remember where they sit in the original text for highlighting. Thousands
// of these stay cached, so each field is one compact value: kinds and
// segment starts as strings, spans as start/end pairs.
function buildSearchTextIndex(text: unknown, options?: SearchTextIndexOptions | null): SearchTextIndex {
  const settings: SearchTextIndexOptions = options && typeof options === 'object' ? options : {};
  const source = String(text || '');
  let kinds = '';
  let segments = '';
  const texts: string[] = [];
  const spans: number[] = [];
  // Per word: where each of its letters ends, when the letters are not one
  // source character each ("ﬁ", accents typed apart), and its second
  // spelling ("mueller" for Müller).
  let letterEnds: Record<number, number[]> | null = null;
  let alternates: Record<number, string> | null = null;
  let segmentStart = true;
  let spaceBefore = false;
  let lastKind = '';
  let attachable = false;
  let hasKana = false;
  let run: WordRun | null = null;
  const isCjkKind = (kind: string) => kind === SEARCH_UNIT_HAN || kind === SEARCH_UNIT_CHAR;

  const pushUnit = (
    kind: SearchUnitKind,
    unitText: string,
    start: number,
    end: number,
    ends?: number[] | null,
    alternate?: string
  ) => {
    if (ends) {
      letterEnds = letterEnds || {};
      letterEnds[texts.length] = ends;
    }
    if (alternate) {
      alternates = alternates || {};
      alternates[texts.length] = alternate;
    }
    // A space next to Han text separates word groups ("GitHub 仓库",
    // "微信 读书"); between words of other scripts it only separates words.
    const startsSegment = segmentStart || (spaceBefore && (isCjkKind(kind) || isCjkKind(lastKind)));
    kinds += kind;
    segments += startsSegment ? '1' : '0';
    texts.push(unitText);
    spans.push(start, end);
    segmentStart = false;
    spaceBefore = false;
    lastKind = kind;
    attachable = true;
  };
  const flushRun = () => {
    const current = run;
    if (!current) {
      return;
    }
    SEARCH_WORD_PART_PATTERN.lastIndex = 0;
    let match = SEARCH_WORD_PART_PATTERN.exec(current.text);
    while (match) {
      const from = match.index;
      const to = from + match[0].length;
      const word = match[0].toLowerCase();
      const alternate = current.hasAlternate ? current.alternates.slice(from, to).join('').toLowerCase() : '';
      pushUnit(
        /^\d/.test(match[0]) ? SEARCH_UNIT_DIGIT : SEARCH_UNIT_WORD,
        word,
        current.starts[from],
        current.ends[to - 1],
        current.simple ? null : current.ends.slice(from, to),
        alternate && alternate !== word ? alternate : ''
      );
      match = SEARCH_WORD_PART_PATTERN.exec(current.text);
    }
    run = null;
  };
  const extendLastUnit = (end: number, addedText: string) => {
    const last = texts.length - 1;
    spans[last * 2 + 1] = end;
    if (addedText) {
      texts[last] += addedText;
    }
  };

  let offset = 0;
  Array.from(source).forEach((character) => {
    const start = offset;
    offset += character.length;
    if (SEARCH_HAN_PATTERN.test(character)) {
      flushRun();
      pushUnit(SEARCH_UNIT_HAN, foldSearchCharacter(character), start, offset);
      return;
    }
    const folded = foldSearchCharacter(character);
    if (!folded || /^\p{M}+$/u.test(folded)) {
      // A mark belongs to the letter before it: an accent typed on its own
      // folds away, a Devanagari or Thai vowel sign stays part of it.
      if (run) {
        run.simple = false;
        run.ends[run.ends.length - 1] = offset;
      } else if (attachable && texts.length > 0) {
        extendLastUnit(offset, folded.toLowerCase());
      } else if (folded) {
        pushUnit(SEARCH_UNIT_CHAR, folded.toLowerCase(), start, offset);
      }
      return;
    }
    if (SEARCH_WORD_CHARACTERS_PATTERN.test(folded)) {
      if (!run) {
        run = { text: '', starts: [], ends: [], alternates: [], simple: true, hasAlternate: false };
      }
      if (folded.length !== 1 || character.length !== 1) {
        run.simple = false;
      }
      const alternate = SEARCH_LETTER_ALTERNATES.get(character);
      if (alternate) {
        run.hasAlternate = true;
      }
      run.text += folded;
      for (let i = 0; i < folded.length; i += 1) {
        run.starts.push(start);
        run.ends.push(offset);
        run.alternates.push(i === 0 && alternate ? alternate : (i === 0 ? folded : ''));
      }
      return;
    }
    flushRun();
    const lower = folded.toLowerCase();
    if (/^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*$/u.test(lower)) {
      if (isSearchKanaCode(lower.codePointAt(0) ?? 0)) {
        hasKana = true;
      }
      pushUnit(SEARCH_UNIT_CHAR, lower, start, offset);
      return;
    }
    attachable = false;
    // Punctuation such as the "-" or "|" in "Home - Visual Studio Code"
    // starts a new segment.
    if (/[^\s\p{M}]/u.test(character)) {
      segmentStart = true;
    } else if (/\s/.test(character)) {
      spaceBefore = true;
    }
  });
  flushRun();
  return {
    text: source,
    count: texts.length,
    kinds,
    segments,
    texts: texts.slice(),
    spans: spans.slice(),
    letterEnds,
    alternates,
    readings: null,
    getHanReadings: typeof settings.getHanReadings === 'function' ? settings.getHanReadings : null,
    // Kanji in a Japanese title are not read as Chinese pinyin.
    readingsResolved: !kinds.includes(SEARCH_UNIT_HAN) || hasKana
  };
}

// Readings are looked up the first time a typed letter meets the index, so
// a query of Han characters never needs the pinyin data.
function resolveSearchTextIndexReadings(index: SearchTextIndex): void {
  if (index.readingsResolved) {
    return;
  }
  index.readingsResolved = true;
  if (!index.getHanReadings) {
    return;
  }
  const hanUnits: number[] = [];
  for (let unit = 0; unit < index.count; unit += 1) {
    if (index.kinds.charAt(unit) === SEARCH_UNIT_HAN) {
      hanUnits.push(unit);
    }
  }
  let readings: unknown = null;
  try {
    readings = index.getHanReadings(index.text, hanUnits.map((unit) => index.texts[unit]));
  } catch (error) {
    readings = null;
  }
  if (Array.isArray(readings)) {
    const lookedUp = readings;
    const resolved: Array<string[] | null> = new Array(index.count).fill(null);
    hanUnits.forEach((unit, position) => {
      resolved[unit] = normalizeSearchHanReadings(lookedUp[position]);
    });
    index.readings = resolved;
  }
}

export {
  SEARCH_UNIT_CHAR,
  SEARCH_UNIT_DIGIT,
  SEARCH_UNIT_HAN,
  SEARCH_UNIT_WORD,
  buildSearchTextIndex,
  resolveSearchTextIndexReadings
};
