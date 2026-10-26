const assert = require('assert');
const {
  THEME_STORAGE_KEY,
  createTabSwitcherPage,
  switcherTabs
} = require('../helpers/tab-switcher-page');

// Opens the injected tab switcher in a web page and drives it the way a user
// and the background do: trusted key presses, runtime messages and theme or
// viewport changes, checking what the switcher shows and which tab it asks
// the background to switch to.

function lastSwitch(page) {
  const switches = page.messages.filter((message) => message.action === 'switchToTab');
  return switches.length ? { ...switches[switches.length - 1] } : null;
}

function openDefault(page, extra) {
  return page.open(Object.assign({ tabs: switcherTabs(4), shortcut: 'Alt+Q' }, extra || {}));
}

function testOpensAtMostFiveCardsVisibleOnFirstPaint() {
  const page = createTabSwitcherPage();
  const result = page.open({ tabs: switcherTabs(8), selectedIndex: 1 });
  assert.deepStrictEqual({ ...result }, { ok: true });
  assert.strictEqual(page.host().parentNode, page.document.documentElement, 'the host should mount on the root element');
  assert.strictEqual(page.cards().length, 5, 'the switcher should never render more than five cards');
  assert.strictEqual(page.selectedIndex(), 1, 'the requested card should start selected');
  assert.strictEqual(page.panel().getAttribute('data-visible'), 'true', 'the panel should be visible on its first paint');
  const shadow = page.shadow();
  assert.strictEqual(shadow.querySelector('.x-tab-switcher-title'), null, 'the switcher should not render a title row');
  assert.strictEqual(shadow.querySelector('.x-tab-switcher-current'), null, 'the switcher should not render a current-tab badge');
  assert.ok(
    page.cards().every((card) => card.querySelector('.x-tab-switcher-name-row .x-tab-switcher-title-favicon')),
    'each card should show its favicon before the title'
  );
  assert.deepStrictEqual({ ...page.open({ tabs: [] }) }, { ok: true, reason: 'already-open' });
  page.close();

  const empty = createTabSwitcherPage();
  assert.deepStrictEqual({ ...empty.open({ tabs: [] }) }, { ok: false, reason: 'empty' });
  assert.strictEqual(empty.host(), null);
  empty.close();
}

function testKeyboardCyclesAndCommits() {
  const page = createTabSwitcherPage();
  openDefault(page);
  const tab = page.press('Tab');
  assert.strictEqual(page.selectedIndex(), 1, 'Tab should move to the next card');
  assert.ok(tab.defaultPrevented && tab.immediatePropagationStopped, 'handled keys should not reach the page');
  page.press('Tab', { shiftKey: true });
  assert.strictEqual(page.selectedIndex(), 0, 'Shift+Tab should move back');
  page.press('ArrowLeft');
  assert.strictEqual(page.selectedIndex(), 3, 'moving back from the first card should wrap to the last');
  page.press('ArrowDown');
  assert.strictEqual(page.selectedIndex(), 0);
  page.press('ArrowRight');
  page.press('ArrowUp');
  page.press('ArrowRight');
  assert.strictEqual(page.selectedIndex(), 1);

  page.window.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  page.window.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.strictEqual(page.selectedIndex(), 1, 'untrusted key events should not move the selection');
  assert.strictEqual(lastSwitch(page), null, 'an untrusted Enter should not switch tabs');

  page.press('Enter');
  assert.deepStrictEqual(lastSwitch(page), { action: 'switchToTab', tabId: 2, windowId: 1 });
  page.close();

  const escape = createTabSwitcherPage();
  openDefault(escape);
  escape.press('Escape');
  assert.strictEqual(escape.host(), null, 'Escape should close the switcher');
  assert.strictEqual(lastSwitch(escape), null, 'Escape should not switch tabs');
  assert.strictEqual(escape.keys.count('keydown'), 0, 'closing should remove the key listeners');
  assert.strictEqual(escape.keys.count('keyup'), 0);
  escape.close();
}

