const assert = require('assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const settings = require('../../src/shared/settings.js');
const { parsePageCss } = require('../helpers/css-rules');
const { createOptionsPage } = require('../helpers/options-page');
const { createNewtabPage } = require('../helpers/newtab-page');

// The New Tab clock's font, weight and seconds: the settings themselves,
// their rows in Settings, and the clock that follows them.

const optionsDocument = new JSDOM(fs.readFileSync('src/options/options.html', 'utf8')).window.document;
const newtabDocument = new JSDOM(fs.readFileSync('newtab.html', 'utf8')).window.document;

assert.strictEqual(
  settings.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY,
  '_x_extension_newtab_time_seconds_visible_2026_unique_'
);
assert.strictEqual(
  settings.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY,
  '_x_extension_newtab_time_font_weight_2026_unique_'
);
assert.strictEqual(settings.NEWTAB_TIME_FONT_WEIGHT_MIN, 300);
assert.strictEqual(settings.NEWTAB_TIME_FONT_WEIGHT_MAX, 800);
assert.strictEqual(settings.NEWTAB_TIME_FONT_WEIGHT_DEFAULT, 320);
assert.strictEqual(settings.normalizeNewtabTimeFontWeight(undefined), 320);
assert.strictEqual(settings.normalizeNewtabTimeFontWeight(299), 300);
assert.strictEqual(settings.normalizeNewtabTimeFontWeight(650), 650);
assert.strictEqual(settings.normalizeNewtabTimeFontWeight(801), 800);
assert.strictEqual(
  settings.NEWTAB_TIME_FONT_STORAGE_KEY,
  '_x_extension_newtab_time_font_2026_unique_'
);
assert.strictEqual(settings.normalizeNewtabTimeFont(undefined), 'open-sans');
assert.strictEqual(settings.normalizeNewtabTimeFont('comic-sans'), 'open-sans');
assert.strictEqual(settings.normalizeNewtabTimeFont('bitcount'), 'bitcount');
assert.deepStrictEqual(
  settings.NEWTAB_TIME_FONTS.map((font) => font.id),
  ['open-sans', 'geist', 'jetbrains-mono', 'bricolage-grotesque', 'unbounded', 'bitcount']
);
settings.NEWTAB_TIME_FONTS.forEach((font) => {
  assert(font.minWeight >= settings.NEWTAB_TIME_FONT_WEIGHT_MIN, `${font.id} stays above the stored minimum`);
  assert(font.maxWeight <= settings.NEWTAB_TIME_FONT_WEIGHT_MAX, `${font.id} stays below the stored maximum`);
  assert(
    font.defaultWeight >= font.minWeight && font.defaultWeight <= font.maxWeight,
    `${font.id} opens at a weight it can draw`
  );
});
// Bitcount's dots run together past 550, so a heavier stored weight is held there.
assert.strictEqual(settings.resolveNewtabTimeFontWeight('bitcount', 800), 550);
assert.strictEqual(settings.resolveNewtabTimeFontWeight('bitcount', 320), 320);
assert.strictEqual(settings.resolveNewtabTimeFontWeight('geist', 800), 800);
assert.strictEqual(settings.resolveNewtabTimeFontWeight('unknown', 'bad'), 320);
// Tracking runs from tight at a face's lightest weight to looser at its heaviest.
assert.strictEqual(settings.getNewtabTimeFontTracking('open-sans', 500), null);
settings.NEWTAB_TIME_FONTS.filter((font) => Array.isArray(font.tracking)).forEach((font) => {
  const light = settings.getNewtabTimeFontTracking(font.id, font.minWeight);
  const heavy = settings.getNewtabTimeFontTracking(font.id, font.maxWeight);
  assert.deepStrictEqual([light, heavy], font.tracking);
  assert(light < heavy, `${font.id} loosens as it gets heavier`);
});
assert.strictEqual(settings.getNewtabTimeFontTracking('bitcount', 800), 0, 'tracking follows the clamped weight');
assert(
  settings.CHROME_SYNC_STORAGE_KEYS.includes(settings.NEWTAB_TIME_FONT_STORAGE_KEY),
  'the time font preference should sync through the shared settings contract'
);
// Every Lumno Clock face named in settings is declared by the clock stylesheet with
// the same weight range, and the New Tab page links that stylesheet.
const clockFontsCss = fs.readFileSync('assets/fonts/clock/clock-fonts.css', 'utf8');
settings.NEWTAB_TIME_FONTS
  .filter((font) => font.family.startsWith('"Lumno Clock'))
  .forEach((font) => {
    const family = font.family.match(/^"([^"]+)"/)[1];
    const face = clockFontsCss.match(
      new RegExp(`font-family: "${family}";\\s*src: url\\("\\./([^"]+)"\\)[\\s\\S]*?font-weight: (\\d+) (\\d+);`)
    );
    assert(face, `${family} should be declared in clock-fonts.css`);
    assert(fs.existsSync(`assets/fonts/clock/${face[1]}`), `${face[1]} should exist`);
    assert.deepStrictEqual([Number(face[2]), Number(face[3])], [font.minWeight, font.maxWeight]);
  });
