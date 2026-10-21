const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const searchUtils = require('../../src/shared/search-utils.js');

function readings(query) {
  return searchUtils.getSearchKeyboardLayoutQueries(query);
}

function readingFor(query, layout) {
  const match = readings(query).find((item) => item.layout === layout);
  return match ? match.query : null;
}

// Each layout read from US keys, and back.
[
  ['ru', 'vjcrdf', 'москва'],
  ['ru', 'ghbdtn vbh', 'привет мир'],
  ['uk', 'rb]d', 'київ'],
  ['uk', 'erhf]yf', 'україна'],
  ['he', 'akuo', 'שלום'],
  ['ar', 'lvpfh', 'مرحبا'],
  ['ko', 'tkatjd', '삼성'],
  ['ko', 'dkssudgktpdy', '안녕하세요'],
  ['ko', 'rkskek 123', '가나다 123']
].forEach(([layout, typed, meant]) => {
  assert.strictEqual(readingFor(typed, layout), meant, `${typed} should read as ${meant} on ${layout}`);
  assert.strictEqual(readingFor(meant, 'en'), typed, `${meant} should read back as ${typed} on US keys`);
});
assert.strictEqual(readingFor('пшерги', 'en'), 'github', 'Cyrillic typed for an English word reads as US keys');
assert.strictEqual(readingFor('ьшскщыщае', 'en'), 'microsoft');
assert.strictEqual(readingFor('햐소ㅕㅠ', 'en'), 'github', 'loose jamo still read back as keys');
assert.strictEqual(readingFor('لهفاعلا', 'en'), 'github', 'Arabic لا reads back as the b key');
assert.strictEqual(readingFor('أهلا', 'en'), 'hib', 'shifted Arabic letters read as their key');
// Shift doubles Korean consonants, and a capital may be just a capital.
assert.ok(readings('Tkatjd').some((item) => item.query === '삼성'));
assert.ok(readings('Tkatjd').some((item) => item.query === '쌈성'));
// A half-typed last syllable still composes; the matcher completes it.
assert.strictEqual(readingFor('tkatj', 'ko'), '삼서');

// Queries that stay as typed: ordinary English and pinyin give no Korean or
// Hebrew reading (their keys make no syllables or misplace final forms).
['github', 'wxds', 'weixin', 'zhihu', 'bilibili', 'google', 'chatgpt'].forEach((query) => {
  const layouts = readings(query).map((item) => item.layout);
  assert.ok(!layouts.includes('ko'), `${query} should not read as Korean`);
  assert.ok(!layouts.includes('en'), `${query} is already US keys`);
});
['github', 'bilibili', 'weixin'].forEach((query) => {
  assert.ok(!readings(query).some((item) => item.layout === 'he'), `${query} should not read as Hebrew`);
});
assert.ok(!readings('wxds').some((item) => /[ㄱ-ㆎ]/.test(item.query)), 'pinyin initials are not Korean initials');
[
  'google.com',
  'https://github.com/',
  'ab',
  'tk',
  '微信读书',
  '小红书',
  'github 中文',
  'москва github',
  '',
  'x'.repeat(80)
].forEach((query) => {
  assert.deepStrictEqual(readings(query), [], `${query || '(empty)'} should give no layout reading`);
});
assert.strictEqual(readingFor('sdfg', 'ru'), null, 'Russian words never start with ы');
assert.strictEqual(readingFor('sdfg', 'uk'), 'івап', 'Ukrainian words may start with і');

function createEvent() {
  return {
    addListener() {},
    removeListener() {},
    hasListener() {
      return false;
    }
  };
}

function createStorageArea(data) {
  return {
    get(keys, callback) {
      const result = {};
      const keyList = Array.isArray(keys)
        ? keys
        : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
      keyList.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          result[key] = data[key];
        }
      });
      setTimeout(() => callback(result), 0);
    },
    set(items, callback) {
      Object.assign(data, items || {});
      if (callback) {
        setTimeout(callback, 0);
      }
    },
    remove(_keys, callback) {
      if (callback) {
        setTimeout(callback, 0);
      }
    }
  };
}

