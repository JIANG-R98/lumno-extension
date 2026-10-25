const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

// Two checks guard the React bundles that npm run build:react writes to the
// development extension's src/react/ (dist/chrome/src/react/; build before
// running this test):
//
// 1. Growth: one change (a PR, or a push to main) may not grow a route by more
//    than GROWTH_LIMIT_KIB over its base commit. Both sides are measured on the
//    same machine with the same zlib, so the check is exact everywhere. A
//    change that is meant to be bigger says so with a `Bundle-Growth: <why>`
//    trailer in one of its commit messages.
// 2. Ceilings: loose absolute limits that catch slow drift. They sit a few
//    KiB above the 1.1.4 sizes, so ordinary features never meet them; when a
//    route does, raise its ceiling by a round step in a commit of its own.
//
// The growth check measures a checkout of the base commit with its bundles
// built, named by LUMNO_BUNDLE_BASE_DIR. The base commit itself, whose later
// commit messages may carry the trailer, comes from LUMNO_BUNDLE_BASE, else
// the merge base with origin/main. CI sets both; without a built base, only
// the ceilings are checked.

const repoRoot = path.resolve(__dirname, '..', '..');
// Where a checkout's build put the islands: the development extension, or
// src/react/ itself in checkouts from before builds wrote to dist/.
const REACT_DIRECTORIES = ['dist/chrome/src/react', 'src/react'];

// Rolldown (Vite 8) puts its CommonJS interop helpers, which every page chunk
// imports, in a chunk of their own. Builds from before Vite 8 have none, so a
// base without it counts it as empty.
const runtimeHelpers = 'rolldown-runtime.js';

const routes = {
  'the New Tab route': [runtimeHelpers, 'react-runtime.js', 'react-shared.js', 'tab-switcher-shared.js', 'newtab-islands.js'],
  'the Options route': [runtimeHelpers, 'react-runtime.js', 'react-shared.js', 'tab-switcher-shared.js', 'options-islands.js'],
  'the injected Overlay route': ['overlay-islands.js'],
  // The toolbar popup opens on every click, so it loads only the runtime, the
  // shared chunk and its own small entry.
  'the toolbar popup route': [runtimeHelpers, 'react-runtime.js', 'react-shared.js', 'popup-islands.js'],
  'all React artifacts together': [
    runtimeHelpers,
    'react-runtime.js',
    'react-shared.js',
    'tab-switcher-shared.js',
    'newtab-islands.js',
    'options-islands.js',
    'onboarding-islands.js',
    'overlay-islands.js'
  ]
};

// KiB. 1.1.4 measured 425 / 126.5, 288 / 85.0, 274 / 82.5, 215 / 67.9 and
// 821 / 238.5 (uncompressed / gzip) under Node 22.
const ceilings = {
  'the New Tab route': { uncompressed: 450, gzip: 134 },
  'the Options route': { uncompressed: 305, gzip: 90 },
  'the injected Overlay route': { uncompressed: 290, gzip: 88 },
  'the toolbar popup route': { uncompressed: 230, gzip: 72 },
  'all React artifacts together': { uncompressed: 900, gzip: 250 }
};

const GROWTH_LIMIT_KIB = { uncompressed: 12, gzip: 4 };
const GROWTH_TRAILER = /^Bundle-Growth:\s*\S/im;

const kibibytes = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;
const gzipSize = (source) =>
  zlib.gzipSync(source, { level: zlib.constants.Z_BEST_COMPRESSION }).length;

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'buffer',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

function measure(readFile, { requireRuntimeHelpers = true } = {}) {
  const files = {};
  for (const file of new Set(Object.values(routes).flat())) {
    const source = readFile(file);
    files[file] = source && { uncompressed: source.length, gzip: gzipSize(source) };
  }
  if (!files[runtimeHelpers] && !requireRuntimeHelpers) {
    files[runtimeHelpers] = { uncompressed: 0, gzip: 0 };
  }
  const sizes = {};
  for (const [route, routeFiles] of Object.entries(routes)) {
    if (routeFiles.some((file) => !files[file])) {
      continue;
    }
    sizes[route] = {
      uncompressed: routeFiles.reduce((total, file) => total + files[file].uncompressed, 0),
      gzip: routeFiles.reduce((total, file) => total + files[file].gzip, 0)
    };
  }
  return sizes;
}

function resolveBase() {
  const requested = process.env.LUMNO_BUNDLE_BASE;
  if (requested) {
    const sha = git(['rev-parse', '--verify', `${requested}^{commit}`]);
    assert(sha, `LUMNO_BUNDLE_BASE=${requested} is not a commit in this checkout`);
    return sha.toString().trim();
  }
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main']);
  return mergeBase ? mergeBase.toString().trim() : null;
}

function readBuiltBundle(checkoutDir) {
  const reactDir = REACT_DIRECTORIES.map((directory) => path.join(checkoutDir, directory))
    .find((directory) => fs.existsSync(directory));
  return (file) => {
    const bundlePath = reactDir ? path.join(reactDir, file) : null;
    return bundlePath && fs.existsSync(bundlePath) ? fs.readFileSync(bundlePath) : null;
  };
}

const head = measure(readBuiltBundle(repoRoot));
assert.deepStrictEqual(
  Object.keys(head),
  Object.keys(routes),
  'Run npm run build:react before checking the React bundle budgets'
);

const failures = [];

for (const [route, size] of Object.entries(head)) {
  for (const kind of ['uncompressed', 'gzip']) {
    const ceilingKiB = ceilings[route][kind];
    if (size[kind] > ceilingKiB * 1024) {
      failures.push(
        `${route} (${kind}) is ${kibibytes(size[kind])}; its ceiling is ${ceilingKiB} KiB`
      );
    }
  }
}

const baseDir = process.env.LUMNO_BUNDLE_BASE_DIR;
const base = baseDir ? resolveBase() : null;
if (base) {
  const baseSizes = measure(readBuiltBundle(baseDir), { requireRuntimeHelpers: false });
  const messages = (git(['log', '--format=%B', `${base}..HEAD`]) || '').toString();
  const growthAccepted = GROWTH_TRAILER.test(messages);
  const report = [];
  for (const [route, size] of Object.entries(head)) {
    if (!baseSizes[route]) {
      continue;
    }
    for (const kind of ['uncompressed', 'gzip']) {
      const growth = size[kind] - baseSizes[route][kind];
      report.push(`  ${route} (${kind}): ${growth >= 0 ? '+' : ''}${kibibytes(growth)}`);
      if (growth > GROWTH_LIMIT_KIB[kind] * 1024 && !growthAccepted) {
        failures.push(
          `${route} (${kind}) grew ${kibibytes(growth)} over ${base.slice(0, 8)}; ` +
            `one change may add ${GROWTH_LIMIT_KIB[kind]} KiB. If that is intended, add a ` +
            '"Bundle-Growth: <why>" trailer to a commit message'
        );
      }
    }
  }
  console.log(`React bundle growth over ${base.slice(0, 8)}${growthAccepted ? ' (accepted by a Bundle-Growth trailer)' : ''}:`);
  console.log(report.join('\n'));
} else {
  console.log('No built base for the React bundle growth check; checked the ceilings only.');
}

assert.deepStrictEqual(failures, [], `React bundle budgets:\n${failures.join('\n')}`);