async function testHeldShortcutIsSuppressedUntilItsKeyIsReleased() {
  const page = createTabSwitcherPage();
  openDefault(page, { suppressInitialShortcutAdvance: true });
  const repeat = page.press('q', { code: 'KeyQ', altKey: true, repeat: true });
  assert.strictEqual(page.selectedIndex(), 0, 'the key still held from the summon should not advance');
  assert.ok(repeat.defaultPrevented, 'the held key should still be kept from the page');
  page.release('q', { code: 'KeyQ', altKey: true });
  assert.ok(page.host(), 'releasing Q while Alt is held should not commit');
  page.press('q', { code: 'KeyQ', altKey: true });
  assert.strictEqual(page.selectedIndex(), 1, 'pressing Q again after releasing it should advance');
  page.press('q', { code: 'KeyQ', altKey: true });
  assert.strictEqual(page.selectedIndex(), 2);
  page.release('Alt', { code: 'AltLeft' });
  await page.settle();
  assert.deepStrictEqual(lastSwitch(page), { action: 'switchToTab', tabId: 3, windowId: 1 },
    'releasing Alt should switch to the highlighted tab');
  assert.strictEqual(page.host(), null, 'the switcher should close once the switch went through');
  page.close();

  const released = createTabSwitcherPage();
  openDefault(released, { suppressInitialShortcutAdvance: true });
  released.press('q', { code: 'KeyQ', altKey: false });
  assert.strictEqual(released.selectedIndex(), 1,
    'pressing Q after Alt was already released should advance even before Q was released');
  released.close();

  const reentered = createTabSwitcherPage();
  openDefault(reentered, { suppressInitialShortcutAdvance: true });
  reentered.message({ action: 'advanceOpenTabSwitcherFromCommand', offset: 1 });
  assert.strictEqual(reentered.selectedIndex(), 1, 'a repeated command should advance');
  reentered.press('q', { code: 'KeyQ', altKey: true });
  assert.strictEqual(reentered.selectedIndex(), 2,
    'after a repeated command, held-key presses should cycle instead of being suppressed');
  reentered.close();

  const quick = createTabSwitcherPage();
  openDefault(quick, { suppressInitialShortcutAdvance: true });
  quick.press('q', { code: 'KeyQ', altKey: true });
  assert.strictEqual(quick.selectedIndex(), 1,
    'a new press should advance even when the summoning Q was released before the panel opened');
  quick.close();

  const fresh = createTabSwitcherPage();
  openDefault(fresh);
  fresh.press('q', { code: 'KeyQ', altKey: true });
  assert.strictEqual(fresh.selectedIndex(), 1, 'without the summon flag the shortcut key cycles right away');
  fresh.close();
}

function testShiftReversesTheShortcutKey() {
  const forward = createTabSwitcherPage();
  openDefault(forward, { shortcut: '⌃Q', selectedIndex: 1 });
  forward.press('Q', { code: 'KeyQ', ctrlKey: true, shiftKey: true });
  assert.strictEqual(forward.selectedIndex(), 0, 'adding Shift to the shortcut should move back');
  forward.press('q', { code: 'KeyQ', ctrlKey: true });
  assert.strictEqual(forward.selectedIndex(), 1, 'the plain shortcut should still move forward');
  forward.close();

  const reverse = createTabSwitcherPage();
  openDefault(reverse, { shortcut: '⌃⇧Q', reverse: true, selectedIndex: 3 });
  reverse.press('Q', { code: 'KeyQ', ctrlKey: true, shiftKey: true });
  assert.strictEqual(reverse.selectedIndex(), 2, 'the reverse shortcut should keep moving back');
  reverse.press('q', { code: 'KeyQ', ctrlKey: true });
  assert.strictEqual(reverse.selectedIndex(), 3, 'dropping Shift from the reverse shortcut should move forward');
  reverse.close();
}

// Ctrl+Tab can only be bound from the browser's shortcuts page console; macOS
// reports it as ⌃⇥, and Tab then has to follow the shortcut's rules rather
// than the switcher's plain Tab key.
async function testCtrlTabShortcutCyclesLikeTheShortcutKey() {
  const held = createTabSwitcherPage();
  openDefault(held, { shortcut: '⌃⇥', suppressInitialShortcutAdvance: true });
  held.press('Tab', { code: 'Tab', ctrlKey: true, repeat: true });
  assert.strictEqual(held.selectedIndex(), 0, 'the Tab still held from the summon should not advance');
  held.release('Tab', { code: 'Tab', ctrlKey: true });
  held.press('Tab', { code: 'Tab', ctrlKey: true });
  assert.strictEqual(held.selectedIndex(), 1, 'pressing Tab again with Control held should advance');
  held.release('Control', { code: 'ControlLeft' });
  await held.settle();
  assert.deepStrictEqual(lastSwitch(held), { action: 'switchToTab', tabId: 2, windowId: 1 },
    'releasing Control should switch to the highlighted tab');
  held.close();

  const reverse = createTabSwitcherPage();
  openDefault(reverse, { shortcut: 'Ctrl+Shift+Tab', reverse: true, selectedIndex: 3 });
  reverse.press('Tab', { code: 'Tab', ctrlKey: true, shiftKey: true });
  assert.strictEqual(reverse.selectedIndex(), 2, 'the reverse shortcut should keep moving back');
  reverse.press('Tab', { code: 'Tab', ctrlKey: true });
  assert.strictEqual(reverse.selectedIndex(), 3, 'dropping Shift from the reverse shortcut should move forward');
  reverse.close();
}

