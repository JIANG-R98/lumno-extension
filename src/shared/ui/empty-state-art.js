// Empty-state illustrations: small scenes for "nothing here", "no results"
// and "can't load" moments, drawn the way the utilities art on lumno.kubai.design
// is (lumno-web src/components/home/UtilityArt.astro): a pale tile with dense
// faint diagonal lines, and on it opaque Lumno surfaces (windows, cards, the
// search pill) with hairline rings, soft drops, placeholder lines, Remix icons
// and one Lumno-blue accent for the way forward.
//
// Each illustration is one self-contained <svg>: its tile pattern, shadows and
// colors live inside it, scoped to its own id, so it renders the same on an
// extension page and in a content script's shadow root, needs no stylesheet
// and makes no requests. Colors follow the theme: "light", "dark", or "auto"
// (the system setting). A surface may re-point the accent and the tile color
// with --lumno-art-accent(-dark) and --lumno-art-tile(-dark).

const SVG_NS = 'http://www.w3.org/2000/svg';
const CLASS_PREFIX = 'lumno-empty-art';
const WIDTH = 160;
const HEIGHT = 120;
const THEMES = ['light', 'dark', 'auto'];

// Remix Icon 4 outlines (assets/remixicon/fonts), on their 24 x 24 grid.
const ICONS = {
  close: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  externalLink: 'M10 6V8H5V19H16V14H18V20Q18 20.42 17.71 20.71Q17.42 21 17 21H4Q3.58 21 3.29 20.71Q3 20.42 3 20V7Q3 6.58 3.29 6.29Q3.58 6 4 6ZM21 3V11H19V6.42L11.2 14.2L9.8 12.8L17.58 5H13V3Z',
  copy: 'M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3c0 .552-.45 1-1.007 1H4.007A1.001 1.001 0 0 1 3 21l.003-14c0-.552.45-1 1.007-1H7zM5.003 8L5 20h10V8H5.003zM9 6h8v10h2V4H9v2z',
  forbid: 'M12 22Q9.96 22 8.1 21.22Q6.32 20.46 4.93 19.07Q3.54 17.68 2.78 15.9Q2 14.04 2 12Q2 9.96 2.78 8.1Q3.54 6.32 4.93 4.93Q6.32 3.54 8.1 2.78Q9.96 2 12 2Q14.04 2 15.9 2.78Q17.68 3.54 19.07 4.93Q20.46 6.32 21.22 8.1Q22 9.96 22 12Q22 14.04 21.22 15.9Q20.46 17.68 19.07 19.07Q17.68 20.46 15.9 21.22Q14.04 22 12 22ZM12 20Q14.18 20 16.04 18.9Q17.84 17.84 18.9 16.04Q20 14.18 20 12Q20 9.82 18.9 7.96Q17.84 6.16 16.04 5.1Q14.18 4 12 4Q9.82 4 7.96 5.1Q6.16 6.16 5.1 7.96Q4 9.82 4 12Q4 14.18 5.1 16.04Q6.16 17.84 7.96 18.9Q9.82 20 12 20ZM8.52 7.1 16.9 15.48Q16.6 15.88 16.24 16.24Q15.88 16.6 15.48 16.9L7.1 8.52Q7.4 8.12 7.76 7.76Q8.12 7.4 8.52 7.1Z',
  search: 'M17.88 16.46 22.16 20.74 20.74 22.16 16.46 17.88Q15.28 18.82 13.88 19.32Q12.4 19.84 10.84 19.84Q8.4 19.84 6.3 18.62Q4.26 17.42 3.08 15.38Q1.84 13.28 1.84 10.84Q1.84 8.4 3.08 6.3Q4.26 4.26 6.3 3.08Q8.4 1.84 10.84 1.84Q13.28 1.84 15.38 3.08Q17.42 4.26 18.62 6.3Q19.84 8.4 19.84 10.84Q19.84 12.4 19.32 13.88Q18.82 15.28 17.88 16.46ZM15.86 15.72Q16.8 14.76 17.32 13.52Q17.84 12.24 17.84 10.84Q17.84 8.94 16.88 7.3Q15.96 5.72 14.38 4.8Q12.74 3.84 10.84 3.84Q8.94 3.84 7.3 4.8Q5.72 5.72 4.8 7.3Q3.84 8.94 3.84 10.84Q3.84 12.74 4.8 14.38Q5.72 15.96 7.3 16.88Q8.94 17.84 10.84 17.84Q12.24 17.84 13.52 17.32Q14.76 16.8 15.72 15.86Z',
  add: 'M11 11V5H13V11H19V13H13V19H11V13H5V11Z',
  folder: 'M22 8V20Q22 20.42 21.71 20.71Q21.42 21 21 21H3Q2.58 21 2.29 20.71Q2 20.42 2 20V7H21Q21.42 7 21.71 7.29Q22 7.58 22 8ZM12.42 5H2V4Q2 3.58 2.29 3.29Q2.58 3 3 3H10.42Z',
  refresh: 'M5.46 4.44Q6.8 3.28 8.46 2.64Q10.16 2 12 2Q14.04 2 15.9 2.78Q17.68 3.54 19.07 4.93Q20.46 6.32 21.22 8.1Q22 9.96 22 12Q22 13.58 21.52 15.06Q21.06 16.5 20.18 17.74L17 12H20Q20 9.82 18.9 7.96Q17.84 6.16 16.04 5.1Q14.18 4 12 4Q10.42 4 8.96 4.6Q7.56 5.18 6.46 6.22ZM18.54 19.56Q17.2 20.72 15.54 21.36Q13.84 22 12 22Q9.96 22 8.1 21.22Q6.32 20.46 4.93 19.07Q3.54 17.68 2.78 15.9Q2 14.04 2 12Q2 10.42 2.48 8.94Q2.94 7.5 3.82 6.26L7 12H4Q4 14.18 5.1 16.04Q6.16 17.84 7.96 18.9Q9.82 20 12 20Q13.58 20 15.04 19.4Q16.44 18.82 17.54 17.78Z',
  cloudOff: 'M3.52 1.8 22.6 20.88 21.2 22.3 19.18 20.28Q18.14 20.7 17 20.7H7Q5.38 20.7 3.98 19.88Q2.62 19.08 1.82 17.72Q1 16.32 1 14.7Q1 13.42 1.51 12.27Q2.02 11.12 2.93 10.28Q3.84 9.44 5 9.04V8.7Q5 7.54 5.36 6.48L2.1 3.22ZM7 8.7Q7 8.82 7 8.94L7.08 10.42L5.68 10.92Q4.48 11.34 3.74 12.38Q3 13.42 3 14.7Q3 15.78 3.54 16.7Q4.08 17.62 5 18.16Q5.92 18.7 7 18.7H17Q17.28 18.7 17.54 18.66L7.04 8.14Q7 8.42 7 8.7ZM12 1.7Q13.9 1.7 15.54 2.66Q17.12 3.58 18.04 5.16Q19 6.8 19 8.7V9.04Q20.16 9.44 21.07 10.28Q21.98 11.12 22.49 12.27Q23 13.42 23 14.7Q23 16.3 22.2 17.68L20.72 16.2Q21 15.48 21 14.7Q21 13.6 20.46 12.69Q19.92 11.78 19 11.24Q18.08 10.7 17 10.7Q16.22 10.7 15.5 10.98L14.02 9.5Q15.4 8.7 17 8.7Q17 7.34 16.33 6.19Q15.66 5.04 14.51 4.37Q13.36 3.7 12 3.7Q10.42 3.7 9.12 4.6L7.7 3.18Q8.6 2.46 9.7 2.08Q10.8 1.7 12 1.7Z',
  inbox: 'M4.02 3.78Q4.1 3.44 4.37 3.22Q4.64 3 5 3H19Q19.36 3 19.63 3.22Q19.9 3.44 19.98 3.78L21.98 12.78Q22 12.9 22 13V20Q22 20.42 21.71 20.71Q21.42 21 21 21H3Q2.58 21 2.29 20.71Q2 20.42 2 20V13Q2 12.9 2.02 12.78ZM5.8 5 4.24 12H9Q9 12.82 9.4 13.51Q9.8 14.2 10.49 14.6Q11.18 15 12 15Q12.82 15 13.51 14.6Q14.2 14.2 14.6 13.51Q15 12.82 15 12H19.76L18.2 5ZM16.58 14Q16 15.34 14.76 16.17Q13.52 17 12 17Q10.48 17 9.24 16.17Q8 15.34 7.42 14H4V19H20V14Z',
  file: 'M21 8V21Q21 21.42 20.71 21.71Q20.42 22 20 22H4Q3.58 22 3.29 21.71Q3 21.42 3 21V3Q3 2.58 3.29 2.29Q3.58 2 4 2H15ZM19 9H14V4H5V20H19Z',
  globe: 'M12 22Q9.96 22 8.1 21.22Q6.32 20.46 4.93 19.07Q3.54 17.68 2.78 15.9Q2 14.04 2 12Q2 9.96 2.78 8.1Q3.54 6.32 4.93 4.93Q6.32 3.54 8.1 2.78Q9.96 2 12 2Q14.04 2 15.9 2.78Q17.68 3.54 19.07 4.93Q20.46 6.32 21.22 8.1Q22 9.96 22 12Q22 14.04 21.22 15.9Q20.46 17.68 19.07 19.07Q17.68 20.46 15.9 21.22Q14.04 22 12 22ZM9.72 19.66Q8.22 16.5 8.02 13H4.06Q4.26 14.56 5.03 15.92Q5.8 17.28 7.01 18.25Q8.22 19.22 9.72 19.66ZM10.04 13Q10.26 16.6 12 19.76Q13.74 16.6 13.96 13ZM19.94 13H15.98Q15.78 16.5 14.3 19.66Q15.78 19.22 16.99 18.25Q18.2 17.28 18.97 15.92Q19.74 14.56 19.94 13ZM4.06 11H8.02Q8.22 7.5 9.72 4.34Q8.22 4.78 7.01 5.75Q5.8 6.72 5.03 8.08Q4.26 9.44 4.06 11ZM10.04 11H13.96Q13.74 7.4 12 4.24Q10.26 7.4 10.04 11ZM14.3 4.34Q15.78 7.5 15.98 11H19.94Q19.74 9.44 18.97 8.08Q18.2 6.72 16.99 5.75Q15.78 4.78 14.3 4.34Z'
};

