// Firefox spike: turns the Chrome store package into an unpacked Firefox build.
// Run `npm run package:store` first; output lands in dist/firefox/.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { toFirefoxManifest } = require('./firefox-manifest');

const repoRoot = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const storeZip = path.join(repoRoot, 'dist', `lumno-store-v${manifest.version}.zip`);
const outDir = path.join(repoRoot, 'dist', 'firefox');
// Next to the background bundle: the store package ships no background sources.
const IMPORT_SHIM = 'build/firefox-import-shim.js';

if (!fs.existsSync(storeZip)) {
  console.error(`Missing ${path.relative(repoRoot, storeZip)}; run npm run package:store first.`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const unzip = spawnSync('unzip', ['-q', storeZip, '-d', outDir], { stdio: 'inherit' });
if (unzip.status !== 0) {
  process.exit(unzip.status || 1);
}

const outPath = (value) => path.join(outDir, value);
const storeManifest = JSON.parse(fs.readFileSync(outPath('manifest.json'), 'utf8'));

// The scripts the service worker imports on first use (const *_SCRIPT_PATH)
// load as background scripts before the bundle.
const workerContextSource = fs.readFileSync(path.join(repoRoot, 'src/background/worker-context.ts'), 'utf8');
const lazyBackgroundDeps = [...workerContextSource.matchAll(/^(?:export )?const \w+_SCRIPT_PATH = '([^']+)';$/gm)].map((match) => match[1]);
if (!lazyBackgroundDeps.includes('assets/vendor/pinyin-pro.js')) {
  throw new Error('Could not find the lazily imported pinyin-pro path in src/background/worker-context.ts.');
}
fs.writeFileSync(
  outPath(IMPORT_SHIM),
  '// Dependencies are listed in manifest background.scripts; Firefox event pages lack importScripts.\n' +
  'globalThis.importScripts = function importScripts() {};\n'
);
const ffManifest = toFirefoxManifest(storeManifest, { lazyBackgroundDeps, importShim: IMPORT_SHIM });

fs.writeFileSync(outPath('manifest.json'), `${JSON.stringify(ffManifest, null, 2)}\n`);

// Browser-specific copy lives in the locale files as "<key>__firefox"
// variants. They replace their base message here, so every reader
// (chrome.i18n, fetched messages.json, __MSG_ manifest strings) gets the
// Firefox wording with no runtime branching. Chromium packages ignore them.
const FIREFOX_VARIANT_SUFFIX = '__firefox';
let variantCount = 0;
fs.readdirSync(outPath('_locales')).forEach((locale) => {
  const file = outPath(`_locales/${locale}/messages.json`);
  const messages = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.keys(messages).filter((key) => key.endsWith(FIREFOX_VARIANT_SUFFIX)).forEach((variantKey) => {
    const baseKey = variantKey.slice(0, -FIREFOX_VARIANT_SUFFIX.length);
    if (!messages[baseKey]) {
      throw new Error(`${locale}: ${variantKey} has no base message ${baseKey}.`);
    }
    messages[baseKey] = messages[variantKey];
    delete messages[variantKey];
    variantCount += 1;
  });
  fs.writeFileSync(file, `${JSON.stringify(messages, null, 2)}\n`);
});
console.log(`Firefox build ready: ${path.relative(repoRoot, outDir)} (${variantCount} Firefox messages)`);
