// The font faces the search overlay draws with. Chrome ignores @font-face
// rules inside shadow roots, so they are declared on the host document,
// under Lumno-specific family names so they can neither restyle host
// elements nor replace a page's own "Open Sans" or Remix Icon faces.
//
// Adding a face to a document that has already laid out restyles and relays
// out the whole page, which costs hundreds of milliseconds on large pages.
// So the shortcut observer registers the faces while the top-level document
// is still loading, through the FontFace API so the page's DOM stays
// untouched. The overlay declares them itself only in pages that started
// without them, such as tabs open before the extension was installed.
//
// A registered face downloads nothing until text needs it, so the faces are
// registered whatever overlay font is chosen: a chosen family falls back to
// "Lumno Open Sans", and the icons always draw from "lumno-remixicon".
import * as CJK_FONT_FACES from './cjk-font-faces';
import type { CjkScript } from './cjk-font-faces';

// Resolves a path inside the extension to its URL.
type AssetUrlResolver = (assetPath: string) => string;

interface OverlayFontFace {
  family: string;
  url: string;
  descriptors: FontFaceDescriptors;
}

// The faces registered early in a page.
interface EarlyOverlayFontFaces {
  faces: FontFace[];
  cjkFace: FontFace | null;
  cjkScript: CjkScript | '';
}

// The parts of a window the faces are registered through; tests pass their own.
interface FontFaceWindow {
  document?: { fonts?: FontFaceSet | null } | null;
  FontFace?: typeof FontFace;
}

interface EarlyFontFaceOptions {
  getUrl?: AssetUrlResolver | null;
  lang?: string | null;
}

const OVERLAY_TEXT_FAMILY = 'Lumno Open Sans';
const OVERLAY_ICON_FAMILY = 'lumno-remixicon';
const OPEN_SANS_PATH = 'assets/fonts/open-sans/OpenSans-VariableFont-wdth-wght.woff2';
const REMIXICON_PATH = 'assets/remixicon/fonts/remixicon.woff2';
// The same weight bands as open-sans.css, so the CJK face can join the
// middle one.
const OPEN_SANS_WEIGHT_BANDS: readonly string[] = Object.freeze(['300 549', '550 649', '650 800']);
// The faces registered early in this page, kept in the extension's isolated
// world where the overlay runtime reads them.
const EARLY_FONT_FACES_KEY = '_x_extension_overlay_early_font_faces_2026_unique_';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getOverlayFontFaces(getUrl: AssetUrlResolver): OverlayFontFace[] {
  const openSansUrl = getUrl(OPEN_SANS_PATH);
  return [
    ...OPEN_SANS_WEIGHT_BANDS.map((weight): OverlayFontFace => ({
      family: OVERLAY_TEXT_FAMILY,
      url: openSansUrl,
      descriptors: { style: 'normal', weight, display: 'swap' }
    })),
    {
      family: OVERLAY_ICON_FAMILY,
      url: getUrl(REMIXICON_PATH),
      descriptors: { display: 'swap' }
    }
  ];
}

function toCssSource(url: string): string {
  return `url("${String(url).replace(/["\\\n\r\f]/g, '\\$&')}") format("woff2")`;
}

// The faces as @font-face rules, for a <style> on the host document.
function buildOverlayFontFaceCss(getUrl: AssetUrlResolver): string {
  return getOverlayFontFaces(getUrl).map((face) => [
    '@font-face {',
    `  font-family: "${face.family}";`,
    `  src: ${toCssSource(face.url)};`,
    ...(face.descriptors.style ? [`  font-style: ${face.descriptors.style};`] : []),
    ...(face.descriptors.weight ? [`  font-weight: ${face.descriptors.weight};`] : []),
    `  font-display: ${face.descriptors.display};`,
    '}'
  ].join('\n')).join('\n');
}

function getFontFaceSet(win: FontFaceWindow | null | undefined): FontFaceSet | null {
  const fonts = win && win.document ? win.document.fonts : null;
  return fonts && typeof fonts.add === 'function' && typeof fonts.has === 'function'
    ? fonts
    : null;
}

function isCjkScript(value: unknown): value is CjkScript | '' {
  return value === '' || value === 'zh-Hans' || value === 'zh-Hant' || value === 'ja';
}