// The palette, from the site's art (light) and Lumno's dark surfaces.
const LIGHT = {
  tile: 'var(--lumno-art-tile, #fafafa)',
  hatch: 'rgba(15, 23, 42, 0.05)',
  edge: 'rgba(15, 23, 42, 0.07)',
  surface: '#ffffff',
  behind: '#f3f3f4',
  ring: 'rgba(47, 42, 34, 0.08)',
  drop: 'rgb(47, 42, 34)',
  dropOpacity: '0.13',
  strip: '#eef1f5',
  slot: '#f1f3f6',
  line: '#e5e9ef',
  strong: '#cdd4de',
  icon: '#a3abb7',
  ink: '#6b7280',
  accent: 'var(--lumno-art-accent, #3462ad)',
  keyTop: '#404859',
  keyBottom: '#273042'
};
const DARK = {
  tile: 'var(--lumno-art-tile-dark, #26262b)',
  hatch: 'rgba(255, 255, 255, 0.035)',
  edge: 'rgba(255, 255, 255, 0.07)',
  surface: '#323238',
  behind: '#2b2b30',
  ring: 'rgba(255, 255, 255, 0.08)',
  drop: 'rgb(0, 0, 0)',
  dropOpacity: '0.36',
  strip: '#2a2a2f',
  slot: '#2b2b31',
  line: '#3f3f47',
  strong: '#52525b',
  icon: '#7d828c',
  ink: '#a1a1aa',
  accent: 'var(--lumno-art-accent-dark, #7ea6ea)',
  keyTop: '#5a6375',
  keyBottom: '#3b4354'
};