// Any API the background touches at load and these searches never use: an
// event, or a call that answers its callback with nothing.
function createLooseApi() {
  const target = function looseApi() {
    const callback = Array.from(arguments).reverse().find((arg) => typeof arg === 'function');
    if (callback) {
      setTimeout(() => callback(undefined), 0);
    }
    return Promise.resolve(undefined);
  };
  return new Proxy(target, {
    get(fn, key) {
      if (key === 'addListener' || key === 'removeListener') {
        return () => {};
      }
      if (key === 'hasListener') {
        return () => false;
      }
      if (key === 'then') {
        return undefined;
      }
      if (typeof key === 'string' && /^[A-Z_]+$/.test(key)) {
        return -1;
      }
      return createLooseApi();
    }
  });
}

function loadBackground(historyItems) {
  const matches = (item, text) => (
    item.title.toLowerCase().includes(text) || item.url.toLowerCase().includes(text)
  );
  const known = {
    runtime: {
      id: 'abc',
      lastError: null,
      getURL: (relativePath) => path.join(repoRoot, relativePath),
      getManifest: () => ({ version: '0.0.0' }),
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      onConnect: createEvent()
    },
    storage: {
      sync: createStorageArea({}),
      local: createStorageArea({}),
      onChanged: createEvent()
    },
    history: {
      search(options, callback) {
        const text = String(options && options.text || '').toLowerCase();
        setTimeout(() => callback(text ? historyItems.filter((item) => matches(item, text)) : historyItems.slice()), 0);
      },
      onVisited: createEvent(),
      onVisitRemoved: createEvent()
    },
    topSites: {
      get(callback) {
        setTimeout(() => callback([]), 0);
      }
    },
    bookmarks: {
      search(_options, callback) {
        setTimeout(() => callback([]), 0);
      },
      getTree(callback) {
        setTimeout(() => callback([{ id: '0', title: '', children: [] }]), 0);
      }
    },
    tabs: {
      query(_options, callback) {
        setTimeout(() => callback([]), 0);
      }
    },
    windows: { WINDOW_ID_NONE: -1 },
    tabGroups: { TAB_GROUP_ID_NONE: -1 }
  };
  const withLooseRest = (value) => new Proxy(value, {
    get(object, key) {
      if (key in object) {
        const entry = object[key];
        return entry && typeof entry === 'object' && !Array.isArray(entry) ? withLooseRest(entry) : entry;
      }
      return typeof key === 'string' ? createLooseApi() : undefined;
    }
  });
  const context = vm.createContext({
    console: { ...console, log() {}, info() {}, debug() {} },
    chrome: withLooseRest(known),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    Blob,
    AbortController,
    navigator: { userAgent: 'Fake Chrome' },
    fetch: async () => {
      throw new Error('network disabled in keyboard layout test');
    }
  });
  context.globalThis = context;
  context.self = context;
  context.importScripts = (...urls) => {
    urls.forEach((url) => {
      vm.runInContext(fs.readFileSync(String(url), 'utf8'), context, { filename: String(url) });
    });
  };
  const source = fs.readFileSync(path.join(repoRoot, 'src/background/background.js'), 'utf8') +
    '\nglobalThis.__testGetSearchSuggestions = getSearchSuggestions;\n';
  vm.runInContext(source, context, { filename: 'src/background/background.js' });
  return (query, options) => context.__testGetSearchSuggestions(query, options);
}

function marked(suggestion) {
  const highlight = suggestion.titleHighlight;
  return highlight.ranges.map(([start, end]) => highlight.text.slice(start, end)).join('|');
}

