// Empty-state illustrations: small inline SVGs for "nothing here", "no
// results" and "can't load" moments, drawn in Lumno's own language: frosted
// surfaces, Remix-weight lines, placeholder bars like the theme thumbnails,
// and one Lumno-blue accent that points at what to do next.
//
// Every shape is drawn in currentColor at a few fixed opacities, the way the
// New Tab favicon draws the brand mark, so an illustration takes the ink of
// whatever it sits in, light or dark. The accent and the opacities can be
// retuned per surface with the custom properties in EMPTY_STATE_ART_CSS; the
// presentation attributes keep a sane drawing when that CSS is absent.
//
// The SVGs are built inline (no image files, no requests), so they work on
// extension pages and in content-script shadow roots alike.

const SVG_NS = 'http://www.w3.org/2000/svg';
const CLASS_PREFIX = 'lumno-empty-art';
const DEFAULT_SIZE = 120;
const VIEW_BOX = '0 0 120 120';
const ACCENT = '#4d7dcb';

// The layers every illustration is drawn from.
const ROLES = Object.freeze({
  // The soft shadow an illustration rests on.
  ground: { fill: 'currentColor', 'fill-opacity': '0.05' },
  // A frosted card or window: a faint fill under a hairline edge.
  surface: { fill: 'currentColor', 'fill-opacity': '0.05', stroke: 'currentColor', 'stroke-opacity': '0.22', 'stroke-width': '1.5' },
  // The same card, lifted: it covers what is behind it.
  raised: { fill: 'currentColor', 'fill-opacity': '0.08', stroke: 'currentColor', 'stroke-opacity': '0.26', 'stroke-width': '1.5' },
  // Placeholder text and controls.
  ghost: { fill: 'currentColor', 'fill-opacity': '0.12' },
  // Where something would be, and is not.
  dash: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.3', 'stroke-width': '1.5', 'stroke-dasharray': '4 4', 'stroke-linecap': 'round' },
  // The key glyph, at Remix line weight.
  line: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.55', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  // A quieter glyph, for sparkles and secondary marks.
  faint: { fill: 'none', stroke: 'currentColor', 'stroke-opacity': '0.3', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  // The one colored thing: the way forward.
  accent: { fill: ACCENT },
  // A glyph drawn on the accent.
  onAccent: { fill: 'none', stroke: '#ffffff', 'stroke-width': '2.25', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
});

// The Lumno mark (assets/images/lumno-newtab-favicon.svg), as its two layers.
const MARK_SHADOW = 'M14.1832 28.5107C14.7736 26.0503 17.4872 24.8712 19.8045 25.8872L29.0688 29.9483C23.1024 42.5571 20.9583 59.1892 34.0764 74.4517C35.5367 76.1508 37.0158 77.6786 38.5039 79.0511C15.0742 61.6944 10.3754 44.3784 14.1832 28.5107ZM50.1563 62.6667C55.3534 57.1072 64.2555 57.3891 69.0898 63.2669L69.4706 63.7295C65.5069 61.937 61.0203 61.3468 56.5866 62.1747L49.3526 63.5259L50.1563 62.6667Z';
const MARK_MAIN = 'M34.0761 74.4516C15.8955 53.2991 27.0297 29.5157 37.0262 17.4579C38.6314 15.5217 41.5522 15.6368 43.1924 17.5435L54.2217 30.3654C58.8053 35.6938 59.7099 43.2656 56.5107 49.524L49.3531 63.5257L56.8412 62.1274C64.6007 60.6784 72.5332 63.5719 77.5374 69.6765L83.762 77.2699C85.0646 78.859 85.0813 81.1684 83.4746 82.4491C74.4334 89.6554 52.1633 95.4955 34.0761 74.4516Z';

function sparkle(x, y, r) {
  return ['path', { role: 'faint', d: `M${x} ${y - r}v${r * 2}M${x - r} ${y}h${r * 2}` }];
}

// Each illustration is a list of [tag, attributes, children?] nodes on a
// 120 x 120 canvas. `role` picks a layer from ROLES.
const ART = {
  // A page that refuses to be framed: the preview window holds only an empty
  // frame, and its open-in-tab control (the accent) is the way through.
  blockedPage: () => [
    ['ellipse', { role: 'ground', cx: 54, cy: 102, rx: 38, ry: 4 }],
    ['rect', { role: 'surface', x: 12, y: 22, width: 76, height: 72, rx: 16 }],
    ['rect', { role: 'dash', x: 22, y: 32, width: 56, height: 52, rx: 9 }],
    ['circle', { role: 'line', cx: 50, cy: 58, r: 11 }],
    ['path', { role: 'line', d: 'M42.2 50.2l15.6 15.6' }],
    ['circle', { role: 'ghost', cx: 102, cy: 30, r: 7 }],
    ['circle', { role: 'accent', cx: 102, cy: 50, r: 9 }],
    ['path', { role: 'onAccent', d: 'M98.5 53.5l7-7M100.5 46.5h5v5' }],
    ['circle', { role: 'ghost', cx: 102, cy: 70, r: 7 }]
  ],

  // A search with nothing under it: Lumno's search pill, its caret still
  // blinking, over an empty results card.
  noResults: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 104, rx: 40, ry: 4 }],
    ['rect', { role: 'dash', x: 22, y: 58, width: 76, height: 38, rx: 12 }],
    ['rect', { role: 'ghost', x: 32, y: 70, width: 36, height: 5, rx: 2.5 }],
    ['rect', { role: 'ghost', x: 32, y: 81, width: 24, height: 5, rx: 2.5, 'fill-opacity': '0.08' }],
    ['rect', { role: 'raised', x: 12, y: 26, width: 96, height: 24, rx: 12 }],
    ['circle', { role: 'line', cx: 28, cy: 37, r: 5 }],
    ['path', { role: 'line', d: 'M32 41l3 3' }],
    ['rect', { role: 'ghost', x: 42, y: 35, width: 30, height: 5, rx: 2.5 }],
    ['rect', { role: 'accent', x: 75, y: 31, width: 2.5, height: 13, rx: 1.25 }],
    sparkle(106, 62, 4)
  ],

  // A slash command that matches nothing: the same pill, led by the / key.
  noCommands: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 104, rx: 40, ry: 4 }],
    ['rect', { role: 'dash', x: 22, y: 58, width: 76, height: 38, rx: 12 }],
    ['rect', { role: 'ghost', x: 32, y: 69, width: 9, height: 9, rx: 3 }],
    ['rect', { role: 'ghost', x: 46, y: 71, width: 28, height: 5, rx: 2.5 }],
    ['rect', { role: 'ghost', x: 32, y: 83, width: 9, height: 9, rx: 3, 'fill-opacity': '0.08' }],
    ['rect', { role: 'ghost', x: 46, y: 85, width: 20, height: 5, rx: 2.5, 'fill-opacity': '0.08' }],
    ['rect', { role: 'raised', x: 12, y: 26, width: 96, height: 24, rx: 12 }],
    ['rect', { role: 'surface', x: 20, y: 30, width: 16, height: 16, rx: 5 }],
    ['path', { role: 'line', d: 'M30 34l-4 8' }],
    ['rect', { role: 'ghost', x: 42, y: 35, width: 24, height: 5, rx: 2.5 }],
    ['rect', { role: 'accent', x: 69, y: 31, width: 2.5, height: 13, rx: 1.25 }]
  ],

  // No tabs: the switcher's stack of cards, with nothing on the top one.
  noTabs: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 104, rx: 38, ry: 4 }],
    ['path', { role: 'surface', d: 'M34 30v-2a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v2', 'fill-opacity': '0.03', 'stroke-opacity': '0.12' }],
    ['path', { role: 'surface', d: 'M24 40v-2a10 10 0 0 1 10-10h52a10 10 0 0 1 10 10v2', 'fill-opacity': '0.04', 'stroke-opacity': '0.18' }],
    ['rect', { role: 'raised', x: 16, y: 40, width: 88, height: 56, rx: 14 }],
    ['circle', { role: 'ghost', cx: 31, cy: 54, r: 5 }],
    ['rect', { role: 'ghost', x: 41, y: 51.5, width: 30, height: 5, rx: 2.5 }],
    ['rect', { role: 'dash', x: 26, y: 66, width: 68, height: 20, rx: 7 }],
    sparkle(106, 26, 4)
  ],

  // An empty bookmark folder, open, with nothing to show.
  emptyFolder: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 102, rx: 40, ry: 4 }],
    ['path', { role: 'surface', d: 'M18 50V38a8 8 0 0 1 8-8h18.5l8 8H94a8 8 0 0 1 8 8v4' }],
    ['path', { role: 'dash', d: 'M36 50v-6a5 5 0 0 1 5-5h38a5 5 0 0 1 5 5v6' }],
    ['path', { role: 'raised', d: 'M14 56a6 6 0 0 1 6-6h80a6 6 0 0 1 6 6l-4 32a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6l-4-32z' }],
    sparkle(92, 20, 4),
    sparkle(104, 34, 2.5)
  ],

  // A list with nothing in it yet; the accent row is where the first one goes.
  emptyList: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 104, rx: 38, ry: 4 }],
    ['rect', { role: 'surface', x: 16, y: 18, width: 88, height: 80, rx: 16 }],
    ['rect', { role: 'ghost', x: 28, y: 32, width: 12, height: 12, rx: 4, 'fill-opacity': '0.08' }],
    ['rect', { role: 'ghost', x: 46, y: 35.5, width: 36, height: 5, rx: 2.5, 'fill-opacity': '0.08' }],
    ['rect', { role: 'ghost', x: 28, y: 52, width: 12, height: 12, rx: 4, 'fill-opacity': '0.08' }],
    ['rect', { role: 'ghost', x: 46, y: 55.5, width: 26, height: 5, rx: 2.5, 'fill-opacity': '0.08' }],
    ['rect', { role: 'dash', x: 24, y: 70, width: 72, height: 18, rx: 9 }],
    ['circle', { role: 'accent', cx: 36, cy: 79, r: 6 }],
    ['path', { role: 'onAccent', d: 'M36 76v6M33 79h6', 'stroke-width': '1.75' }],
    ['rect', { role: 'ghost', x: 47, y: 76.5, width: 30, height: 5, rx: 2.5 }]
  ],

  // Something failed to load or sync: a cloud, switched off, with the accent
  // retry.
  loadFailed: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 104, rx: 38, ry: 4 }],
    ['path', { role: 'raised', d: 'M36 78a18 18 0 0 1-2.4-35.84A24 24 0 0 1 80 38.4 20 20 0 0 1 84 78H36z' }],
    ['path', { role: 'line', d: 'M44 44l30 30' }],
    ['circle', { role: 'accent', cx: 90, cy: 80, r: 11 }],
    ['path', { role: 'onAccent', d: 'M94.5 77.5a5 5 0 1 0 .5 4.5M95 74v4h-4' }],
    sparkle(22, 28, 3)
  ],

  // Nothing here: the Lumno mark, resting.
  nothing: () => [
    ['ellipse', { role: 'ground', cx: 60, cy: 102, rx: 34, ry: 4 }],
    ['g', { transform: 'translate(14 10) scale(0.88)' }, [
      ['path', { d: MARK_SHADOW, fill: 'currentColor', 'fill-opacity': '0.14' }],
      ['path', { d: MARK_MAIN, fill: 'currentColor', 'fill-opacity': '0.07', stroke: 'currentColor', 'stroke-opacity': '0.3', 'stroke-width': '1.7' }]
    ]],
    sparkle(98, 28, 4),
    sparkle(88, 16, 2.5)
  ]
};

