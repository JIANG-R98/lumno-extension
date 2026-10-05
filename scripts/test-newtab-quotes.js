const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const settings = require('../src/shared/settings.js');
require('../src/newtab/remote-content.js');
const quotes = require('../src/newtab/quotes.js');
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const dom = new JSDOM('<body><div id="search"></div><div id="shortcuts"></div><div id="recent"></div></body>', { url: 'https://lumno.test/' });
  const document = dom.window.document;
  let prefs = { position: 'off', category: 'literature' };
  let requests = 0;
  let resolveQuote;
  let messages = {};
  const runtime = quotes.createRuntime({ documentObj: document, windowObj: dom.window,
    t: (key, fallback) => messages[key] ? messages[key].message : fallback,
    getSearchRoot: () => document.querySelector('#search'),
    getShortcutSection: () => document.querySelector('#shortcuts'),
    storageArea: {
      get(_keys, callback) { callback({ [settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY]: prefs }); },
      set(value, callback) { prefs = value[settings.NEWTAB_QUOTE_PREFS_STORAGE_KEY]; callback(); }
    },
    client: { getQuote: () => { requests += 1; return new Promise((resolve) => { resolveQuote = resolve; }); } }
  });
  const createGroup = (data, values) => {
    const group = document.createElement('div');
    values.forEach((value) => { const button = document.createElement('button'); button.dataset[data] = value; group.appendChild(button); });
    return group;
  };
  const refs = { quoteTitle: document.createElement('span'), quoteBody: document.createElement('div'),
    quoteEnabledToggle: document.createElement('input'), quoteProviderHint: document.createElement('p'),
    quotePosition: createGroup('quotePosition', ['search', 'bottom']),
    quoteCategory: createGroup('quoteCategory', ['literature', 'poetry']),
    quoteFontSizeRow: document.createElement('div'), quoteFontSizeTitle: document.createElement('span'),
    quoteFontSizeSlider: document.createElement('input'), quoteFontSizeSliderValueInput: document.createElement('input') };
  refs.quoteFontSizeSlider.type = 'range';
  refs.quoteFontSizeSliderValueInput.type = 'number';
  refs.quoteEnabledToggle.type = 'checkbox';
  refs.quoteFontSizeRow.append(refs.quoteFontSizeTitle, refs.quoteFontSizeSlider, refs.quoteFontSizeSliderValueInput);
  refs.quoteBody.append(refs.quoteCategory, refs.quotePosition, refs.quoteFontSizeRow);
  document.body.append(refs.quoteEnabledToggle, refs.quoteBody, refs.quoteProviderHint);
  runtime.bindSettings(refs);
  await runtime.mount();
  assert.equal(requests, 0, 'Disabled quotes must not contact an external API');
  assert.equal(refs.quoteBody.hidden, true);
  assert.equal(refs.quoteEnabledToggle.checked, false);
  assert.equal(refs.quoteFontSizeSlider.value, '15', 'Older saved preferences should use the default font size');
  refs.quoteEnabledToggle.click();
  assert.equal(prefs.enabled, true);
  await tick();
  resolveQuote({ text: '<img src=x onerror=alert(1)>', source: 'book', author: 'author', url: 'javascript:alert(1)' });
  await tick();
  assert.equal(runtime.element.previousElementSibling.id, 'shortcuts');
  assert.equal(runtime.element.nextElementSibling.id, 'recent');
  assert.equal(runtime.element.hidden, false);
  assert.equal(runtime.element.querySelector('img'), null, 'Quotes must be rendered as text');
  assert.equal(runtime.element.querySelector('a').href, 'https://hitokoto.cn/');
  assert(runtime.element.querySelector('button').getAttribute('aria-label').includes('author'));
  const quoteButton = runtime.element.querySelector('button');
  quoteButton.focus();
  quoteButton.click();
  assert.equal(quoteButton.getAttribute('aria-expanded'), 'true');
  quoteButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(quoteButton.getAttribute('aria-expanded'), 'false');
  assert.equal(runtime.element.dataset.dismissed, 'true', 'Escape must dismiss attribution while retaining keyboard focus');
  assert.equal(document.activeElement, quoteButton);
  assert.equal(refs.quoteBody.hidden, false);
  refs.quoteFontSizeSlider.value = '20';
  refs.quoteFontSizeSlider.dispatchEvent(new dom.window.Event('input'));
  assert.equal(runtime.element.style.getPropertyValue('--x-nt-quote-font-size'), '20px');
  assert.equal(refs.quoteFontSizeSliderValueInput.value, '20');
  assert.equal(prefs.fontSize, 15, 'Dragging should preview before writing preferences');
  refs.quoteFontSizeSlider.dispatchEvent(new dom.window.Event('change'));
  assert.equal(prefs.fontSize, 20, 'Completing the drag should save the chosen font size');
  const sizeInput = refs.quoteFontSizeSliderValueInput;
  sizeInput.focus();
  sizeInput.value = '30';
  sizeInput.dispatchEvent(new dom.window.Event('input'));
  assert.equal(sizeInput.value, '30', 'Typing must not overwrite the focused input');
  assert.equal(runtime.element.style.getPropertyValue('--x-nt-quote-font-size'), '24px');
  sizeInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(prefs.fontSize, 24, 'Enter should save a value within the supported size range');
  assert.equal(sizeInput.value, '24');
  sizeInput.focus();
  sizeInput.value = '';
  sizeInput.blur();
  assert.equal(prefs.fontSize, 24, 'An empty input must retain the saved font size');
  assert.equal(sizeInput.value, '24');
  assert.equal(requests, 1, 'Adjusting font size should reuse the current daily quote');
  refs.quotePosition.querySelector('[data-quote-position="bottom"]').click();
  assert.equal(document.body.dataset.quotePosition, 'bottom');
  assert.equal(runtime.element.dataset.position, 'bottom');
  assert.equal(requests, 1, 'Changing position should reuse the same daily quote');
  const originalQuote = quoteButton.textContent;
  for (const locale of ['en', 'ja', 'zh_CN', 'zh_TW']) {
    messages = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '_locales', locale, 'messages.json'), 'utf8'));
    runtime.updateLanguage();
    assert.equal(refs.quoteTitle.textContent, messages.newtab_quote_title.message);
    assert.equal(refs.quoteEnabledToggle.getAttribute('aria-label'), messages.newtab_quote_title.message);
    assert.equal(refs.quoteProviderHint.textContent, messages.newtab_quote_provider.message);
    assert.equal(refs.quotePosition.getAttribute('aria-label'), messages.newtab_quote_position.message);
    assert.equal(refs.quoteCategory.getAttribute('aria-label'), messages.newtab_quote_category.message);
    assert.equal(refs.quoteFontSizeTitle.textContent, messages.newtab_quote_font_size.message);
    assert.equal(refs.quoteFontSizeSlider.getAttribute('aria-label'), messages.newtab_quote_font_size_label.message);
    assert.equal(sizeInput.getAttribute('aria-label'), messages.newtab_quote_font_size_label.message);
    for (const position of ['search', 'bottom']) {
      assert.equal(refs.quotePosition.querySelector(`[data-quote-position="${position}"]`).textContent,
        messages[`newtab_quote_${position}`].message);
    }
    for (const category of ['literature', 'poetry']) {
      assert.equal(refs.quoteCategory.querySelector(`[data-quote-category="${category}"]`).textContent,
        messages[`newtab_quote_${category}`].message);
    }
    assert.equal(runtime.element.querySelector('a').textContent, messages.newtab_quote_source.message);
    assert.equal(quoteButton.textContent, originalQuote, 'Changing the UI language must keep the original quote');
    assert.equal(refs.quotePosition.querySelector('[data-quote-position="bottom"]').getAttribute('aria-pressed'), 'true');
    assert.equal(requests, 1, 'Changing the UI language must not fetch another quote');
  }
  refs.quoteCategory.querySelector('[data-quote-category="poetry"]').click();
  await tick();
  refs.quoteEnabledToggle.click();
  resolveQuote({ text: 'late poem', author: '', source: '', url: 'https://hitokoto.cn/' });
  await tick();
  assert.equal(runtime.element.hidden, true, 'An in-flight response must not re-enable a hidden quote');
  assert.equal(refs.quoteBody.hidden, true);
  assert.equal(refs.quoteEnabledToggle.checked, false);
  assert.equal(document.body.dataset.quotePosition, 'off');
  assert.deepEqual(prefs, { enabled: false, position: 'bottom', category: 'poetry', fontSize: 24 },
    'The switch must preserve category, position and font size');
  refs.quoteEnabledToggle.click();
  await tick();
  resolveQuote({ text: 'restored poem', author: '', source: '', url: 'https://hitokoto.cn/' });
  await tick();
  assert.equal(runtime.element.hidden, false);
  assert.equal(runtime.element.dataset.position, 'bottom');
  assert.equal(runtime.element.style.getPropertyValue('--x-nt-quote-font-size'), '24px');
  assert.equal(refs.quoteCategory.querySelector('[data-quote-category="poetry"]').getAttribute('aria-pressed'), 'true');
  runtime.destroy();
  dom.window.close();
  console.log('newtab quote UI tests passed');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