async function testCustomShortcutCommitsOnItsPrimaryModifier() {
  const page = createTabSwitcherPage();
  openDefault(page, { shortcut: 'Ctrl+Shift+/' });
  page.press('?', { code: 'Slash', ctrlKey: true, shiftKey: true });
  assert.strictEqual(page.selectedIndex(), 1, 'the trigger should match by key code when Shift changes the key');
  page.release('Shift', { code: 'ShiftLeft', ctrlKey: true });
  page.release('?', { code: 'Slash', ctrlKey: true });
  await page.settle();
  assert.strictEqual(lastSwitch(page), null, 'only the primary modifier release commits');
  page.release('Control', { code: 'ControlLeft' });
  await page.settle();
  assert.deepStrictEqual(lastSwitch(page), { action: 'switchToTab', tabId: 2, windowId: 1 });
  page.close();
}

async function testRuntimeMessagesReuseTheInjectedSwitcher() {
  const page = createTabSwitcherPage();
  assert.deepStrictEqual(
    { ...page.message({ action: 'advanceOpenTabSwitcherFromCommand', offset: 1 }) },
    { ok: true, open: false, advanced: false, suppressed: false },
    'advancing with no switcher open should report it closed'
  );
  assert.deepStrictEqual(
    { ...page.message({ action: 'commitOpenTabSwitcherFromShortcutRelease' }) },
    { ok: false, committed: false }
  );
  assert.deepStrictEqual(
    { ...page.message({ action: 'updateTabSwitcherThumbnail', tabId: 1 }) },
    { ok: false, reason: 'tab_switcher_host_missing' }
  );
  assert.deepStrictEqual(
    { ...page.message({ action: 'openTabSwitcherFromCommand', context: { tabs: switcherTabs(3) } }) },
    { ok: true },
    'a later command should open through the runtime already in the page'
  );
  assert.strictEqual(page.cards().length, 3);
  assert.deepStrictEqual(
    { ...page.message({ action: 'advanceOpenTabSwitcherFromCommand', offset: 1 }) },
    { ok: true, open: true, advanced: true, suppressed: false }
  );
  assert.strictEqual(page.selectedIndex(), 1);
  page.message({ action: 'advanceOpenTabSwitcherFromCommand', offset: -1 });
  assert.strictEqual(page.selectedIndex(), 0, 'the offset should set the direction');

  const card = page.cards()[1];
  const thumbnail = 'data:image/png;base64,bmV3';
  const update = page.message({ action: 'updateTabSwitcherThumbnail', tabId: 2, url: 'https://site2.example.test/', thumbnail, thumbnailStatus: 'ok' });
  assert.strictEqual(update.ok, true);
  await page.settle(40);
  assert.ok(
    Array.from(card.querySelectorAll('img[data-kind="thumbnail"]')).some((img) => img.getAttribute('src') === thumbnail),
    'a fresh capture should show on the open card'
  );

  page.message({ action: 'advanceOpenTabSwitcherFromCommand', offset: 1 });
  assert.deepStrictEqual(
    { ...page.message({ action: 'commitOpenTabSwitcherFromShortcutRelease' }) },
    { ok: true, committed: true },
    'a release relayed from another frame should commit the highlighted card'
  );
  await page.settle();
  assert.deepStrictEqual(lastSwitch(page), { action: 'switchToTab', tabId: 2, windowId: 1 });

  assert.strictEqual(page.runtimeMessages.listeners.length, 1,
    'the switcher module should listen for messages once');
  assert.deepStrictEqual(
    { ...page.message({ action: 'openTabSwitcherFromCommand', context: { tabs: switcherTabs(2) } }) },
    { ok: true },
    'a message should open the switcher again'
  );
  page.close();
}

