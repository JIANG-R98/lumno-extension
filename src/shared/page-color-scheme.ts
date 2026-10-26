type PageTheme = 'dark' | 'light';
type RgbColor = [number, number, number];

function toRgb(channels: number[]): RgbColor | null {
  if (channels.length !== 3 || !channels.every((value) => Number.isFinite(value))) {
    return null;
  }
  const [red, green, blue] = channels;
  return [red, green, blue];
}

// The red, green and blue of a hex or rgb()/rgba() color; null for any other
// form and for a fully transparent color.
function parseCssColor(color: unknown): RgbColor | null {
  if (!color || typeof color !== 'string') {
    return null;
  }
  const trimmed = color.trim().toLowerCase();
  if (!trimmed || trimmed === 'transparent') {
    return null;
  }
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return toRgb(hex.split('').map((value) => parseInt(value + value, 16)));
    }
    if (hex.length === 6) {
      return toRgb([hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((value) => parseInt(value, 16)));
    }
    return null;
  }
  const functionMatch = trimmed.match(/^rgba?\(([\s\S]+)\)$/);
  if (!functionMatch) {
    return null;
  }
  const parts = functionMatch[1]
    .replace(/\//g, ' ')
    .replace(/,/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }
  const channels = parts.slice(0, 3).map((part) => {
    if (part.endsWith('%')) {
      return Math.round(Number(part.slice(0, -1)) * 2.55);
    }
    return Math.round(Number(part));
  });
  const alpha = parts.length >= 4 ? Number(parts[3]) : 1;
  if (!Number.isFinite(alpha) || alpha <= 0) {
    return null;
  }
  return toRgb(channels.map((value) => Math.max(0, Math.min(255, value))));
}

function getLuminance(rgb: RgbColor): number {
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function themeFromColor(color: unknown): PageTheme | null {
  const rgb = parseCssColor(color);
  if (!rgb) {
    return null;
  }
  return getLuminance(rgb) < 0.42 ? 'dark' : 'light';
}

const THEME_ATTRIBUTES = [
  'data-theme',
  'data-color-scheme',
  'data-color-mode',
  'data-mode',
  'data-appearance',
  'color-scheme',
  'theme',
  'data-bs-theme'
];

interface PageParts {
  doc: Document;
  win: Window;
  docEl: HTMLElement;
  body: HTMLElement | null;
}

function themeFromFlagAttributes({ docEl, body }: PageParts): PageTheme | null {
  if (docEl.hasAttribute('dark') || (body && body.hasAttribute('dark'))) {
    return 'dark';
  }
  if (docEl.hasAttribute('light') || (body && body.hasAttribute('light'))) {
    return 'light';
  }
  return null;
}

function themeFromAttributeValue(value: string): PageTheme | null {
  if (value.includes('dark') || value.includes('night') || value === '1' || value === 'true' || value === 'on') {
    return 'dark';
  }
  if (value.includes('light') || value.includes('day') || value === '0' || value === 'false' || value === 'off') {
    return 'light';
  }
  return null;
}

function themeFromThemeAttributes({ docEl, body }: PageParts): PageTheme | null {
  const elements = body ? [docEl, body] : [docEl];
  for (const element of elements) {
    for (const name of THEME_ATTRIBUTES) {
      const value = String(element.getAttribute(name) || '').toLowerCase();
      const theme = value ? themeFromAttributeValue(value) : null;
      if (theme) {
        return theme;
      }
    }
  }
  return null;
}

function themeFromYoutubeRoot({ doc }: PageParts): PageTheme | null {
  return doc.querySelector('ytd-app[dark], ytm-app[dark]') ? 'dark' : null;
}

function themeFromClassText(classText: string): PageTheme | null {
  const tokenList = classText.split(/\s+/);
  if (tokenList.includes('dark')) {
    return 'dark';
  }
  if (tokenList.includes('light')) {
    return 'light';
  }
  if (/(^|[\s_-])(dark|darkmode|dark-theme|theme-dark|night)([\s_-]|$)/.test(classText)) {
    return 'dark';
  }
  if (/(^|[\s_-])(light|lightmode|light-theme|theme-light|day)([\s_-]|$)/.test(classText)) {
    return 'light';
  }
  return null;
}

function themeFromClasses({ docEl, body }: PageParts): PageTheme | null {
  const classTokens = [docEl.className || '', body ? body.className || '' : ''];
  for (const className of classTokens) {
    const theme = themeFromClassText(String(className || '').toLowerCase());
    if (theme) {
      return theme;
    }
  }
  return null;
}

function themeFromBackground({ win, docEl, body }: PageParts): PageTheme | null {
  const bodyStyle = body ? win.getComputedStyle(body) : null;
  const docStyle = win.getComputedStyle(docEl);
  const bgColor = bodyStyle && themeFromColor(bodyStyle.backgroundColor)
    ? bodyStyle.backgroundColor
    : docStyle.backgroundColor;
  return themeFromColor(bgColor);
}

function themeFromThemeColorMeta({ doc }: PageParts): PageTheme | null {
  const themeColorMeta = doc.querySelector('meta[name="theme-color"]');
  return themeColorMeta ? themeFromColor(String(themeColorMeta.getAttribute('content') || '').trim()) : null;
}

// A color-scheme naming only one of dark and light.
function themeFromSchemeText(text: string): PageTheme | null {
  if (text.includes('dark') && !text.includes('light')) {
    return 'dark';
  }
  if (text.includes('light') && !text.includes('dark')) {
    return 'light';
  }
  return null;
}

function themeFromColorSchemeMeta({ doc }: PageParts): PageTheme | null {
  const colorSchemeMeta = doc.querySelector('meta[name="color-scheme"]');
  return colorSchemeMeta
    ? themeFromSchemeText(String(colorSchemeMeta.getAttribute('content') || '').toLowerCase())
    : null;
}

function themeFromComputedScheme({ win, docEl }: PageParts): PageTheme | null {
  return themeFromSchemeText((win.getComputedStyle(docEl).colorScheme || '').toLowerCase());
}

// The signals in the order they are trusted.
const THEME_SIGNALS: Array<(parts: PageParts) => PageTheme | null> = [
  themeFromFlagAttributes,
  themeFromThemeAttributes,
  themeFromYoutubeRoot,
  themeFromClasses,
  themeFromBackground,
  themeFromThemeColorMeta,
  themeFromColorSchemeMeta,
  themeFromComputedScheme
];

// Guesses whether a web page is light or dark from its theme attributes,
// classes, background, theme-color and color-scheme, so the surfaces Lumno
// draws over the page (tab switcher, toasts) can match it. Returns null when
// the page gives no signal.
function detectPageTheme(documentRef?: Document | null, windowRef?: Window | null): PageTheme | null {
  const doc = documentRef || globalThis.document;
  const win = windowRef || globalThis.window;
  if (!doc || !win || !doc.documentElement) {
    return null;
  }
  const parts: PageParts = { doc, win, docEl: doc.documentElement, body: doc.body };
  for (const signal of THEME_SIGNALS) {
    const theme = signal(parts);
    if (theme) {
      return theme;
    }
  }
  return null;
}

export type { PageTheme };
export { detectPageTheme };
