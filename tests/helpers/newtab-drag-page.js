'use strict';

// New Tab laid out for drag tests: the shortcut row, the bookmark grid and
// the recent sites row get boxes (fake-layout.js) that follow their current
// order, so a test drags between them with New Tab's own pointer handling.
//
//   const newtab = await openDragPage({ shortcuts, bookmarks, ... });
//   await newtab.dragTo(newtab.card('link'), newtab.shortcutSlot(1));
//   await newtab.undo(); await newtab.redo();

const settings = require('../../src/shared/settings.js');
const { createNewtabPage } = require('./newtab-page');

const SHORTCUT_ROW = { left: 300, top: 400, width: 64, height: 64, gap: 8 };
const BOOKMARK_ROW = { left: 100, top: 100, width: 188, height: 51, gap: 12 };
const RECENT_ROW = { left: 100, top: 560, width: 120, height: 80, gap: 10 };

// options: the createNewtabPage options, plus webdavBackup (a WebDAV backup
// covers shortcuts, so bookmarks move instead of being copied) and recent
// (history entries shown as recent sites).
async function openDragPage(options) {
  const config = Object.assign({}, options || {});
  const local = Object.assign({}, config.local || {});
  if (config.webdavBackup) {
    local[settings.WEBDAV_STATUS_STORAGE_KEY] = { enabled: true, state: 'ready' };
  }
  const sync = Object.assign({}, config.sync || {});
  if (config.recent) {
    sync[settings.RECENT_COUNT_STORAGE_KEY] = 8;
    sync[settings.RECENT_MODE_STORAGE_KEY] = 'latest';
  }
  const page = await createNewtabPage(Object.assign({}, config, { layout: true, local, sync, history: config.recent || config.history }));
  await page.settle(300);
  const doc = page.document;
  const grid = doc.getElementById('_x_extension_newtab_bookmarks_grid_2024_unique_');
  page.layout.place(doc.getElementById('_x_extension_newtab_bookmarks_2024_unique_'), { left: 80, top: 80, width: 700, height: 100 });
  page.layout.place(grid, { left: 100, top: 100, width: 588, height: 51 });
  page.layout.flow(grid, '.x-nt-bookmark-card', BOOKMARK_ROW);
  const shortcutGrid = doc.querySelector('.x-nt-shortcut-tile') && doc.querySelector('.x-nt-shortcut-tile').parentElement;
  if (shortcutGrid) {
    page.layout.place(shortcutGrid, { left: 300, top: 400, width: 600, height: 80 });
    page.layout.flow(shortcutGrid, '.x-nt-shortcut-tile', SHORTCUT_ROW);
  }
  const recentSection = doc.getElementById('_x_extension_newtab_recent_sites_2024_unique_');
  const recentCard = doc.querySelector('.x-nt-recent-card');
  if (recentSection && recentCard) {
    page.layout.place(recentSection, { left: 80, top: 540, width: 700, height: 120 });
    page.layout.flow(recentCard.parentElement, '.x-nt-recent-card', RECENT_ROW);
  }
  const tiles = () => Array.from(doc.querySelectorAll('.x-nt-shortcut-tile:not(.x-nt-shortcut-tile--add)'));
  const slotX = (boxes, index) => {
    if (index <= 0) return boxes[0].left + 2;
    if (index >= boxes.length) return boxes[boxes.length - 1].right - 2;
    return (boxes[index - 1].right + boxes[index].left) / 2;
  };
  const key = async (init) => {
    page.trusted(doc.body, 'keydown', Object.assign({ key: 'z', code: 'KeyZ', metaKey: true, bubbles: true, cancelable: true }, init));
    await page.settle(300);
  };
  const fail = (method, times) => {
    const api = page.bookmarks;
    let left = times === undefined ? 1 : times;
    (method === 'remove' ? ['remove', 'removeTree'] : [method]).forEach((name) => {
      const original = api[name];
      api[name] = (...args) => {
        if (left > 0) {
          left -= 1;
          const callback = args.find((arg) => typeof arg === 'function');
          page.window.chrome.runtime.lastError = { message: `${name} failed` };
          if (callback) callback();
          page.window.chrome.runtime.lastError = null;
          return callback ? undefined : Promise.reject(new Error(`${name} failed`));
        }
        return original.apply(api, args);
      };
    });
  };
  return {
    page,
    tile: (title) => tiles().find((item) => item.getAttribute('aria-label') === `Open ${title}`),
    shortcuts: () => tiles().map((item) => item.getAttribute('aria-label').replace(/^Open /, '')),
    card: (id) => grid.querySelector(`.x-nt-bookmark-card[data-bookmark-id="${id}"]`),
    recentCard: (title) => Array.from(doc.querySelectorAll('.x-nt-recent-card')).find((card) => card.getAttribute('aria-label') === `Open ${title}`),
    bar: () => page.bookmarks.find('1').children.map((node) => node.title),
    node: (id) => page.bookmarks.find(id),
    // The Toast's text while it is showing, else ''.
    toast() {
      const toast = doc.getElementById('_x_extension_toast_2024_unique_');
      return toast.getAttribute('data-show') === 'true' ? toast.textContent : '';
    },
    // Hides the current Toast, so the next one can be told apart.
    clearToast() {
      doc.getElementById('_x_extension_toast_2024_unique_').setAttribute('data-show', 'false');
    },
    changes: () => page.bookmarks.calls.filter((call) => ['create', 'move', 'remove', 'removeTree', 'update'].includes(call.name)).map((call) => call.name),
    // The point between the shortcuts at `index` - 1 and `index`.
    shortcutSlot(index) {
      const boxes = tiles().map((item) => item.getBoundingClientRect());
      return [slotX(boxes, index), SHORTCUT_ROW.top + SHORTCUT_ROW.height / 2];
    },
    // The point between the bookmarks at `index` - 1 and `index`.
    bookmarkSlot(index) {
      const boxes = Array.from(grid.querySelectorAll('.x-nt-bookmark-card')).map((card) => card.getBoundingClientRect());
      return [slotX(boxes, index), BOOKMARK_ROW.top + BOOKMARK_ROW.height / 2];
    },
    async dragTo(source, point) {
      await page.drag(source, [[point[0], point[1] - 40], point]);
      await page.settle(200);
    },
    undo: () => key({}),
    redo: () => key({ shiftKey: true }),
    fail,
    // Makes saving fail in both storage areas, or work again.
    failWrites(failing) {
      [page.storage.sync, page.storage.local].forEach((area) => {
        if (failing) {
          area.__set = area.__set || area.set;
          area.set = () => { throw new Error('QUOTA_BYTES quota exceeded'); };
        } else if (area.__set) {
          area.set = area.__set;
        }
      });
    },
    close: () => page.close()
  };
}

module.exports = { openDragPage };