function testOpeningAgainAdvancesOrCloses() {
  const page = createTabSwitcherPage();
  openDefault(page);
  const result = page.open({ tabs: switcherTabs(4), advanceOnExisting: true });
  assert.deepStrictEqual({ ...result }, { ok: true, reason: 'already-open' });
  assert.strictEqual(page.document.querySelectorAll('#_x_extension_tab_switcher_host_2026_unique_').length, 1);
  assert.strictEqual(page.selectedIndex(), 1, 'a repeated summon should advance the open switcher');
  page.open({ tabs: switcherTabs(4) });
  assert.strictEqual(page.host(), null, 'summoning without advanceOnExisting should close the open switcher');
  page.close();
}

// JSDOM has neither popovers nor modal dialogs, so the page gets the browser
// pieces the switcher relies on: showPopover and a dialog matching :modal.
function stubTopLayer(page) {
  const promoted = [];
  page.window.HTMLElement.prototype.showPopover = function() {
    promoted.push(this);
  };
  return promoted;
}

function openModalDialog(page) {
  const dialog = page.document.createElement('dialog');
  dialog.setAttribute('open', '');
  const nativeMatches = dialog.matches.bind(dialog);
  dialog.matches = (selector) => selector === ':modal' || nativeMatches(selector);
  page.document.body.appendChild(dialog);
  return dialog;
}

function testJoinsTheTopLayerAboveModalsAndFullscreen() {
  const page = createTabSwitcherPage();
  const promoted = stubTopLayer(page);
  openDefault(page);
  assert.strictEqual(page.host().getAttribute('popover'), 'manual', 'the host should be a manual popover');
  assert.deepStrictEqual(promoted, [page.host()], 'the host should be promoted into the top layer');
  assert.strictEqual(page.host().parentNode, page.document.documentElement);
  page.close();

  const modal = createTabSwitcherPage();
  stubTopLayer(modal);
  const modalDialog = openModalDialog(modal);
  const nonModalDialog = modal.document.createElement('dialog');
  nonModalDialog.setAttribute('open', '');
  modal.document.body.appendChild(nonModalDialog);
  openDefault(modal);
  assert.strictEqual(modal.host().parentNode, modalDialog,
    'an open modal dialog should hold the host, so the modal does not make it inert');
  modal.close();

  const fullscreen = createTabSwitcherPage();
  stubTopLayer(fullscreen);
  const video = fullscreen.document.createElement('div');
  fullscreen.document.body.appendChild(video);
  Object.defineProperty(fullscreen.document, 'fullscreenElement', { configurable: true, value: video });
  openDefault(fullscreen);
  assert.strictEqual(fullscreen.host().parentNode, video, 'a fullscreen element should hold the host');
  fullscreen.close();

  const refused = createTabSwitcherPage();
  refused.window.HTMLElement.prototype.showPopover = function() {
    throw new Error('not allowed');
  };
  openDefault(refused);
  assert.ok(refused.host() && !refused.host().hasAttribute('popover'),
    'a refused promotion should leave the fixed-position host in place');
  refused.close();

  const legacy = createTabSwitcherPage();
  openDefault(legacy);
  assert.ok(!legacy.host().hasAttribute('popover'), 'without popover support the host should stay a plain fixed layer');
  legacy.close();
}


