const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { openSearchSurface } = require('../helpers/search-surfaces');

const {
  createBackgroundFocusHandler,
  shouldFocusSearchFromPointer
} = require(path.join('..', '..', 'src', 'newtab', 'search', 'background-search-focus.js'));

const body = { name: 'body' };
const root = { name: 'search root' };
const searchLayer = { name: 'search layer' };
const backgroundTargets = [body, root, searchLayer];

function createPointerEvent(target, overrides) {
  return {
    target,
    defaultPrevented: false,
    ...(overrides || {})
  };
}

function assertFocuses(target, message) {
  assert.strictEqual(
    shouldFocusSearchFromPointer(createPointerEvent(target), backgroundTargets),
    true,
    message
  );
}

function assertDoesNotFocus(target, message) {
  assert.strictEqual(
    shouldFocusSearchFromPointer(createPointerEvent(target), backgroundTargets),
    false,
    message
  );
}

assertFocuses(body, 'clicking the page background should focus search');
assertFocuses(root, 'clicking the exposed search shell should focus search');
assertFocuses(searchLayer, 'clicking the exposed search layer should focus search');

[
  'bookmark card',
  'bookmark breadcrumb',
  'bookmark pager',
  'bookmark cascade menu',
  'recent site card',
  'shortcut tile',
  'mode menu',
  'wallpaper control',
  'feedback control',
  'dialog'
].forEach((name) => {
  assertDoesNotFocus({ name }, `clicking ${name} should not focus search`);
});

assert.strictEqual(
  shouldFocusSearchFromPointer(createPointerEvent(body, { defaultPrevented: true }), backgroundTargets),
  false,
  'handled pointer events should not focus search'
);
assert.strictEqual(
  shouldFocusSearchFromPointer(null, backgroundTargets),
  false,
  'missing pointer events should not focus search'
);

let searchValue = '';
let focusCount = 0;
let dismissCount = 0;
const handleBackgroundPointerFocus = createBackgroundFocusHandler({
  getBackgroundTargets: () => backgroundTargets,
  getSearchValue: () => searchValue,
  dismissSearchResults: () => {
    dismissCount += 1;
  },
  focusSearch: () => {
    focusCount += 1;
  }
});

assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(body)), true);
assert.strictEqual(focusCount, 1, 'an empty search should focus from the background');
assert.strictEqual(dismissCount, 0, 'an empty search should not dismiss results');

searchValue = 'lumno';
assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(searchLayer)), true);
assert.strictEqual(focusCount, 1, 'a populated search should not be focused again');
assert.strictEqual(dismissCount, 1, 'a populated search should dismiss its results');

searchValue = ' ';
assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent(root)), true);
assert.strictEqual(focusCount, 1, 'whitespace still counts as input content');
assert.strictEqual(dismissCount, 2, 'whitespace input should follow the populated-search path');

assert.strictEqual(handleBackgroundPointerFocus(createPointerEvent({ name: 'bookmark card' })), false);
assert.strictEqual(focusCount, 1, 'component pointer events should leave search focus unchanged');
assert.strictEqual(dismissCount, 2, 'component pointer events should not dismiss search results');

function createMouseDownEvent(target) {
  return {
    type: 'mousedown',
    target,
    prevented: false,
    preventDefault() {
      this.prevented = true;
    }
  };
}

searchValue = '';
handleBackgroundPointerFocus(createPointerEvent(body));
const followingMouseDown = createMouseDownEvent(body);
assert.strictEqual(handleBackgroundPointerFocus(followingMouseDown), true);
assert.strictEqual(followingMouseDown.prevented, true, 'the mousedown after a focusing click should not blur search again');
const laterMouseDown = createMouseDownEvent(body);
assert.strictEqual(handleBackgroundPointerFocus(laterMouseDown), false);
assert.strictEqual(laterMouseDown.prevented, false, 'only the mousedown right after a focusing click is cancelled');

searchValue = 'lumno';
handleBackgroundPointerFocus(createPointerEvent(body));
const dismissingMouseDown = createMouseDownEvent(body);
assert.strictEqual(handleBackgroundPointerFocus(dismissingMouseDown), false);
assert.strictEqual(dismissingMouseDown.prevented, false, 'dismissing populated results should keep the default blur');

// On New Tab itself: clicking the page background hides populated results
// (restoring what the user typed over an autocomplete), focusing the box
// again brings them back, and a late answer for the hidden query stays away.
async function testOnNewTab() {
  let answerLate = null;
  const surface = await openSearchSurface('newtab', {
    respond(message) {
      if (message.action === 'getSearchSuggestions') {
        const answer = { suggestions: [{ type: 'history', title: 'Lumno', url: 'https://lumno.example/' }] };
        if (message.query === 'lumno docs') {
          return new Promise((resolve) => { answerLate = () => resolve(answer); });
        }
        return answer;
      }
      return undefined;
    }
  });
  const { page } = surface;
  const input = surface.input();
  const background = () => {
    page.trusted(page.document.body, 'pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 700 });
    return page.trusted(page.document.body, 'mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 700 });
  };

  input.value = 'lum';
  input.setSelectionRange(3, 3);
  input.dispatchEvent(new page.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'm' }));
  await surface.settle(200);
  assert.strictEqual(input.value, 'lumno.example', 'the typed query should autocomplete');
  assert.ok(surface.suggestions().length > 0);
  const mousedown = background();
  await surface.settle(60);
  assert.strictEqual(surface.suggestions().length, 0, 'clicking the background should hide the results');
  assert.strictEqual(input.value, 'lum', 'and give back exactly what the user typed');
  assert.strictEqual(mousedown.defaultPrevented, false, 'dismissing results lets the click blur the box as usual');

  input.dispatchEvent(new page.window.FocusEvent('focus'));
  await surface.settle(200);
  assert.ok(surface.suggestions().length > 0, 'focusing the box again should bring the results back');

  await surface.type('lumno docs');
  background();
  await surface.settle(40);
  answerLate();
  await surface.settle(120);
  assert.strictEqual(surface.suggestions().length, 0, 'an answer arriving after the dismissal should stay hidden');
  await surface.type('lumno');
  await surface.settle(150);
  assert.ok(surface.suggestions().length > 0, 'typing again should show results again');

  await surface.type('/');
  background();
  await surface.settle(60);
  input.dispatchEvent(new page.window.FocusEvent('focus'));
  await surface.settle(150);
  assert.ok(surface.suggestions().length > 0, 'refocusing should bring back slash-command results too');

  await surface.type('');
  input.blur();
  const refocus = background();
  await surface.settle(60);
  assert.strictEqual(page.document.activeElement, input, 'clicking the background of an empty New Tab should focus the box');
  assert.strictEqual(refocus.defaultPrevented, true, 'and keep the click from taking that focus away');
  surface.close();
}

testOnNewTab().then(() => {
  console.log('newtab background search focus tests passed');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
