// The New Tab quote: whether and where it shows, its source, face and size,
// and the reader's imported collection.
import { defineSetting } from './define';
import { custom, isOneOf, isRecord, opaque } from './schema';

// Where the quote sits: above the search box, inside it, at the bottom, or
// below the shortcuts ('search', the oldest placement).
type NewtabQuotePosition = 'top' | 'input' | 'bottom' | 'search';

interface NewtabQuotePrefs {
  enabled: boolean;
  position: NewtabQuotePosition;
  category: 'poetry' | 'literature';
  provider: 'custom' | 'hitokoto';
  // An id of NEWTAB_QUOTE_FONTS.
  font: string;
  fontSize: number;
}

interface NewtabQuoteFont {
  id: string;
  // The message with the face's name, and the name when that is missing.
  labelKey: string;
  label: string;
  // CSS font-family stack.
  family: string;
}

const NEWTAB_QUOTE_FONT_SIZE_MIN = 12;
const NEWTAB_QUOTE_FONT_SIZE_MAX = 24;
const NEWTAB_QUOTE_FONT_SIZE_DEFAULT = 15;
const NEWTAB_QUOTE_FONT_DEFAULT = 'wenkai';
// The bundled faces are subsets declared in assets/fonts/<face>/<face>.css
// (scripts/build/subset-quote-font.py); the sans face only names system fonts.
// Glyphs a face lacks fall back along its own stack.
const NEWTAB_QUOTE_SERIF_FALLBACK = '"Songti SC", "Songti TC", "STSong", "SimSun", "NSimSun", ' +
  '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, "Times New Roman", serif';
const NEWTAB_QUOTE_POSITIONS: readonly NewtabQuotePosition[] = Object.freeze(['top', 'input', 'bottom']);
const NEWTAB_QUOTE_FONTS: readonly NewtabQuoteFont[] = Object.freeze([
  Object.freeze({
    id: 'wenkai',
    labelKey: 'newtab_quote_font_wenkai',
    label: 'LXGW WenKai',
    family: `"LXGW WenKai", ${NEWTAB_QUOTE_SERIF_FALLBACK}`
  }),
  Object.freeze({
    id: 'xiaowei',
    labelKey: 'newtab_quote_font_xiaowei',
    label: 'ZCOOL XiaoWei',
    family: `"Lumno Quote XiaoWei", ${NEWTAB_QUOTE_SERIF_FALLBACK}`
  }),
  Object.freeze({
    id: 'sans',
    labelKey: 'newtab_quote_font_sans',
    label: 'Sans-serif',
    family: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", ' +
      '"Source Han Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  })
]);

const newtabQuotePrefs = defineSetting({
  key: '_x_extension_newtab_quote_prefs_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: custom((value): NewtabQuotePrefs => {
    const source = isRecord(value) ? value : {};
    const size = typeof source.fontSize === 'number' ||
      (typeof source.fontSize === 'string' && source.fontSize.trim())
      ? Number(source.fontSize) : NaN;
    const font = NEWTAB_QUOTE_FONTS.find((entry) => entry.id === source.font);
    return {
      // Off until the user turns it on; a saved position alone never enables it.
      enabled: source.enabled === true,
      // 'search' predates the input-box placement and still means "below shortcuts".
      position: isOneOf(NEWTAB_QUOTE_POSITIONS, source.position) ? source.position : 'search',
      category: source.category === 'poetry' ? 'poetry' : 'literature',
      // 'custom' reads the reader's imported collection on this device.
      provider: source.provider === 'custom' ? 'custom' : 'hitokoto',
      font: font ? font.id : NEWTAB_QUOTE_FONT_DEFAULT,
      fontSize: Number.isFinite(size)
        ? Math.min(NEWTAB_QUOTE_FONT_SIZE_MAX, Math.max(NEWTAB_QUOTE_FONT_SIZE_MIN, Math.round(size)))
        : NEWTAB_QUOTE_FONT_SIZE_DEFAULT
    };
  })
});

// The imported collection, too large for browser sync; its format belongs
// to domain/custom-quotes.ts.
const customQuotes = defineSetting({
  key: '_x_extension_custom_quotes_2026_unique_',
  area: 'device',
  sync: 'webdav',
  schema: opaque()
});

// The quote of the collection picked for today on this device.
const customQuotePick = defineSetting({
  key: '_x_extension_custom_quote_pick_2026_unique_',
  area: 'device',
  schema: opaque()
});

// The online quotes fetched today.
const quoteCache = defineSetting({
  key: '_x_extension_newtab_quote_cache_2026_unique_',
  area: 'cache',
  schema: opaque()
});

export {
  NEWTAB_QUOTE_FONTS,
  NEWTAB_QUOTE_FONT_DEFAULT,
  NEWTAB_QUOTE_FONT_SIZE_DEFAULT,
  NEWTAB_QUOTE_FONT_SIZE_MAX,
  NEWTAB_QUOTE_FONT_SIZE_MIN,
  customQuotePick,
  customQuotes,
  newtabQuotePrefs,
  quoteCache
};
export type { NewtabQuoteFont, NewtabQuotePosition, NewtabQuotePrefs };
