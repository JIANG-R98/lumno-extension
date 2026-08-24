const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repoRoot, 'newtab.html'), 'utf8');
const sourcePath = path.join(repoRoot, 'src/newtab/newtab-focus-entry.js');
const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
const backgroundSource = fs.readFileSync(
  path.join(repoRoot, 'src/background/background.js'),
  'utf8'
);
const legacyHtml = fs.readFileSync(path.join(repoRoot, 'src/newtab/newtab.html'), 'utf8');
const legacyRedirectSourcePath = path.join(repoRoot, 'src/newtab/newtab-route-redirect.js');
const legacyRedirectSource = fs.readFileSync(legacyRedirectSourcePath, 'utf8');
const storageKey = '_x_extension_newtab_input_auto_focus_enabled_2026_unique_';

assert.match(
  html,
  /<base href="src\/newtab\/" \/>/,
  'the short root entry should retain the existing New Tab resource base'
);

assert.match(
  html,
  /<script src="newtab-focus-entry\.js"><\/script>/,
  'the maintained New Tab page should load the preference-aware focus entry router'
);
assert.ok(
  html.indexOf('<style data-nt-focus-paint-gate="true">') <
    html.indexOf('<script src="../shared/settings.js"></script>'),
  'the New Tab paint gate should be parsed before visual preload scripts can expose the wallpaper'
);
assert.ok(
  html.indexOf('<script src="../shared/settings.js"></script>') <
    html.indexOf('<script src="newtab-focus-entry.js"></script>'),
  'the shared setting contract should load before the focus entry router'
);
assert.ok(
  html.indexOf('<script src="newtab-focus-entry.js"></script>') <
    html.indexOf('<script src="wallpaper-preload.js"></script>'),
  'the focus route should settle before the New Tab starts visual preloading'
);
assert.match(
  html,
  /html\[data-nt-focus-route-pending="true"\] body,\s*html\[data-nt-focus-route="true"\] body:not\(\[data-nt-wallpaper-ready="1"\]\)\s*\{\s*visibility:\s*hidden;\s*background-image:\s*none !important;/,
  'pending and focused New Tab routes should suppress the propagated body wallpaper until the final effect is ready'
);
assert.match(
  html,
  /<style data-nt-focus-paint-gate="true">[\s\S]*?<\/style>\s*<script src="\.\.\/shared\/settings\.js"><\/script>/,
  'the focused destination paint gate should be available before focus routing starts'
);

function runEntry({ storedValue, search = '', storageAvailable = true }) {
  const replacedUrls = [];
  const attributes = new Set();
  let storageReads = 0;
  const href = `chrome-extension://abc/newtab.html${search}`;
  const location = {
    href,
    search,
    replace(url) {
      replacedUrls.push(url);
    }
  };
  const chromeApi = storageAvailable
    ? {
        storage: {
          sync: {
            get(keys, callback) {
              storageReads += 1;
              assert.deepStrictEqual(Array.from(keys), [storageKey]);
              callback({ [storageKey]: storedValue });
            }
          }
        }
      }
    : {};
  const sandbox = {
    URL,
    chrome: chromeApi,
    document: {
      documentElement: {
        setAttribute(name) {
          attributes.add(name);
        },
        removeAttribute(name) {
          attributes.delete(name);
        }
      }
    },
    LumnoSettings: {
      NEWTAB_INPUT_AUTO_FOCUS_ENABLED_STORAGE_KEY: storageKey,
      normalizeNewtabInputAutoFocusEnabled(value) {
        return value === true;
      }
    },
    window: {
      chrome: chromeApi,
      location
    }
  };
  vm.runInNewContext(source, sandbox, { filename: sourcePath });
  return { attributes, replacedUrls, storageReads };
}

{
  const result = runEntry({ storedValue: false });
  assert.deepStrictEqual(result.replacedUrls, []);
  assert.strictEqual(result.storageReads, 1);
  assert.strictEqual(result.attributes.has('data-nt-focus-route-pending'), false);
}

{
  const result = runEntry({ storedValue: undefined });
  assert.deepStrictEqual(result.replacedUrls, [], 'the missing preference should default to disabled');
  assert.strictEqual(result.storageReads, 1);
  assert.strictEqual(result.attributes.has('data-nt-focus-route-pending'), false);
}

{
  const result = runEntry({ storedValue: true });
  assert.deepStrictEqual(
    result.replacedUrls,
    ['chrome-extension://abc/newtab.html?focus=1'],
    'an existing enabled preference should retain the renderer-navigation focus handoff'
  );
  assert.strictEqual(result.storageReads, 1);
}

{
  const result = runEntry({ search: '?focus=1', storedValue: true });
  assert.deepStrictEqual(result.replacedUrls, []);
  assert.strictEqual(result.storageReads, 0, 'the focused destination must not redirect again');
  assert.strictEqual(
    result.attributes.has('data-nt-focus-route'),
    true,
    'the focused destination should retain a first-paint readiness gate'
  );
}

{
  const result = runEntry({ storageAvailable: false });
  assert.deepStrictEqual(result.replacedUrls, [], 'storage failures should preserve the disabled default');
  assert.strictEqual(result.attributes.has('data-nt-focus-route-pending'), false);
}

assert.match(
  legacyHtml,
  /<script src="newtab-route-redirect\.js"><\/script>/,
  'the previous New Tab path should remain as a compatibility redirect'
);
{
  const replacedUrls = [];
  vm.runInNewContext(legacyRedirectSource, {
    URL,
    window: {
      location: {
        href: 'chrome-extension://abc/src/newtab/newtab.html?focus=1&notice=file-access#search',
        search: '?focus=1&notice=file-access',
        hash: '#search',
        replace(url) {
          replacedUrls.push(url);
        }
      }
    }
  }, { filename: legacyRedirectSourcePath });
  assert.deepStrictEqual(
    replacedUrls,
    ['chrome-extension://abc/newtab.html?focus=1&notice=file-access#search'],
    'the compatibility redirect should preserve query and hash on the short route'
  );
}

const openNewTabBlock = backgroundSource.match(/case 'openNewTab': \{([\s\S]*?)\n    \}/);
assert(openNewTabBlock, 'background should expose the openNewTab action');
assert.doesNotMatch(
  openNewTabBlock[1],
  /\burl\s*:/,
  'openNewTab should omit an extension URL so Chromium opens chrome://newtab'
);
assert.match(
  openNewTabBlock[1],
  /createTabWithSourceGroup\(\{[\s\S]*active:/,
  'openNewTab should retain foreground/background disposition while using the browser New Tab route'
);

console.log('newtab focus entry tests passed');