async function testThemeFollowsThePageThenTheSetting() {
  const stored = createTabSwitcherPage({ storage: { [THEME_STORAGE_KEY]: 'dark' } });
  openDefault(stored);
  await stored.settle();
  assert.strictEqual(stored.panel().getAttribute('data-theme'), 'dark', 'the stored theme should apply');
  assert.strictEqual(stored.panel().style.getPropertyValue('color-scheme'), 'dark');
  stored.changeStorage(THEME_STORAGE_KEY, 'light');
  assert.strictEqual(stored.panel().getAttribute('data-theme'), 'light', 'a theme change should apply while open');
  stored.changeStorage(THEME_STORAGE_KEY, 'dark', 'local');
  assert.strictEqual(stored.panel().getAttribute('data-theme'), 'light', 'changes to the other storage area should be ignored');
  stored.press('Escape');
  stored.changeStorage(THEME_STORAGE_KEY, 'dark');
  openDefault(stored);
  await stored.settle();
  assert.strictEqual(stored.panel().getAttribute('data-theme'), 'dark', 'a theme changed while closed should apply when reopened');
  stored.close();

  const darkPage = createTabSwitcherPage({
    storage: { [THEME_STORAGE_KEY]: 'light' },
    html: '<!doctype html><html><head><meta name="color-scheme" content="dark"></head><body></body></html>'
  });
  openDefault(darkPage);
  await darkPage.settle();
  assert.strictEqual(darkPage.panel().getAttribute('data-theme'), 'dark', 'a dark page should win over the stored theme');
  darkPage.close();

  const themeColor = createTabSwitcherPage({
    html: '<!doctype html><html><head><meta name="theme-color" content="#101418"></head><body></body></html>'
  });
  openDefault(themeColor);
  await themeColor.settle();
  assert.strictEqual(themeColor.panel().getAttribute('data-theme'), 'dark', 'a dark theme-color should read as a dark page');
  themeColor.close();

  const system = createTabSwitcherPage();
  openDefault(system);
  await system.settle();
  assert.strictEqual(system.panel().getAttribute('data-theme'), 'light');
  system.setSystemDark(true);
  assert.strictEqual(system.panel().getAttribute('data-theme'), 'dark', 'the system theme should follow dark-mode changes');
  system.press('Escape');
  assert.strictEqual(system.mediaListeners.size, 0, 'closing should stop following the system theme');
  system.close();

  const pageAttribute = createTabSwitcherPage();
  openDefault(pageAttribute);
  await pageAttribute.settle();
  pageAttribute.document.documentElement.setAttribute('data-color-scheme', 'dark');
  await pageAttribute.settle(40);
  assert.strictEqual(pageAttribute.panel().getAttribute('data-theme'), 'dark', 'a page switching to dark should restyle the switcher');
  pageAttribute.close();
}

function testScaleCompensatesForZoomAndRoomyViewports() {
  const scaleOf = (page) => Number(page.panel().style.getPropertyValue('--x-tab-switcher-visible-scale'));
  const zoomed = createTabSwitcherPage();
  openDefault(zoomed, { tabZoomFactor: 2 });
  assert.strictEqual(scaleOf(zoomed), 0.5, 'page zoom should be undone so the switcher keeps its size');
  assert.strictEqual(zoomed.panel().style.getPropertyValue('zoom'), '', 'compensation should not use CSS zoom');
  zoomed.visualViewport.scale = 0.8;
  zoomed.visualViewport.dispatchEvent(new zoomed.window.Event('resize'));
  assert.strictEqual(scaleOf(zoomed), 0.625, 'a pinch zoom while open should combine with the page zoom');
  zoomed.visualViewport.scale = 4;
  zoomed.visualViewport.dispatchEvent(new zoomed.window.Event('resize'));
  assert.strictEqual(scaleOf(zoomed), 0.35, 'the compensation should stop at a readable minimum');
  zoomed.close();

  const roomy = createTabSwitcherPage({ viewport: { width: 1440, height: 900 } });
  openDefault(roomy);
  assert.strictEqual(scaleOf(roomy), 1.08, 'large windows should get a slightly larger switcher');
  roomy.close();
  const medium = createTabSwitcherPage({ viewport: { width: 1200, height: 720 } });
  openDefault(medium);
  assert.strictEqual(scaleOf(medium), 1.045);
  medium.close();

  const offset = createTabSwitcherPage({ viewport: { width: 800, height: 600, offsetLeft: 100, offsetTop: 40 } });
  openDefault(offset);
  assert.strictEqual(scaleOf(offset), 1, 'compact windows should keep the base scale');
  assert.strictEqual(offset.panel().style.getPropertyValue('--x-tab-switcher-center-left'), '500px',
    'the switcher should center on the visible part of the page');
  assert.strictEqual(offset.panel().style.getPropertyValue('--x-tab-switcher-center-top'), '340px');
  offset.close();
}

async function testPointerSelectsAndOutsideClicksClose() {
  const page = createTabSwitcherPage();
  openDefault(page);
  const third = page.cards()[2];
  third.dispatchEvent(new page.window.PointerEvent('pointerover', { bubbles: true, composed: true }));
  assert.strictEqual(page.selectedIndex(), 2, 'hovering a card should select it');
  third.dispatchEvent(new page.window.PointerEvent('pointerdown', { bubbles: true, composed: true }));
  assert.ok(page.host(), 'pressing inside the switcher should keep it open');
  page.document.body.dispatchEvent(new page.window.PointerEvent('pointerdown', { bubbles: true }));
  assert.strictEqual(page.host(), null, 'pressing outside the switcher should close it');
  assert.strictEqual(page.documentEvents.count('pointerdown'), 0, 'closing should remove the outside-press listener');
  page.close();
}

