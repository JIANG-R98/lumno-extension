const assert = require('assert');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const zipPath = path.join(repoRoot, 'dist', `lumno-store-v${manifest.version}.zip`);
const expectedDevExtensionId = 'kkcjcneagmlhpeaafngjdlpcfjakejgb';

// Bundles run to a few MB, past execFileSync's 1 MB default.
const ARCHIVE_READ_MAX_BUFFER = 64 * 1024 * 1024;

function readArchive(entry) {
  if (process.platform !== 'win32') return execFileSync(entry ? 'unzip' : 'zipinfo', entry ? ['-p', zipPath, entry] : ['-1', zipPath], { cwd: repoRoot, encoding: 'utf8', maxBuffer: ARCHIVE_READ_MAX_BUFFER });
  const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const command = entry
    ? `$reader = [System.IO.StreamReader]::new($archive.GetEntry(${quote(entry)}).Open()); try { [Console]::Write($reader.ReadToEnd()) } finally { $reader.Dispose() }`
    : '$archive.Entries | ForEach-Object { $_.FullName }';
  return execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; " +
    `$archive = [System.IO.Compression.ZipFile]::OpenRead(${quote(zipPath)}); try { ${command} } finally { $archive.Dispose() }`
  ], { cwd: repoRoot, encoding: 'utf8', maxBuffer: ARCHIVE_READ_MAX_BUFFER });
}

function getExtensionIdFromManifestKey(key) {
  const publicKey = Buffer.from(String(key || ''), 'base64');
  const digestPrefix = crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16);
  return Array.from(digestPrefix)
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode('a'.charCodeAt(0) + nibble))
    .join('');
}

assert.strictEqual(
  getExtensionIdFromManifestKey(manifest.key),
  expectedDevExtensionId,
  'source manifest should keep the dedicated development extension ID stable'
);

execFileSync(process.execPath, ['scripts/build/package-store.js'], {
  cwd: repoRoot,
  stdio: 'pipe'
});

const entries = readArchive().split(/\r?\n/).filter(Boolean);
const packagedManifest = JSON.parse(readArchive('manifest.json'));
const readPackagedText = readArchive;

assert(
  entries.every((entry) => !entry.startsWith('assets/images/readme/')),
  'store package should not include README-only images'
);
assert(
  entries.includes('src/react/newtab-islands.js') &&
    entries.includes('src/react/options-islands.js') &&
    entries.includes('src/react/onboarding-islands.js') &&
    entries.includes('src/react/overlay-islands.js') &&
    entries.includes('src/react/react-shared.js') &&
    entries.includes('src/react/tab-switcher-shared.js') &&
    entries.includes('src/react/react-runtime.js') &&
    entries.includes('src/react/rolldown-runtime.js') &&
    entries.includes('build/react-page-bootstrap.js'),
  'store package should include both page entries, shared React chunks, and bootstrap'
);
[
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'src/react/third-party-licenses.md',
  'src/react/overlay-third-party-licenses.md'
].forEach((file) => {
  assert(entries.includes(file), `store package should include the license file ${file}`);
});
assert(
  entries.every((entry) => !/^src\/.*\.tsx?$/.test(entry)),
  'store package should not include TypeScript source or test files'
);
assert(
  entries.every((entry) => !/^(?:supabase|docs|scripts|tests)\//.test(entry)),
  'store package should contain no backend, deployment, or repository tooling files'
);
// Every bundle ships, minified, in place of the files it is built from.
const { BUNDLES } = require('../../scripts/build/bundles');
BUNDLES.forEach((bundle) => {
  const bundlePath = `build/${bundle.name}.js`;
  assert(entries.includes(bundlePath), `store package should include ${bundlePath}`);
  assert(!entries.includes(`${bundlePath}.map`), `store package should not include the ${bundlePath} source map`);
  const packaged = readPackagedText(bundlePath);
  // An unminified bundle names each file it joins in a comment.
  assert(
    !/^\s*\/\/ src\//m.test(packaged) && !packaged.includes('sourceMappingURL'),
    `store ${bundlePath} should be minified`
  );
});
[
  'src/newtab/newtab.ts',
  'src/options/options.ts',
  'src/overlay/search-panel.ts',
  'src/content/selection-quick-actions.ts'
].forEach((file) => {
  assert(!entries.includes(file), `store package should ship ${file} only inside its bundle`);
});
[
  'src/shared/search/search-han-variants.js'
].forEach((file) => {
  assert(entries.includes(file), `store package should keep ${file}, which pages load by URL`);
});
assert(entries.includes('build/pip-page-bridge.js'), 'store package should ship the registered page bridge bundle');
assert(!entries.includes('src/content/youtube-auto-pip-page.js'), 'the page bridge should ship only as its bundle');
const { getBackgroundServiceFiles } = require('../helpers/background-source');
['src/background/background.ts'].concat(getBackgroundServiceFiles()).forEach((file) => {
  assert(!entries.includes(file), `store package should ship ${file} only inside the background bundle`);
});
assert.strictEqual(packagedManifest.background.service_worker, 'build/background.js');
assert(!entries.includes('src/package.json'), 'store package should not include the Node module marker');
assert(
  !Object.prototype.hasOwnProperty.call(packagedManifest, 'key'),
  'store package should not include the dedicated development key'
);
assert.strictEqual(
  packagedManifest.version,
  manifest.version,
  'store package should preserve the source manifest version'
);

const bootstrapTagPattern = /<script\s+src="\.\.\/\.\.\/build\/react-page-bootstrap\.js"[^>]*><\/script>/;
[
  'newtab.html',
  'src/options/options.html',
  'src/onboarding/onboarding.html'
].forEach((page) => {
  const sourceHtml = fs.readFileSync(path.join(repoRoot, page), 'utf8');
  assert.strictEqual(
    readPackagedText(page),
    sourceHtml,
    `${page} should load the same bundles in the store package`
  );
  assert(bootstrapTagPattern.test(sourceHtml), `${page} should load the React page bootstrap`);
});
assert(
  /<body\b[^>]*>\s*<script src="\.\.\/\.\.\/build\/wallpaper-effect-preload\.js"><\/script>/.test(readPackagedText('newtab.html')),
  'store newtab.html should keep the wallpaper effect preload as the first body script'
);

console.log('package store tests passed');
