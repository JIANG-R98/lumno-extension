'use strict';

// The two search surfaces, the injected overlay and the New Tab page, opened
// for real behind one interface so a search behavior can be checked on both.
//
//   const surface = await openSearchSurface('overlay' | 'newtab', options);
//   surface.root          the overlay's shadow root, or the New Tab document
//   surface.page          the underlying harness page
//   await surface.chooseScope('provider:yt')   picks a scope from the menu
//   surface.scopeLabel()  the active scope tag's text ('' without one)
//   surface.toast()       { shown, text } of the surface's Toast
//
// Options are passed to the harness; `respond` answers runtime messages on
// both, and the overlay gets the bundled site-search providers.

const { createOverlayPage, bundledSiteSearchProviders } = require('./overlay-runtime-harness');
const { createNewtabPage } = require('./newtab-page');

const SURFACES = ['overlay', 'newtab'];

async function openSearchSurface(name, options) {
  const config = Object.assign({}, options || {});
  const openContext = config.openContext || {};
  delete config.openContext;
  let page;
  let root;
  let toastElement;
  if (name === 'overlay') {
    page = await createOverlayPage(Object.assign({ stylesheetsLoad: true }, config));
    root = await page.open(Object.assign({ siteSearchProviders: bundledSiteSearchProviders() }, openContext));
    toastElement = () => root.querySelector('.x-lumno-toast');
  } else if (name === 'newtab') {
    page = await createNewtabPage(config);
    root = page.document;
    page.input().focus();
    toastElement = () => root.getElementById('_x_extension_toast_2024_unique_');
  } else {
    throw new Error(`unknown search surface ${name}`);
  }
  const window = page.window;
  const click = (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const prefix = () => root.querySelector('[data-search-input-mode-prefix]');
  const surface = {
    name,
    page,
    root,
    window,
    input: () => page.input(),
    type: (query) => page.type(query),
    // A trusted key event on the focused element (or init.target), heard by
    // every listener along its path, page window included.
    press: (key, init) => surface.key('keydown', key, init),
    keyup: (key, init) => surface.key('keyup', key, init),
    key(type, key, init) {
      const options = Object.assign({ key, bubbles: true, cancelable: true, composed: true }, init || {});
      const target = options.target || (name === 'overlay' ? root.activeElement : page.document.activeElement) || page.input();
      delete options.target;
      return page.trusted(target, type, options);
    },
    settle: (ms) => page.settle(ms),
    waitFor: (condition, message) => page.waitFor(condition, message),
    suggestions() {
      return Array.from(root.querySelectorAll(name === 'overlay' ? '.x-ov-suggestion-item' : '.x-nt-suggestion-item'));
    },
    // The index of the highlighted result, or -1.
    selectedIndex() {
      return surface.suggestions().findIndex((row) => row.getAttribute('data-row-state') === 'active');
    },
    scopeMenuOpen() {
      const element = prefix();
      return Boolean(element && element.getAttribute('data-menu-open') === 'true');
    },
    // A click that lands before the page has wired its scope button does
    // nothing, so the page settles first and a click that opened nothing is
    // repeated.
    async openScopeMenu() {
      await page.settle(0);
      for (let attempt = 0; attempt < 3 && !surface.scopeMenuOpen(); attempt += 1) {
        click(root.querySelector('[data-search-scope-action="true"]'));
        await page.settle(30);
      }
      await page.waitFor(() => surface.scopeMenuOpen(), `the ${name} scope menu should open`);
    },
    async chooseScope(modeId) {
      if (!surface.scopeMenuOpen()) {
        await surface.openScopeMenu();
      }
      const find = () => root.querySelector(`[data-mode-id="${modeId}"]`);
      await page.waitFor(find, `the ${name} scope menu should list ${modeId}`);
      click(find());
      await page.settle(80);
    },
    // The visible name of the active scope tag; the prefix keeps a hidden
    // "current" label for assistive technology after it.
    scopeLabel() {
      const element = prefix();
      if (!element) return '';
      const label = element.querySelector('[data-search-input-mode-prefix-text]');
      return label ? label.textContent.trim() : '';
    },
    // What the surface did on its last Enter or click: { url } when it opened
    // a page, { search } when it handed a query to the search engine, or null.
    navigation() {
      if (name === 'overlay') {
        const last = page.messages.slice().reverse().find((message) => (
          message.action === 'createTab' || (message.action === 'searchOrNavigate')
        ));
        if (!last) return null;
        return last.action === 'createTab' ? { url: last.url } : { search: last.query };
      }
      const opened = page.updated.concat(page.created.map((properties) => ({ properties })));
      if (page.searches.length) return { search: page.searches[page.searches.length - 1].text };
      if (opened.length) return { url: opened[opened.length - 1].properties.url };
      return null;
    },
    toast() {
      const element = toastElement();
      return { shown: Boolean(element && element.getAttribute('data-show') === 'true'), text: element ? element.textContent.trim() : '' };
    },
    close() {
      page.close();
    }
  };
  return surface;
}

module.exports = { SURFACES, openSearchSurface };
