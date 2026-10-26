const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { routeFiles } = require('../helpers/built-scripts');

// Two checks guard what each surface loads, as npm run build writes it to the
// development extension's build/ folder (dist/chrome/build/; build before
// running this test):
//
// 1. Growth: one change (a PR, or a push to main) may not grow a route by more
//    than GROWTH_LIMIT_KIB over its base commit. Both sides are measured on the
//    same machine with the same zlib, so the check is exact everywhere. A
//    change that is meant to be bigger says so with a `Bundle-Growth: <why>`
//    trailer in one of its commit messages, and raises the route's ceiling in
//    the same change.
// 2. Ceilings: absolute limits a little above the sizes measured when they
//    were set, which catch slow drift.
//
// A route is every script a surface loads before it can run: its classic
// scripts and its module entry with every chunk that entry imports.
//
// The growth check measures a checkout of the base commit with its scripts
// built, named by LUMNO_BUNDLE_BASE_DIR. The base commit itself, whose later
// commit messages may carry the trailer, comes from LUMNO_BUNDLE_BASE, else
// the merge base with origin/main. CI sets both; without a built base, or
// with a base built before this layout, only the ceilings are checked.

const repoRoot = path.resolve(__dirname, '..', '..');
const BUILD_DIRECTORY = 'dist/chrome/build';

const routes = {
  'the New Tab page': ['newtab-preload.js', 'cjk-font-faces.js', 'wallpaper-effect-preload.js', 'newtab.js'],
  'the Options page': ['options-preload.js', 'cjk-font-faces.js', 'options.js'],
  // Its demo overlay is the injected overlay.
  'the onboarding page': ['onboarding-preload.js', 'cjk-font-faces.js', 'overlay-islands.js', 'overlay.js', 'onboarding.js'],
  // The toolbar popup opens on every click.
  'the toolbar popup': ['cjk-font-faces.js', 'popup-preload.js', 'popup.js'],
  'the injected overlay': ['icon-font-preload.js', 'overlay-islands.js', 'overlay.js'],
  'the service worker': ['background.js']
};

// KiB, set from the sizes measured under Node 22 when the build moved to one
// Vite configuration.
const ceilings = {
  'the New Tab page': { uncompressed: 1875, gzip: 565 },
  'the Options page': { uncompressed: 810, gzip: 240 },
  'the onboarding page': { uncompressed: 1280, gzip: 380 },
  'the toolbar popup': { uncompressed: 320, gzip: 100 },
  'the injected overlay': { uncompressed: 875, gzip: 260 },
  'the service worker': { uncompressed: 570, gzip: 180 }
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

function measure(buildDir) {
  const sizes = {};
  for (const [route, files] of Object.entries(routes)) {
    const loaded = routeFiles(buildDir, files);
    if (!loaded) {
      continue;
    }
    const sources = loaded.map((file) => fs.readFileSync(path.join(buildDir, file)));
    sizes[route] = {
      uncompressed: sources.reduce((total, source) => total + source.length, 0),
      gzip: sources.reduce((total, source) => total + gzipSize(source), 0)
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

const head = measure(path.join(repoRoot, BUILD_DIRECTORY));
assert.deepStrictEqual(
  Object.keys(head),
  Object.keys(routes),
  'Run npm run build before checking the bundle budgets'
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
const baseSizes = base ? measure(path.join(baseDir, BUILD_DIRECTORY)) : {};
if (base && Object.keys(baseSizes).length > 0) {
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
  console.log(`Bundle growth over ${base.slice(0, 8)}${growthAccepted ? ' (accepted by a Bundle-Growth trailer)' : ''}:`);
  console.log(report.join('\n'));
} else {
  console.log('No built base in this layout for the bundle growth check; checked the ceilings only.');
}
Object.entries(head).forEach(([route, size]) => {
  console.log(`  ${route}: ${kibibytes(size.uncompressed)} / ${kibibytes(size.gzip)} gzip`);
});

assert.deepStrictEqual(failures, [], `Bundle budgets:\n${failures.join('\n')}`);
console.log('bundle budget tests passed');