export const EMPTY_STATE_ART_NAMES = Object.freeze(Object.keys(ART));

// Optional CSS: retunes the drawing per surface through custom properties.
// Inject it next to the illustration (a page stylesheet or a shadow root's
// <style>); without it the presentation attributes apply as they are.
export const EMPTY_STATE_ART_CSS = `
.${CLASS_PREFIX} {
  display: block;
  flex: none;
  overflow: visible;
  color: var(--lumno-art-ink, currentColor);
}
.${CLASS_PREFIX}__surface { fill-opacity: var(--lumno-art-surface-fill, 0.05); stroke-opacity: var(--lumno-art-edge, 0.22); }
.${CLASS_PREFIX}__raised { fill-opacity: var(--lumno-art-raised-fill, 0.08); stroke-opacity: var(--lumno-art-raised-edge, 0.26); }
.${CLASS_PREFIX}__line { stroke-opacity: var(--lumno-art-line, 0.55); }
.${CLASS_PREFIX}__accent { fill: var(--lumno-art-accent, ${ACCENT}); }
`;

function resolveAttributes(attributes) {
  const { role, ...rest } = attributes;
  if (!role) {
    return rest;
  }
  return { class: `${CLASS_PREFIX}__${role}`, ...ROLES[role], ...rest };
}