async function run() {
  const now = Date.now();
  const page = (title, url, visitCount) => ({
    title,
    url,
    visitCount: visitCount || 3,
    typedCount: 0,
    lastVisitTime: now - 60 * 1000
  });
  const pages = [
    page('Москва — Википедия', 'https://ru.wikipedia.org/wiki/Moscow'),
    page('Привет мир', 'https://example.ru/hello'),
    page('Київ — столиця України', 'https://uk.wikipedia.org/wiki/Kyiv'),
    page('שלום עולם', 'https://example.co.il/hello'),
    page('مرحبا بالعالم', 'https://example.ae/hello'),
    page('삼성전자', 'https://www.samsung.com/sec/'),
    page('GitHub', 'https://github.com/', 20),
    page('微信读书', 'https://weread.qq.com/', 6)
  ];
  const getSearchSuggestions = loadBackground(pages);

  const expectations = [
    ['vjcrdf', 'ru', 'https://ru.wikipedia.org/wiki/Moscow', 'Москва'],
    ['ghbdtn vbh', 'ru', 'https://example.ru/hello', 'Привет мир'],
    ['rb]d', 'uk', 'https://uk.wikipedia.org/wiki/Kyiv', 'Київ'],
    ['akuo', 'he', 'https://example.co.il/hello', 'שלום'],
    ['lvpfh', 'ar', 'https://example.ae/hello', 'مرحبا'],
    ['tkatjd', 'ko', 'https://www.samsung.com/sec/', '삼성'],
    ['tkatj', 'ko', 'https://www.samsung.com/sec/', '삼성'],
    ['пшерги', 'en', 'https://github.com/', 'GitHub'],
    ['햐소ㅕㅠ', 'en', 'https://github.com/', 'GitHub']
  ];
  for (const [query, layout, url, mark] of expectations) {
    const results = await getSearchSuggestions(query);
    const hit = results.find((item) => item.url === url);
    assert.ok(hit, `${query} should find ${url} through the ${layout} layout; got ${results.map((item) => item.url).join(', ')}`);
    assert.strictEqual(hit.keyboardLayout, layout, `${query} should be read on ${layout}`);
    assert.strictEqual(hit.titleHighlight.query, query, 'the highlight belongs to the query as typed');
    assert.strictEqual(marked(hit), mark, `${query} should mark what its reading matched`);
    assert.ok(results.every((item) => item.keyboardLayout), `${query}: every result came from a reading`);
  }

  // A reading ranks below a match of the query itself.
  const direct = (await getSearchSuggestions('москва')).find((item) => item.url.includes('Moscow'));
  const converted = (await getSearchSuggestions('vjcrdf')).find((item) => item.url.includes('Moscow'));
  assert.ok(direct && !direct.keyboardLayout, 'the Cyrillic query matches directly');
  assert.ok(converted.score < direct.score, 'a reading scores below the direct match of the same page');

  // Ordinary queries that match something as typed are never read again,
  // even where a page matches what a reading of them would spell.
  const getSearchSuggestionsWithDecoys = loadBackground(pages.concat([
    page('пшерги заметки', 'https://example.ru/notes-1'),
    page('цчвы заметки', 'https://example.ru/notes-2'),
    page('ㅈㅌㅇㄴ 메모', 'https://example.kr/notes-3')
  ]));
  for (const [query, url] of [['github', 'https://github.com/'], ['wxds', 'https://weread.qq.com/'], ['微信', 'https://weread.qq.com/']]) {
    const results = await getSearchSuggestionsWithDecoys(query);
    assert.ok(results.some((item) => item.url === url), `${query} should match directly`);
    assert.ok(results.every((item) => !item.keyboardLayout), `${query} should not be read on another layout`);
    assert.ok(!results.some((item) => /notes-/.test(item.url)), `${query} should not reach a page only its reading matches`);
  }

  // A reading in a script no local title uses is never searched.
  const getSearchSuggestionsLatinOnly = loadBackground(pages.filter((item) => !/[\u0590-\u05ff]/.test(item.title)));
  assert.strictEqual((await getSearchSuggestionsLatinOnly('akuo')).length, 0);
  assert.ok((await getSearchSuggestionsLatinOnly('vjcrdf')).some((item) => item.keyboardLayout === 'ru'));

  // Nothing matched and no reading finds anything: still nothing.
  assert.strictEqual((await getSearchSuggestions('zzqqxx')).length, 0);
  // The retry runs once; a reading is never read again.
  assert.strictEqual((await getSearchSuggestions('vjcrdf', { keyboardLayoutRetry: false })).length, 0);

  console.log('search keyboard layout tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
