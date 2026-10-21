(function(root) {
  'use strict';

  // Queries typed in the wrong keyboard layout: Hangul composition from
  // keystrokes and the Latin and Cyrillic layout conversions a query is also
  // tried as.
  function createKeyboardLayouts(deps) {
    const {
      isUrlLikeSearchQuery
    } = deps;

    // Hangul syllables are built from jamo by arithmetic, so a syllable reads as
    // its initial consonant ("ㅅㅇ" for 서울, the 초성 search Korean apps offer),
    // and the syllable still being typed at the end of the query reads as the
    // start of a fuller one ("삼서" while typing 삼성).
    const HANGUL_FIRST = 0xac00;
    const HANGUL_LAST = 0xd7a3;
    const HANGUL_INITIAL_JAMO = [
      0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145,
      0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e
    ];
    // Final consonants by index, as the jamo typed for them; clusters as two.
    const HANGUL_FINAL_JAMO = [
      [], [0x3131], [0x3132], [0x3131, 0x3145], [0x3134], [0x3134, 0x3148], [0x3134, 0x314e],
      [0x3137], [0x3139], [0x3139, 0x3131], [0x3139, 0x3141], [0x3139, 0x3142], [0x3139, 0x3145],
      [0x3139, 0x314c], [0x3139, 0x314d], [0x3139, 0x314e], [0x3141], [0x3142], [0x3142, 0x3145],
      [0x3145], [0x3146], [0x3147], [0x3148], [0x314a], [0x314b], [0x314c], [0x314d], [0x314e]
    ];
    // Compound vowels by index, as the vowels typed for them.
    const HANGUL_VOWEL_PARTS = { 9: [8, 0], 10: [8, 1], 11: [8, 20], 14: [13, 4], 15: [13, 5], 16: [13, 20], 19: [18, 20] };

    function getHangulParts(character) {
      const code = String(character || '').codePointAt(0);
      if (!(code >= HANGUL_FIRST && code <= HANGUL_LAST)) {
        return null;
      }
      const index = code - HANGUL_FIRST;
      return {
        initial: Math.floor(index / 588),
        vowel: Math.floor((index % 588) / 28),
        final: index % 28
      };
    }

    // A syllable as the jamo keystrokes that build it.
    function getHangulKeystrokes(parts) {
      const vowels = HANGUL_VOWEL_PARTS[parts.vowel] || [parts.vowel];
      return [HANGUL_INITIAL_JAMO[parts.initial]]
        .concat(vowels.map((vowel) => -1 - vowel))
        .concat(HANGUL_FINAL_JAMO[parts.final]);
    }

    function addHangulSteps(text, query, position, add) {
      const unitParts = text.length === 1 ? getHangulParts(text) : null;
      if (!unitParts) {
        return;
      }
      const typed = query.charAt(position);
      if (typed.charCodeAt(0) === HANGUL_INITIAL_JAMO[unitParts.initial]) {
        add(1, 'initial', false);
        return;
      }
      const typedParts = position === query.length - 1 ? getHangulParts(typed) : null;
      if (!typedParts) {
        return;
      }
      const typedKeys = getHangulKeystrokes(typedParts);
      const unitKeys = getHangulKeystrokes(unitParts);
      if (typedKeys.length < unitKeys.length && typedKeys.every((key, i) => key === unitKeys[i])) {
        add(1, 'partial', false);
      }
    }

    // While typing, a final consonant may still become the next syllable's
    // initial ("간" on the way to 가나): the query with that consonant moved out.
    function getHangulCarriedQuery(compact) {
      const last = compact.charAt(compact.length - 1);
      const parts = getHangulParts(last);
      if (!parts || parts.final === 0) {
        return '';
      }
      const finals = HANGUL_FINAL_JAMO[parts.final];
      const carried = finals[finals.length - 1];
      const remaining = finals.length > 1
        ? HANGUL_FINAL_JAMO.findIndex((jamo) => jamo.length === 1 && jamo[0] === finals[0])
        : 0;
      const syllable = String.fromCharCode(HANGUL_FIRST + (parts.initial * 21 + parts.vowel) * 28 + remaining);
      return compact.slice(0, -1) + syllable + String.fromCharCode(carried);
    }

    // A query typed with the wrong keyboard layout on: the characters each US
    // key gives on that layout, in the order of SEARCH_LAYOUT_KEYS; a space
    // marks a key that gives no letter there. Korean keys are composed into
    // syllables separately.
    const SEARCH_LAYOUT_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`\\/";
    const SEARCH_KEYBOARD_LAYOUTS = [
      { id: 'ru', letters: 'йцукенгшщзхъфывапролджэячсмитьбюё  ' },
      { id: 'uk', letters: "йцукенгшщзхїфівапролджєячсмитьбю'ґ " },
      { id: 'he', letters: '  קראטוןםפ  שדגכעיחלךף זסבהנמצתץ   ' },
      { id: 'ar', letters: 'ضصثقفغعهخحجدشسيبلاتنمكطئءؤر ىةوزذ ظ', extra: { b: 'لا' } }
    ].map((layout) => {
      const toLayout = new Map();
      Array.from(layout.letters).forEach((letter, index) => {
        if (letter !== ' ') {
          toLayout.set(SEARCH_LAYOUT_KEYS[index], letter);
        }
      });
      Object.keys(layout.extra || {}).forEach((key) => toLayout.set(key, layout.extra[key]));
      const toKeys = new Map();
      toLayout.forEach((letter, key) => {
        if (letter.length === 1 && !toKeys.has(letter)) {
          toKeys.set(letter, key);
        }
      });
      return { id: layout.id, toLayout, toKeys };
    });
    // Arabic shifted keys a lowercase query still means: أ إ آ are h, y, n.
    SEARCH_KEYBOARD_LAYOUTS[3].toKeys.set('أ', 'h').set('إ', 'y').set('آ', 'n');
    // 두벌식: consonants as their jamo, vowels as -1 - vowel index, the way
    // getHangulKeystrokes spells a syllable. Shift doubles q w e r t, o p.
    const SEARCH_KOREAN_KEYS = {
      r: 0x3131, R: 0x3132, s: 0x3134, e: 0x3137, E: 0x3138, f: 0x3139, a: 0x3141,
      q: 0x3142, Q: 0x3143, t: 0x3145, T: 0x3146, d: 0x3147, w: 0x3148, W: 0x3149,
      c: 0x314a, z: 0x314b, x: 0x314c, v: 0x314d, g: 0x314e,
      k: -1, o: -2, i: -3, O: -4, j: -5, p: -6, u: -7, P: -8, h: -9, y: -13, n: -14, b: -18, m: -19, l: -21
    };
    const SEARCH_KOREAN_KEY_LETTERS = new Map();
    Object.keys(SEARCH_KOREAN_KEYS).forEach((key) => {
      if (!SEARCH_KOREAN_KEY_LETTERS.has(SEARCH_KOREAN_KEYS[key])) {
        SEARCH_KOREAN_KEY_LETTERS.set(SEARCH_KOREAN_KEYS[key], key.toLowerCase());
      }
    });
    const SEARCH_LAYOUT_SCRIPT_PATTERNS = {
      ru: /[\p{Script=Cyrillic}]/u,
      he: /[\p{Script=Hebrew}]/u,
      ar: /[\p{Script=Arabic}]/u,
      ko: /[\p{Script=Hangul}]/u
    };
    // The script a reading on each layout is written in.
    const SEARCH_LAYOUT_READING_SCRIPTS = Object.freeze({
      ...SEARCH_LAYOUT_SCRIPT_PATTERNS,
      uk: SEARCH_LAYOUT_SCRIPT_PATTERNS.ru,
      en: /[a-z]/i
    });

    // Whether a text is written partly in the script of a layout's readings.
    function hasSearchKeyboardLayoutScript(layout, text) {
      const pattern = SEARCH_LAYOUT_READING_SCRIPTS[layout];
      return Boolean(pattern && text && pattern.test(String(text)));
    }
    const HANGUL_VOWEL_JAMO_FIRST = 0x314f;

    function findHangulFinal(jamo) {
      return HANGUL_FINAL_JAMO.findIndex((parts) => (
        parts.length === jamo.length && parts.every((part, i) => part === jamo[i])
      ));
    }

    // Jamo keystrokes into syllables, as a 두벌식 input method builds them: a
    // final consonant moves on to a following vowel, ㅗ ㅏ make ㅘ, ㄹ ㄱ make
    // ㄺ. Null unless every jamo joins a syllable; only the last consonant may
    // stand alone, as one typed before its vowel.
    function composeHangulKeystrokes(keys) {
      let text = '';
      let complete = true;
      let initial = -1;
      let vowel = -1;
      let final = 0;
      const flush = (atEnd) => {
        if (initial >= 0 && vowel >= 0) {
          text += String.fromCharCode(HANGUL_FIRST + (initial * 21 + vowel) * 28 + final);
        } else if (initial >= 0) {
          text += String.fromCharCode(HANGUL_INITIAL_JAMO[initial]);
          complete = complete && atEnd === true;
        } else if (vowel >= 0) {
          text += String.fromCharCode(HANGUL_VOWEL_JAMO_FIRST + vowel);
          complete = false;
        }
        initial = -1;
        vowel = -1;
        final = 0;
      };
      keys.forEach((key) => {
        if (key >= 0) {
          if (initial >= 0 && vowel >= 0) {
            const finals = HANGUL_FINAL_JAMO[final];
            const joined = finals.length < 2 ? findHangulFinal(finals.concat(key)) : -1;
            if (joined > 0) {
              final = joined;
              return;
            }
          }
          flush(false);
          initial = HANGUL_INITIAL_JAMO.indexOf(key);
          return;
        }
        const next = -1 - key;
        if (final > 0) {
          const finals = HANGUL_FINAL_JAMO[final];
          final = finals.length > 1 ? findHangulFinal([finals[0]]) : 0;
          flush(false);
          initial = HANGUL_INITIAL_JAMO.indexOf(finals[finals.length - 1]);
          vowel = next;
          return;
        }
        if (vowel >= 0) {
          const compound = Object.keys(HANGUL_VOWEL_PARTS).find((index) => (
            HANGUL_VOWEL_PARTS[index][0] === vowel && HANGUL_VOWEL_PARTS[index][1] === next
          ));
          if (compound) {
            vowel = Number(compound);
            return;
          }
          flush(false);
        }
        vowel = next;
      });
      flush(true);
      return complete && /[가-힣]/.test(text) ? text : null;
    }

    // US keys as 두벌식 typing, word by word; spaces and digits stay.
    function composeHangulText(text) {
      const words = text.split(/([\s\d]+)/);
      let composed = '';
      for (let i = 0; i < words.length; i += 1) {
        if (i % 2 === 1 || !words[i]) {
          composed += words[i];
          continue;
        }
        const keys = Array.from(words[i]).map((character) => (
          SEARCH_KOREAN_KEYS[character] || SEARCH_KOREAN_KEYS[character.toLowerCase()]
        ));
        const syllables = keys.every(Boolean) ? composeHangulKeystrokes(keys) : null;
        if (!syllables) {
          return null;
        }
        composed += syllables;
      }
      return composed;
    }

    // Hangul back into the keys that type it; null for a character no key gives.
    function getHangulKeyLetters(text) {
      let letters = '';
      for (const character of text) {
        const code = character.charCodeAt(0);
        const parts = getHangulParts(character);
        let keys = null;
        if (parts) {
          keys = getHangulKeystrokes(parts);
        } else if (HANGUL_INITIAL_JAMO.includes(code)) {
          keys = [code];
        } else if (code >= HANGUL_VOWEL_JAMO_FIRST && code <= HANGUL_VOWEL_JAMO_FIRST + 20) {
          const vowel = code - HANGUL_VOWEL_JAMO_FIRST;
          keys = (HANGUL_VOWEL_PARTS[vowel] || [vowel]).map((part) => -1 - part);
        } else if (/[\s\d]/.test(character)) {
          letters += character;
          continue;
        }
        if (!keys || keys.some((key) => !SEARCH_KOREAN_KEY_LETTERS.has(key))) {
          return null;
        }
        letters += keys.map((key) => SEARCH_KOREAN_KEY_LETTERS.get(key)).join('');
      }
      return letters;
    }

    // Letters a layout writes that no word of its language puts there: Russian
    // ь ъ ы never start a word, Hebrew final forms and Arabic ة ى end one.
    function isPlausibleSearchLayoutText(layoutId, text) {
      if (layoutId === 'ru') {
        return !/(?:^|\s)[ьъы]/.test(text);
      }
      if (layoutId === 'he') {
        return !/[ךםןףץ][א-ת]/.test(text);
      }
      if (layoutId === 'ar') {
        return !/[ةى][ء-ي]/.test(text);
      }
      return true;
    }

    function convertSearchTextByLayout(text, map) {
      let converted = '';
      for (const character of text) {
        const mapped = map.get(character);
        if (mapped) {
          converted += mapped;
        } else if (/[\s\d-]/.test(character)) {
          converted += character;
        } else {
          return null;
        }
      }
      return converted;
    }

    // The query as it would read had it been typed on the layout the user
    // meant: US keys read as Russian, Ukrainian, Hebrew, Arabic or Korean
    // ("vjcrdf" is москва, "tkatjd" is 삼성), and those scripts read back as US
    // keys ("пшерги" is github). Each entry is { layout, query }; addresses and
    // queries mixing scripts give none.
    function getSearchKeyboardLayoutQueries(query) {
      const raw = String(query || '').trim();
      const lower = raw.toLowerCase();
      if (raw.length > 64 || isUrlLikeSearchQuery(raw)) {
        return [];
      }
      const results = [];
      // Three keys at least: one or two match too much in any script.
      const add = (layout, converted) => {
        const latin = layout === 'en' ? converted : lower;
        if (converted && converted !== lower && (latin.match(/[a-z]/g) || []).length >= 3 &&
            !results.some((item) => item.query === converted)) {
          results.push({ layout, query: converted });
        }
      };
      if (/^[\x20-\x7e]+$/.test(raw) && /[a-z]/.test(lower)) {
        SEARCH_KEYBOARD_LAYOUTS.forEach((layout) => {
          const converted = convertSearchTextByLayout(lower, layout.toLayout);
          if (converted && isPlausibleSearchLayoutText(layout.id, converted)) {
            add(layout.id, converted);
          }
        });
        // Shift doubles a Korean consonant, so a capital may be one typed
        // with Shift or a capitalised word: both readings are tried.
        add('ko', composeHangulText(raw));
        add('ko', composeHangulText(lower));
        return results;
      }
      const scripts = Object.keys(SEARCH_LAYOUT_SCRIPT_PATTERNS).filter((id) => (
        SEARCH_LAYOUT_SCRIPT_PATTERNS[id].test(lower)
      ));
      if (scripts.length !== 1) {
        return [];
      }
      if (scripts[0] === 'ko') {
        add('en', getHangulKeyLetters(lower));
        return results;
      }
      const toKeys = new Map();
      SEARCH_KEYBOARD_LAYOUTS.forEach((layout) => {
        if (scripts[0] === layout.id || (scripts[0] === 'ru' && layout.id === 'uk')) {
          layout.toKeys.forEach((key, letter) => toKeys.set(letter, key));
        }
      });
      if (scripts[0] === 'ar') {
        // لا is its own key (b), and also ل then ا (g h).
        add('en', convertSearchTextByLayout(lower.replace(/لا/g, '\u0001'), new Map(toKeys).set('\u0001', 'b')));
      }
      add('en', convertSearchTextByLayout(lower, toKeys));
      return results;
    }

    return {
      HANGUL_INITIAL_JAMO,
      getHangulParts,
      addHangulSteps,
      getHangulCarriedQuery,
      hasSearchKeyboardLayoutScript,
      getSearchKeyboardLayoutQueries
    };
  }

  const api = Object.freeze({ createKeyboardLayouts });
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoSearchUtilsKeyboardLayouts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
