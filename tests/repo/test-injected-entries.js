const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { ENTRIES, entryOutputPath } = require('../../scripts/build/entries');
const { INJECTED_APP_PATHS } = require('../../src/domain/injected-commands.ts');
const { extensionOutputPath } = require('../../scripts/build/extension-output');

// The worker imports its in-page scripts by the paths in
// src/domain/injected-commands.ts; each must be an injected entry the build
// writes, and pages must be able to load them (web_accessible_resources).

const injectedEntries = ENTRIES.filter((entry) => entry.kind === 'injected');
assert.deepStrictEqual(
  Object.entries(INJECTED_APP_PATHS).map(([name, file]) => [name, file]).sort(),
  injectedEntries.map((entry) => [entry.name, entryOutputPath(entry)]).sort(),
  'every injected app path should name an injected entry, and every injected entry should have a path'
);

Object.values(INJECTED_APP_PATHS).forEach((file) => {
  assert(fs.existsSync(extensionOutputPath(file)), `${file} should be built; run npm run build first`);
  const source = fs.readFileSync(extensionOutputPath(file), 'utf8');
  if (!file.endsWith('icon-font-preload.js')) {
    assert(/\bexport\s*\{[^}]*\brun\b/.test(source), `${file} should export the run() the worker calls`);
  }
});

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'manifest.json'), 'utf8'));
assert(
  manifest.web_accessible_resources.some((entry) => entry.matches.includes('<all_urls>') &&
    entry.resources.includes('build/injected/*')),
  'web pages must be able to import the injected modules'
);

console.log('injected entry tests passed');
