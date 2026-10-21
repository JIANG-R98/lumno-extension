(function(root) {
  'use strict';

  // Normalizing text for matching: folding case, width, accents and
  // traditional Han characters, splitting terms and title words, and the Han
  // readings and fuzzy pinyin variants a query may be typed as.
  function createTextNormalize(deps) {
    // Han ideographs: the unified block, its Extension A and the compatibility block.
    const SEARCH_HAN_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
    const SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES = 1024;

    let searchHanVariantMap = null;
    const SEARCH_FOLDED_CHARACTER_CACHE_MAX_ENTRIES = 16384;
    const searchFoldedCharacters = new Map();
    // Titles are folded again on every keystroke, so their folded and
    // lowercased forms are kept; a full cache starts over.
    const SEARCH_FOLDED_TEXT_CACHE_MAX_ENTRIES = 8192;
    const searchFoldedTexts = new Map();
    const searchNormalizedTexts = new Map();

    // Traditional characters fold to simplified ones where the variant table is
    // loaded (the background worker loads search-han-variants.js, pages load it
    // with the pinyin runtime). Each character stays one character, so highlight
    // ranges keep their places.
    function getSearchHanVariantMap() {
      if (searchHanVariantMap) {
        return searchHanVariantMap;
      }
      const pairs = typeof globalThis !== 'undefined' ? globalThis.LumnoSearchHanVariants : '';
      if (typeof pairs !== 'string' || !pairs) {
        return null;
      }
      searchHanVariantMap = new Map();
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        searchHanVariantMap.set(pairs.charAt(i), pairs.charAt(i + 1));
      }
      // Text folded before the table arrived folds again with it.
      searchFoldedCharacters.clear();
      searchFoldedTexts.clear();
      searchNormalizedTexts.clear();
      return searchHanVariantMap;
    }

    // Letters that read as other letters without a Unicode decomposition, and
    // letters whose mark is part of the letter itself.
    const SEARCH_FOLD_LETTERS = new Map([
      ['ß', 'ss'], ['ẞ', 'SS'], ['Ł', 'L'], ['ł', 'l'], ['Ø', 'O'], ['ø', 'o'], ['Đ', 'D'], ['đ', 'd'],
      ['Æ', 'AE'], ['æ', 'ae'], ['Œ', 'OE'], ['œ', 'oe'], ['Þ', 'TH'], ['þ', 'th'], ['Ħ', 'H'], ['ħ', 'h'],
      ['ı', 'i'],
      // Greek: the word-final sigma is the same letter as σ.
      ['ς', 'σ'],
      // Cyrillic: й, ї and ў are letters of their own, not и, і and у with a
      // mark (ё still reads as е).
      ['й', 'й'], ['Й', 'Й'], ['ї', 'ї'], ['Ї', 'Ї'], ['ў', 'ў'], ['Ў', 'Ў'],
      // Arabic and Persian: one letter written several ways.
      ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ٱ', 'ا'], ['ة', 'ه'], ['ى', 'ي'], ['ی', 'ي'], ['ک', 'ك']
    ]);

    // Second spellings a reader may type for a Latin letter: "mueller" for
    // Müller, "aa" for å, "oe" for ø.
    const SEARCH_LETTER_ALTERNATES = new Map([
      ['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'], ['Ä', 'Ae'], ['Ö', 'Oe'], ['Ü', 'Ue'],
      ['å', 'aa'], ['Å', 'Aa'], ['ø', 'oe'], ['Ø', 'Oe']
    ]);

    // Digits of other scripts (Arabic-Indic, Devanagari, Thai and more) read as
    // 0-9; each entry is the code point of a script's zero.
    const SEARCH_DIGIT_ZEROS = [
      0x0660, 0x06f0, 0x07c0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66,
      0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20, 0x1040, 0x1090, 0x17e0, 0x1810
    ];

    // Marks a reader leaves out when typing: Latin, Greek and Cyrillic accents,
    // Arabic vowel signs and the tatweel, Hebrew points. Marks that change a
    // word, such as the vowel signs of Devanagari or Thai, stay.
    function isSearchOptionalMark(code) {
      return (code >= 0x0300 && code <= 0x036f) ||
        (code >= 0x0591 && code <= 0x05bd) || code === 0x05bf ||
        (code >= 0x05c1 && code <= 0x05c2) || (code >= 0x05c4 && code <= 0x05c5) || code === 0x05c7 ||
        (code >= 0x0610 && code <= 0x061a) || code === 0x0640 ||
        (code >= 0x064b && code <= 0x065f) || code === 0x0670 ||
        (code >= 0x06d6 && code <= 0x06dc) || (code >= 0x06df && code <= 0x06e4) ||
        (code >= 0x06e7 && code <= 0x06e8) || (code >= 0x06ea && code <= 0x06ed);
    }

    // One character after decomposition: kana as hiragana, digits as 0-9,
    // traditional Han characters as simplified ones.
    function foldSearchSimpleCharacter(character) {
      if (SEARCH_FOLD_LETTERS.has(character)) {
        return SEARCH_FOLD_LETTERS.get(character);
      }
      const code = character.codePointAt(0);
      if ((code >= 0x30a1 && code <= 0x30f6) || code === 0x30fd || code === 0x30fe) {
        return String.fromCharCode(code - 0x60);
      }
      for (let i = 0; i < SEARCH_DIGIT_ZEROS.length; i += 1) {
        if (code >= SEARCH_DIGIT_ZEROS[i] && code <= SEARCH_DIGIT_ZEROS[i] + 9) {
          return String(code - SEARCH_DIGIT_ZEROS[i]);
        }
      }
      if (code >= 0x3400 && code <= 0x9fff) {
        const variants = getSearchHanVariantMap();
        return (variants && variants.get(character)) || character;
      }
      return character;
    }

    function computeSearchFoldedCharacter(character) {
      if (SEARCH_FOLD_LETTERS.has(character)) {
        return SEARCH_FOLD_LETTERS.get(character);
      }
      const code = character.codePointAt(0);
      if (isSearchOptionalMark(code)) {
        return '';
      }
      // Hangul letters typed alone (ㅅ) stay as typed: compatibility
      // decomposition would turn them into the jamo that only build syllables.
      if (code >= 0x3131 && code <= 0x318e) {
        return character;
      }
      const decomposed = character.normalize('NFKD');
      const composed = decomposed === character
        ? character
        : Array.from(decomposed)
          .filter((piece) => !isSearchOptionalMark(piece.codePointAt(0)))
          .join('')
          .normalize('NFC');
      return Array.from(composed).map(foldSearchSimpleCharacter).join('');
    }

    // Folds one character the way a reader sees letters as the same: full-width
    // forms an input method types ("ｇ"), ligatures, accents ("é"), letters
    // spelled several ways (ß, أ), digits of other scripts, katakana as
    // hiragana and traditional Han characters as simplified ones. Case is kept
    // so camel-case words can still be found. A mark a reader leaves out folds
    // to nothing; every other character folds on its own, so a title is indexed
    // character by character.
    function foldSearchCharacter(character) {
      if (character.length === 1 && character.charCodeAt(0) < 0x80) {
        return character;
      }
      const cached = searchFoldedCharacters.get(character);
      if (typeof cached === 'string') {
        return cached;
      }
      const folded = computeSearchFoldedCharacter(character);
      if (searchFoldedCharacters.size < SEARCH_FOLDED_CHARACTER_CACHE_MAX_ENTRIES) {
        searchFoldedCharacters.set(character, folded);
      }
      return folded;
    }

    // Pages load the variant table later than this file; once it is there,
    // building the map empties the caches folded without it.
    function ensureSearchHanVariants() {
      if (!searchHanVariantMap && typeof globalThis !== 'undefined' &&
          typeof globalThis.LumnoSearchHanVariants === 'string') {
        getSearchHanVariantMap();
      }
    }

    function rememberSearchText(cache, text, result) {
      if (cache.size >= SEARCH_FOLDED_TEXT_CACHE_MAX_ENTRIES) {
        cache.clear();
      }
      cache.set(text, result);
      return result;
    }

    function foldSearchText(value) {
      const text = String(value || '');
      if (!/[^\x00-\x7f]/.test(text)) {
        return text;
      }
      ensureSearchHanVariants();
      const cached = searchFoldedTexts.get(text);
      if (typeof cached === 'string') {
        return cached;
      }
      // Built only once a character changes, so unchanged text is returned as is.
      let folded = null;
      let position = 0;
      for (const character of text) {
        const piece = foldSearchCharacter(character);
        if (folded !== null) {
          folded += piece;
        } else if (piece !== character) {
          folded = text.slice(0, position) + piece;
        }
        position += character.length;
      }
      return rememberSearchText(searchFoldedTexts, text, folded === null ? text : folded);
    }

    function hasSearchHanCharacters(value) {
      return SEARCH_HAN_PATTERN.test(String(value || ''));
    }

    function normalizeSearchText(value) {
      const text = String(value || '');
      if (!/[^\x00-\x7f]/.test(text)) {
        return text.toLowerCase();
      }
      ensureSearchHanVariants();
      const cached = searchNormalizedTexts.get(text);
      if (typeof cached === 'string') {
        return cached;
      }
      return rememberSearchText(searchNormalizedTexts, text, foldSearchText(text).toLowerCase());
    }

    // The query as one run of letters, marks and digits: "gh ck" and "wx 读书"
    // are typed the way the title reads, without the spaces between its words.
    function compactSearchQuery(value) {
      return normalizeSearchText(value).replace(/[^\p{L}\p{M}\p{N}]+/gu, '');
    }

    function splitSearchTerms(value) {
      return Array.from(new Set(
        normalizeSearchText(value)
          .split(/[^\p{L}\p{M}\p{N}]+/u)
          .map((item) => item.trim())
          .filter(Boolean)
      ));
    }

    // Scripts that write words apart and have letter case. Their words split
    // at camel case and digits, abbreviate by initials, and a term of one or
    // two of their letters only matches where a word starts, as in English.
    const SEARCH_WORD_LETTERS = '\\p{Script=Latin}\\p{Script=Cyrillic}\\p{Script=Greek}' +
      '\\p{Script=Armenian}\\p{Script=Georgian}';
    const SEARCH_WORD_CHARACTERS_PATTERN = new RegExp(`^[${SEARCH_WORD_LETTERS}\\d]+$`, 'u');
    const SEARCH_WORD_RUN_PATTERN = new RegExp(`[${SEARCH_WORD_LETTERS}\\d]+`, 'gu');
    const SEARCH_WORD_PART_PATTERN = /\p{Lu}+(?!\p{Ll})|\p{Lu}?\p{Ll}+|\d+|\p{L}+/gu;

    // The words of a run: "OpenAI" is "open" and "ai", "iPhone15" is "i",
    // "phone" and "15", "HTMLParser" is "html" and "parser", "ВКонтакте" is
    // "в" and "контакте".
    function splitSearchRunWords(run) {
      return String(run || '').match(SEARCH_WORD_PART_PATTERN) || [];
    }

    // A title token is also every word inside it, so a short term finds the
    // "4a" in "移动4a平台", the "15" in "iPhone15" and the "ai" in "OpenAI".
    function splitSearchTitleTokens(value) {
      const tokens = splitSearchTerms(value);
      const seen = new Set(tokens);
      const add = (word) => {
        const token = String(word || '').toLowerCase();
        if (token && !seen.has(token)) {
          seen.add(token);
          tokens.push(token);
        }
      };
      (foldSearchText(value).match(SEARCH_WORD_RUN_PATTERN) || []).forEach((run) => {
        add(run);
        splitSearchRunWords(run).forEach(add);
      });
      return tokens;
    }

    const SEARCH_HAN_READINGS_CACHE_MAX_ENTRIES = 8192;
    const normalizedSearchHanReadingsCache = new Map();

    // Readings as typed, longest first; one shared array per distinct set.
    // The reading lists a caller keeps per character come back as the same
    // arrays, so their normalized form is found without joining them again.
    const normalizedSearchHanReadingsByList = new WeakMap();

    function normalizeSearchHanReadings(readings) {
      if (Array.isArray(readings) && normalizedSearchHanReadingsByList.has(readings)) {
        return normalizedSearchHanReadingsByList.get(readings);
      }
      const raw = (Array.isArray(readings) ? readings : [readings]).map((reading) => String(reading || ''));
      const key = raw.join(',');
      if (normalizedSearchHanReadingsCache.has(key)) {
        const cached = normalizedSearchHanReadingsCache.get(key);
        if (Array.isArray(readings)) {
          normalizedSearchHanReadingsByList.set(readings, cached);
        }
        return cached;
      }
      const result = [];
      raw.forEach((reading) => {
        const value = normalizeSearchText(reading).replace(/[^a-z]+/g, '');
        if (!value) {
          return;
        }
        // "ü" is typed as "v" or as "u": 绿 reads as "lv" and "lu".
        [value, value.replace(/v/g, 'u')].forEach((variant) => {
          if (!result.includes(variant)) {
            result.push(variant);
          }
        });
      });
      result.sort((left, right) => right.length - left.length);
      if (Array.isArray(readings)) {
        normalizedSearchHanReadingsByList.set(readings, result);
      }
      normalizedSearchHanReadingsCache.set(key, result);
      if (normalizedSearchHanReadingsCache.size > SEARCH_HAN_READINGS_CACHE_MAX_ENTRIES) {
        normalizedSearchHanReadingsCache.delete(normalizedSearchHanReadingsCache.keys().next().value);
      }
      return result;
    }

    // Fuzzy pinyin (模糊音), an opt-in setting: readings also spelled with the
    // initials and finals many speakers and input methods treat as one sound.
    // z/zh, c/ch, s/sh and n/l swap initials; an/ang, en/eng and in/ing swap
    // finals (so ian/iang and uan/uang as well).
    function expandSearchFuzzyPinyinReadings(readings) {
      const expanded = [];
      const add = (reading) => {
        if (reading && !expanded.includes(reading)) {
          expanded.push(reading);
        }
      };
      (Array.isArray(readings) ? readings : []).forEach((value) => {
        const reading = String(value || '').toLowerCase();
        add(reading);
        const match = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw]?)([aeiouv].*)$/.exec(reading);
        if (!match) {
          return;
        }
        const initial = match[1];
        const final = match[2];
        const initials = [initial];
        if (/^[zcs]h$/.test(initial)) {
          initials.push(initial.charAt(0));
        } else if (/^[zcs]$/.test(initial)) {
          initials.push(`${initial}h`);
        } else if (initial === 'n' || initial === 'l') {
          initials.push(initial === 'n' ? 'l' : 'n');
        }
        const finals = [final];
        if (/[aei]ng$/.test(final)) {
          finals.push(final.slice(0, -1));
        } else if (/[aei]n$/.test(final)) {
          finals.push(`${final}g`);
        }
        initials.forEach((start) => {
          finals.forEach((end) => add(start + end));
        });
      });
      return expanded;
    }

    return {
      SEARCH_HAN_PATTERN,
      SEARCH_TEXT_MATCHER_CACHE_MAX_ENTRIES,
      SEARCH_LETTER_ALTERNATES,
      foldSearchCharacter,
      hasSearchHanCharacters,
      normalizeSearchText,
      compactSearchQuery,
      splitSearchTerms,
      SEARCH_WORD_CHARACTERS_PATTERN,
      SEARCH_WORD_PART_PATTERN,
      splitSearchTitleTokens,
      normalizeSearchHanReadings,
      expandSearchFuzzyPinyinReadings
    };
  }

  const api = Object.freeze({ createTextNormalize });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsTextNormalize = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