function testCardsCarryTheirAccentAndHideBrokenImages() {
  const page = createTabSwitcherPage();
  page.open({
    tabs: [
      { id: 1, windowId: 1, title: 'One', url: 'https://one.example.test/', accentRgb: [10, 20, 30], favIconUrl: 'https://one.example.test/icon.png' },
      { id: 2, windowId: 1, title: 'Two', url: 'https://two.example.test/', accentRgb: [400, 0, 0] }
    ]
  });
  const [first, second] = page.cards();
  assert.strictEqual(first.style.getPropertyValue('--x-tab-switcher-card-accent'), 'rgb(10, 20, 30)',
    'each card should expose its tab accent to its styles');
  assert.strictEqual(second.style.getPropertyValue('--x-tab-switcher-card-accent'), '',
    'an out-of-range accent should fall back to the shared one');
  const favicon = first.querySelector('.x-tab-switcher-title-favicon');
  assert.ok(favicon && favicon.getAttribute('src'));
  favicon.dispatchEvent(new page.window.Event('error'));
  assert.strictEqual(favicon.getAttribute('data-broken'), 'true', 'a favicon that fails to load should be marked broken');
  assert.strictEqual(favicon.hasAttribute('src'), false, 'a broken favicon should not keep showing the broken-image icon');
  page.close();
}