// Building blocks. Every scene is a list of [tag, attributes, children?]
// nodes on a 160 x 120 canvas; `paint` picks a color class.
function icon(name, cx, cy, size, paint) {
  const scale = size / 24;
  return ['path', {
    paint: paint || 'icon',
    d: ICONS[name],
    transform: `translate(${cx - size / 2} ${cy - size / 2}) scale(${scale})`
  }];
}

function line(x, y, width, strong) {
  const height = strong ? 5 : 4;
  return ['rect', { paint: strong ? 'strong' : 'line', x, y, width, height, rx: height / 2 }];
}

// A card or window: an opaque surface with a ring and a soft drop.
function surface(x, y, width, height, rx, extra) {
  return ['rect', { paint: 'surface', shadow: 'drop', x, y, width, height, rx, ...extra }];
}

// A browser window with a tab strip; `tab` draws one active tab.
function browserWindow(x, y, width, height, options) {
  const config = options || {};
  const strip = 18;
  const nodes = [
    surface(x, y, width, height, 10),
    ['path', {
      paint: 'strip',
      d: `M${x + 0.5} ${y + strip}V${y + 10}a9.5 9.5 0 0 1 9.5-9.5H${x + width - 10}a9.5 9.5 0 0 1 9.5 9.5V${y + strip}Z`
    }]
  ];
  if (config.tab !== false) {
    const tx = x + 6;
    nodes.push(
      ['path', { paint: 'surface', d: `M${tx} ${y + strip}V${y + 9}a5 5 0 0 1 5-5h36a5 5 0 0 1 5 5V${y + strip}Z` }],
      icon('globe', tx + 9, y + 11.5, 8),
      ['rect', { paint: 'strong', x: tx + 17, y: y + 10, width: 24, height: 3, rx: 1.5 }]
    );
  }
  return nodes;
}

