/*
 * Chinese and Japanese text has no glyphs in Open Sans and falls back to the system
 * face, which has no weight between Medium and Semibold: PingFang draws 550 and 600
 * at Semibold, and Hiragino Sans jumps from W3 straight to W6. Headings and labels
 * set at 550-600 therefore drew their CJK much heavier than the Latin beside them.
 *
 * Open Sans is declared in three weight bands (assets/fonts/open-sans/open-sans.css).
 * This adds a CJK-only face to the middle band with the same descriptors, so the two
 * compose into one font that draws that band's CJK at Medium (W5 for Japanese). Other
 * bands keep the system fallback. The face depends on the page language, because
 * Simplified, Traditional and Japanese glyph forms differ.
 *
 * Pages load this file with data-font-family="Open Sans" and it follows <html lang>;
 * the overlay calls install() itself for its scoped "Lumno Open Sans" family.
 */
const FONT_WEIGHT_BAND = '550 649';
const UNICODE_RANGE = [
  'U+2E80-2FDF', // CJK and Kangxi radicals
  'U+3000-312F', // CJK punctuation, kana, bopomofo
  'U+3400-4DBF',
  'U+4E00-9FFF',
  'U+F900-FAFF',
  'U+FE30-FE4F',
  'U+FF00-FFEF' // full-width forms
].join(', ');
type CjkScript = 'zh-Hans' | 'zh-Hant' | 'ja';

interface CjkFontFaceOptions {
  family?: string | null;
  lang?: string | null;
  // The <style> element that holds the face; nothing is installed without it.
  styleId?: string | null;
}

const LOCAL_FACES: Readonly<Record<CjkScript, readonly string[]>> = Object.freeze({
  'zh-Hans': ['PingFangSC-Medium'],
  'zh-Hant': ['PingFangTC-Medium'],
  ja: ['HiraginoSans-W5']
});
const PAGE_STYLE_ID = '_x_extension_cjk_font_faces_2026_unique_';

function resolveScript(lang: string | null | undefined): CjkScript | '' {
  const value = String(lang || '').trim().toLowerCase();
  if (value === 'ja' || value.startsWith('ja-')) {
    return 'ja';
  }
  if (value === 'zh' || value.startsWith('zh-')) {
    return /^zh-(tw|hk|mo|hant)\b/.test(value) ? 'zh-Hant' : 'zh-Hans';
  }
  return '';
}

function buildFontFaceCss(family: string | null | undefined, lang: string | null | undefined): string {
  const script = resolveScript(lang);
  if (!family || !script) {
    return '';
  }
  const faces = LOCAL_FACES[script];
  const escapedFamily = String(family).replace(/["\\\n\r\f]/g, '\\$&');
  return [
    '@font-face {',
    `  font-family: "${escapedFamily}";`,
    `  src: ${faces.map((name) => `local("${name}")`).join(', ')};`,
    '  font-style: normal;',
    `  font-weight: ${FONT_WEIGHT_BAND};`,
    `  unicode-range: ${UNICODE_RANGE};`,
    '}'
  ].join('\n');
}

function install(doc: Document | null | undefined, options?: CjkFontFaceOptions | null): void {
  const config: CjkFontFaceOptions = options || {};
  const host = doc && (doc.head || doc.documentElement);
  if (!host || !config.styleId) {
    return;
  }
  const css = buildFontFaceCss(config.family, config.lang);
  let style = doc.getElementById(config.styleId);
  if (!css) {
    if (style) {
      style.remove();
    }
    return;
  }
  if (style && style.textContent === css) {
    return;
  }
  if (!style) {
    style = doc.createElement('style');
    style.id = config.styleId;
    host.appendChild(style);
  }
  style.textContent = css;
}

function watchDocumentLanguage(doc: Document | null | undefined, family: string): void {
  const html = doc && doc.documentElement;
  if (!html) {
    return;
  }
  const apply = () => install(doc, { family, lang: html.lang, styleId: PAGE_STYLE_ID });
  apply();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(apply).observe(html, { attributes: true, attributeFilter: ['lang'] });
  }
}

function watchFromCurrentScript(doc: Document | null | undefined): void {
  const script = doc ? doc.currentScript : null;
  const family = script ? script.dataset.fontFamily || '' : '';
  if (family) {
    watchDocumentLanguage(doc, family);
  }
}

// A page that loads the cjk-font-faces bundle with data-font-family follows
// its <html lang>; elsewhere there is no such script and this does nothing.
watchFromCurrentScript(typeof document !== 'undefined' ? document : null);

export type { CjkFontFaceOptions, CjkScript };
export {
  FONT_WEIGHT_BAND,
  buildFontFaceCss,
  install,
  watchDocumentLanguage,
  watchFromCurrentScript
};
