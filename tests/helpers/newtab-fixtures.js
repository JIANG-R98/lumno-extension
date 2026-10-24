'use strict';

// Data a New Tab test page starts from, produced by the extension's own code
// so a test does not restate the storage format.

const store = require('../../src/domain/shortcuts-store.ts');
const shortcutStorage = require('../../src/platform/shortcut-storage.ts');

// The sync storage items that hold `items` as the user's shortcuts, written
// by the real shortcuts store. Each item is a shortcut input:
// { url, title } for a website, { type: 'folder', folderId, title } for a
// bookmark folder.
async function shortcutsStorage(items) {
  const data = {};
  const area = {
    get(keys, callback) {
      const result = {};
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
        if (Object.hasOwn(data, key)) result[key] = JSON.parse(JSON.stringify(data[key]));
      });
      setTimeout(() => callback(result), 0);
    },
    set(values, callback) {
      Object.assign(data, JSON.parse(JSON.stringify(values)));
      setTimeout(() => callback && callback(), 0);
    },
    remove(keys, callback) {
      (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete data[key]);
      setTimeout(() => callback && callback(), 0);
    }
  };
  await shortcutStorage.saveShortcuts(area, items.map((item) => store.createShortcutRecord(item)));
  return data;
}

// A fake chrome.bookmarks over a tree whose bookmark bar holds `barChildren`
// and whose Other bookmarks hold `otherChildren` (nodes as { id, title, url }
// or { id, title, children }). Every call is recorded in `calls` as
// { name, args }; changes fire the matching events.
function createFakeBookmarks(window, barChildren, otherChildren) {
  const calls = [];
  let nextId = 1000;
  const event = () => {
    const listeners = [];
    return {
      listeners,
      addListener(listener) { listeners.push(listener); },
      removeListener(listener) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
      hasListener(listener) { return listeners.includes(listener); },
      dispatch(...args) { listeners.slice().forEach((listener) => listener(...args)); }
    };
  };
  const adopt = (node, parentId, index) => {
    const copy = { id: String(node.id), parentId, index, title: node.title || '', dateAdded: node.dateAdded || 1 };
    if (node.url) copy.url = node.url;
    if (Array.isArray(node.children)) {
      copy.children = node.children.map((child, childIndex) => adopt(child, copy.id, childIndex));
    }
    return copy;
  };
  const root = adopt({
    id: '0',
    children: [
      { id: '1', title: 'Bookmarks bar', children: barChildren || [] },
      { id: '2', title: 'Other bookmarks', children: otherChildren || [] }
    ]
  }, undefined, 0);
  const find = (id, node = root) => {
    if (node.id === String(id)) return node;
    for (const child of node.children || []) {
      const found = find(id, child);
      if (found) return found;
    }
    return null;
  };
  const reindex = (parent) => (parent.children || []).forEach((child, index) => { child.index = index; });
  const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
  const withoutChildren = (node) => {
    const copy = clone(node);
    delete copy.children;
    return copy;
  };
  const answer = (callback, value) => {
    const result = clone(value);
    if (typeof callback === 'function') {
      window.setTimeout(() => callback(result), 0);
      return undefined;
    }
    return Promise.resolve(result);
  };
  const record = (name, args) => calls.push({ name, args: clone(args.filter((arg) => typeof arg !== 'function')) });
  const events = {
    onCreated: event(), onRemoved: event(), onChanged: event(), onMoved: event(),
    onChildrenReordered: event(), onImportBegan: event(), onImportEnded: event()
  };
  const api = Object.assign({
    calls,
    root,
    find,
    getTree(callback) {
      record('getTree', []);
      return answer(callback, [root]);
    },
    getSubTree(id, callback) {
      record('getSubTree', [id]);
      const node = find(id);
      return answer(callback, node ? [node] : []);
    },
    getChildren(id, callback) {
      record('getChildren', [id]);
      const node = find(id);
      return answer(callback, node ? (node.children || []).map(withoutChildren) : []);
    },
    get(ids, callback) {
      record('get', [ids]);
      const list = (Array.isArray(ids) ? ids : [ids]).map((id) => find(id)).filter(Boolean).map(withoutChildren);
      return answer(callback, list);
    },
    search(query, callback) {
      record('search', [query]);
      const text = typeof query === 'string' ? query : (query && (query.url || query.title || query.query)) || '';
      const matches = [];
      const walk = (node) => {
        if (node.url && (node.url.includes(text) || node.title.includes(text))) matches.push(withoutChildren(node));
        (node.children || []).forEach(walk);
      };
      walk(root);
      return answer(callback, matches);
    },
    create(properties, callback) {
      record('create', [properties]);
      const parent = find(properties.parentId || '2');
      const node = { id: String(nextId += 1), parentId: parent.id, title: properties.title || '', dateAdded: Date.now() };
      if (properties.url) node.url = properties.url;
      else node.children = [];
      parent.children = parent.children || [];
      parent.children.splice(Number.isInteger(properties.index) ? properties.index : parent.children.length, 0, node);
      reindex(parent);
      events.onCreated.dispatch(node.id, clone(node));
      return answer(callback, node);
    },
    update(id, changes, callback) {
      record('update', [id, changes]);
      const node = find(id);
      Object.assign(node, changes);
      events.onChanged.dispatch(node.id, clone(changes));
      return answer(callback, withoutChildren(node));
    },
    move(id, destination, callback) {
      record('move', [id, destination]);
      const node = find(id);
      const oldParent = find(node.parentId);
      const oldIndex = oldParent.children.indexOf(node);
      oldParent.children.splice(oldIndex, 1);
      const parent = find(destination.parentId || node.parentId);
      const index = Number.isInteger(destination.index) ? Math.min(destination.index, parent.children.length) : parent.children.length;
      parent.children.splice(index, 0, node);
      node.parentId = parent.id;
      reindex(oldParent);
      reindex(parent);
      events.onMoved.dispatch(node.id, { parentId: parent.id, index: node.index, oldParentId: oldParent.id, oldIndex });
      return answer(callback, withoutChildren(node));
    },
    remove(id, callback) {
      record('remove', [id]);
      const node = find(id);
      const parent = find(node.parentId);
      const index = parent.children.indexOf(node);
      parent.children.splice(index, 1);
      reindex(parent);
      events.onRemoved.dispatch(node.id, { parentId: parent.id, index, node: clone(node) });
      return answer(callback, undefined);
    }
  }, events);
  api.removeTree = api.remove;
  return api;
}

module.exports = { createFakeBookmarks, shortcutsStorage };
