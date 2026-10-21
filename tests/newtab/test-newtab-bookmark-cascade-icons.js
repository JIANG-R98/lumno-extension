const assert = require('assert');
const { parsePageCss } = require('../helpers/css-rules');
const { createNewtabPage } = require('../helpers/newtab-page');

// Folders in a bookmark folder menu use the same animated folder icon as the
// bookmark cards: it opens while the folder is hovered or its submenu is
// open. Websites keep compact favicons, and rows never shift on hover.

async function testFolderIconOpensWithItsSubmenu() {
  const page = await createNewtabPage({
    shortcuts: [{ type: 'folder', folderId: '10', title: 'Docs' }],
    bookmarks: [{ id: '10', title: 'Docs', children: [
      { id: '11', title: 'MDN', url: 'https://developer.mozilla.org/' },
      { id: '12', title: 'Sub', children: [{ id: '13', title: 'C', url: 'https://c.example/' }] }
    ] }]
  });
  await page.settle(400);
  page.document.querySelector('.x-nt-shortcut-tile--folder').dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await page.settle(200);
  const sub = Array.from(page.document.querySelectorAll('.x-nt-bookmark-cascade-item')).find((item) => /Sub/.test(item.textContent));
  const icon = sub.querySelector('.x-nt-bookmark-cascade-icon--folder');
  assert.ok(icon && icon.querySelector('svg path[data-folder-part]'), 'a subfolder should show the animated folder icon');
  assert.ok(sub.querySelector('.ri-arrow-right-s-line'), 'and a disclosure arrow');
  const shape = () => Array.from(icon.querySelectorAll('path')).map((path) => path.getAttribute('d')).join('|');
  const closed = shape();

  // A pointer moving onto the row fires all of these.
  sub.dispatchEvent(new page.window.MouseEvent('pointerover', { bubbles: true }));
  sub.dispatchEvent(new page.window.MouseEvent('pointerenter'));
  sub.dispatchEvent(new page.window.MouseEvent('mouseover', { bubbles: true }));
  sub.dispatchEvent(new page.window.MouseEvent('mouseenter'));
  await page.settle(400);
  assert.strictEqual(sub.getAttribute('aria-expanded'), 'true', 'hovering the folder should open its submenu');
  assert.notStrictEqual(shape(), closed, 'and open its folder icon');
  assert.strictEqual(page.document.querySelectorAll('.x-nt-bookmark-cascade-level').length, 2);
  page.close();
}

function testStyles() {
  const css = parsePageCss('newtab.html');
  assert.ok(css.selectors().some((selector) => selector.startsWith('.x-nt-bookmark-cascade-icon--folder svg')), 'folder icons should be sized by the page');
  assert.ok(css.selectors().some((selector) => selector.startsWith('.x-nt-bookmark-cascade-icon--folder .x-nt-folder-shape--hover')),
    'the open folder layer should start hidden, as on bookmark cards');
  assert.strictEqual(css.rule('.x-nt-bookmark-cascade-icon').get('border-radius'), '4px', 'favicon corners should stay compact');
  const rowTransforms = css.entries.filter((entry) => entry.selectors.some((selector) => selector.includes('.x-nt-bookmark-cascade-item')) &&
    /translateY/.test(entry.style.getPropertyValue('transform')));
  assert.deepStrictEqual(rowTransforms, [], 'menu rows should not move up or down on hover');
}

(async () => {
  await testFolderIconOpensWithItsSubmenu();
  testStyles();
  console.log('newtab bookmark cascade icon tests passed');
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
