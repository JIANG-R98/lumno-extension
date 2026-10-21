'use strict';

// background.js is split into service modules it imports. Tests that slice
// functions out of the background by name read all of them together.

const fs = require('fs');
const path = require('path');
const { withoutExports } = require('./closure-source');

const repoRoot = path.resolve(__dirname, '..', '..');
const BACKGROUND_ENTRY = 'src/background/background.js';

// The services background.js imports, in its import order.
function getBackgroundServiceFiles() {
  const source = fs.readFileSync(path.join(repoRoot, BACKGROUND_ENTRY), 'utf8');
  const files = [...source.matchAll(/from '\.\/((?:[\w-]+-service|pinned-tab-recovery)\.js)';/g)]
    .map((match) => `src/background/${match[1]}`);
  return [...new Set(files)];
}

// Services first: they hold the function definitions that background.js
// wires to browser events, matching the order the worker runs them in.
function readBackgroundSource() {
  return withoutExports(getBackgroundServiceFiles().concat([BACKGROUND_ENTRY])
    .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n'));
}

module.exports = {
  BACKGROUND_ENTRY,
  getBackgroundServiceFiles,
  readBackgroundSource
};
