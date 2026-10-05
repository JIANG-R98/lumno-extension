const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
// Page runtime modules split out of newtab.js, in the order newtab.html loads them.
const NEWTAB_RUNTIME_MODULES = [
  'src/newtab/site-theme-resolver.js',
  'src/newtab/url-policy.js'
];

// Returns newtab.js followed by the modules split out of it, so source checks
// can locate a function regardless of which file now holds it.
function readNewtabRuntimeSource() {
  return ['src/newtab/newtab.js', ...NEWTAB_RUNTIME_MODULES]
    .map((file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .join('\n');
}

module.exports = { NEWTAB_RUNTIME_MODULES, readNewtabRuntimeSource };
