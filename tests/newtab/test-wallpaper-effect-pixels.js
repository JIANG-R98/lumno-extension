const assert = require('assert');
const pixels = require('../../src/newtab/wallpaper/wallpaper-effect-pixels.ts');

// The arithmetic the wallpaper effects draw with.

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual}`);

// A cover-fit image fills the viewport and centers its overflow.
const sampler = { width: 2, height: 1, naturalWidth: 200, naturalHeight: 100, scaleX: 0.005, scaleY: 0.005,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]),
  averageLuminance: 0.3, lowLuminance: 0.2, highLuminance: 0.8, useDarkInk: false };
const metrics = pixels.getRenderedMetrics(sampler, { width: 100, height: 100 });
assert.deepStrictEqual(metrics, { scale: 1, offsetX: -50, offsetY: 0, renderedWidth: 200, renderedHeight: 100 });
assert.deepStrictEqual(pixels.sampleColor(sampler, metrics, 0, 50), { red: 255, green: 0, blue: 0 },
  'the viewport\'s left edge shows the image\'s middle-left');
assert.deepStrictEqual(pixels.sampleColor(sampler, metrics, 99, 50), { red: 127, green: 127, blue: 255 },
  'a translucent pixel is read over white');

// Luminance and tone.
close(pixels.getLuminanceFromRgb(255, 255, 255), 1, 'white');
close(pixels.getLuminance({ red: 0, green: 0, blue: 0 }), 0, 'black');
assert.deepStrictEqual([pixels.smoothstep(-1), pixels.smoothstep(0.5), pixels.smoothstep(2)], [0, 0.5, 1]);
close(pixels.applyToneCurve(0.3, 0), 0.3, 'no strength leaves the tone');
assert.ok(pixels.applyToneCurve(0.1, 100) < 0.1, 'full strength deepens the shadows');
close(pixels.getOverlayBlendLuminance(0.25, 0.5), 0.25, 'overlay over a dark base multiplies');
close(pixels.getOverlayBlendLuminance(0.75, 0.5), 0.75, 'overlay over a light base screens');
close(pixels.getLayerEffectTone(0.5, { ...sampler, lowLuminance: 0.5, highLuminance: 0.51 }, 0, false), 0.5,
  'a flat image keeps its own tone');
close(pixels.getControlRange(50, 10, 20), 15, 'controls map 0-100 onto their range');
close(pixels.getEffectAlpha(0.8, 50), 0.4, 'alpha follows the strength');

// Block colors.
assert.deepStrictEqual(pixels.quantizeBlockColor({ red: 100, green: 128, blue: 250 }, 0), { red: 85, green: 170, blue: 255 },
  'no texture keeps four levels');
assert.deepStrictEqual(pixels.shadeBlockColor({ red: 100, green: 100, blue: 100 }, 0.5), { red: 178, green: 178, blue: 178 });
assert.deepStrictEqual(pixels.shadeBlockColor({ red: 100, green: 100, blue: 100 }, -1), { red: 0, green: 0, blue: 0 });
assert.deepStrictEqual(pixels.mixBlockColors({ red: 0, green: 0, blue: 0 }, { red: 200, green: 100, blue: 50 }, 0.5),
  { red: 100, green: 50, blue: 25 });
assert.deepStrictEqual(pixels.mixBlockColors({ red: 9, green: 9, blue: 9 }, null, 1), { red: 9, green: 9, blue: 9 });
assert.strictEqual(pixels.getBlockColorCss({ red: 1, green: 2, blue: 3 }), 'rgb(1 2 3)');
assert.strictEqual(pixels.getBlockColorCss({ red: 1, green: 2, blue: 3 }, 2), 'rgb(1 2 3 / 1)');
assert.ok(Math.abs(pixels.getBlockMaterialVariation(3, 4)) <= 0.02, 'blocks vary by at most 2%');
assert.deepStrictEqual(pixels.boostSampleColor({ red: 128, green: 128, blue: 128 }, 1), { red: 128, green: 128, blue: 128 },
  'gray has no saturation to boost');

// Grids and noise.
assert.strictEqual(pixels.getGridStart(10, 0), 5, 'a grid starts half a step in');
assert.strictEqual(pixels.getGridStart(10, 27), 25, 'or at the last line before the minimum');
const noise = pixels.getNoiseByte(3, 7, 42);
assert.strictEqual(noise, pixels.getNoiseByte(3, 7, 42), 'noise is the same for the same pixel');
assert.ok(noise >= 0 && noise <= 255);
assert.strictEqual(pixels.getCoarseNoiseByte(0, 0, 64), pixels.getNoiseByte(0, 0, 0x51f15e), 'coarse noise starts on a cell value');
const data = new Uint8ClampedArray(8);
pixels.writeTransparentNoisePixel(data, 0, 255, 1);
pixels.writeTransparentNoisePixel(data, 4, 0, 0.5);
assert.deepStrictEqual(Array.from(data), [255, 255, 255, 255, 0, 0, 0, 128], 'bright noise lightens, dark noise darkens');

console.log('wallpaper effect pixels tests passed');