assert.ok(newtabDocument.querySelector('link[rel="stylesheet"][href$="assets/fonts/clock/clock-fonts.css"]'), 'New Tab should link the clock faces');
assert.strictEqual(settings.normalizeNewtabTimeSecondsVisible(undefined), false);
assert.strictEqual(settings.normalizeNewtabTimeSecondsVisible(true), true);
assert(
  settings.CHROME_SYNC_STORAGE_KEYS.includes(
    settings.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY
  ),
  'the time font-weight preference should sync through the shared settings contract'
);
assert(
  settings.CHROME_SYNC_STORAGE_KEYS.includes(
    settings.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY
  ),
  'the seconds preference should sync through the shared settings contract'
);

const ROW_IDS = ['font', 'font_weight', 'font_size', 'opacity', 'ink', 'seconds', '12_hour']
  .map((name) => `_x_extension_newtab_time_${name}_row_2026_unique_`);

function testSettingsMarkup() {
  const order = [
    '_x_extension_newtab_top_content_tabs_wrap_2026_unique_',
    '_x_extension_newtab_time_font_row_2026_unique_',
    '_x_extension_newtab_time_font_weight_row_2026_unique_',
    '_x_extension_newtab_time_seconds_row_2026_unique_',
    '_x_extension_newtab_input_auto_focus_toggle_2026_unique_'
  ].map((id) => optionsDocument.getElementById(id));
  order.slice(1).forEach((element, index) => {
    assert.ok(order[index].compareDocumentPosition(element) & 4,
      'Settings should place time font, weight and seconds in order right after the top-content selector');
  });
  ['font', 'font_weight', 'seconds', '12_hour'].forEach((name) => {
    const row = optionsDocument.getElementById(`_x_extension_newtab_time_${name}_row_2026_unique_`);
    assert.deepStrictEqual([row.hidden, row.getAttribute('aria-hidden')], [true, 'true'], `${name} should start hidden`);
  });
  assert.strictEqual(optionsDocument.getElementById('_x_extension_newtab_time_seconds_toggle_2026_unique_').type, 'checkbox');
  const twelveHour = optionsDocument.getElementById('_x_extension_newtab_time_12_hour_toggle_2026_unique_');
  assert.deepStrictEqual([twelveHour.type, twelveHour.getAttribute('data-i18n-aria-label')], ['checkbox', 'newtab_time_12_hour_title']);
}

