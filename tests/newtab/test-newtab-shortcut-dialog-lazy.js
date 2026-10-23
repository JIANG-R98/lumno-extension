const assert = require('assert');
const { createNewtabPage } = require('../helpers/newtab-page');

// The shortcut editor is only built when first needed, then reused; two
// quick opens show the one asked for last.

const BACKDROP = '.x-nt-shortcut-dialog-backdrop';

async function run() {
  const page = await createNewtabPage({
    shortcuts: [{ url: 'https://one.example/', title: 'One' }, { url: 'https://two.example/', title: 'Two' }]
  });
  await page.settle(400);
  assert.strictEqual(page.document.querySelectorAll(BACKDROP).length, 0, 'opening New Tab should not build the editor');

  const click = (element) => element.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  const edit = (title) => {
    const tile = page.document.querySelector(`.x-nt-shortcut-tile[aria-label="Open ${title}"]`);
    tile.dispatchEvent(new page.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20, button: 2 }));
  };
  const chooseEdit = () => {
    const option = page.document.querySelector('#_x_extension_newtab_shortcut_context_menu_2026_unique__menu [role="menuitem"][data-value="edit"]');
    option.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    click(option);
  };
  const titleField = () => page.document.querySelector(`${BACKDROP} input._x_extension_shortcut_input_2024_unique_`);

  // Ask for the editor, then straight away for another shortcut.
  click(page.document.querySelector('.x-nt-shortcut-tile--add'));
  edit('Two');
  await page.settle(150);
  chooseEdit();
  await page.settle(400);
  assert.strictEqual(page.document.querySelectorAll(BACKDROP).length, 1, 'quick opens should share one editor');
  assert.strictEqual(titleField().value, 'Two', 'the editor should show what was asked for last');

  page.trusted(titleField(), 'keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await page.settle(200);
  edit('One');
  await page.settle(150);
  chooseEdit();
  await page.settle(300);
  assert.strictEqual(page.document.querySelectorAll(BACKDROP).length, 1, 'reopening should reuse the editor');
  assert.strictEqual(titleField().value, 'One');
  page.close();
}

run().then(() => {
  console.log('Shortcut dialog lazy loading and reuse tests passed.');
  process.exit(0);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