// A round control like the link preview's buttons beside its window.
function control(cx, cy, r, name, accent) {
  return [
    ['circle', { paint: accent ? 'accent' : 'surface', shadow: 'lift', cx, cy, r, class: accent ? 'pop' : undefined }],
    icon(name, cx, cy, r * 1.05, accent ? 'onAccent' : 'ink')
  ];
}

// What the empty search list says: its icon and a line where the words go.
function emptyRow(cx, cy, width) {
  const start = cx - (10 + 5 + width) / 2;
  return [icon('file', start + 5, cy, 10), line(start + 15, cy - 2, width)];
}

function searchPill(lead) {
  return [
    surface(16, 24, 128, 24, 12),
    ...lead,
    ['rect', { paint: 'accent', class: 'pop', x: lead.caret, y: 30, width: 1.6, height: 12, rx: 0.8 }]
  ];
}

const ART = {
  // A page that refuses to be framed: the preview window shows only a
  // stop sign, and beside it the open-in-tab control is the way through.
  blockedPage: () => [
    ...browserWindow(18, 20, 100, 80),
    icon('forbid', 68, 63, 22),
    line(48, 81, 40),
    ...control(132, 29, 8.5, 'close'),
    ...control(132, 52, 10, 'externalLink', true),
    ...control(132, 75, 8.5, 'copy')
  ],

  // A search with nothing under it: the search pill, caret still in it,
  // over a list that holds only the empty row.
  noResults: () => {
    const lead = [icon('search', 29, 36, 11, 'ink'), line(40, 33.5, 38, true)];
    lead.caret = 82;
    return [...searchPill(lead), surface(26, 56, 108, 40, 11), ...emptyRow(80, 76, 44)];
  },

  // A slash command that matches nothing: the pill led by the / key.
  noCommands: () => {
    const lead = [
      ['rect', { paint: 'key', x: 22, y: 29, width: 14, height: 14, rx: 4 }],
      ['path', { paint: 'onAccentLine', d: 'M31 32.5l-4 7' }],
      line(42, 33.5, 30, true)
    ];
    lead.caret = 76;
    return [...searchPill(lead), surface(26, 56, 108, 40, 11), ...emptyRow(80, 76, 44)];
  },

  // No tabs: a window whose strip has only a place for one, and the plus.
  noTabs: () => [
    ...browserWindow(22, 22, 116, 76, { tab: false }),
    ['path', { paint: 'dash', d: 'M28.5 40V31a5 5 0 0 1 5-5h35a5 5 0 0 1 5 5v9' }],
    icon('add', 84, 33, 10, 'ink'),
    ['rect', { paint: 'slot', x: 32, y: 50, width: 96, height: 38, rx: 7 }]
  ],

  // An empty bookmark folder: its card, title and tiles with nothing in them.
  emptyFolder: () => [
    ['rect', { paint: 'behind', x: 36, y: 20, width: 88, height: 40, rx: 12 }],
    surface(26, 26, 108, 74, 13),
    icon('folder', 40, 40, 12, 'accent'),
    line(51, 37.5, 40, true),
    ...[0, 1, 2, 3].map((i) => ['rect', { paint: 'slot', x: 34 + i * 24, y: 54, width: 20, height: 18, rx: 5 }]),
    ...[0, 1, 2, 3].map((i) => ['rect', { paint: 'slot', x: 34 + i * 24, y: 76, width: 20, height: 18, rx: 5, opacity: 0.6 }])
  ],

  // A settings list with nothing added yet, and its add button.
  emptyList: () => [
    surface(20, 22, 120, 76, 13),
    line(32, 33.5, 44, true),
    ['rect', { paint: 'key', class: 'pop', x: 104, y: 30, width: 24, height: 12, rx: 6 }],
    icon('add', 116, 36, 9, 'onAccent'),
    ['rect', { paint: 'strip', x: 20, y: 49, width: 120, height: 1 }],
    icon('inbox', 80, 68, 16),
    line(60, 82, 40)
  ],

  // Something failed to load or sync: a window with the cloud cut off, and
  // the retry badge.
  loadFailed: () => [
    ...browserWindow(24, 19, 100, 74),
    icon('cloudOff', 74, 60, 22),
    line(57, 77, 34),
    ['circle', { paint: 'surface', shadow: 'lift', class: 'pop', cx: 122, cy: 87, r: 13 }],
    icon('refresh', 122, 87, 14, 'accent')
  ],

  // Nothing here: a card with an empty tray.
  nothing: () => [
    ['rect', { paint: 'behind', x: 34, y: 23, width: 92, height: 40, rx: 12 }],
    surface(24, 29, 112, 68, 13),
    icon('inbox', 80, 54, 18),
    line(58, 70, 44, true),
    line(65, 80, 30)
  ]
};

