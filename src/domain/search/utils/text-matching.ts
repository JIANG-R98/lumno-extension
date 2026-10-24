// Matching a query against an index: unit steps and runs, initials and
// pieces, compact matching, the reusable matcher and title highlight
// ranges.
import type {
  SearchQueryContext,
  SearchRange,
  SearchRankingOptions,
  SearchTextIndex,
  SearchTextMatch,
  SearchTextMatcher,
  SearchTextMatcherOptions
} from '../types';
import type { KeyboardLayoutsApi } from './keyboard-layouts';
import type { TextIndexApi } from './text-index';
import type { TextNormalizeApi } from './text-normalize';

type TextMatchingDeps =
  Pick<TextIndexApi, 'SEARCH_UNIT_HAN' | 'SEARCH_UNIT_CHAR' | 'SEARCH_UNIT_WORD' | 'SEARCH_UNIT_DIGIT' |
    'resolveSearchTextIndexReadings' | 'buildSearchTextIndex'> &
  Pick<KeyboardLayoutsApi, 'addHangulSteps' | 'getHangulParts' | 'HANGUL_INITIAL_JAMO' | 'getHangulCarriedQuery'> &
  Pick<TextNormalizeApi, 'SEARCH_HAN_PATTERN' | 'compactSearchQuery' | 'normalizeSearchText' |
    'SEARCH_LETTER_ALTERNATES' | 'foldSearchCharacter' | 'SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES'> & {
    // From query-intent.ts, which matches title units in turn.
    shouldAllowLooseTextContains: (term: unknown) => boolean;
  };

type UnitStepType = 'full' | 'partial' | 'initial';

// One unit spelling part of the query.
interface UnitStep {
  unit: number;
  length: number;
  type: UnitStepType;
  // Spelled through a Han reading.
  reading: boolean;
  // Spelled through the unit's second spelling.
  alternate: boolean;
}

interface UnitPathShape {
  segmentStart: boolean;
  usesInitial: boolean;
  initialThenSpelled: boolean;
  singleHan: boolean;
  hasHan: boolean;
  literal: boolean;
  usesPinyin: boolean;
  abbreviation: boolean;
  anchored: boolean;
  exact: boolean;
}

interface UnitRun {
  path: UnitStep[];
  shape: UnitPathShape;
}

// The options getSearchTitleUnitMatch reads.
type TitleMatchOptions = Pick<SearchRankingOptions, 'titleMatcher'>;

// The parts of the query context highlighting reads.
type HighlightContext = Partial<Pick<SearchQueryContext, 'queryLower' | 'coreQueryTerms'>>;