// The faces this page registered early, read back from the window, where
// only a FontFace made by this window's constructor counts.
function readEarlyFontFaces(win: FontFaceWindow | null | undefined): EarlyOverlayFontFaces | null {
  const FontFaceCtor = win ? win.FontFace : undefined;
  const early: unknown = win ? Reflect.get(win, EARLY_FONT_FACES_KEY) : null;
  if (typeof FontFaceCtor !== 'function' || !isRecord(early) || !Array.isArray(early.faces)) {
    return null;
  }
  const isFontFace = (value: unknown): value is FontFace => value instanceof FontFaceCtor;
  const faces: unknown[] = early.faces;
  const cjkFace = early.cjkFace;
  const cjkScript = early.cjkScript;
  if (!faces.every(isFontFace) || !(cjkFace === null || isFontFace(cjkFace)) || !isCjkScript(cjkScript)) {
    return null;
  }
  return { faces, cjkFace, cjkScript };
}

// Registers the faces, and the CJK face for `lang`, in a top-level document
// that is still loading. Returns whether it registered them.
function registerEarlyOverlayFontFaces(
  win: FontFaceWindow | null | undefined,
  options?: EarlyFontFaceOptions | null
): boolean {
  const settings = options && typeof options === 'object' ? options : {};
  const fonts = getFontFaceSet(win);
  const FontFaceCtor = win ? win.FontFace : undefined;
  const getUrl = settings.getUrl;
  if (!win || !fonts || typeof FontFaceCtor !== 'function' || typeof getUrl !== 'function' ||
      Reflect.get(win, EARLY_FONT_FACES_KEY)) {
    return false;
  }
  try {
    const faces = getOverlayFontFaces(getUrl).map((face) => (
      new FontFaceCtor(face.family, toCssSource(face.url), face.descriptors)
    ));
    const cjk = CJK_FONT_FACES.getFontFaceSource(settings.lang);
    const cjkFace = cjk
      ? new FontFaceCtor(OVERLAY_TEXT_FAMILY, cjk.source, cjk.descriptors)
      : null;
    faces.forEach((face) => fonts.add(face));
    if (cjkFace) {
      fonts.add(cjkFace);
    }
    const early: EarlyOverlayFontFaces = {
      faces,
      cjkFace,
      cjkScript: cjk ? cjk.script : ''
    };
    Reflect.set(win, EARLY_FONT_FACES_KEY, early);
    return true;
  } catch (_error) {
    // Firefox content scripts may not hand their FontFace objects to the
    // page; the overlay then declares its faces when it first opens.
    return false;
  }
}

// Whether this page still holds the faces registered early.
function hasEarlyOverlayFontFaces(win: FontFaceWindow | null | undefined): boolean {
  const early = readEarlyFontFaces(win);
  const fonts = getFontFaceSet(win);
  return Boolean(early && fonts && early.faces.every((face) => fonts.has(face)));
}

// Keeps the early CJK face when it draws the script `lang` needs. Otherwise
// removes it and returns false, so the caller installs the right one.
function keepEarlyCjkFontFace(win: FontFaceWindow | null | undefined, lang: string | null | undefined): boolean {
  const early = readEarlyFontFaces(win);
  const fonts = getFontFaceSet(win);
  const cjkFace = early ? early.cjkFace : null;
  if (!early || !cjkFace || !fonts) {
    return false;
  }
  if (early.cjkScript === CJK_FONT_FACES.resolveScript(lang) && fonts.has(cjkFace)) {
    return true;
  }
  if (typeof fonts.delete === 'function') {
    fonts.delete(cjkFace);
  }
  if (win) {
    const kept: EarlyOverlayFontFaces = { faces: early.faces, cjkFace: null, cjkScript: '' };
    Reflect.set(win, EARLY_FONT_FACES_KEY, kept);
  }
  return false;
}

export {
  EARLY_FONT_FACES_KEY,
  OVERLAY_ICON_FAMILY,
  OVERLAY_TEXT_FAMILY,
  OPEN_SANS_WEIGHT_BANDS,
  buildOverlayFontFaceCss,
  getOverlayFontFaces,
  hasEarlyOverlayFontFaces,
  keepEarlyCjkFontFace,
  registerEarlyOverlayFontFaces
};
export type { AssetUrlResolver, EarlyOverlayFontFaces, FontFaceWindow, OverlayFontFace };