function rootAttributes(name, options) {
  const size = Number(options && options.size) || DEFAULT_SIZE;
  const label = options && options.label ? String(options.label) : '';
  const attributes = {
    xmlns: SVG_NS,
    class: `${CLASS_PREFIX} ${CLASS_PREFIX}--${name}`,
    width: size,
    height: size,
    viewBox: VIEW_BOX,
    fill: 'none',
    focusable: 'false'
  };
  if (label) {
    attributes.role = 'img';
    attributes['aria-label'] = label;
  } else {
    attributes['aria-hidden'] = 'true';
  }
  return attributes;
}

function getNodes(name) {
  const draw = Object.prototype.hasOwnProperty.call(ART, name) ? ART[name] : null;
  if (!draw) {
    throw new Error(`Unknown empty-state art: ${name}`);
  }
  return draw();
}

function buildElement(doc, tag, attributes, children) {
  const element = doc.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key !== 'xmlns') {
      element.setAttribute(key, String(value));
    }
  });
  (children || []).forEach(([childTag, childAttributes, grandchildren]) => {
    element.appendChild(buildElement(doc, childTag, resolveAttributes(childAttributes), grandchildren));
  });
  return element;
}

// The illustration as an <svg> element, built with createElementNS so it
// needs no HTML parsing (pages with Trusted Types stay happy).
// options: { size = 120, label } — without a label it is aria-hidden.
export function createEmptyStateArt(doc, name, options) {
  const ownerDocument = doc || globalThis.document;
  return buildElement(ownerDocument, 'svg', rootAttributes(name, options), getNodes(name));
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function toMarkup(tag, attributes, children) {
  const attributeText = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join('');
  const childText = (children || [])
    .map(([childTag, childAttributes, grandchildren]) => toMarkup(childTag, resolveAttributes(childAttributes), grandchildren))
    .join('');
  return childText ? `<${tag}${attributeText}>${childText}</${tag}>` : `<${tag}${attributeText}/>`;
}

// The same illustration as markup, for views that render SVG strings.
export function getEmptyStateArtMarkup(name, options) {
  return toMarkup('svg', rootAttributes(name, options), getNodes(name));
}