async function testSettingsShowTheTimeRowsForTheClock() {
  const page = await createOptionsPage({ sync: { [settings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: settings.NEWTAB_TOP_CONTENT_BRAND } });
  const rows = () => ROW_IDS.map((id) => page.byId(id).hidden);
  assert.deepStrictEqual(rows(), ROW_IDS.map(() => true), 'the clock options stay hidden while New Tab shows the wordmark');
  await page.click(page.document.querySelector('#_x_extension_newtab_top_content_tabs_wrap_2026_unique_ [data-newtab-top-content="time"]'));
  await page.settle(400);
  assert.deepStrictEqual(rows(), ROW_IDS.map(() => false), 'choosing the clock should reveal its options');
  const slider = page.document.querySelector('#_x_extension_newtab_time_font_weight_row_2026_unique_ input[type="range"]');
  const font = settings.NEWTAB_TIME_FONTS.find((item) => item.id === settings.normalizeNewtabTimeFont(undefined));
  assert.deepStrictEqual([slider.min, slider.max, slider.step, slider.value],
    [String(font.minWeight), String(font.maxWeight), '1', String(settings.resolveNewtabTimeFontWeight(font.id, undefined))],
    'the weight slider should cover the chosen face\'s weights');
  page.close();
}

async function testClockFollowsTheSettings() {
  const page = await createNewtabPage({
    sync: {
      [settings.NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY]: settings.NEWTAB_TOP_CONTENT_TIME,
      [settings.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY]: true,
      [settings.NEWTAB_TIME_FONT_STORAGE_KEY]: 'jetbrains-mono',
      [settings.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY]: 600
    }
  });
  await page.settle(400);
  const clock = () => page.document.querySelector('#_x_extension_newtab_wordmark_2026_unique_ time.x-nt-time-mark');
  const font = settings.NEWTAB_TIME_FONTS.find((item) => item.id === 'jetbrains-mono');
  assert.strictEqual(clock().getAttribute('data-time-font'), 'jetbrains-mono', 'the clock should use the stored face');
  assert.strictEqual(clock().getAttribute('data-show-seconds'), 'true');
  assert.match(clock().getAttribute('datetime'), /^\d\d:\d\d:\d\d$/, 'with seconds');
  const styled = clock().getAttribute('style') || '';
  assert.ok(styled.includes(font.family.split(',')[0]), 'in its family');
  assert.match(styled, /font-weight: 600/, 'at the stored weight');

  page.changeStorage('sync', settings.NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY, false);
  await page.settle(150);
  assert.strictEqual(clock().getAttribute('data-show-seconds'), 'false', 'hiding seconds in Settings should apply at once');
  assert.strictEqual(page.document.querySelectorAll('.x-nt-time-seconds-digit').length, 0);
  page.changeStorage('sync', settings.NEWTAB_TIME_FONT_WEIGHT_STORAGE_KEY, 400);
  await page.settle(150);
  assert.match(clock().getAttribute('style') || '', /font-weight: 400/, 'and so should a new weight');
  page.close();
}

function testSecondsSwap() {
  const css = parsePageCss('newtab.html');
  const frames = css.keyframes('_x_nt_time_seconds_soft_swap_2026_unique_');
  assert.ok(frames, 'the seconds should swap with their own keyframes');
  assert.deepStrictEqual([frames['0%'].getPropertyValue('transform'), frames['100%'].getPropertyValue('transform')], ['scale(0.985)', 'scale(1)']);
  const declared = Object.values(frames).map((frame) => frame.cssText).join(' ');
  // An opacity dip reads as a blink each tick, and the digits stay on their line.
  assert.doesNotMatch(declared, /opacity|translate/);
  const digit = css.rule('.x-nt-time-seconds-digit', '*');
  assert.ok(digit, 'the seconds digits should be styled');
  assert.match(css.entries.filter((entry) => entry.selectors.some((selector) => selector.includes('.x-nt-time-seconds-digit')))
    .map((entry) => entry.style.getPropertyValue('animation')).join(' '), /_x_nt_time_seconds_soft_swap_2026_unique_ 120ms/);
  ['filter', 'will-change'].forEach((property) => assert.strictEqual(digit.has(property), false, `the digits should not set ${property}`));
}

function testCopy() {
  const expectedLabels = {
    en: { font: 'Time font', fontWeight: 'Time font weight', seconds: 'Show seconds' },
    ja: { font: '時刻のフォント', fontWeight: '時刻の文字の太さ', seconds: '秒を表示' },
    zh_CN: { font: '时间字体', fontWeight: '时间字重', seconds: '显示秒数' },
    zh_TW: { font: '時間字體', fontWeight: '時間字重', seconds: '顯示秒數' }
  };
  Object.entries(expectedLabels).forEach(([locale, expected]) => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    assert.strictEqual(messages.newtab_time_font_title.message, expected.font);
    assert.strictEqual(messages.newtab_time_font_weight_title.message, expected.fontWeight);
    assert.strictEqual(messages.newtab_time_show_seconds_title.message, expected.seconds);
  });
}

(async () => {
  testSettingsMarkup();
  await testSettingsShowTheTimeRowsForTheClock();
  await testClockFollowsTheSettings();
  testSecondsSwap();
  testCopy();
  console.log('newtab time font, font-weight and seconds setting tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