export const EMPTY_STATE_ART_NAMES = Object.freeze(Object.keys(ART));

const PAINTS = {
  surface: (id) => `fill: var(--${id}-surface); stroke: var(--${id}-ring); stroke-width: 1px;`,
  behind: (id) => `fill: var(--${id}-behind); stroke: var(--${id}-ring); stroke-width: 1px;`,
  strip: (id) => `fill: var(--${id}-strip);`,
  slot: (id) => `fill: var(--${id}-slot);`,
  line: (id) => `fill: var(--${id}-line);`,
  strong: (id) => `fill: var(--${id}-strong);`,
  icon: (id) => `fill: var(--${id}-icon);`,
  ink: (id) => `fill: var(--${id}-ink);`,
  accent: (id) => `fill: var(--${id}-accent);`,
  key: (id) => `fill: url(#${id}-key);`,
  onAccent: () => 'fill: #ffffff;',
  onAccentLine: () => 'fill: none; stroke: #ffffff; stroke-width: 1.6px; stroke-linecap: round;',
  dash: (id) => `fill: none; stroke: var(--${id}-strong); stroke-width: 1.2px; stroke-dasharray: 3 3;`
};

function paletteRules(id, palette) {
  return Object.entries(palette)
    .map(([key, value]) => `--${id}-${key}: ${value};`)
    .join(' ');
}

function buildStyle(id) {
  const self = `#${id}`;
  const paints = Object.entries(PAINTS)
    .map(([name, rule]) => `${self} .p-${name} { ${rule(id)} }`)
    .join('\n');
  return `
${self} { ${paletteRules(id, LIGHT)} }
${self}[data-theme="dark"] { ${paletteRules(id, DARK)} }
@media (prefers-color-scheme: dark) {
  ${self}[data-theme="auto"] { ${paletteRules(id, DARK)} }
}
${self} .tile { fill: var(--${id}-tile); }
${self} .hatch { stroke: var(--${id}-hatch); }
${self} .edge { stroke: var(--${id}-edge); }
${self} .drop { flood-color: var(--${id}-drop); flood-opacity: var(--${id}-dropOpacity); }
${self} .key-top { stop-color: var(--${id}-keyTop); }
${self} .key-bottom { stop-color: var(--${id}-keyBottom); }
${paints}
@media (prefers-reduced-motion: no-preference) {
  ${self} .pop { transform-box: fill-box; transform-origin: center; animation: ${CLASS_PREFIX}-pop 460ms cubic-bezier(0.34, 1.4, 0.64, 1) 160ms both; }
}
@keyframes ${CLASS_PREFIX}-pop { from { opacity: 0; transform: scale(0.4); } }
`;
}

// A drop shadow under the shape. Built from primitives every HTML parser
// knows by name (feDropShadow comes out lowercased from some), so the markup
// form renders the same as the element.
function shadowFilter(id, dy, blur, start, size) {
  return ['filter', { id, x: start, y: start, width: size, height: size }, [
    ['feGaussianBlur', { in: 'SourceAlpha', stdDeviation: blur }],
    ['feOffset', { dy, result: 'blur' }],
    ['feFlood', { class: 'drop' }],
    ['feComposite', { in2: 'blur', operator: 'in' }],
    ['feMerge', {}, [['feMergeNode', {}], ['feMergeNode', { in: 'SourceGraphic' }]]]
  ]];
}

