// The part of pinyin-pro's API search uses: every reading of each Han
// character, without tones.

interface PinyinOptions {
  toneType: 'none';
  type: 'array';
  multiple?: boolean;
  v: boolean;
}

interface PinyinApi {
  pinyin(text: string, options: PinyinOptions): string[];
}

// Wraps a loaded `pinyin` function, or returns null when the value is not
// one. Readings come back as strings whatever the library returns.
function toPinyinApi(pinyin: unknown): PinyinApi | null {
  if (typeof pinyin !== 'function') {
    return null;
  }
  return {
    pinyin: (text, options) => {
      const converted: unknown = Reflect.apply(pinyin, undefined, [text, options]);
      return Array.isArray(converted) ? converted.map((item: unknown) => String(item)) : [];
    }
  };
}

// The API in a loaded module or published object that has a `pinyin`
// function, or null.
function readPinyinApi(loaded: unknown): PinyinApi | null {
  if (!loaded || typeof loaded !== 'object') {
    return null;
  }
  return toPinyinApi(Reflect.get(loaded, 'pinyin'));
}

export { readPinyinApi, toPinyinApi };
export type { PinyinApi, PinyinOptions };
