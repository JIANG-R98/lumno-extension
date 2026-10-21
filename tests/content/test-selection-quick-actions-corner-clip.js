const assert = require('assert');
const fs = require('fs');

const contentSource = fs.readFileSync(
  'src/content/selection-quick-actions.js',
  'utf8'
);

assert(
  /\.lumno-selection-content\s*\{[\s\S]*?border-radius:\s*2px[\s\S]*?overflow:\s*hidden/.test(contentSource),
  'the animated toolbar content viewport should clip hovered actions with the inset material corner radius'
);

console.log('selection quick actions corner clip tests passed');
