const assert = require('assert');
const plate = require('../../src/newtab/shortcuts/shortcut-icon-plate.js');

// See-through artwork gets a plate tinted from its main color; icons that
// bring their own square, a rounded one included, do not.

const SIZE = plate.SAMPLE_SIZE;

function createPixels(paint) {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const color = paint(x, y);
      if (!color) continue;
      const offset = ((y * SIZE) + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color.length > 3 ? color[3] : 255;
    }
  }
  return data;
}

const ORANGE = [238, 77, 45];
const WHITE = [255, 255, 255];
const BLACK = [17, 17, 17];

function insideRoundedSquare(x, y, inset, radius) {
  const min = inset;
  const max = SIZE - 1 - inset;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  return ((x - cx) ** 2) + ((y - cy) ** 2) <= radius ** 2;
}

function testBareLogoIsTransparentAndKeepsItsColor() {
  // An orange bag with a white letter, floating on transparency.
  const analysis = plate.analyzePixels(createPixels((x, y) => {
    if (!insideRoundedSquare(x, y, 6, 3)) return null;
    return x > 13 && x < 18 && y > 10 && y < 22 ? WHITE : ORANGE;
  }), SIZE);
  assert.strictEqual(analysis.transparent, true);
  assert.deepStrictEqual(analysis.accent, ORANGE, 'the white letter does not wash out the main color');
  assert.deepStrictEqual(analysis.palette, [ORANGE], 'white detail is offered as its own choice, not from the palette');
}

function testRoundedSquareIconIsOpaque() {
  const analysis = plate.analyzePixels(createPixels((x, y) => (
    insideRoundedSquare(x, y, 0, 7) ? ORANGE : null
  )), SIZE);
  assert.strictEqual(analysis.transparent, false, 'clear corners alone do not make an icon see-through');
}

function testFullBleedAndEmptyImages() {
  assert.strictEqual(plate.analyzePixels(createPixels(() => WHITE), SIZE).transparent, false);
  const empty = plate.analyzePixels(createPixels(() => null), SIZE);
  assert.strictEqual(empty.transparent, false, 'nothing to show needs no plate');
  assert.strictEqual(empty.accent, null);
  assert.strictEqual(plate.analyzePixels(new Uint8ClampedArray(4), SIZE), null);
}

function testRoundBadgeGetsAPlate() {
  const center = (SIZE - 1) / 2;
  const analysis = plate.analyzePixels(createPixels((x, y) => (
    ((x - center) ** 2) + ((y - center) ** 2) <= (SIZE / 2) ** 2 ? [91, 80, 214] : null
  )), SIZE);
  assert.strictEqual(analysis.transparent, true);
}

function parseRgb(css) {
  return css.match(/\d+/g).map(Number);
}

function testAutoPlateKeepsArtworkLegibleInBothModes() {
  [ORANGE, WHITE, BLACK, [250, 204, 21], [37, 99, 235]].forEach((accent) => {
    const colors = plate.getAutoPlateColors(accent);
    ['light', 'dark'].forEach((mode) => {
      const contrast = plate.getContrastRatio(parseRgb(colors[mode]), accent);
      assert.ok(contrast >= 1.4, `${mode} plate for ${accent} keeps contrast (${contrast.toFixed(2)})`);
    });
  });
  const light = parseRgb(plate.getAutoPlateColors(ORANGE).light);
  assert.ok(light[0] > light[2], 'an orange icon gets a warm plate');
  // Shortcut tiles tint 18% toward the artwork's color; in light mode the
  // plate is paler than the tile, in dark mode stronger.
  const tile = ORANGE.map((channel) => channel + ((255 - channel) * 0.82));
  assert.ok(light[1] > tile[1] + 10 && light[1] < 250, 'a colorful light plate is a pale tint that stands out from its tile');
  assert.deepStrictEqual(parseRgb(plate.getAutoPlateColors(BLACK).light), [255, 255, 255],
    'gray and black artwork gets a white plate');
  const darkForBlack = parseRgb(plate.getAutoPlateColors(BLACK).dark);
  assert.ok(Math.min(...darkForBlack) > 180, 'a black logo gets a light plate even in dark mode');
}

function testResolvePlateFollowsTheShortcutsChoice() {
  const transparent = { transparent: true, accent: ORANGE, palette: [ORANGE] };
  const opaque = { transparent: false, accent: ORANGE, palette: [ORANGE] };
  assert.ok(plate.resolvePlate({ mode: '', analysis: transparent }));
  assert.strictEqual(plate.resolvePlate({ mode: '', analysis: opaque }), null);
  assert.strictEqual(plate.resolvePlate({ mode: '', analysis: null }), null, 'unreadable artwork keeps no plate');
  assert.ok(plate.resolvePlate({ mode: 'on', analysis: opaque }));
  assert.ok(plate.resolvePlate({ mode: 'on', analysis: null }), '"always" works before the icon is read');
  assert.strictEqual(plate.resolvePlate({ mode: 'off', analysis: transparent }), null);
  assert.strictEqual(plate.resolvePlate({ mode: '', eligible: false, analysis: transparent }), null);
  const custom = plate.resolvePlate({ mode: 'on', color: '#fdeee4', analysis: opaque });
  assert.deepStrictEqual(custom, { light: 'rgb(253, 238, 228)', dark: 'rgb(253, 238, 228)', custom: true });
}

function testColorChoicesEndWithWhiteAndBlack() {
  const choices = plate.getPlateColorChoices({ transparent: true, accent: ORANGE, palette: [ORANGE, [37, 99, 235]] });
  assert.strictEqual(choices.length, 5, 'two tints of the main color, one of the other, white and near-black');
  assert.deepStrictEqual(choices.slice(-2), ['#FFFFFF', '#1C1C1E']);
  choices.forEach((color) => assert.match(color, /^#[\dA-F]{6}$/));
  assert.deepStrictEqual(plate.getPlateColorChoices(null), ['#FFFFFF', '#1C1C1E']);
}

function testAntiAliasedEdgesStayOutOfThePalette() {
  // A green disc whose few edge pixels blend toward brown.
  const center = (SIZE - 1) / 2;
  const analysis = plate.analyzePixels(createPixels((x, y) => {
    const distance = Math.sqrt(((x - center) ** 2) + ((y - center) ** 2));
    if (distance > 12) return null;
    return distance > 11.4 ? [120, 90, 60, 160] : [22, 163, 74];
  }), SIZE);
  assert.deepStrictEqual(analysis.palette, [[22, 163, 74]]);
}

function testNormalizers() {
  assert.strictEqual(plate.normalizePlateMode('on'), 'on');
  assert.strictEqual(plate.normalizePlateMode('auto'), '');
  assert.strictEqual(plate.normalizePlateColor('#abcdef'), '#ABCDEF');
  assert.strictEqual(plate.normalizePlateColor('red'), '');
}

testBareLogoIsTransparentAndKeepsItsColor();
testRoundedSquareIconIsOpaque();
testFullBleedAndEmptyImages();
testRoundBadgeGetsAPlate();
testAutoPlateKeepsArtworkLegibleInBothModes();
testResolvePlateFollowsTheShortcutsChoice();
testColorChoicesEndWithWhiteAndBlack();
testAntiAliasedEdgesStayOutOfThePalette();
testNormalizers();
console.log('shortcut icon plate tests passed: transparency, color extraction, contrast and per-shortcut choice');
