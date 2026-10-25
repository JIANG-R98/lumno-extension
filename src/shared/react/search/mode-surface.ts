// What the search input's mode tag, Tab hint and scope panel share: the
// surface they sit on and its colors, the text stack, and the attributes
// that keep translation tools away from their labels.

export type ModeSurface = 'newtab' | 'overlay';

// The text stack tokens.css defines for New Tab and onboarding, and the
// overlay panel defines and swaps for the chosen font.
export const FONT_STACK = 'var(--lumno-font-sans, sans-serif)';

export const NO_TRANSLATE = {
  'data-no-translate': 'true',
  lang: 'zxx',
  notranslate: '',
  translate: 'no'
} as const;

// Each surface's custom properties, with fallbacks for before its
// stylesheet loads.
export const SURFACE_VARS = Object.freeze({
  overlay: {
    tagBackground: 'var(--x-ov-tag-bg, #F3F4F6)',
    tagText: 'var(--x-ov-tag-text, #6B7280)',
    border: 'var(--x-ov-border, rgba(0, 0, 0, 0.08))',
    panelBackground: 'var(--x-ov-mode-menu-bg, #FFFFFF)',
    text: 'var(--x-ov-text, #111827)',
    shadow: 'var(--x-ov-shadow, 0 16px 40px rgba(15, 23, 42, 0.13))',
    radius: 'var(--x-ov-panel-radius, 26px)',
    // The space between the input and the panel, and how far the panel
    // reaches past the input's sides.
    gap: '14px',
    edge: '-1px'
  },
  newtab: {
    tagBackground: 'var(--x-nt-tag-bg, #F3F4F6)',
    tagText: 'var(--x-nt-tag-text, #6B7280)',
    border: 'var(--x-nt-surface-border, var(--x-nt-panel-border, rgba(0, 0, 0, 0.08)))',
    panelBackground: 'var(--x-nt-mode-menu-bg, #FFFFFF)',
    text: 'var(--x-nt-text, #111827)',
    shadow: 'var(--x-nt-panel-shadow-focus, 0 16px 40px rgba(15, 23, 42, 0.13))',
    radius: 'var(--x-nt-search-shell-radius, 26px)',
    gap: '18px',
    edge: '-6px'
  }
});