function createTextMatching(deps: TextMatchingDeps) {
  const {
    SEARCH_UNIT_HAN,
    SEARCH_UNIT_CHAR,
    addHangulSteps,
    SEARCH_UNIT_WORD,
    SEARCH_UNIT_DIGIT,
    getHangulParts,
    HANGUL_INITIAL_JAMO,
    SEARCH_HAN_PATTERN,
    compactSearchQuery,
    resolveSearchTextIndexReadings,
    getHangulCarriedQuery,
    normalizeSearchText,
    SEARCH_LETTER_ALTERNATES,
    foldSearchCharacter,
    SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES,
    buildSearchTextIndex,
    shouldAllowLooseTextContains
  } = deps;

  // The ways one unit can spell the query from position p: the whole word
  // or reading, its initial ("zh", "ch" and "sh" count as initials), or any
  // prefix when the query ends inside it.
  function getSearchUnitSteps(index: SearchTextIndex, unit: number, query: string, position: number): UnitStep[] {
    const steps: UnitStep[] = [];
    const rest = query.length - position;
    const tail = query.slice(position);
    const add = (length: number, type: UnitStepType, reading: boolean, alternate?: boolean) => {
      if (length > 0 && length <= rest &&
          !steps.some((step) => step.length === length && step.type === type)) {
        steps.push({ unit, length, type, reading, alternate: Boolean(alternate) });
      }
    };
    const kind = index.kinds.charAt(unit);
    const text = index.texts[unit];
    if (kind === SEARCH_UNIT_HAN) {
      if (query.charAt(position) === text) {
        add(1, 'full', false);
      }
      const readings = (index.readings && index.readings[unit]) || [];
      readings.forEach((reading) => {
        if (query.startsWith(reading, position)) {
          add(reading.length, 'full', true);
        }
      });
      readings.forEach((reading) => {
        if (tail.length > 1 && tail.length < reading.length && reading.startsWith(tail)) {
          add(tail.length, 'partial', true);
        }
      });
      readings.forEach((reading) => {
        if (/^[zcs]h./.test(reading) && query.startsWith(reading.slice(0, 2), position)) {
          add(2, 'initial', true);
        }
      });
      readings.forEach((reading) => {
        if (reading.length > 1 && query.charAt(position) === reading.charAt(0)) {
          add(1, 'initial', true);
        }
      });
      return steps;
    }
    if (query.startsWith(text, position)) {
      add(text.length, 'full', false);
    }
    if (kind === SEARCH_UNIT_CHAR) {
      // A letter whose vowel sign is still being typed ("भ" for "भा").
      if (tail.length < text.length && text.startsWith(tail)) {
        add(tail.length, 'partial', false);
      }
      addHangulSteps(text, query, position, add);
      return steps;
    }
    const alternate = index.alternates && index.alternates[unit];
    if (alternate) {
      if (query.startsWith(alternate, position)) {
        add(alternate.length, 'full', false, true);
      } else if (tail.length > 1 && tail.length < alternate.length && alternate.startsWith(tail)) {
        add(tail.length, 'partial', false, true);
      }
    }
    if (tail.length > 1 && tail.length < text.length && text.startsWith(tail)) {
      add(tail.length, 'partial', false);
    }
    // A digit run is not abbreviated: "1" only spells "15" where the query ends.
    if (text.length > 1 && query.charAt(position) === text.charAt(0)) {
      if (kind === SEARCH_UNIT_WORD) {
        add(1, 'initial', false);
      } else if (rest === 1) {
        add(1, 'partial', false);
      }
    }
    return steps;
  }

  // A mark is drawn with the letter it sits on, so a highlight never ends
  // before it: splitting a word there would also break the joining of Arabic
  // letters.
  function extendSearchRangesOverMarks(text: string, ranges: SearchRange[]): SearchRange[] {
    const isMark = (position: number) => position < text.length && /^\p{M}$/u.test(text.charAt(position));
    const extended = ranges.map(([start, end]): SearchRange => {
      let stop = end;
      while (isMark(stop)) {
        stop += 1;
      }
      return [start, stop];
    });
    return mergeSearchRanges(extended);
  }

  function mergeSearchRanges(ranges: SearchRange[]): SearchRange[] {
    const sorted = (Array.isArray(ranges) ? ranges : [])
      .filter((range) => Array.isArray(range) && range[1] > range[0])
      .map((range): SearchRange => [range[0], range[1]])
      .sort((left, right) => left[0] - right[0] || left[1] - right[1]);
    const merged: SearchRange[] = [];
    sorted.forEach((range) => {
      const last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) {
        last[1] = Math.max(last[1], range[1]);
      } else {
        merged.push(range);
      }
    });
    return merged;
  }

  function describeSearchUnitPath(index: SearchTextIndex, path: UnitStep[]): UnitPathShape {
    const firstUnit = path[0].unit;
    const lastStep = path[path.length - 1];
    const abbreviation = path.every((step) => (
      step.type === 'initial' ||
      (step.type === 'full' && index.kinds.charAt(step.unit) === SEARCH_UNIT_WORD &&
        index.texts[step.unit].length === 1)
    ));
    const anchored = firstUnit === 0;
    const firstInitial = path.findIndex((step) => step.type === 'initial');
    return {
      segmentStart: index.segments.charAt(firstUnit) === '1',
      usesInitial: firstInitial >= 0,
      // An initial followed by a spelled unit: "t" + "he" (他和), "wx" + "dushu".
      initialThenSpelled: firstInitial >= 0 &&
        path.slice(firstInitial + 1).some((step) => step.type !== 'initial'),
      singleHan: path.length === 1 && index.kinds.charAt(firstUnit) === SEARCH_UNIT_HAN,
      hasHan: path.some((step) => index.kinds.charAt(step.unit) === SEARCH_UNIT_HAN),
      // Characters typed as themselves ("文档"), not read through pinyin.
      literal: path.every((step) => (
        !step.reading && step.type === 'full' &&
        (index.kinds.charAt(step.unit) === SEARCH_UNIT_HAN || index.kinds.charAt(step.unit) === SEARCH_UNIT_CHAR)
      )),
      usesPinyin: path.some((step) => step.reading),
      abbreviation,
      anchored,
      exact: anchored && lastStep.unit === index.count - 1 && (lastStep.type === 'full' || abbreviation)
    };
  }

  function getSearchUnitStepRange(index: SearchTextIndex, step: UnitStep): SearchRange {
    const start = index.spans[step.unit * 2];
    const kind = index.kinds.charAt(step.unit);
    if (step.type === 'full' || step.alternate || (kind !== SEARCH_UNIT_WORD && kind !== SEARCH_UNIT_DIGIT)) {
      return [start, index.spans[step.unit * 2 + 1]];
    }
    const letterEnds = index.letterEnds && index.letterEnds[step.unit];
    return [start, letterEnds ? letterEnds[step.length - 1] : start + step.length];
  }

  // Whether a unit can spell the given first letter or character at all; a
  // quick test before working out its steps.
  function canSearchUnitStartWith(index: SearchTextIndex, unit: number, character: string): boolean {
    const text = index.texts[unit];
    if (index.kinds.charAt(unit) !== SEARCH_UNIT_HAN) {
      if (text.charAt(0) === character) {
        return true;
      }
      // A Hangul syllable starts with its initial consonant, typed alone or
      // as the first part of the syllable being typed.
      const unitParts = text.length === 1 ? getHangulParts(text) : null;
      if (!unitParts) {
        return false;
      }
      const typedParts = getHangulParts(character);
      return character.charCodeAt(0) === HANGUL_INITIAL_JAMO[unitParts.initial] ||
        Boolean(typedParts && typedParts.initial === unitParts.initial);
    }
    if (text === character) {
      return true;
    }
    const readings = index.readings && index.readings[unit];
    return Boolean(readings && readings.some((reading) => reading.charAt(0) === character));
  }

  // The first place the query reads as consecutive units of the text, each
  // spelled in full, by its initial, or by a prefix where the query ends.
  function findSearchUnitRun(index: SearchTextIndex, compact: string): UnitRun | null {
    const failed = new Set<number>();
    const path: UnitStep[] = [];
    const walk = (unit: number, position: number): boolean => {
      if (position === compact.length) {
        return true;
      }
      if (unit >= index.count) {
        return false;
      }
      const key = unit * (compact.length + 1) + position;
      if (failed.has(key) || !canSearchUnitStartWith(index, unit, compact.charAt(position))) {
        return false;
      }
      const steps = getSearchUnitSteps(index, unit, compact, position);
      for (let i = 0; i < steps.length; i += 1) {
        path.push(steps[i]);
        if (walk(unit + 1, position + steps[i].length)) {
          return true;
        }
        path.pop();
      }
      failed.add(key);
      return false;
    };

    for (let start = 0; start < index.count; start += 1) {
      path.length = 0;
      if (!walk(start, 0)) {
        continue;
      }
      const shape = describeSearchUnitPath(index, path);
      // Initials, a lone syllable and two letters are weak evidence: inside a
      // phrase "js" would find every 技术 and "pin" every 品牌, so they have to
      // start one. Spelling across units ("shipin", "iphone15") and Han
      // characters typed as themselves may sit anywhere.
      if (!shape.literal && (compact.length <= 2 || shape.usesInitial || shape.singleHan) &&
          !shape.segmentStart) {
        continue;
      }
      // Mixing an initial with spelling needs three units: "wxdushu" is typed
      // for 微信读书, while English words such as "the" read as 他和.
      if (shape.initialThenSpelled && path.length < 3) {
        continue;
      }
      return { path: path.slice(), shape };
    }
    return null;
  }

  // Longer queries are split into pieces only up to this length, which keeps
  // the split search small.
  const SEARCH_PIECES_QUERY_MAX_LENGTH = 24;

  // A query that is not in the title as one run may still be there in pieces
  // with other text between or around them: "飞书文档" in 飞书云文档 and in
  // "文档 - 飞书", "feishuwendang" in 飞书云文档. Each piece has to hold on its
  // own: two characters at least, under the same rules as a whole query, so
  // initials still start a phrase. Every character of the query is covered,
  // nothing is skipped, and no two pieces share a unit, so "中国银行" does not
  // find 美国银行. Pieces typed as letters have to read Han characters, since
  // English already separates its words with spaces. The split with the
  // fewest pieces wins.
  function findSearchUnitPieces(index: SearchTextIndex, compact: string): UnitRun[] | null {
    if (compact.length < 4 || compact.length > SEARCH_PIECES_QUERY_MAX_LENGTH) {
      return null;
    }
    const queryHasHan = SEARCH_HAN_PATTERN.test(compact);
    const runs = new Map<number, UnitRun | null>();
    const getRun = (from: number, to: number): UnitRun | null => {
      const key = from * (compact.length + 1) + to;
      const known = runs.get(key);
      if (known !== undefined) {
        return known;
      }
      const run = findSearchUnitRun(index, compact.slice(from, to));
      const usable = run && (queryHasHan || run.shape.hasHan) ? run : null;
      runs.set(key, usable);
      return usable;
    };
    // How far a piece starting at `from` could reach at most, from one pass
    // over the units without the piece rules. Splits that end beyond it
    // cannot match, so most titles are rejected after one short walk.
    const getReach = (from: number): number => {
      let reach = from;
      const seen = new Set<number>();
      // Unit and query position pairs still to walk.
      const stack: Array<[number, number]> = [];
      for (let unit = 0; unit < index.count; unit += 1) {
        if (canSearchUnitStartWith(index, unit, compact.charAt(from))) {
          stack.push([unit, from]);
        }
      }
      for (let entry = stack.pop(); entry; entry = stack.pop()) {
        const [unit, position] = entry;
        const key = unit * (compact.length + 1) + position;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const spellings = index.kinds.charAt(unit) === SEARCH_UNIT_HAN
          ? [index.texts[unit]].concat((index.readings && index.readings[unit]) || [])
          : [index.texts[unit]];
        spellings.forEach((spelling) => {
          let shared = 0;
          while (shared < spelling.length && compact.charAt(position + shared) === spelling.charAt(shared)) {
            shared += 1;
          }
          reach = Math.max(reach, position + shared);
        });
        getSearchUnitSteps(index, unit, compact, position).forEach((step) => {
          const next = position + step.length;
          if (next < compact.length && unit + 1 < index.count &&
              canSearchUnitStartWith(index, unit + 1, compact.charAt(next))) {
            stack.push([unit + 1, next]);
          }
        });
      }
      return reach;
    };
    const covers = new Map<number, UnitRun[] | null>();
    const cover = (from: number): UnitRun[] | null => {
      if (from === compact.length) {
        return [];
      }
      const known = covers.get(from);
      if (known !== undefined) {
        return known;
      }
      let best: UnitRun[] | null = null;
      for (let to = getReach(from); to >= from + 2; to -= 1) {
        const run = getRun(from, to);
        const rest = run ? cover(to) : null;
        if (run && rest && (!best || rest.length + 1 < best.length)) {
          best = [run].concat(rest);
        }
      }
      covers.set(from, best);
      return best;
    };
    const pieces = cover(0);
    if (!pieces || pieces.length < 2) {
      return null;
    }
    const used = new Set<number>();
    for (let i = 0; i < pieces.length; i += 1) {
      for (let j = 0; j < pieces[i].path.length; j += 1) {
        const unit = pieces[i].path[j].unit;
        if (used.has(unit)) {
          return null;
        }
        used.add(unit);
      }
    }
    return pieces;
  }

  // Finds the query in the text: as one run first ("wxds", "wxdushu" and
  // "weixinds" all find 微信读书, "vscode" finds Visual Studio Code, "gh ck"
  // finds "GitHub 仓库"), then in pieces. Readings come from the simplified
  // form, so "taiwan" finds 臺灣 too. One run outranks pieces, and pieces in
  // the query's order outrank pieces out of it.
  function matchSearchTextIndex(index: SearchTextIndex | null | undefined, query: unknown): SearchTextMatch | null {
    const compact = compactSearchQuery(query);
    if (!compact || !index || !(index.count > 0)) {
      return null;
    }
    if (/[a-z]/.test(compact)) {
      resolveSearchTextIndexReadings(index);
    }
    const result = matchSearchTextCompact(index, compact);
    const carried = result ? '' : getHangulCarriedQuery(compact);
    return carried ? matchSearchTextCompact(index, carried) : result;
  }

  function matchSearchTextCompact(index: SearchTextIndex, compact: string): SearchTextMatch | null {
    const run = findSearchUnitRun(index, compact);
    if (run) {
      const shape = run.shape;
      let score = 14;
      if (shape.exact) {
        score = 42;
      } else if (shape.anchored) {
        score = 28;
      } else if (shape.segmentStart) {
        score = 20;
      } else if (shape.abbreviation) {
        score = 16;
      }
      return {
        score,
        reason: `${shape.abbreviation ? 'initials' : 'full'}-${shape.exact ? 'exact' : (shape.anchored ? 'prefix' : 'contains')}`,
        usesPinyin: shape.usesPinyin,
        abbreviation: shape.abbreviation,
        anchored: shape.anchored,
        exact: shape.exact,
        pieces: 1,
        ranges: mergeSearchRanges(run.path.map((step) => getSearchUnitStepRange(index, step)))
      };
    }
    const pieces = findSearchUnitPieces(index, compact);
    if (!pieces) {
      return null;
    }
    const starts = pieces.map((piece) => piece.path[0].unit);
    const inOrder = starts.every((unit, i) => i === 0 || unit > starts[i - 1]);
    return {
      score: Math.max(4, (inOrder ? 12 : 8) - (pieces.length - 2) * 2),
      reason: inOrder ? 'pieces-in-order' : 'pieces-reordered',
      usesPinyin: pieces.some((piece) => piece.shape.usesPinyin),
      abbreviation: false,
      anchored: starts[0] === 0,
      exact: false,
      pieces: pieces.length,
      ranges: mergeSearchRanges(pieces.flatMap((piece) => (
        piece.path.map((step) => getSearchUnitStepRange(index, step))
      )))
    };
  }

  // Cheap checks before building an index. Han characters in the query are
  // matched as themselves, so the title must hold every one of them. Without
  // Han characters in the title every unit is the title's own letters, so the
  // query's letters have to appear in order.
  function canSearchTextMatchQuery(text: string, compact: string): boolean {
    const folded = normalizeSearchText(text);
    if (SEARCH_HAN_PATTERN.test(folded)) {
      return Array.from(compact).every((character) => (
        !SEARCH_HAN_PATTERN.test(character) || folded.includes(character)
      ));
    }
    if (SEARCH_HAN_PATTERN.test(compact)) {
      return false;
    }
    // Korean initials and half-typed syllables are not the title's own text.
    if (/[\p{Script=Hangul}]/u.test(compact) && /[\p{Script=Hangul}]/u.test(folded)) {
      return true;
    }
    // Second spellings ("mueller" for Müller) add letters to the title's own.
    let letters = folded;
    if (Array.from(SEARCH_LETTER_ALTERNATES.keys()).some((letter) => text.includes(letter))) {
      letters = '';
      for (const character of text) {
        letters += (SEARCH_LETTER_ALTERNATES.get(character) || foldSearchCharacter(character)).toLowerCase();
      }
    }
    let position = 0;
    for (let i = 0; i < letters.length && position < compact.length; i += 1) {
      if (letters.charAt(i) === compact.charAt(position)) {
        position += 1;
      }
    }
    return position === compact.length;
  }

  // Keeps the index of recently seen titles, so typing one more letter only
  // walks the units again. Pinyin comes from getHanReadings(text, characters),
  // which returns the readings of each Han character in order.
  function createSearchTextMatcher(options?: SearchTextMatcherOptions | null): SearchTextMatcher {
    const settings: SearchTextMatcherOptions = options && typeof options === 'object' ? options : {};
    const maxEntries = Number(settings.maxEntries) >= 0
      ? Math.floor(Number(settings.maxEntries))
      : SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES;
    const cache = new Map<string, SearchTextIndex>();
    const getIndex = (text: unknown): SearchTextIndex => {
      const key = String(text || '');
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      const index = buildSearchTextIndex(key, settings);
      if (maxEntries > 0) {
        cache.set(key, index);
        while (cache.size > maxEntries) {
          const oldest = cache.keys().next().value;
          if (oldest === undefined) {
            break;
          }
          cache.delete(oldest);
        }
      }
      return index;
    };
    return {
      getIndex,
      match(text: unknown, query: unknown) {
        const source = String(text || '');
        const compact = compactSearchQuery(query);
        if (!source || !compact || !canSearchTextMatchQuery(source, compact)) {
          return null;
        }
        return matchSearchTextIndex(getIndex(source), compact);
      },
      clear() {
        cache.clear();
      }
    };
  }

  const DEFAULT_SEARCH_TEXT_MATCHER = createSearchTextMatcher();

  function getSearchTitleMatcher(options?: TitleMatchOptions | null): SearchTextMatcher {
    const matcher = options && options.titleMatcher;
    return matcher && typeof matcher.match === 'function' ? matcher : DEFAULT_SEARCH_TEXT_MATCHER;
  }

  // Two letters at least, and more than a number: digits alone match the
  // title text itself.
  function isSearchUnitQueryEligible(term: unknown): boolean {
    const compact = compactSearchQuery(term);
    // One Hangul syllable may still be half typed ("서" on the way to 성).
    return (compact.length >= 2 && /\D/.test(compact)) ||
      (compact.length === 1 && /[\p{Script=Hangul}]/u.test(compact));
  }

  // A unit match the plain text checks already credit (the title holds the
  // query as typed) adds nothing to the score.
  // skipLiteral: no match where the title already holds the term as typed.
  function getSearchTitleUnitMatch(
    title: unknown,
    term: unknown,
    options?: TitleMatchOptions | null,
    matchOptions?: { skipLiteral?: boolean } | null
  ): SearchTextMatch | null {
    const text = String(title || '');
    const extra: { skipLiteral?: boolean } = matchOptions && typeof matchOptions === 'object' ? matchOptions : {};
    if (!text || !isSearchUnitQueryEligible(term)) {
      return null;
    }
    const result = getSearchTitleMatcher(options).match(text, term);
    if (!result || !extra.skipLiteral) {
      return result;
    }
    return normalizeSearchText(text).includes(normalizeSearchText(term).trim()) ? null : result;
  }

  // Where a title shows the query: the text as typed, each term, and when
  // neither is there literally, the units a pinyin or initials match spelled.
  // A short ASCII term is only marked where a word starts, the way it matches,
  // so "ai" marks OpenAI but not "Detail". Ranges index the given text.
  function getSearchTitleHighlightRanges(
    title: unknown,
    context: HighlightContext | null | undefined,
    options?: TitleMatchOptions | null
  ): SearchRange[] {
    const text = String(title || '');
    const queryLower = context && context.queryLower ? String(context.queryLower) : '';
    if (!text || !queryLower) {
      return [];
    }
    // Word starts need no pinyin, so a Han query never loads the readings.
    const wordIndex = buildSearchTextIndex(text);
    const unitStarts = new Set(wordIndex.spans.filter((value, position) => position % 2 === 0));
    let foldedText = '';
    const foldedStarts: number[] = [];
    const foldedEnds: number[] = [];
    let offset = 0;
    Array.from(text).forEach((character) => {
      const start = offset;
      offset += character.length;
      Array.from(foldSearchCharacter(character).toLowerCase()).forEach((piece) => {
        foldedText += piece;
        for (let i = 0; i < piece.length; i += 1) {
          foldedStarts.push(start);
          foldedEnds.push(offset);
        }
      });
    });
    const ranges: SearchRange[] = [];
    const markLiteral = (needle: string) => {
      if (!needle) {
        return false;
      }
      const wordStartOnly = !shouldAllowLooseTextContains(needle);
      let found = false;
      let position = foldedText.indexOf(needle);
      while (position >= 0) {
        const start = foldedStarts[position];
        if (!wordStartOnly || unitStarts.has(start)) {
          ranges.push([start, foldedEnds[position + needle.length - 1]]);
          found = true;
        }
        position = foldedText.indexOf(needle, position + needle.length);
      }
      return found;
    };
    const markUnits = (term: string) => {
      const result = getSearchTitleUnitMatch(text, term, options);
      if (result) {
        ranges.push(...result.ranges);
        return true;
      }
      return false;
    };
    if (!markLiteral(queryLower) && !markUnits(queryLower)) {
      const terms = context && Array.isArray(context.coreQueryTerms) ? context.coreQueryTerms : [];
      terms.forEach((term) => {
        if (!markLiteral(term)) {
          markUnits(term);
        }
      });
    }
    return extendSearchRangesOverMarks(text, mergeSearchRanges(ranges));
  }

  return {
    matchSearchTextIndex,
    createSearchTextMatcher,
    isSearchUnitQueryEligible,
    getSearchTitleUnitMatch,
    getSearchTitleHighlightRanges
  };
}

type TextMatchingApi = ReturnType<typeof createTextMatching>;

export { createTextMatching };
export type { TextMatchingApi, TitleMatchOptions };