// The tile, its pattern and the shared shadows and gradient.
function frame(id) {
  return [
    ['defs', {}, [
      ['pattern', { id: `${id}-hatch`, width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
        ['line', { class: 'hatch', x1: 0.5, y1: 0, x2: 0.5, y2: 7, 'stroke-width': 1 }]
      ]],
      shadowFilter(`${id}-drop`, 5, 4.5, '-30%', '160%'),
      shadowFilter(`${id}-lift`, 2.5, 2.5, '-50%', '200%'),
      ['linearGradient', { id: `${id}-key`, x1: 0, y1: 0, x2: 0, y2: 1 }, [
        ['stop', { class: 'key-top', offset: 0 }],
        ['stop', { class: 'key-bottom', offset: 1 }]
      ]]
    ]],
    ['rect', { class: 'tile', x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 18 }],
    ['rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 18, fill: `url(#${id}-hatch)` }],
    ['rect', { class: 'edge', x: 0.5, y: 0.5, width: WIDTH - 1, height: HEIGHT - 1, rx: 17.5, fill: 'none', 'stroke-width': 1 }]
  ];
}

function resolveAttributes(id, attributes) {
  const { paint, shadow, class: className, ...rest } = attributes;
  const classes = [paint ? `p-${paint}` : '', className || ''].filter(Boolean).join(' ');
  const resolved = { ...rest };
  if (classes) {
    resolved.class = classes;
  }
  if (shadow) {
    resolved.filter = `url(#${id}-${shadow})`;
  }
  return resolved;
}

function getScene(name) {
  const draw = Object.prototype.hasOwnProperty.call(ART, name) ? ART[name] : null;
  if (!draw) {
    throw new Error(`Unknown empty-state art: ${name}`);
  }
  return draw();
}

function createId() {
  return `${CLASS_PREFIX}-${Math.random().toString(36).slice(2, 10)}`;
}

function describe(name, options) {
  const config = options || {};
  const id = config.id ? String(config.id) : createId();
  const width = Number(config.size) || WIDTH;
  const theme = THEMES.includes(config.theme) ? config.theme : 'auto';
  const label = config.label ? String(config.label) : '';
  const attributes = {
    xmlns: SVG_NS,
    id,
    class: `${CLASS_PREFIX} ${CLASS_PREFIX}--${name}`,
    'data-theme': theme,
    width,
    height: Math.round(width * HEIGHT / WIDTH * 100) / 100,
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    fill: 'none',
    focusable: 'false'
  };
  if (label) {
    attributes.role = 'img';
    attributes['aria-label'] = label;
  } else {
    attributes['aria-hidden'] = 'true';
  }
  return { id, attributes, children: [...frame(id), ...getScene(name)], style: buildStyle(id) };
}

function buildElement(doc, id, tag, attributes, children) {
  const element = doc.createElementNS(SVG_NS, tag);
  Object.entries(resolveAttributes(id, attributes)).forEach(([key, value]) => {
    if (key !== 'xmlns' && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  });
  (children || []).forEach(([childTag, childAttributes, grandchildren]) => {
    element.appendChild(buildElement(doc, id, childTag, childAttributes, grandchildren));
  });
  return element;
}

// The illustration as an <svg> element, built with createElementNS so it
// needs no HTML parsing (pages with Trusted Types stay happy).
// options: { size = 160 (width; height keeps 4:3), theme = 'auto', label, id }
// Without a label it is aria-hidden.
export function createEmptyStateArt(doc, name, options) {
  const ownerDocument = doc || globalThis.document;
  const { id, attributes, children, style } = describe(name, options);
  const svg = buildElement(ownerDocument, id, 'svg', attributes, []);
  const styleElement = ownerDocument.createElementNS(SVG_NS, 'style');
  styleElement.textContent = style;
  svg.appendChild(styleElement);
  children.forEach(([tag, childAttributes, grandchildren]) => {
    svg.appendChild(buildElement(ownerDocument, id, tag, childAttributes, grandchildren));
  });
  return svg;
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toMarkup(id, tag, attributes, children) {
  const attributeText = Object.entries(resolveAttributes(id, attributes))
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}="${escapeText(value)}"`)
    .join('');
  const childText = (children || [])
    .map(([childTag, childAttributes, grandchildren]) => toMarkup(id, childTag, childAttributes, grandchildren))
    .join('');
  return childText ? `<${tag}${attributeText}>${childText}</${tag}>` : `<${tag}${attributeText}/>`;
}

// The same illustration as markup, for views that render SVG strings.
export function getEmptyStateArtMarkup(name, options) {
  const { id, attributes, children, style } = describe(name, options);
  const svg = toMarkup(id, 'svg', attributes, children);
  const open = svg.indexOf('>') + 1;
  // The style holds no markup characters, so it goes in as it is.
  return `${svg.slice(0, open)}<style>${style}</style>${svg.slice(open)}`;
}