function testStylesheetKeepsTheLayoutRules() {
  const page = createTabSwitcherPage();
  openDefault(page);
  const styles = page.styles();
  const panel = styles.rule('#panel');
  const visible = styles.rule('#panel[data-visible="true"]');
  assert.strictEqual(panel.get('transform'), 'translate3d(-50%, -50%, 0) scale(var(--x-tab-switcher-visible-scale))');
  assert.strictEqual(visible.get('transform'), panel.get('transform'), 'showing the panel should not move it');
  assert.strictEqual(panel.get('transition'), 'opacity 90ms ease', 'opening should only fade, never animate transform or filter');
  assert.strictEqual(panel.get('left'), 'var(--x-tab-switcher-center-left, 50%)');
  assert.strictEqual(panel.get('top'), 'var(--x-tab-switcher-center-top, 50%)');
  assert.strictEqual(panel.get('width'), 'fit-content', 'the panel should size to its cards');
  assert.strictEqual(panel.get('border'), '0');
  assert.strictEqual(panel.get('color-scheme'), 'light');
  assert.strictEqual(panel.get('--x-tab-switcher-radius-card'),
    'calc(var(--x-tab-switcher-radius-panel) - var(--x-tab-switcher-padding-panel))',
    'card corners should follow the panel corner minus its padding');
  assert.strictEqual(panel.get('--x-tab-switcher-radius-thumb'),
    'calc(var(--x-tab-switcher-radius-card) - var(--x-tab-switcher-padding-card) - var(--x-tab-switcher-border-card))');

  const list = styles.rule('.x-tab-switcher-list');
  assert.strictEqual(list.get('grid-template-columns'), 'repeat(var(--x-tab-count, 5), var(--x-tab-switcher-card-width))',
    'cards should sit in one row of fixed-width tracks');
  const card = styles.rule('.x-tab-switcher-card');
  ['width', 'min-width', 'max-width'].forEach((name) => {
    assert.strictEqual(card.get(name), 'var(--x-tab-switcher-card-width)', `card ${name} should be the fixed card width`);
  });
  assert.strictEqual(card.get('cursor'), 'pointer');
  assert.strictEqual(card.get('background'), 'transparent', 'inactive cards should not draw a surface');
  assert.strictEqual(card.get('border'), 'var(--x-tab-switcher-border-card) solid transparent',
    'cards should reserve their border so selecting one does not shift the layout');
  assert.strictEqual(card.get('border-radius'), 'var(--x-tab-switcher-radius-card)');
  const narrow = styles.rule('.x-tab-switcher-list', /max-width/);
  assert.ok(!narrow || !narrow.has('grid-template-columns'), 'narrow windows should keep the cards in one row');

  const thumb = styles.rule('.x-tab-switcher-thumb');
  assert.strictEqual(thumb.has('border'), false, 'thumbnails should leave their edge to the overlay stroke');
  assert.strictEqual(thumb.has('box-shadow'), false);
  assert.match(thumb.get('background'), /var\(--x-tab-switcher-card-accent/, 'the thumbnail background should follow the card accent');
  assert.doesNotMatch(thumb.get('background'), /gradient/);
  const stroke = styles.rule('.x-tab-switcher-thumb::after');
  assert.strictEqual(stroke.get('border'), '1px solid var(--x-tab-switcher-thumb-stroke-color)');
  assert.strictEqual(stroke.get('pointer-events'), 'none');
  assert.strictEqual(styles.rule('.x-tab-switcher-thumb img[data-kind="thumbnail"]').get('transition'),
    'opacity var(--x-tab-switcher-motion-cover)', 'fresh captures should fade over cached ones');
  assert.strictEqual(styles.rule('.x-tab-switcher-thumb img[data-kind="thumbnail"][data-entering="true"]').get('opacity'), '0');
  assert.strictEqual(styles.rule('.x-tab-switcher-thumb img[data-broken="true"]').get('display'), 'none');
  assert.strictEqual(styles.rule('.x-tab-switcher-favicon[data-broken="true"]').get('visibility'), 'hidden');
  const favicon = styles.rule('.x-tab-switcher-favicon');
  assert.strictEqual(favicon.has('background'), false, 'the fallback favicon should not sit on a surface');
  assert.strictEqual(favicon.has('box-shadow'), false);

  const name = styles.rule('.x-tab-switcher-name');
  assert.strictEqual(name.get('white-space'), 'nowrap', 'titles should stay on one line');
  assert.doesNotMatch(name.get('letter-spacing'), /^-/);
  assert.strictEqual(styles.rule('.x-tab-switcher-name-row').has('transition'), false, 'the title favicon should not move');

  const dark = styles.rule('#panel[data-theme="dark"]');
  assert.strictEqual(dark.get('color-scheme'), 'dark');
  assert.ok(dark.has('--x-tab-switcher-thumb-stroke-color'), 'dark mode should restyle the thumbnail stroke through its token');
  assert.strictEqual(styles.rule('#panel[data-theme="dark"] .x-tab-switcher-card').get('background'), 'transparent');
  assert.match(styles.rule('#panel[data-theme="dark"] .x-tab-switcher-thumb').get('background'), /var\(--x-tab-switcher-card-accent/);
  assert.strictEqual(styles.rule('#panel[data-theme="dark"] .x-tab-switcher-favicon'), null);

  ['#panel', '.x-tab-switcher-card', '.x-tab-switcher-thumb', '.x-tab-switcher-thumb::after', '.x-tab-switcher-favicon', '.x-tab-switcher-title-favicon']
    .forEach((selector) => {
      const rule = styles.rule(selector, /corner-shape/);
      assert.strictEqual(rule && rule.get('corner-shape'), 'superellipse(1.25)', `${selector} should use the overlay corner curve`);
    });

  const selectors = styles.selectors();
  assert.ok(!selectors.some((selector) => /data-thumbnail-status/.test(selector)),
    'cards without a screenshot should share the base styles instead of status-specific ones');
  assert.ok(!selectors.some((selector) => /\[data-active="true"\] \.x-tab-switcher-(name-row|title-favicon)/.test(selector)),
    'the selected card should not move its title favicon');
  page.close();
}

(async () => {
  testOpensAtMostFiveCardsVisibleOnFirstPaint();
  testKeyboardCyclesAndCommits();
  await testHeldShortcutIsSuppressedUntilItsKeyIsReleased();
  testShiftReversesTheShortcutKey();
  await testCtrlTabShortcutCyclesLikeTheShortcutKey();
  await testCustomShortcutCommitsOnItsPrimaryModifier();
  await testRuntimeMessagesReuseTheInjectedSwitcher();
  testOpeningAgainAdvancesOrCloses();
  testJoinsTheTopLayerAboveModalsAndFullscreen();
  await testThemeFollowsThePageThenTheSetting();
  testScaleCompensatesForZoomAndRoomyViewports();
  await testPointerSelectsAndOutsideClicksClose();
  testCardsCarryTheirAccentAndHideBrokenImages();
  testStylesheetKeepsTheLayoutRules();
  console.log('tab switcher runtime tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
